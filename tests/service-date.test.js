const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const source = html.match(/  function serviceDateInSeoul\([\s\S]*?\n  }/)[0];
const context = {Date, Intl};
vm.createContext(context);
vm.runInContext(source, context);

const cases = [
  ['2026-10-11T05:11:58Z', '2026-10-11'],
  ['2026-10-10T18:29:59Z', '2026-10-10'],
  ['2026-10-10T18:30:00Z', '2026-10-11'],
  ['2026-12-31T18:29:59Z', '2026-12-31'],
  ['2026-12-31T18:30:00Z', '2027-01-01'],
  ['2028-02-29T18:29:59Z', '2028-02-29'],
  ['2028-02-29T18:30:00Z', '2028-03-01']
];
const originalTimezone = process.env.TZ;
try {
  for (const timezone of ['UTC', 'America/Los_Angeles', 'Asia/Seoul']) {
    process.env.TZ = timezone;
    for (const [instant, expected] of cases) {
      assert.equal(context.serviceDateInSeoul(Date.parse(instant)), expected, `${timezone}: ${instant}`);
    }
  }
} finally {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
}
console.log('Seoul service date: timezone independence and 03:30 boundaries passed');
