'use strict';
let historyDate=calendarToday(),historyArea='',visitSaving=false;
function activeVisitDate(){return state.visitDate||calendarToday();}
function receiptFields(c){const r=c.receipt||{};return `<details class="visit-receipt"><summary>伝票情報</summary><label>伝票番号<input id="visitReceiptNumber" maxlength="100" value="${escapeHtml(r.number||'')}" autocomplete="off"></label><label>発行日<input id="visitReceiptIssued" type="date" value="${escapeHtml(r.issuedOn||'')}"></label><label>次回訪問日<input id="visitReceiptNext" type="date" value="${escapeHtml(r.nextVisitOn||'')}"></label><p class="small">完了・不在の記録と一緒に保存します。</p></details>`;}
function readVisitReceipt(c){return {number:document.getElementById('visitReceiptNumber')?.value?.trim()??c.receipt?.number??'',issuedOn:document.getElementById('visitReceiptIssued')?.value??c.receipt?.issuedOn??'',nextVisitOn:document.getElementById('visitReceiptNext')?.value??c.receipt?.nextVisitOn??''};}
function renderVisitDelivery(c){return `<section class="panel"><h2>訪問日：${activeVisitDate().replaceAll('-','/')}</h2>${receiptFields(c)}<label class="visit-confirm"><input type="checkbox" id="visitRecoveryConfirmed" ${c.recoveryConfirmedDate===activeVisitDate()?'checked':''}>この訪問の回収数を確認済み</label><p class="small">未確認・空欄の回収数は「未入力」で記録し、合計に含めません。0個は0を入力して確認してください。</p>${c.items.length?`<label>回収品を追加<select id="visitRecoveryItem">${c.items.map((i,n)=>`<option value="${n}">${escapeHtml(i.model||i.name)}</option>`).join('')}</select></label><button type="button" data-visit-add-recovery>選んだ商品を回収欄に追加</button>`:''}</section>`;}
function visitModel(c,r){if(r.model)return r.model;const items=c.items.filter(i=>i.name===r.name);return items.length===1?items[0].model||'':'';}
function visitSnapshot(c,status,date){const confirmed=c.recoveryConfirmedDate===date;return {date,customerId:c.id,name:c.name,area:c.area,status,items:c.items.map(i=>({name:i.name,model:i.model||'',qty:i.qty})),recovery:c.recovery.map(r=>({name:r.name,model:visitModel(c,r),planned:r.planned,actual:status==='done'&&confirmed&&r.actual!==null?r.actual:null})),receipt:readVisitReceipt(c),note:document.getElementById('noteInput')?.value??c.note,updatedAt:new Date().toISOString()};}
async function commitVisitState(next){
 if(!vaultUnlocked||visitSaving)return false;
 if(!DeliverySecurity.validState(next)){alert('日付・伝票・数量の入力を確認してください。');return false;}
 visitSaving=true;const controls=[...document.querySelectorAll('#main button,#main input,#main select,#main textarea')],disabled=controls.map(el=>el.disabled);controls.forEach(el=>{el.disabled=true;});
 try{await DeliveryVault.save(next);if(!vaultUnlocked)return false;state=next;return true;}
 catch(e){if(vaultUnlocked)alert('保存できませんでした。以前の訪問記録は残っています。入力を確認して再度保存してください。');return false;}
 finally{visitSaving=false;if(vaultUnlocked)controls.forEach((el,i)=>{el.disabled=disabled[i];});}
}
async function recordVisit(status){
 if(!vaultUnlocked||visitSaving)return false;const current=getCurrentCustomer();if(!current)return false;
 const next=clone(state),c=next.customers.find(x=>x.id===current.id),date=activeVisitDate();
 const checkbox=document.getElementById('visitRecoveryConfirmed');if(checkbox?.checked)c.recoveryConfirmedDate=date;else delete c.recoveryConfirmedDate;
 // Read the visible inputs too, including a change not yet committed by its handler.
 for(const input of document.querySelectorAll('[data-recovery-input]')){const raw=input.value.trim(),r=c.recovery[Number(input.dataset.recoveryInput)];if(r){if(raw!==''&&!/^\d+$/.test(raw)){alert('回収数は0以上の整数で入力してください。');return false;}r.actual=raw===''?null:Number(raw);}}
 c.status=status;c.note=document.getElementById('noteInput')?.value??c.note;c.receipt=readVisitReceipt(c);
 next.visits ||= [];const entry=visitSnapshot(c,status,date),index=next.visits.findIndex(v=>v.date===date&&v.customerId===c.id);
 if(index<0)next.visits.push(entry);else next.visits[index]=entry;
 return commitVisitState(next);
}
function visitTotals(entries){const totals=new Map();for(const v of entries.filter(v=>v.status==='done'))for(const r of v.recovery){const key=r.model?'model:'+r.model:'name:'+r.name;if(!totals.has(key))totals.set(key,{label:r.model||r.name,hasModel:!!r.model,planned:0,actual:0,missing:0});const t=totals.get(key);t.planned+=r.planned;if(r.actual===null)t.missing++;else t.actual+=r.actual;}return [...totals.values()];}
function renderVisitHistory(){
 const daily=(state.visits||[]).filter(v=>v.date===historyDate),areas=[...new Set(daily.map(v=>v.area))].sort(),entries=daily.filter(v=>!historyArea||v.area===historyArea),totals=visitTotals(entries);
 return `<section class="panel visit-history"><h2>日別の回収集計・訪問履歴</h2><label>確認する日<input type="date" id="historyDate" min="2000-01-01" max="2100-12-31" value="${historyDate}"></label><label>地区<select id="historyArea"><option value="">すべての地区</option>${areas.map(a=>`<option value="${escapeHtml(a)}" ${historyArea===a?'selected':''}>${escapeHtml(a)}</option>`).join('')}</select></label><p>完了 ${entries.filter(v=>v.status==='done').length}件／不在 ${entries.filter(v=>v.status==='absent').length}件</p><div class="visit-table-wrap"><table class="visit-table"><thead><tr><th>型式・商品</th><th>回収予定</th><th>確認済み回収</th><th>未入力</th></tr></thead><tbody>${totals.map(t=>`<tr><td>${escapeHtml(t.label)}${!t.hasModel?'<small>型式未登録</small>':''}</td><td>${t.planned}</td><td>${t.actual}</td><td>${t.missing}件</td></tr>`).join('')}</tbody></table></div>${!totals.length?'<p class="small">集計する回収記録はありません。</p>':''}<p class="small">完了した訪問の確認済み回収数を集計します。不在と未入力は合計に含めません。同じ日・同じ顧客の記録は更新され、二重計上しません。</p>${entries.map(v=>`<details><summary>${escapeHtml(v.area)} ${escapeHtml(v.name)}・${statusLabel(v.status)}</summary><p>伝票番号：${escapeHtml(v.receipt.number||'未登録')}<br>発行日：${escapeHtml(v.receipt.issuedOn||'未登録')}<br>次回訪問日：${escapeHtml(v.receipt.nextVisitOn||'未登録')}</p><p>完了時の配達品（予定数）：${v.items.map(i=>`${escapeHtml(i.model||i.name)} × ${i.qty}`).join('、')||'なし'}</p><ul>${v.recovery.map(r=>`<li>${escapeHtml(r.model||r.name)}：${v.status==='absent'?'不在（回収集計対象外）':r.actual===null?'未入力':r.actual+'個'}</li>`).join('')}</ul>${v.note?`<p>${escapeHtml(v.note)}</p>`:''}</details>`).join('')}${!entries.length?'<p>この日の訪問記録はありません。更新前の完了状態からは履歴を自動作成しません。</p>':''}<hr><h3>配達する日の設定</h3><p>現在の訪問日：${activeVisitDate().replaceAll('-','/')}</p><form id="visitDayForm"><label>新しく配達を始める日<input name="date" type="date" min="2000-01-01" max="2100-12-31" required value="${calendarToday()}"></label><button type="submit">この日の配達を開始</button></form><p class="small">履歴を残したまま、顧客を未配達に戻し、回収数・確認・メモ・伝票欄を新しい訪問用にします。その日の記録済み顧客は保存済みの状態に戻します。</p></section>`;
}
async function startVisitDay(event){event.preventDefault();const date=event.currentTarget.elements.date.value;if(!Number.isFinite(calendarDay(date))||date<'2000-01-01'||date>'2100-12-31'){alert('正しい日付を入力してください。');return;}if(date===activeVisitDate()){alert('すでにこの日で配達しています。');return;}if(!confirm('訪問履歴は残し、作業中の回収数・メモ・伝票欄を新しい日の状態に切り替えますか？'))return;const next=clone(state);next.visitDate=date;
 for(const c of next.customers){const prior=(next.visits||[]).find(v=>v.date===date&&v.customerId===c.id);c.status=prior?.status||'pending';c.added=false;c.changed=false;c.note=prior?.note||'';c.receipt=prior?.receipt||{number:'',issuedOn:'',nextVisitOn:''};delete c.recoveryConfirmedDate;
  c.recovery.forEach(r=>{const saved=prior?.recovery.find(x=>x.name===r.name&&x.model===visitModel(c,r));r.actual=saved?.actual??null;});
  if(prior?.status==='done'&&prior.recovery.every(r=>r.actual!==null))c.recoveryConfirmedDate=date;
 }
 if(await commitVisitState(next)){historyDate=date;historyArea='';render();}
}
function wireVisitHistory(){
 for(const id of ['visitReceiptNumber','visitReceiptIssued','visitReceiptNext','visitRecoveryConfirmed'])document.getElementById(id)?.addEventListener('change',async()=>{if(!vaultUnlocked||visitSaving)return;const next=clone(state),c=next.customers.find(c=>c.id===currentCustomerId);if(!c)return;c.receipt=readVisitReceipt(c);if(document.getElementById('visitRecoveryConfirmed')?.checked)c.recoveryConfirmedDate=activeVisitDate();else delete c.recoveryConfirmedDate;await commitVisitState(next);});
 document.getElementById('historyDate')?.addEventListener('change',e=>{if(Number.isFinite(calendarDay(e.target.value))){historyDate=e.target.value;historyArea='';render();}});
 document.getElementById('historyArea')?.addEventListener('change',e=>{historyArea=e.target.value;render();});
 document.getElementById('visitDayForm')?.addEventListener('submit',startVisitDay);
 document.querySelector('[data-visit-add-recovery]')?.addEventListener('click',async()=>{const next=clone(state),c=next.customers.find(c=>c.id===currentCustomerId),item=c?.items[Number(document.getElementById('visitRecoveryItem').value)];if(!item)return;if(c.recovery.some(r=>r.name===item.name&&visitModel(c,r)===(item.model||''))){alert('この商品は回収欄にあります。');return;}c.recovery.push({name:item.name,model:item.model||'',planned:item.qty,actual:null});delete c.recoveryConfirmedDate;if(await commitVisitState(next))render();});
}
