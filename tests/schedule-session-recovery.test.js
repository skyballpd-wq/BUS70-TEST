const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
function extract(name) {
  const start = html.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  const brace = html.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) {
      return (html.slice(start - 6, start) === 'async ' ? 'async ' : '') + html.slice(start, i + 1);
    }
  }
  throw Error(name);
}

const date = '2099-01-10';
const work = {ok:true, type:'WORK', date, dispatch:{seq:4}, trips:[{trip:1,startTime:'06:00'}]};
const noDispatch = {ok:true, type:'NO_DISPATCH', date, trips:[]};
function fixture({inactive = false, schedule = work, respond} = {}) {
  const driver = {driverId:inactive ? 'SYN-ENDED' : 'SYN-ACTIVE', name:'합성기사', status:inactive ? '종료' : '재직'};
  const revoked = [];
  const server = vm.createContext({});
  vm.runInContext(fs.readFileSync('apps-script/AuthStep9.gs', 'utf8'), server);
  Object.assign(server, {
    bus70AuthDriver_: () => driver.driverId,
    apiGetDriver_: () => ({ok:true,driver}),
    bus70RoleFor_: () => '',
    bus70RevokeSession_: token => revoked.push(token),
    bus70SecureScheduleForDriver_: () => inactive ? noDispatch : schedule,
    bus70DriverAlertSettingsGet_: () => ({settings:{enabled:false}})
  });
  const nodes = {}, calls = [], rendered = [], logins = [];
  const node = id => nodes[id] ||= {value:id === 'workDate' ? date : '', disabled:false, contents:[], replaceChildren(...values){this.contents = values;}};
  const front = vm.createContext({
    console:{error(){}}, currentDriverId:driver.driverId, authToken:'SYNTHETIC-TOKEN',
    scheduleRequestId:0, lastSchedule:null, document:{getElementById:node},
    el:(tag,text,type) => ({tag,text,type}), resetConfirmation(){},
    apiErrorMessage:(error,fallback) => fallback,
    apiPost:async body => {calls.push(body);return respond ? respond(body,server,driver) : server.bus70AuthAction_(body);},
    renderSchedule:() => rendered.push(front.lastSchedule),
    showLoginScreen:message => {logins.push(message);front.authToken='';front.currentDriverId='';front.lastSchedule=null;front.scheduleRequestId++;}
  });
  vm.runInContext(extract('loadMySchedule'), front);
  return {front, server, calls, rendered, logins, revoked, node};
}

(async () => {
  // The previous myScheduleSecure path returns NO_DISPATCH for this ended ID.
  // The session endpoint must revoke it before the schedule reaches the UI.
  const ended = fixture({inactive:true});
  const pending = ended.front.loadMySchedule();
  assert.match(ended.node('scheduleResult').contents[0].text, /조회 중/);
  await pending;
  assert.equal(ended.calls[0].action, 'session');
  assert.equal(ended.rendered.length, 0);
  assert.equal(ended.logins.length, 1);
  assert.equal(ended.revoked.length, 1);
  assert.equal(ended.front.authToken, '');

  const active = fixture();
  await active.front.loadMySchedule();
  assert.equal(active.calls.length, 1, 'session includes the schedule in one request');
  assert.equal(active.calls[0].date, date);
  assert.equal(active.rendered[0].type, 'WORK');
  assert.equal(active.logins.length, 0);

  const empty = fixture({schedule:noDispatch});
  await empty.front.loadMySchedule();
  assert.equal(empty.rendered[0].type, 'NO_DISPATCH', 'a real unassigned day is preserved');
  assert.equal(empty.logins.length, 0);

  const legacy = fixture({respond:(body,server,driver) => body.action === 'session'
    ? {ok:true,driver,role:''} : server.bus70AuthAction_(body)});
  await legacy.front.loadMySchedule();
  assert.deepEqual(legacy.calls.map(c => c.action), ['session','myScheduleSecure']);
  assert.equal(legacy.rendered[0].type, 'WORK');

  const changed = fixture({respond:() => ({ok:true,driver:{driverId:'SYN-OTHER',status:'재직'},schedule:work})});
  await changed.front.loadMySchedule();
  assert.equal(changed.logins.length, 1);
  assert.equal(changed.rendered.length, 0, 'never show another account schedule');

  const network = fixture({respond:() => {throw Error('offline');}});
  await network.front.loadMySchedule();
  assert.equal(network.logins.length, 0);
  assert.equal(network.front.authToken, 'SYNTHETIC-TOKEN', 'network errors do not erase login');
  assert.match(network.node('scheduleResult').contents[0].text, /서버 조회에 실패/);

  for (const change of ['date','login']) {
    let resolve;
    const late = fixture({respond:() => new Promise(done => {resolve=done;})});
    const request = late.front.loadMySchedule();
    if (change === 'date') {late.node('workDate').value='2099-01-11';late.front.scheduleRequestId++;}
    else {late.front.authToken='SYNTHETIC-NEW-TOKEN';late.front.currentDriverId='SYN-NEW';}
    resolve({ok:false,error:'DRIVER_RETIRED'});
    await request;
    assert.equal(late.logins.length, 0, 'ignore stale errors after '+change+' changes');
    assert.equal(late.rendered.length, 0);
  }
  assert.match(html, /getElementById\("loadSchedule"\)\.addEventListener\("click", \(\) => loadMySchedule\(\)\)/);
  console.log('Schedule session recovery: ended ID, active schedule, no dispatch, legacy server, identity change, network failure and stale responses passed');
})().catch(error => {console.error(error);process.exitCode=1;});
