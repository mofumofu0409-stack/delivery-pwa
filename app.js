const STORAGE_KEY = 'delivery-support-demo-v0.1';

const demoCustomers = [
  { id:'C001', area:'今市', name:'山田 花子', address:'栃木県日光市今市100-1', items:[{name:'フロアモップ',qty:1},{name:'モップ用シート',qty:2}], recovery:[{name:'フロアモップ',planned:1,actual:1}], memo:'玄関右側。インターホン1回。' },
  { id:'C002', area:'今市', name:'佐藤 太郎', address:'栃木県日光市今市本町12-3', items:[{name:'ハンディモップ',qty:1}], recovery:[{name:'ハンディモップ',planned:1,actual:1}], memo:'午前中希望。' },
  { id:'C003', area:'瀬川', name:'鈴木 一郎', address:'栃木県日光市瀬川250-4', items:[{name:'玄関マット',qty:1},{name:'フィルター',qty:1}], recovery:[{name:'玄関マット',planned:1,actual:1},{name:'フィルター',planned:1,actual:1}], memo:'' },
  { id:'C004', area:'森友', name:'高橋 美咲', address:'栃木県日光市森友700-2', items:[{name:'台所用スポンジ',qty:3}], recovery:[], memo:'門の前に駐車しない。' },
  { id:'C005', area:'森友', name:'渡辺 健', address:'栃木県日光市森友820-8', items:[{name:'フロアモップ',qty:1}], recovery:[{name:'フロアモップ',planned:1,actual:1}], memo:'' },
  { id:'C006', area:'豊田', name:'小林 直子', address:'栃木県日光市豊田45-6', items:[{name:'フィルター',qty:2}], recovery:[{name:'フィルター',planned:2,actual:2}], memo:'犬あり。門を必ず閉める。' },
  { id:'C007', area:'土沢', name:'加藤 誠', address:'栃木県日光市土沢1100-5', items:[{name:'玄関マット',qty:1}], recovery:[{name:'玄関マット',planned:1,actual:1}], memo:'' },
  { id:'C008', area:'木和田島', name:'吉田 恵', address:'栃木県日光市木和田島1550-9', items:[{name:'ハンディモップ',qty:1},{name:'フィルター',qty:2}], recovery:[{name:'ハンディモップ',planned:1,actual:1},{name:'フィルター',planned:2,actual:2}], memo:'不在時は持ち帰り。' },
  { id:'C009', area:'大室', name:'山口 修', address:'栃木県日光市大室300-7', items:[{name:'フロアモップ',qty:1}], recovery:[{name:'フロアモップ',planned:1,actual:1}], memo:'' },
  { id:'C010', area:'大沢', name:'松本 久美', address:'栃木県日光市大沢町80-2', items:[{name:'台所用スポンジ',qty:2},{name:'玄関マット',qty:1}], recovery:[{name:'玄関マット',planned:1,actual:1}], memo:'次回スポンジ追加の可能性あり。' },
].map(c => ({...c, status:'pending', added:false, changed:false, note:''}));

let storageBlocked = false;
let state = loadState();
let currentScreen = 'list';
let editingCustomerId = null;
let currentCustomerId = state.customers.find(c => c.status === 'pending')?.id || state.customers[0]?.id;

function clone(v){ return JSON.parse(JSON.stringify(v)); }
function loadState(){
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return DeliverySecurity.parseState(saved);
  } catch(e) { storageBlocked = true; return {customers:[]}; }
  return { customers: clone(demoCustomers) };
}
function saveState(){
  if (storageBlocked || !DeliverySecurity.validState(state)) throw new Error('保存データの形式が正しくありません。');
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function statusLabel(status){
  return status === 'done' ? '完了' : status === 'absent' ? '不在' : '未配達';
}
function statusClass(status){
  return status === 'done' ? 'status-done' : status === 'absent' ? 'status-absent' : 'status-pending';
}
function getCounts(){
  const total = state.customers.length;
  const done = state.customers.filter(c => c.status === 'done').length;
  const absent = state.customers.filter(c => c.status === 'absent').length;
  const pending = state.customers.filter(c => c.status === 'pending').length;
  const issues = state.customers.filter(c => c.added || c.changed || c.recovery.some(r => Number(r.actual) !== Number(r.planned))).length;
  return {total, done, absent, pending, issues};
}

function setScreen(screen){
  currentScreen = screen;
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.screen === screen));
  render();
}

