const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
function extract(name) {
  const start = html.indexOf('function ' + name + '(');
  const brace = html.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) {
      return (html.slice(start - 6, start) === 'async ' ? 'async ' : '') + html.slice(start, i + 1);
    }
  }
  throw Error('Function not found: ' + name);
}

function sheet(rows) {
  return {
    rows, getLastRow() { return rows.length; },
    getDataRange() { return {getDisplayValues: () => rows.map(row => row.slice())}; },
    appendRow(row) { rows.push(row.slice()); },
    getRange(r, c) {
      return {
        setValue(value) { rows[r - 1][c - 1] = value; },
        setValues(values) { values.forEach((row, i) => row.forEach((v, j) => rows[r - 1 + i][c - 1 + j] = v)); }
      };
    }
  };
}
const tables = {
  '기사DB': sheet([
    ['driverId', '사원번호', '성명', '근무조', '현재노선', '상태', '종료일'],
    ['SYN-RETURN', '999901', '가상복귀기사', 'B', '99', '재직', '']
  ]),
  '근무변경DB': sheet([
    ['changeId', '날짜', '기사ID', '유형', '적용순차', '대체기사ID', '시작시간', '종료시간', '사유', '처리자', '처리시간'],
    ['SYN-LEAVE', '2099-01-01', 'SYN-RETURN', '병가', '', '', '', '', '합성 사례', 'SYN-MANAGER', '']
  ]),
  '배차DB': sheet([
    ['dispatchId', '날짜', '기사ID', '순차', '상태'],
    ['SYN-DISPATCH', '2099-02-02', 'SYN-RETURN', 8, '확정']
  ])
};
const backend = vm.createContext({
  console, Date, normalizeDate_: value => String(value || ''),
  makeHeaderMap_: headers => Object.fromEntries(headers.map((h, i) => [h, i])),
  SpreadsheetApp: {getActiveSpreadsheet: () => ({getSheetByName: name => tables[name] || null})},
  newId_: () => 'SYN-RETURN-EVENT', writeAudit_: () => {}
});
vm.runInContext(fs.readFileSync('apps-script/ManagerDispatch.gs', 'utf8'), backend);
backend.bus70IsManager_ = () => true;
backend.bus70IsMaster_ = () => false;

const nodes = {};
const node = id => nodes[id] ||= {value: '', disabled: false, textContent: ''};
const statuses = [], requests = [];
const front = vm.createContext({
  document: {getElementById: node}, authToken: 'SYNTHETIC-TEST-TOKEN',
  masterStatus: (message, ok) => statuses.push({message, ok}), loadMasterAdmin: async () => {},
  apiPost: async body => { requests.push({...body}); return backend.bus70WorkChangeSave_(body, 'SYN-MANAGER'); }
});
for (const name of ['isReturnWorkChange', 'normalizeWorkChangeDispatch', 'refreshWorkChangeMode', 'saveWorkChange']) {
  vm.runInContext(extract(name), front);
}

(async () => {
  node('workChangeType').value = '복귀';
  node('workChangeSequence').value = '8';
  node('workChangeReplacement').value = 'SYN-STALE-REPLACEMENT';
  node('replacementScope').value = 'ALL';
  front.refreshWorkChangeMode();
  for (const id of ['workChangeSequence', 'workChangeReplacement', 'replacementScope']) assert.equal(node(id).disabled, true);
  assert.equal(node('workChangeSequence').value, '');
  assert.equal(node('workChangeReplacement').value, '');

  // A stale form value must not turn a return into a replacement request.
  node('workChangeDate').value = '2099-02-01';
  node('workChangeDriver').value = 'SYN-RETURN';
  node('workChangeSequence').value = '8';
  node('workChangeReplacement').value = 'SYN-STALE-REPLACEMENT';
  const beforeDispatch = JSON.stringify(tables['배차DB'].rows);
  await front.saveWorkChange();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].sequence, '');
  assert.equal(requests[0].replacementId, '');
  assert.equal(requests[0].crossRouteReplacement, false);
  assert.equal(statuses.at(-1).ok, true);
  assert.equal(tables['근무변경DB'].rows.length, 3);
  assert.equal(tables['근무변경DB'].rows[1][3], '병가', 'preserve the original event');
  assert.equal(tables['근무변경DB'].rows[2][3], '복귀');
  assert.equal(backend.bus70PersistentWorkState_(tables['근무변경DB'], 'SYN-RETURN', '2099-01-31'), '병가');
  assert.equal(backend.bus70PersistentWorkState_(tables['근무변경DB'], 'SYN-RETURN', '2099-02-01'), '');
  assert.equal(JSON.stringify(tables['배차DB'].rows), beforeDispatch, 'return does not edit assignments');

  node('workChangeType').value = '병가';
  front.refreshWorkChangeMode();
  for (const id of ['workChangeSequence', 'workChangeReplacement', 'replacementScope']) assert.equal(node(id).disabled, false);
  node('workChangeReplacement').value = '';
  await front.saveWorkChange();
  assert.equal(requests.length, 1, 'an actual replacement still requires both fields');
  assert.match(statuses.at(-1).message, /순차와 대체기사/);
  const rehire = front.normalizeWorkChangeDispatch({type: '재입사', sequence: '8', replacementId: 'SYN-STALE', rehireEmpId: '999902'});
  assert.equal(rehire.sequence, '');
  assert.equal(rehire.rehireEmpId, '999902');
  console.log('Work return: stale replacement fields cleared; existing server saves return and preserves history/dispatch');
})().catch(error => { console.error(error); process.exitCode = 1; });
