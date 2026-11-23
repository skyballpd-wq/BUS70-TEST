const assert=require('node:assert/strict'),h=require('../driver-headway');
const t=Date.parse('2099-01-01T10:00:00+09:00');
const scope={route:'5',date:'2099-01-01',vehicleId:'SYN-OWN',dispatchId:'SYN-D',trip:1,running:true};
const path={stops:Array.from({length:20},(_,i)=>({order:i+1,direction:i<10?'OUT':'BACK'}))};
function observe(state,ms,ownOrder,peerOrder,options={}){
  const at=t+ms,nav={configured:true,matchedIndex:ownOrder-1,timestamp:at,path};
  const phone={vehicleId:'SYN-PEER',dispatchId:'SYN-PD',trip:1,running:true,route:scope.route,date:scope.date,accuracyM:10,matchedStopOrder:peerOrder,recordedAt:new Date(at).toISOString(),...options.phone};
  const fleet={route:scope.route,date:scope.date,crossCheck:{error:'GBIS_RATE_LIMITED'},positions:options.missing?[]:[phone]};
  const peer={side:'front',rank:1,vehicle:'SYN-PEER',source:'APP_GPS',reference:false,fresh:true,binding:'SYN-PD|1',order:peerOrder,stopGap:peerOrder-ownOrder,...options.peer};
  h.observeFleet(state,scope,nav,fleet,[peer],at);return {state,peer,fleet};
}
function seeded(){
  const s={};observe(s,0,1,2);observe(s,30000,1,3);observe(s,60000,2,3);return s;
}
let s=seeded();assert.equal(s.appObservations['SYN-PEER'].passages.length,1);
let p=observe(s,110000,2,3,{phone:{recordedAt:new Date(t+60000).toISOString()},peer:{fresh:false}});
assert.equal(s.appObservations['SYN-PEER'].at,t+60000,'cached fix is not refreshed');
assert.equal(s.appObservations['SYN-PEER'].passages.length,1,'history survives stale heartbeat');
assert.equal(h.observedGap({...p.peer,fresh:true},'front',s),null,'stale location cannot yield live time gap');
p=observe(s,120000,3,4);assert.equal(s.appObservations['SYN-PEER'].passages.length,2);
assert(h.observedGap(p.peer,'front',s),'fresh reconnect can reuse bounded same-stop intervals');
assert.equal(h.model('front',{plannedFrontGapMinutes:5},p.fleet,[p.peer],s).basis.startsWith('앱 GPS'),true);
s=seeded();observe(s,110000,2,3,{missing:true});assert(s.appObservations['SYN-PEER'],'temporarily absent peer history kept');
observe(s,120000,3,4);assert.equal(s.appObservations['SYN-PEER'].passages.length,2);
for(const phone of [{trip:2},{dispatchId:'OTHER'},{matchedStopOrder:12},{matchedStopOrder:1},{accuracyM:90},{accuracyM:null},{running:false},{route:'70'},{date:'2099-01-02'}]){
  s=seeded();observe(s,120000,3,4,{phone});
  assert.equal(s.appObservations['SYN-PEER']?.passages.length||0,0,'invalid binding/quality clears passage continuity');
}
s=seeded();observe(s,151000,3,4);assert.equal(s.appObservations['SYN-PEER'].passages.length,0,'over 90 seconds resets history');
s=seeded();observe(s,110000,2,3,{phone:{trip:2,recordedAt:new Date(t+60000).toISOString()}});assert(!s.appObservations['SYN-PEER'],'stale rebound row cannot retain old history');
s=seeded();observe(s,120000,3,6);assert.equal(s.appObservations['SYN-PEER'].passages.length,1,'skipped stops do not invent passage times');
s=seeded();observe(s,60000,2,3);assert.equal(s.appObservations['SYN-PEER'].passages.length,1,'duplicate measurements add no passage');
s=seeded();s=h.sample(s,{...scope,running:false},{},t+65000);assert.deepEqual(s.appObservations,{},'ended trip clears phone history');
// Accurate source wording while GBIS is unavailable and phone intervals are still collecting.
s={};p=observe(s,0,1,4);const m=h.model('front',{plannedFrontGapMinutes:5},p.fleet,[p.peer],s);
assert.equal(m.basis,'앱 GPS · 시간 수집 중');assert.equal(m.observedGap,null);
console.log('Phone history recovery, freshness, changed trip/direction, quality and no fabricated times passed');
