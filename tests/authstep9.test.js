const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function sheet(rows) {
  return {
    rows,
    getLastRow() { return this.rows.length; },
    getDataRange() { return { getDisplayValues: () => this.rows.map(r => r.map(String)) }; },
    appendRow(row) { this.rows.push(row); },
    getRange(row,col) { return {setValue:value => {this.rows[row-1][col-1]=value;},setValues:values => {values.forEach((rr,ri)=>rr.forEach((value,ci)=>{this.rows[row-1+ri][col-1+ci]=value;}));}}; },
    setFrozenRows() {}
  };
}

const dispatch = sheet([
  ['dispatchId','날짜','근무조','순차','기사ID','차량ID','시간표버전','상태','확정시간','비고','노선'],
  ['DSP-1','2026-09-18','B','4','DRV-1','VEH-1','WD-V1','확정','','','70'],
  ['DSP-SYNTHETIC','2099-01-08','B','15','DRV-1','VEH-9001','SYN-R5-V1','확정','','','5']
]);
const confirmations = sheet([
  ['confirmId','날짜','기사ID','dispatchId','시간표버전','확인시간','캘린더저장','알람설정','마지막동기화','재확인필요']
]);
const adjustments = sheet([
  ['gapId','날짜','순차','탕','기존시간','조정시간','기존간격','지시간격','사유','적용시작','적용종료','처리자','처리시간','노선','시간구분','공지상태','공지채널','원본근거'],
  ['G1','2026-09-24','1','2','07:20','07:35','','','차량 고장','','','','','70','발차','확정','단톡방','소장 입력'],
  ['G2','2099-01-08','15','6','22:35','22:40','','','합성 수기 조정','','','','','5','발차','확정','시험채널','SYNTHETIC FIXTURE']
]);
const alertSettings = sheet([['기사ID','출근알림분','탕알림분','정시알림','음성안내','진동','사용여부','수정시간']]);
const runLogs = sheet([['logId','날짜','기사ID','차량ID','순차','탕','발차예정','발차실제','회차예정','회차실제','도착예정','도착실제','앞차예정간격','앞차실제간격','앞차편차','뒷차예정간격','뒷차실제간격','뒷차편차','시간표버전','노선버전','상태','비고']]);
const schedules = sheet([['버전','순차','탕','발차시간','상태'],['WD-V1','1','2','07:20','사용'],['WD-V1','2','2','07:50','사용']]);
const locationReferences = sheet([
  ['기준점ID','노선','순차','탕','구분','지점명','위도','경도','반경m','사용여부','수정시간'],
  ['GEO-START','70','1','2','발차','가상차고지','0.1001','0.2001','70','Y',''],
  ['GEO-TURN','70','1','2','회차','가상회차지','0.1101','0.2101','80','Y',''],
  ['GEO-END','70','1','2','도착','가상차고지','0.1001','0.2001','70','Y',''],
  ['GEO-BLANK','70','','','공통','미검증 기준점','','','80','Y','']
]);
const workChanges = sheet([
  ['changeId','날짜','기사ID','유형','변경전노선','변경노선','변경전근무조','변경근무조','이전사원번호','새사원번호','변경전기사구분','변경기사구분'],
  ['STORY-1','2099-01-09','DRV-STORY','노선이동','70','5','B','B','699999','499999','양성','예비']
]);
const properties = new Map();
const context = {
  console,
  Date,
  JSON,
  Object,
  Number,
  String,
  Utilities: {
    DigestAlgorithm: {SHA_256:'SHA_256'},
    computeDigest: () => Array(32).fill(1),
    getUuid: (() => { let n = 0; return () => `00000000-0000-0000-0000-${String(++n).padStart(12,'0')}`; })(),
    formatDate: () => '2026-09-18 07:20:00'
  },
  PropertiesService: {getScriptProperties: () => ({
    setProperty: (k,v) => properties.set(k,v),
    getProperty: k => properties.get(k) || null,
    deleteProperty: k => properties.delete(k)
  })},
  LockService: {getScriptLock: () => ({waitLock(){},releaseLock(){}})},
  SpreadsheetApp: {getActiveSpreadsheet: () => ({getSheetByName: name => name === '배차DB' ? dispatch : name === '배차확인DB' ? confirmations : name === '배차간격조정DB' ? adjustments : name === '알림설정DB' ? alertSettings : name === '운행일지' ? runLogs : name === '스케줄' ? schedules : name === '노선위치기준DB' ? locationReferences : name === '근무변경DB' ? workChanges : null})},
  normalizeDate_: value => String(value).slice(0,10),
  makeHeaderMap_: headers => Object.fromEntries(headers.map((h,i) => [h,i])),
  newId_: () => 'CONF-NEW',
  formatDateTime_: () => '2026-09-21 10:00:00',
  apiLogin_: () => ({ok:true,driver:{driverId:'DRV-1'}}),
  apiGetDriver_: driverId => ({ok:true,driver:{driverId,name:'가상기사',empId:'699001',route:'70',shift:'B'}}),
  apiMySchedule_: e => ({ok:true,type:'WORK',route:'70',driverId:e.parameter.driverId,date:e.parameter.date,dispatch:{seq:1},trips:[{trip:2,startPlace:'가상차고지',startTime:'07:20',turnPlace:'가상회차지',turnTime:'08:45',endPlace:'가상차고지',endTime:'10:10'}]})
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('apps-script/AuthStep9.gs','utf8'), context);

