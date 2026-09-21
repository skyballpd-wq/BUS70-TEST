/* BUS70 TEST - manager day dispatch editor.
 * Manager access is granted by 계정DB 권한(소장/관리자) or the
 * BUS70_MANAGER_DRIVER_IDS script property (comma-separated driver IDs). */

function bus70ManagerAction_(body, driverId) {
  if (!bus70IsManager_(driverId)) {
    return {ok:false, error:'MANAGER_REQUIRED', message:'소장 권한이 필요합니다.'};
  }
  const action = String(body.action || '').trim();
  if (action === 'managerDispatchBootstrap') return bus70ManagerBootstrap_(body.date);
  if (action === 'saveManagerDispatchDay') return bus70SaveManagerDispatchDay_(body, driverId);
  return {ok:false, error:'UNKNOWN_ACTION', message:'지원하지 않는 소장 요청입니다.'};
}

function bus70IsManager_(driverId) {
  const id = String(driverId || '').trim();
  if (!id) return false;
  const configured = String(PropertiesService.getScriptProperties().getProperty('BUS70_MANAGER_DRIVER_IDS') || '')
    .split(',').map(function (v) { return v.trim(); }).filter(Boolean);
  if (configured.indexOf(id) !== -1) return true;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('계정DB');
  if (!sheet || sheet.getLastRow() < 2) return false;
  const rows = sheet.getDataRange().getDisplayValues();
  const c = makeHeaderMap_(rows[0]);
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][c['driverId']] || '').trim() !== id) continue;
    const role = String(rows[i][c['권한']] || '').trim();
    const enabled = String(rows[i][c['사용여부']] || '').trim();
    return (role === '소장' || role === '관리자') && enabled !== 'N';
  }
  return false;
}

function bus70ManagerBootstrap_(rawDate) {
  const date = normalizeDate_(rawDate);
  if (!date) return {ok:false, error:'DATE_REQUIRED', message:'운행 날짜를 선택하세요.'};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const driverSheet = ss.getSheetByName('기사DB');
  const vehicleSheet = ss.getSheetByName('차량DB');
  const dispatchSheet = ss.getSheetByName('배차DB');
  const scheduleSheet = ss.getSheetByName('스케줄');
  if (!driverSheet || !vehicleSheet || !dispatchSheet || !scheduleSheet) {
    return {ok:false, error:'DB_MISSING', message:'배차 편집에 필요한 DB를 찾을 수 없습니다.'};
  }
  const drivers = bus70ManagerMasterRows_(driverSheet, 'driver');
  const vehicles = bus70ManagerMasterRows_(vehicleSheet, 'vehicle');
  const scheduleVersion = bus70ScheduleVersionForDate_(date);
  const departures = bus70ManagerDepartures_(scheduleSheet, scheduleVersion);
  const assignments = bus70ManagerAssignments_(dispatchSheet, date);
  return {ok:true, date:date, scheduleVersion:scheduleVersion, drivers:drivers,
    vehicles:vehicles, departures:departures, assignments:assignments};
}

function bus70ManagerMasterRows_(sheet, type) {
  const rows = sheet.getDataRange().getDisplayValues();
  const c = makeHeaderMap_(rows[0]);
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const route = String(rows[i][c['현재노선']] || '').trim();
    const status = String(rows[i][c['상태']] || '').trim();
    if (route && route !== '70') continue;
    if (type === 'driver') {
      if (status !== '재직' && status !== '1') continue;
      result.push({id:String(rows[i][c['driverId']] || '').trim(), name:String(rows[i][c['성명']] || '').trim(),
        shift:String(rows[i][c['근무조']] || '').trim()});
    } else {
      if (status !== '운행가능' && status !== '운행') continue;
      const no = String(rows[i][c['차량번호']] || '').replace(/\D/g, '');
      result.push({id:String(rows[i][c['vehicleId']] || '').trim(), no:no, last3:no.slice(-3),
        displayNo:no.length === 4 ? '경기71아' + no : no});
    }
  }
  return result.filter(function (v) { return v.id; });
}

