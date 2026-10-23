const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const privateFixture = require('./private-route-fixture');

// Exercise the actual web-to-Android export protocol without a browser install.
async function testNativeDispatchExport(){
  const html=fs.readFileSync('index.html','utf8'),source=html.slice(html.indexOf('  function managerImageSignature('),html.indexOf('  document.getElementById("managerLoad").addEventListener'));
  const values={managerRoute:{value:'5'},managerDate:{value:'2099-01-08'},managerShift:{value:'B'}},calls=[],notices=[];
  const sandbox={console,Blob,File:class extends Blob{constructor(parts,name,options){super(parts,options);this.name=name;}},Date,Math,JSON,Boolean,String,URL,setTimeout,
    document:{getElementById:id=>values[id]},normalizedRoute:String,managerAssignments:()=>[{sequence:10,driverId:'SYNTHETIC',vehicleId:'TEST'}],managerNotice:(...args)=>notices.push(args),
    managerData:{route:'5'},managerImageBlob:new Blob(['synthetic-png'],{type:'image/png'}),managerImageContext:null,managerImageRequest:'',
    window:{Bus70Android:{exportDispatchImage:(...args)=>calls.push(args)}},navigator:{},
    FileReader:class{async readAsDataURL(blob){this.result='data:image/png;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload();}}
  };
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  vm.runInContext('managerImageContext={data:managerData,signature:managerImageSignature()}',sandbox);
  await sandbox.shareManagerImage();assert.equal(calls.length,1);assert.equal(calls[0][1],'share');assert.equal(calls[0][2],'BUS5-2099-01-08.png');assert.equal(Buffer.from(calls[0][3],'base64').toString(),'synthetic-png');
  sandbox.window.bus70DispatchImageResult({requestId:calls[0][0],ok:true,state:'opened',message:'공유창 열림'});assert.equal(notices.at(-1)[0],'공유창 열림');
  sandbox.window.bus70DispatchImageResult({requestId:'stale',ok:true,message:'잘못된 완료'});assert.equal(notices.at(-1)[0],'공유창 열림');
  await sandbox.downloadManagerImage();assert.equal(calls[1][1],'save');
  values.managerDate.value='2099-01-10';await sandbox.shareManagerImage();assert.equal(calls.length,2);assert.match(notices.at(-1)[0],/다시 생성/);
  values.managerDate.value='2099-01-08';sandbox.window.Bus70Android={};await sandbox.shareManagerImage();assert.equal(calls.length,2);assert.match(notices.at(-1)[0],/v81/);
  delete sandbox.window.Bus70Android;let browserFile;sandbox.navigator.canShare=()=>true;sandbox.navigator.share=async data=>{browserFile=data.files[0];};await sandbox.shareManagerImage();assert.equal(browserFile.name,'BUS5-2099-01-08.png');
  sandbox.window.Bus70Android={exportDispatchImage:(...args)=>calls.push(args)};
  const inFlight=sandbox.shareManagerImage();values.managerRoute.value='70';await inFlight;assert.equal(calls.length,2);
  console.log('Native dispatch export protocol, stale-data guard and browser fallback passed');
}
testNativeDispatchExport().catch(error=>{console.error(error);process.exitCode=1;});

function sheet(rows,name='') {
  return {rows,name,getName(){return this.name;},getLastRow(){return this.rows.length;}, getDataRange(){return {getDisplayValues:()=>this.rows.map(r=>r.slice())};},
    appendRow(row){this.rows.push(row.slice());}, setFrozenRows(){}, getRange(row,col,count){const target=this;return {setValues:values=>{values.forEach((source,rowOffset)=>{while(target.rows.length<row+rowOffset)target.rows.push([]);source.forEach((value,colOffset)=>target.rows[row-1+rowOffset][col-1+colOffset]=value);});},setValue:value=>{while(target.rows.length<row)target.rows.push([]);target.rows[row-1][col-1]=value;}};}};
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
Object.keys(sheets).forEach(name=>sheets[name].name=name);
const spreadsheet={getSheetByName:n=>sheets[n]||null,insertSheet:n=>{const created=sheet([],n);sheets[n]=created;return created;}};
let idCounter=0;
const context={console,JSON,Date,Number,String,Object,Array,BUS70_PRIVATE_ROUTE_DATA_:privateFixture,Utilities:{formatDate:d=>d.toISOString().slice(0,10)},PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>spreadsheet},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  normalizeDate_:v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v))?String(v):'',makeHeaderMap_:h=>Object.fromEntries(h.map((v,i)=>[v,i])),
  bus70ScheduleVersionForDate_:date=>date==='2026-09-20'?'HD-TEST-V001':'WD-TEST-V001',writeAudit_:()=>{},newId_:prefix=>prefix+'-TEST-'+(++idCounter)};