const session = context.bus70AuthAction_({action:'loginSecure',name:'테스트',empId:'1'});
assert.equal(session.ok, true);
assert.equal(session.token.length, 72);

const combinedLogin = context.bus70AuthAction_({action:'loginSecure',name:'테스트',empId:'1',date:'2026-09-21'});
assert.equal(combinedLogin.schedule.type, 'WORK');
assert.equal(combinedLogin.schedule.temporalState,'FUTURE');
assert.equal(combinedLogin.schedule.locationTracking.configuredPoints,3);
assert.equal(combinedLogin.schedule.trips[0].turnLocation.place,'가상회차지');
assert.deepEqual(Array.from(combinedLogin.schedule.runLogs),[]);
assert.deepEqual(Array.from(combinedLogin.alertSettings.commuteMinutes),[60,15]);
const combinedSession = context.bus70AuthAction_({action:'session',token:combinedLogin.token,date:'2026-09-21'});
assert.equal(combinedSession.ok, true);
assert.equal(combinedSession.schedule.date, '2026-09-21');
assert.equal(combinedSession.alertSettings.soundMode,'SYSTEM_DEFAULT');
const activeLogin=context.apiLogin_;
context.apiLogin_=()=>({ok:true,driver:{driverId:'DRV-RETIRED',status:'퇴직'}});
assert.equal(context.bus70AuthAction_({action:'loginSecure',name:'퇴직기사',empId:'1'}).error,'DRIVER_RETIRED');
context.apiLogin_=activeLogin;
const adjusted=context.bus70AuthAction_({action:'myScheduleSecure',token:combinedLogin.token,driverId:'DRV-1',date:'2026-09-24'});
assert.equal(adjusted.trips[0].startTime,'07:35'); assert.equal(adjusted.timeAdjustments.length,1); assert.equal(adjusted.trips[0].plannedRearGapMinutes,15);
const originalScheduleApi=context.apiMySchedule_;
context.apiMySchedule_=()=>({ok:true,type:'REST',message:'등록된 배차가 없습니다.'});
context.bus70Route5ReferenceData_=(date)=>date==='2099-01-08'?{ok:true,route:'5',date,shift:'B',scheduleVersion:'SYN-R5-V1',assignments:[{sequence:15,vehicleNo:'9001',vehicleId:'VEH-9001'}],trips:[{sequence:15,trip:6,startTime:'22:35'}],sequenceOperations:[]}:null;
context.bus70Route5ScheduleForDriver_=(driver,date)=>date==='2099-01-08'&&driver.name==='가상기사15'?{ok:true,type:'WORK',route:'5',dispatch:{sequence:15,vehicleNo:'9001'},trips:[{trip:6,startTime:'22:35'}]}:null;
const route5Fallback=context.bus70SecureScheduleForDriver_('DRV-1','2099-01-08',{driverId:'DRV-1',name:'가상기사15',route:'5'});
assert.equal(route5Fallback.route,'5');assert.equal(route5Fallback.dispatch.sequence,15);assert.equal(route5Fallback.dispatchSource,'CONFIRMED_ROUTE_DB');assert.equal(route5Fallback.trips[0].startTime,'22:40');assert.equal(route5Fallback.trips[0].publishedStartTime,'22:35');assert.equal(route5Fallback.timeAdjustments[0].phase,'발차');assert.equal(route5Fallback.timeAdjustments[0].channel,'시험채널');
const crossRouteSubstitute=context.bus70SecureScheduleForDriver_('DRV-1','2099-01-08',{driverId:'DRV-1',name:'가상기사15',route:'70'});
assert.equal(crossRouteSubstitute.route,'5');assert.equal(crossRouteSubstitute.driverContext.homeRoute,'70');assert.equal(crossRouteSubstitute.driverContext.assignmentRouteOverride,true);
context.bus70Route70ScheduleForDriver_=(driver,date)=>date==='2099-01-08'?{ok:true,type:'WORK',route:'70',dispatch:{sequence:6,vehicleNo:'9106'},trips:[{trip:1,startPlace:'가상차고지',startTime:'05:36'}]}:null;
const route70Fallback=context.bus70SecureScheduleForDriver_('DRV-NO','2099-01-08',{driverId:'DRV-NO',name:'가상70번기사06',route:'70'});
assert.equal(route70Fallback.route,'70');assert.equal(route70Fallback.dispatch.sequence,6);assert.equal(route70Fallback.trips[0].startTime,'05:36');
context.apiMySchedule_=()=>({ok:true,type:'WORK',route:'70',dispatch:{sequence:1},vehicle:{route:'70'},trips:[{trip:1,startTime:'05:00'}]});
const blockedWrongRoute=context.bus70SecureScheduleForDriver_('DRV-WRONG','2099-01-08',{driverId:'DRV-WRONG',name:'현재5번기사',route:'5'});
assert.equal(blockedWrongRoute.error,'ROUTE_SCHEDULE_MISMATCH');assert.equal(blockedWrongRoute.route,'5');assert.equal(blockedWrongRoute.rejectedRoute,'70');
const pastContext=context.bus70DriverContextForDate_({driverId:'DRV-STORY',name:'이력기사',route:'5',empId:'499999',shift:'B',driverType:'예비'},'2099-01-08');
const currentContext=context.bus70DriverContextForDate_({driverId:'DRV-STORY',name:'이력기사',route:'5',empId:'499999',shift:'B',driverType:'예비'},'2099-01-10');
assert.equal(pastContext.route,'70');assert.equal(pastContext.empId,'699999');assert.equal(pastContext.driverType,'양성');
assert.equal(currentContext.route,'5');assert.equal(currentContext.empId,'499999');assert.equal(currentContext.routeStory[0].state,'과거');
context.apiMySchedule_=originalScheduleApi;

