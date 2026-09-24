const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function sheet(rows) {
  return {rows, getLastRow(){return this.rows.length;}, getDataRange(){return {getDisplayValues:()=>this.rows.map(r=>r.slice())};},
    appendRow(row){this.rows.push(row);}, getRange(row,col,count){return {setValues:values=>{this.rows[row-1]=values[0].slice();}};}};
}
const drivers=sheet([['driverId','사원번호','성명','근무조','기사구분','사번구분','기수','현재노선','표시순서','상태','투입일','종료일','TEST','비고'],
  ...Array.from({length:11},(_,i)=>['D'+(i+1),String(600001+i),'기사'+(i+1),'B','노선','','','70',i+1,'재직','','','Y',''])]);
const vehicles=sheet([['vehicleId','차량번호','현재노선','상태'],...Array.from({length:11},(_,i)=>['V'+(i+1),String(1499+i),'70','운행가능'])]);
const dispatch=sheet([['dispatchId','날짜','근무조','순차','기사ID','차량ID','시간표버전','상태','확정시간','비고']]);
const confirmations=sheet([['confirmId','날짜','기사ID','dispatchId','시간표버전','확인시간','캘린더저장','알람설정','마지막동기화','재확인필요']]);
const schedule=sheet([['버전','순차','탕','발차지','발차시간','회차지','회차시간','상태'],
  ...Array.from({length:11},(_,i)=>['WD-TEST-V001',i+1,1,'고강동차고지','05:'+String(5*i).padStart(2,'0'),'송내역','06:00','사용']),
  ...Array.from({length:8},(_,i)=>['HD-TEST-V001',i+1,1,'고강동차고지','06:'+String(5*i).padStart(2,'0'),'송내역','07:00','사용'])]);
const accounts=sheet([['권한','driverId','사용여부'],['소장','D1','Y'],['마스터','ADM-MASTER-001','Y'],['정비소','CTR-CENTER-001','Y'],['마스터','DRV-B-TEST-002','Y']]);
const sheets={'기사DB':drivers,'차량DB':vehicles,'배차DB':dispatch,'배차확인DB':confirmations,'스케줄':schedule,'계정DB':accounts};
const context={console,JSON,Date,Number,String,Object,Array,PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n]||null})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  normalizeDate_:v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v))?String(v):'',makeHeaderMap_:h=>Object.fromEntries(h.map((v,i)=>[v,i])),
  bus70ScheduleVersionForDate_:date=>date==='2026-09-20'?'HD-TEST-V001':'WD-TEST-V001',writeAudit_:()=>{}};
vm.createContext(context); vm.runInContext(fs.readFileSync('apps-script/ManagerDispatch.gs','utf8'),context);
assert.equal(context.bus70IsManager_('D1'),true); assert.equal(context.bus70IsManager_('D2'),false);
assert.equal(context.bus70RoleFor_('ADM-MASTER-001'),'MASTER');
assert.equal(context.bus70RoleFor_('CTR-CENTER-001'),'CENTER');
assert.equal(context.bus70RoleFor_('DRV-B-TEST-002'),'');
const boot=context.bus70ManagerBootstrap_('2026-09-18'); assert.equal(boot.ok,true); assert.equal(boot.drivers.length,21); assert.equal(boot.departures[1].time,'05:00');
assert.equal(boot.drivers.some(v=>v.name==='이재천'),true);
const rowCountAfterSeed=drivers.rows.length; context.bus70ManagerBootstrap_('2026-09-18'); assert.equal(drivers.rows.length,rowCountAfterSeed);
const holiday=context.bus70ManagerBootstrap_('2026-09-20'); assert.equal(Object.keys(holiday.departures).length,8);
const assignments=Array.from({length:11},(_,i)=>({sequence:i+1,driverId:'D'+(i+1),vehicleId:'V'+(i+1)}));
const saved=context.bus70SaveManagerDispatchDay_({date:'2026-09-18',shift:'B',assignments},'D1');
assert.equal(saved.ok,true); assert.equal(dispatch.rows.length,12); assert.equal(dispatch.rows[1][0],'DSP-20260918-B-01');
confirmations.appendRow(['C1','2026-09-18','D1','DSP-20260918-B-01','WD-TEST-V001','2026-09-17 20:00','','','','']);
const confirmedBoot=context.bus70ManagerBootstrap_('2026-09-18');
assert.equal(confirmedBoot.assignments[0].confirmed,true);
assert.equal(confirmedBoot.assignments[1].confirmed,false);
const holidayAssignments=assignments.slice(0,8);
assert.equal(context.bus70SaveManagerDispatchDay_({date:'2026-09-20',shift:'B',assignments:holidayAssignments},'D1').ok,true);
const duplicate=assignments.map(v=>({...v})); duplicate[1].vehicleId='V1';
assert.equal(context.bus70SaveManagerDispatchDay_({date:'2026-09-18',shift:'B',assignments:duplicate},'D1').error,'DUPLICATE_ASSIGNMENT');
console.log('ManagerDispatch tests passed');
