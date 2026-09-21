/* BUS70 TEST - reviewed dispatch-board entry without external OCR.
 * The selected photo stays on the user's device. Only date, sequence and the
 * vehicle number's last three digits are sent for DB validation. */

const BUS70_BOARD_CANDIDATE_TTL = 600;

function bus70BoardAction_(body, driverId) {
  const action = String(body.action || '').trim();
  if (action === 'validateDispatchBoard') return bus70ValidateDispatchBoard_(body, driverId);
  if (action === 'registerDispatchBoard') return bus70RegisterDispatchBoard_(body, driverId);
  return {ok:false, error:'UNKNOWN_ACTION', message:'지원하지 않는 배차판 요청입니다.'};
}

function bus70ValidateDispatchBoard_(body, driverId) {
  const date = normalizeDate_(body.date);
  const sequence = Number(body.sequence);
  const vehicleLast3 = String(body.vehicleLast3 || '').replace(/\D/g, '').slice(-3);
  if (!date || !Number.isInteger(sequence) || sequence < 1 || sequence > 11 || !/^\d{3}$/.test(vehicleLast3)) {
    return {ok:false, error:'PARAM_REQUIRED', message:'날짜·순차·차량번호 뒤 3자리를 확인하세요.'};
  }
  const driverResult = apiGetDriver_(driverId);
  if (!driverResult.ok || !driverResult.driver) {
    return {ok:false, error:'DRIVER_UNAVAILABLE', message:'기사정보를 확인할 수 없습니다.'};
  }
  const vehicle = bus70FindVehicleByLast3_(vehicleLast3);
  if (!vehicle.ok) return vehicle;
  const driver = driverResult.driver;
  const shift = String(driver.shift || '').trim();
  const scheduleVersion = bus70ScheduleVersionForDate_(date);
  const conflict = bus70CheckDispatchConflict_(date, shift, sequence, driverId, vehicle.vehicleId);
  if (!conflict.ok) return conflict;

  const candidateId = Utilities.getUuid();
  const candidate = {
    driverId:driverId, driverName:String(driver.name || ''), shift:shift, date:date,
    sequence:sequence, vehicleLast3:vehicleLast3, vehicleId:vehicle.vehicleId,
    vehicleNo:vehicle.vehicleNo, vehicleDisplayNo:vehicle.displayNo,
    scheduleVersion:scheduleVersion, createdAt:Date.now()
  };
  CacheService.getScriptCache().put('BUS70_BOARD_' + candidateId, JSON.stringify(candidate), BUS70_BOARD_CANDIDATE_TTL);
  return {ok:true, candidateId:candidateId, candidate:candidate, requiresReview:true,
    message:conflict.alreadyRegistered ? '이미 같은 배차가 등록되어 있습니다.' : '차량DB와 시간표 연결을 확인했습니다.'};
}

function bus70RegisterDispatchBoard_(body, driverId) {
  if (body.confirmed !== true) return {ok:false, error:'CONFIRM_REQUIRED', message:'검증 결과 확인이 필요합니다.'};
  const candidateId = String(body.candidateId || '').trim();
  const cache = CacheService.getScriptCache();
  const raw = cache.get('BUS70_BOARD_' + candidateId);
  if (!raw) return {ok:false, error:'CANDIDATE_EXPIRED', message:'검증 결과가 만료되었습니다. 다시 검증하세요.'};
  let candidate;
  try { candidate = JSON.parse(raw); } catch (_) { return {ok:false, error:'CANDIDATE_INVALID', message:'검증을 다시 실행하세요.'}; }
  if (candidate.driverId !== driverId) return {ok:false, error:'DRIVER_MISMATCH', message:'로그인 기사와 검증 결과가 다릅니다.'};

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const conflict = bus70CheckDispatchConflict_(candidate.date, candidate.shift, candidate.sequence, driverId, candidate.vehicleId);
    if (!conflict.ok) return conflict;
    if (conflict.alreadyRegistered) {
      cache.remove('BUS70_BOARD_' + candidateId);
      return {ok:true, alreadyRegistered:true, message:'이미 같은 배차가 등록되어 있습니다.',
        schedule:apiMySchedule_({parameter:{driverId:driverId,date:candidate.date}})};
    }
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('배차DB');
    if (!sheet) return {ok:false, error:'DB_MISSING', message:'배차DB를 찾을 수 없습니다.'};
    const dispatchId = 'DSP-' + candidate.date.replace(/-/g, '') + '-' + candidate.shift + '-' + ('0' + candidate.sequence).slice(-2);
    sheet.appendRow([dispatchId,candidate.date,candidate.shift,candidate.sequence,driverId,candidate.vehicleId,
      candidate.scheduleVersion,'확정',new Date(),'배차판 사진 대조 후 사용자 확인 / 차량 뒤 3자리 ' + candidate.vehicleLast3]);
    cache.remove('BUS70_BOARD_' + candidateId);
    return {ok:true, alreadyRegistered:false, dispatchId:dispatchId, message:'배차가 등록되었습니다.',
      schedule:apiMySchedule_({parameter:{driverId:driverId,date:candidate.date}})};
  } finally {
    lock.releaseLock();
  }
}

