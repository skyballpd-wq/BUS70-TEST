/* BUS70 TEST STEP 9 authentication and dispatch confirmation.
 * Add this file to the same Apps Script project as Code.gs, then deploy a new
 * web-app version. Existing sheets and rows are preserved. */
const BUS70_AUTH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function bus70TokenHash_(token) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

function bus70IssueSession_(driverId) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  const expiresAt = Date.now() + BUS70_AUTH_TTL_MS;
  PropertiesService.getScriptProperties().setProperty(
    'BUS70_AUTH_' + bus70TokenHash_(token),
    JSON.stringify({driverId: driverId, expiresAt: expiresAt})
  );
  return {token: token, expiresAt: new Date(expiresAt).toISOString()};
}

function bus70AuthDriver_(token) {
  token = String(token || '');
  if (!/^[a-f0-9-]{72}$/.test(token)) return null;
  const props = PropertiesService.getScriptProperties();
  const key = 'BUS70_AUTH_' + bus70TokenHash_(token);
  const raw = props.getProperty(key);
  if (!raw) return null;
  let record;
  try { record = JSON.parse(raw); } catch (_) { props.deleteProperty(key); return null; }
  if (!record.driverId || !Number.isFinite(record.expiresAt) || record.expiresAt <= Date.now()) {
    props.deleteProperty(key);
    return null;
  }
  return String(record.driverId);
}

function bus70RevokeSession_(token) {
  token = String(token || '');
  if (/^[a-f0-9-]{72}$/.test(token)) {
    PropertiesService.getScriptProperties().deleteProperty('BUS70_AUTH_' + bus70TokenHash_(token));
  }
}

function bus70AuthAction_(body) {
  body = body || {};
  const action = String(body.action || '').trim();
  if (action === 'loginSecure') {
    if (typeof bus70EnsureInitialAccounts_ === 'function') bus70EnsureInitialAccounts_();
    // A trainee keeps the same internal driverId when becoming a regular
    // driver, but the employee number and route change on the effective date.
    // Apply due transitions before looking up the submitted employee number so
    // the new regular employee number works even when no manager has opened the
    // dispatch screen since midnight.
    if (typeof bus70ApplyDueDriverTransitions_ === 'function') {
      try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        bus70ApplyDueDriverTransitions_(ss.getSheetByName('기사DB'), ss.getSheetByName('근무변경DB'));
      } catch (transitionError) {
        console.error('Driver transition sync failed before login', transitionError);
      }
    }
    let result = typeof bus70StaffLogin_ === 'function' ? bus70StaffLogin_(body.name, body.empId) : {ok:false,error:'STAFF_NOT_FOUND'};
    if (!result.ok && result.error === 'STAFF_NOT_FOUND') result = apiLogin_(body.name, body.empId);
    if (!result.ok) return result;
    const role = typeof bus70RoleFor_ === 'function' ? bus70RoleFor_(result.driver.driverId) : '';
    if (!role && !bus70DriverLoginActive_(result.driver)) return {ok:false,error:'DRIVER_RETIRED',message:'퇴직 처리된 기사 계정입니다. 재입사 승인 후 로그인할 수 있습니다.'};
    const session = bus70IssueSession_(result.driver.driverId);
    const response = {ok:true, driver:result.driver, token:session.token, expiresAt:session.expiresAt,
      manager:role === 'MASTER' || role === 'MANAGER', role:role};
    if (body.date && !role) {
      response.schedule = bus70SecureScheduleForDriver_(result.driver.driverId, body.date, result.driver);
    }
    if (!role && typeof bus70DriverAlertSettingsGet_ === 'function') {
      response.alertSettings = bus70DriverAlertSettingsGet_(result.driver.driverId).settings;
    }
    return response;
  }
  const driverId = bus70AuthDriver_(body.token);
  if (!driverId) return {ok:false, error:'AUTH_REQUIRED', message:'로그인이 만료되었습니다. 다시 로그인하세요.'};
  if (action === 'session') {
    const result = apiGetDriver_(driverId);
    if (!result.ok) {
      return {ok:false, error:'DRIVER_UNAVAILABLE', message:'기사정보를 확인할 수 없습니다.'};
    }
    const role = typeof bus70RoleFor_ === 'function' ? bus70RoleFor_(driverId) : '';
    if (!role && !bus70DriverLoginActive_(result.driver)) {
      bus70RevokeSession_(body.token);
      return {ok:false,error:'DRIVER_RETIRED',message:'퇴직 처리된 기사 계정입니다. 재입사 승인 후 로그인할 수 있습니다.'};
    }
    const response = {ok:true, driver:result.driver,
      manager:role === 'MASTER' || role === 'MANAGER', role:role};
    if (body.date && !role) {
      response.schedule = bus70SecureScheduleForDriver_(driverId, body.date, result.driver);
    }
    if (!role && typeof bus70DriverAlertSettingsGet_ === 'function') {
      response.alertSettings = bus70DriverAlertSettingsGet_(driverId).settings;
    }
    return response;
  }
  if (action === 'logout') {
    bus70RevokeSession_(body.token);
    return {ok:true, message:'로그아웃되었습니다.'};
  }
  if (action === 'confirmSchedule') {
    if (body.driverId && String(body.driverId).trim() !== driverId) {
      return {ok:false, error:'DRIVER_MISMATCH', message:'로그인 기사와 요청 기사가 다릅니다.'};
    }
    return bus70ConfirmCurrentDispatch_(Object.assign({}, body, {driverId:driverId}));
  }
  if (action === 'myScheduleSecure') {
    if (body.driverId && String(body.driverId).trim() !== driverId) {
      return {ok:false, error:'DRIVER_MISMATCH', message:'로그인 기사와 요청 기사가 다릅니다.'};
    }
    return bus70SecureScheduleForDriver_(driverId, body.date);
  }
  if (action === 'driverAlertSettingsGet') return bus70DriverAlertSettingsGet_(driverId);
  if (action === 'driverAlertSettingsSave') return bus70DriverAlertSettingsSave_(body, driverId);
  if (action === 'driverRunLogs') return bus70DriverRunLogs_(body, driverId);
  if (action === 'driverRunLogSave') return bus70DriverRunLogSave_(body, driverId);
  if (action === 'route5ReferenceData' && typeof bus70Route5ReferenceData_ === 'function') {
    const route5Driver=apiGetDriver_(driverId);return bus70Route5ReferenceData_(body.date,route5Driver&&route5Driver.driver);
  }
  if (action === 'route70ReferenceData' && typeof bus70Route70ReferenceData_ === 'function') {
    const route70Driver=apiGetDriver_(driverId);return bus70Route70ReferenceData_(body.date,route70Driver&&route70Driver.driver);
  }
  if (action === 'validateDispatchBoard' || action === 'registerDispatchBoard') {
    return bus70BoardAction_(body, driverId);
  }
  if (action === 'managerDispatchBootstrap' || action === 'saveManagerDispatchDay') {
    return bus70ManagerAction_(body, driverId);
  }
  if (action === 'managerAccountList' || action === 'managerAccountUpsert') {
    return bus70ManagerAction_(body, driverId);
  }
  if (action === 'masterAdminBootstrap' || action === 'masterStaffUpsert' || action === 'masterDriverUpsert') {
    return bus70ManagerAction_(body, driverId);
  }
  if (action === 'changeStaffPassword') {
    return bus70ChangeStaffPassword_(body, driverId);
  }
  return {ok:false, error:'UNKNOWN_ACTION', message:'지원하지 않는 요청입니다.'};
}

