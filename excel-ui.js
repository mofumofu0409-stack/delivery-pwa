'use strict';
let excelImport=null,excelEpoch=0;
function clearExcelImport(){excelEpoch++;if(excelImport){excelImport.worker?.terminate();clearTimeout(excelImport.timer);}excelImport=null;}
function excelMessage(text){const el=document.getElementById('excelMessage');if(el)el.textContent=text;}
function renderExcelImport(){
  const data=excelImport, fieldSelect=(key,label)=>`<label>${escapeHtml(label)}<select data-excel-map="${key}"><option value="-1">取り込まない</option>${(data?.rows[data.header]||[]).map((v,i)=>`<option value="${i}" ${data.map[key]===i?'selected':''}>${i+1}列：${escapeHtml(v||'（空欄）')}</option>`).join('')}</select></label>`;
  let preview='';
  if(data?.preview){
    try{
      const merged=DeliveryImport.merge(state,data.preview,data.update),counts=merged.counts;
      preview=`<h3>取込前の確認</h3><p>${data.preview.rows}行 → ${data.preview.customers.length}顧客。新規 ${counts.added}件／更新 ${counts.updated}件／スキップ ${counts.skipped}件</p>
      <p>住所・番地・数量を確認してください。回収対象はExcelから判断できないため、新規顧客に回収予定は追加しません。</p>
      <div class="excel-preview">${data.preview.customers.slice(0,50).map(c=>`<article><strong>${escapeHtml(c.name)}</strong><p>${escapeHtml(c.address)}</p><small>顧客コード：${escapeHtml(c.source.customerCode||'なし')}／ルートコード：${escapeHtml(c.source.routeCode||'なし')}<br>郵便番号：${escapeHtml(c.source.postalCode)}／電話：${escapeHtml(c.source.phone)}</small><ul>${c.items.map(i=>`<li>${escapeHtml(i.model)} ${escapeHtml(i.name)} × ${i.qty}${i.contractAmount!==undefined?'／契約税込金額 '+i.contractAmount.toLocaleString('ja-JP')+'円':''}</li>`).join('')}</ul></article>`).join('')}</div>
      ${data.preview.customers.length>50?'<p>表示は先頭50顧客です。確認して登録すると全件を処理します。</p>':''}
      <button type="button" id="excelCommit" ${counts.added+counts.updated?'':'disabled'}>確認した内容を暗号化して登録</button>`;
    }catch(e){preview=`<p class="excel-error">${escapeHtml(e.message)}</p>`;}
  }
  return `<section class="route-settings excel-settings"><details ${data?'open':''}><summary>顧客一覧のExcel取込</summary>
    <p>写真の青い見出しに対応しています。Excelファイルを選んでください。ファイルは外部へ送信せず、登録前に内容を確認できます。</p>
    <label>顧客一覧ファイル<input id="excelFile" type="file" accept=".xlsx,.xls,.csv,.tsv" /></label>
    <p class="small">xlsx・xls・CSV・TSV／10MB以内。写真自体の読取には対応していません。コード・郵便番号・電話番号はExcelで文字列にしておくと先頭の0を保てます。</p>
    ${data?.rows?`<label>シート<select id="excelSheet">${data.sheets.map((s,i)=>`<option value="${i}" ${data.index===i?'selected':''}>${escapeHtml(s)}</option>`).join('')}</select></label>
    <label>青い見出しの行番号<input id="excelHeader" type="number" min="1" max="${data.rows.length}" value="${data.header+1}" /></label>
    <label>地区の初期値<input id="excelDefaultArea" maxlength="80" value="${escapeHtml(data.area||'未分類')}" /></label>
    <div class="excel-columns">${fieldSelect('name','顧客名（必須）')}${fieldSelect('address','住所（必須）')}</div>
    <details><summary>商品・コードなどの列を確認</summary><div class="excel-columns">${DeliveryImport.fields.filter(f=>!['name','address'].includes(f[0])).map(f=>fieldSelect(f[0],f[1])).join('')}</div></details>
    <label class="excel-update"><input id="excelUpdate" type="checkbox" ${data.update?'checked':''} />一致する既存顧客の基本情報・商品も更新する</label>
    <p class="small">通常は新規だけ追加します。更新時も顧客ID・配達記録・回収記録・メモ・配達予定は残します。既存の商品一覧はExcelの内容に置き換えます。</p>
    <button type="button" id="excelPreview">列を確認してプレビュー</button>${preview}`:''}
    <p id="excelMessage" role="status" class="excel-error">${escapeHtml(data?.message||'')}</p>
    <p class="small">契約税込金額は元の値として保存します。単価・報酬の計算には使いません。週・曜日は取込後に配達予定の設定で指定できます。</p>
  </details></section>`;
}
async function readExcelFile(event){
  const file=event.target.files?.[0];if(!file||!vaultUnlocked)return;
  clearExcelImport();const token=excelEpoch;
  if(!/\.(xlsx|xls|csv|tsv)$/i.test(file.name)||file.size>10*1024*1024||file.size===0){excelMessage('xlsx・xls・CSV・TSVの10MB以内のファイルを選んでください。');return;}
  excelImport={message:'読み込み中です…',worker:null,rows:null};excelMessage(excelImport.message);
  try{
    const buffer=await file.arrayBuffer();if(token!==excelEpoch||!vaultUnlocked)return;
    const worker=new Worker('./excel-worker.js');excelImport.worker=worker;
    const timeout=()=>{if(token!==excelEpoch)return;worker.terminate();excelImport.message='読み込みが時間内に終わりませんでした。必要なシートだけのファイルにしてください。';excelMessage(excelImport.message);};
    excelImport.timer=setTimeout(timeout,20000);
    worker.onmessage=event=>{
      if(token!==excelEpoch||!vaultUnlocked)return;clearTimeout(excelImport.timer);
      if(event.data.error){excelImport.message=event.data.error;excelMessage(event.data.error);return;}
      const {rows,sheets,index}=event.data,header=DeliveryImport.detect(rows);
      Object.assign(excelImport,{rows,sheets,index,header,map:DeliveryImport.mapping(rows[header]||[]),area:'未分類',preview:null,update:false,message:'列と見出し行を確認してプレビューしてください。'});render();
    };
    worker.onerror=()=>{if(token!==excelEpoch)return;clearTimeout(excelImport.timer);excelImport.message='Excelの読み込みに失敗しました。ファイルを確認してください。';excelMessage(excelImport.message);};
    worker.postMessage({buffer},[buffer]);
  }catch(e){if(token===excelEpoch){excelImport.message='ファイルを開けませんでした。端末に保存してから選択してください。';excelMessage(excelImport.message);}}
}
function wireExcelImport(){
  document.getElementById('excelFile')?.addEventListener('change',readExcelFile);
  document.getElementById('excelSheet')?.addEventListener('change',event=>{
    const index=Number(event.target.value);excelImport.preview=null;excelImport.rows=null;excelImport.message='シートを読み込み中です…';render();
    clearTimeout(excelImport.timer);const token=excelEpoch;
    excelImport.timer=setTimeout(()=>{if(token===excelEpoch){excelImport.worker.terminate();excelMessage('シートの読み込みが時間内に終わりませんでした。ファイルを選び直してください。');}},20000);
    excelImport.worker.postMessage({index});
  });
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
async function commitExcelImport(){
  if(!vaultUnlocked||!excelImport?.preview)return;
  const token=excelEpoch,button=document.getElementById('excelCommit');button.disabled=true;
  try{
    const result=DeliveryImport.merge(state,excelImport.preview,excelImport.update);
    await DeliveryVault.save(result.state);if(token!==excelEpoch||!vaultUnlocked)return;
    state=result.state;const c=result.counts;clearExcelImport();render();excelMessage(`登録しました。新規 ${c.added}件／更新 ${c.updated}件／スキップ ${c.skipped}件。`);
    document.querySelector('.excel-settings details').open=true;
  }catch(e){if(token===excelEpoch&&vaultUnlocked){button.disabled=false;excelMessage('登録できませんでした。元の保存データとプレビューは残しています。'+e.message);}}
}
