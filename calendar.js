'use strict';
let calendarMode='month',calendarDate=calendarToday(),calendarSelected=calendarToday();
function calendarToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function calendarDay(key){if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return NaN;const [y,m,d]=key.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));return date.toISOString().slice(0,10)===key?date.getTime()/86400000:NaN;}
function calendarKey(day){return new Date(day*86400000).toISOString().slice(0,10);}
function calendarWeek(key,base=state.calendar?.aWeekStart||'2026-10-25'){const day=calendarDay(key),anchor=calendarDay(base);return ['A','B','C','D'][((Math.floor((day-anchor)/7)%4)+4)%4];}
function calendarPlans(key){
  const day=new Date(calendarDay(key)*86400000).getUTCDay(),week=calendarWeek(key);
  return (state.routes||[]).filter(r=>r.week===week&&r.weekday===day).map(r=>{
    const customers=state.customers.filter(c=>c.schedule?.routeId===r.id).sort((a,b)=>a.schedule.order-b.schedule.order);
    const towns=[...new Set(customers.map(c=>c.area).filter(a=>a&&a!=='未分類'))];
    return {route:r,customers,label:towns.join('・')||r.name};
  });
}
function renderCalendar(){
  const day=calendarDay(calendarDate),date=new Date(day*86400000),year=date.getUTCFullYear(),month=date.getUTCMonth(),today=calendarToday();
  const weekday=['日','月','火','水','木','金','土'];
  const start=calendarMode==='week'?day-date.getUTCDay():Date.UTC(year,month,1)/86400000-new Date(Date.UTC(year,month,1)).getUTCDay();
  const days=calendarMode==='week'?7:Math.ceil((new Date(Date.UTC(year,month,1)).getUTCDay()+new Date(Date.UTC(year,month+1,0)).getUTCDate())/7)*7;
  const title=calendarMode==='month'?`${year}年${month+1}月`:`${calendarKey(start).slice(5).replace('-','/')}〜${calendarKey(start+6).slice(5).replace('-','/')}`;
  const cells=Array.from({length:days},(_,i)=>{
    const key=calendarKey(start+i),d=new Date((start+i)*86400000),plans=calendarPlans(key),selected=key===calendarSelected;
    return `<button type="button" class="calendar-day ${calendarMode==='month'&&d.getUTCMonth()!==month?'outside':''} ${selected?'selected':''} ${key===today?'today':''}" data-calendar-day="${key}" aria-label="${key} ${calendarWeek(key)}週 ${plans.map(p=>p.label).join('、')||'予定なし'}" aria-pressed="${selected}">
      <span class="calendar-date">${d.getUTCDate()}${calendarMode==='week'?`<small>${weekday[d.getUTCDay()]}曜</small>`:''}<small>${calendarWeek(key)}週</small></span>
      <span class="calendar-events">${plans.slice(0,calendarMode==='month'?3:500).map(p=>`<span class="calendar-event">${escapeHtml(p.label)}${calendarMode==='week'?`<small>${escapeHtml(p.route.name)}・${p.customers.length}件</small>`:''}</span>`).join('')}${plans.length>3&&calendarMode==='month'?`<small>ほか${plans.length-3}ルート</small>`:''}${!plans.length&&calendarMode==='week'?'<small>予定なし</small>':''}</span>
    </button>`;
  }).join('');
  const plans=calendarPlans(calendarSelected);
  return `<section class="calendar-view"><div class="calendar-toolbar"><button data-calendar-shift="-1" aria-label="前の${calendarMode==='month'?'月':'週'}">‹</button><h2>${title}</h2><button data-calendar-shift="1" aria-label="次の${calendarMode==='month'?'月':'週'}">›</button><button id="calendarToday">今日</button></div>
    <div class="calendar-switch"><button data-calendar-mode="month" aria-pressed="${calendarMode==='month'}">月</button><button data-calendar-mode="week" aria-pressed="${calendarMode==='week'}">週</button></div>
    <div class="calendar-${calendarMode}">${calendarMode==='month'?weekday.map(d=>`<div class="calendar-weekday">${d}</div>`).join(''):''}${cells}</div>
    <p class="small">町名は顧客の「地区」から表示します。未分類ならルート名を表示します。祝日も通常予定で表示します。</p>
    <section class="calendar-detail"><h3>${calendarSelected.replaceAll('-','/')}（${calendarWeek(calendarSelected)}週）の配達先</h3>
    ${plans.length?plans.map(p=>`<article><h4>${escapeHtml(p.label)} <small>${escapeHtml(p.route.name)}・${p.customers.length}件</small></h4>${p.customers.length?`<ol>${p.customers.map(c=>`<li value="${c.schedule.order}"><button data-open-customer="${escapeHtml(c.id)}">${escapeHtml(c.name)} <small>${statusLabel(c.status)}</small></button></li>`).join('')}</ol>`:'<p>顧客が未登録のルートです。</p>'}</article>`).join(''):'<p>登録された配達予定はありません。⚙ 設定でルート・週・曜日・顧客を登録してください。</p>'}
    </section></section>`;
}
function renderCalendarSettings(){return `<section class="route-settings calendar-settings"><details><summary>A〜D週カレンダーの基準</summary><p>写真のカレンダーから、2026年10月25日（日）をA週の開始日として使用しています。店舗の周期が違う場合は変更してください。</p><form id="calendarBaseForm"><label>A週が始まる日曜日<input type="date" name="aWeekStart" min="2000-01-01" max="2100-12-31" required value="${escapeHtml(state.calendar?.aWeekStart||'2026-10-25')}" /></label><button type="submit">基準日を保存</button></form><p id="calendarMessage" role="status"></p></details></section>`;}
function wireCalendar(){
  document.querySelectorAll('[data-calendar-mode]').forEach(b=>b.addEventListener('click',()=>{calendarMode=b.dataset.calendarMode;calendarDate=calendarSelected;render();}));
  document.querySelectorAll('[data-calendar-day]').forEach(b=>b.addEventListener('click',()=>{calendarSelected=b.dataset.calendarDay;calendarDate=calendarSelected;render();}));
  document.querySelectorAll('[data-calendar-shift]').forEach(b=>b.addEventListener('click',()=>{
    const n=Number(b.dataset.calendarShift),d=new Date(calendarDay(calendarDate)*86400000);
    calendarDate=calendarMode==='week'?calendarKey(calendarDay(calendarDate)+7*n):calendarKey(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,1)/86400000);calendarSelected=calendarDate;render();
  }));
  document.getElementById('calendarToday')?.addEventListener('click',()=>{calendarDate=calendarSelected=calendarToday();render();});
  document.getElementById('calendarBaseForm')?.addEventListener('submit',async event=>{
    event.preventDefault();if(!vaultUnlocked)return;const base=event.currentTarget.elements.aWeekStart.value,day=calendarDay(base);
    if(!Number.isFinite(day)||new Date(day*86400000).getUTCDay()!==0||base<'2000-01-01'||base>'2100-12-31'){document.getElementById('calendarMessage').textContent='2000〜2100年の日曜日を指定してください。';return;}
    const next=clone(state);next.calendar={aWeekStart:base};
    try{await DeliveryVault.save(next);if(!vaultUnlocked)return;state=next;document.getElementById('calendarMessage').textContent='基準日を暗号化して保存しました。';}
    catch(e){if(vaultUnlocked)document.getElementById('calendarMessage').textContent='保存できませんでした。以前の基準日は残っています。';}
  });
}