function bus70SecureScheduleForDriver_(driverId, date, knownDriver) {
  const driverResult=knownDriver?{driver:knownDriver}:apiGetDriver_(driverId);
  const driver=driverResult&&driverResult.driver||knownDriver||{};
  const effectiveDriver=bus70DriverContextForDate_(driver,date);
  const homeRoute=bus70DriverReferenceRoute_(effectiveDriver),assignedRoute=bus70ConfirmedAssignedRoute_(driverId,date),expectedRoute=assignedRoute||homeRoute;
  if(assignedRoute&&assignedRoute!==homeRoute){effectiveDriver.homeRoute=homeRoute;effectiveDriver.route=assignedRoute;effectiveDriver.assignmentRouteOverride=true;}
  const confirmed=expectedRoute?bus70ConfirmedRouteScheduleForDriver_(effectiveDriver,date,expectedRoute):null;
  const base=apiMySchedule_({parameter:{driverId:driverId,date:date}});
  const baseRoute=bus70ScheduleRoute_(base,'70');
  let schedule=null;
  if(confirmed){
    schedule=confirmed;
  }else if(base&&base.ok&&base.type==='WORK'&&(!expectedRoute||baseRoute===expectedRoute)) {
    schedule=base;
  } else {
    schedule=bus70ReferenceScheduleForDriver_(effectiveDriver,date);
  }
  if(!schedule&&base&&base.ok&&base.type==='WORK'&&expectedRoute&&baseRoute!==expectedRoute){
    return {ok:false,error:'ROUTE_SCHEDULE_MISMATCH',message:'선택 날짜의 '+expectedRoute+'번 노선 배차가 아직 확정되지 않았습니다. 다른 노선 배차는 표시하지 않습니다.',date:normalizeDate_(date),route:expectedRoute,rejectedRoute:baseRoute,routeStory:effectiveDriver.routeStory||[]};
  }
  schedule=schedule||base;
  if(schedule&&expectedRoute){
    schedule.route=expectedRoute;
    if(schedule.dispatch)schedule.dispatch.route=expectedRoute;
    if(schedule.vehicle)schedule.vehicle.route=expectedRoute;
  }
  if(schedule){schedule.driverContext={driverId:driverId,name:String(effectiveDriver.name||''),empId:String(effectiveDriver.empId||''),route:expectedRoute,homeRoute:String(effectiveDriver.homeRoute||expectedRoute),assignmentRouteOverride:Boolean(effectiveDriver.assignmentRouteOverride),shift:String(effectiveDriver.shift||'')};schedule.routeStory=effectiveDriver.routeStory||[];schedule.temporalState=bus70ScheduleTemporalState_(date);}
  schedule=bus70ScheduleWithAdjustments_(schedule,date);
  return bus70EnrichDriverSchedule_(schedule,driverId,date);
}

function bus70ScheduleTemporalState_(rawDate) {
  const date=normalizeDate_(rawDate);if(!date)return '';
  let current='';
  try{if(typeof bus70ServiceDateKey_==='function')current=bus70ServiceDateKey_(new Date());}catch(error){current='';}
  if(!current){try{current=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');}catch(error){current=normalizeDate_(new Date());}}
  current=normalizeDate_(current);
  return date<current?'PAST':date>current?'FUTURE':'CURRENT';
}

function bus70DriverReferenceRoute_(driver) {
  return String(driver&&(
    driver.route||driver.currentRoute||driver.routeId||driver['현재노선']
  )||'').trim().replace(/\s/g,'').replace(/번$/,'');
}

function bus70ScheduleRoute_(schedule, fallback) {
  const direct=bus70DriverReferenceRoute_({route:schedule&&(schedule.route||(schedule.vehicle&&schedule.vehicle.route)||(schedule.dispatch&&schedule.dispatch.route))});
  if(direct)return direct;
  const marker=String(schedule&&((schedule.dispatch&&(schedule.dispatch.dispatchId||schedule.dispatch.id||schedule.dispatch.scheduleVersion))||schedule.scheduleVersion)||'');
  const match=marker.match(/(?:DSP-|R)(\d+)-/i);
  return match?match[1]:String(fallback||'');
}

function bus70AuthDispatchRoute_(row, columns) {
  const direct=columns['노선']!==undefined?String(row[columns['노선']]||'').replace(/\D/g,''):'';
  if(direct)return direct;
  const marker=String(row[columns['dispatchId']]||'')+' '+String(row[columns['시간표버전']]||'');
  const match=marker.match(/(?:DSP-|R)(5|70)-/i)||marker.match(/R(5|70)/i);
  return match?match[1]:'70';
}

function bus70ConfirmedAssignedRoute_(driverId, rawDate) {
  const date=normalizeDate_(rawDate),routes={};if(!driverId||!date)return '';
  try{
    const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('배차DB');if(!sheet||sheet.getLastRow()<2)return '';
    const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]);
    rows.slice(1).forEach(function(row){if(normalizeDate_(row[c['날짜']])===date&&String(row[c['기사ID']]||'')===String(driverId)&&String(row[c['상태']]||'')==='확정')routes[bus70AuthDispatchRoute_(row,c)]=true;});
  }catch(error){return '';}
  const keys=Object.keys(routes).filter(Boolean);return keys.length===1?keys[0]:'';
}

