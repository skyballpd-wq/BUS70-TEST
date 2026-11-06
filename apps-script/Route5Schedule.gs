/* Route 5 schedule calculations. Real rosters and dated timetable values are
 * loaded through PrivateRouteStore.gs and never committed to this repository.
 */

function bus70Route5OperationalMinutes_(value) {
  const match=String(value||'').match(/^(\d{2}):(\d{2})$/);if(!match)return null;
  let minutes=Number(match[1])*60+Number(match[2]);if(minutes<210)minutes+=1440;return minutes;
}

function bus70Route5ClockFromOperationalMinutes_(value) {
  const minutes=Number(value);if(!Number.isFinite(minutes))return '';
  const normalized=((Math.round(minutes)%1440)+1440)%1440;
  return ('0'+Math.floor(normalized/60)).slice(-2)+':'+('0'+(normalized%60)).slice(-2);
}

function bus70Route5EffectiveRules_(source) {
  const serviceType=String(source&&source.serviceType||''),weekendOrHoliday=/(?:토|주말|휴일|공휴일)/.test(serviceType);
  const defaults={
    firstTripOrigins:{'1':'삼정동복지회관','3':'삼정동복지회관','5':'삼정동복지회관'},
    firstScheduledTrips:{'1':1,'2':2,'3':1,'4':2,'5':1},
    defaultOrigin:'고강공영차고지',turnPlace:'삼정동복지회관',defaultEndPlace:'고강공영차고지',
    finalServices:weekendOrHoliday?
      [{sequence:4,trip:7,type:'UPBOUND_LAST',serviceEndPlace:'테크노파크 정류소',deadheadDestination:'고강공영차고지'},
       {sequence:15,trip:6,type:'ROUND_TRIP_LAST',serviceEndPlace:'고강공영차고지'}]:
      [{sequence:4,trip:7,type:'UPBOUND_LAST',serviceEndPlace:'테크노파크 정류소',deadheadDestination:'고강공영차고지'},
       {sequence:23,trip:6,type:'ROUND_TRIP_LAST',serviceEndPlace:'고강공영차고지'}],
    handwrittenAdjustmentPolicy:{publishedTimeImmutable:true,applyOnlyWhenConfirmed:true}
  };
  const explicit=source&&source.operatingRules||{},rules={};
  Object.keys(defaults).forEach(function(key){rules[key]=defaults[key];});
  Object.keys(explicit).forEach(function(key){rules[key]=explicit[key];});
  ['defaultOrigin','turnPlace','defaultEndPlace'].forEach(function(key){if(source&&source[key])rules[key]=String(source[key]);});
  rules.firstTripOrigins=Object.assign({},defaults.firstTripOrigins,explicit.firstTripOrigins||{});
  rules.firstScheduledTrips=Object.assign({},defaults.firstScheduledTrips,explicit.firstScheduledTrips||{});
  rules.handwrittenAdjustmentPolicy=Object.assign({},defaults.handwrittenAdjustmentPolicy,explicit.handwrittenAdjustmentPolicy||{});
  if(!Array.isArray(rules.finalServices)||!rules.finalServices.length)rules.finalServices=defaults.finalServices;
  return rules;
}

function bus70Route5TripException_(source, rules, sequence, trip) {
  const result={},stored=source&&source.serviceExceptions&&source.serviceExceptions[sequence]&&source.serviceExceptions[sequence][trip];
  if(stored)Object.keys(stored).forEach(function(key){result[key]=stored[key];});
  const finalService=(rules.finalServices||[]).find(function(item){return Number(item.sequence)===sequence&&Number(item.trip)===trip;});
  if(finalService){
    const type=String(finalService.type||'ROUND_TRIP_LAST');
    result.serviceEndType=type;result.serviceRole=type==='UPBOUND_LAST'?'FINAL_UPBOUND_LAST':'FINAL_ROUND_TRIP_LAST';result.finalService=true;
    if(finalService.serviceEndPlace)result.serviceEndPlace=String(finalService.serviceEndPlace);
    if(finalService.deadheadDestination)result.deadheadDestination=String(finalService.deadheadDestination);
    if(finalService.plannedEndTime)result.plannedEndTime=String(finalService.plannedEndTime);
  }
  return Object.keys(result).length?result:null;
}

