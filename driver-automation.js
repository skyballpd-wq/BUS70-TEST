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
  function activeIndex(trips, logs, date, now) {
    const returning=trips.findIndex((t,i)=>t.deadheadDestination&&t.deadheadDestination!==t.endPlace&&logs[i]?.actualEnd&&!logs[i]?.deadheadReturnedAt);
    if(returning>=0)return returning;
    const running=trips.findIndex((t,i)=>logs[i]?.actualStart&&!logs[i]?.actualEnd);
    if(running>=0)return running;
    // Earlier unrecorded trips stay unrecorded. Opening the app mid-shift must
    // not leave the dashboard and geofence detector stuck on the first trip.
    const pending=trips.findIndex((t,i)=>!logs[i]?.actualEnd&&(!Number.isFinite(moment(date,t.endTime))||moment(date,t.endTime)>=now));
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
    if(!log.actualStart){
      const planned=moment(input.date,input.startTime);
      if(Number.isFinite(planned)&&(now<planned-30*60000||now>planned+120*60000))return {state,event:null};
      if(!validPoint(points.start))return {state,event:null};
      if(inside("start")){if(count("startInside",true)>=2)state.seenStart=true;state.startOutside=0;}
      else {state.startInside=0;const outside=direction(points.start,"departureBearing")&&distance(here,points.start)>Number(points.start.radiusM||80)+Math.max(30,Number(c.accuracy));if(state.seenStart&&count("startOutside",outside)>=2)return {state,event:"DEPART"};}
      return {state,event:null};
    }
    if(input.hasControl&&!log.actualControl&&validPoint(points.control)&&count("controlInside",inside("control"))>=2)return {state,event:"CONTROL"};
    if(!log.actualTurn && input.hasTurn){
      if(validPoint(points.turn)&&count("turnInside",inside("turn"))>=2)return {state,event:"TURN"};
      return {state,event:null};
    }
    if(log.actualTurn&&!log.turnDepartedAt&&validPoint(points.turn)){
      if(inside("turn")){if(count("turnStay",true)>=2)state.seenTurn=true;state.turnOutside=0;}
      else if(state.seenTurn||Number(state.turnInside||0)>=2){
        const outside=direction(points.turn,"departureBearing")&&distance(here,points.turn)>Number(points.turn.radiusM||80)+Math.max(30,Number(c.accuracy));
        if(count("turnOutside",outside)>=2)return {state,event:"TURN_DEPART"};
      }
    }
    if(validPoint(points.end)&&count("endInside",inside("end"))>=2)return {state,event:"ARRIVE"};
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
    return {stops:stops.slice(start,end+1),turnIndex:hasTurn?turns[0]-start:-1,controlIndex:control.length===1?control[0]-start:-1};
  }
  function navigate(path,position,log,previous,now){
    const c=position?.coords||{},ts=Number(position?.timestamp),stops=path?.stops||[];
    if(!number(c.latitude)||!number(c.longitude)||!number(c.accuracy)||c.accuracy<0||c.accuracy>60||!ts||now-ts>20000||ts>now+5000||stops.length<2)return {configured:false,reason:"GPS 갱신·정확도 확인 중"};
    const here={lat:Number(c.latitude),lng:Number(c.longitude)},hasTurn=path.turnIndex>=0,returning=hasTurn&&Boolean(log.actualTurn);
    const lo=returning?path.turnIndex:0,hi=hasTurn&&!returning?path.turnIndex:stops.length-1;
    const last=previous&&previous.configured?Number(previous.matchedIndex):lo;
    let best=null;
    for(let i=lo;i<hi;i++){
      if(i<last-1)continue;
      const a=stops[i],b=stops[i+1],scale=Math.cos(here.lat*Math.PI/180),ax=(a.lng-here.lng)*111320*scale,ay=(a.lat-here.lat)*110540,bx=(b.lng-here.lng)*111320*scale,by=(b.lat-here.lat)*110540,dx=bx-ax,dy=by-ay;
      const den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0,d=Math.hypot(ax+t*dx,ay+t*dy),heading=bearing(a,b);
      const diff=number(c.heading)?Math.abs((Number(c.heading)-heading+540)%360-180):0;
      if(number(c.speed)&&Number(c.speed)>2&&number(c.heading)&&diff>100)continue;
      const score=d+(number(c.speed)&&Number(c.speed)>2?diff*.2:0);
      if(!best||score<best.score)best={i,t,d,score,heading};
    }
    if(!best||best.d>120)return {configured:false,reason:"노선·진행방향 재확인 중"};
    const nearNext=distance(here,stops[best.i+1])<=Math.max(25,Number(c.accuracy)),index=nearNext?best.i+1:best.i;
    const seen=log.actualEnd?stops.length:log.actualStart?Math.max(index+1,previous?.tripPassedStops||0):0;
    const nextIndex=Math.min(stops.length-1,index+1),nearCurrent=distance(here,stops[index])<=Math.max(25,Number(c.accuracy));
    return {configured:true,matchedIndex:index,tripPassedStops:seen,tripStopCount:stops.length,tripProgressPercent:Math.round(seen/stops.length*100),routeProgressPercent:Math.round((best.i+best.t)/Math.max(1,stops.length-1)*100),stopIndex:index+1,stopCount:stops.length,previousStop:stops[Math.max(0,index-1)].name,currentStop:nearCurrent?stops[index].name:"",nextStop:stops[nextIndex].name,distanceToNextM:Math.round(distance(here,stops[nextIndex])),direction:returning?"회차→도착":"출발→"+(hasTurn?"회차":"도착"),heading:best.heading,nearestDistanceM:Math.round(best.d),timestamp:ts};
  }
  return {resolvePoints,activeIndex,step,moment,distance,validPoint,bearing,course,navigate};
});
