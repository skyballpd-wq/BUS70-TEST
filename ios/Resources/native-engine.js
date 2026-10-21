/* Runs in JavaScriptCore, independently of WKWebView and its suspension. */
(function(root){
'use strict';
const gps=typeof module==='object'?require('../../driver-automation'):root.Bus70Automation;
const box=typeof module==='object'?require('../../driver-outbox'):root.Bus70Outbox;
const arrival=typeof module==='object'?require('./arrival-policy'):root.Bus70Arrival;
const binding=s=>[s.driverId,s.date,s.dispatchId,s.vehicleId].join('|');
const complete=t=>Boolean(t.actualEnd&&(!t.deadheadDestination||t.deadheadDestination===t.endPlace||t.deadheadReturnedAt));
const clean=s=>{const copy=JSON.parse(JSON.stringify(s));delete copy.token;return copy;};
function valid(s,now){
 if(!s||!['5','70'].includes(String(s.route))||!s.driverId||!s.dispatchId||!s.vehicleId||!Array.isArray(s.trips)||!s.trips.length)return false;
 const day=gps.moment(s.date,'03:30'),end=gps.moment(s.date,'27:30');
 return Number.isFinite(day)&&now>=day&&now<end&&s.trips.every(t=>Number.isInteger(t.trip)&&t.trip>0&&Number.isFinite(gps.moment(s.date,t.startTime))&&t.course?.stops?.length>=2);
}
function overlay(e){
 const s=e.schedule;if(!s)return;
 const data={date:s.date,dispatch:{dispatchId:s.dispatchId,vehicleId:s.vehicleId},vehicle:{vehicleId:s.vehicleId},trips:s.trips,runLogs:s.trips.map(t=>({...t,date:s.date,sequence:s.sequence}))};
 box.overlay(e.outbox,s.driverId,data);
 for(const t of s.trips){const log=data.runLogs.find(l=>Number(l.trip)===Number(t.trip));if(log)Object.assign(t,log);}
}
function sync(previous,s,now){
 if(!valid(s,now))throw Error('현재 운행일의 확정 배차·정류장 확인 필요');
 const e=JSON.parse(JSON.stringify(previous||{})),key=binding(s);
 e.outbox=box.prune(e.outbox||[],now);if(e.binding!==key){e.states={};e.reference=null;e.identityAt=0;e.lastFix=0;}
 e.binding=key;e.schedule=clean(s);e.schedule.trips.sort((a,b)=>a.trip-b.trip);e.identityAt=Math.max(e.identityAt||0,Number(s.vehicleIdentityAt||0));overlay(e);return e;
}
function tick(previous,p,now){
 const e=JSON.parse(JSON.stringify(previous)),s=e.schedule,c=p.coords||{};
 if(!valid(s,now)||s.trips.every(complete))return {state:e,stop:true,message:'운행 종료 · 위치 수집 중지'};
 if(!gps.validPoint({lat:c.latitude,lng:c.longitude})||!Number.isFinite(c.accuracy)||c.accuracy<0||c.accuracy>60||now-p.timestamp>20000||p.timestamp>now+5000||p.timestamp<=(e.lastFix||0))return {state:e,message:'최신 GPS 확인 중'};
 e.lastFix=p.timestamp;e.position=p;overlay(e);
 const trip=s.trips[gps.activeIndex(s.trips,s.trips,s.date,now)],key=String(trip.trip),st=e.states[key]||{};
 const hint=e.reference&&e.reference.date===s.date&&e.reference.dispatchId===s.dispatchId&&e.reference.vehicleId===s.vehicleId?e.reference:null;
 const nav=gps.navigate(trip.course,p,{...trip,date:s.date,trackingActive:true,vehicleIdentityAt:e.identityAt,requireVehicleConfirmation:!gps.identityFresh(e.identityAt,now)},st.navigation,now,hint);
 st.navigation=nav;const points={};for(const k of ['start','turn','end','control','return'])points[k]=trip[k+'Location'];
 const step=gps.step(st.visit||{},{position:p,now,points,log:trip,navigation:nav,course:trip.course,vehicleIdentityAt:e.identityAt,vehicleReference:hint,date:s.date,startTime:trip.startTime,hasTurn:Boolean(trip.turnPlace||trip.turnTime),hasControl:Boolean(trip.controlPoint),hasReturn:Boolean(trip.deadheadDestination&&trip.deadheadDestination!==trip.endPlace)});st.visit=step.state;
 if(step.event){
  const observed=step.position||p,coords=observed.coords;
  box.add(e.outbox,s.driverId,{action:'managerAccountUpsert',operation:'driverRunLogSave',date:s.date,dispatchId:s.dispatchId,vehicleId:s.vehicleId,sequence:s.sequence,trip:trip.trip,event:step.event,route:s.route,startPlace:trip.startPlace,turnPlace:trip.turnPlace,endPlace:trip.endPlace,plannedStart:trip.startTime,plannedTurn:trip.turnTime,plannedEnd:trip.endTime,plannedFrontGap:trip.plannedFrontGap,plannedRearGap:trip.plannedRearGap,source:'GPS_AUTO',latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy,observedAt:observed.timestamp,departureEvidenceSource:step.evidenceSource||'',returnEvidence:nav.returnEvidence||[]});overlay(e);
 }
 st.advisory=st.advisory||{};st.estimate=arrival.update(st.advisory,trip,nav,e.binding,s.route,gps.moment(s.date,trip.endTime),p,now);e.states[key]=st;e.currentTrip=trip.trip;
 const location={action:'managerAccountUpsert',operation:'driverLiveLocationSave',date:s.date,dispatchId:s.dispatchId,vehicleId:s.vehicleId,sequence:s.sequence,trip:trip.trip,latitude:c.latitude,longitude:c.longitude,accuracy:c.accuracy,speedKmh:!nav.waiting&&Number.isFinite(c.speed)?Math.max(0,c.speed*3.6):null,heading:c.heading,direction:nav.waiting?'':nav.returnConfirmed?'RETURN':'OUTBOUND',observedAt:p.timestamp};
 if(nav.configured&&trip.course.stops[nav.matchedIndex])location.matchedStopOrder=trip.course.stops[nav.matchedIndex].order;
 return {state:e,location,stop:s.trips.every(complete),speak:Boolean(st.estimate.notify&&s.voice&&s.enabled),message:nav.waiting?'출발 대기':nav.configured?'자동 운행기록 중':'상하행 위치 확인 중'};
}
function reference(previous,response,now){
 const e=JSON.parse(JSON.stringify(previous)),s=e.schedule,r=response.crossCheck,p=e.position;if(!s||!r||!p)return e;
 if(r.date!==s.date||r.dispatchId!==s.dispatchId||r.vehicleId!==s.vehicleId)return e;e.reference=r;
 const trip=s.trips.find(t=>t.trip===e.currentTrip),path=trip?.course;
 if(path&&p.coords.speed>=2.8&&now-p.timestamp<=20000&&r.status!=='DIFFERENT'&&gps.referenceIndex(path,{...r}, {lat:p.coords.latitude,lng:p.coords.longitude},now)>=0)e.identityAt=Number(r.fetchedAt)||0;
 return e;
}
function next(e,driver,now){return box.next(e.outbox||[],driver,now)||null;}
function response(previous,key,result,now){const e=JSON.parse(JSON.stringify(previous)),item=e.outbox.find(i=>i.key===key);if(!item)return e;
 if(result.ok){item.delivered=true;item.recordedAt=result.recordedAt||new Date(item.body.observedAt).toISOString();delete item.error;}
 else{item.error=result.message||'통신 대기 · 기기 보관 중';item.retryAt=now+15000;if(['GPS_EVENT_STALE','GPS_EVENT_DATE_MISMATCH','DISPATCH_MISMATCH','VEHICLE_MISMATCH','TRIP_NOT_SCHEDULED'].includes(result.error))item.blocked=true;}
 overlay(e);return e;
}
function spoke(previous,now,accepted,expected){const e=JSON.parse(JSON.stringify(previous)),st=e.states[String(e.currentTrip)];if(expected&&(expected.trip!==e.currentTrip||expected.stopIndex!==st?.estimate?.stopIndex))return e;if(st?.estimate)arrival.attempted(st.advisory,st.estimate,now,accepted);return e;}
function status(e){const s=e.schedule||{},st=e.states?.[String(e.currentTrip)],nav=st?.navigation,own=(e.outbox||[]).filter(i=>i.driverId===s.driverId);return {driverId:s.driverId||'',events:own.map(i=>({...i,body:Object.fromEntries(Object.entries(i.body).filter(([k])=>!['latitude','longitude','accuracy','returnEvidence'].includes(k)))})),pendingCount:own.filter(i=>!i.delivered&&!i.voided).length,syncError:own.find(i=>!i.delivered&&i.error)?.error||'',navigation:nav?{...nav,trip:e.currentTrip,date:s.date,dispatchId:s.dispatchId,vehicleId:s.vehicleId,vehicleIdentityAt:e.identityAt,arrivalEstimate:st.estimate}:null,...(e.position?{...e.position.coords,timestamp:e.position.timestamp,provider:'CoreLocation'}:{})};}
const api={sync,tick,reference,next,response,spoke,status,valid};if(typeof module==='object')module.exports=api;else root.Bus70NativeEngine=api;
})(typeof globalThis==='object'?globalThis:this);
