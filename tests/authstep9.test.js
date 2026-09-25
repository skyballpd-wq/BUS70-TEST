const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function sheet(rows) {
  return {
    rows,
    getDataRange() { return { getDisplayValues: () => this.rows.map(r => r.map(String)) }; },
    appendRow(row) { this.rows.push(row); },
    getRange(row,col) { return {setValue:value => {this.rows[row-1][col-1]=value;}}; }
  };
}

const dispatch = sheet([
  ['dispatchId','날짜','근무조','순차','기사ID','차량ID','시간표버전','상태','확정시간','비고'],
  ['DSP-1','2026-09-18','B','4','DRV-1','VEH-1','WD-V1','확정','','']
]);
const confirmations = sheet([
  ['confirmId','날짜','기사ID','dispatchId','시간표버전','확인시간','캘린더저장','알람설정','마지막동기화','재확인필요']
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
    getUuid: (() => { let n = 0; return () => `00000000-0000-0000-0000-${String(++n).padStart(12,'0')}`; })()
  },
  PropertiesService: {getScriptProperties: () => ({
    setProperty: (k,v) => properties.set(k,v),
    getProperty: k => properties.get(k) || null,
    deleteProperty: k => properties.delete(k)
  })},
  LockService: {getScriptLock: () => ({waitLock(){},releaseLock(){}})},
  SpreadsheetApp: {getActiveSpreadsheet: () => ({getSheetByName: name => name === '배차DB' ? dispatch : name === '배차확인DB' ? confirmations : null})},
  normalizeDate_: value => String(value).slice(0,10),
  makeHeaderMap_: headers => Object.fromEntries(headers.map((h,i) => [h,i])),
  newId_: () => 'CONF-NEW',
  formatDateTime_: () => '2026-09-21 10:00:00',
  apiLogin_: () => ({ok:true,driver:{driverId:'DRV-1'}}),
  apiGetDriver_: () => ({ok:true,driver:{driverId:'DRV-1'}}),
  apiMySchedule_: e => ({ok:true,type:'WORK',driverId:e.parameter.driverId,date:e.parameter.date})
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('apps-script/AuthStep9.gs','utf8'), context);

const session = context.bus70AuthAction_({action:'loginSecure',name:'테스트',empId:'1'});
assert.equal(session.ok, true);
assert.equal(session.token.length, 72);

const combinedLogin = context.bus70AuthAction_({action:'loginSecure',name:'테스트',empId:'1',date:'2026-09-21'});
assert.equal(combinedLogin.schedule.type, 'WORK');
const combinedSession = context.bus70AuthAction_({action:'session',token:combinedLogin.token,date:'2026-09-21'});
assert.equal(combinedSession.ok, true);
assert.equal(combinedSession.schedule.date, '2026-09-21');

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

console.log('AuthStep9 tests passed');