function render(){
  if (storageBlocked) {
    document.getElementById('screenTitle').textContent = '保存データを確認してください';
    document.getElementById('topCount').textContent = '操作停止';
    document.getElementById('main').innerHTML = '<div class="warning-box">保存データを読み込めないため操作を停止しました。元データは削除していません。ブラウザのデータを初期化せず、データの形式を確認してください。</div>';
    return;
  }
  const counts = getCounts();
  document.getElementById('topCount').textContent = `残り ${counts.pending}件`;
  const title = currentScreen === 'customer' ? (editingCustomerId ? '顧客を編集' : '顧客を登録') : currentScreen === 'list' ? '今日の配達' : currentScreen === 'delivery' ? '配達' : '最終チェック';
  document.getElementById('screenTitle').textContent = title;

  const main = document.getElementById('main');
  if (currentScreen === 'list') main.innerHTML = renderList();
  if (currentScreen === 'delivery') main.innerHTML = renderDelivery();
  if (currentScreen === 'check') main.innerHTML = renderCheck();
  if (currentScreen === 'customer') main.innerHTML = renderCustomerForm();
  wireEvents();
}

function renderList(){
  const counts = getCounts();
  const groups = Object.create(null);
  state.customers.forEach(c => { (groups[c.area] ||= []).push(c); });
  const listHtml = Object.entries(groups).map(([area, customers]) => `
    <div class="section-title">${escapeHtml(area)}</div>
    <div class="customer-list">
      ${customers.map(c => `
        <button class="customer-card ${escapeHtml(c.status)}" data-open-customer="${escapeHtml(c.id)}">
          <div class="customer-top">
            <div>
              <div class="area">${escapeHtml(c.area)}</div>
              <div class="name">${escapeHtml(c.name)}さん</div>
              <div class="item-count">配達 ${sumItems(c.items)}品 ・ ${c.items.length}種類</div>
            </div>
            <span class="status-pill ${statusClass(c.status)}">${statusLabel(c.status)}</span>
          </div>
        </button>
      `).join('')}
    </div>
  `).join('');

  return `
    <section class="summary-card">
      <div class="summary-row">
        <div class="metric"><span class="num">${counts.pending}</span><span class="label">残り</span></div>
        <div class="metric"><span class="num">${counts.done}</span><span class="label">完了</span></div>
        <div class="metric"><span class="num">${counts.absent}</span><span class="label">不在</span></div>
      </div>
    </section>
    <button class="action-btn action-secondary customer-add" data-add-customer>＋ 顧客を登録</button>
    ${listHtml}
  `;
}

function renderDelivery(){
  if (!state.customers.length) return '<div class="empty">顧客データがありません。</div>';
  let c = state.customers.find(x => x.id === currentCustomerId);
  if (!c) c = state.customers[0];
  currentCustomerId = c.id;
  const index = state.customers.findIndex(x => x.id === c.id);

  return `
    <section class="panel detail-head">
      <div class="detail-area">${escapeHtml(c.area)}地区</div>
      <div class="detail-name">${escapeHtml(c.name)}さん</div>
      <div class="address">${escapeHtml(c.address)}</div>
      <button class="link-btn" data-edit-customer>顧客名・住所を編集</button>
      <div class="big-number">配達 ${sumItems(c.items)}品</div>
      ${c.memo ? `<div class="warning-box" style="margin-top:12px">注意：${escapeHtml(c.memo)}</div>` : ''}
    </section>

    <section class="panel">
      <h2>今回の配達</h2>
      ${c.items.map(i => `<div class="item-row"><span class="item-name">${escapeHtml(i.name)}</span><span class="item-qty">× ${i.qty}</span></div>`).join('')}
    </section>

    <section class="panel">
      <h2>回収</h2>
      ${c.recovery.length ? c.recovery.map((r, idx) => `
        <div class="recovery-row">
          <div><div class="item-name">${escapeHtml(r.name)}</div><div class="small">予定 ${r.planned}</div></div>
          <div class="stepper">
            <button data-step="-1" data-recovery="${idx}" aria-label="減らす">−</button>
            <input inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(r.actual)}" data-recovery-input="${idx}" aria-label="回収数" />
            <button data-step="1" data-recovery="${idx}" aria-label="増やす">＋</button>
          </div>
        </div>
      `).join('') : '<div class="small">回収予定なし</div>'}
    </section>

    <section class="panel">
      <h2>追加・変更</h2>
      <div class="toggle-grid">
        <button class="toggle-btn ${c.added ? 'on' : ''}" data-toggle="added">追加 ${c.added ? 'あり' : 'なし'}</button>
        <button class="toggle-btn ${c.changed ? 'on' : ''}" data-toggle="changed">変更 ${c.changed ? 'あり' : 'なし'}</button>
      </div>
      <textarea maxlength="20000" id="noteInput" placeholder="必要な時だけメモ">${escapeHtml(c.note || '')}</textarea>
    </section>

    <div class="action-grid">
      <button class="action-btn action-secondary" data-nav-maps>ナビ</button>
      <button class="action-btn action-warn" data-mark-absent>不在</button>
      <button class="action-btn action-primary" data-mark-done>完了 →</button>
    </div>
    <div class="small" style="text-align:center">${index + 1} / ${state.customers.length}件</div>
  `;
}