function bus70Route5ApplyTripException_(item, exception) {
  if(!exception)return item;
  if(String(exception.serviceEndType||'').indexOf('UPBOUND_')===0){
    item.endPlace=String(exception.serviceEndPlace||item.turnPlace||item.endPlace||'');
    item.endTime=String(exception.plannedEndTime||item.turnTime||item.endTime||'');
    item.turnPlace='';item.turnTime='';
  }else if(exception.serviceEndPlace)item.endPlace=String(exception.serviceEndPlace);
  Object.keys(exception).forEach(function(key){item[key]=exception[key];});
  if(item.controlPoint&&item.controlTime&&item.turnTime===item.controlTime){
    item.turnTime='';item.phaseStatus='OBSERVED_CHECKPOINT';
  }
  return item;
}

// 한 날짜의 원본을 탕 단위로 정규화합니다. 배차상황판에서 확인한 발차만
// 있는 자료와, 발차·회차·도착이 모두 판독된 자료를 같은 구조로 다룹니다.
function bus70Route5TripsFromSource_(source) {
  const safe=source||{},rules=bus70Route5EffectiveRules_(safe),defaultOrigin=String(safe.defaultOrigin||rules.defaultOrigin),turnPlace=String(safe.turnPlace||rules.turnPlace),defaultEndPlace=String(safe.defaultEndPlace||rules.defaultEndPlace),trips=[];
  if(Array.isArray(safe.tripTimings)){
    safe.tripTimings.forEach(function(row,index){(row||[]).forEach(function(times,tripIndex){
      if(!times)return;
      let startTime=String(times[0]||''),turnTime=String(times[1]||''),endTime=String(times[2]||'');
      let startPlace=defaultOrigin,itemTurnPlace=turnPlace,endPlace=defaultEndPlace;
      if(!startTime&&turnTime){startTime=turnTime;startPlace=itemTurnPlace;turnTime='';itemTurnPlace='';}
      if(!startTime)return;
      const item={sequence:index+1,trip:tripIndex+1,startPlace:startPlace,startTime:startTime,turnPlace:itemTurnPlace,turnTime:turnTime,endPlace:endPlace,endTime:endTime,phaseStatus:'OBSERVED'};
      trips.push(bus70Route5ApplyTripException_(item,bus70Route5TripException_(safe,rules,item.sequence,item.trip)));
    });});
  }else{
    (safe.departures||[]).forEach(function(row,index){(row||[]).forEach(function(time,tripIndex){
      if(!time)return;
      const sequence=index+1,trip=tripIndex+1,firstTrip=Number(rules.firstScheduledTrips[String(sequence)]||1),firstOrigin=String(rules.firstTripOrigins[String(sequence)]||defaultOrigin);
      const startPlace=trip===firstTrip?firstOrigin:defaultOrigin,startsAtTurn=trip===firstTrip&&startPlace===turnPlace;
      const item={sequence:sequence,trip:trip,startPlace:startPlace,startTime:String(time),turnPlace:startsAtTurn?'':turnPlace,turnTime:'',endPlace:defaultEndPlace,endTime:'',phaseStatus:'DEPARTURE_ONLY'};
      trips.push(bus70Route5ApplyTripException_(item,bus70Route5TripException_(safe,rules,sequence,trip)));
    });});
  }
  return {trips:bus70PrivateNormalizeTrips_(trips),rules:rules,defaultOrigin:defaultOrigin,turnPlace:turnPlace,defaultEndPlace:defaultEndPlace};
}

