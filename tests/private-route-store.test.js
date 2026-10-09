const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const fixture = require('./private-route-fixture');

function loadContext({moduleData, propertyData, propertyOverrides = {}} = {}) {
  const properties = Object.assign({}, propertyOverrides);
  if (propertyData) properties.BUS70_PRIVATE_ROUTE_DATA_JSON = JSON.stringify(propertyData);
  const context = {
    console, JSON, Object, Array, String,
    normalizeDate_: value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : '',
    PropertiesService:{getScriptProperties:() => ({getProperty:key => properties[key] || ''})}
  };
  if (moduleData) context.BUS70_PRIVATE_ROUTE_DATA_ = moduleData;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('apps-script/PrivateRouteStore.gs','utf8'), context);
  return context;
}

const local = loadContext({moduleData:fixture});
const route = local.bus70PrivateRouteSource_('5','2099-01-08');
assert.equal(route.scheduleVersion,'SYN-R5-V1');
route.assignments[0][1] = '변경시도';
assert.notEqual(local.bus70PrivateRouteSource_('5','2099-01-08').assignments[0][1],'변경시도');
assert.deepEqual(JSON.parse(JSON.stringify(local.bus70PrivateConfig_())),{shiftAnchorDate:'2099-01-08',shiftAnchor:'B'});
assert.deepEqual(Array.from(local.bus70PrivateDriverOnlyIds_()),['DRV-B-TEST-002']);
const profile = local.bus70PrivateRouteProfile_('5', route);
assert.equal(profile.route,'5');
assert.equal(profile.stopCount,3);
assert.equal(profile.stops[0].id,'5-STOP-001');
assert.equal(profile.stops[1].name,'가상중간정류장');
assert.equal(profile.boardAvailable,true);
assert.equal(profile.timetableAvailable,true);
assert.equal(local.bus70PrivateRouteStatus_().source,'LOCAL_PRIVATE_MODULE');
assert.deepEqual(Array.from(local.bus70PrivateRouteStatus_().routes['5']),['2099-01-08','2099-01-10']);
assert.deepEqual(Array.from(local.bus70PrivateRouteStatus_().routes['70']),['2099-01-08','2099-01-10']);

const property = loadContext({propertyData:fixture,propertyOverrides:{BUS70_SHIFT_ANCHOR_DATE:'2099-01-09',BUS70_SHIFT_ANCHOR_SHIFT:'A'}});
assert.equal(property.bus70PrivateRouteSource_('70','2099-01-08').scheduleVersion,'SYN-R70-V1');
assert.deepEqual(JSON.parse(JSON.stringify(property.bus70PrivateConfig_())),{shiftAnchorDate:'2099-01-09',shiftAnchor:'A'});
assert.equal(property.bus70PrivateRouteStatus_().source,'SCRIPT_PROPERTY');

const empty = loadContext();
assert.equal(empty.bus70PrivateRouteSource_('5','2099-01-08'),null);
assert.equal(empty.bus70PrivateConfig_(),null);
assert.equal(empty.bus70PrivateRouteStatus_().configured,false);

console.log('PrivateRouteStore tests passed');
