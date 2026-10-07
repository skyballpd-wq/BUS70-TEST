const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const privateFixture = require('./private-route-fixture');

function sheet(rows) {
  return {rows, getLastRow(){return this.rows.length;}, getDataRange(){return {getDisplayValues:()=>this.rows.map(r=>r.slice())};},
    appendRow(row){this.rows.push(row);}, getRange(row,col,count){return {setValues:values=>{if(col===1)this.rows[row-1]=values[0].slice();else values[0].forEach((v,i)=>this.rows[row-1][col-1+i]=v);},setValue:value=>{this.rows[row-1][col-1]=value;}};}};
}
const drivers=sheet([['driverId','사원번호','성명','근무조','기사구분','사번구분','기수','현재노선','표시순서','상태','투입일','종료일','TEST','비고'],
  ...Array.from({length:11},(_,i)=>['D'+(i+1),String(690001+i),'가상기사'+(i+1),'B','노선','','','70',i+1,'재직','','','Y','']),
  ...[
    ['990101','가상휴직기사'],['990102','가상기사02'],['990103','가상기사03'],['990104','가상기사04'],
    ['990105','가상기사05'],['990106','가상기사06'],['990107','가상기사07'],['990108','가상기사08'],
    ['990109','가상전출기사'],['990110','가상퇴직기사'],['990111','가상대체기사'],['990112','가상전환기사']
  ].map((v,i)=>['DRV-B-OCR-'+String(i+1).padStart(3,'0'),v[0],v[1],'B','노선','임시','','70',900+i,'재직','','','Y','검증 전용 임시기사']),
  ['ADM-MASTER-001','','가상마스터계정','','마스터','','','',999,'재직','','','Y',''],
  ['MGR-MAJOR-001','','가상소장계정','','관리','','','',999,'재직','','','Y',''],
  ['CTR-CENTER-001','','가상정비계정','','정비','','','',999,'재직','','','Y','']]);
const vehicles=sheet([['vehicleId','차량번호','차량구분','상태','현재노선','기본기사ID','표시순서','비고'],...Array.from({length:11},(_,i)=>['V'+(i+1),String(9001+i),'일반','운행가능','70','',i+1,''])]);
const dispatch=sheet([['dispatchId','날짜','근무조','순차','기사ID','차량ID','시간표버전','상태','확정시간','비고']]);
const confirmations=sheet([['confirmId','날짜','기사ID','dispatchId','시간표버전','확인시간','캘린더저장','알람설정','마지막동기화','재확인필요']]);
const workChanges=sheet([['changeId','날짜','기사ID','유형','적용순차','적용탕','대체기사ID','시작시간','종료시간','사유','처리자','처리시간','변경전노선','변경노선','변경근무조','새사원번호','변경기사구분'],
  ['WORK-SYNTHETIC-SICK','2026-07-01','DRV-B-OCR-001','병가','','','','','','합성 장기휴무 사례','SYSTEM','2026-07-01 00:00','','','','',''],
  ['WORK-SYNTHETIC-TRANSFER-1','2026-10-01','DRV-B-OCR-012','노선이동','','','','','','가상 노선 이동 및 정규직 전환','SYSTEM','2026-10-01 00:00','70','5','B','499901','노선'],
  ['WORK-SYNTHETIC-TRANSFER-2','2026-10-01','DRV-B-OCR-009','노선이동','','','','','','가상 노선 이동','SYSTEM','2026-10-01 00:00','70','6','B','','노선']]);
const incidents=sheet([['incidentId','접수시간','날짜','기사ID','차량ID','순차','탕','유형','위도','경도','내용','사진링크','상태','처리자','종결시간','비고']]);
const maintenance=sheet([['maintId','incidentId','요청시간','차량ID','기사ID','요청내용','현재상태','입고시간','출고시간','예비차량ID','정비결과','비고','정비완료일','운행가능일']]);
const maintenanceHistory=sheet([['historyId','maintId','처리시간','상태','처리자','내용','예비차량ID','비고']]);
const adjustments=sheet([['gapId','날짜','순차','탕','기존시간','조정시간','기존간격','지시간격','사유','적용시작','적용종료','처리자','처리시간']]);
const schedule=sheet([['버전','순차','탕','발차지','발차시간','회차지','회차시간','상태'],
  ...Array.from({length:11},(_,i)=>['WD-TEST-V001',i+1,1,'고강동차고지','05:'+String(5*i).padStart(2,'0'),'송내역','06:00','사용']),
  ...Array.from({length:8},(_,i)=>['HD-TEST-V001',i+1,1,'고강동차고지','06:'+String(5*i).padStart(2,'0'),'송내역','07:00','사용'])]);
