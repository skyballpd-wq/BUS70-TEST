const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(),'bus70-private-migration-'));
const route5 = path.join(root,'Route5Schedule.js');
const route70 = path.join(root,'Route70Schedule.js');
const manager = path.join(root,'ManagerDispatch.js');
const output = path.join(root,'RoutePrivateData.js');

try {
  fs.writeFileSync(route5,"const BUS70_ROUTE5_REFERENCE_={'2099-01-08':{scheduleVersion:'SYN-R5'}};\n",'utf8');
  fs.writeFileSync(route70,"const BUS70_ROUTE70_REFERENCE_={'2099-01-08':{scheduleVersion:'SYN-R70'}};\n",'utf8');
  fs.writeFileSync(manager,"function shift(date){const days=bus70ManagerDaysBetween_('2099-01-08',date);return ((days%2)+2)%2===0?'B':'A';}\nfunction seed(){if(id === 'DRV-SYN-FIELD') return '';upsertAccount('ACC-SYN','마스터','ADM-SYN','가상관리자','TEST-ONLY-NOT-A-CREDENTIAL','합성 계정');}\n",'utf8');
  const run = spawnSync(process.execPath,[
    'scripts/extract-private-route-data.js','--route5',route5,'--route70',route70,
    '--manager',manager,'--output',output
  ],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const context = {};
  require('vm').createContext(context);
  require('vm').runInContext(fs.readFileSync(output,'utf8'),context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.BUS70_PRIVATE_ROUTE_DATA_.config)),{
    shiftAnchorDate:'2099-01-08',shiftAnchor:'B',
    bootstrapAccounts:[{accountId:'ACC-SYN',role:'마스터',driverId:'ADM-SYN',loginName:'가상관리자',initialPassword:'TEST-ONLY-NOT-A-CREDENTIAL',note:'합성 계정'}],
    driverOnlyIds:['DRV-SYN-FIELD']
  });
  assert.equal(context.BUS70_PRIVATE_ROUTE_DATA_['5']['2099-01-08'].scheduleVersion,'SYN-R5');
  assert.equal(context.BUS70_PRIVATE_ROUTE_DATA_['70']['2099-01-08'].scheduleVersion,'SYN-R70');
  const overwrite = spawnSync(process.execPath,[
    'scripts/extract-private-route-data.js','--route5',route5,'--route70',route70,
    '--manager',manager,'--output',output
  ],{cwd:process.cwd(),encoding:'utf8'});
  assert.notEqual(overwrite.status,0);
  assert.match(overwrite.stderr,/output already exists/);
} finally {
  fs.rmSync(root,{recursive:true,force:true});
}

console.log('Private route migration tests passed');