function bus70RouteReferenceDataForAuth_(route, date, driver) {
  try{
    if(route==='5'&&typeof bus70Route5ReferenceData_==='function')return bus70Route5ReferenceData_(date,driver);
    if(route==='70'&&typeof bus70Route70ReferenceData_==='function')return bus70Route70ReferenceData_(date,driver);
  }catch(error){console.error('Confirmed route timetable failed: '+route,error);}
  return null;
}

function bus70ConfirmedRouteScheduleForDriver_(driver, rawDate, route) {
  const date=normalizeDate_(rawDate),driverId=String(driver&&driver.driverId||'');
  if(!date||!driverId)return null;
  let ss,dispatchSheet;
  try{ss=SpreadsheetApp.getActiveSpreadsheet();dispatchSheet=ss.getSheetByName('배차DB');}catch(error){return null;}
  if(!dispatchSheet||dispatchSheet.getLastRow()<2)return null;
  const rows=dispatchSheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]);let row=null;
  for(let i=1;i<rows.length;i++){
    if(normalizeDate_(rows[i][c['날짜']])===date&&String(rows[i][c['기사ID']]||'')===driverId&&String(rows[i][c['상태']]||'')==='확정'&&bus70AuthDispatchRoute_(rows[i],c)===route){row=rows[i];break;}
  }
  if(!row)return null;
  const reference=bus70RouteReferenceDataForAuth_(route,date,driver);
  if(!reference||!reference.ok){
    if(route==='70')return null;
    return {ok:false,error:'ROUTE_TIMETABLE_NOT_CONFIGURED',message:date+' '+route+'번 노선 배차는 저장되었지만 탕별 시간표 기준자료가 없습니다.',date:date,route:route};
  }
  const sequence=Number(row[c['순차']]||0),vehicleId=String(row[c['차량ID']]||''),assignment=(reference.assignments||[]).find(function(item){return Number(item.sequence)===sequence;}),trips=(reference.trips||[]).filter(function(item){return Number(item.sequence)===sequence;});
  if(!sequence||!trips.length)return {ok:false,error:'ROUTE_TIMETABLE_NOT_CONFIGURED',message:route+'번 '+sequence+'순차의 탕별 시간표가 없습니다.',date:date,route:route};
  let vehicleNo=String(assignment&&assignment.vehicleNo||'').replace(/\D/g,''),vehicleStatus='운행';
  const vehicleSheet=ss.getSheetByName('차량DB');
  if(vehicleSheet&&vehicleSheet.getLastRow()>1){const vr=vehicleSheet.getDataRange().getDisplayValues(),vc=makeHeaderMap_(vr[0]);for(let j=1;j<vr.length;j++)if(String(vr[j][vc['vehicleId']]||'')===vehicleId){vehicleNo=String(vr[j][vc['차량번호']]||'').replace(/\D/g,'')||vehicleNo;vehicleStatus=String(vr[j][vc['상태']]||vehicleStatus);break;}}
  if(!vehicleNo)vehicleNo=vehicleId.replace(/\D/g,'').slice(-4);
  const dispatchId=String(row[c['dispatchId']]||''),scheduleVersion=String(row[c['시간표버전']]||reference.scheduleVersion||'');
  return {ok:true,type:'WORK',route:route,date:date,driverId:driverId,dispatch:{id:dispatchId,dispatchId:dispatchId,date:date,shift:String(row[c['근무조']]||reference.shift||''),seq:sequence,sequence:sequence,vehicleId:vehicleId,vehicleNo:vehicleNo,scheduleVersion:scheduleVersion,status:'확정',route:route},vehicle:{vehicleId:vehicleId,id:vehicleId,vehicleNo:vehicleNo,no:vehicleNo,displayNo:vehicleNo.length===4?'경기71아'+vehicleNo:vehicleNo,route:route,status:vehicleStatus},scheduleVersion:scheduleVersion,trips:trips,operationRule:(reference.sequenceOperations||[]).find(function(item){return Number(item.sequence)===sequence;})||null,operatingRules:reference.operatingRules||null,routeProfile:reference.routeProfile||null,sourceNote:reference.sourceNote||'',verificationStatus:reference.verificationStatus||'',dispatchSource:'CONFIRMED_ROUTE_DB'};
}

function bus70DriverContextForDate_(driver, rawDate) {
  const result={};Object.keys(driver||{}).forEach(function(key){result[key]=driver[key];});
  const date=normalizeDate_(rawDate),driverId=String(result.driverId||''),events=[];
  if(date&&driverId){
    try{
      const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('근무변경DB');
      if(sheet&&sheet.getLastRow()>1){
        const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]);
        rows.slice(1).forEach(function(row,index){
          if(String(row[c['기사ID']]||'')!==driverId)return;
          const type=String(row[c['유형']]||''),effectiveDate=normalizeDate_(row[c['날짜']]);
          if(!effectiveDate||['노선이동','재입사'].indexOf(type)===-1)return;
          events.push({date:effectiveDate,type:type,previousRoute:String(row[c['변경전노선']]||''),route:String(row[c['변경노선']]||''),previousEmpId:String(row[c['이전사원번호']]||''),empId:String(row[c['새사원번호']]||''),previousShift:String(row[c['변경전근무조']]||''),shift:String(row[c['변경근무조']]||''),previousDriverType:String(row[c['변경전기사구분']]||''),driverType:String(row[c['변경기사구분']]||''),index:index});
        });
      }
    }catch(historyError){console.error('Driver route story failed',historyError);}
  }
  events.sort(function(a,b){return a.date.localeCompare(b.date)||a.index-b.index;});
  if(events.length){
    const first=events[0];
    if(first.previousRoute)result.route=first.previousRoute;
    if(first.previousEmpId)result.empId=first.previousEmpId;
    if(first.previousShift)result.shift=first.previousShift;
    if(first.previousDriverType)result.driverType=first.previousDriverType;
    events.forEach(function(event){
      if(event.date>date)return;
      if(event.route)result.route=event.route;
      if(event.empId)result.empId=event.empId;
      if(event.shift)result.shift=event.shift;
      if(event.driverType)result.driverType=event.driverType;
    });
  }
  result.routeStory=events.map(function(event){return {date:event.date,type:event.type,previousRoute:event.previousRoute,route:event.route,previousEmpId:event.previousEmpId,empId:event.empId,previousShift:event.previousShift,shift:event.shift,driverType:event.driverType,state:event.date<date?'과거':event.date===date?'적용':'예정'};});
  result.contextDate=date;
  return result;
}