function bus70Route5PhaseMissingFields_(trip, rules) {
  const missing=[],sequence=Number(trip.sequence),number=Number(trip.trip),upboundOnly=String(trip.serviceEndType||'').indexOf('UPBOUND_')===0;
  const firstTrip=Number(rules.firstScheduledTrips[String(sequence)]||1),startPlace=String(trip.startPlace||''),startsAtTurn=number===firstTrip&&startPlace&&(startPlace===String(rules.turnPlace||'')||startPlace!==String(rules.defaultOrigin||''));
  const checkpoint=Boolean(trip.controlPoint&&trip.controlTime);
  if(!upboundOnly&&!startsAtTurn&&!checkpoint){if(!String(trip.turnPlace||''))missing.push('turnPlace');if(!String(trip.turnTime||''))missing.push('turnTime');}
  if(!String(trip.endPlace||trip.serviceEndPlace||''))missing.push('endPlace');
  if(!String(trip.endTime||''))missing.push('endTime');
  return missing;
}

function bus70Route5DateDistance_(fromDate,toDate) {
  const from=String(fromDate||'').split('-').map(Number),to=String(toDate||'').split('-').map(Number);if(from.length!==3||to.length!==3)return 999999;
  return Math.abs(Math.round((Date.UTC(to[0],to[1]-1,to[2])-Date.UTC(from[0],from[1]-1,from[2]))/86400000));
}

// 발차만 판독된 날짜는 반드시 같은 운행유형·같은 시간표 버전의 완전한
// 자료만 템플릿으로 사용합니다. 토요일 자료를 공휴일이나 평일에 섞지 않습니다.
function bus70Route5PhaseTemplate_(date, source, targetTrips) {
  const data=bus70PrivateData_(),routeData=data&&data['5']||{},targetClass=bus70ServiceClassForDate_(date,source&&source.serviceType),version=String(source&&source.scheduleVersion||''),targetByKey={};
  bus70PrivateNormalizeTrips_(targetTrips).forEach(function(item){targetByKey[Number(item.sequence)+'|'+Number(item.trip)]=item;});
  const choices=Object.keys(routeData).filter(function(candidateDate){
    const candidate=routeData[candidateDate];return candidateDate!==date&&candidate&&Array.isArray(candidate.tripTimings)&&candidate.tripTimings.length&&String(candidate.scheduleVersion||'')===version&&bus70ServiceClassForDate_(candidateDate,candidate.serviceType)===targetClass;
  }).map(function(candidateDate){
    const candidate=routeData[candidateDate],parsed=bus70Route5TripsFromSource_(candidate),byKey={};let common=0,matches=0;
    parsed.trips.forEach(function(item){byKey[Number(item.sequence)+'|'+Number(item.trip)]=item;});
    Object.keys(targetByKey).forEach(function(key){if(!byKey[key])return;common++;if(String(targetByKey[key].startTime||'')===String(byKey[key].startTime||''))matches++;});
    const matchRate=common?matches/common:0,prior=candidateDate<date;
    return {date:candidateDate,source:candidate,trips:parsed.trips,byKey:byKey,common:common,matchRate:matchRate,prior:prior,distance:bus70Route5DateDistance_(candidateDate,date)};
  }).filter(function(item){return item.common>0&&item.trips.some(function(trip){return trip.endTime;});}).sort(function(a,b){
    return b.matchRate-a.matchRate||(a.prior===b.prior?0:(a.prior?-1:1))||a.distance-b.distance||b.date.localeCompare(a.date);
  });
  if(!choices.length)return null;
  const selected=choices[0];selected.confidence=selected.matchRate>=0.95?'HIGH':selected.matchRate>=0.8?'MEDIUM':'LOW';selected.evidenceCount=choices.length;return selected;
}

