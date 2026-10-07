/* Route 5 schedule calculations. Real rosters and dated timetable values are
 * loaded through PrivateRouteStore.gs and never committed to this repository.
 */

function bus70Route5OperationalMinutes_(value) {
  const match=String(value||'').match(/^(\d{2}):(\d{2})$/);if(!match)return null;
  let minutes=Number(match[1])*60+Number(match[2]);if(minutes<210)minutes+=1440;return minutes;
}

function bus70Route5ReferenceData_(rawDate, requester) {
  const date=normalizeDate_(rawDate),source=bus70PrivateRouteSource_('5',date);
  if(!source)return {ok:false,error:'PRIVATE_REFERENCE_NOT_CONFIGURED',message:'선택 날짜의 비공개 5번 노선 기준 자료가 설정되지 않았습니다.'};
  const requesterName=String(requester&&requester.name||requester&&requester.driverName||'').replace(/\s/g,''),requesterId=String(requester&&requester.driverId||'');
  const assignments=(source.assignments||[]).map(function(row){
    const sequence=Number(Array.isArray(row)?row[0]:row.sequence),driverName=String(Array.isArray(row)?row[1]:row.driverName||''),vehicleNo=String(Array.isArray(row)?row[2]:row.vehicleNo||'').replace(/\D/g,'');
    const matched=Boolean(requesterId&&requesterName&&driverName.replace(/\s/g,'')===requesterName);
    return {sequence:sequence,driverName:driverName,driverId:matched?requesterId:bus70PrivateVirtualDriverId_('5',sequence),identityMode:matched?'REAL_ACCOUNT':'TEST_VIRTUAL',vehicleNo:vehicleNo,vehicleId:'VEH-'+vehicleNo};
  }).filter(function(v){return v.sequence&&v.driverName&&v.vehicleNo;});
  const trips=[];
  if(Array.isArray(source.tripTimings)){
    source.tripTimings.forEach(function(row,index){(row||[]).forEach(function(times,tripIndex){
      if(!times)return;
      let startTime=String(times[0]||''),turnTime=String(times[1]||''),endTime=String(times[2]||'');
      let startPlace=String(source.defaultOrigin||'고강공영차고지'),turnPlace=String(source.turnPlace||'삼정동복지회관'),endPlace=String(source.defaultEndPlace||'고강공영차고지');
      if(!startTime&&turnTime){startTime=turnTime;startPlace=turnPlace;turnTime='';turnPlace='';}
      if(!startTime)return;
      const item={sequence:index+1,trip:tripIndex+1,startPlace:startPlace,startTime:startTime,turnPlace:turnPlace,turnTime:turnTime,endPlace:endPlace,endTime:endTime};
      const exception=source.serviceExceptions&&source.serviceExceptions[item.sequence]&&source.serviceExceptions[item.sequence][item.trip];
      if(exception&&String(exception.serviceEndType||'').indexOf('UPBOUND_')===0){item.endPlace=String(exception.serviceEndPlace||item.turnPlace||'');item.endTime=String(exception.plannedEndTime||item.turnTime||item.endTime||'');item.turnPlace='';item.turnTime='';}
      trips.push(item);
    });});
  }else{
    (source.departures||[]).forEach(function(row,index){(row||[]).forEach(function(time,tripIndex){if(time)trips.push({sequence:index+1,trip:tripIndex+1,startTime:String(time)});});});
  }
  trips.forEach(function(item){
    const sameTrip=trips.filter(function(v){return v.trip===item.trip&&String(v.startPlace||'')===String(item.startPlace||'');}).sort(function(a,b){return bus70Route5OperationalMinutes_(a.startTime)-bus70Route5OperationalMinutes_(b.startTime);});
    const position=sameTrip.indexOf(item),front=position>0?sameTrip[position-1]:null,rear=position<sameTrip.length-1?sameTrip[position+1]:null,own=bus70Route5OperationalMinutes_(item.startTime);
    item.plannedFrontGapMinutes=front?own-bus70Route5OperationalMinutes_(front.startTime):null;item.plannedRearGapMinutes=rear?bus70Route5OperationalMinutes_(rear.startTime)-own:null;
    item.frontSequence=front?front.sequence:null;item.rearSequence=rear?rear.sequence:null;
    const exception=source.serviceExceptions&&source.serviceExceptions[item.sequence]&&source.serviceExceptions[item.sequence][item.trip];
    if(exception)Object.keys(exception).forEach(function(key){item[key]=exception[key];});
  });
  const sequenceOperations=[];
  for(let sequence=1;sequence<=Number(source.timetableSequences||0);sequence++){
    const sequenceTrips=trips.filter(function(v){return v.sequence===sequence;}).sort(function(a,b){return a.trip-b.trip;});if(!sequenceTrips.length)continue;
    const first=sequenceTrips[0],last=sequenceTrips[sequenceTrips.length-1];
    sequenceOperations.push({sequence:sequence,firstScheduledTrip:first.trip,firstStartPlace:first.startPlace||'',firstStartTime:first.startTime,lastScheduledTrip:last.trip,lastEndPlace:last.endPlace||'',lastEndTime:last.endTime||'',finalService:Boolean(last.finalService),serviceEndType:String(last.serviceEndType||'ROUND_TRIP')});
  }
  return {ok:true,route:'5',date:date,shift:String(source.shift||'B'),serviceType:String(source.serviceType||''),scheduleVersion:String(source.scheduleVersion||''),timetableSequences:Number(source.timetableSequences||0),observedAssignments:assignments.length,assignments:assignments,trips:trips,sequenceOperations:sequenceOperations,operatingRules:source.operatingRules||null,identityPolicy:'PRIVATE_DATA_WITH_VIRTUAL_UNVERIFIED_IDS',sourceNote:String(source.sourceNote||'비공개 운영자료'),verificationStatus:String(source.verificationStatus||'비공개 관리자 승인 자료')};
}

function bus70Route5ScheduleForDriver_(driver, rawDate) {
  const reference=bus70Route5ReferenceData_(rawDate,driver);if(!reference.ok)return null;
  const name=String(driver&&driver.name||driver&&driver.driverName||'').replace(/\s/g,''),assignment=reference.assignments.find(function(v){return v.driverName.replace(/\s/g,'')===name;});if(!assignment)return null;
  const dispatchId='R5-'+reference.date.replace(/-/g,'')+'-'+reference.shift+'-'+('0'+assignment.sequence).slice(-2);
  return {ok:true,type:'WORK',route:'5',date:reference.date,driverId:String(driver&&driver.driverId||''),dispatch:{id:dispatchId,dispatchId:dispatchId,date:reference.date,shift:reference.shift,seq:assignment.sequence,sequence:assignment.sequence,vehicleId:assignment.vehicleId,vehicleNo:assignment.vehicleNo,scheduleVersion:reference.scheduleVersion,status:'확정',reference:true},vehicle:{vehicleId:assignment.vehicleId,id:assignment.vehicleId,vehicleNo:assignment.vehicleNo,no:assignment.vehicleNo,displayNo:'경기71아'+assignment.vehicleNo,route:'5',status:'운행',reference:true},scheduleVersion:reference.scheduleVersion,trips:reference.trips.filter(function(v){return v.sequence===assignment.sequence;}),operationRule:reference.sequenceOperations.find(function(v){return v.sequence===assignment.sequence;})||null,operatingRules:reference.operatingRules,sourceNote:reference.sourceNote,verificationStatus:reference.verificationStatus};
}
