const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function sheet(rows) {
  return {rows, getLastRow(){return this.rows.length;}, getDataRange(){return {getDisplayValues:()=>this.rows.map(r=>r.slice())};},
    appendRow(row){this.rows.push(row);}, getRange(row,col,count){return {setValues:values=>{if(col===1)this.rows[row-1]=values[0].slice();else values[0].forEach((v,i)=>this.rows[row-1][col-1+i]=v);},setValue:value=>{this.rows[row-1][col-1]=value;}};}};
}
const drivers=sheet([['driverId','사원번호','성명','근무조','기사구분','사번구분','기수','현재노선','표시순서','상태','투입일','종료일','TEST','비고'],
  ...Array.from({length:11},(_,i)=>['D'+(i+1),String(600001+i),'기사'+(i+1),'B','노선','','','70',i+1,'재직','','','Y',''])]);
const vehicles=sheet([['vehicleId','차량번호','현재노선','상태'],...Array.from({length:11},(_,i)=>['V'+(i+1),String(1499+i),'70','운행가능'])]);
const dispatch=sheet([['dispatchId','날짜','근무조','순차','기사ID','차량ID','시간표버전','상태','확정시간','비고']]);
const confirmations=sheet([['confirmId','날짜','기사ID','dispatchId','시간표버전','확인시간','캘린더저장','알람설정','마지막동기화','재확인필요']]);
const workChanges=sheet([['changeId','날짜','기사ID','유형','적용순차','적용탕','대체기사ID','시작시간','종료시간','사유','처리자','처리시간']]);
const schedule=sheet([['버전','순차','탕','발차지','발차시간','회차지','회차시간','상태'],
  ...Array.from({length:11},(_,i)=>['WD-TEST-V001',i+1,1,'고강동차고지','05:'+String(5*i).padStart(2,'0'),'송내역','06:00','사용']),
  ...Array.from({length:8},(_,i)=>['HD-TEST-V001',i+1,1,'고강동차고지','06:'+String(5*i).padStart(2,'0'),'송내역','07:00','사용'])]);
const accounts=sheet([['accountId','권한','driverId','로그인이름','로그인사번','사용여부','마지막로그인','비고','비밀번호해시','비밀번호변경시간'],
  ['A1','소장','D1','Major','','Y','','','',''],['A2','마스터','ADM-MASTER-001','Master','','Y','','','',''],
  ['A3','정비소','CTR-CENTER-001','Center','','Y','','','',''],['A4','마스터','DRV-B-TEST-002','','','Y','','','','']]);
const sheets={'기사DB':drivers,'차량DB':vehicles,'배차DB':dispatch,'배차확인DB':confirmations,'스케줄':schedule,'계정DB':accounts,'근무변경DB':workChanges};
const context={console,JSON,Date,Number,String,Object,Array,PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n]||null})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  normalizeDate_:v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v))?String(v):'',makeHeaderMap_:h=>Object.fromEntries(h.map((v,i)=>[v,i])),
  bus70ScheduleVersionForDate_:date=>date==='2026-09-20'?'HD-TEST-V001':'WD-TEST-V001',writeAudit_:()=>{},newId_:prefix=>prefix+'-TEST'};
