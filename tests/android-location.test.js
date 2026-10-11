const assert = require('assert');
const fs = require('fs');

const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const activity = fs.readFileSync('android/app/src/main/java/kr/bus70/driver/MainActivity.java', 'utf8');
const service = fs.readFileSync('android/app/src/main/java/kr/bus70/driver/DriverLocationService.java', 'utf8');
const tripOrder = fs.readFileSync('android/app/src/main/java/kr/bus70/driver/TripOrder.java', 'utf8');
const alarm = fs.readFileSync('android/app/src/main/java/kr/bus70/driver/AlarmScheduler.java', 'utf8');
const calendar = fs.readFileSync('android/app/src/main/java/kr/bus70/driver/CalendarSync.java', 'utf8');
const build = fs.readFileSync('android/app/build.gradle', 'utf8');

assert.match(manifest, /ACCESS_FINE_LOCATION/);
assert.match(manifest, /FOREGROUND_SERVICE_LOCATION/);
assert.match(manifest, /DriverLocationService/);
assert.match(manifest, /foregroundServiceType="location"/);
assert.match(activity, /setGeolocationEnabled\(true\)/);
assert.match(activity, /startLocationTracking/);
assert.match(activity, /bus70NativeLocationStatus/);
assert.match(activity, /postDelayed/);
assert.match(service, /position snapshot is also sent/);
assert.match(service, /put\("operation", "driverRunLogSave"\)/);
assert.match(service, /put\("operation", "driverLiveLocationSave"\)/);
assert.match(service, /minimumIntervalSeconds/);
assert.match(service, /configuredRouteStops/);
assert.match(service, /schedule\.optString\("vehicleId"\)/);
assert.match(service, /로그인 기사·확정 배차·배정 차량/);
assert.match(service, /VEHICLE_MISMATCH/);
assert.match(service, /put\("source", "GPS_AUTO"\)/);
assert.match(service, /TripOrder\.actual\(schedule\.optJSONArray\("trips"\)\)/);
assert.match(tripOrder, /a sequence may start at trip 2/);
assert.match(tripOrder, /comparingInt/);
assert.match(alarm, /TripOrder\.actual\(payload\.optJSONArray\("trips"\)\)/);
assert.match(calendar, /TripOrder\.actual\(payload\.optJSONArray\("trips"\)\)/);
assert.match(service, /server cache expires it instead of building a location history/);
assert.match(fs.readFileSync('android/app/src/main/java/kr/bus70/driver/NativeStore.java', 'utf8'), /remove\("locationTimestamp"\)/);
assert.match(build, /versionCode 57/);
assert.match(build, /versionName "0\.57-live-route-navigation"/);

console.log('Android location integration tests passed');
