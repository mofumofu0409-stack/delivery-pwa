'use strict';
// Baseline input validation. This is not encryption or malware detection.
(() => {
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  function text(value, max) { return typeof value === 'string' && value.length <= max; }
  function quantity(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000;
  }
  function validState(value) {
    if (!record(value) || !Array.isArray(value.customers) || value.customers.length > 5000) return false;
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
        c.recovery.every(r => record(r) && text(r.name, 200) && quantity(r.planned) && quantity(r.actual));
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
