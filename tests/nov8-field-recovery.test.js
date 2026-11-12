const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const gps=require('../driver-automation'),cockpit=require('../driver-cockpit');
const date='2099-01-10',time='12:00',base=gps.moment(date,time);
const stops=Array.from({length:12},(_,i)=>({id:'SYN-'+i,name:'Synthetic '+i,stationId:'SYN-'+i,order:i+1,lat:37+i*.0045,lng:127}));
const path={stops,turnIndex:8,pivotIndex:8},points={start:{...stops[0],radiusM:80,departureBearing:0},turn:stops[8],end:stops[11]};
let state={};
function sample(meters,seconds,speed,extra={}){const t=base+seconds*1000,position={timestamp:t,coords:{latitude:37+meters/111195,longitude:127,accuracy:5,speed,heading:0}};const r=gps.step(state,{date,startTime:time,now:t,position,points,course:path,hasTurn:true,log:{},navigation:{configured:true,timestamp:t,fraction:meters/500,returnConfirmed:false},vehicleIdentityAt:base-60000,...extra});state=r.state;return r;}
sample(0,-20,0);sample(0,-15,0);sample(200,50,8);
let result;for(let i=1;i<25;i++){result=sample(200+45*i,50+5*i,9);if(result.event)break;}
assert.equal(result.event,'DEPART','a gap after an observed depot visit must not require returning to the depot');assert.equal(result.position.timestamp,base+50000,'never infer the missed departure inside an outage');
state={};sample(0,-20,0);sample(0,-15,0);
const hint={available:true,status:'AGREE',source:'GYEONGGI_BUS_LOCATION_V2',stateCd:2,stationSeq:1,fetchedAt:base};
sample(10,2,1.2,{vehicleReference:hint});sample(30,7,1.2,{vehicleReference:hint});
for(let i=0;i<25;i++){result=sample(140+45*i,12+5*i,9);if(result.event)break;}
assert.equal(result.event,'DEPART');assert.equal(result.position.timestamp,base+2000,'slow origin movement retained only with independent assigned-bus departure reference');
// Exact same coordinates do not mean the same occurrence or phase.
const circuit=[{...stops[0],origin:true},{...stops[1]},{...stops[2],turnaround:true},{...stops[3]},{...stops[0],id:'SYN-END',order:5,origin:false}];
const trip={startPlace:circuit[0].name,turnPlace:circuit[2].name,endPlace:circuit[4].name,startTime:time};const course=gps.course(trip,circuit);assert.equal(course.stops.length,5);assert.equal(course.turnIndex,2);
state={};result=sample(0,0,0,{log:{actualStart:'observed'},points:{start:circuit[0],turn:circuit[2],end:circuit[4]}});result=sample(0,5,0,{log:{actualStart:'observed'},points:{start:circuit[0],turn:circuit[2],end:circuit[4]}});assert.equal(result.event,null,'shared depot is not arrival before turnaround');
assert.equal(sample(200,10,10,{log:{actualEnd:'observed'}}).event,null,'post-shift deadhead cannot reopen service');
const scope={route:'70',date,vehicleId:'OWN',running:true},nav={configured:true,matchedIndex:5},publicPeer=(order,id='UNREGISTERED')=>({source:'GYEONGGI_BUS_LOCATION_V2',positionBasis:'PROVIDER_STOP_REFERENCE',route:'70',date,vehicleId:id,matchedStopOrder:order,stateCd:2,fetchedAt:base});
const fleet={route:'70',date,positions:[],crossCheck:{fleet:[publicPeer(8),publicPeer(4,'BEHIND')]}};
let peers=cockpit.ringPeers(path,fleet,nav,scope,base);assert.deepEqual(peers.map(p=>p.side),['front','rear']);assert(peers.every(p=>p.reference));
assert(cockpit.ringPeers(path,fleet,nav,scope,base+61000).every(p=>p.fresh===false));assert.equal(cockpit.ringPeers(path,fleet,nav,scope,base+181000).length,0);
assert(cockpit.ringPeers(path,fleet,{...nav,retained:true},scope,base).every(p=>p.fresh===false),'retained relative order is marked historical');
fleet.positions=[{running:true,vehicleId:'UNREGISTERED',route:'70',date,matchedStopOrder:7,recordedAt:new Date(base).toISOString(),accuracyM:5}];peers=cockpit.ringPeers(path,fleet,nav,scope,base);assert.equal(peers.find(p=>p.vehicle==='UNREGISTERED').order,7);assert.equal(peers.filter(p=>p.vehicle==='UNREGISTERED').length,1);
const p=publicPeer(1);fleet.positions=[];fleet.crossCheck.fleet=[p,{...p,matchedStopOrder:12},{...p,matchedStopOrder:8,route:'5'}];assert.equal(cockpit.ringPeers(path,fleet,nav,scope,base).length,0);
for(const text of ['고강공영차고지','신월청소년문화센터','화곡터널입구교차로(미정차)','신월사거리.국민은행신월동지점'])assert.equal(cockpit.phraseParts(text).join(''),text);
assert.deepEqual(cockpit.phraseParts('고강공영차고지'),['고강','공영차고지']);assert.equal(cockpit.plannedGap({plannedFrontGapMinutes:11,actualFrontGapMinutes:25},'front'),'11분');assert.equal(cockpit.plannedGap({},'rear'),'확인 중');
const api=fs.readFileSync('apps-script/PublicTransitApi.gs','utf8');const ctx=vm.createContext({Date:class extends Date{static now(){return base;}}});vm.runInContext(api.slice(api.indexOf('function bus70GyeonggiSelectVehicle_'),api.indexOf('function BUS70_checkGyeonggiLiveConnection')),ctx);
const items=[{plateNo:'TEST-0001',stationId:'SYN-7',stationSeq:8,stateCd:2,vehicleId:'external-1'}];const projected=ctx.bus70GyeonggiFleet_({available:true,items,fetchedAt:base},stops,scope,[{id:'INTERNAL',plate:'TEST-0001'}],null);assert.equal(projected[0].vehicleId,'INTERNAL');assert.equal(projected[0].observedAt,null);assert(!('speedKmh' in projected[0]));assert.equal(ctx.bus70GyeonggiFleet_({available:true,items:[{...items[0],stationId:'WRONG'}],fetchedAt:base},stops,scope,[],null).length,0);
const ambiguous=[items[0],{...items[0],plateNo:'OTHER-0001',vehicleId:'external-2'}];
assert(ctx.bus70GyeonggiFleet_({available:true,items:ambiguous,fetchedAt:base},stops,scope,[{id:'INTERNAL',plate:'0001'}],null).every(p=>p.vehicleId.startsWith('GBIS:')),'ambiguous suffix cannot merge different buses');
console.log('Outage recovery, slow confirmed onset, same-coordinate phase separation, public unregistered peers, deduplication, freshness and phrase/gap semantics passed');
