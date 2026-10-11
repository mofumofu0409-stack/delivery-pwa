'use strict';
const CASH_MAX=1000000000;
function cashMoney(value){return Number.isSafeInteger(value)&&value>=0&&value<=CASH_MAX;}
function cashParse(raw,optional=false){const s=String(raw).trim();if(optional&&s==='')return null;if(!/^\d+$/.test(s)||!cashMoney(Number(s)))throw Error('金額は0〜1,000,000,000円の整数で入力してください。');return Number(s);}
function cashRecord(date,id){return (state.cash?.collections||[]).find(r=>r.date===date&&r.customerId===id);}
// Former cash-only records retain their historical meaning; never infer from today's master.
function isCashRecord(r){return r.paymentMethod===undefined||r.paymentMethod==='cash';}
function cashTotals(date){const opening=(state.cash?.days||[]).find(d=>d.date===date)?.opening??null;const records=(state.cash?.collections||[]).filter(r=>r.date===date);const total=records.filter(isCashRecord).reduce((sum,r)=>sum+(r.actual??0),0);return {opening,total,balance:opening===null?null:opening+total,records};}
function cashYen(n){return n===null?'未設定':n.toLocaleString('ja-JP')+'円';}
function cashStatus(r){if(!r||r.actual===null)return r?.collectionStatus==='unpaid'?'未集金':'未登録';return r.expected===null?'集金登録済み':r.actual>=r.expected?'集金済み':'一部集金・未収あり';}
function cashSummary(date){const t=cashTotals(date);return `<section class="panel cash-panel"><h2>${date.replaceAll('-','/')} 財布・現金集金</h2><dl class="cash-totals"><dt>開始時残高</dt><dd>${cashYen(t.opening)}</dd><dt>当日の現金集金合計</dt><dd>${cashYen(t.total)}</dd><dt>計算上の財布残高</dt><dd>${cashYen(t.balance)}</dd></dl>${t.opening===null?'<p class="warning-box">開始時残高が未設定です。財布残高はまだ計算できません。</p>':''}<details ${t.opening===null?'open':''}><summary>${t.opening===null?'開始時残高を入力':'開始時残高を修正'}</summary><form id="cashOpeningForm" data-date="${date}"><label>財布の開始時残高（円）<input name="opening" inputmode="numeric" pattern="[0-9]*" required value="${t.opening??''}" autocomplete="off"></label><button type="submit">開始残高を保存</button></form></details><p class="small">開始残高＋その日の現金集金額です。銀行振込・口座引き落としは加算しません。</p><p id="cashMessage" role="status" aria-live="polite"></p></section>`;}
function cashExpected(c,r){return r?r.expected:contractAmount(c);}
function cashNeedsCheck(date){
 const targets=new Map((state.visits||[]).filter(v=>v.date===date&&v.status==='done'&&v.paymentMethod==='cash').map(v=>[v.customerId,v]));
 return [...targets.values()].filter(c=>{const r=cashRecord(date,c.customerId||c.id);return !r||r.actual===null||(r.expected!==null&&r.actual<r.expected);});
}
function renderCashDelivery(c){
 const date=activeVisitDate(),r=cashRecord(date,c.id),method=paymentMethod(c),expected=cashExpected(c,r);
 const header=`<section class="panel cash-panel"><h2>支払方法：${PAYMENT_LABELS[method]}</h2><p>契約合計金額：${cashYen(contractAmount(c))}</p><p>交換状態：${c.status==="done"?"交換済み":c.status==="absent"?"不在":"未交換"}</p>`;
 if(method!=='cash')return header+`<p>${method==='unknown'?'支払方法を顧客編集画面で設定してください。現金扱いにはしません。':'入金確認は店舗側で行います。交換完了だけでは入金済みになりません。'}</p>${r?`<p>保存済みのこの日の集金記録：${cashStatus(r)}／${cashYen(r.actual)}（記録時の方式を維持）</p>`:''}</section>`;
 return cashSummary(date)+header+`<p>現金集金：${cashStatus(r)}／集金予定額：${cashYen(expected)}</p>${expected!==null&&r?.actual!==undefined&&r.actual!==null?`<p>未収額：${cashYen(Math.max(0,expected-r.actual))}${r.actual>expected?'（予定額を超えて集金）':''}</p>`:''}<div class="toggle-grid"><button type="button" class="action-btn action-primary" aria-label="集金済み${expected===null?'':' '+cashYen(expected)}" id="cashPaid" ${expected===null?'disabled':''}>集金済み${expected===null?'':'<span class="cash-button-amount">'+cashYen(expected)+'</span>'}</button><button type="button" class="action-btn action-secondary" id="cashUnpaid">未集金</button></div>${expected===null?'<p class="warning-box">契約合計金額が未設定です。顧客編集で設定するか、実際の集金額を入力してください。</p>':''}<details><summary>金額が異なる・集金を修正</summary><form id="cashCollectionForm" data-date="${date}" data-customer="${escapeHtml(c.id)}"><label>実際の集金額（円）<input name="actual" inputmode="numeric" pattern="[0-9]*" required value="${r?.actual??expected??''}" autocomplete="off"></label><label>この日の集金予定額（円）<input name="expected" inputmode="numeric" pattern="[0-9]*" value="${expected??''}" autocomplete="off"></label><button type="submit">集金額を保存</button>${r?.actual!==undefined&&r.actual!==null?'<button type="button" id="cashCancel">この集金を取り消す</button>':''}</form></details><p class="small">0円も記録できます。集金を記録してから「全量交換」を押してください。交換と集金は別々に保存します。</p></section>`;
}
function renderCashCheck(){const date=historyDate,t=cashTotals(date);return cashSummary(date)+`<section class="panel cash-panel"><h2>集金明細</h2>${cashNeedsCheck(date).length?`<div class="warning-box"><strong>交換済み・現金集金の要確認 ${cashNeedsCheck(date).length}件</strong><p>${cashNeedsCheck(date).map(c=>escapeHtml(c.name)).join("、")}</p><p>集金未登録・未集金・不足額がある顧客です。</p></div>`:""}${t.records.length?t.records.map(r=>`<details><summary>${escapeHtml(r.name)}：${cashYen(r.actual)}・${cashStatus(r)}</summary><p>記録時の方式：${r.paymentMethod===undefined?'現金（旧版記録）':PAYMENT_LABELS[r.paymentMethod]}<br>予定額：${cashYen(r.expected)}<br>実集金額：${r.actual===null?'未登録':cashYen(r.actual)}${r.expected!==null&&r.actual!==null?'<br>未収額：'+cashYen(Math.max(0,r.expected-r.actual)):''}</p>${isCashRecord(r)?`<form data-cash-history data-customer="${escapeHtml(r.customerId)}" data-date="${date}"><label>実集金額を修正（円）<input name="actual" inputmode="numeric" pattern="[0-9]*" required value="${r.actual??''}"></label><button type="submit">修正を保存</button><button type="button" data-cash-history-cancel>集金を取り消す</button></form>`:''}</details>`).join(''):'<p>この日の集金記録はありません。</p>'}<p class="small">日付は下の「確認する日」で変更できます。支払方法を変更しても、過去の現金記録は維持します。</p></section>`;}
async function cashSaveOpening(date,raw){if(!vaultUnlocked||visitSaving)return false;let opening;try{opening=cashParse(raw);}catch(e){alert(e.message);return false;}const next=clone(state);next.cash||={days:[],collections:[]};next.cash.days=next.cash.days.filter(d=>d.date!==date);next.cash.days.push({date,opening});return commitVisitState(next);}
async function cashSaveCollection(date,id,actualRaw,expectedRaw,cancel=false,mode='paid',historical=false){
 if(!vaultUnlocked||visitSaving)return false;const c=state.customers.find(c=>c.id===id),prior=cashRecord(date,id);
 if(historical?!prior||!isCashRecord(prior):!c||paymentMethod(c)!=='cash'){alert('現金顧客だけ集金を記録できます。');return false;}
 if(prior&&!isCashRecord(prior)){alert('現金以外の過去記録は現金集金として変更できません。');return false;}
 let actual,expected;try{actual=cancel||mode==='unpaid'?null:cashParse(actualRaw);expected=cashParse(expectedRaw,true);}catch(e){alert(e.message);return false;}
 const next=clone(state);next.cash||={days:[],collections:[]};const records=next.cash.collections,index=records.findIndex(r=>r.date===date&&r.customerId===id);
 const entry={...prior,date,customerId:id,name:prior?.name||c.name,expected,actual,paymentMethod:prior?.paymentMethod||'cash',collectionStatus:cancel?'cancelled':mode};
 if(index===-1)records.push(entry);else records[index]=entry;return commitVisitState(next);
}
function cashNotify(message){render();document.getElementById('cashMessage').textContent=message;}
function wireCash(){
 document.getElementById('cashOpeningForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;if(await cashSaveOpening(f.dataset.date,f.elements.opening.value))cashNotify('開始残高を保存しました。');});
 for(const [id,mode] of [['cashPaid','paid'],['cashUnpaid','unpaid']])document.getElementById(id)?.addEventListener('click',async()=>{const c=getCurrentCustomer(),expected=cashExpected(c,cashRecord(activeVisitDate(),c.id));if(await cashSaveCollection(activeVisitDate(),c.id,expected??'',expected??'',false,mode))cashNotify(mode==='paid'?'集金済みを保存しました。':'未集金を保存しました。');});
 document.getElementById('cashCollectionForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;if(await cashSaveCollection(f.dataset.date,f.dataset.customer,f.elements.actual.value,f.elements.expected.value))cashNotify('集金額を保存し、財布残高を更新しました。');});
 document.getElementById('cashCancel')?.addEventListener('click',async()=>{const f=document.getElementById('cashCollectionForm'),r=cashRecord(f.dataset.date,f.dataset.customer);if(confirm('この顧客・この日の集金を取り消しますか？')&&await cashSaveCollection(f.dataset.date,f.dataset.customer,'',r.expected??'',true))cashNotify('集金を取り消しました。');});
 document.querySelectorAll('[data-cash-history]').forEach(f=>{
  f.addEventListener('submit',async e=>{e.preventDefault();const r=cashRecord(f.dataset.date,f.dataset.customer);if(await cashSaveCollection(f.dataset.date,f.dataset.customer,f.elements.actual.value,r.expected??'',false,'paid',true))cashNotify('過去の集金額を修正しました。');});
  f.querySelector('[data-cash-history-cancel]').addEventListener('click',async()=>{const r=cashRecord(f.dataset.date,f.dataset.customer);if(confirm('この日の集金を取り消しますか？')&&await cashSaveCollection(f.dataset.date,f.dataset.customer,'',r.expected??'',true,'paid',true))cashNotify('集金を取り消しました。');});
 });
}