function bus70ReferenceScheduleForDriver_(driver, date) {
  const providers=[];
  if(typeof bus70Route5ScheduleForDriver_==='function') providers.push({route:'5',load:bus70Route5ScheduleForDriver_});
  if(typeof bus70Route70ScheduleForDriver_==='function') providers.push({route:'70',load:bus70Route70ScheduleForDriver_});
  const preferred=bus70DriverReferenceRoute_(driver);
  const eligible=preferred?providers.filter(function(provider){return provider.route===preferred;}):providers;
  for(let i=0;i<eligible.length;i++){
    try {
      const schedule=eligible[i].load(driver,date);
      if(schedule&&schedule.ok&&schedule.type==='WORK'){
        schedule.route=eligible[i].route;
        if(schedule.dispatch)schedule.dispatch.route=eligible[i].route;
        if(schedule.vehicle)schedule.vehicle.route=eligible[i].route;
        return schedule;
      }
    } catch(referenceError) {
      console.error('Route reference schedule failed: '+eligible[i].route,referenceError);
    }
  }
  return null;
}

function bus70EnrichDriverSchedule_(schedule, driverId, rawDate) {
  if (!schedule || !schedule.ok || schedule.type !== 'WORK') return schedule;
  const date=normalizeDate_(rawDate);
  try { bus70AttachLocationReferences_(schedule); } catch (locationError) {
    console.error('Location reference attachment failed', locationError);
  }
  try {
    const result=bus70DriverRunLogs_({from:date,to:date},driverId);
    schedule.runLogs=result&&result.ok?result.logs:[];
  } catch (runLogError) {
    console.error('Driver run-log attachment failed', runLogError);
    schedule.runLogs=[];
  }
  return schedule;
}

function bus70LocationNumber_(value, min, max) {
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const number=Number(value);
  return Number.isFinite(number)&&number>=min&&number<=max?number:null;
}

function bus70LocationRouteKey_(value) {
  return String(value||'').trim().replace(/\s/g,'').replace(/번$/,'');
}

function bus70AttachLocationReferences_(schedule) {
  if(!Array.isArray(schedule.trips)||!schedule.trips.length)return schedule;
  const headers=['기준점ID','노선','순차','탕','구분','지점명','위도','경도','반경m','사용여부','수정시간'];
  const sheet=bus70EnsureDriverFeatureSheet_('노선위치기준DB',headers);
  const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]);
  const route=bus70LocationRouteKey_(schedule.route||(schedule.vehicle&&schedule.vehicle.route)||(schedule.dispatch&&schedule.dispatch.route)||'70');
  const sequence=Number(schedule.dispatch&&(schedule.dispatch.seq||schedule.dispatch.sequence)||0);
  const references=rows.slice(1).map(function(row){
    const lat=bus70LocationNumber_(row[c['위도']],-90,90),lng=bus70LocationNumber_(row[c['경도']],-180,180);
    return {id:String(row[c['기준점ID']]||''),route:bus70LocationRouteKey_(row[c['노선']]),sequence:Number(row[c['순차']]||0),trip:Number(row[c['탕']]||0),phase:String(row[c['구분']]||'공통').trim(),place:String(row[c['지점명']]||'').trim(),lat:lat,lng:lng,radiusM:bus70LocationNumber_(row[c['반경m']],20,500)||80,enabled:String(row[c['사용여부']]||'Y').toUpperCase()!=='N'};
  }).filter(function(v){return v.enabled&&v.lat!==null&&v.lng!==null&&(!v.route||v.route===route);});
  let configured=0,required=0;
  const phaseInfo=[['start','발차','startPlace','startTime'],['turn','회차','turnPlace','turnTime'],['end','도착','endPlace','endTime']];
  schedule.trips.forEach(function(trip){
    phaseInfo.forEach(function(info){
      const key=info[0],phase=info[1],placeKey=info[2],timeKey=info[3],existing=trip[key+'Location'];
      if(trip[timeKey]||trip[placeKey])required++;
      if(existing&&bus70LocationNumber_(existing.lat,-90,90)!==null&&bus70LocationNumber_(existing.lng,-180,180)!==null){
        existing.radiusM=bus70LocationNumber_(existing.radiusM,20,500)||80;configured++;return;
      }
      const place=String(trip[placeKey]||'').trim(),tripNo=Number(trip.trip||0);
      const candidates=references.filter(function(v){
        if(v.sequence&&v.sequence!==sequence)return false;
        if(v.trip&&v.trip!==tripNo)return false;
        if(v.phase!=='공통'&&v.phase!==phase)return false;
        if(v.place&&place&&v.place!==place)return false;
        if(v.place&&!place&&!v.sequence&&!v.trip)return false;
        return true;
      }).sort(function(a,b){
        const score=function(v){return (v.route?16:0)+(v.sequence?8:0)+(v.trip?4:0)+(v.phase===phase?2:0)+(v.place?1:0);};
        return score(b)-score(a);
      });
      if(!candidates.length)return;
      const match=candidates[0];
      trip[key+'Location']={referenceId:match.id,lat:match.lat,lng:match.lng,radiusM:match.radiusM,place:match.place||place,phase:phase};
      if(!trip[placeKey]&&match.place)trip[placeKey]=match.place;
      configured++;
    });
  });
  schedule.locationTracking={route:route,configuredPoints:configured,requiredPoints:required,serviceDayCutoff:'03:30',source:'노선위치기준DB'};
  return schedule;
}

function bus70EnsureDriverFeatureSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    const current = sheet.getDataRange().getDisplayValues()[0] || [];
    headers.forEach(function(header){
      if (current.indexOf(header) < 0) {
        current.push(header);
        sheet.getRange(1, current.length).setValue(header);
      }
    });
  }
  return sheet;
}

function bus70DriverAlertSettingsGet_(driverId) {
  const sheet = bus70EnsureDriverFeatureSheet_('알림설정DB', ['기사ID','출근알림분','탕알림분','정시알림','음성안내','진동','알람음모드','알람음표시명','사용여부','수정시간']);
  const rows = sheet.getDataRange().getDisplayValues(), c = makeHeaderMap_(rows[0]);
  for (let i = 1; i < rows.length; i++) if (String(rows[i][c['기사ID']] || '') === driverId) {
    return {ok:true, settings:bus70AlertSettingsFromRow_(rows[i], c)};
  }
  return {ok:true, settings:{commuteMinutes:[60,15], tripMinutes:[10,3], exact:true, voice:true, vibration:true, soundMode:'SYSTEM_DEFAULT', soundName:'휴대폰 기본 알람음', enabled:true}};
}

