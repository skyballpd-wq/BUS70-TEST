/* Route 70 schedule calculations. Real rosters and dated timetable values are
 * loaded through PrivateRouteStore.gs and never committed to this repository.
 */

function bus70Route70OperationalMinutes_(value) {
  const match=String(value||'').match(/^(\d{2}):(\d{2})$/);if(!match)return null;
  let minutes=Number(match[1])*60+Number(match[2]);if(minutes<210)minutes+=1440;return minutes;
}

function bus70Route70ReferenceData_(rawDate, requester) {
  const date=normalizeDate_(rawDate),source=bus70PrivateRouteSource_('70',date);
  if(!source)return {ok:false,error:'PRIVATE_REFERENCE_NOT_CONFIGURED',message:'선택 날짜의 비공개 70번 노선 기준 자료가 설정되지 않았습니다.'};
  const requesterName=String(requester&&requester.name||requester&&requester.driverName||'').replace(/\s/g,''),requesterId=String(requester&&requester.driverId||'');
  const assignments=(source.assignments||[]).map(function(row){
    const sequence=Number(Array.isArray(row)?row[0]:row.sequence),driverName=String(Array.isArray(row)?row[1]:row.driverName||''),vehicleNo=String(Array.isArray(row)?row[2]:row.vehicleNo||'').replace(/\D/g,'');
    const matched=Boolean(requesterId&&requesterName&&driverName.replace(/\s/g,'')===requesterName);
    return {sequence:sequence,driverName:driverName,driverId:matched?requesterId:bus70PrivateVirtualDriverId_('70',sequence),identityMode:matched?'REAL_ACCOUNT':'TEST_VIRTUAL',vehicleNo:vehicleNo,vehicleId:'VEH-'+vehicleNo};
  }).filter(function(v){return v.sequence&&v.driverName&&v.vehicleNo;});
  const trips=[];
  (source.timings||[]).forEach(function(row,sequenceIndex){(row||[]).forEach(function(times,tripIndex){
    if(!times)return;
    let startTime=String(times[0]||''),turnTime=String(times[1]||''),endTime=String(times[2]||''),startPlace=String(source.defaultOrigin||'고강동공영차고지'),turnPlace=String(source.turnPlace||'송내역');
    if(!startTime&&turnTime){startTime=turnTime;startPlace=turnPlace;turnTime='';turnPlace='';}if(!startTime)return;
    trips.push({sequence:sequenceIndex+1,trip:tripIndex+1,startPlace:startPlace,startTime:startTime,turnPlace:turnPlace,turnTime:turnTime,endPlace:String(source.defaultEndPlace||'고강동공영차고지'),endTime:endTime});
  });});
  trips.forEach(function(item){
    const same=trips.filter(function(v){return v.trip===item.trip&&v.startPlace===item.startPlace;}).sort(function(a,b){return bus70Route70OperationalMinutes_(a.startTime)-bus70Route70OperationalMinutes_(b.startTime);});
    const position=same.indexOf(item),front=position>0?same[position-1]:null,rear=position<same.length-1?same[position+1]:null,own=bus70Route70OperationalMinutes_(item.startTime);
    item.plannedFrontGapMinutes=front?own-bus70Route70OperationalMinutes_(front.startTime):null;item.plannedRearGapMinutes=rear?bus70Route70OperationalMinutes_(rear.startTime)-own:null;item.frontSequence=front?front.sequence:null;item.rearSequence=rear?rear.sequence:null;
  });
  return {ok:true,route:'70',date:date,shift:String(source.shift||'B'),serviceType:String(source.serviceType||''),scheduleVersion:String(source.scheduleVersion||''),timetableSequences:Number(source.timetableSequences||0),observedAssignments:assignments.length,assignments:assignments,trips:trips,routeProfile:bus70PrivateRouteProfile_('70',source),identityPolicy:'PRIVATE_DATA_WITH_VIRTUAL_UNVERIFIED_IDS',sourceNote:String(source.sourceNote||'비공개 운영자료'),verificationStatus:String(source.verificationStatus||'비공개 관리자 승인 자료')};
}

function bus70Route70ScheduleForDriver_(driver, rawDate) {
  const reference=bus70Route70ReferenceData_(rawDate,driver);if(!reference.ok)return null;
  const name=String(driver&&driver.name||driver&&driver.driverName||'').replace(/\s/g,''),assignment=reference.assignments.find(function(v){return v.driverName.replace(/\s/g,'')===name;});if(!assignment)return null;
  const dispatchId='R70-'+reference.date.replace(/-/g,'')+'-'+reference.shift+'-'+('0'+assignment.sequence).slice(-2);
  return {ok:true,type:'WORK',route:'70',date:reference.date,driverId:String(driver&&driver.driverId||''),dispatch:{id:dispatchId,dispatchId:dispatchId,date:reference.date,shift:reference.shift,seq:assignment.sequence,sequence:assignment.sequence,vehicleId:assignment.vehicleId,vehicleNo:assignment.vehicleNo,scheduleVersion:reference.scheduleVersion,status:'확정',reference:true},vehicle:{vehicleId:assignment.vehicleId,id:assignment.vehicleId,vehicleNo:assignment.vehicleNo,no:assignment.vehicleNo,displayNo:'경기71아'+assignment.vehicleNo,route:'70',status:'운행',reference:true},scheduleVersion:reference.scheduleVersion,trips:reference.trips.filter(function(v){return v.sequence===assignment.sequence;}),routeProfile:reference.routeProfile,sourceNote:reference.sourceNote,verificationStatus:reference.verificationStatus};
}
