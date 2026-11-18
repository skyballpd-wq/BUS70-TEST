const assert=require('node:assert/strict'),h=require('../driver-headway'),c=require('../driver-cockpit');
const base=Date.parse('2099-01-08T22:00:00+09:00'),date='2099-01-08';
const scope={route:'5',date,vehicleId:'SYN-OWN',dispatchId:'SYN-D',trip:1,running:true};
const path={turnIndex:9,pivotIndex:10,stops:Array.from({length:21},(_,i)=>({order:i+1,name:'합성정류장'+i,direction:i<11?'OUT':'BACK'}))};
let state={key:'synthetic',samples:[{at:base,seconds:60},{at:base,seconds:55},{at:base,seconds:65}],alerts:{}},fleet,peers;
function update(seconds,ownOrder,otherOrder,otherId='SYN-A'){
 const at=base+seconds*1000,raw=(id,order,own=false)=>({source:'GYEONGGI_BUS_LOCATION_V2',positionBasis:'PROVIDER_STOP_REFERENCE',route:'5',date,vehicleId:id,matchedStopOrder:order,stateCd:1,own,fetchedAt:at});
 fleet={route:'5',date,crossCheck:{fetchedAt:at,fleet:[raw('SYN-OWN',ownOrder,true),...(otherOrder?[raw(otherId,otherOrder)]:[])]}};
 peers=otherOrder?[{side:'front',rank:1,vehicle:otherId,vehicleNo:'시험00가9001',driverName:'시험기사',reference:true,fresh:true,age:0,order:otherOrder,stopGap:otherOrder-ownOrder,crowded:1}]:[];
 h.observeFleet(state,scope,{configured:true,matchedIndex:ownOrder-1,path},fleet,peers,at);
 return h.model('front',{plannedFrontGapMinutes:8},fleet,peers,state);
}
let model=update(0,1,2);assert.equal(model.observedGap,null);assert.match(model.actualLine,/관측 중/);assert.doesNotMatch(model.actualLine,/약 1분/,'pace conversion is never presented as an observed time gap');
update(45,1,3);update(90,1,3);update(135,2,4);model=update(180,3,4);
assert.equal(model.observedGap.minutes,2.3);assert.equal(model.observedGap.min,1.5);assert.equal(model.observedGap.max,3);assert.match(model.actualLine,/약 2.3분 · 1정류장/);
assert.match(model.plannedLine,/8분 · 약8정류장/);
const snapshot=JSON.parse(JSON.stringify(state));
assert.equal(h.observedGap({reference:true,fresh:true,vehicle:'SYN-OWN',order:3},'rear',{...snapshot,vehicleId:'SYN-A'}).minutes,2.3,'rear and front agree for the same observed passage pair');
assert.equal(h.observedGap({...peers[0],reference:false},'front',snapshot),null,'phone-selected neighbour cannot borrow a different source headway');
const ambiguous=JSON.parse(JSON.stringify(snapshot));ambiguous.observations['SYN-DUP']={...ambiguous.observations['SYN-A']};assert.equal(h.observedGap(peers[0],'front',ambiguous),null,'same stop order cannot identify one neighbour');
const wrongLeg=JSON.parse(JSON.stringify(snapshot));wrongLeg.observations['SYN-A'].leg='BACK';assert.equal(h.observedGap(peers[0],'front',wrongLeg),null);
h.observeFleet(snapshot,scope,{configured:true,matchedIndex:15,path},fleet,peers,base+180000);assert.equal(snapshot.observationsAvailable,false,'public own bus must agree with current route occurrence');

model=update(225,4,null);assert.equal(model.observedGap,null);assert.match(model.notice,/마지막 관측 45초 전/);assert.equal(model.identityBasis,'마지막');assert.match(model.actualLine,/—정류장/);assert.equal(model.crowding,'미수신');assert.equal(h.warning([model],state,base+225000,true),null);
model=update(270,5,8);assert.equal(model.observedGap,null,'rejoining bus has no continuous passage history');
model=update(315,6,9,'SYN-C');assert.equal(model.notice,'관측 차량 변경');assert.equal(model.observedGap,null,'new neighbour cannot borrow another vehicle’s time gap');
const before=JSON.stringify(state.observations);h.observeFleet(state,scope,{configured:true,matchedIndex:5,path},fleet,peers,base+316000);assert.equal(JSON.stringify(state.observations),before,'cached response is not a second passage observation');
h.observeFleet(state,scope,{configured:true,matchedIndex:5,path},{...fleet,crossCheck:{error:'GBIS_HTTP_429'}},[],base+317000);assert.equal(h.observedGap(peers[0],'front',state),null,'outage cannot present an old time gap as current');
const otherScope={...scope,date:'2099-01-09'};const reset=h.sample(state,otherScope,{configured:true,matchedIndex:1,timestamp:base+320000},base+320000);assert.equal(reset.observations,undefined,'service date clears the observation history');
// Forecasts use measured recent stop pace, while a recorded time takes precedence.
const trip={startPlace:'합성차고지',turnPlace:'합성회차지',turnTime:'23:00',endPlace:'합성차고지'},log={actualStart:'observed'},nav={configured:true,fraction:5.5,timestamp:base};
state={samples:[{at:base,seconds:60},{at:base,seconds:60},{at:base,seconds:60}]};
let point=c.turnPoint(trip,log,path,nav,state,base,h.pace(state));assert.equal(point.estimatedAt,base+210000);assert.equal(point.actual,'');
point=c.turnPoint(trip,{...log,actualTurn:'2099-01-08 22:03:40'},path,nav,state,base,60);assert.equal(point.estimatedAt,null);assert.equal(point.actual,'2099-01-08 22:03:40');
for(const bad of [{...nav,retained:true},{...nav,timestamp:base-11000},{...nav,fraction:10},{...nav,configured:false}])assert.equal(c.turnPoint(trip,log,path,bad,state,base,60).estimatedAt,null);
assert.equal(c.turnPoint(trip,{},path,nav,state,base,60).estimatedAt,null,'no forecast before observed departure');
assert.equal(c.turnPoint({...trip,turnPlace:'',turnTime:''},log,path,nav,state,base,60),null,'one-way trip has no invented turnaround');
assert.equal(c.turnPoint(trip,log,path,{...nav,timestamp:base+190000},state,base+190000,60).estimatedAt,null,'old pace cannot drive a new forecast');
console.log('Planned vs observed headways, disappearance/rejoin, identity changes, scope resets and turnaround forecasts/records passed');
