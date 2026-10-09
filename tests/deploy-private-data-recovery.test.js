const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('deploy-bus70.ps1', 'utf8');

const backupLookup = source.indexOf('BUS70_DEPLOY_backup-*');
const serverRecovery = source.indexOf('@google/clasp pull');
const finalFailure = source.indexOf('Private route data could not be recovered');

assert.ok(backupLookup >= 0, 'deployment script must search external backups');
assert.ok(serverRecovery > backupLookup, 'server recovery must follow local backup recovery');
assert.ok(finalFailure > serverRecovery, 'deployment must fail only after both recovery paths');
assert.match(source, /RoutePrivateData\.gs/);
assert.match(source, /Route5Schedule\.gs/);
assert.match(source, /Route70Schedule\.gs/);
assert.match(source, /apps-script-current/);
assert.match(source, /if \(\$legacyRoute5\) \{ \$migrationArguments \+= @\("--route5", \$legacyRoute5\) \}/);
assert.match(source, /if \(\$legacyRoute70\) \{ \$migrationArguments \+= @\("--route70", \$legacyRoute70\) \}/);
assert.match(source, /-not \$legacyRoute5 -and -not \$legacyRoute70/);
assert.doesNotMatch(source, /previous \$legacyFile file is unavailable/);

console.log('Deployment private-data recovery checks passed');
