const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const privateFixture=require('./private-route-fixture');

function makeContext(data){
  const context={console,BUS70_PRIVATE_ROUTE_DATA_:data,normalizeDate_:value=>String(value).slice(0,10),PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('apps-script/PrivateRouteStore.gs','utf8'),context);
  vm.runInContext(fs.readFileSync('apps-script/Route5Schedule.gs','utf8'),context);
  return context;
}

const context=makeContext(privateFixture),date='2099-01-08';
const reference=context.bus70Route5ReferenceData_(date,{driverId:'DRV-SYN-25',name:'가상5번기사25'});
assert.equal(reference.ok,true);assert.equal(reference.route,'5');assert.equal(reference.assignments.length,26);assert.equal(reference.timetableSequences,27);assert.equal(reference.trips.length,162);
assert.equal(reference.routeProfile.route,'5');assert.equal(reference.routeProfile.stopCount,3);assert.equal(reference.routeProfile.stops[0].name,'가상차고지');assert.equal(reference.routeProfile.stops[2].name,'가상회차지');
assert.equal(reference.routeProfile.boardAvailable,true);assert.equal(reference.routeProfile.timetableAvailable,true);
assert.equal(reference.assignments.some(v=>v.sequence===9),false);
const linked=reference.assignments.find(v=>v.sequence===25);assert.equal(linked.driverId,'DRV-SYN-25');assert.equal(linked.identityMode,'REAL_ACCOUNT');assert.equal(linked.vehicleNo,'9025');
assert.equal(reference.assignments.find(v=>v.sequence===24).driverId,'R5-TMP-024');
const schedule=context.bus70Route5ScheduleForDriver_({driverId:'DRV-SYN-25',name:'가상5번기사25'},date);assert.equal(schedule.dispatch.sequence,25);assert.equal(schedule.vehicle.displayNo,'경기71아9025');assert.equal(schedule.trips.length,6);assert.equal(schedule.routeProfile.route,'5');assert.equal(schedule.routeProfile.stopCount,3);
const rules=Object.fromEntries(reference.sequenceOperations.filter(v=>v.sequence<=5).map(v=>[v.sequence,v]));
[1,3,5].forEach(sequence=>{assert.equal(rules[sequence].firstScheduledTrip,1);assert.equal(rules[sequence].firstStartPlace,'가상회차지');});
[2,4].forEach(sequence=>{assert.equal(rules[sequence].firstScheduledTrip,2);assert.equal(rules[sequence].firstStartPlace,'가상차고지');assert.equal(reference.trips.some(v=>v.sequence===sequence&&v.trip===1),false);});
const last4=reference.trips.find(v=>v.sequence===4&&v.trip===7);assert.equal(last4.finalService,true);assert.equal(last4.serviceEndType,'UPBOUND_LAST');assert.equal(last4.endPlace,'가상종점');assert.equal(last4.deadheadDestination,'가상차고지');
const last23=reference.trips.find(v=>v.sequence===23&&v.trip===6);assert.equal(last23.finalService,true);assert.equal(last23.serviceEndType,'ROUND_TRIP_LAST');
assert.equal(reference.operatingRules.finalServices.length,2);assert.equal(reference.operatingRules.handwrittenAdjustmentPolicy.applyOnlyWhenConfirmed,true);
const short26=reference.trips.find(v=>v.sequence===26&&v.trip===6);assert.equal(short26.serviceRole,'SHORT_TURN_END');assert.equal(short26.endPlace,'가상종점');assert.equal(short26.endTime,'23:42');
assert.equal(context.bus70Route5ReferenceData_('2099-01-09').error,'PRIVATE_REFERENCE_NOT_CONFIGURED');
const saturday=context.bus70Route5ReferenceData_('2099-01-10',{driverId:'DRV-SYN-SAT-15',name:'가상5번토요기사15'});
assert.equal(saturday.ok,true);assert.equal(saturday.serviceType,'합성 토요일');assert.equal(saturday.timetableSequences,19);assert.equal(saturday.assignments.length,19);assert.equal(saturday.trips.length,117);
assert.equal(saturday.trips.some(v=>v.sequence===2&&v.trip===1),false);assert.equal(saturday.trips.some(v=>v.sequence===4&&v.trip===1),false);
[1,3,5].forEach(sequence=>{const first=saturday.sequenceOperations.find(v=>v.sequence===sequence);assert.equal(first.firstScheduledTrip,1);assert.equal(first.firstStartPlace,'가상회차지');});
[2,4].forEach(sequence=>assert.equal(saturday.sequenceOperations.find(v=>v.sequence===sequence).firstScheduledTrip,2));
const saturdayUpboundLast=saturday.trips.find(v=>v.sequence===4&&v.trip===7);assert.equal(saturdayUpboundLast.finalService,true);assert.equal(saturdayUpboundLast.serviceEndType,'UPBOUND_LAST');
const saturdayRoundTripLast=saturday.trips.find(v=>v.sequence===15&&v.trip===6);assert.equal(saturdayRoundTripLast.finalService,true);assert.equal(saturdayRoundTripLast.serviceEndType,'ROUND_TRIP_LAST');
[2,16,17,18,19].forEach(sequence=>assert.equal(saturday.trips.find(v=>v.sequence===sequence&&v.trip===(sequence===2?7:6)).serviceRole,'SHORT_TURN_END'));
const saturdaySchedule=context.bus70Route5ScheduleForDriver_({driverId:'DRV-SYN-SAT-15',name:'가상5번토요기사15'},'2099-01-10');assert.equal(saturdaySchedule.dispatch.sequence,15);assert.equal(saturdaySchedule.trips.length,6);assert.equal(saturdaySchedule.scheduleVersion,'SYN-R5-SAT-V1');
const noPrivate=makeContext(undefined);assert.equal(noPrivate.bus70Route5ReferenceData_(date).error,'PRIVATE_REFERENCE_NOT_CONFIGURED');
console.log('Route5Schedule tests passed');
