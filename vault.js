'use strict';
// Local encrypted vault. No server, password storage, or biometric data collection.
(() => {
  const KEY = 'delivery-vault-v1', LEGACY = 'delivery-support-demo-v0.1';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const random = n => crypto.getRandomValues(new Uint8Array(n));
  const b64 = bytes => btoa(Array.from(new Uint8Array(bytes), x => String.fromCharCode(x)).join(''));
  const bytes = s => { if(typeof s !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw Error('Invalid encoding'); return Uint8Array.from(atob(s), x => x.charCodeAt(0)); };
  const passwordOK = p => typeof p === 'string' && p.length >= 12 && p.length <= 256;
  const aes = raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt','decrypt']);
  async function passwordKey(password,kdf){
    if(typeof password !== 'string' || password.length > 256) throw Error('Invalid password');
    const key = await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:bytes(kdf.salt),iterations:kdf.iterations},key,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function seal(key,raw,context){
    const iv=random(12);
    return {iv:b64(iv),data:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(context)},key,raw))};
  }
  async function open(key,box,context){
    return crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(box.iv),additionalData:enc.encode(context)},key,bytes(box.data));
  }
  function parse(raw){
    if(typeof raw !== 'string' || raw.length > 16000000) throw Error('Invalid file size');
    const v=JSON.parse(raw);
    if(!v || v.format !== 'delivery-vault' || v.version !== 1 || !/^[A-Za-z0-9+/]{43}=$/.test(v.id) || typeof v.revision !== 'string') throw Error('Invalid format');
    if(v.kdf?.name !== 'PBKDF2-SHA256' || v.kdf.iterations !== 600000 || bytes(v.kdf.salt).length !== 16) throw Error('Invalid KDF');
    for(const box of [v.wrapped,v.payload]) if(!box || bytes(box.iv).length !== 12 || bytes(box.data).length < 16) throw Error('Invalid ciphertext');
    if(v.biometric && (bytes(v.biometric.id).length < 1 || bytes(v.biometric.salt).length !== 32)) throw Error('Invalid passkey');
    if(v.biometric?.mode!==undefined && v.biometric.mode!=='alternative') throw Error('Invalid passkey mode');
    if(v.biometric?.mode==='alternative' && (!v.biometric.box || bytes(v.biometric.box.iv).length!==12 || bytes(v.biometric.box.data).length<16)) throw Error('Invalid passkey wrapper');
    return v;
  }
  async function make(data,password){
    if(!passwordOK(password) || !DeliverySecurity.validState(data)) throw Error('Invalid data/password');
    const v={format:'delivery-vault',version:1,id:b64(random(32)),revision:b64(random(16)),kdf:{name:'PBKDF2-SHA256',iterations:600000,salt:b64(random(16))},biometric:null};
    const raw=random(32), key=await aes(raw), kek=await passwordKey(password,v.kdf);
    v.wrapped=await seal(kek,raw,v.id+'password');
    v.payload=await seal(key,enc.encode(JSON.stringify(data)),v.id+'data'); raw.fill(0);
    parse(JSON.stringify(v));
    return {v,key,kek};
  }
  async function passkeyKey(info){
    if(!navigator.credentials || !window.PublicKeyCredential) throw Error('パスキーに対応していません。');
    const credential=await navigator.credentials.get({publicKey:{challenge:random(32),allowCredentials:[{type:'public-key',id:bytes(info.id)}],userVerification:'required',timeout:60000,extensions:{prf:{eval:{first:bytes(info.salt)}}}}});
    const result=credential?.getClientExtensionResults()?.prf?.results?.first;
    if(!result) throw Error('この端末のパスキーは暗号化鍵の保護に対応していません。');
    return aes(await crypto.subtle.digest('SHA-256',result));
  }
  async function decrypt(v,password){
    const kek=await passwordKey(password,v.kdf);
    let raw=await open(kek,v.wrapped,v.id+'password');
    let bioKey=null;
    if(v.biometric && v.biometric.mode!=='alternative'){
      const box=JSON.parse(dec.decode(raw));
      bioKey=await passkeyKey(v.biometric);
      raw=await open(bioKey,box,v.id+'passkey');
    }
    const key=await aes(raw); new Uint8Array(raw).fill(0);
    const data=DeliverySecurity.parseState(dec.decode(await open(key,v.payload,v.id+'data')));
    return {key,kek,data,bioKey};
  }
  async function decryptBiometric(v){
    if(v.biometric?.mode!=='alternative') throw Error('最初の1回はパスワードで解除してください。');
    const raw=await open(await passkeyKey(v.biometric),v.biometric.box,v.id+'passkey');
    const key=await aes(raw);new Uint8Array(raw).fill(0);
    const data=DeliverySecurity.parseState(dec.decode(await open(key,v.payload,v.id+'data')));
    return {key,kek:null,data};
  }
  let session=null, queue=Promise.resolve(), pending=0, lastActivity=Date.now(), startCallback, lockCallback;
  let epoch=0, busy=false, channel=null;
  const $=id=>document.getElementById(id);
  function message(text){$('vaultMessage').textContent=text;}
  function status(){ $('vaultStatus').textContent=pending?'暗号化して保存中…':'暗号化保存済み'; }
  function write(v,expected){
    if(localStorage.getItem(KEY)!==expected) throw Error('別の画面で保存内容が変わりました。ロックして開き直してください。');
    const raw=JSON.stringify(v); parse(raw); localStorage.setItem(KEY,raw);
    if(localStorage.getItem(KEY)!==raw) throw Error('保存内容の確認に失敗しました。');
    if(channel) channel.postMessage('changed');
    return raw;
  }
  const storageLock = fn => navigator.locks ? navigator.locks.request('delivery-vault-write',fn) : Promise.resolve().then(fn);
  function showLock(){
    $('vaultGate').hidden=false; $('app').hidden=true; $('vaultTools').hidden=true;
    $('vaultPassword').value=''; $('vaultConfirm').value='';
    const exists=localStorage.getItem(KEY)!==null;
    let biometric=false,legacyBiometric=false;
    if(exists){try{const v=parse(localStorage.getItem(KEY));biometric=v.biometric?.mode==='alternative';legacyBiometric=!!v.biometric&&!biometric;}catch(e){}}
    $('vaultBio').hidden=!biometric; $('vaultFallback').hidden=!biometric; $('vaultForm').hidden=biometric;
    const resetAvailable=exists || localStorage.getItem(LEGACY)!==null;
    $('vaultReset').hidden=!resetAvailable; $('vaultResetHelp').hidden=!resetAvailable;
    $('vaultHeading').textContent=exists?'配達アプリをロック解除':'顧客データの暗号化を設定';
    $('vaultConfirmLabel').hidden=exists;
    $('vaultSubmit').textContent=exists?'ロック解除':'暗号化して開始';
    $('vaultHelp').textContent=biometric?'生体認証で解除できます。使えない場合は「パスワードで解除」を選んでください。':exists?(legacyBiometric?'更新後の最初の1回はパスワードと端末認証が必要です。成功後は生体認証だけで解除できます。':'アプリのパスワードを入力してください。'):'パスワードは12文字以上で登録してください。忘れると復元できません。既存データは確認してから暗号化し、元の平文保存を消去します。';
  }
  function lock(){
    epoch++; session=null;
    if(lockCallback) lockCallback();
    $('vaultPanel').hidden=true; $('backupPassword').value=''; $('backupConfirm').value=''; $('restorePassword').value=''; $('restoreFile').value='';
    try {showLock(); message('ロックしました。');} catch(e){message('端末の保存領域を使用できません。');}
  }
  function activate(s,data){
    session=s; lastActivity=Date.now();
    $('vaultGate').hidden=true; $('app').hidden=false; $('vaultTools').hidden=true;
    $('vaultPassword').value=''; $('vaultConfirm').value='';
    $('passkeySetup').hidden=!!s.v.biometric; $('passkeyState').textContent=s.v.biometric?.mode==='alternative'?'生体認証優先／パスワードでも解除できます':s.v.biometric?'旧方式：パスワード＋パスキー認証':'パスワード認証（パスキー未設定）';
    status(); startCallback(data);
  }
  function save(data){
    if(!session || !DeliverySecurity.validState(data)) return Promise.reject(Error('保存できる状態ではありません。'));
    const json=JSON.stringify(data), s=session; pending++; $('app').inert=true; status();
    const task=queue.then(async()=>{
      if(json.length>10000000) throw Error('保存データが大きすぎます。');
      const v={...s.v,revision:b64(random(16)),payload:await seal(s.key,enc.encode(json),s.v.id+'data')};
      await storageLock(()=>{s.raw=write(v,s.raw); s.v=v;});
    });
    queue=task.catch(()=>{});
    return task.catch(e=>{lock(); alert('保存できませんでした。最後に保存できた内容は残っています。\n'+e.message); throw e;}).finally(()=>{pending--;if(!pending&&!busy)$('app').inert=false;status();});
  }
  async function run(fn){
    if(busy) return; busy=true;
    document.querySelectorAll('[data-vault-action]').forEach(b=>b.disabled=true);
    $('app').inert=true;
    try{await fn();}catch(e){
      let text;
      if(e.name==='QuotaExceededError' || e.message==='Quota') text='端末の保存容量が足りません。空き容量を確認してください。';
      else if(e.name==='SecurityError') text='このブラウザでは保存領域を利用できません。Safariの通常のタブで開いてください。';
      else if(e.name==='NotAllowedError') text='端末認証が中止されたか、時間切れになりました。もう一度操作してください。';
      else if(e.name==='OperationError') text='パスワードが違うか、暗号化データを読み取れませんでした。（OperationError）';
      else if(/^Invalid/.test(e.message)) text='保存データまたはファイルの形式を読み取れませんでした。';
      else if(/[\u3040-\u30ff\u3400-\u9fff]/.test(e.message)) text=e.message;
      else text='処理に失敗しました。ブラウザを開き直してください。（'+(e.name||'Error')+'）';
      message(text+' 保存データは消去していません。');$('panelMessage').textContent=text;
    }
    finally{busy=false;$('app').inert=false;document.querySelectorAll('[data-vault-action]').forEach(b=>b.disabled=false);}
  }
  async function submit(event){
    event.preventDefault(); const p=$('vaultPassword').value, confirm=$('vaultConfirm').value, token=epoch;
    if(busy) return;
    try {
      if(localStorage.getItem(KEY)===null){
        if(!passwordOK(p)){message('パスワードは12文字以上で登録してください。（最大256文字）');return;}
        if(p!==confirm){message('2つのパスワードが一致していません。同じ内容を入力してください。');return;}
      }
    }catch(e){message('このブラウザでは保存領域を利用できません。Safariの通常のタブで開いてください。');return;}
    message('処理中です。そのままお待ちください。');
    await run(async()=>{
      await queue;
      const raw=localStorage.getItem(KEY);
      if(raw!==null){
        let v=parse(raw); const unlocked=await decrypt(v,p); let activeRaw=raw;
        if(token!==epoch || document.hidden) return;
        if(localStorage.getItem(KEY)!==raw) throw Error('保存内容が変更されました。もう一度解除してください。');
        if(unlocked.bioKey){
          const rawKey=await crypto.subtle.exportKey('raw',unlocked.key);
          try{
            const box=await seal(unlocked.bioKey,rawKey,v.id+'passkey');
            const next={...v,revision:b64(random(16)),wrapped:await seal(unlocked.kek,rawKey,v.id+'password'),biometric:{...v.biometric,mode:'alternative',box}};
            if(token!==epoch||document.hidden)return;
            await storageLock(()=>{activeRaw=write(next,raw);});v=next;
          }finally{new Uint8Array(rawKey).fill(0);}
        }
        localStorage.removeItem(LEGACY);
        activate({key:unlocked.key,kek:unlocked.kek,v,raw:activeRaw},unlocked.data);
      }else{
        if(!passwordOK(p)||p!==confirm) throw Error('同じ12〜256文字のパスワードを2回入力してください。');
        const old=localStorage.getItem(LEGACY), data=old===null?window.deliveryDemoState():DeliverySecurity.parseState(old);
        const created=await make(data,p);
        // Verify round-trip before replacing legacy storage.
        await decrypt(created.v,p);
        if(token!==epoch || document.hidden) return;
        await storageLock(()=>{
          if(localStorage.getItem(LEGACY)!==old) throw Error('既存データが変更されました。');
          created.raw=write(created.v,null);
          localStorage.removeItem(LEGACY);
          if(localStorage.getItem(LEGACY)!==null) throw Error('元データの消去を確認できません。');
        });
        activate(created,data);
      }
    });
  }
  async function unlockBiometric(){
    const token=epoch;
    await run(async()=>{
      await queue;const raw=localStorage.getItem(KEY),v=parse(raw);
      const unlocked=await decryptBiometric(v);
      if(token!==epoch||document.hidden)return;
      if(localStorage.getItem(KEY)!==raw)throw Error('保存内容が変わりました。もう一度解除してください。');
      activate({...unlocked,v,raw},unlocked.data);
    });
    if(!session){$('vaultForm').hidden=false;message('生体認証で解除できませんでした。もう一度試すか、パスワードで解除してください。');}
  }
  async function resetStorage(){
    if(session) return;
    if(!confirm('この配達アプリの端末内データをすべて消してやり直しますか？\n顧客情報・配達記録・アプリのパスワード設定が消えます。元に戻せません。\nバックアップファイルや他のアプリのデータは消しません。')) return;
    await queue;
    await storageLock(()=>{
      localStorage.removeItem(LEGACY);
      localStorage.removeItem(KEY);
      if(localStorage.getItem(KEY)!==null || localStorage.getItem(LEGACY)!==null) throw Error('初期化を確認できません。');
      if(channel) channel.postMessage('changed');
    });
    lock(); message('初期化しました。新しいパスワードを2回入力してください。端末に登録した以前のパスキーは自動削除されません。');
  }
  async function enroll(){
    await queue; const s=session, token=epoch;
    if(!s || s.v.biometric) return;
    if(!window.PublicKeyCredential || !navigator.credentials) throw Error('このブラウザはパスキーに対応していません。');
    const credential=await navigator.credentials.create({publicKey:{challenge:random(32),rp:{name:'配達サポート'},user:{id:random(32),name:'delivery-device',displayName:'配達サポート端末'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'required',userVerification:'required'},timeout:60000,extensions:{prf:{}}}});
    if(!credential) throw Error('登録を中止しました。');
    const info={id:b64(credential.rawId),salt:b64(random(32)),mode:'alternative'};
    const bioKey=await passkeyKey(info);
    const rawKey=await crypto.subtle.exportKey('raw',s.key);
    const box=await seal(bioKey,rawKey,s.v.id+'passkey'); new Uint8Array(rawKey).fill(0);
    const v={...s.v,biometric:{...info,box},revision:b64(random(16))};
    if(token!==epoch || session!==s || document.hidden) return;
    await storageLock(()=>{s.raw=write(v,s.raw);s.v=v;});
    $('passkeySetup').hidden=true; $('passkeyState').textContent='生体認証優先／パスワードでも解除できます';
    $('panelMessage').textContent='登録しました。次回から生体認証で解除できます。使えない場合はパスワードでも解除できます。';
  }
  function download(v){
    const blob=new Blob([JSON.stringify(v)],{type:'application/json'}), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download='delivery-encrypted-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function init(onStart,onLock){
    startCallback=onStart;lockCallback=onLock;
    if(!crypto?.subtle || !window.isSecureContext){message('HTTPSとWeb Cryptoに対応するブラウザが必要です。');$('vaultSubmit').disabled=true;return;}
    $('vaultForm').addEventListener('submit',submit);
    $('vaultBio').addEventListener('click',unlockBiometric);
    $('vaultFallback').addEventListener('click',()=>{$('vaultForm').hidden=false;message('アプリのパスワードを入力してください。');$('vaultPassword').focus();});
    $('vaultReset').addEventListener('click',()=>run(resetStorage));
    $('vaultLock').addEventListener('click',lock);
    $('passkeySetup').addEventListener('click',()=>run(enroll));
    $('backupForm').addEventListener('submit',e=>{e.preventDefault();const p=$('backupPassword').value,c=$('backupConfirm').value; $('backupPassword').value='';$('backupConfirm').value='';return run(async()=>{
      await queue; const s=session,token=epoch;
      if(!s || !passwordOK(p)||p!==c) throw Error('バックアップ用の12〜256文字のパスワードを2回入力してください。');
      const data=DeliverySecurity.parseState(dec.decode(await open(s.key,s.v.payload,s.v.id+'data'))), result=await make(data,p);
      await decrypt(result.v,p);
      if(token!==epoch||session!==s) return;
      download(result.v); $('panelMessage').textContent='暗号化バックアップを出力しました。ファイルと専用パスワードを別々に保管し、復元を確認してください。';
    });});
    $('restoreForm').addEventListener('submit',e=>{e.preventDefault();const file=$('restoreFile').files[0],p=$('restorePassword').value,token=epoch;$('restorePassword').value='';return run(async()=>{
      if(!file || file.size>16000000) throw Error('16MB以下の暗号化バックアップを選択してください。');
      const v=parse(await file.text()); if(v.biometric) throw Error('持ち出し用バックアップを選択してください。');
      const restored=await decrypt(v,p);
      if(token!==epoch || document.hidden) return;
      if(!confirm('現在の端末データをバックアップの内容で置き換えます。現在の内容をバックアップ済みですか？')) return;
      await queue; const s=session;
      if(!s) throw Error('先にこの端末の暗号化設定またはロック解除をしてください。');
      await save(restored.data); if(session===s) startCallback(restored.data);
      $('restoreFile').value='';$('panelMessage').textContent='復元して暗号化保存しました。';
    });});
    for(const name of ['pointerdown','keydown','input','touchstart']) document.addEventListener(name,()=>{if(session)lastActivity=Date.now();},{passive:true});
    setInterval(()=>{if(session&&Date.now()-lastActivity>=120000)lock();},1000);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)lock();});
    window.addEventListener('pagehide',lock);
    window.addEventListener('beforeunload',e=>{if(pending){e.preventDefault();e.returnValue='';}});
    window.addEventListener('storage',e=>{if(e.key===KEY||e.key===LEGACY||e.key===null){lock();message('別の画面で保存内容が変わったためロックしました。');}});
    if(window.BroadcastChannel){channel=new BroadcastChannel('delivery-vault');channel.onmessage=()=>{if(session){lock();message('別の画面で保存されたためロックしました。');}};}
    try{showLock();}catch(e){message('保存領域を使用できません。');$('vaultSubmit').disabled=true;}
  }
  window.DeliveryVault=Object.freeze({init,save,lock,passwordOK,parse,make,decrypt,decryptBiometric});
})();
