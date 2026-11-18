const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const journey=require('../driver-journey'),fleet=require('../manager-live'),headway=require('../driver-headway');
const now=Date.parse('2099-01-08T23:59:00+09:00'),scope={date:'2099-01-08',dispatchId:'SYN-D',vehicleId:'SYN-V'},trip={trip:1,turnPlace:'합성회차',endPlace:'합성차고지'};
const native={...scope,trip:1,available:true,timestamp:now,predictedAt:now+120000,latestAt:now+240000};
const input={scope,trip,live:true,enabled:true,now,totalMeters:10000,nav:{configured:true,timestamp:now,matchedMeters:4000},log:{startAt:now-3600000},native};
let m=journey.update({},input);assert.equal(m.forecast,null,'actual turnaround required, including a native estimate');
input.log.turnAt=now-600000;m=journey.update(m.state,input);assert.equal(m.forecast.at,native.predictedAt);assert.equal(journey.clock(m.forecast.at,scope.date),'다음날 00:01');
for(const change of [{native:{...native,vehicleId:'OTHER'}},{native:{...native,retained:true}},{native:{...native,timestamp:now-11000}},{nav:{...input.nav,retained:true}},{live:false}])assert.equal(journey.update({}, {...input,...change}).forecast,null);
m=journey.update({}, {...input,log:{...input.log,endAt:now}});assert.equal(m.arrival,now);assert.equal(m.forecast,null,'actual arrival wins');
const n=journey.notice(m,input,{});assert.match(n.id,/ARRIVE/);assert.equal(journey.notice(m,input,{[n.id]:n}),null);assert.equal(journey.notice(m,{...input,now:now+91000},{}),null,'no delayed record speech');
let state={};for(let t=0;t<=120000;t+=5000){m=journey.update(state,{...input,now:now+t,native:null,nav:{configured:true,timestamp:now+t,matchedMeters:4000+t*.005}});state=m.state;}assert(m.forecast,'observed route movement can forecast without native API');
assert.equal(journey.update(state,{...input,now:now+180000,native:null,nav:{configured:true,timestamp:now+180000,matchedMeters:4700}}).forecast,null,'motion gap clears forecast');
const value={available:true,fetchedAt:now,stops:[1,2,3,4].map(order=>({order,name:'합성'+order,direction:order<4?'OUT':'BACK'})),vehicles:[{vehicleId:'SYN-A',matchedStopOrder:1,direction:'OUT',front:{gapEstimateBasis:'OBSERVED_STOP_INTERVAL',estimatedGapMinutes:3}},{vehicleId:'SYN-B',matchedStopOrder:3,direction:'OUT'}],roster:[{vehicleId:'SYN-C'}]};
let f=fleet.model(value,now);assert.equal(f.legs[0].groups[1].gap,2);assert.equal(f.legs[0].groups[1].minutes,3);assert.equal(f.missing.length,1);
f=fleet.model({...value,vehicles:[...value.vehicles,{vehicleId:'SYN-X',matchedStopOrder:3,direction:'OUT'}]},now);assert.equal(f.legs[0].groups[1].gap,null,'same-stop cluster cannot establish pair');
f=fleet.model(value,now+61000);assert(!f.fresh);assert.equal(f.legs[0].groups[1].gap,null);assert.equal(fleet.model(value,now+181000).count,0);
// Forward skips preserve real earlier observations but never manufacture skipped passages.
const scope2={route:'5',date:scope.date,vehicleId:'SYN-A',running:true},path={stops:[1,2,3,4,5].map(order=>({order,direction:'OUT'}))};
state={observations:{'SYN-A':{order:2,leg:'OUT',at:now-45000,passages:[{order:2,lo:now-90000,hi:now-45000}]}},running:true};
headway.observeFleet(state,scope2,{configured:true,path,matchedIndex:3},{route:'5',date:scope.date,crossCheck:{fetchedAt:now,fleet:[{source:'GYEONGGI_BUS_LOCATION_V2',positionBasis:'PROVIDER_STOP_REFERENCE',route:'5',date:scope.date,vehicleId:'SYN-A',stateCd:1,matchedStopOrder:4,fetchedAt:now}]}},[],now);
assert.deepEqual(state.observations['SYN-A'].passages.map(v=>v.order),[2]);
const server=vm.createContext({console,Date,JSON});vm.runInContext(fs.readFileSync('apps-script/PublicTransitApi.gs','utf8'),server);let calls=0;
server.bus70IsManager_=()=>false;server.bus70GyeonggiLiveFetch_=()=>{calls++;throw Error('should not fetch');};assert.equal(server.bus70ManagerRouteLive_({},'SYN').error,'MANAGER_REQUIRED');
server.bus70IsManager_=()=>true;server.bus70ActiveRouteIds_=()=>['5'];server.normalizeDate_=String;server.bus70GyeonggiToday_=()=>scope.date;
assert.equal(server.bus70ManagerRouteLive_({route:'70',date:scope.date},'SYN').error,'ROUTE_REQUIRED');assert.equal(server.bus70ManagerRouteLive_({route:'5',date:'2099-01-07'},'SYN').error,'LIVE_TODAY_ONLY');assert.equal(calls,0);

const collision={vehicleId:'SYN-A',now,fleetAt:now,observationsAvailable:true,observations:{'SYN-A':{order:1,leg:'OUT',passages:[]},'SYN-B':{order:1,leg:'OUT',passages:[]}},alerts:{}};
const ambiguousModel=headway.model('front',{}, {},[{side:'front',rank:1,fresh:true,reference:true,vehicle:'SYN-C',order:3,stopGap:2}],collision);
assert(ambiguousModel.ambiguous);assert.match(ambiguousModel.actualLine,/순서 확인/);assert.equal(headway.warning([ambiguousModel],collision,now,true),null);

// Exercise the allowed server path with actual fleet and headway normalization.
const fetchedAt=Date.now(),dbStops=[1,2,3].map(order=>({order,name:'합성'+order,direction:'OUT',stationId:'S'+order}));
const providerRows=[1,3].map((stationSeq,i)=>({vehicleId:'provider-'+i,plateNo:'시험00가'+(9001+i),stationSeq,stationId:'S'+stationSeq,stateCd:1,observedAt:fetchedAt,passages:[]}));
server.bus70GyeonggiLiveFetch_=()=>{calls++;return {available:true,fetchedAt,items:providerRows};};
server.bus70RouteStopsFromDb_=()=>({stops:dbStops});
server.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:()=>({getLastRow:()=>2,getDataRange:()=>({getDisplayValues:()=>[['vehicleId','차량번호'],['SYN-A','9001']]})})})};
server.makeHeaderMap_=headers=>Object.fromEntries(headers.map((h,i)=>[h,i]));
server.bus70LiveRunningTrips_=()=>[];
server.bus70LiveRoster_=(route,date,assignment)=>{assert(assignment.managerView);return [{vehicleId:'SYN-A',driverName:'합성기사',sequence:1}];};
const board=server.bus70ManagerRouteLive_({route:'5',date:scope.date},'SYN');
assert.equal(calls,1,'one route fetch, not one per vehicle');assert(board.ok);assert.equal(board.vehicles.length,2);
assert.equal(board.vehicles[0].vehicleId,'SYN-A');assert.equal(board.vehicles[0].driverName,'합성기사');
assert.match(board.vehicles[1].vehicleId,/^GBIS:/);assert.equal(board.vehicles[1].driverName,'');assert.equal(board.historyStored,false);
console.log('Journey phase/identity/freshness/midnight/speech, route-wide gaps, skipped observations and server access passed');