function renderCheck(){
  const counts = getCounts();
  const pending = state.customers.filter(c => c.status === 'pending');
  const absent = state.customers.filter(c => c.status === 'absent');
  const recoveryDiff = state.customers.filter(c => c.recovery.some(r => Number(r.actual) !== Number(r.planned)));
  const change = state.customers.filter(c => c.added || c.changed || (c.note || '').trim());
  const ready = counts.pending === 0;

  return `
    <section class="summary-card">
      <div class="summary-row">
        <div class="metric"><span class="num">${counts.done}</span><span class="label">完了</span></div>
        <div class="metric"><span class="num">${counts.absent}</span><span class="label">不在</span></div>
        <div class="metric"><span class="num">${counts.pending}</span><span class="label">未配達</span></div>
      </div>
    </section>

    <div class="check-list">
      ${checkRow('未配達', pending.length, 'pending')}
      ${checkRow('不在', absent.length, 'absent')}
      ${checkRow('回収数の差', recoveryDiff.length, 'recovery')}
      ${checkRow('追加・変更・メモ', change.length, 'change')}
    </div>

    <div style="margin-top:14px" class="${ready ? 'success-box' : 'warning-box'}">
      ${ready ? '未配達はありません。内容を確認して本日の配達を終了できます。' : `未配達が ${counts.pending}件あります。終了前に確認してください。`}
    </div>

    <button class="action-btn action-primary" style="width:100%; margin-top:12px" data-finish-day ${ready ? '' : 'disabled'}>本日の配達を終了</button>
    <button class="reset-btn" data-reset>デモデータを初期化</button>
    <div class="small" style="margin-top:8px">登録内容・配達記録はこの端末内に保存されます。端末間の同期はありません。</div>
  `;
}

function checkRow(label, count, type){
  return `<button class="check-item" data-filter="${type}"><strong>${label}</strong><span class="check-count">${count}</span></button>`;
}

function renderCustomerForm(){
  const c = state.customers.find(x => x.id === editingCustomerId);
  return `<form id="customerForm" class="panel customer-form">
    <label for="customerName">顧客名 <span class="small">必須</span></label>
    <input id="customerName" name="customerName" autocomplete="off" maxlength="80" required value="${escapeHtml(c?.name || '')}" />
    <label for="customerAddress">住所 <span class="small">必須</span></label>
    <textarea id="customerAddress" name="customerAddress" autocomplete="off" maxlength="300" required placeholder="都道府県から番地・建物名まで">${escapeHtml(c?.address || '')}</textarea>
    <label for="customerArea">地区 <span class="small">任意</span></label>
    <input id="customerArea" name="customerArea" autocomplete="off" maxlength="80" value="${escapeHtml(c?.area || '')}" placeholder="例：今市（空欄なら未分類）" />
    <p class="small">この端末内に保存します。ブラウザのデータを削除すると登録内容も消えます。ナビを押すと住所をGoogle Mapsへ渡します。</p>
    <div class="toggle-grid">
      <button type="button" class="action-btn action-secondary" data-cancel-customer>キャンセル</button>
      <button type="submit" class="action-btn action-primary">保存</button>
    </div>
  </form>`;
}

function openCustomerForm(id = null){
  editingCustomerId = id;
  setScreen('customer');
}

function saveCustomerForm(event){
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.customerName.value.trim();
  const address = form.elements.customerAddress.value.trim();
  const area = form.elements.customerArea.value.trim() || '未分類';
  if (!DeliverySecurity.validateCustomer(name, address, area)) { alert('顧客名と住所を入力してください。'); return; }
  const next = clone(state);
  let customer = next.customers.find(c => c.id === editingCustomerId);
  if (editingCustomerId && !customer) { alert('編集する顧客が見つかりません。'); return; }
  if (customer) {
    Object.assign(customer, {name, address, area, customized:true});
  } else {
    const id = 'U-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    customer = {id, name, address, area, items:[], recovery:[], memo:'', status:'pending', added:false, changed:false, note:'', registered:true};
    next.customers.push(customer);
  }
  if (storageBlocked || !DeliverySecurity.validState(next)) { alert('保存するデータの形式を確認してください。'); return; }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
  catch(e) { alert('端末に保存できませんでした。空き容量やブラウザの設定を確認してください。入力はこの画面に残っています。'); return; }
  state = next;
  currentCustomerId = customer.id;
  setScreen('delivery');
}

