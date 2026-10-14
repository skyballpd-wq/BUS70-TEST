const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');

function extract(name) {
  const start = html.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  let depth = 0;
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) {
      return (html.slice(start - 6, start) === 'async ' ? 'async ' : '') + html.slice(start, i + 1);
    }
  }
  throw Error(name);
}

function fixture() {
  let now = Date.parse('2099-01-10T14:59:59Z'); // 23:59:59 in Korea
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const nodes = {}, calls = [], handlers = {}, intervals = [], errors = [];
  function element(tag = 'div', text = '', className = '') {
    return {tag, text, className, value:'', children:[], disabled:false,
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children=children; },
      setAttribute() {}, addEventListener(event, fn) { this[event]=fn; }
    };
  }
  const node = id => nodes[id] ||= element();
  node('workDate').value='2099-01-10';
  const c=vm.createContext({
    Date:Clock, Intl, console:{error:e=>errors.push(e)},
    document:{hidden:false,getElementById:node}, window:{},
    authToken:'synthetic-token',currentDriverId:'synthetic-driver',currentRole:'',
    scheduleFollowToday:true,scheduleRequestId:0,scheduleRefreshInFlight:false,
    scheduleRefreshedAt:0,scheduleRefreshAttemptAt:0,scheduleRefreshError:'',
    lastSchedule:null,activeTripIndex:0,followCurrentTrip:true,
    locationTrackingActive:false,geofenceVisitState:new Map(),navigationMemory:new Map(),
    resetConfirmation(){node('confirmScheduleButton').hidden=true;},
    clearDriverAlarms(){},stopDriverLocationTracking(){},stopDriverFleetTimer(){},
    hasNativeLocationBridge:()=>false,el:element,
    prepareDriverLocationPoints(){},overlayGpsEvents(){},
    driverAssignmentBinding:()=>({}),apiErrorMessage:(e,fallback)=>fallback,
    apiPost:async body=>{calls.push(body);return handlers.respond(body);},
    showLoginScreen(){throw Error('Unexpected authentication failure');},
    setInterval:fn=>{intervals.push(fn);return 1;},stopDriverLiveTimer(){},
    flushGpsOutbox(){},pollNativeLocation(){},resumeDriverLocationIfAllowed(){},updateDriverLiveDashboard(){}
  });
  const names=['calendarDateInSeoul','serviceDateInSeoul','scheduleForRequestedDate','resetScheduleView','refreshScheduleDate','refreshScheduleOnResume','normalizeScheduleTrips','renderSchedule','loadMySchedule','startDriverLiveTimer'];
  vm.runInContext(names.map(extract).join('\n'),c);
  handlers.respond=body=>({ok:true,driver:{driverId:c.currentDriverId,status:'재직'},schedule:{ok:true,type:'NO_DISPATCH',date:body.date}});
  const text=entry=>[entry.text||'',...(entry.children||[]).map(text)].join(' ');
  return {c,node,calls,handlers,intervals,errors,screen:()=>text(node('scheduleResult')),setTime:iso=>{now=Date.parse(iso);}};
}