vm.createContext(context); vm.runInContext(fs.readFileSync('apps-script/PrivateRouteStore.gs','utf8'),context); vm.runInContext(fs.readFileSync('apps-script/Route5Schedule.gs','utf8'),context); vm.runInContext(fs.readFileSync('apps-script/Route70Schedule.gs','utf8'),context); vm.runInContext(fs.readFileSync('apps-script/PublicTransitApi.gs','utf8'),context); vm.runInContext(fs.readFileSync('apps-script/ManagerDispatch.gs','utf8'),context);
assert.equal(context.bus70OperatingShiftForDate_('2099-01-08'),'B');
assert.equal(context.bus70OperatingShiftForDate_('2099-01-09'),'A');
const privateConfig=privateFixture.config; delete privateFixture.config;
assert.equal(context.bus70ManagerBootstrap_('2099-01-08').error,'PRIVATE_CONFIG_NOT_CONFIGURED');
privateFixture.config=privateConfig;
assert.equal(context.bus70IsManager_('D1'),true); assert.equal(context.bus70IsManager_('D2'),false);
assert.equal(context.bus70RoleFor_('ADM-MASTER-001'),'MASTER');
assert.equal(context.bus70RoleFor_('CTR-CENTER-001'),'CENTER');
assert.equal(context.bus70RoleFor_('DRV-B-TEST-002'),'');
assert.equal(context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'routeStopImportStatus',route:'5'},'D1').ok,true);
assert.equal(context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'routeStopImportStatus',route:'5'},'D2').error,'MANAGER_REQUIRED');
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
assert.equal(boot.routeStorage.stopSheet,'노선_70_정류장DB');assert.equal(boot.routeStorage.scheduleSheet,'노선_70_배차스케줄DB_2026_09');
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
assert.equal(saved.ok,true); assert.equal(dispatch.rows.length,12); assert.equal(dispatch.rows[1][0],'DSP-70-20260918-B-01');
confirmations.appendRow(['C1','2026-09-18','D1','DSP-70-20260918-B-01','WD-TEST-V001','2026-09-17 20:00','','','','']);
const adjusted=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'scheduleAdjustmentSave',date:'2026-09-18',sequence:1,trip:1,before:'07:20',after:'07:35',reason:'차량 고장'},'D1');
assert.equal(adjusted.ok,true); assert.equal(adjustments.rows.length,2); assert.equal(confirmations.rows[1][9],'Y'); confirmations.rows[1][9]='N';
const missingFirstTrip=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'scheduleAdjustmentSave',route:'5',date:'2099-01-08',sequence:2,trip:1,phase:'발차',before:'05:00',after:'05:05',reason:'존재하지 않는 탕 시험'},'D1');
assert.equal(missingFirstTrip.error,'TRIP_NOT_SCHEDULED');assert.match(missingFirstTrip.message,/2탕부터 운행/);assert.equal(adjustments.rows.length,2);
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
const route5Boot=context.bus70ManagerBootstrap_('2099-01-08','5');
assert.equal(route5Boot.ok,true);assert.equal(route5Boot.route,'5');assert.equal(route5Boot.scheduleVersion,'SYN-R5-V1');
assert.deepEqual(JSON.parse(JSON.stringify(route5Boot.tripNumbersBySequence['2'])),[2,3,4,5,6,7]);
assert.equal(Object.keys(route5Boot.departures).length,27);assert.equal(route5Boot.assignments.length,26);
assert.equal(route5Boot.routeProfile.route,'5');assert.equal(route5Boot.routeProfile.stopCount,3);assert.equal(route5Boot.routeProfile.stops[2].name,'가상회차지');
assert.equal(route5Boot.drivers.some(v=>v.virtual&&v.route==='5'),true);assert.equal(route5Boot.vehicles.some(v=>v.virtual&&v.route==='5'),true);
const departureOnly=JSON.parse(JSON.stringify(privateFixture['5']['2099-01-08']));departureOnly.sourceNote='SYNTHETIC DEPARTURE-ONLY MANAGER TEST';departureOnly.departures=departureOnly.tripTimings.map(row=>(row||[]).map(times=>times?String(times[0]||times[1]||''):''));delete departureOnly.tripTimings;departureOnly.assignments.push([9,'가상5번기사09','9009']);privateFixture['5']['2099-01-06']=departureOnly;
const phaseReviewBoot=context.bus70ManagerBootstrap_('2099-01-06','5');
assert.equal(phaseReviewBoot.ok,true);assert.equal(phaseReviewBoot.routeStorage.synced,false);assert.equal(phaseReviewBoot.phaseReview.status,'INFERRED_COMPLETE');assert.equal(phaseReviewBoot.phaseReview.sourceDate,'2099-01-08');assert.equal(phaseReviewBoot.phaseReview.confirmable,true);assert.equal(phaseReviewBoot.assignments.length,27);
const phaseAssignments=phaseReviewBoot.assignments.map(item=>({sequence:item.sequence,driverId:item.driverId,vehicleId:item.vehicleId})).sort((a,b)=>a.sequence-b.sequence),phaseSaved=context.bus70SaveManagerDispatchDay_({route:'5',date:'2099-01-06',shift:'B',assignments:phaseAssignments},'D1');
assert.equal(phaseSaved.ok,true,JSON.stringify(phaseSaved));assert.equal(phaseSaved.scheduleReviewPending,false);assert.equal(phaseSaved.data.phaseReview,null);const confirmedPhaseSchedule=context.bus70RouteScheduleFromDb_('5','2099-01-06');assert.equal(confirmedPhaseSchedule.available,true);assert.equal(confirmedPhaseSchedule.dataStatus,'CONFIRMED');assert.equal(confirmedPhaseSchedule.trips.find(v=>v.sequence===2&&v.trip===2).phaseStatus,'CONFIRMED_INFERRED');assert.equal(confirmedPhaseSchedule.trips.find(v=>v.sequence===2&&v.trip===2).phaseSourceDate,'2099-01-08');const confirmedDriverSchedule=context.bus70Route5ScheduleForDriver_({driverId:'DRV-SYN-25',name:'가상5번기사25'},'2099-01-06');assert.equal(confirmedDriverSchedule.phaseReviewRequired,false);assert.ok(confirmedDriverSchedule.trips[0].turnTime);assert.ok(confirmedDriverSchedule.trips[0].endTime);
const realReferenceLoader=context.bus70ManagerReferenceData_;
context.bus70ManagerReferenceData_=()=>({ok:true,route:'70',date:'2099-01-08',trips:[],assignments:[]});
assert.equal(context.bus70ManagerBootstrap_('2099-01-08','5').error,'ROUTE_DATA_MISMATCH');
context.bus70ManagerReferenceData_=realReferenceLoader;
const route5Editor=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'routeTimetableEditorLoad',route:'5',date:'2099-01-08'},'D1');
assert.equal(route5Editor.ok,true);assert.equal(route5Editor.route,'5');assert.equal(route5Editor.date,'2099-01-08');assert.equal(route5Editor.routeStorage.scheduleSheet,'노선_5_배차스케줄DB_2099_01');
assert.equal(route5Editor.trips.find(v=>v.sequence===25&&v.trip===1).startTime,'05:45');
assert.equal(context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'routeTimetableEditorLoad',route:'5',date:'2099-01-08'},'D2').error,'MANAGER_REQUIRED');
const route70ScheduleRowsBefore=(sheets['노선_70_배차스케줄DB']&&sheets['노선_70_배차스케줄DB'].rows.length)||0,adjustmentCountBeforeBulk=adjustments.rows.length;
const bulkSaved=context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'routeTimetableBulkSave',route:'5',date:'2099-01-08',reason:'합성 전체 시간표 편집',changes:[{sequence:25,trip:1,phase:'발차',before:'05:45',after:'05:47'}]},'D1');
assert.equal(bulkSaved.ok,true);assert.equal(bulkSaved.changeCount,1);assert.equal(bulkSaved.data.route,'5');assert.equal(bulkSaved.data.trips.find(v=>v.sequence===25&&v.trip===1).startTime,'05:47');
assert.equal(adjustments.rows.length,adjustmentCountBeforeBulk+1);assert.equal((sheets['노선_70_배차스케줄DB']&&sheets['노선_70_배차스케줄DB'].rows.length)||0,route70ScheduleRowsBefore);
const route5ScheduleHeaders=Object.fromEntries(sheets['노선_5_배차스케줄DB_2099_01'].rows[0].map((v,i)=>[v,i])),route5Revision=sheets['노선_5_배차스케줄DB_2099_01'].rows[sheets['노선_5_배차스케줄DB_2099_01'].rows.length-1];
assert.equal(route5Revision[route5ScheduleHeaders['노선']],'5');assert.equal(route5Revision[route5ScheduleHeaders['개정번호']],1);assert.equal(route5Revision[route5ScheduleHeaders['변경사유']],'합성 전체 시간표 편집');
assert.equal(context.bus70ManagerAction_({action:'managerAccountUpsert',operation:'routeTimetableBulkSave',route:'5',date:'2099-01-08',reason:'오래된 화면 저장 차단',changes:[{sequence:25,trip:1,phase:'발차',before:'05:45',after:'05:49'}]},'D1').error,'TIMETABLE_STALE');
const allRoutes=context.bus70ManagerBootstrap_('2099-01-08','ALL');
assert.equal(allRoutes.ok,true);assert.equal(allRoutes.mode,'SUMMARY');assert.equal(allRoutes.routes.find(v=>v.route==='5').sequenceCount,27);assert.equal(allRoutes.routes.find(v=>v.route==='70').sequenceCount,11);
assert.equal(allRoutes.routes.find(v=>v.route==='5').stopCount,3);assert.equal(allRoutes.routes.find(v=>v.route==='70').stopCount,3);
vehicles.appendRow(['V5-SPARE','9995','예비','운행가능','5','',99,'합성 5번 예비차']);
const route5Assignments=route5Boot.assignments.concat([{sequence:9,driverId:'D1',vehicleId:'V5-SPARE'}]).sort((a,b)=>a.sequence-b.sequence);
assert.equal(context.bus70SaveManagerDispatchDay_({route:'5',date:'2099-01-08',shift:'B',assignments:route5Assignments},'D1').error,'CROSS_ROUTE_ASSIGNMENT_BLOCKED');
const route5Saved=context.bus70SaveManagerDispatchDay_({route:'5',date:'2099-01-08',shift:'B',assignments:route5Assignments,crossRouteAssignment:true,reason:'합성 타노선 지원 승인'},'D1');
assert.equal(route5Saved.ok,true);assert.equal(route5Saved.data.route,'5');
const dispatchHeaders=Object.fromEntries(dispatch.rows[0].map((v,i)=>[v,i]));
assert.equal(dispatch.rows.filter(r=>r[dispatchHeaders['날짜']]==='2099-01-08'&&r[dispatchHeaders['노선']]==='5').length,27);
assert.equal(dispatch.rows.find(r=>r[0]==='DSP-5-20990108-B-09')[dispatchHeaders['차량ID']],'V5-SPARE');
assert.equal(context.bus70ManagerAssignments_(dispatch,'2099-01-08','70').length,0);
const registeredDriverIds=new Set(drivers.rows.slice(1).map(row=>row[0])),registeredVehicleIds=new Set(vehicles.rows.slice(1).map(row=>row[0]));
route5Boot.drivers.filter(item=>item.virtual&&!registeredDriverIds.has(item.id)).forEach((item,index)=>{drivers.appendRow([item.id,'',item.name,'B','노선','','','5',1200+index,'재직','','','Y','합성 5번 등록기사']);registeredDriverIds.add(item.id);});
route5Boot.vehicles.filter(item=>item.virtual&&!registeredVehicleIds.has(item.id)).forEach((item,index)=>{vehicles.appendRow([item.id,item.no,'일반','운행가능','5','',1200+index,'합성 5번 등록차량']);registeredVehicleIds.add(item.id);});
drivers.appendRow(['R5-LEAVE-TEST','','가상5번휴무대기','B','예비','','','5',1300,'재직','','','Y','합성 휴무계획 검증']);
privateFixture.config.plannedLeaves=[{route:'5',shift:'B',driverName:'가상5번기사01',type:'휴무',date:'2099-01-08',source:'SYNTHETIC LEAVE OVERRIDE'},{route:'5',shift:'B',driverName:'가상5번휴무대기',type:'휴무',date:'2099-01-12',source:'SYNTHETIC LEAVE PLAN'}];
const route5ObservedOverride=context.bus70ManagerBootstrap_('2099-01-08','5');assert.equal(route5ObservedOverride.plannedLeaves.length,0);assert.equal(route5ObservedOverride.plannedLeaveOverrides.length,1);assert.equal(route5ObservedOverride.plannedLeaveOverrides[0].driverName,'가상5번기사01');assert.equal(route5ObservedOverride.assignments.some(v=>v.driverId==='R5-TMP-001'),true);
// A normalized timetable can have no roster: confirmed day dispatch still wins
// over a monthly plan. Unassigned leave and explicit daily absence stay blocked.
const originalReference=context.bus70ManagerReferenceData_, originalPlans=context.bus70PlannedLeavesForDate_;
context.bus70ManagerReferenceData_=(route,date,options)=>{const result=originalReference(route,date,options);return result&&result.ok?{...result,assignments:[]}:result;};
context.bus70PlannedLeavesForDate_=()=>[
  {driverId:'R5-TMP-001',driverName:'가상5번기사01',type:'휴무'},
  {driverId:'R5-LEAVE-TEST',driverName:'가상5번휴무대기',type:'휴무'}
];
const normalizedRoster=context.bus70ManagerBootstrap_('2099-01-08','5');
assert(normalizedRoster.drivers.some(v=>v.id==='R5-TMP-001'));
assert(!normalizedRoster.drivers.some(v=>v.id==='R5-LEAVE-TEST'));
assert.equal(normalizedRoster.plannedLeaveOverrides[0].reason,'당일 확정 배차 우선');
assert(!normalizedRoster.unavailableNames.includes('가상5번기사01'));
assert(normalizedRoster.unavailableNames.includes('가상5번휴무대기'));
const dailyAbsence=new Array(workChanges.rows[0].length).fill('');
dailyAbsence[0]='SYNTHETIC-DAILY-ABSENCE';dailyAbsence[1]='2099-01-08';dailyAbsence[2]='R5-TMP-001';dailyAbsence[3]='결근';workChanges.rows.push(dailyAbsence);
assert(!context.bus70ManagerBootstrap_('2099-01-08','5').drivers.some(v=>v.id==='R5-TMP-001'));
workChanges.rows.pop();
const originalAssignments=context.bus70ManagerAssignments_;
context.bus70ManagerAssignments_=()=>[];
assert(!context.bus70ManagerBootstrap_('2099-01-08','5').drivers.some(v=>v.id==='R5-TMP-001'));
context.bus70ManagerAssignments_=originalAssignments;
context.bus70ManagerReferenceData_=originalReference;context.bus70PlannedLeavesForDate_=originalPlans;
const route5Predicted=context.bus70ManagerBootstrap_('2099-01-12','5');
assert.equal(route5Predicted.ok,true);assert.equal(route5Predicted.source,'ROUTE_PATTERN_PREDICTION');assert.equal(route5Predicted.serviceClass,'WEEKDAY');assert.equal(route5Predicted.schedulePrediction.predicted,true);assert.equal(route5Predicted.schedulePrediction.sourceDate,'2099-01-08');
assert.equal(route5Predicted.plannedLeaves.length,1);assert.equal(route5Predicted.plannedLeaves[0].driverName,'가상5번휴무대기');assert.equal(route5Predicted.drivers.some(v=>v.id==='R5-LEAVE-TEST'),false);assert.equal(route5Predicted.unavailableNames.includes('가상5번휴무대기'),true);
assert.equal(route5Predicted.routeStorage.synced,false);assert.equal(route5Predicted.predictions.B.sourceDate,'2099-01-08');assert.equal(route5Predicted.predictions.B.serviceClass,'WEEKDAY');
const route5PredictedSaved=context.bus70SaveManagerDispatchDay_({route:'5',date:'2099-01-12',shift:'B',assignments:route5Assignments,crossRouteAssignment:true,reason:'합성 타노선 지원 승인'},'D1');
assert.equal(route5PredictedSaved.ok,true,JSON.stringify(route5PredictedSaved));assert.equal(context.bus70RouteScheduleFromDb_('5','2099-01-12').available,true);assert.equal(context.bus70ManagerBootstrap_('2099-01-12','5').schedulePrediction,null);
privateFixture['5']['2099-01-11']={serviceType:'합성 휴일',shift:'B',scheduleVersion:'SYN-R5-HD-V1',timetableSequences:3,sourceNote:'SYNTHETIC HOLIDAY DEPARTURE-ONLY',assignments:[],departures:[['05:00'],['05:10'],['05:20']]};
const incompleteHoliday=context.bus70ManagerBootstrap_('2099-01-18','5');assert.equal(incompleteHoliday.ok,true);assert.equal(incompleteHoliday.schedulePrediction.predicted,true);assert.equal(incompleteHoliday.phaseReview.confirmable,false);assert.equal(incompleteHoliday.phaseReview.unresolvedTripCount,3);const holidayDrivers=incompleteHoliday.drivers.filter(v=>v.route==='5').slice(0,3),holidayVehicles=incompleteHoliday.vehicles.slice(0,3),holidayInput=[1,2,3].map((sequence,index)=>({sequence,driverId:holidayDrivers[index].id,vehicleId:holidayVehicles[index].id})),incompleteHolidaySaved=context.bus70SaveManagerDispatchDay_({route:'5',date:'2099-01-18',shift:'B',assignments:holidayInput},'D1');assert.equal(incompleteHolidaySaved.ok,true,JSON.stringify(incompleteHolidaySaved));assert.equal(incompleteHolidaySaved.scheduleReviewPending,true);assert.equal(context.bus70RouteScheduleFromDb_('5','2099-01-18').available,false);
vehicles.appendRow(['V70-EX1','9981','예비','운행가능','70','',100,'합성 70번 예비차']);vehicles.appendRow(['V70-EX2','9982','예비','운행가능','70','',101,'합성 70번 예비차']);
const route70SameDay=context.bus70ManagerBootstrap_('2099-01-08','70'),route70Drivers=route70SameDay.drivers.filter(v=>v.route==='70').slice(0,11),route70Conflict=route70SameDay.vehicles.slice(0,11).map((v,i)=>({sequence:i+1,driverId:route70Drivers[i].id,vehicleId:v.id}));route70Conflict[0].driverId='D1';
assert.equal(context.bus70SaveManagerDispatchDay_({route:'70',date:'2099-01-08',shift:'B',assignments:route70Conflict},'D1').error,'CROSS_ROUTE_DRIVER_CONFLICT');
const sameSequenceOtherRoute=new Array(dispatch.rows[0].length).fill('');
sameSequenceOtherRoute[dispatchHeaders['dispatchId']]='DSP-70-20990108-B-09';sameSequenceOtherRoute[dispatchHeaders['날짜']]='2099-01-08';sameSequenceOtherRoute[dispatchHeaders['근무조']]='B';sameSequenceOtherRoute[dispatchHeaders['순차']]=9;sameSequenceOtherRoute[dispatchHeaders['기사ID']]='D3';sameSequenceOtherRoute[dispatchHeaders['차량ID']]='V70-EX1';sameSequenceOtherRoute[dispatchHeaders['시간표버전']]='SYN-R70-V1';sameSequenceOtherRoute[dispatchHeaders['상태']]='확정';sameSequenceOtherRoute[dispatchHeaders['노선']]='70';dispatch.rows.splice(1,0,sameSequenceOtherRoute);
const route5Replacement=context.bus70WorkChangeSave_({date:'2099-01-08',driverId:'D1',type:'휴무',sequence:9,replacementId:'DRV-A-RESERVE',crossRouteReplacement:true,reason:'5번 다른 노선·조 대체 검증'},'D1');
assert.equal(route5Replacement.ok,true);assert.equal(dispatch.rows.find(r=>r[dispatchHeaders['dispatchId']]==='DSP-5-20990108-B-09')[dispatchHeaders['기사ID']],'DRV-A-RESERVE');assert.equal(dispatch.rows[1][dispatchHeaders['기사ID']],'D3');
console.log('ManagerDispatch tests passed');

