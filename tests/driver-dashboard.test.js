const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = inline.indexOf(marker);
  assert.notEqual(start, -1, `${name} 함수가 없습니다.`);
  const brace = inline.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < inline.length; index += 1) {
    if (inline[index] === '{') depth += 1;
    if (inline[index] === '}') {
      depth -= 1;
      if (depth === 0) return inline.slice(start, index + 1);
    }
  }
  throw new Error(`${name} 함수 끝을 찾지 못했습니다.`);
}

const context = {
  console,
  Date,
  document: {getElementById: () => ({value: '2026-10-09'})}
};
vm.createContext(context);
[
  'canonicalTime',
  'actualClock',
  'actualMoment',
  'scheduleComparison',
  'hasNumericValue',
  'scheduleMoment',
  'normalizeScheduleTrips',
  'scheduleSequence',
  'runLogForTrip',
  'tripCompleted',
  'firstActiveTripIndex',
  'tripOperationalState',
  'driverProgress',
  'driverLiveContext',
  'driverGapLabel',
  'serviceOperationalMinutes',
  'routeStopCoordinates',
  'stopNameKey',
  'sameStopName',
  'haversineMeters',
  'routeLegStops',
  'projectPositionToStops',
  'routeNavigationState',
  'tripProgressValue',
  'driverTripProgress',
  'liveDistanceLabel',
  'liveHeadwayLabel',
  'driverAssignmentBinding'
].forEach(name => vm.runInContext(extractFunction(name), context));

const trips = [
  {trip:1,startPlace:'가상차고지',startTime:'05:20',turnPlace:'가상회차지',turnTime:'06:05',endPlace:'가상차고지',endTime:'06:50',plannedFrontGapMinutes:8,plannedRearGapMinutes:9},
  {trip:2,startPlace:'가상차고지',startTime:'07:20',turnPlace:'가상회차지',turnTime:'08:05',endPlace:'가상차고지',endTime:'08:50',actualFrontGapMinutes:7,plannedRearGapMinutes:8},
  {trip:3,startPlace:'가상차고지',startTime:'09:20',turnPlace:'가상회차지',turnTime:'10:05',endPlace:'가상차고지',endTime:'10:50'}
];
const data = {
  temporalState:'CURRENT',
  dispatch:{sequence:15},
  trips,
  runLogs:[
    {date:'2026-10-09',sequence:15,trip:1,actualStart:'05:20',actualTurn:'06:05',actualEnd:'06:50'},
    {date:'2026-10-09',sequence:15,trip:2,actualStart:'07:20'}
  ]
};

assert.equal(context.tripOperationalState(data,trips[0],0).key, 'completed');
assert.equal(context.tripOperationalState(data,trips[1],1).key, 'running');
assert.equal(context.tripOperationalState(data,trips[2],2).key, 'upcoming');
assert.equal(context.driverProgress(data), 44);
assert.equal(context.driverLiveContext(data).action, '2탕 회차');
assert.match(context.driverGapLabel(trips[1], 'front'), /7분 · 실제/);
assert.match(context.driverGapLabel(trips[1], 'rear'), /8분 · 계획/);
assert.equal(context.hasNumericValue(null), false);
assert.equal(context.hasNumericValue(''), false);
const secondTripStart=context.normalizeScheduleTrips([{trip:4,startTime:'08:00'},{trip:2,startTime:'05:00'},{trip:1,startTime:''},{trip:2,startTime:'중복'}]);
assert.deepEqual(JSON.parse(JSON.stringify(secondTripStart.map(v=>v.trip))),[2,4]);

assert.equal(context.scheduleMoment('2026-10-09', '22:50').toISOString(), '2026-10-09T13:50:00.000Z');
assert.equal(context.scheduleMoment('2026-10-09', '02:00').toISOString(), '2026-10-09T17:00:00.000Z');
assert.equal(context.scheduleComparison('2026-10-09','23:55','2026-10-10 00:05:00').deltaMinutes,10);
assert.equal(context.scheduleComparison('2026-10-09','00:10','2026-10-10 00:05:00').deltaMinutes,-5);
assert.equal(context.scheduleComparison('2026-10-09','07:20','2026-10-09 07:20:00').label,'정시');

vm.runInContext(extractFunction('tripPointRoles'), context);
const roleTrips=[
  {trip:1,startPlace:'가상차고지',turnPlace:'가상회차지',endPlace:'가상차고지'},
  {trip:2,startPlace:'가상차고지',endPlace:'가상종점',serviceEndType:'UPBOUND_LAST',serviceEndPlace:'가상종점',deadheadDestination:'가상차고지',finalService:true}
];
const firstRoles=context.tripPointRoles({trips:roleTrips},roleTrips[0],0);
const finalRoles=context.tripPointRoles({trips:roleTrips},roleTrips[1],1);
assert.equal(firstRoles.turn.label,'회차지·복귀 구간 시작지');
assert.equal(firstRoles.end.label,'탕 종료·다음 탕 시작지');
assert.equal(finalRoles.end.label,'막탕 상행 영업종료지');
assert.equal(finalRoles.returnPoint.label,'막탕 회송 복귀지');

