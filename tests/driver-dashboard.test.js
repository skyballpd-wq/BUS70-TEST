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
  'hasNumericValue',
  'scheduleMoment',
  'scheduleSequence',
  'runLogForTrip',
  'tripCompleted',
  'firstActiveTripIndex',
  'tripOperationalState',
  'driverProgress',
  'driverLiveContext',
  'driverGapLabel'
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

assert.equal(context.scheduleMoment('2026-10-09', '22:50').toISOString(), '2026-10-09T13:50:00.000Z');
assert.equal(context.scheduleMoment('2026-10-09', '02:00').toISOString(), '2026-10-09T17:00:00.000Z');

console.log('Driver dashboard tests passed');
