const assert=require('node:assert/strict');
const journey=require('../driver-journey'),headway=require('../driver-headway'),cockpit=require('../driver-cockpit'),automation=require('../driver-automation');
const base=Date.parse('2099-01-08T23:00:00+09:00'),date='2099-01-08';
const scope={route:'5',date,vehicleId:'SYN-OWN',dispatchId:'SYN-D',trip:2,running:true};
const trip={trip:2,startPlace:'고강공영차고지',turnPlace:'삼정종합사회복지회관',turnTime:'23:01',endPlace:'고강공영차고지'};
const stops=require('./route5-public-stops.json');trip.turnLocation={...stops[55],referenceId:'OPS-SAMJEONG'};
const path=automation.course(trip,stops);
assert.equal(path.turnIndex,55);assert.equal(path.pivotIndex,57);
assert.equal(journey.forecastGate('5',trip,path),57,'physical turnaround, not timetable recording point');
assert.equal(journey.forecastGate('5',trip,{...path,pivotIndex:55}),-1);
assert.equal(journey.forecastGate('5',trip,{...path,stops:path.stops.filter((_,i)=>i!==57)}),-1);
assert.equal(journey.forecastGate('5',{...trip,endPlace:'부천테크노파크4단지'},path),null,'one-way final service is not a depot return');
assert.equal(journey.forecastGate('70',trip,path),null,'route-specific gate');
const native={...scope,policyVersion:5,available:true,timestamp:base,predictedAt:base+1200000,latestAt:base+1500000};
const input={scope,trip,path,live:true,now:base,totalMeters:20000,log:{startAt:base-3600000,turnAt:base-60000},nav:{configured:true,path,timestamp:base,matchedMeters:10000,fraction:56},native};
for(const fraction of [55,56,57,57.15])assert.equal(journey.update({}, {...input,nav:{...input.nav,fraction}}).forecast,null,'turn record cannot start premature depot ETA');
let result=journey.update({}, {...input,nav:{...input.nav,fraction:57.2}});assert(result.forecast);
assert.equal(journey.update({}, {...input,nav:{...input.nav,fraction:57.2},native:{...native,policyVersion:4}}).forecast,null,'old native policy cannot override the new gate');
let state={};
for(let sec=0;sec<=240;sec+=5){
 const meters=11000+(sec<=180?sec*10:1800+(sec-180)*3);
 result=journey.update(state,{...input,native:null,now:base+sec*1000,nav:{...input.nav,timestamp:base+sec*1000,fraction:58+sec/240,matchedMeters:meters}});state=result.state;
}
assert(result.forecast);const duration=result.forecast.at-(base+240000);
assert(duration<(20000-12980)/3*1000,'a slow last minute does not set the entire remaining journey pace');
assert(duration>(20000-12980)/10*1000,'recent slowdown still affects the estimate');
assert.equal(journey.update(state,{...input,native:null,now:base+300000,nav:{...input.nav,timestamp:base+300000,fraction:60,matchedMeters:13100}}).forecast,null,'GPS gap resets history');
assert.equal(journey.clock(base+3660000,date),'다음날 00:01');

// During GBIS rate limiting, only real authenticated phone passages contribute.
const phonePath={pivotIndex:9,turnIndex:8,stops:Array.from({length:20},(_,i)=>({order:i+1,direction:i<=9?'OUT':'BACK'}))};
state={};let fleet,peers,nav,model;
function phone(sec,ownOrder,peerOrder,change={}){
 const at=base+sec*1000;
 nav={configured:true,path:phonePath,matchedIndex:ownOrder-1,timestamp:at};
 const p={route:'5',date,vehicleId:'SYN-F',dispatchId:'SYN-F-D',trip:3,running:true,matchedStopOrder:peerOrder,recordedAt:new Date(at).toISOString(),accuracyM:5,...change};
 fleet={route:'5',date,positions:[p],crossCheck:{error:'GBIS_HTTP_429'},roster:[{vehicleId:'SYN-F',vehicleNo:'시험00가9001',driverName:'합성앞기사',sequence:1}]};
 state=headway.sample(state,scope,nav,at);peers=cockpit.ringPeers(phonePath,fleet,nav,scope,at);
 headway.observeFleet(state,scope,nav,fleet,peers,at);model=headway.model('front',{plannedFrontGapMinutes:5},fleet,peers,state);return model;
}
phone(0,1,2);phone(15,1,2);phone(30,1,3);phone(45,1,3);phone(60,2,4);phone(75,2,4);model=phone(90,3,4);
assert.equal(model.peer.source,'APP_GPS');assert.equal(model.peer.stopGap,1);assert.equal(model.observedGap.minutes,1);assert.equal(model.observedGap.min,.8);assert.equal(model.observedGap.max,1.3);
assert.match(cockpit.peerStatus(fleet,nav,scope,peers,base+90000),/앱 GPS 기준 · 경기정보 제한/);
const histories=JSON.stringify(state.appObservations);headway.observeFleet(state,scope,nav,fleet,peers,base+90001);assert.equal(JSON.stringify(state.appObservations),histories,'cached fix does not create a new passage');
model=phone(105,3,4,{dispatchId:'SYN-REPLACEMENT'});assert.equal(model.observedGap,null,'vehicle reassignment cannot inherit another trip’s passages');
for(const change of [{recordedAt:new Date(base).toISOString()},{accuracyM:70},{running:false},{date:'2099-01-07'},{route:'23'}]){model=phone(120,3,4,change);assert.equal(model.observedGap,null);}
model=phone(135,3,12);assert.equal(model.peer,undefined,'opposite direction never becomes front or rear');
phone(150,3,4);fleet.crossCheck={fetchedAt:base+150000,fleet:[{source:'GYEONGGI_BUS_LOCATION_V2',positionBasis:'PROVIDER_STOP_REFERENCE',route:'5',date,vehicleId:'SYN-F',matchedStopOrder:8,stateCd:1,fetchedAt:base+150000}]};
peers=cockpit.ringPeers(phonePath,fleet,nav,scope,base+150000);assert.equal(peers[0].source,'APP_GPS');assert(peers[0].positionDisagreement);
headway.observeFleet(state,scope,nav,fleet,peers,base+150000);model=headway.model('front',{},fleet,peers,state);assert.equal(model.observedGap,null);assert.equal(model.comparison.status,'unknown');
const collision={vehicleId:'SYN-OWN',now:base,observationsAvailable:true,observations:{'SYN-OWN':{order:1,leg:'OUT',passages:[]},'SYN-SAME':{order:1,leg:'OUT',passages:[]}},alerts:{}};
model=headway.model('front',{}, {},[{side:'front',rank:1,fresh:true,reference:true,vehicle:'SYN-F',order:5,stopGap:4}],collision);
assert.match(model.actualLine,/4정류장/,'same-stop third vehicle does not erase another bus’s measured position');assert(model.ambiguous);

