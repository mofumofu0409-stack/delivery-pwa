'use strict';
(() => {
  const fields=[
    ['number','No.',['no','番号']],['assignee','担当者',['レイ担当者','レｲ担当者','レジ担当者','担当者']],
    ['routeCode','ルートコード',['ルートコード']],['customerCode','顧客コード',['顧客コード','お客様コード']],
    ['name','顧客名（必須）',['顧客','顧客名','氏名','お客様名']],['model','品記号',['品記号','型式','商品コード']],
    ['product','商品',['商品','商品名']],['postalCode','郵便番号',['郵便番号']],['address','住所（必須）',['住所','所在地']],
    ['streetNumber','番地',['番地','(番地)']],['phone','電話番号',['電話番号','電話']],
    ['qty','納品数',['納品数','数量']],['amount','契約税込金額',['契約税込金額','契約税込み金額','契約税込金額（円）','契約税込み金額（円）']],['area','地区（任意）',['地区','エリア']],
    ['paymentMethod','支払方法（任意）',['支払方法','支払い方法','決済方法']],
    ['contractTotal','顧客の契約合計金額（任意）',['契約合計金額','顧客契約金額','交換時請求額']],
    ['confirmationMemo','確認メモ（任意）',['確認メモ','画像照合メモ']]
  ];
  const norm=v=>String(v??'').normalize('NFKC').replace(/[\s.．()（）]/g,'').toLowerCase();
  function mapping(row){const result={};for(const [key,,aliases] of fields)result[key]=row.findIndex(v=>aliases.some(a=>norm(a)===norm(v)));return result;}
  function detect(rows){let best=0,score=-1;for(let i=0;i<Math.min(50,rows.length);i++){const m=mapping(rows[i]),s=Object.values(m).filter(x=>x>=0).length+(m.name>=0&&m.address>=0?20:0);if(s>score){score=s;best=i;}}return best;}
  function numeric(value,label,row){const v=String(value).normalize('NFKC').replace(/[,，¥￥円\s]/g,'');if(!/^\d+(\.\d+)?$/.test(v))throw Error(`${row}行目：${label}を0以上の数値で入力してください。`);const n=Number(v);if(!Number.isFinite(n)||n>1000000)throw Error(`${row}行目：${label}が上限100万を超えています。`);return n;}
  function build(rows,header,map,defaultArea='未分類'){
    if(map.name<0 || map.address<0)throw Error('顧客名と住所の列を選んでください。');
    const used=Object.values(map).filter(x=>x>=0);if(new Set(used).size!==used.length)throw Error('同じ列を複数の項目に割り当てないでください。');
    const groups=new Map(), errors=[];let count=0;const ignoredRows=[];
    for(let index=header+1;index<rows.length;index++){
      const row=rows[index], at=index+1, get=k=>map[k]>=0?String(row[map[k]]??'').trim():'';
      if(!used.some(i=>String(row[i]??'').trim()))continue;
      // Only omit recognizable totals/footers with no customer or product fields.
      const label=get('number').normalize('NFKC');
      const total=/^(?:画像掲載分\s*合計(?:\s*\(.*\))?|総合計|合計|小計)$/.test(label);
      const footer=/^注意[：:]/.test(label);
      const metadataOnly=fields.every(([key])=>['number','amount'].includes(key)||!get(key));
      if(metadataOnly&&(total||(footer&&!get('amount')))){ignoredRows.push(at);continue;}
      try{
        const source=Object.fromEntries(['number','assignee','routeCode','customerCode','postalCode','streetNumber','phone'].map(k=>[k,get(k)]));
        let name=get('name'), address=get('address'), code=source.customerCode;
        const key=code?'code:'+code:'address:'+name+'\n'+address;
        let c=groups.get(key);
        if(c){if(name&&name!==c.name || address&&address!==c.baseAddress)throw Error(`${at}行目：同じ顧客コードに異なる顧客名・住所があります。`);name ||= c.name;address ||= c.baseAddress;}
        if(!name || !address)throw Error(`${at}行目：顧客名・住所が空欄です。合計行は一覧から除いてください。`);
        if(!c){
          const fullAddress=address+(source.streetNumber?' '+source.streetNumber:'');
          c={name,address:fullAddress,baseAddress:address,area:get('area')||defaultArea||'未分類',source,items:[],row:at};
          if(name.length>80||fullAddress.length>300||c.area.length>80||Object.values(source).some(v=>v.length>100))throw Error(`${at}行目：顧客名・住所・コードなどが長すぎます。`);
          groups.set(key,c);
        }else{
          for(const k of Object.keys(source)){
            if(source[k]&&c.source[k]&&source[k]!==c.source[k]&&k!=='number')throw Error(`${at}行目：同じ顧客の${fields.find(f=>f[0]===k)?.[1]}が一致しません。`);
            if(!c.source[k])c.source[k]=source[k];
          }
          if(get('area')&&get('area')!==c.area)throw Error(`${at}行目：同じ顧客の地区が一致しません。`);
        }
        const note=get('confirmationMemo');
        if(note){
          if(note.length>2000)throw Error(`${at}行目：確認メモは2000文字以内にしてください。`);
          const line=(source.number?'No.'+source.number+'：':'')+note;
          const notes=(c.source.confirmationMemo||'').split('\n');
          if(!notes.includes(line))c.source.confirmationMemo=[...notes.filter(Boolean),line].join('\n');
          if(c.source.confirmationMemo.length>20000)throw Error(`${at}行目：同じ顧客の確認メモが長すぎます。`);
        }
        const model=get('model'),product=get('product')||model;
        const rawPayment=get('paymentMethod');
        if(rawPayment){
          const methods={'未設定':'unknown','現金':'cash','銀行振込':'bank','振込':'bank','口座引き落とし':'debit','口座引落':'debit','口座振替':'debit',unknown:'unknown',cash:'cash',bank:'bank',debit:'debit'};
          const method=methods[norm(rawPayment)];
          if(!Object.hasOwn(methods,norm(rawPayment)))throw Error(`${at}行目：支払方法は現金・銀行振込・口座引き落とし・未設定のいずれかにしてください。`);
          if(c.paymentMethod!==undefined&&c.paymentMethod!==method)throw Error(`${at}行目：同じ顧客の支払方法が一致しません。`);
          c.paymentMethod=method;
        }
        const rawTotal=get('contractTotal');
        if(rawTotal){
          const textTotal=rawTotal.normalize('NFKC').replace(/[,，¥￥円\s]/g,'');
          if(!/^\d+$/.test(textTotal)||!Number.isSafeInteger(Number(textTotal))||Number(textTotal)>1000000000)throw Error(`${at}行目：契約合計金額は0〜10億円の整数にしてください。`);
          const total=Number(textTotal);
          if(c.contractAmount!==undefined&&c.contractAmount!==total)throw Error(`${at}行目：同じ顧客の契約合計金額が一致しません。`);
          c.contractAmount=total;
        }
        if(product){
          const qty=numeric(get('qty'),'納品数',at), amount=get('amount');
          if(product.length>200||model.length>100||c.items.length>=200)throw Error(`${at}行目：商品名・品記号・商品数を確認してください。`);
          const item={name:product,qty,model};if(amount!=='')item.contractAmount=numeric(amount,'契約税込金額',at);
          c.items.push(item);
        }else if(get('qty')||get('amount'))throw Error(`${at}行目：数量・金額に対応する商品がありません。`);
        count++;
      }catch(e){errors.push(e.message);}
    }
    if(errors.length)throw Error(errors.slice(0,8).join('\n')+(errors.length>8?`\nほか${errors.length-8}件。修正して再確認してください。`:''));
    if(!groups.size)throw Error('取り込める顧客がありません。見出し行・列を確認してください。');
    if(groups.size>5000)throw Error('顧客数は最大5000件です。');
    return {customers:[...groups.values()].map(({baseAddress,...c})=>({...c,address:baseAddress+(c.source.streetNumber?' '+c.source.streetNumber:'')})),rows:count,ignoredRows};
  }
  function match(existing,c){
    const byCode=c.source.customerCode?existing.filter(x=>x.source?.customerCode===c.source.customerCode):[];
    if(byCode.length>1)throw Error('保存済み顧客コードが重複しています。');
    if(byCode.length)return byCode[0];
    const exact=existing.filter(x=>x.name===c.name&&x.address===c.address);
    if(exact.length>1)throw Error('保存済みの同名・同住所の顧客が複数あります。');
    if(exact[0]?.source?.customerCode && c.source.customerCode && exact[0].source.customerCode!==c.source.customerCode)throw Error('同名・同住所で顧客コードが異なります。顧客一覧を確認してください。');
    return exact[0];
  }
  function merge(state,preview,update=false){
    const next=JSON.parse(JSON.stringify(state)),counts={added:0,updated:0,skipped:0};
    for(const c of preview.customers){
      const old=match(next.customers,c),{row,...data}=c;
      if(old){if(!update){counts.skipped++;continue;}if(old.source?.confirmationMemo&&!data.source.confirmationMemo)data.source={...data.source,confirmationMemo:old.source.confirmationMemo};Object.assign(old,data,{customized:true});counts.updated++;}
      else {next.customers.push({...data,id:'U-'+crypto.randomUUID(),recovery:[],memo:'',status:'pending',added:false,changed:false,note:'',registered:true});counts.added++;}
    }
    if(!window.DeliverySecurity.validState(next))throw Error('登録上限またはデータ形式を確認してください。');
    return {state:next,counts};
  }
  window.DeliveryImport=Object.freeze({fields,mapping,detect,build,match,merge});
})();
