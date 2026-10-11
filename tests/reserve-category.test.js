const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const context = {};
vm.createContext(context);
for (const name of ['driverAssignmentType', 'driverCategoryLabel', 'driverShiftLabel']) {
  const source = html.match(new RegExp('  function ' + name + '\\([\\s\\S]*?\\n  }'));
  assert.ok(source, name);
  vm.runInContext(source[0], context);
}
for (const route of ['5', '70']) {
  for (const shift of ['A', 'B']) {
    for (const driverType of ['양성', '노선']) {
      const driver = {route, shift, driverType, assignmentType:'예비'};
      assert.equal(context.driverAssignmentType(driver), '예비');
      assert.equal(context.driverCategoryLabel(driver), (driverType==='양성'?'양성':'정규 노선')+' · 예비');
      assert.equal(context.driverShiftLabel(driver), shift+'조');
    }
  }
}
assert.equal(context.driverAssignmentType({driverType:'양성',shift:'B'}), '');
assert.equal(context.driverAssignmentType({driverType:'노선',assignmentType:'고정'}), '고정');
assert.equal(context.driverAssignmentType({driverType:'예비'}), '예비');
assert.equal(context.driverCategoryLabel({driverType:'예비'}), '기사구분 미확인 · 예비');
assert.equal(context.driverAssignmentType({driverType:'예비',assignmentType:'고정'}), '고정');
assert.equal(context.driverShiftLabel({shift:'예비'}), '근무조 미확인');
assert.equal(context.driverAssignmentType(null), '');
console.log('Reserve category: independent of training, route and shift');
