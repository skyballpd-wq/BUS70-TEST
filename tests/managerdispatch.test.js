const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function sheet(rows) {
  return {rows, getLastRow(){return this.rows.length;}, getDataRange(){return {getDisplayValues:()=>this.rows.map(r=>r.slice())};},
    appendRow(row){this.rows.push(row);}, getRange(row,col,count){return {setValues:values=>{this.rows[row-1]=values[0].slice();}};}};
}
const drivers=sheet([['driverId','성명','근무조','현재노선','상태'],...Array.from({length:11},(_,i)=>['D'+(i+1),'기사'+(i+1),'B','70','재직'])]);
const vehicles=sheet([['vehicleId','차량번호','현재노선','상태'],...Array.from({length:11},(_,i)=>['V'+(i+1),String(1499+i),'70','운행가능'])]);
const dispatch=sheet([['dispatchId','날짜','근무조','순차','기사ID','차량ID','시간표버전','상태','확정시간','비고']]);
const schedule=sheet([['버전','순차','탕','발차지','발차시간','회차지','회차시간','상태'],
  ...Array.from({length:11},(_,i)=>['WD-TEST-V001',i+1,1,'고강동차고지','05:'+String(5*i).padStart(2,'0'),'송내역','06:00','사용']),
  ...Array.from({length:8},(_,i)=>['HD-TEST-V001',i+1,1,'고강동차고지','06:'+String(5*i).padStart(2,'0'),'송내역','07:00','사용'])]);
const accounts=sheet([['권한','driverId','사용여부'],['소장','D1','Y']]);
const sheets={'기사DB':drivers,'차량DB':vehicles,'배차DB':dispatch,'스케줄':schedule,'계정DB':accounts};
const context={console,JSON,Date,Number,String,Object,Array,PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n]||null})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  normalizeDate_:v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v))?String(v):'',makeHeaderMap_:h=>Object.fromEntries(h.map((v,i)=>[v,i])),
  bus70ScheduleVersionForDate_:date=>date==='2026-09-20'?'HD-TEST-V001':'WD-TEST-V001',writeAudit_:()=>{}};
vm.createContext(context); vm.runInContext(fs.readFileSync('apps-script/ManagerDispatch.gs','utf8'),context);
assert.equal(context.bus70IsManager_('D1'),true); assert.equal(context.bus70IsManager_('D2'),false);
const boot=context.bus70ManagerBootstrap_('2026-09-18'); assert.equal(boot.ok,true); assert.equal(boot.drivers.length,11); assert.equal(boot.departures[1].time,'05:00');
const holiday=context.bus70ManagerBootstrap_('2026-09-20'); assert.equal(Object.keys(holiday.departures).length,8);
const assignments=Array.from({length:11},(_,i)=>({sequence:i+1,driverId:'D'+(i+1),vehicleId:'V'+(i+1)}));
const saved=context.bus70SaveManagerDispatchDay_({date:'2026-09-18',shift:'B',assignments},'D1');
assert.equal(saved.ok,true); assert.equal(dispatch.rows.length,12); assert.equal(dispatch.rows[1][0],'DSP-20260918-B-01');
const holidayAssignments=assignments.slice(0,8);
assert.equal(context.bus70SaveManagerDispatchDay_({date:'2026-09-20',shift:'B',assignments:holidayAssignments},'D1').ok,true);
const duplicate=assignments.map(v=>({...v})); duplicate[1].vehicleId='V1';
assert.equal(context.bus70SaveManagerDispatchDay_({date:'2026-09-18',shift:'B',assignments:duplicate},'D1').error,'DUPLICATE_ASSIGNMENT');
console.log('ManagerDispatch tests passed');