const body = {action:'confirmSchedule',token:session.token,driverId:'DRV-1',date:'2026-09-18',dispatchId:'DSP-1',scheduleVersion:'WD-V1'};
const first = context.bus70AuthAction_(body);
assert.equal(first.ok, true);
assert.equal(first.alreadyConfirmed, false);
assert.equal(confirmations.rows.length, 2);

const duplicate = context.bus70AuthAction_(body);
assert.equal(duplicate.ok, true);
assert.equal(duplicate.alreadyConfirmed, true);
assert.equal(confirmations.rows.length, 2);

confirmations.rows[1][9] = 'Y';
const reconfirmed = context.bus70AuthAction_(body);
assert.equal(reconfirmed.ok, true);
assert.equal(reconfirmed.alreadyConfirmed, false);
assert.equal(reconfirmed.reConfirmed, true);
assert.equal(confirmations.rows[1][9], 'N');
assert.equal(confirmations.rows.length, 2);

const changed = context.bus70AuthAction_(Object.assign({}, body, {scheduleVersion:'WD-V2'}));
assert.equal(changed.ok, false);
assert.equal(changed.error, 'DISPATCH_CHANGED');

const mismatched = context.bus70AuthAction_(Object.assign({}, body, {driverId:'DRV-2'}));
assert.equal(mismatched.error, 'DRIVER_MISMATCH');

