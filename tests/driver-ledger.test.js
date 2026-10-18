const assert=require('node:assert/strict'),fs=require('fs'),ledger=require('../driver-ledger');
const logs=[{date:'2000-01-01',driverName:'=시험<&기사',sequence:2,trip:7,route:'5',vehicleId:'SYN-V',startPlace:'시험 기점',plannedStart:'23:00',endPlace:'시험 종점',plannedEnd:'00:00',actualEnd:'2000-01-02 00:01:05',deadheadDestination:'시험차고지',deadheadReturnedAt:'2000-01-02 00:21:00'},
{date:'2000-01-01',sequence:2,trip:5,plannedStart:'16:00',plannedTurn:'17:00',plannedEnd:'18:00',pendingEvents:[]}];
const copy=JSON.stringify(logs),rows=ledger.rows(logs,'시험 기사');
assert.equal(rows[0][8],'');assert.equal(rows[0][11],'');assert.equal(rows[0][14],'');assert.equal(rows[1][13],'다음날 00:00');assert.equal(rows[1][14],'다음날 00:01:05');
assert.equal(ledger.clock('2000-01-01','2000-01-01T15:01:05Z'),'다음날 00:01:05');
assert.equal(ledger.clock('2000-01-01','날짜만'),'시각 확인 필요');
assert.equal(ledger.clock('2000-01-01','24:10'),'다음날 00:10');
assert.equal(ledger.rows([{...logs[0],pendingEvents:[{event:'ARRIVE'}]}])[0][15],'기기 보관 · 서버 저장 미확인');
assert.equal(JSON.stringify(logs),copy);
fs.writeFileSync('/tmp/bus70-ledger-synthetic.xlsx',ledger.workbook(logs,'시험 기사'));
console.log('Ledger: actuals immutable, missing values preserved, midnight/timezone, pending source and XLSX generation passed.');