function bus70CheckDispatchConflict_(date, shift, sequence, driverId, vehicleId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('배차DB');
  if (!sheet) return {ok:false, error:'DB_MISSING', message:'배차DB를 찾을 수 없습니다.'};
  const rows = sheet.getDataRange().getDisplayValues();
  const c = makeHeaderMap_(rows[0]);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (normalizeDate_(row[c['날짜']]) !== date) continue;
    const rowDriver = String(row[c['기사ID']] || '').trim();
    const rowSeq = Number(row[c['순차']]);
    const rowVehicle = String(row[c['차량ID']] || '').trim();
    if (rowDriver === driverId) {
      if (rowSeq === sequence && rowVehicle === vehicleId && String(row[c['상태']] || '').trim() === '확정') {
        return {ok:true, alreadyRegistered:true};
      }
      return {ok:false, error:'EXISTING_DISPATCH', message:'해당 날짜에 다른 배차가 이미 등록되어 있습니다.'};
    }
    if (String(row[c['근무조']] || '').trim() === shift && rowSeq === sequence) {
      return {ok:false, error:'SEQUENCE_CONFLICT', message:'해당 날짜와 근무조에 같은 순차가 이미 등록되어 있습니다.'};
    }
    if (rowVehicle === vehicleId) {
      return {ok:false, error:'VEHICLE_CONFLICT', message:'해당 날짜에 같은 차량이 이미 등록되어 있습니다.'};
    }
  }
  return {ok:true, alreadyRegistered:false};
}

function bus70FindVehicleByLast3_(last3) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('차량DB');
  if (!sheet) return {ok:false, error:'DB_MISSING', message:'차량DB를 찾을 수 없습니다.'};
  const rows = sheet.getDataRange().getDisplayValues();
  const c = makeHeaderMap_(rows[0]);
  const matches = [];
  for (let i = 1; i < rows.length; i++) {
    const no = String(rows[i][c['차량번호']] || '').replace(/\D/g, '');
    if (no.slice(-3) === last3 && String(rows[i][c['상태']] || '').trim() === '운행가능') {
      matches.push({vehicleId:String(rows[i][c['vehicleId']] || '').trim(), vehicleNo:no,
        displayNo:no.length === 4 ? '경기71아' + no : no});
    }
  }
  if (!matches.length) return {ok:false, error:'VEHICLE_NOT_FOUND', message:'차량번호 뒤 3자리 ' + last3 + '에 해당하는 운행가능 차량이 없습니다.'};
  if (matches.length > 1) return {ok:false, error:'VEHICLE_AMBIGUOUS', message:'뒤 3자리가 같은 차량이 여러 대입니다. 관리자 확인이 필요합니다.'};
  return Object.assign({ok:true}, matches[0]);
}

function bus70ScheduleVersionForDate_(date) {
  const parts = date.split('-').map(Number);
  const day = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  return day === 0 || day === 6 ? 'HD-TEST-V001' : 'WD-TEST-V001';
}
