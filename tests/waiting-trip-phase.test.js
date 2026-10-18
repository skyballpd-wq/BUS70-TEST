const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const gps=require('../driver-automation'),stops=require('./route5-public-stops');
const date='2099-01-08',trip={trip:4,startTime:'14:41',turnTime:'15:50',endTime:'17:00',startPlace:stops[0].name,endPlace:stops.at(-1).name,turnPlace:'삼정동복지회관',turnLocation:{...stops[55],referenceId:'OPS-SAMJEONG'}},path=gps.course(trip,stops);
let now=gps.moment(date,'14:02');
const fix=(index,time=now)=>({timestamp:time,coords:{latitude:stops[index].lat,longitude:stops[index].lng,accuracy:8,speed:4/3.6,heading:gps.bearing(stops.at(-2),stops.at(-1))}});
const log={date,startTime:trip.startTime,trackingActive:false};
const polluted={configured:true,fraction:113,matchedMeters:35000,routeProgressPercent:100,returnConfirmed:true,turnPassed:true,timestamp:now,returnEvidence:[{stopId:'old-1'},{stopId:'old-2'}]};
let nav=gps.navigate(path,fix(113),log,polluted,now);
assert(nav.waiting&&!nav.configured&&!nav.retained);assert.equal(nav.tripProgressPercent,0);assert(!nav.turnPassed&&!nav.returnConfirmed);assert.deepEqual(nav.returnEvidence,[]);assert(!('matchedMeters' in nav));
// The clock crossing departure time cannot make a stationary depot into arrival.
now=gps.moment(date,'14:42');nav=gps.navigate(path,fix(113),{...log,trackingActive:true},nav,now);
assert(nav.waiting);assert.equal(nav.tripProgressPercent,0);
const noGps=gps.navigate(path,{...fix(113),timestamp:now-90000},log,nav,now);assert(noGps.waiting);
// A manager-adjusted departure time opens the outbound track, discarding waiting memory.
now=gps.moment(date,'14:35');const moving=fix(1);moving.coords.speed=6;moving.coords.heading=gps.bearing(stops[0],stops[1]);
const departed=gps.navigate(path,moving,{...log,startTime:'14:34',actualStart:date+' 14:34:50'},nav,now);
assert(departed.configured&&!departed.waiting&&!departed.returnConfirmed);assert(departed.tripProgressPercent>0&&departed.tripProgressPercent<5);
// Future trips cannot recover ARRIVE from another trip's return evidence.
let state={};for(let i=0;i<2;i++){const time=now+i*3000,out=gps.step(state,{date,startTime:trip.startTime,now:time,log:{},position:fix(113,time),hasTurn:true,points:{end:stops.at(-1)},navigation:polluted});assert.equal(out.event,null);state=out.state;}
// Missing-departure recovery remains possible on a genuinely observed return.
now=gps.moment(date,'16:58');const recovering={...polluted,timestamp:now};
assert(!gps.waitingForDeparture(path,fix(113),log,recovering,now));
// Execute the actual dashboard renderer with synthetic records and a fixed clock.
const html=fs.readFileSync('index.html','utf8');function extract(name){const start=html.indexOf('function '+name+'('),brace=html.indexOf('{',start);assert(start>=0);let depth=0;for(let i=brace;i<html.length;i++){if(html[i]==='{')depth++;if(html[i]==='}'&&!--depth)return html.slice(start,i+1);}throw Error(name);}
now=gps.moment(date,'14:02');class FixedDate extends Date {static now(){return now;}}
const node=()=>({textContent:'',style:{setProperty(){}},classList:{toggle(){}},setAttribute(){}}),nodes=Object.fromEntries(['driverLiveTarget','driverLiveCountdown','driverNavPrevious','driverNavNext','driverTripProgressRing','driverTripProgressValue','driverLiveSpeed'].map(id=>[id,node()]));nodes.workDate={value:date};
const completed={...trip,trip:3,startTime:'11:33',turnTime:'12:46',endTime:'13:59'},data={temporalState:'CURRENT',dispatch:{sequence:1,dispatchId:'SYN',vehicleId:'SYN'},routeProfile:{stops},trips:[completed,trip],runLogs:[{date,sequence:1,trip:3,actualStart:date+' 11:34:12',actualTurn:date+' 12:40:10',actualEnd:date+' 13:54:20'}]};
const memory=new Map(),c=vm.createContext({nativeArrivalEstimate:null,Date:FixedDate,console,Bus70Automation:gps,Bus70Cockpit:{telemetry:()=>({speed:'4 km/h'}),drawRing(){}},lastSchedule:data,activeTripIndex:1,followCurrentTrip:true,lastDriverPosition:fix(113),currentNavigation:null,navigationMemory:memory,liveFleet:{},todayLocal:()=>date,document:{getElementById:id=>nodes[id]||null,querySelectorAll:()=>[]},refreshCockpitWeather(){},displayTime:v=>v,scheduleRefreshedAt:0});
['scheduleSequence','runLogForTrip','tripCompleted','firstActiveTripIndex','driverLiveContext','driverDisplayedContext','isDisplayedTripLive','driverAssignmentBinding','serviceOperationalMinutes','routeNavigationState','tripProgressValue','scheduleMoment','canonicalTime','actualClock','actualMoment','driverCountdownLabel','updateDriverLiveDashboard','restoreNativeNavigation'].forEach(n=>vm.runInContext(extract(n),c));
c.updateDriverLiveDashboard();assert.equal(nodes.driverLiveTarget.textContent,'4탕 발차 · 14:41');assert.equal(nodes.driverLiveCountdown.textContent,'예정시각까지 39분');assert.equal(nodes.driverTripProgressValue.textContent,'0% · 출발 대기');assert.equal(nodes.driverNavPrevious.textContent,'—');assert.equal(nodes.driverNavNext.textContent,'출발 대기');assert.equal(nodes.driverLiveSpeed.textContent,'출발 대기','walking phone speed is not displayed as vehicle speed at the depot');
const before=JSON.stringify(data.runLogs);c.restoreNativeNavigation({versionCode:71,navigation:{...polluted,date,trip:4,dispatchId:'SYN',vehicleId:'SYN'}});assert([...memory.values()].every(v=>!v.returnConfirmed),'future trip rejects even a native end-of-route snapshot');
c.activeTripIndex=0;c.followCurrentTrip=false;c.updateDriverLiveDashboard();assert.equal(nodes.driverLiveTarget.textContent,'3탕 완료');assert.equal(nodes.driverLiveCountdown.textContent,'실제 도착 기록 완료');assert.equal(nodes.driverTripProgressValue.textContent,'100% · 운행 완료');assert.equal(JSON.stringify(data.runLogs),before);
console.log('Completed-to-waiting dashboard, shared depot, scheduled boundary, early departure, native restore and false-arrival regressions passed');
