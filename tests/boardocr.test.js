const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function sheet(rows) {
  return {
    rows,
    getDataRange() { return {getDisplayValues: () => this.rows.map(r => r.slice())}; },
    appendRow(row) { this.rows.push(row); }
  };
}

const vehicles = sheet([
  ['vehicleId','차량번호','차량구분','상태','현재노선'],
  ['VEH-1499','1499','일반','운행가능','70'],
  ['VEH-1503','1503','일반','운행가능','70']
]);
const dispatch = sheet([
  ['dispatchId','날짜','근무조','순차','기사ID','차량ID','시간표버전','상태','확정시간','비고']
]);
const cache = new Map();
const holidayEvents = ['2026-09-24','2026-09-25','2027-02-09'].map(value => ({
  getStartTime:() => new Date(value + 'T00:00:00+09:00')
}));
const context = {
  console, JSON, Date, Math, Number, String, Object, Array, RegExp,
  PropertiesService:{getScriptProperties:() => ({getProperty:() => ''})},
  CacheService:{getScriptCache:() => ({
    put:(k,v) => cache.set(k,v), get:k => cache.get(k) || null, remove:k => cache.delete(k)
  })},
  Utilities:{
    getUuid:() => 'candidate-1',
    formatDate:value => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(value)
  },
  CalendarApp:{getCalendarById:() => ({getEvents:(start,end) => holidayEvents.filter(event => {
    const value = event.getStartTime(); return value >= start && value < end;
  })})},
  SpreadsheetApp:{getActiveSpreadsheet:() => ({getSheetByName:n => n === '차량DB' ? vehicles : n === '배차DB' ? dispatch : null})},
  LockService:{getScriptLock:() => ({waitLock(){},releaseLock(){}})},
  normalizeDate_:v => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : '',
  makeHeaderMap_:headers => Object.fromEntries(headers.map((h,i) => [h,i])),
  apiGetDriver_:() => ({ok:true,driver:{driverId:'DRV-B-TEST-002',name:'박철완',shift:'B'}}),
  apiMySchedule_:({parameter}) => ({ok:true,type:'WORK',date:parameter.date})
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('apps-script/BoardEntry.gs','utf8'), context);

assert.equal(context.bus70ScheduleVersionForDate_('2026-09-20'), 'HD-TEST-V001');
assert.equal(context.bus70ScheduleVersionForDate_('2026-09-22'), 'WD-TEST-V001');
assert.equal(context.bus70ScheduleVersionForDate_('2026-09-24'), 'HD-TEST-V001');
assert.equal(context.bus70ScheduleVersionForDate_('2026-09-25'), 'HD-TEST-V001');
assert.equal(context.bus70ScheduleVersionForDate_('2027-02-09'), 'HD-TEST-V001');
assert.equal(context.bus70FindVehicleByLast3_('499').vehicleId, 'VEH-1499');
assert.equal(context.bus70FindVehicleByLast3_('999').error, 'VEHICLE_NOT_FOUND');

const analyzed = context.bus70ValidateDispatchBoard_({
  action:'validateDispatchBoard', date:'2026-09-20', sequence:6, vehicleLast3:'499'
}, 'DRV-B-TEST-002');
assert.equal(analyzed.ok, true);
assert.equal(analyzed.candidate.sequence, 6);
assert.equal(analyzed.candidate.vehicleLast3, '499');
assert.equal(analyzed.candidate.scheduleVersion, 'HD-TEST-V001');

const rejected = context.bus70RegisterDispatchBoard_({candidateId:'candidate-1',confirmed:false}, 'DRV-B-TEST-002');
assert.equal(rejected.error, 'CONFIRM_REQUIRED');

const registered = context.bus70RegisterDispatchBoard_({
  candidateId:'candidate-1', confirmed:true
}, 'DRV-B-TEST-002');
assert.equal(registered.ok, true);
assert.equal(dispatch.rows.length, 2);
assert.equal(dispatch.rows[1][0], 'DSP-20260920-B-06');
assert.equal(dispatch.rows[1][5], 'VEH-1499');
assert.equal(dispatch.rows[1][6], 'HD-TEST-V001');

console.log('BoardEntry tests passed');
