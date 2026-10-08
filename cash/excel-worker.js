'use strict';
importScripts('./xlsx.full.min.js');
let workbook;
function sendSheet(index) {
  const name=workbook.SheetNames[index], sheet=workbook.Sheets[name];
  if(!sheet)throw Error('シートを選択してください。');
  const range=XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
  if(range.e.r>10000 || range.e.c>63)throw Error('1シートは10000行・64列以内にしてください。');
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:'',blankrows:true,range:0});
  let length=0;
  for(const row of rows)for(const cell of row){length+=String(cell).length;if(String(cell).length>20000 || length>10000000)throw Error('セルの文字数が多すぎます。必要な列だけの一覧にしてください。');}
  postMessage({sheets:workbook.SheetNames,index,rows});
}
self.onmessage=event=>{
  try{
    if(event.data.buffer){
      workbook=XLSX.read(event.data.buffer,{type:'array',cellFormula:false,cellHTML:false,bookVBA:false,sheetRows:10002});
      if(!workbook.SheetNames.length || workbook.SheetNames.length>100)throw Error('シート数は1〜100にしてください。');
    }
    sendSheet(event.data.index || 0);
  }catch(e){postMessage({error:'Excelを読み込めませんでした。パスワード付きファイルは解除し、形式・行数・列数を確認してください。'+(e.message?.includes('してください')?' '+e.message:'')});}
};
