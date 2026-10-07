const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /const API_TIMEOUT_MS = 45000;/);
assert.match(html, /async function apiFetch\(url, options\)/);
assert.match(html, /const data = await apiPost\(\{action:"loginSecure", name, empId, date:todayLocal\(\)\}\);/);
assert.doesNotMatch(html, /apiRequest\(\{action:"login", name, empId\}\)/);
assert.doesNotMatch(html, /\n\s*checkServer\(\);\s*\n/);
assert.match(html, /if\(operationRequestInFlight\)return;/);
assert.match(html, /loadMySchedule\(true\)/);
assert.match(html, /최근 저장정보입니다\. 서버에서 현재 사번·노선·배차를 확인 중/);
assert.match(html, /function tripGapSummary\(trip\)/);
assert.match(html, /앞차 배차간격/);
assert.match(html, /뒷차 배차간격/);
assert.match(html, /전체 펼침/);
assert.match(html, /탕별 카드/);
assert.match(html, /trip\.completed/);
assert.match(html, /실시간 위치 자동 기록 시작/);
assert.match(html, /navigator\.geolocation\.watchPosition/);
assert.match(html, /automaticRunEvent\(trip,"TURN",position\)/);
assert.match(html, /source:"GPS_AUTO"/);
assert.match(html, /plannedTurn:trip\.turnTime/);

console.log('Frontend resilience tests passed');