const navigationData = {
  temporalState:'CURRENT', dispatch:{sequence:15},
  trips:[{trip:1,startPlace:'가상차고지',startTime:'05:00',turnPlace:'가상회차지',turnTime:'06:00',endPlace:'가상차고지',endTime:'07:00'}],
  runLogs:[{date:'2026-10-09',sequence:15,trip:1,actualStart:'05:00'}],
  routeProfile:{stops:[
    {id:'UP-1',name:'가상차고지',direction:'상행',order:1,lat:37.5,lng:126.7},
    {id:'UP-2',name:'가상중간',direction:'상행',order:2,lat:37.5,lng:126.71},
    {id:'UP-3',name:'가상회차지',direction:'상행',order:3,lat:37.5,lng:126.72},
    {id:'DN-1',name:'가상회차지',direction:'하행',order:1,lat:37.5,lng:126.72},
    {id:'DN-2',name:'가상복귀중간',direction:'하행',order:2,lat:37.5,lng:126.71},
    {id:'DN-3',name:'가상차고지',direction:'하행',order:3,lat:37.5,lng:126.7}
  ]}
};
const navigation=context.routeNavigationState(navigationData,{coords:{latitude:37.5,longitude:126.71,accuracy:8}});
assert.equal(navigation.configured,true);
assert.equal(navigation.direction,'상행');
assert.equal(navigation.currentStop,'가상중간');
assert.equal(navigation.nextStop,'가상회차지');
assert.equal(navigation.routeProgressPercent,50);
assert.equal(navigation.tripProgressPercent,25);
assert.equal(context.driverTripProgress(navigationData,navigation),25);
assert.equal(context.tripProgressValue(data,trips[0],0,null),100);
assert.equal(context.tripProgressValue(data,trips[1],1,{configured:true,trip:2,tripProgressPercent:42}),42);
assert.equal(context.tripProgressValue(data,trips[2],2,null),0);
assert.match(context.liveHeadwayLabel({sequence:14,estimatedGapMinutes:4.2,gapEstimateBasis:'OBSERVED_STOP_INTERVAL',freshnessSeconds:7},navigationData.trips[0],'front'),/4\.2분 · 정류장 관측/);
assert.equal(context.driverAssignmentBinding({dispatch:{dispatchId:'DSP-15',sequence:15,vehicleId:'VEH-15'}}).ready,true);
assert.equal(context.driverAssignmentBinding({dispatch:{dispatchId:'DSP-15',sequence:15}}).ready,false);

console.log('Driver dashboard tests passed');

// A round-trip API response must use the real return-side stops, even when
// outbound/return stop names and the start/end station ID coincide.
const roundTrip={routeProfile:{stops:[
  {id:'a',name:'가상차고지',order:1,lat:37.1,lng:126.8,provider:'GYEONGGI_BUS_ROUTE_V2'},
  {id:'b',name:'같은이름',order:2,lat:37.2,lng:126.9,provider:'GYEONGGI_BUS_ROUTE_V2'},
  {id:'c',name:'가상회차지',order:3,lat:37.3,lng:127,turnaround:true,provider:'GYEONGGI_BUS_ROUTE_V2'},
  {id:'d',name:'같은이름',order:4,lat:37.21,lng:126.91,provider:'GYEONGGI_BUS_ROUTE_V2'},
  {id:'e',name:'가상차고지',order:5,lat:37.1,lng:126.8,provider:'GYEONGGI_BUS_ROUTE_V2'}
]}};
assert.deepEqual(Array.from(context.routeLegStops(roundTrip,trips[0],{}).stops,s=>s.id),['a','b','c']);
assert.deepEqual(Array.from(context.routeLegStops(roundTrip,trips[0],{actualTurn:'06:05'}).stops,s=>s.id),['c','d','e']);
const reversedTrip={startPlace:'가상회차지',turnPlace:'가상차고지',endPlace:'가상회차지'};
assert.deepEqual(Array.from(context.routeLegStops(roundTrip,reversedTrip,{}).stops,s=>s.id),['c','d','e']);
assert.deepEqual(Array.from(context.routeLegStops(roundTrip,reversedTrip,{actualTurn:'06:05'}).stops,s=>s.id),['a','b','c']);

// Progress counts stop occurrences; unequal distances must not change the count.
const unequalStops=[{name:'가상시작',lat:37.5,lng:126.7},{name:'가상경유',lat:37.5,lng:126.701},{name:'가상끝',lat:37.5,lng:126.8}];
const counted=context.projectPositionToStops(unequalStops,{coords:{latitude:37.5,longitude:126.701,accuracy:5}});
assert.equal(counted.passedStopCount,2);assert.equal(counted.stopProgressPercent,50);assert.ok(counted.routeProgressPercent<5);
assert.equal(context.routeNavigationState(navigationData,{timestamp:Date.now()-60000,coords:{latitude:37.5,longitude:126.71,accuracy:8}}).configured,false);
assert.equal(context.routeNavigationState(navigationData,{coords:{latitude:37.5,longitude:126.71,accuracy:500}}).configured,false);
assert.equal(context.tripProgressValue(data,trips[1],1,null),0,'No invented GPS percentage from departure alone');
