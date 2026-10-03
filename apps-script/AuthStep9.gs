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
      response.schedule = bus70ScheduleWithAdjustments_(apiMySchedule_({parameter:{driverId:result.driver.driverId, date:body.date}}), body.date);
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
      response.schedule = bus70ScheduleWithAdjustments_(apiMySchedule_({parameter:{driverId:driverId, date:body.date}}), body.date);
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
    return bus70ScheduleWithAdjustments_(apiMySchedule_({parameter:{driverId:driverId,date:body.date}}), body.date);
  }
  if (action === 'driverAlertSettingsGet') return bus70DriverAlertSettingsGet_(driverId);
  if (action === 'driverAlertSettingsSave') return bus70DriverAlertSettingsSave_(body, driverId);
  if (action === 'driverRunLogs') return bus70DriverRunLogs_(body, driverId);
  if (action === 'driverRunLogSave') return bus70DriverRunLogSave_(body, driverId);
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
    .map(function(r){return {logId:String(r[c['logId']]||''),date:normalizeDate_(r[c['날짜']]),vehicleId:String(r[c['차량ID']]||''),sequence:Number(r[c['순차']]||0),trip:Number(r[c['탕']]||0),plannedStart:String(r[c['발차예정']]||''),actualStart:String(r[c['발차실제']]||''),plannedEnd:String(r[c['도착예정']]||''),actualEnd:String(r[c['도착실제']]||''),plannedFrontGap:String(r[c['앞차예정간격']]||''),actualFrontGap:String(r[c['앞차실제간격']]||''),frontDeviation:String(r[c['앞차편차']]||''),plannedRearGap:String(r[c['뒷차예정간격']]||''),actualRearGap:String(r[c['뒷차실제간격']]||''),rearDeviation:String(r[c['뒷차편차']]||''),status:String(r[c['상태']]||''),note:String(r[c['비고']]||'')};});
  logs.sort(function(a,b){return b.date.localeCompare(a.date)||b.sequence-a.sequence||b.trip-a.trip;});
  return {ok:true,logs:logs};
}

function bus70DriverRunLogSave_(body, driverId) {
  const date=normalizeDate_(body.date), sequence=Number(body.sequence||0), trip=Number(body.trip||0), event=String(body.event||'');
  if(!date||!Number.isInteger(sequence)||sequence<1||sequence>11||!Number.isInteger(trip)||trip<1||trip>9||['DEPART','ARRIVE'].indexOf(event)<0) return {ok:false,error:'PARAM_REQUIRED',message:'운행기록 정보를 확인하세요.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(), dispatch=ss.getSheetByName('배차DB'), logSheet=ss.getSheetByName('운행일지');
  if(!dispatch||!logSheet) return {ok:false,error:'DB_MISSING',message:'배차 또는 운행일지 DB를 찾을 수 없습니다.'};
  const dr=dispatch.getDataRange().getDisplayValues(), dc=makeHeaderMap_(dr[0]); let current=null;
  for(let i=1;i<dr.length;i++) if(normalizeDate_(dr[i][dc['날짜']])===date&&Number(dr[i][dc['순차']])===sequence&&String(dr[i][dc['기사ID']]||'')===driverId&&String(dr[i][dc['상태']]||'')==='확정'){current=dr[i];break;}
  if(!current) return {ok:false,error:'DISPATCH_NOT_FOUND',message:'로그인 기사에게 확정된 배차를 찾을 수 없습니다.'};
  const rows=logSheet.getDataRange().getDisplayValues(), c=makeHeaderMap_(rows[0]); let rowNo=0;
  for(let j=1;j<rows.length;j++) if(normalizeDate_(rows[j][c['날짜']])===date&&String(rows[j][c['기사ID']]||'')===driverId&&Number(rows[j][c['순차']])===sequence&&Number(rows[j][c['탕']])===trip){rowNo=j+1;break;}
  const row=rowNo?rows[rowNo-1].slice():new Array(rows[0].length).fill(''), now=new Date();
  if(!rowNo){row[c['logId']]=newId_('RUN');row[c['날짜']]=date;row[c['기사ID']]=driverId;row[c['차량ID']]=String(current[dc['차량ID']]||'');row[c['순차']]=sequence;row[c['탕']]=trip;row[c['발차예정']]=String(body.plannedStart||'');row[c['도착예정']]=String(body.plannedEnd||'');row[c['앞차예정간격']]=String(body.plannedFrontGap||'');row[c['뒷차예정간격']]=String(body.plannedRearGap||'');row[c['시간표버전']]=String(current[dc['시간표버전']]||'');}
  if(event==='DEPART'){row[c['발차실제']]=now;row[c['상태']]='운행중';}else{row[c['도착실제']]=now;row[c['상태']]='완료';}
  if(body.note) row[c['비고']]=String(body.note).slice(0,200);
  if(rowNo) logSheet.getRange(rowNo,1,1,row.length).setValues([row]); else logSheet.appendRow(row);
  return {ok:true,logId:row[c['logId']],event:event,recordedAt:Utilities.formatDate(now,'Asia/Seoul','yyyy-MM-dd HH:mm:ss'),message:event==='DEPART'?'발차 시간을 기록했습니다.':'도착 시간을 기록했습니다.'};
}

function bus70DriverLoginActive_(driver) {
  const status=String(driver&&driver.status||'').trim();
  return !status||status==='재직'||status==='1';
}

function bus70ScheduleWithAdjustments_(schedule, rawDate) {
  if (!schedule || !schedule.ok || schedule.type !== 'WORK' || !schedule.dispatch || !Array.isArray(schedule.trips)) return schedule;
  const date = normalizeDate_(rawDate), sequence = Number(schedule.dispatch.seq || schedule.dispatch.sequence || 0);
  if (!date || !sequence) return schedule;
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('배차간격조정DB');
    if (sheet && sheet.getLastRow() >= 2) {
      const rows = sheet.getDataRange().getDisplayValues(), c = makeHeaderMap_(rows[0]), applied = [];
      for (let i = 1; i < rows.length; i++) {
        if (normalizeDate_(rows[i][c['날짜']]) !== date || Number(rows[i][c['순차']]) !== sequence) continue;
        const tripNo = Number(rows[i][c['탕']]), before = String(rows[i][c['기존시간']] || '').trim(), after = String(rows[i][c['조정시간']] || '').trim();
        if (!tripNo || !before || !after) continue;
        const trip = schedule.trips.find(function(v){ return Number(v.trip) === tripNo; });
        if (!trip) continue;
        let changed = false;
        ['startTime','turnTime','endTime'].forEach(function(key){ if (String(trip[key] || '').trim() === before) { trip[key] = after; changed = true; } });
        if (changed) applied.push({trip:tripNo,before:before,after:after,reason:String(rows[i][c['사유']] || '')});
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
    trip.plannedFrontGapMinutes=own!==null&&front!==null?own-front:null;
    trip.plannedRearGapMinutes=own!==null&&rear!==null?rear-own:null;
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
