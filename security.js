'use strict';
// Baseline input validation. This is not encryption or malware detection.
(() => {
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  function text(value, max) { return typeof value === 'string' && value.length <= max; }
  function quantity(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000;
  }
  function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'2000-01-01'||value>'2100-12-31')return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
  function receipt(value){return record(value)&&text(value.number,100)&&[value.issuedOn,value.nextVisitOn].every(d=>d===''||validDate(d));}
  function recovery(value){return record(value)&&text(value.name,200)&&(value.model===undefined||text(value.model,100))&&quantity(value.planned)&&(value.actual===null||quantity(value.actual));}
  function validState(value) {
    if (!record(value) || !Array.isArray(value.customers) || value.customers.length > 5000) return false;
    if(value.calendar!==undefined){
      const base=value.calendar?.aWeekStart;
      if(!record(value.calendar)||typeof base!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(base)||base<'2000-01-01'||base>'2100-12-31')return false;
      const d=new Date(base+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==base||d.getUTCDay()!==0)return false;
    }
    if(value.dayNotes!==undefined){
      if(!Array.isArray(value.dayNotes)||value.dayNotes.length>3000)return false;
      const dates=new Set();
      for(const n of value.dayNotes){
        if(!record(n)||!validDate(n.date)||dates.has(n.date)||!text(n.place,80)||!text(n.note,2000)||(!n.place.trim()&&!n.note.trim()))return false;
        dates.add(n.date);
      }
    }
    if(value.visitDate!==undefined&&!validDate(value.visitDate))return false;
    if(value.visits!==undefined){
      if(!Array.isArray(value.visits)||value.visits.length>10000)return false;
      const keys=new Set();
      for(const v of value.visits){
        if(!record(v)||!validDate(v.date)||!text(v.customerId,100)||!/^[A-Za-z0-9_-]{1,100}$/.test(v.customerId)||!text(v.name,80)||!text(v.area,80)||!['done','absent'].includes(v.status)||!text(v.note,20000)||!receipt(v.receipt)||!text(v.updatedAt,100)||!Number.isFinite(Date.parse(v.updatedAt)))return false;
        const key=v.date+':'+v.customerId;if(keys.has(key))return false;keys.add(key);
        if(!Array.isArray(v.items)||v.items.length>200||!v.items.every(i=>record(i)&&text(i.name,200)&&text(i.model,100)&&quantity(i.qty)))return false;
        if(!Array.isArray(v.recovery)||v.recovery.length>200||!v.recovery.every(r=>recovery(r)&&text(r.model,100)&&(r.actual===null||Number.isInteger(r.actual))&&(v.status!=='absent'||r.actual===null)))return false;
      }
    }
    const routeIds=new Set();
    if(value.routes!==undefined){
      if(!Array.isArray(value.routes)||value.routes.length>500)return false;
      for(const r of value.routes){
        if(!record(r)||typeof r.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(r.id)||routeIds.has(r.id)||!text(r.name,80)||!r.name.trim()||!['A','B','C','D'].includes(r.week)||!Number.isInteger(r.weekday)||r.weekday<0||r.weekday>6)return false;
        routeIds.add(r.id);
      }
    }
    const routeOrders=new Set();
    const ids = new Set();
    return value.customers.every(c => {
      if (!record(c) || typeof c.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(c.id) || ids.has(c.id)) return false;
      ids.add(c.id);
      if (!text(c.name, 80) || !text(c.address, 300) || !text(c.area, 80) || !text(c.memo, 20000) || !text(c.note, 20000)) return false;
      if (!['pending', 'done', 'absent'].includes(c.status) || typeof c.added !== 'boolean' || typeof c.changed !== 'boolean') return false;
      if(c.receipt!==undefined&&!receipt(c.receipt))return false;
      if(c.recoveryConfirmedDate!==undefined&&!validDate(c.recoveryConfirmedDate))return false;
      if (c.registered !== undefined && typeof c.registered !== 'boolean') return false;
      if (c.customized !== undefined && typeof c.customized !== 'boolean') return false;
      if(c.source!==undefined){
        if(!record(c.source)||!['number','assignee','routeCode','customerCode','postalCode','streetNumber','phone'].every(k=>text(c.source[k],100)))return false;
      }
      if(c.schedule!==undefined){
        const s=c.schedule;
        if(!record(s)||!routeIds.has(s.routeId)||!Number.isInteger(s.order)||s.order<1||s.order>5000)return false;
        const key=s.routeId+':'+s.order;if(routeOrders.has(key))return false;routeOrders.add(key);
      }
      if (!Array.isArray(c.items) || c.items.length > 200 || !Array.isArray(c.recovery) || c.recovery.length > 200) return false;
      return c.items.every(i => record(i) && text(i.name, 200) && quantity(i.qty) && (i.model===undefined||text(i.model,100)) && (i.contractAmount===undefined||quantity(i.contractAmount))) &&
        c.recovery.every(recovery);
    });
  }
  window.DeliverySecurity = Object.freeze({
    validState,
    validateCustomer(name, address, area) {
      return text(name, 80) && name.trim().length > 0 && text(address, 300) && address.trim().length > 0 && text(area, 80);
    },
    parseState(raw) {
      if (typeof raw !== 'string' || raw.length > 10000000) throw new Error('Invalid stored data');
      const value = JSON.parse(raw);
      if (!validState(value)) throw new Error('Invalid stored data');
      return value;
    }
  });
})();