function bus70AlertMinutes_(value, fallback) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  const result = source.map(Number).filter(function(v){return Number.isInteger(v) && v >= 0 && v <= 180;})
    .filter(function(v,i,a){return a.indexOf(v) === i;}).sort(function(a,b){return b-a;});
  return result.length ? result.slice(0, 4) : fallback;
}

function bus70AlertSettingsFromRow_(row, c) {
  return {
    commuteMinutes:bus70AlertMinutes_(row[c['출근알림분']], [60,15]),
    tripMinutes:bus70AlertMinutes_(row[c['탕알림분']], [10,3]),
    exact:String(row[c['정시알림']] || 'Y') !== 'N',
    voice:String(row[c['음성안내']] || 'Y') !== 'N',
    vibration:String(row[c['진동']] || 'Y') !== 'N',
    soundMode:String(row[c['알람음모드']] || 'SYSTEM_DEFAULT'),
    soundName:String(row[c['알람음표시명']] || '휴대폰 기본 알람음'),
    enabled:String(row[c['사용여부']] || 'Y') !== 'N'
  };
}

function bus70DriverAlertSettingsSave_(body, driverId) {
  const settings = {
    commuteMinutes:bus70AlertMinutes_(body.commuteMinutes, [60,15]),
    tripMinutes:bus70AlertMinutes_(body.tripMinutes, [10,3]),
    exact:body.exact !== false, voice:body.voice !== false,
    vibration:body.vibration !== false,
    soundMode:['SYSTEM_DEFAULT','DEVICE_SELECTED'].indexOf(String(body.soundMode||''))>=0?String(body.soundMode):'SYSTEM_DEFAULT',
    soundName:String(body.soundName||'휴대폰 기본 알람음').slice(0,80),
    enabled:body.enabled !== false
  };
  const sheet = bus70EnsureDriverFeatureSheet_('알림설정DB', ['기사ID','출근알림분','탕알림분','정시알림','음성안내','진동','알람음모드','알람음표시명','사용여부','수정시간']);
  const rows = sheet.getDataRange().getDisplayValues(), c = makeHeaderMap_(rows[0]); let rowNo = 0;
  for (let i = 1; i < rows.length; i++) if (String(rows[i][c['기사ID']] || '') === driverId) {rowNo=i+1;break;}
  const row = new Array(rows[0].length).fill('');
  row[c['기사ID']]=driverId; row[c['출근알림분']]=settings.commuteMinutes.join(','); row[c['탕알림분']]=settings.tripMinutes.join(',');
  row[c['정시알림']]=settings.exact?'Y':'N'; row[c['음성안내']]=settings.voice?'Y':'N'; row[c['진동']]=settings.vibration?'Y':'N'; row[c['사용여부']]=settings.enabled?'Y':'N'; row[c['수정시간']]=new Date();
  row[c['알람음모드']]=settings.soundMode; row[c['알람음표시명']]=settings.soundName;
  if(rowNo) sheet.getRange(rowNo,1,1,row.length).setValues([row]); else sheet.appendRow(row);
  return {ok:true,settings:settings,message:'기사 알림 설정을 저장했습니다.'};
}

function bus70DriverRunLogs_(body, driverId) {
  const from = normalizeDate_(body.from), to = normalizeDate_(body.to || body.from);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('운행일지');
  if (!sheet || sheet.getLastRow() < 2) return {ok:true,logs:[]};
  const rows=sheet.getDataRange().getDisplayValues(), c=makeHeaderMap_(rows[0]);
  const logs=rows.slice(1).filter(function(r){const d=normalizeDate_(r[c['날짜']]);return String(r[c['기사ID']]||'')===driverId&&(!from||d>=from)&&(!to||d<=to);})
    .map(function(r){return {logId:String(r[c['logId']]||''),date:normalizeDate_(r[c['날짜']]),driverName:String(r[c['기사명']]||''),empId:String(r[c['사원번호']]||''),route:String(r[c['노선']]||''),dispatchId:String(r[c['배차ID']]||''),vehicleId:String(r[c['차량ID']]||''),sequence:Number(r[c['순차']]||0),trip:Number(r[c['탕']]||0),plannedStart:String(r[c['발차예정']]||''),actualStart:String(r[c['발차실제']]||''),plannedTurn:String(r[c['회차예정']]||''),actualTurn:String(r[c['회차실제']]||''),plannedEnd:String(r[c['도착예정']]||''),actualEnd:String(r[c['도착실제']]||''),plannedFrontGap:String(r[c['앞차예정간격']]||''),actualFrontGap:String(r[c['앞차실제간격']]||''),frontDeviation:String(r[c['앞차편차']]||''),plannedRearGap:String(r[c['뒷차예정간격']]||''),actualRearGap:String(r[c['뒷차실제간격']]||''),rearDeviation:String(r[c['뒷차편차']]||''),status:String(r[c['상태']]||''),note:String(r[c['비고']]||''),startRecordMode:String(r[c['발차기록방식']]||''),startLatitude:String(r[c['발차위도']]||''),startLongitude:String(r[c['발차경도']]||''),startAccuracyM:String(r[c['발차정확도m']]||''),turnRecordMode:String(r[c['회차기록방식']]||''),turnLatitude:String(r[c['회차위도']]||''),turnLongitude:String(r[c['회차경도']]||''),turnAccuracyM:String(r[c['회차정확도m']]||''),endRecordMode:String(r[c['도착기록방식']]||''),endLatitude:String(r[c['도착위도']]||''),endLongitude:String(r[c['도착경도']]||''),endAccuracyM:String(r[c['도착정확도m']]||''),breakChargeConnectedAt:String(r[c['휴식충전연결']]||''),breakChargeDisconnectedAt:String(r[c['휴식충전해제']]||''),serviceEndType:String(r[c['영업종료형태']]||''),serviceEndPlace:String(r[c['영업종료지']]||''),deadheadDestination:String(r[c['회송목적지']]||''),deadheadReturnedAt:String(r[c['회송완료']]||''),cleanedAt:String(r[c['청소완료']]||''),chargerConnectedAt:String(r[c['충전잭연결']]||''),officeChargeStatus:String(r[c['사무실충전확인']]||''),shiftEndedAt:String(r[c['근무종료시간']]||'')};});
  logs.sort(function(a,b){return b.date.localeCompare(a.date)||b.sequence-a.sequence||b.trip-a.trip;});
  return {ok:true,logs:logs};
}