function wireEvents(){
  document.querySelector('[data-add-customer]')?.addEventListener('click', () => openCustomerForm());
  document.querySelector('[data-edit-customer]')?.addEventListener('click', () => openCustomerForm(currentCustomerId));
  document.getElementById('customerForm')?.addEventListener('submit', saveCustomerForm);
  document.querySelector('[data-cancel-customer]')?.addEventListener('click', () => setScreen(editingCustomerId ? 'delivery' : 'list'));

  document.querySelectorAll('[data-open-customer]').forEach(btn => {
    btn.addEventListener('click', () => { currentCustomerId = btn.dataset.openCustomer; setScreen('delivery'); });
  });
  document.querySelectorAll('[data-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = getCurrentCustomer(); if (!c) return;
      const idx = Number(btn.dataset.recovery);
      c.recovery[idx].actual = Math.max(0, Number(c.recovery[idx].actual || 0) + Number(btn.dataset.step));
      saveState(); render();
    });
  });
  document.querySelectorAll('[data-recovery-input]').forEach(input => {
    input.addEventListener('change', () => {
      const c = getCurrentCustomer(); if (!c) return;
      const idx = Number(input.dataset.recoveryInput);
      c.recovery[idx].actual = Math.max(0, Number(input.value || 0));
      saveState(); render();
    });
  });
  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = getCurrentCustomer(); if (!c) return;
      c[btn.dataset.toggle] = !c[btn.dataset.toggle]; saveState(); render();
    });
  });
  const noteInput = document.getElementById('noteInput');
  if (noteInput) noteInput.addEventListener('input', () => { const c = getCurrentCustomer(); if (c) { c.note = noteInput.value; saveState(); } });

  const mapsBtn = document.querySelector('[data-nav-maps]');
  if (mapsBtn) mapsBtn.addEventListener('click', openMaps);
  const doneBtn = document.querySelector('[data-mark-done]');
  if (doneBtn) doneBtn.addEventListener('click', () => markAndAdvance('done'));
  const absentBtn = document.querySelector('[data-mark-absent]');
  if (absentBtn) absentBtn.addEventListener('click', () => markAndAdvance('absent'));
  const finish = document.querySelector('[data-finish-day]');
  if (finish) finish.addEventListener('click', () => alert('本日の配達チェック完了です。\n（v0.2では記録の書き出しはまだ未実装です）'));
  const reset = document.querySelector('[data-reset]');
  if (reset) reset.addEventListener('click', resetDemo);

  document.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', () => showFiltered(btn.dataset.filter)));
}

function getCurrentCustomer(){ return state.customers.find(c => c.id === currentCustomerId); }
function sumItems(items){ return items.reduce((s,i) => s + Number(i.qty || 0), 0); }

function markAndAdvance(status){
  const c = getCurrentCustomer(); if (!c) return;
  const noteInput = document.getElementById('noteInput');
  if (noteInput) c.note = noteInput.value;
  c.status = status;
  saveState();
  const idx = state.customers.findIndex(x => x.id === c.id);
  const next = state.customers.slice(idx + 1).find(x => x.status === 'pending') || state.customers.find(x => x.status === 'pending');
  if (next) { currentCustomerId = next.id; render(); }
  else { setScreen('check'); }
}

function openMaps(){
  const c = getCurrentCustomer(); if (!c) return;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.address)}&travelmode=driving`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function showFiltered(type){
  let list = [];
  if (type === 'pending') list = state.customers.filter(c => c.status === 'pending');
  if (type === 'absent') list = state.customers.filter(c => c.status === 'absent');
  if (type === 'recovery') list = state.customers.filter(c => c.recovery.some(r => Number(r.actual) !== Number(r.planned)));
  if (type === 'change') list = state.customers.filter(c => c.added || c.changed || (c.note || '').trim());
  if (!list.length) { alert('該当なし'); return; }
  alert(list.map(c => `${c.area} ${c.name}`).join('\n'));
}

function resetDemo(){
  if (!confirm('登録した顧客・編集した住所は残し、未編集のデモデータを初期状態に戻しますか？')) return;
  const retained = state.customers.filter(c => c.registered || c.customized);
  const customers = clone(demoCustomers).map(c => retained.find(x => x.id === c.id) || c);
  customers.push(...retained.filter(c => !customers.some(x => x.id === c.id)));
  const next = { ...state, customers };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
  catch(e) { alert('初期化を保存できませんでした。登録内容は変更していません。'); return; }
  state = next;
  currentCustomerId = state.customers[0].id;
  saveState(); setScreen('list');
}

function escapeHtml(value=''){
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => setScreen(btn.dataset.screen)));
render();



function setupInstallHint(){
  const hint = document.getElementById('installHint');
  const dismiss = document.getElementById('dismissInstallHint');
  if (!hint) return;
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const dismissed = localStorage.getItem('delivery_install_hint_dismissed') === '1';
  if (isIOS && !standalone && !dismissed) hint.hidden = false;
  if (dismiss) dismiss.addEventListener('click', () => {
    hint.hidden = true;
    localStorage.setItem('delivery_install_hint_dismissed', '1');
  });
}
setupInstallHint();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
