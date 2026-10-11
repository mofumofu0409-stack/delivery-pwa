'use strict';
// Local-only route models. Coordinates are never geocoded or uploaded here.
function routePosition(c){const p=c?.location;return p&&p.address===c.address&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)?p:null;}
function routeTown(c){return c.area&&c.area!=='未分類'?c.area:(c.address.match(/(?:市|区)([^\d０-９\s]+)/)?.[1]||'未分類');}
function routeBaseCustomers(data,id){return data.customers.filter(c=>c.schedule?.routeId===id).sort((a,b)=>a.schedule.order-b.schedule.order);}
function routeDayCustomers(data,date,id){const day=(data.routeDays||[]).find(d=>d.date===date&&d.routeId===id);return day?day.customerIds.map(cid=>data.customers.find(c=>c.id===cid)).filter(Boolean):routeBaseCustomers(data,id);}
function routeRunCustomers(){const r=state.routeRun;return r&&r.date===activeVisitDate()?routeDayCustomers(state,r.date,r.routeId):null;}
function routeCheckedIds(data,ids){if(!Array.isArray(ids)||!ids.length||ids.length>5000||new Set(ids).size!==ids.length||ids.some(id=>!data.customers.some(c=>c.id===id)))throw Error('顧客を重複なく選択してください。');return ids;}
function routeApplyBase(data,route,ids){
 routeCheckedIds(data,ids);const next=JSON.parse(JSON.stringify(data));next.routes ||= [];
 const index=next.routes.findIndex(r=>r.id===route.id);if(index<0)next.routes.push({...route});else next.routes[index]={...route};
 const order=new Map(ids.map((id,i)=>[id,i+1]));
 for(const c of next.customers){if(order.has(c.id))c.schedule={routeId:route.id,order:order.get(c.id)};else if(c.schedule?.routeId===route.id)delete c.schedule;}
 return next;
}
function routeApplyDay(data,date,routeId,ids){routeCheckedIds(data,ids);if(!data.routes?.some(r=>r.id===routeId))throw Error('基本ルートを先に登録してください。');const next=JSON.parse(JSON.stringify(data));next.routeDays=(next.routeDays||[]).filter(d=>d.date!==date||d.routeId!==routeId);next.routeDays.push({date,routeId,customerIds:[...ids]});return next;}
function routeStartState(data,date,routeId){
 const members=routeDayCustomers(data,date,routeId);routeCheckedIds(data,members.map(c=>c.id));const next=routeApplyDay(data,date,routeId,members.map(c=>c.id));
 if(date!==data.visitDate){
  for(const c of next.customers){const prior=next.visits?.find(v=>v.date===date&&v.customerId===c.id);c.status=prior?.status||'pending';c.added=false;c.changed=false;c.note=prior?.note||'';c.receipt=prior?.receipt||{number:'',issuedOn:'',nextVisitOn:''};delete c.recoveryConfirmedDate;
   for(const r of c.recovery){const model=r.model||((c.items.filter(i=>i.name===r.name).length===1)?c.items.find(i=>i.name===r.name)?.model||'':'');r.actual=prior?.recovery.find(x=>x.name===r.name&&x.model===model)?.actual??null;}
   if(prior?.status==='done'&&prior.recovery.every(r=>r.actual!==null))c.recoveryConfirmedDate=date;
  }
 }
 next.visitDate=date;next.routeRun={date,routeId};return next;
}
function routeNextCustomer(data,run,currentId){const queue=routeDayCustomers(data,run.date,run.routeId),at=queue.findIndex(c=>c.id===currentId);return [...queue.slice(at+1),...queue.slice(0,at+1)].find(c=>c.status==='pending');}
function routeStrokeHits(points,a,b,radius=20){
 const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
 return points.map(p=>{const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;return {...p,t,d:Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)};}).filter(p=>p.d<=radius).sort((p,q)=>p.t-q.t||p.d-q.d);
}
window.DeliveryRouteMath=Object.freeze({position:routePosition,town:routeTown,base:routeBaseCustomers,day:routeDayCustomers,applyBase:routeApplyBase,applyDay:routeApplyDay,start:routeStartState,next:routeNextCustomer,hits:routeStrokeHits});
