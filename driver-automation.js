/* Pure GPS matching. No network, identities, or location history is stored here. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Bus70Automation = api;
})(typeof window === "object" ? window : this, function () {
  "use strict";
  const number = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  const nameKey = value => String(value || "").replace(/[\s·.()\-]/g, "");
  function distance(a, b) {
    const rad = n => n * Math.PI / 180, dlat = rad(b.lat-a.lat), dlng = rad(b.lng-a.lng);
    const v = Math.sin(dlat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlng/2)**2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(Math.max(0, 1-v)));
  }
  function validPoint(p) {
    return p && number(p.lat) && number(p.lng) && Math.abs(Number(p.lat))<=90 && Math.abs(Number(p.lng))<=180;
  }
  function resolvePoints(trip, stops) {
    const ordered = (stops || []).filter(validPoint).slice().sort((a,b)=>Number(a.order)-Number(b.order));
    const pivots = ordered.filter(s=>s.turnaround), pivot = pivots.length===1 ? ordered.indexOf(pivots[0]) : -1;
    const result = {};
    for (const phase of ["start","turn","end","control","return"]) {
      const place = String((phase==="control"?trip.controlPoint:phase==="return"?trip.deadheadDestination:trip[phase+"Place"]) || "");
      if (!place && !trip[phase+"Time"]) continue;
      const original = trip[phase+"Location"];
      // Explicit manager-entered points take precedence; API stop occurrences are resolved afresh.
      if (validPoint(original) && !ordered.some(s=>s.id===original.referenceId)) {result[phase]=original;continue;}
      let candidates = ordered.filter(s=>nameKey(s.name)===nameKey(place));
      if (pivot>=0) {
        // A short timetable label may name the unique route boundary (e.g. station A).
        // Never choose a roadside stop merely because its name contains that label.
        if (!candidates.length && place) candidates = [ordered[0],ordered[pivot],ordered[ordered.length-1]].filter(s=>nameKey(s.name).startsWith(nameKey(place)));
        if (phase==="turn") candidates=candidates.filter(s=>ordered.indexOf(s)===pivot);
        else if (phase==="start") {
          const origin=candidates.filter(s=>s.origin);
          if(origin.length===1)candidates=origin;
          else candidates=candidates.filter(s=>ordered.indexOf(s)===pivot || ordered.indexOf(s)<pivot);
        } else if(phase==="end"||phase==="return"||phase==="control") {
          const returning=candidates.filter(s=>ordered.indexOf(s)>pivot);
          if(returning.length)candidates=returning;
        }
      }
      if(candidates.length!==1)continue;
      const match=candidates[0];
      result[phase]={lat:Number(match.lat),lng:Number(match.lng),radiusM:80,referenceId:match.id,place:match.name,order:match.order,direction:match.direction};
    }
    return result;
  }
  function moment(date, time) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{1,2}:\d{2}$/.test(String(time)))return NaN;
    const [y,m,d]=date.split("-").map(Number),[h,min]=time.split(":").map(Number);
    if(h>47||min>59)return NaN;
    return Date.UTC(y,m-1,d+(h<24&&h*60+min<210?1:0),h-9,min);
  }
  function observedMoment(date, value) {
    const text=String(value||"");
    if(/^\d{1,2}:\d{2}(:\d{2})?$/.test(text))return moment(date,text.match(/^\d{1,2}:\d{2}/)[0]);
    if(!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text))return NaN;
    const iso=text.replace(" ","T");
    return Date.parse(/[Zz]|[+-]\d{2}:?\d{2}$/.test(iso)?iso:iso+"+09:00");
  }
  function activeIndex(trips, logs, date, now) {
    const complete=i=>Boolean(logs[i]?.actualEnd&&(!(trips[i].deadheadDestination&&trips[i].deadheadDestination!==trips[i].endPlace)||logs[i]?.deadheadReturnedAt));
    let lastComplete=-1,running=-1;
    for(let i=0;i<trips.length;i++)if(complete(i))lastComplete=i;
    // A later observed trip supersedes older incomplete history.
    for(let i=lastComplete+1;i<trips.length;i++)if(logs[i]?.actualStart||logs[i]?.actualEnd)running=i;
    if(running>=0){
      const trip=trips[running],log=logs[running]||{},end=moment(date,trip.endTime);
      let delay=0;
      for(const [planned,actual] of [[trip.startTime,log.actualStart],[trip.turnTime,log.actualTurn]]){
        const scheduled=moment(date,planned),observed=observedMoment(date,actual);
        if(Number.isFinite(scheduled)&&Number.isFinite(observed))delay=Math.max(delay,observed-scheduled);
      }
      // Scheduling selects the live tracking window only. Never fill missing
      // historical timestamps or mark a trip complete from clock time.
      if(Number.isFinite(end)&&now>=end+delay){
        for(let i=trips.length-1;i>running;i--){
          const start=moment(date,trips[i].startTime);
          if(!complete(i)&&Number.isFinite(start)&&start<=now)return i;
        }
      }
      return running;
    }
    const pending=trips.findIndex((t,i)=>i>lastComplete&&!complete(i)&&(!Number.isFinite(moment(date,t.endTime))||moment(date,t.endTime)>=now));
    return pending>=0?pending:Math.max(0,trips.length-1);
  }
  function step(previous, input) {
    const state=Object.assign({},previous),p=input.position||{},ts=Number(p.timestamp),now=Number(input.now),c=p.coords||{};
    if(!number(c.latitude)||!number(c.longitude)||!number(c.accuracy)||Number(c.accuracy)>60||Number(c.accuracy)<0||!ts||now-ts>20000||ts>now+5000||ts<=Number(state.lastTimestamp||0))return {state,event:null};
    // Cached samples and repeated callbacks cannot satisfy a dwell requirement.
    if(state.lastTimestamp&&ts-state.lastTimestamp<1500)return {state,event:null};
    if(state.lastTimestamp&&ts-state.lastTimestamp>45000)for(const key of ["seenStart","startInside","startOutside","turnInside","endInside","seenTurn","turnStay","turnOutside","controlInside","returnInside"])delete state[key];
    state.lastTimestamp=ts;
    const here={lat:Number(c.latitude),lng:Number(c.longitude)},points=input.points||{},log=input.log||{};
    const direction=(point,field)=>!number(point?.[field])||!number(c.heading)||!number(c.speed)||Number(c.speed)<1.5||Math.abs((Number(c.heading)-Number(point[field])+540)%360-180)<=100;
    const inside=key=>validPoint(points[key])&&direction(points[key],"approachBearing")&&distance(here,points[key])<=Number(points[key].radiusM||80);
    const count=(key,yes)=>state[key]=yes?Number(state[key]||0)+1:0;
    if(log.actualEnd){
      if(input.hasReturn&&!log.deadheadReturnedAt&&validPoint(points.return)&&count("returnInside",inside("return"))>=2)return {state,event:"DEADHEAD_RETURN"};
      return {state,event:null};
    }
    const plannedStart=moment(input.date,input.startTime);
    const recoveredArrival=input.navigation?.configured&&!input.navigation.waiting&&input.navigation.returnConfirmed&&input.navigation.returnEvidence?.length===2&&(!Number.isFinite(plannedStart)||now>=plannedStart);
    if(!log.actualStart&&!recoveredArrival){
      const planned=moment(input.date,input.startTime);
      if(Number.isFinite(planned)&&(now<planned-30*60000||now>planned+120*60000))return {state,event:null};
      if(!validPoint(points.start))return {state,event:null};
      if(inside("start")){if(count("startInside",true)>=2)state.seenStart=true;state.startOutside=0;}
      else {state.startInside=0;const outside=direction(points.start,"departureBearing")&&distance(here,points.start)>Number(points.start.radiusM||80)+Math.max(30,Number(c.accuracy));if(state.seenStart&&count("startOutside",outside)>=2)return {state,event:"DEPART"};}
      return {state,event:null};
    }
    if(input.hasControl&&!log.actualControl&&validPoint(points.control)&&count("controlInside",inside("control"))>=2)return {state,event:"CONTROL"};
    if(!log.actualTurn && input.hasTurn){
      const near=validPoint(points.turn)&&distance(here,points.turn)<=Number(points.turn.radiusM||80);
      if(near&&Number(state.turnInside||0)===0)state.turnFix=p;
      if(count("turnInside",near)>=2)return {state,event:"TURN",position:state.turnFix};
      if(!(input.navigation?.configured&&input.navigation.returnConfirmed&&input.navigation.returnEvidence?.length===2))return {state,event:null};
    }
    if(log.actualTurn&&!log.turnDepartedAt&&validPoint(points.turn)){
      if(inside("turn")){if(count("turnStay",true)>=2)state.seenTurn=true;state.turnOutside=0;}
      else if(state.seenTurn||Number(state.turnInside||0)>=2){
        const outside=direction(points.turn,"departureBearing")&&distance(here,points.turn)>Number(points.turn.radiusM||80)+Math.max(30,Number(c.accuracy));
        if(count("turnOutside",outside)>=2)return {state,event:"TURN_DEPART"};
      }
    }
    const atEnd=validPoint(points.end)&&distance(here,points.end)<=Number(points.end.radiusM||80);
    if(atEnd&&Number(state.endInside||0)===0)state.endFix=p;
    if(count("endInside",atEnd)>=2)return {state,event:"ARRIVE",position:state.endFix};
    return {state,event:null};
  }
  function bearing(a,b){
    const r=Math.PI/180,dl=(b.lng-a.lng)*r,y=Math.sin(dl)*Math.cos(b.lat*r),x=Math.cos(a.lat*r)*Math.sin(b.lat*r)-Math.sin(a.lat*r)*Math.cos(b.lat*r)*Math.cos(dl);
    return (Math.atan2(y,x)/r+360)%360;
  }
  function course(trip,rawStops){
    const stops=(rawStops||[]).filter(validPoint).slice().sort((a,b)=>Number(a.order)-Number(b.order));
    if(stops.length<2||new Set(stops.map(s=>Number(s.order))).size!==stops.length)return null;
    const points=resolvePoints(trip,stops);
    function indices(phase,place){
      const p=points[phase];let matches=[];
      if(p){
        matches=stops.map((s,i)=>({i,d:distance(s,p)})).filter(v=>v.d<=40).sort((a,b)=>a.d-b.d);
        if(matches.length){const nearest=matches[0].d;return matches.filter(v=>v.d<=nearest+3).map(v=>v.i).sort((a,b)=>a-b);}
      }
      return stops.map((s,i)=>nameKey(s.name)===nameKey(place)?i:-1).filter(i=>i>=0);
    }
    const starts=indices("start",trip.startPlace),ends=indices("end",trip.endPlace);
    if(!starts.length||!ends.length)return null;
    const start=starts[0],end=ends.filter(i=>i>start).at(-1);if(end===undefined)return null;
    const turns=indices("turn",trip.turnPlace).filter(i=>i>start&&i<end),hasTurn=Boolean(trip.turnPlace||trip.turnTime);
    if(hasTurn&&turns.length!==1)return null;
    const control=indices("control",trip.controlPoint).filter(i=>i>=start&&i<=end);
    return {stops:stops.slice(start,end+1),turnIndex:hasTurn?turns[0]-start:-1,controlIndex:control.length===1?control[0]-start:-1,pivotIndex:stops.findIndex(s=>s.turnaround)-start};
  }
  // Match occurrences in the complete ordered circuit. A missing timestamp is
  // a log problem, not proof that the vehicle is still on the outward leg.
  function referenceIndex(path,hint,here,now){
    if(!hint?.available||hint.source!=="GYEONGGI_BUS_LOCATION_V2"||!number(hint.fetchedAt)||now-hint.fetchedAt>60000||hint.fetchedAt>now+5000)return -1;
    const index=path.stops.findIndex(s=>Number(s.order)===Number(hint.stationSeq));
    if(index<0||distance(here,path.stops[index])>500)return -1;
    const stop=path.stops[index],id=String(hint.stationId||"");
    if(id&&String(stop.stationId||stop.id)!==id&&!String(stop.id).endsWith("-"+id))return -1;
    return index;
  }
  function waitingForDeparture(path,position,log,previous,now){
    if(log.actualStart||log.actualTurn||log.actualEnd)return false;
    const planned=moment(log.date,log.startTime);
    if(Number.isFinite(planned)&&now<planned)return true;
    // A timetable boundary cannot turn the shared depot into the return leg.
    // Preserve genuine missing-departure recovery after observed return stops.
    if(previous?.returnConfirmed&&previous.returnEvidence?.length===2&&now-Number(previous.timestamp)>=0&&now-Number(previous.timestamp)<=120000)return false;
    const c=position?.coords||{},ts=Number(position?.timestamp),start=log.startLocation||path?.stops?.[0];
    if(!number(c.latitude)||!number(c.longitude)||!number(c.accuracy)||c.accuracy<0||c.accuracy>60||!ts||now-ts>10000||ts>now+5000)return Boolean(previous?.waiting);
    return Number.isFinite(planned)&&validPoint(start)&&distance({lat:Number(c.latitude),lng:Number(c.longitude)},start)<=Number(start.radiusM||80)+Math.max(30,Number(c.accuracy));
  }
  function navigate(path,position,log,previous,now,hint){
    const c=position?.coords||{},ts=Number(position?.timestamp),stops=path?.stops||[];
    if(waitingForDeparture(path,position,log,previous,now))return {configured:false,retained:false,waiting:true,reason:"출발 대기",returnConfirmed:false,turnPassed:false,returnEvidence:[],tripProgressPercent:0,routeProgressPercent:0,tripPassedStops:0,tripStopCount:stops.length};
    if(previous?.waiting)previous=null;
    const retained=previous&&number(previous.routeProgressPercent)?previous:null;
    let motion=previous?.motion;
    const hold=reason=>Object.assign({},previous||{},{configured:false,retained:Boolean(retained),reason,motion});
    if(!number(c.latitude)||!number(c.longitude)||!number(c.accuracy)||c.accuracy<0||c.accuracy>60||!ts||now-ts>10000||ts>now+5000||stops.length<2)return hold("GPS 재수신 대기");
    if(retained&&ts<=retained.timestamp&&previous.configured)return Object.assign({},retained,{configured:true,retained:false});
    const here={lat:Number(c.latitude),lng:Number(c.longitude)},cumulative=[0];
    for(let i=1;i<stops.length;i++)cumulative.push(cumulative[i-1]+distance(stops[i-1],stops[i]));
    const total=cumulative.at(-1),dt=retained?Math.max(0,(ts-retained.timestamp)/1000):0;
    const continuous=retained&&dt<=120,oldMeters=Number(retained?.matchedMeters||0);
    let headingValue=number(c.speed)&&c.speed>2&&number(c.heading)?Number(c.heading):null;
    const elapsed=motion?(ts-motion.timestamp)/1000:0,travel=motion?distance(motion,here):0;
    if(headingValue===null&&elapsed>=3&&elapsed<=120&&travel>=Math.max(25,(Number(motion.accuracy)+Number(c.accuracy))*1.5)&&travel/elapsed<40)headingValue=bearing(motion,here);
    if(!motion||elapsed>120||travel>=Math.max(25,(Number(motion.accuracy)+Number(c.accuracy))*1.5))motion={...here,accuracy:Number(c.accuracy),timestamp:ts};
    const moving=headingValue!==null,reference=referenceIndex(path,hint,here,now);
    const candidates=[];
    for(let i=0;i<stops.length-1;i++){
      // A verified turnaround log provides a lower bound, never an upper bound.
      if(log.actualTurn&&path.turnIndex>=0&&i<path.turnIndex)continue;
      const a=stops[i],b=stops[i+1],scale=Math.cos(here.lat*Math.PI/180),ax=(a.lng-here.lng)*111320*scale,ay=(a.lat-here.lat)*110540,bx=(b.lng-here.lng)*111320*scale,by=(b.lat-here.lat)*110540,dx=bx-ax,dy=by-ay;
      const den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0,d=Math.hypot(ax+t*dx,ay+t*dy),heading=bearing(a,b),meters=cumulative[i]+(cumulative[i+1]-cumulative[i])*t;
      if(d>160)continue;
      if(continuous&&(meters<oldMeters-100||meters>oldMeters+Math.max(160,dt*40)))continue;
      const diff=moving?Math.abs((headingValue-heading+540)%360-180):0;
      // At corners, the chord between bus stops differs from the road bearing.
      // Keep heading as a score inside a continuous track; reject reversals only
      // when reacquiring a track, where no sequence evidence exists.
      if(!continuous&&moving&&diff>105)continue;
      const score=d+diff*.65+(continuous?Math.abs(meters-oldMeters)*.025:0);
      candidates.push({i,t,d,score,heading,meters});
    }
    candidates.sort((a,b)=>a.score-b.score);
    let eligible=candidates,source="GPS";
    if(!continuous&&reference>=0&&candidates.length){
      const corroborated=candidates.filter(v=>Math.abs(v.i+v.t-reference)<=2&&v.d<=candidates[0].d+40);
      if(corroborated.length){eligible=corroborated;source="GPS_GBIS";}
    }
    const best=eligible[0];
    if(!best)return hold("노선 위치 확인 중");
    if(!continuous){const other=eligible.find(v=>Math.abs(v.meters-best.meters)>500);if(other&&other.score-best.score<30)return hold("상하행 확인 중");}
    const fraction=Math.max(continuous?Number(retained.fraction||0):0,best.i+best.t),index=Math.min(stops.length-1,Math.floor(fraction));
    const nearCurrent=distance(here,stops[index])<=Math.max(25,Number(c.accuracy)),seen=log.actualEnd?stops.length:(log.actualStart||log.trackingActive)?index+1:0;
    const pivot=path.pivotIndex>=0?path.pivotIndex:path.turnIndex;
    const returnConfirmed=Boolean(continuous&&retained?.returnConfirmed)||(pivot>=0&&fraction>pivot+.15);
    const turnPassed=path.turnIndex>=0&&fraction>path.turnIndex+.15;
    const pct=log.actualEnd?100:(log.actualStart||log.trackingActive)?Math.min(99.9,fraction/(stops.length-1)*100):0;
    const evidence=(continuous&&retained?.returnEvidence||[]).slice();
    if(returnConfirmed&&index<stops.length-1&&nearCurrent&&evidence.at(-1)?.stopId!==stops[index].id)evidence.push({stopId:stops[index].id,order:stops[index].order,observedAt:ts,latitude:here.lat,longitude:here.lng,accuracy:Number(c.accuracy)});
    return {configured:true,retained:false,motion,matchSource:source,returnEvidence:evidence.slice(-2),matchedIndex:index,matchedMeters:Math.max(continuous?oldMeters:0,best.meters),fraction,returnConfirmed,turnPassed,tripPassedStops:seen,tripStopCount:stops.length,tripProgressPercent:Math.round(pct*10)/10,routeProgressPercent:Math.round(fraction/(stops.length-1)*1000)/10,stopIndex:index+1,stopCount:stops.length,previousStop:stops[nearCurrent?Math.max(0,index-1):index].name,currentStop:nearCurrent?stops[index].name:"",nextStop:stops[Math.min(stops.length-1,index+1)].name,distanceToNextM:Math.round(distance(here,stops[Math.min(stops.length-1,index+1)])),direction:returnConfirmed?(stops.at(-1).name+" 방면"):turnPassed?"회차 구간":"회차 방면",heading:best.heading,nearestDistanceM:Math.round(best.d),timestamp:ts};
  }
  return {resolvePoints,activeIndex,step,moment,distance,validPoint,bearing,course,referenceIndex,waitingForDeparture,navigate};
});