function bus70DriverRunLogSave_(body, driverId) {
  const date=normalizeDate_(body.date), sequence=Number(body.sequence||0), trip=Number(body.trip||0), event=String(body.event||'');
  const allowedEvents=['DEPART','TURN','ARRIVE','BREAK_CHARGE_CONNECTED','BREAK_CHARGE_DISCONNECTED','SERVICE_END','DEADHEAD_RETURN','CLEANING_DONE','CHARGER_CONNECTED','SHIFT_END'];
  if(!date||!Number.isInteger(sequence)||sequence<1||sequence>99||!Number.isInteger(trip)||trip<1||trip>20||allowedEvents.indexOf(event)<0) return {ok:false,error:'PARAM_REQUIRED',message:'운행기록 정보를 확인하세요.'};
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
  const logHeaders=['logId','날짜','기사ID','차량ID','순차','탕','발차예정','발차실제','회차예정','회차실제','도착예정','도착실제','앞차예정간격','앞차실제간격','앞차편차','뒷차예정간격','뒷차실제간격','뒷차편차','시간표버전','노선버전','상태','비고','발차기록방식','발차위도','발차경도','발차정확도m','회차기록방식','회차위도','회차경도','회차정확도m','도착기록방식','도착위도','도착경도','도착정확도m','휴식충전연결','휴식충전해제','영업종료형태','영업종료지','회송목적지','회송완료','청소완료','충전잭연결','사무실충전확인','근무종료시간','기사명','사원번호','노선','배차ID'];
  const ss=SpreadsheetApp.getActiveSpreadsheet(), dispatch=ss.getSheetByName('배차DB'), logSheet=bus70EnsureDriverFeatureSheet_('운행일지',logHeaders);
  let currentVehicleId='',currentScheduleVersion='',currentRoute='',currentDispatchId='';
  if(dispatch){
    const dr=dispatch.getDataRange().getDisplayValues(),dc=makeHeaderMap_(dr[0]);
    for(let i=1;i<dr.length;i++) if(normalizeDate_(dr[i][dc['날짜']])===date&&Number(dr[i][dc['순차']])===sequence&&String(dr[i][dc['기사ID']]||'')===driverId&&String(dr[i][dc['상태']]||'')==='확정'){currentVehicleId=String(dr[i][dc['차량ID']]||'');currentScheduleVersion=String(dr[i][dc['시간표버전']]||'');currentRoute=bus70AuthDispatchRoute_(dr[i],dc);currentDispatchId=String(dr[i][dc['dispatchId']]||'');break;}
  }
  // 사진 판독 기준자료로 로그인한 실제 테스터도 같은 운행일지 구조를
  // 사용한다. 노선·기사명·날짜·순차가 모두 일치할 때만 참조 배차를 인정한다.
  if(!currentVehicleId){
    const driverResult=apiGetDriver_(driverId),reference=bus70ReferenceScheduleForDriver_(driverResult&&driverResult.driver,date);
    if(reference&&reference.ok&&reference.type==='WORK'&&Number(reference.dispatch&&(reference.dispatch.seq||reference.dispatch.sequence))===sequence){currentVehicleId=String(reference.dispatch.vehicleId||reference.vehicle&&reference.vehicle.vehicleId||'');currentScheduleVersion=String(reference.dispatch.scheduleVersion||reference.scheduleVersion||'');currentRoute=bus70ScheduleRoute_(reference,'');currentDispatchId=String(reference.dispatch.dispatchId||reference.dispatch.id||'');}
  }
  if(!currentVehicleId) return {ok:false,error:'DISPATCH_NOT_FOUND',message:'로그인 기사에게 확정된 배차를 찾을 수 없습니다.'};
  const rows=logSheet.getDataRange().getDisplayValues(), c=makeHeaderMap_(rows[0]); let rowNo=0;
  for(let j=1;j<rows.length;j++) if(normalizeDate_(rows[j][c['날짜']])===date&&String(rows[j][c['기사ID']]||'')===driverId&&Number(rows[j][c['순차']])===sequence&&Number(rows[j][c['탕']])===trip){rowNo=j+1;break;}
  const row=rowNo?rows[rowNo-1].slice():new Array(rows[0].length).fill(''), now=new Date();
  if(!rowNo){const driverResult=apiGetDriver_(driverId),identity=bus70DriverContextForDate_(driverResult&&driverResult.driver||{driverId:driverId},date);row[c['logId']]=newId_('RUN');row[c['날짜']]=date;row[c['기사ID']]=driverId;row[c['차량ID']]=currentVehicleId;row[c['순차']]=sequence;row[c['탕']]=trip;row[c['발차예정']]=String(body.plannedStart||'');row[c['회차예정']]=String(body.plannedTurn||'');row[c['도착예정']]=String(body.plannedEnd||'');row[c['앞차예정간격']]=String(body.plannedFrontGap||'');row[c['뒷차예정간격']]=String(body.plannedRearGap||'');row[c['시간표버전']]=currentScheduleVersion;row[c['기사명']]=String(identity.name||'');row[c['사원번호']]=String(identity.empId||'');row[c['노선']]=String(currentRoute||identity.route||'');row[c['배차ID']]=currentDispatchId;}
  const locationMode=String(body.source||'MANUAL')==='GPS_AUTO'?'GPS 자동':'수동';
  const latitude=bus70LocationNumber_(body.latitude,-90,90),longitude=bus70LocationNumber_(body.longitude,-180,180),accuracy=bus70LocationNumber_(body.accuracy,0,5000);
  const locationColumns={DEPART:['발차기록방식','발차위도','발차경도','발차정확도m'],TURN:['회차기록방식','회차위도','회차경도','회차정확도m'],ARRIVE:['도착기록방식','도착위도','도착경도','도착정확도m']};
  function applyLocation_(eventName){const columns=locationColumns[eventName];if(!columns)return;row[c[columns[0]]]=locationMode;if(latitude!==null&&longitude!==null){row[c[columns[1]]]=latitude;row[c[columns[2]]]=longitude;if(accuracy!==null)row[c[columns[3]]]=Math.round(accuracy);}}
  let alreadyRecorded=false,actualAt=now;
  if(event==='DEPART'){
    if(row[c['발차실제']]){alreadyRecorded=true;actualAt=row[c['발차실제']];}
    else {row[c['발차실제']]=now;row[c['상태']]='운행중';applyLocation_(event);}
  }
  else if(event==='TURN'){
    if(row[c['회차실제']]){alreadyRecorded=true;actualAt=row[c['회차실제']];}
    else if(!row[c['발차실제']])return {ok:false,error:'DEPART_REQUIRED',message:'발차 기록 후 회차 시간을 기록하세요.'};
    else {row[c['회차실제']]=now;row[c['상태']]='회차완료';applyLocation_(event);}
  }
  else if(event==='ARRIVE'){
    if(row[c['도착실제']]){alreadyRecorded=true;actualAt=row[c['도착실제']];}
    else {row[c['도착실제']]=now;row[c['상태']]='완료';applyLocation_(event);}
  }
  else if(event==='BREAK_CHARGE_CONNECTED'){if(!row[c['도착실제']])return {ok:false,error:'ARRIVE_REQUIRED',message:'탕 운행 도착 기록 후 충전잭을 연결하세요.'};row[c['휴식충전연결']]=now;row[c['상태']]='휴식충전중';}
  else if(event==='BREAK_CHARGE_DISCONNECTED'){if(!row[c['휴식충전연결']])return {ok:false,error:'BREAK_CHARGE_REQUIRED',message:'휴식 충전잭 연결 기록을 먼저 확인하세요.'};row[c['휴식충전해제']]=now;row[c['상태']]='다음운행준비';}
  else if(event==='SERVICE_END'){row[c['도착실제']]=row[c['도착실제']]||now;row[c['영업종료형태']]=String(body.serviceEndType||'UPBOUND_ONLY');row[c['영업종료지']]=String(body.serviceEndPlace||'').slice(0,80);row[c['회송목적지']]=String(body.deadheadDestination||'').slice(0,80);row[c['상태']]='영업종료';}
  else if(event==='DEADHEAD_RETURN'){if(!row[c['영업종료지']])return {ok:false,error:'SERVICE_END_REQUIRED',message:'먼저 막탕 영업종료를 기록하세요.'};row[c['회송완료']]=now;row[c['상태']]='차고지회송완료';}
  else if(event==='CLEANING_DONE'){if(!row[c['회송완료']])return {ok:false,error:'DEADHEAD_REQUIRED',message:'먼저 차고지 회송 완료를 기록하세요.'};row[c['청소완료']]=now;row[c['상태']]='청소완료';}
  else if(event==='CHARGER_CONNECTED'){if(!row[c['청소완료']])return {ok:false,error:'CLEANING_REQUIRED',message:'퇴근 전 차량 청소를 먼저 완료하세요.'};row[c['충전잭연결']]=now;row[c['사무실충전확인']]='사무실 모니터 확인';row[c['상태']]='충전잭연결';}
  else if(event==='SHIFT_END'){if(!row[c['충전잭연결']])return {ok:false,error:'CHARGER_REQUIRED',message:'충전잭 연결 완료 후 퇴근 처리하세요.'};row[c['근무종료시간']]=now;row[c['상태']]='근무종료';}
  if(body.note) row[c['비고']]=String(body.note).slice(0,200);
  if(!alreadyRecorded){if(rowNo)logSheet.getRange(rowNo,1,1,row.length).setValues([row]);else logSheet.appendRow(row);}
  const messages={DEPART:'발차 시간을 기록했습니다.',TURN:'회차 시간을 기록했습니다.',ARRIVE:'도착 시간을 기록했습니다.',BREAK_CHARGE_CONNECTED:'기사 판단에 따른 휴식 충전잭 연결을 기록했습니다.',BREAK_CHARGE_DISCONNECTED:'다음 운행 전 충전잭 분리와 출발 준비를 기록했습니다.',SERVICE_END:'막탕 상행 영업종료를 기록했습니다.',DEADHEAD_RETURN:'고강동공영차고지 회송 완료를 기록했습니다.',CLEANING_DONE:'퇴근 전 차량 청소 완료를 기록했습니다.',CHARGER_CONNECTED:'다음 조 운행을 위한 필수 충전잭 연결을 기록했습니다. 충전 상태는 사무실 모니터에서 확인합니다.',SHIFT_END:'근무 종료와 퇴근 처리를 기록했습니다.'};
  const recordedAt=actualAt instanceof Date?Utilities.formatDate(actualAt,'Asia/Seoul','yyyy-MM-dd HH:mm:ss'):String(actualAt||'');
  const modeColumns=locationColumns[event],recordMode=modeColumns?String(row[c[modeColumns[0]]]||locationMode):locationMode;
  return {ok:true,logId:row[c['logId']],event:event,status:row[c['상태']],recordedAt:recordedAt,alreadyRecorded:alreadyRecorded,recordMode:recordMode,message:alreadyRecorded?'이미 기록된 시간은 변경하지 않았습니다.':messages[event]};
  } finally { lock.releaseLock(); }
}