// Last services are explicit and directional, independent of trip count.
const upper={serviceEndType:'UPBOUND_LAST',plannedRearGapMinutes:10,rearSequence:2};
const lower={serviceEndType:'ROUND_TRIP_LAST',plannedRearGapMinutes:10,rearSequence:2};
const outbound={path:phonePath,matchedIndex:5},inbound={path:phonePath,matchedIndex:11,returnConfirmed:true};
assert.equal(headway.lastDirection(upper,outbound),'상행');assert.equal(headway.lastDirection(lower,outbound),'');assert.equal(headway.lastDirection(lower,inbound),'하행');
assert.equal(headway.lastDirection({trip:7},inbound),'','trip number alone never establishes a last service');
model=headway.model('rear',upper,{},[],{navigation:outbound,now:base});assert.equal(model.planned,null);assert.match(model.plannedLine,/상행 막차/);assert.equal(model.identity,'예정 뒷차 없음');assert.equal(model.actualLine,'미수신');
model=headway.model('rear',lower,{},[],{navigation:outbound,now:base});assert.equal(model.planned,10);
model=headway.model('rear',lower,{},[{side:'rear',rank:1,vehicle:'SYN-R',vehicleNo:'시험00가9002',fresh:true,stopGap:3}],{navigation:inbound,now:base});assert.match(model.plannedLine,/하행 막차/);assert.match(model.identity,/9002호/,'actual received rear bus is still visible on a planned last service');

// General voice needs new observations for 3 minutes; unchanged state repeats after 10 minutes.
state={};const alert=(sec,change={},priority=false)=>headway.warning([{side:'front',planned:5,peer:{side:'front',vehicle:'SYN-F',source:'APP_GPS',binding:'SYN-F-D|3',fresh:true,observedAt:base+sec*1000,stopGap:2},...change}],state,base+sec*1000,true,priority);
for(let sec=0;sec<180;sec+=15)assert.equal(alert(sec),null);
let warning=alert(180);assert(warning);headway.notified(state,warning,base+180000);
for(let sec=195;sec<780;sec+=15)assert.equal(alert(sec),null);assert(alert(780));
state={};for(let sec=0;sec<=600;sec+=15)assert.equal(alert(sec,{observedGap:{minutes:4.5}}),null,'observed time on target suppresses close-stop chatter');
state={};for(let sec=0;sec<180;sec+=15)alert(sec);assert.equal(alert(180,{},true),null,'arrival or safety warning has priority');assert.equal(alert(195),null,'new quiet period follows priority event');
state={};alert(0);assert.equal(alert(180,{peer:{vehicle:'SYN-F',fresh:true,observedAt:base,stopGap:2}}),null,'old timestamp never accumulates persistence');
state={};for(let sec=0;sec<180;sec+=15)alert(sec);assert.equal(alert(180,{peer:{vehicle:'SYN-OTHER',source:'APP_GPS',binding:'OTHER|1',fresh:true,observedAt:base+180000,stopGap:2}}),null,'neighbour change resets persistence');
state={};for(let sec=0;sec<180;sec+=15)alert(sec);assert.equal(alert(180,{peer:{vehicle:'SYN-F',source:'APP_GPS',binding:'SYN-F-D|3',fresh:true,observedAt:base+180000,stopGap:1}}),null,'changed spacing is observed afresh');
console.log('Field regression: Techno ETA gate, phone-only observations, source disagreement, directional last services and sustained voice passed');
