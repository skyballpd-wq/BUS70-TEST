/* Read-only ledger projection; dependency-free OOXML with inline strings (no formulas). */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.Bus70Ledger=factory();})(typeof window==='object'?window:this,function(){
'use strict';
const headers=['운행일','기사','노선','차량','순차','탕','출발지','출발 예정','출발 실제','회차지','회차 예정','회차 실제','도착지','도착 예정','도착 실제','기록 상태','차고지 복귀지','차고지 복귀 실제'];
const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
function clock(date,value){
 if(!value)return '';
 const raw=String(value),s=raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
 if(s){const h=Number(s[1]),m=Number(s[2]),sec=Number(s[3]||0);if(h>47||m>59||sec>59)return '시각 확인 필요';return (h>=24||h<3||h===3&&m<30?'다음날 ':'')+String(h%24).padStart(2,'0')+':'+s[2]+(s[3]?':'+s[3]:'');}
 if(!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw))return '시각 확인 필요';
 const iso=raw.replace(' ','T'),at=Date.parse(/[Zz]|[+-]\d{2}:?\d{2}$/.test(iso)?iso:iso+'+09:00');if(!Number.isFinite(at))return '시각 확인 필요';
 const kst=new Date(Math.round(at/1000)*1000+9*3600000).toISOString(),day=kst.slice(0,10);
 return (day===date?'':day>date?'다음날 ':day+' ')+kst.slice(11,19);
}
function rows(logs,fallbackName){return logs.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||Number(a.sequence)-Number(b.sequence)||Number(a.trip)-Number(b.trip)).map(v=>{
 const status=v.pendingEvents?.length?'기기 보관 · 서버 저장 미확인':v.actualEnd?(v.deadheadDestination&&v.deadheadDestination!==v.endPlace&&!v.deadheadReturnedAt?'영업종료 · 차고지 복귀 미확인':'도착 기록'):v.actualStart||v.actualTurn?'기록 미완료':'실제 시각 미기록';
 return [v.date,v.driverName||fallbackName||'기사명 확인 필요',v.route||'',v.vehicleId||'',v.sequence,v.trip,v.startPlace||'',clock(v.date,v.plannedStart),clock(v.date,v.actualStart),v.turnPlace||'',clock(v.date,v.plannedTurn),clock(v.date,v.actualTurn),v.endPlace||v.serviceEndPlace||'',clock(v.date,v.plannedEnd),clock(v.date,v.actualEnd),status,v.deadheadDestination||'',clock(v.date,v.deadheadReturnedAt)];
});}
const xml=v=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function zip(files){
 const enc=new TextEncoder(),parts=[],central=[];let offset=0;
 const crc=data=>{let c=0xffffffff;for(const b of data){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
 for(const [path,source] of Object.entries(files)){
  const name=enc.encode(path),data=enc.encode(source),sum=crc(data),local=new Uint8Array(30+name.length),l=new DataView(local.buffer);
  l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,33,true);l.setUint32(14,sum,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,name.length,true);local.set(name,30);
  const entry=new Uint8Array(46+name.length),c=new DataView(entry.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,sum,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);entry.set(name,46);central.push(entry);parts.push(local,data);offset+=local.length+data.length;
 }
 const size=central.reduce((n,v)=>n+v.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
 const out=new Uint8Array(offset+size+22);let pos=0;for(const part of [...parts,...central,end]){out.set(part,pos);pos+=part.length;}return out;
}
function workbook(logs,name){
 const data=[headers,...rows(logs,name)],ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const sheet=data.map((row,r)=>'<row r="'+(r+1)+'" ht="32" customHeight="1">'+row.map((v,c)=>'<c r="'+String.fromCharCode(65+c)+(r+1)+'" t="inlineStr" s="'+(r===0?1:(c===14||c===17)&&v?2:0)+'"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>').join('')+'</row>').join('');
 return zip({
 '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+rel+'/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<workbook xmlns="'+ns+'" xmlns:r="'+rel+'"><sheets><sheet name="운행일지" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+rel+'/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="'+rel+'/styles" Target="styles.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':'<worksheet xmlns="'+ns+'"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="18" width="19" customWidth="1"/></cols><sheetData>'+sheet+'</sheetData><autoFilter ref="A1:R'+data.length+'"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>',
 'xl/styles.xml':'<styleSheet xmlns="'+ns+'"><fonts count="3"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><color rgb="FFB91C1C"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF153D6F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3">'+[0,1,2].map(i=>'<xf numFmtId="0" fontId="'+i+'" fillId="'+(i===1?2:0)+'" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>').join('')+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
 });
}
return {headers,rows,clock,workbook,mime};
});