const contactProperties={};const originalProperties=context.PropertiesService;
context.PropertiesService={getScriptProperties:()=>({getProperty:k=>contactProperties[k]||'',setProperty:(k,v)=>contactProperties[k]=v})};
contactProperties.BUS70_DEPOT_CONTACTS_JSON=JSON.stringify([{role:'이전 연락처',phone:'010-0000-0001'}]);
assert.equal(context.bus70DepotContactsGet_('UNKNOWN').error,'LOGIN_REQUIRED');
assert.equal(context.bus70DepotContactsGet_('D3').contactsVersion,1,'empty DB keeps legacy data readable');
const contactSheet=sheet([['contactId','구분','직책','성명','전화번호','표시순서','사용여부','비고'],
  ['C2','정비','가상정비소','','032-000-0002\n070-0000-0002',2,'Y','24시간 근무'],
  ['C1','소장','가상소장','시험담당자','010-0000-0001',1,'Y','B조 아침 배차'],
  ['C3','소장','퇴임담당','비활성','010-0000-0003',3,'N','보존']],'연락망DB');
sheets['연락망DB']=contactSheet;
const contacts=context.bus70DepotContactsGet_('D3').contacts;
assert.equal(contacts.length,2);assert.equal(contacts[0].id,'C1');assert.equal(contacts[0].name,'시험담당자');assert.equal(contacts[0].note,'B조 아침 배차');assert.equal(contacts[1].phones.length,2);
const beforeContacts=JSON.stringify(contactSheet.rows);
assert.equal(context.bus70DepotContactsSave_({contacts},'D3').error,'MANAGER_REQUIRED');
assert.equal(context.bus70DepotContactsSave_({contacts:[contacts[0],contacts[0]]},'D1').error,'CONTACTS_INVALID');
assert.equal(context.bus70DepotContactsSave_({contacts:contacts.map(c=>({role:c.role,phone:c.phone}))},'D1').error,'CONTACTS_INVALID','old client cannot overwrite richer records');
assert.equal(context.bus70DepotContactsSave_({contacts:contacts.map((c,i)=>({...c,phones:i===0?['010-0000-0001','javascript:alert(1)']:c.phones}))},'D1').error,'PHONE_INVALID');
assert.equal(JSON.stringify(contactSheet.rows),beforeContacts,'unauthorized or invalid writes leave all data intact');
const edited=contacts.map(c=>({...c,name:c.id==='C1'?'새 담당자':c.name,note:c.id==='C2'?'17시까지 근무':c.note}));
assert.equal(context.bus70DepotContactsSave_({contacts:edited},'D1').ok,true);
const loaded=context.bus70DepotContactsGet_('D3');assert.equal(loaded.contactsVersion,2);
assert.equal(loaded.contacts[0].name,'새 담당자');assert.equal(loaded.contacts[1].note,'17시까지 근무');assert.equal(loaded.contacts[1].phones.length,2);
assert.equal(contactSheet.rows[1][4],'032-000-0002\n070-0000-0002');assert.equal(contactSheet.rows[3][7],'보존');assert.equal(contactSheet.rows[1][1],'정비');
contactSheet.rows[1][6]='N';contactSheet.rows[2][6]='N';
assert.equal(context.bus70DepotContactsGet_('D3').contacts.length,0,'disabled DB does not resurrect stale legacy phones');
context.PropertiesService=originalProperties;
console.log('Authenticated emergency contact DB, multiple phones, metadata and safe updates passed');

