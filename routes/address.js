'use strict';
// Public address reference data only. Matching runs entirely in this browser.
(() => {
 const data=window.DeliveryAddressData;
 const normalize=s=>String(s||'').normalize('NFKC').replace(/[\s　]/g,'').replace(/[‐‑‒–—―−ー－]/g,'-').replace(/大字/g,'');
 const names=(data?.towns||[]).map(t=>({...t,key:normalize(t.name)})).sort((a,b)=>b.key.length-a.key.length);
 function resolve(address){
  let s=normalize(address).replace(/^〒?\d{3}-?\d{4}/,'');
  if(s.startsWith(data.pref))s=s.slice(data.pref.length);
  if(!s.startsWith(data.city))return null;s=s.slice(data.city.length);
  const town=names.find(t=>s.startsWith(t.key)&&(!s.slice(t.key.length)||/^[0-9字-]/.test(s.slice(t.key.length))));if(!town)return null;
  let tail=s.slice(town.key.length).replace(/^(?:字[^0-9]+)?/,'').replace(/丁目|番地の|番地|番|の/g,'-').replace(/号/g,'').replace(/^-+/,'');
  const numbers=tail.match(/^(\d+(?:-\d+){0,2})(?![0-9-])/);
  const key=numbers?.[1].split('-').map(n=>String(Number(n))).join('-');const hit=key?town.addresses[key]:null;
  const point=hit||town.point;if(!point||!Number.isFinite(point[0])||!Number.isFinite(point[1]))return null;
  return {lat:point[1],lng:point[0],address,precision:hit?hit[2]:'town',town:town.name,source:'geolonia-abr',confirmed:false};
 }
 function enrich(value){
  if(!data||!value?.customers)return value;let changed=false;const next=JSON.parse(JSON.stringify(value));
  for(const c of next.customers){const resolved=resolve(c.address);if(!resolved)continue;
   if(!c.area||c.area==='未分類'){c.area=resolved.town;changed=true;}
   if(!c.location||c.location.address!==c.address){c.location=resolved;changed=true;}
  }
  return changed?next:value;
 }
 function label(c){const p=c?.location;if(!p||p.address!==c.address)return '位置未登録';return p.precision==='town'?'町の代表位置・要修正':p.precision==='parcel'?'番地の参照位置・訪問先要確認':p.precision==='building'?'住居表示の参照位置・訪問先要確認':'確認済み位置';}
 window.DeliveryAddress=Object.freeze({resolve,enrich,label});
})();