function bus70Route5CompleteTripPhases_(date, source, rawTrips, rules) {
  const trips=bus70PrivateNormalizeTrips_(rawTrips).map(function(item){const copy={};Object.keys(item).forEach(function(key){copy[key]=item[key];});return copy;}),before=trips.map(function(item){return {item:item,missing:bus70Route5PhaseMissingFields_(item,rules)};}),needs=before.filter(function(entry){return entry.missing.length;});
  if(!needs.length)return {trips:trips,meta:{status:'OBSERVED_COMPLETE',sourceDate:date,confidence:'HIGH',inferredTripCount:0,unresolvedTripCount:0,unresolvedTrips:[],managerReviewRequired:false,confirmable:true}};
  const template=bus70Route5PhaseTemplate_(date,source,trips),structuralFields=['serviceEndType','serviceEndPlace','deadheadDestination','serviceRole','finalService','controlPoint','controlTime','postShift'];let inferredTripCount=0;
  if(template){
    trips.forEach(function(item){
      const key=Number(item.sequence)+'|'+Number(item.trip),model=template.byKey[key];if(!model)return;
      const missingBefore=bus70Route5PhaseMissingFields_(item,rules),start=bus70Route5OperationalMinutes_(item.startTime),modelStart=bus70Route5OperationalMinutes_(model.startTime);if(!missingBefore.length||start===null||modelStart===null)return;
      structuralFields.forEach(function(field){if((item[field]===undefined||item[field]===null||item[field]==='')&&model[field]!==undefined&&model[field]!==null&&model[field]!=='')item[field]=model[field];});
      if(!item.turnPlace&&model.turnPlace)item.turnPlace=String(model.turnPlace);
      if(!item.endPlace&&model.endPlace)item.endPlace=String(model.endPlace);
      const modelTurn=bus70Route5OperationalMinutes_(model.turnTime),modelEnd=bus70Route5OperationalMinutes_(model.endTime);
      if(!item.turnTime&&modelTurn!==null)item.turnTime=bus70Route5ClockFromOperationalMinutes_(start+(modelTurn-modelStart));
      if(!item.endTime&&modelEnd!==null)item.endTime=bus70Route5ClockFromOperationalMinutes_(start+(modelEnd-modelStart));
      if(String(item.serviceEndType||'').indexOf('UPBOUND_')===0){item.turnPlace='';item.turnTime='';if(item.serviceEndPlace)item.endPlace=String(item.serviceEndPlace);}
      const inferredFields=missingBefore.filter(function(field){return String(item[field]||'')!=='';});
      if(inferredFields.length){item.phaseStatus='INFERRED';item.phaseSourceDate=template.date;item.phaseConfidence=template.confidence;item.phaseInferredFields=inferredFields;inferredTripCount++;}
    });
  }
  const unresolved=[];trips.forEach(function(item){const fields=bus70Route5PhaseMissingFields_(item,rules);if(fields.length){item.phaseStatus=item.phaseStatus==='INFERRED'?'PARTIAL':'UNRESOLVED';unresolved.push({sequence:Number(item.sequence),trip:Number(item.trip),fields:fields});}});
  const status=inferredTripCount?(unresolved.length?'PARTIAL_INFERRED':'INFERRED_COMPLETE'):(unresolved.length&&unresolved.length<trips.length?'OBSERVED_PARTIAL':'INCOMPLETE_NO_MATCHING_TEMPLATE');
  return {trips:trips,meta:{status:status,sourceDate:template?template.date:'',sourceScheduleVersion:template?String(template.source.scheduleVersion||''):'',serviceClass:bus70ServiceClassForDate_(date,source&&source.serviceType),confidence:template?template.confidence:'NONE',startTimeMatchRate:template?template.matchRate:0,evidenceCount:template?template.evidenceCount:0,inferredTripCount:inferredTripCount,unresolvedTripCount:unresolved.length,unresolvedTrips:unresolved,managerReviewRequired:inferredTripCount>0||unresolved.length>0,confirmable:unresolved.length===0}};
}

