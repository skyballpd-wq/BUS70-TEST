const assert = require('assert');
const fs = require('fs');
const {execFileSync} = require('child_process');

const routeFiles=['apps-script/Route5Schedule.gs','apps-script/Route70Schedule.gs'];
routeFiles.forEach(file => {
  const source=fs.readFileSync(file,'utf8');
  assert.match(source,/bus70PrivateRouteSource_/);
  assert.match(source,/PRIVATE_REFERENCE_NOT_CONFIGURED/);
  assert.doesNotMatch(source,/\b20\d{2}-\d{2}-\d{2}\b/);
  assert.doesNotMatch(source,/BUS70_ROUTE\d+_REFERENCE_\s*=/);
});

const tracked=execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split(/\r?\n/);
assert.equal(tracked.includes('private-data/RoutePrivateData.js'),false);
assert.equal(tracked.includes('apps-script/PrivateRouteData.gs'),false);
assert.equal(execFileSync('git',['check-ignore','private-data/RoutePrivateData.js'],{encoding:'utf8'}).trim(),'private-data/RoutePrivateData.js');

const readme=fs.readFileSync('README.md','utf8');
assert.match(readme,/공개 저장소에는 계산 로직과 합성 테스트 데이터만/);
assert.match(readme,/PRIVATE_REFERENCE_NOT_CONFIGURED/);

const manager=fs.readFileSync('apps-script/ManagerDispatch.gs','utf8');
assert.doesNotMatch(manager,/upsertAccount\(\s*['"]/);
assert.doesNotMatch(manager,/addPrincipal\(\s*['"]/);

console.log('Public data boundary tests passed');