// A DB-only route has no embedded roster; confirmed cross-route assignments
// must remain visible without changing the driver's or vehicle's home route.
sheets['노선마스터DB']=sheet([['routeId','사용여부'],['5','Y'],['23','Y'],['70','Y'],['999','N']],'노선마스터DB');
const extraHeader=context.bus70RoutePartitionHeaders_('schedule');
const extraPlan=(seq,time)=>{const data={'시간표ID':'SYN23-'+seq,'노선':'23','운행일':'2099-01-08','시간표버전':'SYN23','운행구분':'평일','근무조':'B','순차':seq,'탕':1,'발차지':'가상기점','발차시간':time,'회차지':'가상회차','회차시간':'23:30','도착지':'가상기점','도착시간':'00:20','상태':'사용'};return extraHeader.map(h=>data[h]??'');};
sheets['노선_23_배차스케줄DB_2099_01']=sheet([extraHeader,extraPlan(1,'22:00'),extraPlan(2,'22:15')],'노선_23_배차스케줄DB_2099_01');
context.bus70InvalidatePartition_(sheets['노선마스터DB']);
assert.equal(context.bus70ManagerNormalizeRoute_('23'),'23');
assert.equal(context.bus70ManagerNormalizeRoute_('999'),'');
const extraReference=context.bus70ManagerReferenceData_('23','2099-01-08');
assert.equal(extraReference.route,'23');assert.equal(extraReference.trips.length,2);
assert.equal(extraReference.trips[0].endTime,'00:20');assert.equal(extraReference.trips[0].plannedRearGapMinutes,15);
assert.equal(context.bus70ManagerReferenceData_('23','2099-01-09').ok,false,'no fallback to another service date');
vehicles.rows.push(['SYN23V','9999','일반','운행가능','70','',999,'']);drivers.rows.push(['SYN23D','','가상교대기사','B','노선','','','70',999,'재직']);
const dc=context.makeHeaderMap_(dispatch.rows[0]);const extraDispatch=new Array(dispatch.rows[0].length).fill('');
Object.entries({dispatchId:'R23-SYN-B-01','날짜':'2099-01-08','근무조':'B','순차':1,'기사ID':'SYN23D','차량ID':'SYN23V','시간표버전':'SYN23','상태':'확정','노선':'23','비고':'[타노선 승인]'}).forEach(([k,v])=>extraDispatch[dc[k]]=v);
dispatch.rows.push(extraDispatch);context.bus70InvalidatePartition_(dispatch);
const extraBoard=context.bus70ManagerBootstrap_('2099-01-08','23');
assert.equal(extraBoard.ok,true);assert.ok(extraBoard.vehicles.some(v=>v.id==='SYN23V'),'dated replacement vehicle is selectable');
assert.ok(extraBoard.assignments.some(d=>d.driverId==='SYN23D'&&d.crossRouteAuthorized));
assert.ok(context.bus70ManagerBootstrap_('2099-01-08','ALL').routes.some(r=>r.route==='23'));
assert.equal(vehicles.rows.find(r=>r[0]==='SYN23V')[4],'70','permanent vehicle route preserved');
vm.runInContext(fs.readFileSync('apps-script/AuthStep9.gs','utf8'),context);
assert.equal(context.bus70ConfirmedAssignedRoute_('SYN23D','2099-01-08'),'23');
const extraDriver=context.bus70ConfirmedRouteScheduleForDriver_({driverId:'SYN23D',route:'70'},'2099-01-08','23');
assert.equal(extraDriver.ok,true);assert.equal(extraDriver.route,'23');assert.equal(extraDriver.dispatch.sequence,1);assert.equal(extraDriver.trips.length,1);
assert.equal(context.bus70ConfirmedRouteScheduleForDriver_({driverId:'SYN23D'},'2099-01-09','23'),null);
console.log('DB-only route, master registry, cross-route driver/vehicle, dated lookup and midnight plan passed');
