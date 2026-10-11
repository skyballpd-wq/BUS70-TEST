const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Run the actual holiday resolver with a warm shared cache. Even then it
// reads Settings and Script Properties; a dispatch row must not repeat that IO.
function request(override = '') {
  const calls = { settings: 0, properties: 0, network: 0 };
  const context = {
    normalizeDate_: value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : '',
    CacheService: { getScriptCache: () => ({
      get: key => JSON.stringify([key.slice(-4) + '-01-01']), put() {}
    }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => ({
      getLastRow: () => 2,
      getDataRange: () => ({ getDisplayValues() {
        calls.settings++;
        return [['key', 'value'], ['HOLIDAY_DATES', override]];
      } })
    }) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty() {
      calls.properties++;
      return '';
    } }) },
    UrlFetchApp: { fetch() { calls.network++; throw new Error('unexpected network'); } }
  };
  vm.createContext(context);
  for (const file of ['BoardEntry.gs', 'PrivateRouteStore.gs']) {
    vm.runInContext(fs.readFileSync('apps-script/' + file, 'utf8'), context);
  }
  return { context, calls };
}

const first = request('2099-01-02');
for (let row = 0; row < 200; row++) {
  assert.equal(first.context.bus70ServiceClassForDate_('2099-01-02'), 'SUNDAY_HOLIDAY');
  assert.equal(first.context.bus70ServiceClassForDate_('2099-01-05'), 'WEEKDAY');
}
assert.deepEqual(first.calls, { settings: 1, properties: 1, network: 0 });
assert.equal(first.context.bus70ServiceClassForDate_('2100-01-01'), 'SUNDAY_HOLIDAY');
assert.equal(first.calls.settings, 2, 'another year has its own holiday set');
assert.equal(first.context.bus70ServiceClassForDate_('2099-01-02', '평일'), 'WEEKDAY');

const second = request();
assert.equal(second.context.bus70ServiceClassForDate_('2099-01-02'), 'WEEKDAY');
assert.equal(second.calls.settings, 1, 'the next request must see changed overrides');
console.log('service-class-cache: repeated dispatch dates reuse holiday IO per request');
