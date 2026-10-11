'use strict';
let excelImport=null,excelEpoch=0,excelPicker=null,excelCompleted=null;
// Keep only the user-selected File handle across the native picker lock. Never parse while locked.
function clearExcelPicker(){if(!excelPicker)return;clearTimeout(excelPicker.timer);excelPicker.host?.remove();excelPicker=null;}
function armExcelPicker(event){clearExcelPicker();event.target.value='';excelPicker={input:event.target,file:null,host:null,timer:setTimeout(()=>{clearExcelPicker();if(vaultUnlocked&&currentScreen==='settings')render();},300000)};}
function suspendExcelPicker(){if(!excelPicker?.input||excelPicker.file||excelPicker.host)return;const host=document.createElement('div');host.hidden=true;document.body.appendChild(host);excelPicker.input.id='excelPendingFile';host.appendChild(excelPicker.input);excelPicker.host=host;}
function resumeExcelPicker(){const file=excelPicker?.file;if(file&&vaultUnlocked)readExcelFile({target:{files:[file]}});}
window.addEventListener('pagehide',clearExcelPicker);
function clearExcelImport(){excelCompleted=null;excelEpoch++;if(excelImport){excelImport.worker?.terminate();clearTimeout(excelImport.timer);}excelImport=null;}
function excelMessage(text){const el=document.getElementById('excelMessage');if(el)el.textContent=text;const status=document.getElementById('excelFileStatus');if(status&&!excelCompleted)status.innerHTML=renderExcelFileStatus();}
function renderExcelFileStatus(){
 const d=excelImport,done=excelCompleted;
 if(done)return `<h3>登録完了</h3><p class="excel-file-name">${escapeHtml(done.filename)}</p><p>${done.customers}顧客・${done.rows}明細を確認しました。</p><strong class="excel-stage">保存済み</strong>${done.locations?`<p>地図：番地一致 ${done.locations.numbered}件／町の目安 ${done.locations.town}件／未照合 ${done.locations.missing}件</p>`:""}<p>新規 ${done.counts.added}件／更新 ${done.counts.updated}件／登録済みのためスキップ ${done.counts.skipped}件</p><button type="button" id="excelViewImported">次へ：配達予定を設定</button>`;
 if(!d)return excelPicker?.file?`<h3>読み込みの再開待ち</h3><p class="excel-file-name">${escapeHtml(excelPicker.file.name)}</p><p>上の再開ボタンを押してください。まだ登録されていません。</p>`:'<p>まだファイルを選択していません。</p>';
 const name=`<p class="excel-file-name">${escapeHtml(d.filename||'選択したExcel')}</p>`;
 if(d.error)return '<h3>読み込めませんでした</h3>'+name+'<p>下のメッセージを確認して、ファイルを選び直してください。登録済みのデータは変更していません。</p>';
 if(!d.rows)return '<h3>読み込み中…</h3>'+name+'<p>この端末内でファイルを確認しています。</p>';
 if(!d.preview)return '<h3>内容の確認が必要です</h3>'+name+'<strong class="excel-stage">未登録</strong><p>下のシート・列の設定とメッセージを確認してください。</p>';
 let already=false;try{const c=DeliveryImport.merge(state,d.preview,d.update).counts;already=c.added+c.updated===0;}catch(e){}
 return `<h3>読み込み完了</h3>${name}<p>シート：${escapeHtml(d.sheets[d.index])}</p><p class="excel-read-count">${d.preview.customers.length}顧客・${d.preview.rows}明細</p><strong class="excel-stage">${already?'すべて登録済み':'まだ未登録'}</strong><p>${already?'同じ顧客は重複登録しません。上の一覧ボタンから選択できます。':'下の顧客一覧を確認し、「確認した内容を暗号化して登録」を押すと保存されます。'}</p>`;
}
function excelSavedCustomerIds(){return state.customers.filter(c=>c.source).map(c=>c.id);}
function excelChangeSheet(index){if(!excelImport?.worker)return;excelImport.preview=null;excelImport.rows=null;excelImport.message='シートを読み込み中です…';render();clearTimeout(excelImport.timer);const token=excelEpoch;excelImport.timer=setTimeout(()=>{if(token===excelEpoch&&excelImport){excelImport.worker.terminate();excelMessage('シートの読み込みが時間内に終わりませんでした。ファイルを選び直してください。');}},20000);excelImport.worker.postMessage({index});}
function renderExcelImport(){
  const data=excelImport, fieldSelect=(key,label)=>`<label>${escapeHtml(label)}<select data-excel-map="${key}"><option value="-1">取り込まない</option>${(data?.rows[data.header]||[]).map((v,i)=>`<option value="${i}" ${data.map[key]===i?'selected':''}>${i+1}列：${escapeHtml(v||'（空欄）')}</option>`).join('')}</select></label>`;
  let preview='';
  if(data?.preview){
    try{
      const merged=DeliveryImport.merge(state,data.preview,data.update),counts=merged.counts;
      const items=data.preview.customers.flatMap(c=>c.items),priced=items.filter(i=>i.contractAmount!==undefined);
      const amountText=priced.length?`<p>商品別金額の合計：${cashYen(priced.reduce((sum,i)=>sum+i.contractAmount,0))}（金額あり ${priced.length}／${items.length}明細。数量は掛けません）</p>`:'';
      const ignoredText=data.preview.ignoredRows?.length?`<p class="small">合計・注意書きの${data.preview.ignoredRows.length}行を除外しました（Excel行：${data.preview.ignoredRows.join('・')}）。</p>`:'';
      preview=`<h3>取込前の確認</h3><p>${data.preview.rows}行 → ${data.preview.customers.length}顧客。新規 ${counts.added}件／更新 ${counts.updated}件／スキップ ${counts.skipped}件</p>
      ${amountText}${ignoredText}<p>住所・番地・数量を確認してください。回収対象はExcelから判断できないため、新規顧客に回収予定は追加しません。</p>
      <div class="excel-preview">${data.preview.customers.slice(0,50).map(c=>`<article><strong>${escapeHtml(c.name)}</strong><p>${escapeHtml(c.address)}</p><p>支払方法：${c.paymentMethod===undefined?"列なし・空欄（既存値を維持／新規は未設定）":PAYMENT_LABELS[c.paymentMethod]}<br>契約合計金額：${c.contractAmount===undefined?"列なし・空欄（既存値を維持／新規は未設定）":cashYen(c.contractAmount)}</p>${c.source.confirmationMemo?`<p class="warning-box">Excelの確認メモ：${escapeHtml(c.source.confirmationMemo)}</p>`:''}<small>顧客コード：${escapeHtml(c.source.customerCode||'なし')}／ルートコード：${escapeHtml(c.source.routeCode||'なし')}<br>郵便番号：${escapeHtml(c.source.postalCode)}／電話：${escapeHtml(c.source.phone)}</small><ul>${c.items.map(i=>`<li>${escapeHtml(i.model)} ${escapeHtml(i.name)} × ${i.qty}${i.contractAmount!==undefined?'／契約税込金額 '+i.contractAmount.toLocaleString('ja-JP')+'円':''}</li>`).join('')}</ul></article>`).join('')}</div>
      ${data.preview.customers.length>50?'<p>表示は先頭50顧客です。確認して登録すると全件を処理します。</p>':''}
      <button type="button" id="excelCommit" ${counts.added+counts.updated?'':'disabled'}>確認した内容を暗号化して登録</button>`;
    }catch(e){preview=`<p class="excel-error">${escapeHtml(e.message)}</p>`;}
  }
  return `<section class="route-settings"><h2>登録済み顧客の一覧</h2><p>Excelから登録済み：${excelSavedCustomerIds().length}件／全顧客：${state.customers.length}件</p><button type="button" id="excelChooseSaved" ${excelSavedCustomerIds().length?'':'disabled'}>Excel登録済みの顧客で配達予定を作る</button><button type="button" data-route-planner="">すべての顧客を一覧から選択</button></section>
  <section class="route-settings excel-settings"><details ${data||excelCompleted||excelPicker?.file?'open':''}><summary>顧客一覧のExcel取込</summary>
    <p>① ファイルを選ぶ → ② 顧客一覧を確認 → ③ 登録する</p>
    ${excelPicker?.file?'<button type="button" id="excelResume">選択したExcelを読み込む</button>':''}
    <label class="excel-file-picker"><span>Excelファイルを選ぶ・選び直す</span><input id="excelFile" type="file" aria-label="顧客一覧ファイル" accept=".xlsx,.xls,.csv,.tsv" /></label>
    <div id="excelFileStatus" class="excel-file-status" role="status" aria-live="polite">${renderExcelFileStatus()}</div>
    ${data?.preview?`<label class="excel-update"><input id="excelUpdate" type="checkbox" ${data.update?'checked':''} />一致する既存顧客の基本情報・商品も更新する</label><p class="small">通常は新規だけ追加します。更新しても配達・集金記録・メモ・予定は残します。</p><p class="small">顧客一覧は上下にスクロールして確認できます。</p>`:''}
    ${preview}
    <p id="excelMessage" role="status" class="excel-error">${escapeHtml(data?.message||'')}</p>
    ${data?.rows?`${data.map.name<0||data.map.address<0?`<p class="excel-error">「${escapeHtml(data.sheets[data.index])}」では顧客名・住所の列が見つかりません。「照合」「画像照合メモ」は確認用です。</p>${Number.isInteger(data.recommendedIndex)&&data.recommendedIndex>=0&&data.recommendedIndex!==data.index?`<button type="button" id="excelRecommended">顧客一覧の「${escapeHtml(data.sheets[data.recommendedIndex])}」を開く</button>`:''}`:''}
    <details class="excel-advanced" ${data.preview?'':'open'}><summary>シート・列の設定（内容が正しくない場合）</summary>
    <label>シート<select id="excelSheet">${data.sheets.map((s,i)=>`<option value="${i}" ${data.index===i?'selected':''}>${escapeHtml(s)}</option>`).join('')}</select></label>
    <label>青い見出しの行番号<input id="excelHeader" type="number" min="1" max="${data.rows.length}" value="${data.header+1}" /></label>
    <label>地区の初期値<input id="excelDefaultArea" maxlength="80" value="${escapeHtml(data.area||'未分類')}" /></label>
    <div class="excel-columns">${fieldSelect('name','顧客名（必須）')}${fieldSelect('address','住所（必須）')}${DeliveryImport.fields.filter(f=>!['name','address'].includes(f[0])).map(f=>fieldSelect(f[0],f[1])).join('')}</div>
    <button type="button" id="excelPreview">設定した列でプレビューを更新</button></details>`:''}
    <p class="small">xlsx・xls・CSV・TSV／10MB以内。iPhoneの「ファイル」に保存したExcelを選んでください。ファイルは外部へ送信しません。商品別の金額合計は確認用です。顧客の集金予定額には自動設定しません。支払方法・契約合計金額の列がない場合は既存値を維持し、新規は未設定です。</p>
  </details></section>`;

}
async function readExcelFile(event){
  const file=event.target.files?.[0];if(!file)return;
  if(!vaultUnlocked){if(excelPicker){excelPicker.file=file;excelPicker.input=null;excelPicker.host?.remove();excelPicker.host=null;document.getElementById('vaultMessage').textContent='ファイルを選択しました。ロック解除後、設定で「選択したExcelを読み込む」を押してください。';}return;}
  clearExcelPicker();
  clearExcelImport();const token=excelEpoch;
  if(!/\.(xlsx|xls|csv|tsv)$/i.test(file.name)||file.size>10*1024*1024||file.size===0){excelMessage('xlsx・xls・CSV・TSVの10MB以内のファイルを選んでください。');return;}
  excelImport={message:'読み込み中です…',worker:null,rows:null,filename:file.name};render();document.getElementById('excelFileStatus')?.scrollIntoView?.({block:'nearest'});
  try{
    const buffer=await file.arrayBuffer();if(token!==excelEpoch||!vaultUnlocked)return;
    const worker=new Worker(new URL('./excel-worker.js',document.baseURI));excelImport.worker=worker;
    const timeout=()=>{if(token!==excelEpoch)return;worker.terminate();excelImport.error=true;excelImport.message='読み込みが時間内に終わりませんでした。必要なシートだけのファイルにしてください。';excelMessage(excelImport.message);};
    excelImport.timer=setTimeout(timeout,20000);
    worker.onmessage=event=>{
      if(token!==excelEpoch||!vaultUnlocked)return;clearTimeout(excelImport.timer);
      if(event.data.error){excelImport.error=true;excelImport.message=event.data.error;excelMessage(event.data.error);return;}
      const {rows,sheets,index,recommendedIndex}=event.data,header=DeliveryImport.detect(rows);
      Object.assign(excelImport,{rows,sheets,index,recommendedIndex,header,error:false,map:DeliveryImport.mapping(rows[header]||[]),area:'未分類',preview:null,update:false,message:'列と見出し行を確認してプレビューしてください。'});
      if(excelImport.map.name>=0&&excelImport.map.address>=0){try{excelImport.preview=DeliveryImport.build(rows,header,excelImport.map,excelImport.area);excelImport.message='読み込みました。内容を確認し、下の「確認した内容を暗号化して登録」を押してください。';}catch(e){excelImport.message=e.message;}}
      else excelImport.message='顧客名・住所のある明細シートを選んでください。';render();
    };
    worker.onerror=()=>{if(token!==excelEpoch)return;clearTimeout(excelImport.timer);excelImport.error=true;excelImport.message='Excelの読み込みに失敗しました。ファイルを確認してください。';excelMessage(excelImport.message);};
    worker.postMessage({buffer},[buffer]);
  }catch(e){if(token===excelEpoch){excelImport.error=true;excelImport.message='ファイルを開けませんでした。端末に保存してから選択してください。';excelMessage(excelImport.message);}}
}
function wireExcelImport(){
  const fileInput=document.getElementById('excelFile');
  fileInput?.addEventListener('click',armExcelPicker);
  fileInput?.addEventListener('change',readExcelFile);
  fileInput?.addEventListener('cancel',()=>{clearExcelPicker();if(vaultUnlocked&&currentScreen==='settings')render();});
  document.getElementById('excelResume')?.addEventListener('click',resumeExcelPicker);
  document.getElementById('excelSheet')?.addEventListener('change',event=>excelChangeSheet(Number(event.target.value)));
  document.getElementById('excelRecommended')?.addEventListener('click',()=>excelChangeSheet(excelImport.recommendedIndex));
  document.getElementById('excelChooseSaved')?.addEventListener('click',routeBeginImportedSetup);
  document.getElementById('excelViewImported')?.addEventListener('click',routeBeginImportedSetup);
  document.getElementById('excelHeader')?.addEventListener('change',event=>{
    const header=Number(event.target.value)-1;if(!Number.isInteger(header)||header<0||header>=excelImport.rows.length){excelMessage('見出し行の番号を確認してください。');return;}
    excelImport.header=header;excelImport.map=DeliveryImport.mapping(excelImport.rows[header]||[]);excelImport.preview=null;render();
  });
  document.querySelectorAll('[data-excel-map]').forEach(el=>el.addEventListener('change',()=>{excelImport.map[el.dataset.excelMap]=Number(el.value);excelImport.preview=null;render();}));
  document.getElementById('excelDefaultArea')?.addEventListener('change',event=>{excelImport.area=event.target.value.trim()||'未分類';excelImport.preview=null;render();});
  document.getElementById('excelUpdate')?.addEventListener('change',event=>{excelImport.update=event.target.checked;render();});
  document.getElementById('excelPreview')?.addEventListener('click',()=>{
    try{excelImport.preview=DeliveryImport.build(excelImport.rows,excelImport.header,excelImport.map,excelImport.area);excelImport.message='内容を確認してから登録してください。';}
    catch(e){excelImport.preview=null;excelImport.message=e.message;}render();
  });
  document.getElementById('excelCommit')?.addEventListener('click',commitExcelImport);
}
function routeBeginImportedSetup(){selectedRouteId='';routeSettingsDraft=null;setScreen('settings');document.getElementById('routeEditHeading')?.scrollIntoView({block:'start'});}
async function commitExcelImport(){
  if(!vaultUnlocked||!excelImport?.preview)return;
  const token=excelEpoch,button=document.getElementById('excelCommit');button.disabled=true;
  try{
    const result=DeliveryImport.merge(state,excelImport.preview,excelImport.update);
    const completed={filename:excelImport.filename||'選択したExcel',rows:excelImport.preview.rows,customers:excelImport.preview.customers.length,counts:result.counts};
    if(window.DeliveryAddress){result.state=DeliveryAddress.enrich(result.state);const imported=excelImport.preview.customers.map(c=>DeliveryImport.match(result.state.customers,c));completed.locations={numbered:imported.filter(c=>c?.location?.address===c.address&&['parcel','building','manual'].includes(c.location.precision)).length,town:imported.filter(c=>c?.location?.address===c.address&&c.location.precision==='town').length,missing:imported.filter(c=>!c?.location||c.location.address!==c.address).length};}
    await DeliveryVault.save(result.state);if(token!==excelEpoch||!vaultUnlocked)return;
    state=result.state;const c=result.counts;clearExcelImport();excelCompleted=completed;render();document.getElementById('excelFileStatus')?.scrollIntoView?.({block:'center'});excelMessage(`登録しました。新規 ${c.added}件／更新 ${c.updated}件／スキップ ${c.skipped}件。`);
    document.querySelector('.excel-settings details').open=true;
  }catch(e){if(token===excelEpoch&&vaultUnlocked){button.disabled=false;excelMessage('登録できませんでした。元の保存データとプレビューは残しています。'+e.message);}}
}



