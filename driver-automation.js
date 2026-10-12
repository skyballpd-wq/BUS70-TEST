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
    for (const phase of ["start","turn","end"]) {
      const place = String(trip[phase+"Place"] || "");
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
        } else {
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
    if(state.lastTimestamp&&ts-state.lastTimestamp>45000)for(const key of ["seenStart","startInside","startOutside","turnInside","endInside"])delete state[key];
    state.lastTimestamp=ts;
    const here={lat:Number(c.latitude),lng:Number(c.longitude)},points=input.points||{},log=input.log||{};
    const inside=key=>validPoint(points[key])&&distance(here,points[key])<=Number(points[key].radiusM||80);
    const count=(key,yes)=>state[key]=yes?Number(state[key]||0)+1:0;
    if(log.actualEnd)return {state,event:null};
    if(!log.actualStart){
      const planned=moment(input.date,input.startTime);
      if(Number.isFinite(planned)&&(now<planned-30*60000||now>planned+120*60000))return {state,event:null};
      if(!validPoint(points.start))return {state,event:null};
      if(inside("start")){if(count("startInside",true)>=2)state.seenStart=true;state.startOutside=0;}
      else {state.startInside=0;const outside=distance(here,points.start)>Number(points.start.radiusM||80)+Math.max(30,Number(c.accuracy));if(state.seenStart&&count("startOutside",outside)>=2)return {state,event:"DEPART"};}
      return {state,event:null};
    }
    if(!log.actualTurn && input.hasTurn){
      if(validPoint(points.turn)&&count("turnInside",inside("turn"))>=2)return {state,event:"TURN"};
      return {state,event:null};
    }
    if(validPoint(points.end)&&count("endInside",inside("end"))>=2)return {state,event:"ARRIVE"};
    return {state,event:null};
  }
  return {resolvePoints,activeIndex,step,moment,distance,validPoint};
});