(async()=>{
  const f=fixture();
  const cases=[
    ['2099-01-10T14:59:59Z','2099-01-10'],
    ['2099-01-10T15:00:00Z','2099-01-11'],
    ['2099-12-31T15:00:00Z','2100-01-01'],
    ['2104-02-28T15:00:00Z','2104-02-29'],
    ['2104-02-29T15:00:00Z','2104-03-01']
  ];
  const tz=process.env.TZ;
  try {
    for(const zone of ['UTC','America/Los_Angeles','Asia/Seoul']) {
      process.env.TZ=zone;
      for(const [instant,expected] of cases)assert.equal(f.c.calendarDateInSeoul(Date.parse(instant)),expected);
    }
  } finally { if(tz===undefined)delete process.env.TZ;else process.env.TZ=tz; }
  assert.equal(f.c.serviceDateInSeoul(Date.parse('2099-01-10T15:00:00Z')),'2099-01-10','overnight record date is unchanged');

  await f.c.loadMySchedule();
  assert.match(f.screen(),/\? 오늘 스케줄 없음/);
  assert.match(f.screen(),/2099-01-10/);
  assert.equal(f.node('confirmScheduleButton').hidden,true);
  assert.equal(f.c.scheduleRefreshInFlight,false);

  // A long-lived empty screen must roll over and request today's date, even
  // without an existing trip card to drive its refresh timer.
  f.c.startDriverLiveTimer();
  f.setTime('2099-01-10T15:00:00Z');
  f.intervals[0]();
  assert.equal(f.node('workDate').value,'2099-01-11');
  assert.equal(f.c.lastSchedule,null,'clear yesterday before awaiting the server');
  assert.match(f.screen(),/조회 중/);
  assert.equal(f.calls.at(-1).date,'2099-01-11');
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(f.screen(),/2099-01-11.*\? 오늘 스케줄 없음/);

  const resume=fixture();
  resume.c.document.hidden=true;
  resume.setTime('2099-01-10T15:00:00Z');
  resume.c.refreshScheduleOnResume();assert.equal(resume.calls.length,0);
  resume.c.document.hidden=false;
  resume.c.refreshScheduleOnResume();
  assert.equal(resume.calls[0].date,'2099-01-11');
  await new Promise(resolve=>setImmediate(resolve));
  // Explicit history selection remains possible; today's button restores follow mode.
  resume.c.scheduleFollowToday=false;resume.node('workDate').value='2099-01-09';
  resume.c.refreshScheduleOnResume();assert.equal(resume.node('workDate').value,'2099-01-09');
  const before=resume.calls.length;
  resume.c.scheduleFollowToday=true;resume.c.refreshScheduleDate();
  assert.equal(resume.calls.length,before+1);assert.equal(resume.node('workDate').value,'2099-01-11');
  await new Promise(resolve=>setImmediate(resolve));

  // Reject a wrong-day WORK response (including a conflicting dispatch date).
  for(const response of [
    {ok:true,type:'WORK',date:'2099-01-09',trips:[{trip:1,startTime:'05:00'}]},
    {ok:true,type:'WORK',date:'2099-01-10',dispatch:{date:'2099-01-09'},trips:[{trip:1,startTime:'05:00'}]},
    {ok:true,type:'WORK',trips:[{trip:1,startTime:'05:00'}]}
  ]) {
    const wrong=fixture();
    wrong.handlers.respond=()=>({ok:true,driver:{driverId:wrong.c.currentDriverId},schedule:response});
    await wrong.c.loadMySchedule();
    assert.equal(wrong.c.lastSchedule.error,'SCHEDULE_DATE_MISMATCH');
    assert.match(wrong.screen(),/스케줄 확인 실패/);assert.doesNotMatch(wrong.screen(),/스케줄 없음/);
  }

  for(const type of ['NO_DISPATCH','NO_SCHEDULE','REST','WORK']) {
    f.c.lastSchedule={ok:true,type,date:'2099-01-11',trips:[]};f.c.renderSchedule();
    assert.match(f.screen(),/\? 오늘 스케줄 없음/);
  }
  f.c.lastSchedule={ok:false,message:'서버 연결 실패'};f.c.renderSchedule();
  assert.match(f.screen(),/확인 실패/);assert.doesNotMatch(f.screen(),/스케줄 없음/);

  // Delayed yesterday response must not replace today's result or release its request lock.
  const late=fixture();let resolveOld,resolveNew;
  late.handlers.respond=body=>new Promise(resolve=>{if(body.date==='2099-01-10')resolveOld=resolve;else resolveNew=resolve;});
  const old=late.c.loadMySchedule();
  late.setTime('2099-01-10T15:00:00Z');late.c.refreshScheduleDate();
  resolveOld({ok:true,driver:{driverId:late.c.currentDriverId},schedule:{ok:true,type:'NO_DISPATCH',date:'2099-01-10'}});
  await old;
  assert.equal(late.c.lastSchedule,null);assert.equal(late.c.scheduleRefreshInFlight,true);
  resolveNew({ok:true,driver:{driverId:late.c.currentDriverId},schedule:{ok:true,type:'NO_DISPATCH',date:'2099-01-11'}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(late.screen(),/2099-01-11.*오늘 스케줄 없음/);

  // Failed automatic refresh cannot keep claiming that a schedule is absent.
  const offline=fixture();await offline.c.loadMySchedule();
  offline.handlers.respond=()=>{throw Error('offline');};
  await offline.c.loadMySchedule(true);
  assert.match(offline.screen(),/서버 조회에 실패/);assert.doesNotMatch(offline.screen(),/스케줄 없음/);
  assert.equal(offline.c.scheduleRefreshInFlight,false);
  assert.equal(f.errors.length,0);assert.equal(late.errors.length,0);assert.equal(resume.errors.length,0);
  console.log('Calendar-today schedule: KST midnight, rollover, resume, history, absent schedule, wrong-date responses, request races and offline state passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