const savedSettings=context.bus70AuthAction_({action:'driverAlertSettingsSave',token:session.token,commuteMinutes:[90,20],tripMinutes:[10,3],exact:true,voice:true,vibration:false,enabled:true});
assert.equal(savedSettings.ok,true); assert.deepEqual(Array.from(savedSettings.settings.commuteMinutes),[90,20]);
const readSettings=context.bus70AuthAction_({action:'driverAlertSettingsGet',token:session.token});
assert.equal(readSettings.settings.vibration,false); assert.equal(alertSettings.rows.length,2);
assert.equal(readSettings.settings.soundMode,'SYSTEM_DEFAULT');
const depart=context.bus70AuthAction_({action:'driverRunLogSave',token:session.token,date:'2026-09-18',sequence:4,trip:1,event:'DEPART',plannedStart:'07:20',plannedEnd:'09:00'});
const runLogColumns=Object.fromEntries(runLogs.rows[0].map((value,index)=>[value,index]));
assert.equal(depart.ok,true); assert.equal(runLogs.rows.length,2); assert.equal(runLogs.rows[1][runLogColumns['상태']],'운행중');
assert.equal(runLogs.rows[1][runLogColumns['노선']],'70');assert.equal(runLogs.rows[1][runLogColumns['사원번호']],'699001');assert.equal(runLogs.rows[1][runLogColumns['배차ID']],'DSP-1');
const firstDeparture=runLogs.rows[1][7];
const duplicateDepart=context.bus70AuthAction_({action:'driverRunLogSave',token:session.token,date:'2026-09-18',sequence:4,trip:1,event:'DEPART'});
assert.equal(duplicateDepart.alreadyRecorded,true); assert.strictEqual(runLogs.rows[1][7],firstDeparture);
const turn=context.bus70AuthAction_({action:'driverRunLogSave',token:session.token,date:'2026-09-18',sequence:4,trip:1,event:'TURN',source:'GPS_AUTO',latitude:0.11,longitude:0.21,accuracy:18});
assert.equal(turn.ok,true); assert.equal(runLogs.rows[1][runLogColumns['상태']],'회차완료'); assert.ok(runLogs.rows[1][9]);
assert.equal(runLogs.rows[1][runLogs.rows[0].indexOf('회차기록방식')],'GPS 자동');
const arrive=context.bus70AuthAction_({action:'driverRunLogSave',token:session.token,date:'2026-09-18',sequence:4,trip:1,event:'ARRIVE'});
assert.equal(arrive.ok,true); assert.equal(runLogs.rows.length,2); assert.equal(runLogs.rows[1][runLogColumns['상태']],'완료');
const breakConnected=context.bus70AuthAction_({action:'driverRunLogSave',token:session.token,date:'2026-09-18',sequence:4,trip:1,event:'BREAK_CHARGE_CONNECTED'});
assert.equal(breakConnected.ok,true); assert.equal(breakConnected.status,'휴식충전중');
const breakDisconnected=context.bus70AuthAction_({action:'driverRunLogSave',token:session.token,date:'2026-09-18',sequence:4,trip:1,event:'BREAK_CHARGE_DISCONNECTED'});
assert.equal(breakDisconnected.ok,true); assert.equal(breakDisconnected.status,'다음운행준비');
const listed=context.bus70AuthAction_({action:'driverRunLogs',token:session.token,from:'2026-09-18',to:'2026-09-18'});
assert.equal(listed.logs.length,1); assert.equal(listed.logs[0].trip,1); assert.ok(listed.logs[0].actualTurn); assert.equal(listed.logs[0].turnRecordMode,'GPS 자동'); assert.ok(listed.logs[0].breakChargeConnectedAt); assert.ok(listed.logs[0].breakChargeDisconnectedAt);

const finishBase={action:'driverRunLogSave',token:session.token,date:'2099-01-08',sequence:15,trip:6,plannedStart:'22:35',plannedEnd:'23:36'};
assert.equal(context.bus70AuthAction_(Object.assign({},finishBase,{event:'SERVICE_END',serviceEndType:'UPBOUND_ONLY',serviceEndPlace:'가상종점',deadheadDestination:'가상차고지'})).ok,true);
assert.equal(context.bus70AuthAction_(Object.assign({},finishBase,{event:'DEADHEAD_RETURN'})).ok,true);
assert.equal(context.bus70AuthAction_(Object.assign({},finishBase,{event:'CLEANING_DONE'})).ok,true);
assert.equal(context.bus70AuthAction_(Object.assign({},finishBase,{event:'CHARGER_CONNECTED'})).ok,true);
const shiftEnd=context.bus70AuthAction_(Object.assign({},finishBase,{event:'SHIFT_END'}));
assert.equal(shiftEnd.ok,true); assert.equal(shiftEnd.status,'근무종료');
const route5Log=context.bus70AuthAction_({action:'driverRunLogs',token:session.token,from:'2099-01-08',to:'2099-01-08'}).logs[0];
assert.equal(route5Log.sequence,15); assert.equal(route5Log.vehicleId,'VEH-9001');
assert.equal(route5Log.route,'5');assert.equal(route5Log.empId,'699001');assert.equal(route5Log.dispatchId,'DSP-SYNTHETIC');
assert.equal(route5Log.serviceEndPlace,'가상종점');
assert.equal(route5Log.deadheadDestination,'가상차고지');
assert.equal(route5Log.officeChargeStatus,'사무실 모니터 확인');
assert.ok(route5Log.cleanedAt); assert.ok(route5Log.chargerConnectedAt); assert.ok(route5Log.shiftEndedAt);

console.log('AuthStep9 tests passed');
