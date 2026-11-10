// Synthetic event times; public route geometry only. No driver records.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const gps=require('../driver-automation'),ui=require('../driver-cockpit'),stops=require('./route5-public-stops');
const date='2099-01-08',trip={startPlace:stops[0].name,endPlace:stops.at(-1).name,turnPlace:'삼정동복지회관',startTime:'17:00',turnTime:'18:20',endTime:'19:40',turnLocation:{...stops[55],referenceId:'SYN'}},path=gps.course(trip,stops);
const now=gps.moment(date,'17:01'),fix=(i,t=now)=>({timestamp:t,coords:{latitude:stops[i].lat,longitude:stops[i].lng,accuracy:7,speed:0,heading:null}});
const oldHint={available:true,source:'GYEONGGI_BUS_LOCATION_V2',stationSeq:114,stationId:stops[113].id,fetchedAt:now},log={date,startTime:trip.startTime,actualStart:date+' 17:00:30',trackingActive:true};
let nav=gps.navigate(path,fix(0),log,null,now,oldHint);assert(nav.configured);assert(nav.tripProgressPercent<5);assert(!nav.returnConfirmed,'old arrival reference must not turn a new departure into 99%');
nav=gps.navigate(path,fix(0),{...log,actualStart:''},{waiting:true},now,oldHint);assert(nav.waiting,'stationary depot remains waiting after 17:00');
const later=gps.moment(date,'19:35');nav=gps.navigate(path,fix(111,later),{...log,actualTurn:date+' 18:20:00'},null,later,{...oldHint,stationSeq:112,stationId:stops[111].id,fetchedAt:later});assert(nav.configured&&nav.returnConfirmed&&nav.tripProgressPercent>95,'real return is preserved');
// Bounded GPS uncertainty at the start perimeter, without changing end/turn radii.
const start={lat:37,lng:127,radiusM:80},edge={lat:37+84/111195,lng:127};
const result=gps.step({}, {date,startTime:'17:00',now,log:{},position:{timestamp:now,coords:{latitude:edge.lat,longitude:edge.lng,accuracy:7,speed:0}},points:{start}});
assert.equal(result.state.startVisitAt,now);assert.equal(result.event,null,'a start visit is not a departure');
const plan=ui.ringPlan(trip,path);assert.equal(ui.ringAngle(0,plan),-90);assert.equal(ui.ringAngle(plan.turnFraction,plan),90);assert.equal(ui.ringAngle(1,plan),270);assert.match(plan.depot.time,/17:00.*19:40/);assert.equal(plan.turn.name,'삼정종합사회복지회관');
const back=ui.ringPlan({startPlace:'삼정동복지회관',endPlace:'고강공영차고지',startTime:'05:15',endTime:'06:30'},{turnIndex:-1,stops:stops.slice(55)});assert.equal(ui.ringAngle(0,back),90);assert.equal(ui.ringAngle(1,back),270);assert.match(back.turn.time,/출발 05:15/);assert.match(back.depot.time,/도착 06:30/);
assert.equal(ui.shortVehicle({displayNo:'시험00가0001',vehicleNo:'001'}),'0001호');
assert.equal(ui.ringPlan({startPlace:'송내역',endPlace:'고강공영차고지',startTime:'05:30',endTime:'06:40'},{turnIndex:-1,stops:[]}).span,180);
const fleet={requestScope:'SYN',crossCheck:{available:true,fetchedAt:now-1000}};
assert.equal(ui.retainedReference(fleet,'SYN',now),fleet.crossCheck);assert.equal(ui.retainedReference(fleet,'OTHER',now),null);assert.equal(ui.retainedReference(fleet,'SYN',now+60001),null);assert.equal(ui.retainedReference(fleet,'SYN',now-2000),null);
assert.match(ui.peerStatus({crossCheck:{error:'GBIS_HTTP_429'}},{configured:true},{running:true},[],now),/요청 제한/);
for(const [condition,kind] of [['맑음 예보','sun'],['구름많음 예보','cloud'],['비','rain'],['눈','snow'],['강수 없음','unknown']])assert.equal(ui.weatherView({available:true,temperature:0,condition,observedAt:new Date(now).toISOString()},now).kind,kind);
assert.equal(ui.weatherView({available:true,temperature:0,windMps:'',observedAt:new Date(now).toISOString()},now).wind,null);
console.log('Shared-depot outbound reset, true return, bounded start accuracy, origin-aware ring and scoped reference expiry tests passed');