function bus70DriverLoginActive_(driver) {
  const status=String(driver&&driver.status||'').trim();
  return !status||status==='재직'||status==='1';
}

function bus70ScheduleWithAdjustments_(schedule, rawDate) {
  if (!schedule || !schedule.ok || schedule.type !== 'WORK' || !schedule.dispatch || !Array.isArray(schedule.trips)) return schedule;
  const date = normalizeDate_(rawDate), sequence = Number(schedule.dispatch.seq || schedule.dispatch.sequence || 0),route=String(schedule.route||schedule.vehicle&&schedule.vehicle.route||'70').trim().replace(/\s/g,'').replace(/번$/,'');
  if (!date || !sequence) return schedule;
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('배차간격조정DB');
    if (sheet && sheet.getLastRow() >= 2) {
      const rows = sheet.getDataRange().getDisplayValues(), c = makeHeaderMap_(rows[0]), applied = [];
      for (let i = 1; i < rows.length; i++) {
        const rowRoute=c['노선']!==undefined?String(rows[i][c['노선']]||'70').trim().replace(/\s/g,'').replace(/번$/,''):'70';
        const status=c['공지상태']!==undefined?String(rows[i][c['공지상태']]||'확정').trim():'확정';
        if (normalizeDate_(rows[i][c['날짜']]) !== date || Number(rows[i][c['순차']]) !== sequence || rowRoute!==route || status!=='확정') continue;
        const tripNo = Number(rows[i][c['탕']]), phase=c['시간구분']!==undefined?String(rows[i][c['시간구분']]||'').trim():'', before = String(rows[i][c['기존시간']] || '').trim(), after = String(rows[i][c['조정시간']] || '').trim();
        if (!tripNo || !before || !after) continue;
        const trip = schedule.trips.find(function(v){ return Number(v.trip) === tripNo; });
        if (!trip) continue;
        let changed = false;
        const keys=phase==='발차'?['startTime']:phase==='회차'?['turnTime']:phase==='도착'?['endTime']:['startTime','turnTime','endTime'];
        keys.forEach(function(key){if(String(trip[key]||'').trim()===before){const publishedKey='published'+key.charAt(0).toUpperCase()+key.slice(1);if(!trip[publishedKey])trip[publishedKey]=trip[key];trip[key]=after;changed=true;}});
        if (changed) applied.push({route:route,trip:tripNo,phase:phase||'시간',before:before,after:after,status:status,channel:c['공지채널']!==undefined?String(rows[i][c['공지채널']]||''):'',reason:String(rows[i][c['사유']] || '')});
      }
      if (applied.length) schedule.timeAdjustments = applied;
    }
  } catch (ignore) {}
  try { bus70AttachPlannedHeadways_(schedule); } catch (ignore) {}
  return schedule;
}