const accounts=sheet([['accountId','권한','driverId','로그인이름','로그인사번','사용여부','마지막로그인','비고','비밀번호해시','비밀번호변경시간'],
  ['A1','소장','D1','가상소장','','Y','','','',''],['A2','마스터','ADM-MASTER-001','가상마스터계정','','Y','','','',''],
  ['A3','정비소','CTR-CENTER-001','가상정비계정','','Y','','','',''],['A4','마스터','DRV-B-TEST-002','','','Y','','','','']]);
const sheets={'기사DB':drivers,'차량DB':vehicles,'배차DB':dispatch,'배차확인DB':confirmations,'스케줄':schedule,'계정DB':accounts,'근무변경DB':workChanges,
  '사건DB':incidents,'정비DB':maintenance,'정비이력DB':maintenanceHistory,'배차간격조정DB':adjustments};
let idCounter=0;
const context={console,JSON,Date,Number,String,Object,Array,BUS70_PRIVATE_ROUTE_DATA_:privateFixture,Utilities:{formatDate:d=>d.toISOString().slice(0,10)},PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n]||null})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  normalizeDate_:v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v))?String(v):'',makeHeaderMap_:h=>Object.fromEntries(h.map((v,i)=>[v,i])),
  bus70ScheduleVersionForDate_:date=>date==='2026-09-20'?'HD-TEST-V001':'WD-TEST-V001',writeAudit_:()=>{},newId_:prefix=>prefix+'-TEST-'+(++idCounter)};