function bus70Route5PrivatePattern_(rawDate) {
  const date=normalizeDate_(rawDate),data=bus70PrivateData_(),routeData=data&&data['5']||{},targetClass=bus70ServiceClassForDate_(date),choices=Object.keys(routeData).filter(function(sourceDate){
    const source=routeData[sourceDate];return sourceDate<date&&source&&bus70ServiceClassForDate_(sourceDate,source.serviceType)===targetClass;
  }).map(function(sourceDate){
    const source=routeData[sourceDate],parsed=bus70Route5TripsFromSource_(source),signature=bus70RouteTripPatternSignature_(parsed.trips);
    return {sourceDate:sourceDate,source:source,rules:parsed.rules,trips:parsed.trips,signature:signature};
  }).filter(function(item){return item.trips.length;}).sort(function(a,b){return b.sourceDate.localeCompare(a.sourceDate);});
  if(!choices.length)return {configured:Boolean(data),available:false,predicted:false,route:'5',date:date,serviceClass:targetClass,trips:[]};
  const selected=choices[0],evidenceCount=choices.filter(function(item){return String(item.source.scheduleVersion||'')===String(selected.source.scheduleVersion||'')&&item.signature===selected.signature;}).length,confidence=evidenceCount>=2?'HIGH':'MEDIUM',profileSource={serviceType:selected.source.serviceType,scheduleVersion:selected.source.scheduleVersion,timetableSequences:selected.source.timetableSequences,defaultOrigin:selected.source.defaultOrigin,turnPlace:selected.source.turnPlace,defaultEndPlace:selected.source.defaultEndPlace,operatingRules:selected.source.operatingRules,serviceExceptions:selected.source.serviceExceptions,stops:selected.source.stops,routeProfile:selected.source.routeProfile,sourceNote:selected.source.sourceNote};
  return {configured:true,available:true,predicted:true,route:'5',date:date,scheduleVersion:String(selected.source.scheduleVersion||''),serviceType:String(selected.source.serviceType||bus70ServiceClassLabel_(targetClass)),serviceClass:targetClass,shift:String(selected.source.shift||'B'),sourceDate:selected.sourceDate,evidenceCount:evidenceCount,confidence:confidence,trips:selected.trips,patternSignature:selected.signature,patternSummary:bus70RoutePatternSummary_(selected.trips),profileSource:profileSource};
}