function bus70ManagerDepartures_(sheet, version) {
  const rows = sheet.getDataRange().getDisplayValues();
  const c = makeHeaderMap_(rows[0]);
  const result = {};
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][c['버전']] || '').trim() !== version || String(rows[i][c['상태']] || '').trim() === '중지') continue;
    const seq = Number(rows[i][c['순차']]);
    if (!Number.isInteger(seq) || result[seq]) continue;
    const startTime = String(rows[i][c['발차시간']] || '').trim();
    const turnTime = String(rows[i][c['회차시간']] || '').trim();
    result[seq] = startTime ? {time:startTime, place:String(rows[i][c['발차지']] || '').trim()} :
      {time:turnTime, place:String(rows[i][c['회차지']] || '').trim()};
  }
  return result;
}

function bus70ManagerAssignments_(sheet, date) {
  const rows = sheet.getDataRange().getDisplayValues();
  const c = makeHeaderMap_(rows[0]);
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    if (normalizeDate_(rows[i][c['날짜']]) !== date || String(rows[i][c['상태']] || '').trim() !== '확정') continue;
    result.push({sequence:Number(rows[i][c['순차']]), driverId:String(rows[i][c['기사ID']] || '').trim(),
      vehicleId:String(rows[i][c['차량ID']] || '').trim(), shift:String(rows[i][c['근무조']] || '').trim()});
  }
  return result;
}

function bus70SaveManagerDispatchDay_(body, managerId) {
  const date = normalizeDate_(body.date);
  const shift = String(body.shift || '').trim().toUpperCase();
  const input = Array.isArray(body.assignments) ? body.assignments : [];
  if (!date || (shift !== 'A' && shift !== 'B') || input.length !== 11) {
    return {ok:false, error:'PARAM_REQUIRED', message:'날짜·근무조와 11개 순차를 모두 확인하세요.'};
  }
  const bootstrap = bus70ManagerBootstrap_(date);
  if (!bootstrap.ok) return bootstrap;
  const driverMap = {}; bootstrap.drivers.forEach(function (v) { driverMap[v.id] = v; });
  const vehicleMap = {}; bootstrap.vehicles.forEach(function (v) { vehicleMap[v.id] = v; });
  const seenDrivers = {}, seenVehicles = {}, normalized = [];
  for (let i = 0; i < input.length; i++) {
    const seq = Number(input[i].sequence), driverId = String(input[i].driverId || '').trim();
    const vehicleId = String(input[i].vehicleId || '').trim();
    if (seq !== i + 1 || !driverMap[driverId] || driverMap[driverId].shift !== shift || !vehicleMap[vehicleId]) {
      return {ok:false, error:'ROW_INVALID', message:(i + 1) + '순차의 기사 또는 차량을 확인하세요.'};
    }
    if (seenDrivers[driverId] || seenVehicles[vehicleId]) {
      return {ok:false, error:'DUPLICATE_ASSIGNMENT', message:'같은 기사 또는 차량을 두 순차에 배정할 수 없습니다.'};
    }
    seenDrivers[driverId] = true; seenVehicles[vehicleId] = true;
    normalized.push({sequence:seq, driverId:driverId, vehicleId:vehicleId});
  }
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('배차DB');
    const rows = sheet.getDataRange().getDisplayValues();
    const c = makeHeaderMap_(rows[0]);
    const existing = {};
    for (let r = 1; r < rows.length; r++) {
      if (normalizeDate_(rows[r][c['날짜']]) === date && String(rows[r][c['근무조']] || '').trim() === shift) {
        existing[Number(rows[r][c['순차']])] = {row:r + 1, values:rows[r]};
      }
    }
    normalized.forEach(function (item) {
      const dispatchId = 'DSP-' + date.replace(/-/g, '') + '-' + shift + '-' + ('0' + item.sequence).slice(-2);
      const values = [dispatchId,date,shift,item.sequence,item.driverId,item.vehicleId,bootstrap.scheduleVersion,'확정',new Date(),'소장 일괄 배차'];
      if (existing[item.sequence]) sheet.getRange(existing[item.sequence].row, 1, 1, values.length).setValues([values]);
      else sheet.appendRow(values);
    });
    writeAudit_(managerId, '소장', '배차DB', date + '-' + shift, '일괄저장', bootstrap.assignments, normalized, '소장 배차 편집');
    return {ok:true, message:'11개 순차 배차를 저장했습니다.', data:bus70ManagerBootstrap_(date)};
  } finally { lock.releaseLock(); }
}
