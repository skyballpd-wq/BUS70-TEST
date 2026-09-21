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
    const result = apiLogin_(body.name, body.empId);
    if (!result.ok) return result;
    const session = bus70IssueSession_(result.driver.driverId);
    return {ok:true, driver:result.driver, token:session.token, expiresAt:session.expiresAt};
  }
  const driverId = bus70AuthDriver_(body.token);
  if (!driverId) return {ok:false, error:'AUTH_REQUIRED', message:'로그인이 만료되었습니다. 다시 로그인하세요.'};
  if (action === 'session') {
    const result = apiGetDriver_(driverId);
    return result.ok ? {ok:true, driver:result.driver} :
      {ok:false, error:'DRIVER_UNAVAILABLE', message:'기사정보를 확인할 수 없습니다.'};
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
  return {ok:false, error:'UNKNOWN_ACTION', message:'지원하지 않는 요청입니다.'};
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