function bus70OperationalMinutes_(value) {
  const match=String(value||'').match(/^(\d{1,2}):(\d{2})$/); if(!match)return null;
  let result=Number(match[1])*60+Number(match[2]);
  if(result<210)result+=1440;
  return result;
}

function bus70AttachPlannedHeadways_(schedule) {
  const sequence=Number(schedule.dispatch.seq||schedule.dispatch.sequence||0), version=String(schedule.dispatch.scheduleVersion||schedule.scheduleVersion||'');
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('스케줄');
  if(!sheet||sheet.getLastRow()<2||!sequence)return schedule;
  const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]),starts={};
  rows.slice(1).forEach(function(row){
    if(version&&String(row[c['버전']]||'')!==version)return;
    if(c['상태']!==undefined&&String(row[c['상태']]||'')&&String(row[c['상태']]||'')!=='사용')return;
    const seq=Number(row[c['순차']]||0),trip=Number(row[c['탕']]||0),time=String(row[c['발차시간']]||'');
    if(seq&&trip&&time)starts[seq+'-'+trip]=time;
  });
  schedule.trips.forEach(function(trip){
    const no=Number(trip.trip), own=bus70OperationalMinutes_(trip.startTime), front=bus70OperationalMinutes_(starts[(sequence-1)+'-'+no]), rear=bus70OperationalMinutes_(starts[(sequence+1)+'-'+no]);
    if(own!==null&&front!==null)trip.plannedFrontGapMinutes=own-front;
    if(own!==null&&rear!==null)trip.plannedRearGapMinutes=rear-own;
  });
  schedule.headwayRules={basis:'발차시간',unit:'분',serviceDayCutoff:'03:30',sequence:sequence};
  return schedule;
}

function bus70ConfirmCurrentDispatch_(body) {
  const driverId = String(body.driverId || '').trim();
  const dispatchId = String(body.dispatchId || '').trim();
  const scheduleVersion = String(body.scheduleVersion || '').trim();
  const date = normalizeDate_(body.date);
  if (!driverId || !dispatchId || !scheduleVersion || !date) {
    return {ok:false, error:'PARAM_REQUIRED', message:'배차 확인 정보가 부족합니다.'};
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dispatchSheet = ss.getSheetByName('배차DB');
    const confirmSheet = ss.getSheetByName('배차확인DB');
    if (!dispatchSheet || !confirmSheet) {
      return {ok:false, error:'DB_MISSING', message:'배차 확인 DB를 찾을 수 없습니다.'};
    }

    const dispatchRows = dispatchSheet.getDataRange().getDisplayValues();
    const dc = makeHeaderMap_(dispatchRows[0]);
    let current = null;
    for (let i = 1; i < dispatchRows.length; i++) {
      const row = dispatchRows[i];
      if (String(row[dc['dispatchId']] || '').trim() === dispatchId) { current = row; break; }
    }
    if (!current || normalizeDate_(current[dc['날짜']]) !== date ||
        String(current[dc['기사ID']] || '').trim() !== driverId ||
        String(current[dc['시간표버전']] || '').trim() !== scheduleVersion ||
        String(current[dc['상태']] || '').trim() !== '확정') {
      return {ok:false, error:'DISPATCH_CHANGED', message:'배차가 변경되었습니다. 다시 조회한 뒤 확인하세요.'};
    }

    const confirmRows = confirmSheet.getDataRange().getDisplayValues();
    const cc = makeHeaderMap_(confirmRows[0]);
    for (let j = 1; j < confirmRows.length; j++) {
      const row = confirmRows[j];
      if (normalizeDate_(row[cc['날짜']]) === date &&
          String(row[cc['기사ID']] || '').trim() === driverId &&
          String(row[cc['dispatchId']] || '').trim() === dispatchId &&
          String(row[cc['시간표버전']] || '').trim() === scheduleVersion) {
        if (String(row[cc['재확인필요']] || '').trim() === 'Y') {
          const now = new Date();
          confirmSheet.getRange(j + 1, cc['확인시간'] + 1).setValue(now);
          confirmSheet.getRange(j + 1, cc['캘린더저장'] + 1).setValue(body.calendarSaved ? 'Y' : 'N');
          confirmSheet.getRange(j + 1, cc['알람설정'] + 1).setValue(body.alarmSet ? 'Y' : 'N');
          confirmSheet.getRange(j + 1, cc['마지막동기화'] + 1).setValue(now);
          confirmSheet.getRange(j + 1, cc['재확인필요'] + 1).setValue('N');
          return {ok:true, alreadyConfirmed:false, reConfirmed:true,
            confirmId:String(row[cc['confirmId']] || ''), confirmedAt:formatDateTime_(now),
            message:'변경된 배차 확인이 저장되었습니다.'};
        }
        return {ok:true, alreadyConfirmed:true, confirmId:String(row[cc['confirmId']] || ''),
          confirmedAt:String(row[cc['확인시간']] || ''), message:'이미 확인한 배차입니다.'};
      }
    }

    const now = new Date();
    const confirmId = newId_('CONF');
    confirmSheet.appendRow([confirmId, date, driverId, dispatchId, scheduleVersion, now,
      body.calendarSaved ? 'Y' : 'N', body.alarmSet ? 'Y' : 'N', now, 'N']);
    return {ok:true, alreadyConfirmed:false, confirmId:confirmId,
      confirmedAt:formatDateTime_(now), message:'배차 확인이 저장되었습니다.'};
  } finally {
    lock.releaseLock();
  }
}
