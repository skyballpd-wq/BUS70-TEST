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
    // Apply due trainee-to-regular transitions before employee-number lookup.
    // This keeps the stable driverId while the effective employee number, route
    // and shift change, even if no manager screen has opened since midnight.
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
