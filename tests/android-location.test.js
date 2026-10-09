const assert = require('assert');
const fs = require('fs');

const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const activity = fs.readFileSync('android/app/src/main/java/kr/bus70/driver/MainActivity.java', 'utf8');
const service = fs.readFileSync('android/app/src/main/java/kr/bus70/driver/DriverLocationService.java', 'utf8');
const build = fs.readFileSync('android/app/build.gradle', 'utf8');

assert.match(manifest, /ACCESS_FINE_LOCATION/);
assert.match(manifest, /FOREGROUND_SERVICE_LOCATION/);
assert.match(manifest, /DriverLocationService/);
assert.match(manifest, /foregroundServiceType="location"/);
assert.match(activity, /setGeolocationEnabled\(true\)/);
assert.match(activity, /startLocationTracking/);
assert.match(activity, /bus70NativeLocationStatus/);
assert.match(activity, /postDelayed/);
assert.match(service, /only confirmed departure\/turn\/arrival events are sent/);
assert.match(service, /put\("operation", "driverRunLogSave"\)/);
assert.match(service, /put\("source", "GPS_AUTO"\)/);
assert.doesNotMatch(service, /put\("operation", "driverLocation/);
assert.match(fs.readFileSync('android/app/src/main/java/kr/bus70/driver/NativeStore.java', 'utf8'), /remove\("locationTimestamp"\)/);
assert.match(build, /versionCode 56/);
assert.match(build, /versionName "0\.56-driver-live-dashboard"/);

console.log('Android location integration tests passed');
