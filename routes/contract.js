'use strict';
const PAYMENT_LABELS={unknown:'未設定',cash:'現金',bank:'銀行振込',debit:'口座引き落とし'};
function paymentMethod(c){return c.paymentMethod||'unknown';}
function contractAmount(c){return c.contractAmount??null;}
function renderContractFields(c){
 const method=paymentMethod(c||{});
 return `<fieldset class="contract-fields"><legend>契約・支払方法</legend><label>支払方法<select name="paymentMethod">${Object.entries(PAYMENT_LABELS).map(([key,label])=>`<option value="${key}" ${method===key?'selected':''}>${label}</option>`).join('')}</select></label><label>通常の交換時の契約合計金額（税込・円）<input name="contractAmount" inputmode="numeric" pattern="[0-9]*" value="${c?.contractAmount??''}" autocomplete="off"></label><p class="small">空欄は未設定です。現金の場合、この合計額を集金予定額に使います。商品別の元の金額は自動で合算しません。</p><h3>契約商品・数量</h3><div id="contractItems">${(c?.items||[]).map(renderContractItem).join('')}</div><button type="button" id="contractAddItem">商品を追加</button><p class="small">回収予定は別項目です。全量交換では登録済みの回収予定数を使用します。</p></fieldset>`;
}
function renderContractItem(item={name:'',qty:1,model:''},index=0){return `<fieldset data-contract-item data-index="${index}"><legend>契約商品</legend><label>商品名<input data-contract-name maxlength="200" value="${escapeHtml(item.name)}" required></label><label>型式・品記号<input data-contract-model maxlength="100" value="${escapeHtml(item.model||'')}"></label><label>契約数量<input data-contract-qty inputmode="decimal" value="${item.qty}" required></label>${item.contractAmount!==undefined?`<p class="small">元の商品別契約金額：${cashYen(item.contractAmount)}（維持）</p>`:''}<button type="button" data-contract-remove>この商品を契約から外す</button></fieldset>`;}
function readContractFields(form,c){
 const method=form.elements.paymentMethod?.value??paymentMethod(c||{});
 if(!Object.hasOwn(PAYMENT_LABELS,method))throw Error('支払方法を確認してください。');
 const amount=form.elements.contractAmount?cashParse(form.elements.contractAmount.value,true):contractAmount(c||{});
 const items=[...document.querySelectorAll('[data-contract-item]')].map(row=>{
  const name=row.querySelector('[data-contract-name]').value.trim(),model=row.querySelector('[data-contract-model]').value.trim(),raw=row.querySelector('[data-contract-qty]').value.trim();
  if(!name||name.length>200||model.length>100||!/^\d+(\.\d+)?$/.test(raw)||Number(raw)>1000000)throw Error('商品名と0以上の契約数量を確認してください。');
  const previous=c?.items[Number(row.dataset.index)];
  return {...previous,name,model,qty:Number(raw)};
 });
 // Older callers without the new fields keep their existing product list.
 const values={paymentMethod:method,items:form.elements.paymentMethod?items:clone(c?.items||[])};
 if(amount!==null)values.contractAmount=amount;
 return values;
}
function wireContract(){
 const container=document.getElementById('contractItems');
 document.getElementById('contractAddItem')?.addEventListener('click',()=>{if(container.querySelectorAll('[data-contract-item]').length>=200){alert('商品は200件までです。');return;}container.insertAdjacentHTML('beforeend',renderContractItem(undefined,-1));});
 container?.addEventListener('click',e=>{if(e.target.matches('[data-contract-remove]'))e.target.closest('[data-contract-item]').remove();});
}