vm.createContext(context); vm.runInContext(fs.readFileSync('apps-script/PrivateRouteStore.gs','utf8'),context); vm.runInContext(fs.readFileSync('apps-script/Route5Schedule.gs','utf8'),context); vm.runInContext(fs.readFileSync('apps-script/ManagerDispatch.gs','utf8'),context);
assert.equal(context.bus70OperatingShiftForDate_('2099-01-08'),'B');
assert.equal(context.bus70OperatingShiftForDate_('2099-01-09'),'A');
const privateConfig=privateFixture.config; delete privateFixture.config;
assert.equal(context.bus70ManagerBootstrap_('2099-01-08').error,'PRIVATE_CONFIG_NOT_CONFIGURED');
privateFixture.config=privateConfig;
assert.equal(context.bus70IsManager_('D1'),true); assert.equal(context.bus70IsManager_('D2'),false);
assert.equal(context.bus70RoleFor_('ADM-MASTER-001'),'MASTER');
assert.equal(context.bus70RoleFor_('CTR-CENTER-001'),'CENTER');
assert.equal(context.bus70RoleFor_('DRV-B-TEST-002'),'');
const adminBoot=context.bus70MasterAdminBootstrap_('ADM-MASTER-001');
assert.equal(adminBoot.ok,true); assert.equal(adminBoot.drivers.length,23); assert.equal(adminBoot.accounts.length,2); assert.equal(adminBoot.canManageAccounts,true);
const managerAdminBoot=context.bus70MasterAdminBootstrap_('D1');
assert.equal(managerAdminBoot.ok,true); assert.equal(managerAdminBoot.accounts.length,0); assert.equal(managerAdminBoot.canManageAccounts,false);
const compatibleBoot=context.bus70ManagerAction_({action:'managerAccountList',operation:'masterAdminBootstrap'},'D1');
assert.equal(compatibleBoot.ok,true); assert.equal(compatibleBoot.canManageAccounts,false);
const converted=context.bus70MasterDriverUpsert_({driverId:'D2',empId:'699901',name:'가상변환기사',shift:'B',driverType:'예비',status:'재직'},'D1');
assert.equal(converted.ok,true); assert.equal(drivers.rows[2][1],'699901'); assert.equal(drivers.rows[2][2],'가상변환기사');
assert.equal(drivers.rows[2][5],'정규'); assert.equal(drivers.rows[2][12],'N');
assert.equal(context.bus70MasterDriverUpsert_({driverId:'D3',empId:'699901',name:'가상중복',shift:'A',driverType:'노선',status:'재직'},'ADM-MASTER-001').error,'EMP_ID_DUPLICATE');
const newDriver=context.bus70MasterDriverUpsert_({empId:'699902',name:'가상신규예비',shift:'A',route:'88',driverType:'예비',status:'재직'},'D1');
assert.equal(newDriver.ok,true); assert.equal(drivers.rows[drivers.rows.length-1][2],'가상신규예비'); assert.equal(drivers.rows[drivers.rows.length-1][4],'예비');
assert.equal(context.bus70MasterDriverUpsert_({empId:'699902',name:'가상중복신규',shift:'A',route:'70',driverType:'노선',status:'재직'},'D1').error,'EMP_ID_DUPLICATE');
const beforeSickLeave=context.bus70ManagerBootstrap_('2026-06-30'); assert.equal(beforeSickLeave.drivers.some(v=>v.name==='가상휴직기사'),true);
const boot=context.bus70ManagerBootstrap_('2026-09-18'); assert.equal(boot.ok,true); assert.equal(boot.drivers.length,23); assert.equal(boot.departures[1].time,'05:00');
assert.equal(boot.drivers.some(v=>v.name==='가상휴직기사'),false);
assert.equal(boot.unavailableNames.includes('가상휴직기사'),true);
assert.equal(context.bus70ManagerBootstrap_('2026-10-01').drivers.some(v=>v.name==='가상휴직기사'),false);
assert.equal(boot.drivers.some(v=>['가상마스터계정','가상소장계정','가상정비계정'].includes(v.name)),false);
const leaveNames=['가상전환기사','가상기사03','가상기사08','가상전출기사'];
leaveNames.forEach(name=>{const d=context.bus70MasterAdminBootstrap_('D1').drivers.find(v=>v.name===name);assert.ok(d);assert.equal(context.bus70WorkChangeSave_({date:'2026-09-24',driverId:d.driverId,type:'휴무',reason:'배차 확정 전 사전 휴무 승인'},'D1').ok,true);});
const preplanned=context.bus70ManagerBootstrap_('2026-09-24');
leaveNames.forEach(name=>assert.equal(preplanned.drivers.some(v=>v.name===name),false));
assert.equal(Object.keys(preplanned.unavailableDrivers).length,5);
assert.equal(preplanned.unavailableNames.length,5);
drivers.appendRow(['DRV-DUPLICATE-LEAVE','999999','가상전환기사','B','노선','','','70',998,'재직','','','Y','중복 ID 검증']);
assert.equal(context.bus70ManagerBootstrap_('2026-09-24').drivers.some(v=>v.name==='가상전환기사'),false);
const rowCountAfterSeed=drivers.rows.length; context.bus70ManagerBootstrap_('2026-09-18'); assert.equal(drivers.rows.length,rowCountAfterSeed);
const holiday=context.bus70ManagerBootstrap_('2026-09-20'); assert.equal(Object.keys(holiday.departures).length,8);
const assignments=Array.from({length:11},(_,i)=>({sequence:i+1,driverId:'D'+(i+1),vehicleId:'V'+(i+1)}));
const saved=context.bus70SaveManagerDispatchDay_({date:'2026-09-18',shift:'B',assignments},'D1');
assert.equal(saved.ok,true); assert.equal(dispatch.rows.length,12); assert.equal(dispatch.rows[1][0],'DSP-20260918-B-01');
confirmations.appendRow(['C1','2026-09-18','D1','DSP-20260918-B-01','WD-TEST-V001','2026-09-17 20:00','','','','']);
const adjusted=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'scheduleAdjustmentSave',date:'2026-09-18',sequence:1,trip:2,before:'07:20',after:'07:35',reason:'차량 고장'},'D1');
assert.equal(adjusted.ok,true); assert.equal(adjustments.rows.length,2); assert.equal(confirmations.rows[1][9],'Y'); confirmations.rows[1][9]='N';
const route5Adjusted=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'scheduleAdjustmentSave',route:'5',date:'2099-01-08',sequence:25,trip:1,phase:'발차',before:'05:40',after:'05:45',reason:'합성 시간 조정',announcementChannel:'시험채널',sourceEvidence:'SYNTHETIC FIXTURE'},'D1');
assert.equal(route5Adjusted.ok,true);assert.equal(adjustments.rows.length,3);
const adjustmentHeaders=Object.fromEntries(adjustments.rows[0].map((v,i)=>[v,i])),route5Adjustment=adjustments.rows[2];
assert.equal(route5Adjustment[adjustmentHeaders['노선']],'5');assert.equal(route5Adjustment[adjustmentHeaders['시간구분']],'발차');assert.equal(route5Adjustment[adjustmentHeaders['공지상태']],'확정');assert.equal(route5Adjustment[adjustmentHeaders['공지채널']],'시험채널');assert.equal(route5Adjustment[adjustmentHeaders['원본근거']],'SYNTHETIC FIXTURE');
const workChangeCountBeforeReplace=workChanges.rows.length;
const replaced=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'workChangeSave',date:'2026-09-18',driverId:'D1',type:'병가',sequence:1,replacementId:'DRV-B-OCR-002',reason:'시험'},'D1');
assert.equal(replaced.ok,true); assert.equal(dispatch.rows[1][4],'DRV-B-OCR-002'); assert.equal(confirmations.rows[1][9],'Y'); assert.equal(workChanges.rows.length,workChangeCountBeforeReplace+1);
drivers.appendRow(['DRV-A-RESERVE','699903','가상A조예비','A','예비','','','70',99,'재직','','','N','']);
const wrongShift=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'workChangeSave',date:'2026-09-18',driverId:'D2',type:'휴무',sequence:2,replacementId:'DRV-A-RESERVE',reason:'조 불일치 시험'},'D1');
assert.equal(wrongShift.ok,true); assert.equal(dispatch.rows[2][4],'DRV-A-RESERVE');
const standbyDriver=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'masterDriverUpsert',empId:'990001',name:'검증예비기사',shift:'예비',route:'70',driverType:'예비',status:'재직'},'D1');
assert.equal(standbyDriver.ok,true); assert.equal(drivers.rows[drivers.rows.length-1][3],'예비');
const noReason=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'workChangeSave',date:'2026-09-18',driverId:'D3',type:'휴무',sequence:3,replacementId:'DRV-A-RESERVE',reason:''},'D1');
assert.equal(noReason.error,'REPLACEMENT_OVERRIDE_REASON_REQUIRED'); assert.equal(dispatch.rows[3][4],'D3');
const currentAssignments=assignments.map(v=>({...v})); currentAssignments[0].driverId='DRV-B-OCR-002'; currentAssignments[1].driverId='DRV-A-RESERVE';
assert.equal(context.bus70SaveManagerDispatchDay_({date:'2026-09-18',shift:'B',assignments:currentAssignments},'D1').ok,true);
assert.equal(dispatch.rows[2][4],'DRV-A-RESERVE');
const confirmedBoot=context.bus70ManagerBootstrap_('2026-09-18');
assert.equal(confirmedBoot.assignments[0].confirmed,false);
assert.equal(confirmedBoot.assignments[1].confirmed,false);
assert.equal(context.bus70WorkChangeSave_({date:'2026-09-19',driverId:'D1',type:'복귀',reason:'병가 후 복귀'},'D1').ok,true);
const holidayAssignments=assignments.slice(0,8);
assert.equal(context.bus70SaveManagerDispatchDay_({date:'2026-09-20',shift:'B',assignments:holidayAssignments},'D1').ok,true);
const duplicate=currentAssignments.map(v=>({...v})); duplicate[1].vehicleId='V1';
assert.equal(context.bus70SaveManagerDispatchDay_({date:'2026-09-18',shift:'B',assignments:duplicate},'D1').error,'DUPLICATE_ASSIGNMENT');
const reserveSaved=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'reserveVehicleUpsert',vehicleNo:'9901',route:'70',status:'운행가능',note:'시험 예비차'},'D1');
assert.equal(reserveSaved.ok,true); const reserveId=vehicles.rows[vehicles.rows.length-1][0]; assert.equal(vehicles.rows[vehicles.rows.length-1][2],'예비');
const normalSaved=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'reserveVehicleUpsert',vehicleNo:'9902',vehicleType:'일반',route:'70',status:'운행가능',note:'신규 일반차'},'D1');
assert.equal(normalSaved.ok,true); const normalId=normalSaved.vehicleId; assert.equal(vehicles.rows[vehicles.rows.length-1][2],'일반');
assert.equal(context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'reserveVehicleUpsert',vehicleNo:'9902',vehicleType:'예비',route:'70',status:'운행가능'},'D1').error,'VEHICLE_NO_DUPLICATE');
const normalEdited=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'reserveVehicleUpsert',vehicleId:normalId,vehicleNo:'9902',vehicleType:'예비',route:'88',status:'정비중',note:'수정 시험'},'D1');
assert.equal(normalEdited.ok,true); assert.equal(vehicles.rows[vehicles.rows.length-1][2],'예비'); assert.equal(vehicles.rows[vehicles.rows.length-1][4],'88');
const vehicleIncident=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'vehicleIncidentSave',date:'2026-09-20',sequence:1,vehicleId:'V1',reserveVehicleId:reserveId,type:'고장',content:'시동 불량'},'D1');
assert.equal(vehicleIncident.ok,true); assert.equal(incidents.rows.length,2); assert.equal(maintenance.rows.length,2); assert.equal(vehicles.rows[1][3],'정비중');
assert.equal(dispatch.rows.find(r=>r[1]==='2026-09-20'&&Number(r[3])===1)[5],reserveId);
const operationBoot=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'operationBootstrap'},'CTR-CENTER-001');
assert.equal(operationBoot.ok,true); assert.equal(operationBoot.incidents.length,1);
const originalStatus=operationBoot.vehicles.find(v=>v.id==='V1'), reserveStatus=operationBoot.vehicles.find(v=>v.id===reserveId);
assert.equal(originalStatus.status,'정비중'); assert.equal(originalStatus.lastChangeReason,'고장 · 시동 불량');
assert.equal(reserveStatus.assignment.date,'2026-09-20'); assert.equal(reserveStatus.assignment.sequence,1);
assert.equal(reserveStatus.lastChangeReason,'예비차 투입 · 시동 불량');
const maintId=maintenance.rows[1][0];
assert.equal(context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'maintenanceUpdate',maintId,status:'정비중'},'D1').error,'CENTER_REQUIRED');
assert.equal(context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'maintenanceUpdate',maintId,status:'완료',result:'',completedDate:'2026-09-20',availableDate:'2026-09-21'},'CTR-CENTER-001').error,'MAINTENANCE_RESULT_REQUIRED');
assert.equal(context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'maintenanceUpdate',maintId,status:'완료',result:'배터리 교체',completedDate:'2026-09-21',availableDate:'2026-09-20'},'CTR-CENTER-001').error,'MAINTENANCE_DATES_REQUIRED');
const completed=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'maintenanceUpdate',maintId,status:'완료',result:'배터리 교체',note:'출고',completedDate:'2026-09-20',availableDate:'2026-09-21'},'CTR-CENTER-001');
assert.equal(completed.ok,true); assert.equal(maintenance.rows[1][6],'완료'); assert.equal(vehicles.rows[1][3],'운행가능'); assert.equal(maintenanceHistory.rows.length,2);
const completedBoot=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'operationBootstrap'},'D1');
assert.equal(completedBoot.vehicles.find(v=>v.id==='V1').status,'운행가능');
assert.equal(completedBoot.vehicles.find(v=>v.id==='V1').lastChangeReason,'정비 완료 · 배터리 교체 · 2026-09-21부터 운행 가능');
assert.equal(completedBoot.incidents.find(v=>v.vehicleId==='V1').handlerRole,'CENTER');
assert.equal(context.bus70ManagerBootstrap_('2026-09-20').vehicles.some(v=>v.id==='V1'),false);
assert.equal(context.bus70ManagerBootstrap_('2026-09-21').vehicles.some(v=>v.id==='V1'),true);
const driverRequest=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'vehicleIncidentSave',date:'2026-09-20',vehicleId:'V2',type:'이상 증상',content:'운행 후 점검 요청'},'D2');
assert.equal(driverRequest.ok,true);assert.equal(vehicles.rows[2][3],'운행가능');
assert.equal(context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'vehicleIncidentSave',date:'2026-09-20',vehicleId:'V2',type:'이상 증상',content:'중복 요청'},'D2').error,'OPEN_MAINTENANCE_EXISTS');
const driverMaintId=maintenance.rows[maintenance.rows.length-1][0];
assert.equal(context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'maintenanceUpdate',maintId:driverMaintId,status:'접수'},'CTR-CENTER-001').ok,true);
assert.equal(vehicles.rows[2][3],'운행가능');
const driverOperation=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'operationBootstrap'},'D2');
assert.equal(driverOperation.ok,true);assert.equal(driverOperation.incidents.every(v=>v.driverId==='D2'||v.vehicleId==='V2'),true);
const centerRequest=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'vehicleIncidentSave',date:'2026-09-20',vehicleId:'V3',type:'정기점검',content:'정기점검 입고 요청'},'CTR-CENTER-001');
assert.equal(centerRequest.ok,true);
const masterRequest=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'vehicleIncidentSave',date:'2026-09-20',vehicleId:'V4',type:'이상 증상',content:'마스터 점검 요청'},'ADM-MASTER-001');
assert.equal(masterRequest.ok,true);
const sharedOperation=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'operationBootstrap'},'D1');
const centerIncident=sharedOperation.incidents.find(v=>v.vehicleId==='V3');
assert.equal(centerIncident.requesterRole,'CENTER');assert.equal(centerIncident.requesterName,'가상정비계정');
assert.equal(context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'vehicleIncidentSave',date:'2026-09-20',vehicleId:'V5',type:'이상 증상',content:'타 차량 요청'},'D2').error,'DRIVER_VEHICLE_MISMATCH');
const predicted=context.bus70ManagerBootstrap_('2026-09-22').predictions.B;
assert.equal(predicted.sourceDate,'2026-09-18');assert.equal(predicted.offset,4);
assert.equal(predicted.assignments.find(v=>v.sequence===5).driverId,'DRV-B-OCR-002');
const afterTransfer=context.bus70ManagerBootstrap_('2099-02-02');
assert.equal(afterTransfer.drivers.find(v=>v.name==='가상전환기사').route,'5');
assert.equal(afterTransfer.drivers.find(v=>v.name==='가상전출기사').route,'6');
const wcHeaders=Object.fromEntries(workChanges.rows[0].map((v,i)=>[v,i]));
const parkTransfer=workChanges.rows.find(r=>r[wcHeaders['유형']]==='노선이동'&&r[wcHeaders['기사ID']]==='DRV-B-OCR-012');
assert.equal(parkTransfer[wcHeaders['새사원번호']],'499901');assert.equal(parkTransfer[wcHeaders['변경기사구분']],'노선');
const movedPrediction=context.bus70PredictManagerAssignments_(dispatch,'2026-09-22',11,[{id:'D1',route:'16'}],Array.from({length:11},(_,i)=>({id:'V'+(i+1)})));
assert.equal(movedPrediction.B.assignments.some(v=>v.driverId==='D1'),false);
const transferSaved=context.bus70WorkChangeSave_({date:'2026-10-10',driverId:'D3',type:'노선이동',newRoute:'23',newShift:'A',reason:'양성 종료 정규 노선 이동'},'D1');
assert.equal(transferSaved.ok,true);
assert.equal(context.bus70ManagerBootstrap_('2026-10-10').drivers.find(v=>v.id==='D3').route,'23');
assert.equal(context.bus70WorkChangeSave_({date:'2026-10-11',driverId:'D4',type:'노선이동',newRoute:'16',newShift:'A',newEmpId:'699999'},'D1').error,'REGULAR_EMP_ID_REQUIRED');
const retired=context.bus70WorkChangeSave_({date:'2026-10-01',driverId:'D2',type:'퇴직',reason:'타 회사 이직'},'D1');
assert.equal(retired.ok,true); assert.equal(drivers.rows[2][9],'퇴직'); assert.equal(drivers.rows[2][11],'2026-10-01');
assert.equal(context.bus70ManagerBootstrap_('2099-02-02').drivers.some(v=>v.id==='D2'),false);
assert.equal(context.bus70WorkChangeSave_({date:'2026-10-03',driverId:'D3',type:'재입사',rehireEmpId:'699904',rehireShift:'B',rehireRoute:'70'},'D1').error,'REHIRE_STATE_MISMATCH');
const rehired=context.bus70WorkChangeSave_({date:'2026-10-05',driverId:'D2',type:'재입사',rehireEmpId:'699905',rehireShift:'A',rehireRoute:'70',reason:'합성 재입사 사례'},'D1');
assert.equal(rehired.ok,true); assert.equal(drivers.rows[2][1],'699905'); assert.equal(drivers.rows[2][3],'A'); assert.equal(drivers.rows[2][9],'재직'); assert.equal(drivers.rows[2][10],'2026-10-05'); assert.equal(drivers.rows[2][11],'');
assert.equal(context.bus70ManagerBootstrap_('2026-10-05').drivers.some(v=>v.id==='D2'),true);
console.log('ManagerDispatch tests passed');