function bus70Route5ReferenceData_(rawDate, requester, options) {
  const date=normalizeDate_(rawDate),privateSource=bus70PrivateRouteSource_('5',date),settings=options||{};
  let storedSchedule=bus70RouteScheduleFromDb_('5',date,privateSource&&privateSource.scheduleVersion);
  if(!privateSource&&!storedSchedule.available&&settings.allowPrediction){storedSchedule=bus70RouteSchedulePatternFromDb_('5',date);if(!storedSchedule.available)storedSchedule=bus70Route5PrivatePattern_(date);}
  const source=privateSource||{},patternSource=storedSchedule.profileSource||{},ruleSource=Object.assign({},patternSource,source,{serviceType:String(storedSchedule.serviceType||source.serviceType||patternSource.serviceType||''),scheduleVersion:String(storedSchedule.scheduleVersion||source.scheduleVersion||patternSource.scheduleVersion||'')});
  if(!privateSource&&!storedSchedule.available)return {ok:false,error:'ROUTE_REFERENCE_NOT_CONFIGURED',message:'선택 날짜의 5번 노선 배차스케줄DB 또는 승인 기준자료가 설정되지 않았습니다.'};
  const parsedSource=bus70Route5TripsFromSource_(ruleSource),rules=parsedSource.rules;
  const requesterName=String(requester&&requester.name||requester&&requester.driverName||'').replace(/\s/g,''),requesterId=String(requester&&requester.driverId||'');
  const assignments=(source.assignments||[]).map(function(row){
    const sequence=Number(Array.isArray(row)?row[0]:row.sequence),driverName=String(Array.isArray(row)?row[1]:row.driverName||''),vehicleNo=String(Array.isArray(row)?row[2]:row.vehicleNo||'').replace(/\D/g,'');
    const matched=Boolean(requesterId&&requesterName&&driverName.replace(/\s/g,'')===requesterName);
    return {sequence:sequence,driverName:driverName,driverId:matched?requesterId:bus70PrivateVirtualDriverId_('5',sequence),identityMode:matched?'REAL_ACCOUNT':'TEST_VIRTUAL',vehicleNo:vehicleNo,vehicleId:'VEH-'+vehicleNo};
  }).filter(function(v){return v.sequence&&v.driverName&&v.vehicleNo;});
  let trips=parsedSource.trips;
  if(storedSchedule.available)trips=storedSchedule.trips.map(function(storedTrip){
    const item={};Object.keys(storedTrip).forEach(function(key){item[key]=storedTrip[key];});
    if(item.serviceEndType||item.serviceRole||item.finalService)return item;
    return bus70Route5ApplyTripException_(item,bus70Route5TripException_(source,rules,Number(item.sequence),Number(item.trip)));
  });
  const phaseCompletion=bus70Route5CompleteTripPhases_(date,ruleSource,trips,rules),normalizedTrips=bus70PrivateNormalizeTrips_(phaseCompletion.trips);
  normalizedTrips.forEach(function(item){
    const sameTrip=normalizedTrips.filter(function(v){return v.trip===item.trip&&String(v.startPlace||'')===String(item.startPlace||'');}).sort(function(a,b){return bus70Route5OperationalMinutes_(a.startTime)-bus70Route5OperationalMinutes_(b.startTime);});
    const position=sameTrip.indexOf(item),front=position>0?sameTrip[position-1]:null,rear=position<sameTrip.length-1?sameTrip[position+1]:null,own=bus70Route5OperationalMinutes_(item.startTime);
    item.plannedFrontGapMinutes=front?own-bus70Route5OperationalMinutes_(front.startTime):null;item.plannedRearGapMinutes=rear?bus70Route5OperationalMinutes_(rear.startTime)-own:null;
    item.frontSequence=front?front.sequence:null;item.rearSequence=rear?rear.sequence:null;
  });
  const sequenceOperations=[];
  const timetableSequences=Number(source.timetableSequences||normalizedTrips.reduce(function(max,item){return Math.max(max,Number(item.sequence)||0);},0));
  for(let sequence=1;sequence<=timetableSequences;sequence++){
    const sequenceTrips=bus70PrivateTripsForSequence_(normalizedTrips,sequence);if(!sequenceTrips.length)continue;
    const first=sequenceTrips[0],last=sequenceTrips[sequenceTrips.length-1];
    first.isFirstScheduledTrip=true;last.isLastScheduledTrip=true;
    sequenceOperations.push({sequence:sequence,scheduledTripNumbers:sequenceTrips.map(function(item){return item.trip;}),firstScheduledTrip:first.trip,firstStartPlace:first.startPlace||'',firstStartTime:first.startTime,lastScheduledTrip:last.trip,lastEndPlace:last.serviceEndPlace||last.endPlace||'',lastEndTime:last.endTime||'',finalService:Boolean(last.finalService),serviceEndType:String(last.serviceEndType||'ROUND_TRIP'),serviceRole:String(last.serviceRole||''),deadheadDestination:String(last.deadheadDestination||'')});
  }
  const scheduleVersion=String(storedSchedule.scheduleVersion||source.scheduleVersion||''),shift=String(storedSchedule.shift||source.shift||'B'),serviceType=String(storedSchedule.serviceType||source.serviceType||''),serviceClass=String(storedSchedule.serviceClass||bus70ServiceClassForDate_(date,serviceType)),predicted=Boolean(storedSchedule.predicted),sourceNote=predicted?'노선별 운행패턴 예측 · '+storedSchedule.sourceDate+' '+bus70ServiceClassLabel_(serviceClass):storedSchedule.available?'노선별 배차스케줄DB · '+storedSchedule.sheetName:String(source.sourceNote||'비공개 운영자료'),patternSummary=bus70RoutePatternSummary_(normalizedTrips);
  return {ok:true,route:'5',date:date,shift:shift,serviceType:serviceType||bus70ServiceClassLabel_(serviceClass),serviceClass:serviceClass,scheduleVersion:scheduleVersion,timetableSequences:timetableSequences,observedAssignments:assignments.length,assignments:assignments,trips:normalizedTrips,tripNumbersBySequence:bus70PrivateTripNumbersBySequence_(normalizedTrips),sequenceOperations:sequenceOperations,patternSummary:patternSummary,phaseInference:phaseCompletion.meta,operatingRules:rules,routeProfile:bus70PrivateRouteProfile_('5',privateSource||patternSource,date,storedSchedule),identityPolicy:'PRIVATE_DATA_WITH_VIRTUAL_UNVERIFIED_IDS',sourceNote:sourceNote,verificationStatus:predicted?'소장 확정 전 예측 초안':phaseCompletion.meta.managerReviewRequired?'발차 원본 확인 · 회차·도착 시각 소장 검토 필요':storedSchedule.available?'노선별 배차스케줄DB 적용':String(source.verificationStatus||'비공개 관리자 승인 자료'),predicted:predicted,predictionSourceDate:predicted?String(storedSchedule.sourceDate||''):'',predictionConfidence:predicted?String(storedSchedule.confidence||''):'',predictionEvidenceCount:predicted?Number(storedSchedule.evidenceCount||0):0,dataStatus:predicted?'PREDICTED':phaseCompletion.meta.managerReviewRequired?'OBSERVED_WITH_INFERRED_PHASES':'CONFIRMED'};
}