vm.createContext(context); vm.runInContext(fs.readFileSync('apps-script/ManagerDispatch.gs','utf8'),context);
assert.equal(context.bus70IsManager_('D1'),true); assert.equal(context.bus70IsManager_('D2'),false);
assert.equal(context.bus70RoleFor_('ADM-MASTER-001'),'MASTER');
assert.equal(context.bus70RoleFor_('CTR-CENTER-001'),'CENTER');
assert.equal(context.bus70RoleFor_('DRV-B-TEST-002'),'');
const adminBoot=context.bus70MasterAdminBootstrap_('ADM-MASTER-001');
assert.equal(adminBoot.ok,true); assert.equal(adminBoot.drivers.length,11); assert.equal(adminBoot.accounts.length,2); assert.equal(adminBoot.canManageAccounts,true);
const managerAdminBoot=context.bus70MasterAdminBootstrap_('D1');
assert.equal(managerAdminBoot.ok,true); assert.equal(managerAdminBoot.accounts.length,0); assert.equal(managerAdminBoot.canManageAccounts,false);
const compatibleBoot=context.bus70ManagerAction_({action:'managerAccountList',operation:'masterAdminBootstrap'},'D1');
assert.equal(compatibleBoot.ok,true); assert.equal(compatibleBoot.canManageAccounts,false);
const converted=context.bus70MasterDriverUpsert_({driverId:'D2',empId:'626099',name:'실제기사',shift:'B',driverType:'예비',status:'재직'},'D1');
assert.equal(converted.ok,true); assert.equal(drivers.rows[2][1],'626099'); assert.equal(drivers.rows[2][2],'실제기사');
assert.equal(drivers.rows[2][5],'정규'); assert.equal(drivers.rows[2][12],'N');
assert.equal(context.bus70MasterDriverUpsert_({driverId:'D3',empId:'626099',name:'중복',shift:'A',driverType:'노선',status:'재직'},'ADM-MASTER-001').error,'EMP_ID_DUPLICATE');
const boot=context.bus70ManagerBootstrap_('2026-09-18'); assert.equal(boot.ok,true); assert.equal(boot.drivers.length,21); assert.equal(boot.departures[1].time,'05:00');
assert.equal(boot.drivers.some(v=>v.name==='이재천'),true);
const rowCountAfterSeed=drivers.rows.length; context.bus70ManagerBootstrap_('2026-09-18'); assert.equal(drivers.rows.length,rowCountAfterSeed);
const holiday=context.bus70ManagerBootstrap_('2026-09-20'); assert.equal(Object.keys(holiday.departures).length,8);
const assignments=Array.from({length:11},(_,i)=>({sequence:i+1,driverId:'D'+(i+1),vehicleId:'V'+(i+1)}));
const saved=context.bus70SaveManagerDispatchDay_({date:'2026-09-18',shift:'B',assignments},'D1');
assert.equal(saved.ok,true); assert.equal(dispatch.rows.length,12); assert.equal(dispatch.rows[1][0],'DSP-20260918-B-01');
confirmations.appendRow(['C1','2026-09-18','D1','DSP-20260918-B-01','WD-TEST-V001','2026-09-17 20:00','','','','']);
const replaced=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'workChangeSave',date:'2026-09-18',driverId:'D1',type:'병가',sequence:1,replacementId:'DRV-B-OCR-001',reason:'시험'},'D1');
assert.equal(replaced.ok,true); assert.equal(dispatch.rows[1][4],'DRV-B-OCR-001'); assert.equal(confirmations.rows[1][9],'Y'); assert.equal(workChanges.rows.length,2);
drivers.appendRow(['DRV-A-RESERVE','626777','A조예비','A','예비','','','70',99,'재직','','','N','']);
const wrongShift=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'workChangeSave',date:'2026-09-18',driverId:'D2',type:'휴무',sequence:2,replacementId:'DRV-A-RESERVE',reason:'조 불일치 시험'},'D1');
assert.equal(wrongShift.ok,true); assert.equal(dispatch.rows[2][4],'DRV-A-RESERVE');
const noReason=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'workChangeSave',date:'2026-09-18',driverId:'D3',type:'휴무',sequence:3,replacementId:'DRV-A-RESERVE',reason:''},'D1');
assert.equal(noReason.error,'REPLACEMENT_OVERRIDE_REASON_REQUIRED'); assert.equal(dispatch.rows[3][4],'D3');
const confirmedBoot=context.bus70ManagerBootstrap_('2026-09-18');
assert.equal(confirmedBoot.assignments[0].confirmed,false);
assert.equal(confirmedBoot.assignments[1].confirmed,false);
const holidayAssignments=assignments.slice(0,8);
assert.equal(context.bus70SaveManagerDispatchDay_({date:'2026-09-20',shift:'B',assignments:holidayAssignments},'D1').ok,true);
const duplicate=assignments.map(v=>({...v})); duplicate[1].vehicleId='V1';
assert.equal(context.bus70SaveManagerDispatchDay_({date:'2026-09-18',shift:'B',assignments:duplicate},'D1').error,'DUPLICATE_ASSIGNMENT');
console.log('ManagerDispatch tests passed');
