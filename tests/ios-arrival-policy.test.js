const assert=require('node:assert/strict'),policy=require('../ios/Resources/arrival-policy');
const base=2000000000000,lat=m=>m/6371000*180/Math.PI;
function trip(route='5'){const stops=Array.from({length:7},(_,i)=>({id:'synthetic-'+i,stationId:i===2?(route==='70'?'115000108':route==='23'?'115000051':'212000105'):'synthetic-'+i,name:'합성 정류장 '+i,lat:lat(i*1000),lng:0}));return {route,trip:2,actualStart:'observed',endPlace:'고강공영차고지',endLocation:stops[6],course:{pivotIndex:1,stops}};}
const step=(s,t,planned,sec,meters)=>policy.update(s,t,{configured:true,returnConfirmed:true,timestamp:base+sec*1000,fraction:meters/1000,matchedMeters:meters},'synthetic',t.route,planned,{timestamp:base+sec*1000,coords:{latitude:lat(meters),longitude:0,accuracy:8}},base+sec*1000);
function arrive(s,t,planned){for(let sec=0;sec<=160;sec+=5)step(s,t,planned,sec,1400+sec*10);return step(s,t,planned,162,3000);}
for(const route of ['5','70','23']){let s={},t=trip(route),r=arrive(s,t,base+2400000);assert(r.notify);assert.equal(r.stopIndex,3);policy.attempted(s,r,base+162000,true);s=JSON.parse(JSON.stringify(s));assert(!step(s,t,base+2400000,164,3000).notify);assert(!step(s,t,base+2400000,172,3100).notify);for(let sec=177;sec<=257;sec+=5)step(s,t,base+2400000,sec,3000+(sec-162)*10);step(s,t,base+2400000,262,4000);assert(step(s,t,base+2400000,264,4000).notify,'next stop re-evaluated');}
let t=trip(),r=arrive({},t,base+2400000),latest=r.latestAt;
assert(arrive({},t,latest+600000).notify);assert(!arrive({},t,latest+599999).warning);
for(const gate of ['115000095','212000064','115000108']){t=trip();t.course.stops[2].stationId=gate;assert(!arrive({},t,base+2400000).available,'wrong-direction/wrong-route gate');}
for(const kind of ['unstarted','complete','nondepot','missingEndpoint']){t=trip();if(kind==='unstarted')delete t.actualStart;if(kind==='complete')t.actualEnd='done';if(kind==='nondepot')t.endPlace='합성 종점';if(kind==='missingEndpoint')delete t.endLocation;assert(!arrive({},t,base+2400000).available);}
let s={};t=trip();arrive(s,t,base+2400000);assert(!step(s,t,base+2400000,164,4000).available,'GPS jump');
s={};arrive(s,t,base+2400000);assert(!step(s,t,base+2400000,200,3000).available,'GPS gap');
console.log('iOS arrival warning: conservative 10-minute boundary, route/direction gate, stop-only dedupe, no early/unstarted/completed/wrong-point advice passed');