function bus70Route5ScheduleForDriver_(driver, rawDate) {
  const reference=bus70Route5ReferenceData_(rawDate,driver);if(!reference.ok)return null;
  const name=String(driver&&driver.name||driver&&driver.driverName||'').replace(/\s/g,''),assignment=reference.assignments.find(function(v){return v.driverName.replace(/\s/g,'')===name;});if(!assignment)return null;
  const dispatchId='R5-'+reference.date.replace(/-/g,'')+'-'+reference.shift+'-'+('0'+assignment.sequence).slice(-2);
  let assignedTrips=bus70PrivateTripsForSequence_(reference.trips,assignment.sequence);
  if(reference.phaseInference&&reference.phaseInference.managerReviewRequired)assignedTrips=assignedTrips.map(function(trip){const copy={};Object.keys(trip).forEach(function(key){copy[key]=trip[key];});(trip.phaseInferredFields||[]).forEach(function(field){copy[field]='';});return copy;});
  return {ok:true,type:'WORK',route:'5',date:reference.date,driverId:String(driver&&driver.driverId||''),dispatch:{id:dispatchId,dispatchId:dispatchId,date:reference.date,shift:reference.shift,seq:assignment.sequence,sequence:assignment.sequence,vehicleId:assignment.vehicleId,vehicleNo:assignment.vehicleNo,scheduleVersion:reference.scheduleVersion,status:'확정',reference:true},vehicle:{vehicleId:assignment.vehicleId,id:assignment.vehicleId,vehicleNo:assignment.vehicleNo,no:assignment.vehicleNo,displayNo:'경기71아'+assignment.vehicleNo,route:'5',status:'운행',reference:true},scheduleVersion:reference.scheduleVersion,trips:assignedTrips,firstScheduledTrip:assignedTrips.length?assignedTrips[0].trip:null,operationRule:reference.sequenceOperations.find(function(v){return v.sequence===assignment.sequence;})||null,operatingRules:reference.operatingRules,routeProfile:reference.routeProfile,phaseInference:reference.phaseInference,phaseReviewRequired:Boolean(reference.phaseInference&&reference.phaseInference.managerReviewRequired),sourceNote:reference.sourceNote,verificationStatus:reference.verificationStatus};
}
