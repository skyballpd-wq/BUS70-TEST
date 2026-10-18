/* BUS70 TEST - manager day dispatch editor.
 * Manager access is granted by 계정DB 권한(소장/관리자) or the
 * BUS70_MANAGER_DRIVER_IDS script property (comma-separated driver IDs). */

function bus70ManagerAction_(body, driverId) {
  // 기존 Code.js 최상위 허용 action을 유지하면서 새 관리 작업을 operation으로 전달한다.
  const action = String(body.operation || body.action || '').trim();
  // 구형 Code.js의 허용 action을 그대로 통과시키기 위한 기사 기능 호환 경로.
  if (action === 'depotContactsGet') return bus70DepotContactsGet_(driverId);
  if (action === 'depotContactsSave') return bus70DepotContactsSave_(body,driverId);
  if (action === 'driverAlertSettingsGet') return bus70DriverAlertSettingsGet_(driverId);
  if (action === 'driverAlertSettingsSave') return bus70DriverAlertSettingsSave_(body, driverId);
  if (action === 'driverWeather') return bus70DriverWeather_(body,driverId);
  if (action === 'driverRunLogs') return bus70DriverRunLogs_(body, driverId);
  if (action === 'driverRunLogSave') return bus70DriverRunLogSave_(body, driverId);
  if (action === 'driverLiveLocationSave') return bus70DriverLiveLocationSave_(body, driverId);
  if (action === 'driverLiveLocations') return bus70DriverLiveLocations_(body, driverId);
  if (action === 'route5ReferenceData' && typeof bus70Route5ReferenceData_ === 'function') {
    const route5Driver=apiGetDriver_(driverId);return bus70Route5ReferenceData_(body.date,route5Driver&&route5Driver.driver);
  }
  if (action === 'route70ReferenceData' && typeof bus70Route70ReferenceData_ === 'function') {
    const route70Driver=apiGetDriver_(driverId);return bus70Route70ReferenceData_(body.date,route70Driver&&route70Driver.driver);
  }
  if (action === 'operationBootstrap') return bus70OperationBootstrap_(driverId);
  if (action === 'accidentReportSave') return bus70AccidentSave_(body,driverId);
  if (action === 'accidentPhotoGet') return bus70AccidentPhotoGet_(body,driverId);
  if (action === 'vehicleIncidentSave') return bus70VehicleIncidentSave_(body, driverId);
  if (action === 'maintenanceUpdate') return bus70MaintenanceUpdate_(body, driverId);
  if (action === 'reserveVehicleUpsert') return bus70ReserveVehicleUpsert_(body, driverId);
  if (action === 'scheduleAdjustmentSave') return bus70ScheduleAdjustmentSave_(body, driverId);
  if (!bus70IsManager_(driverId)) {
    return {ok:false, error:'MANAGER_REQUIRED', message:'소장 권한이 필요합니다.'};
  }
  if (action === 'managerDispatchBootstrap') return bus70ManagerBootstrap_(body.date, body.route);
  if (action === 'saveManagerDispatchDay') return bus70SaveManagerDispatchDay_(body, driverId);
  if (action === 'routeTimetableEditorLoad') return bus70RouteTimetableEditorLoad_(body, driverId);
  if (action === 'routeTimetableBulkSave') return bus70RouteTimetableBulkSave_(body, driverId);
  if (['routeStopImportStatus','routeStopImportPreview','routeStopImportApply'].indexOf(action)!==-1) {
    if(typeof bus70PublicTransitManagerAction_!=='function')return {ok:false,error:'PUBLIC_TRANSIT_MODULE_REQUIRED',message:'공공데이터 정류장 모듈이 배포되지 않았습니다.'};
    return bus70PublicTransitManagerAction_(action,body,driverId);
  }
  if (action === 'managerAccountList') return bus70ManagerAccountList_(driverId);
  if (action === 'managerAccountUpsert') return bus70ManagerAccountUpsert_(body, driverId);
  if (action === 'masterAdminBootstrap') return bus70MasterAdminBootstrap_(driverId);
  if (action === 'masterStaffUpsert') return bus70MasterStaffUpsert_(body, driverId);
  if (action === 'masterDriverUpsert') return bus70MasterDriverUpsert_(body, driverId);
  if (action === 'workChangeSave') return bus70WorkChangeSave_(body, driverId);
  return {ok:false, error:'UNKNOWN_ACTION', message:'지원하지 않는 소장 요청입니다.'};
}

function bus70CanOperate_(driverId) {
  const role=bus70RoleFor_(driverId);
  return role==='MASTER'||role==='MANAGER'||role==='CENTER';
}

function bus70OperationBootstrap_(requesterId) {
  if(!bus70CanOperate_(requesterId)&&!bus70IsKnownDriver_(requesterId)) return {ok:false,error:'LOGIN_REQUIRED',message:'로그인이 필요합니다.'};
  const viewerRole=bus70RoleFor_(requesterId),serviceDate=bus70ServiceDateKey_(new Date());
  const ss=SpreadsheetApp.getActiveSpreadsheet(), vs=ss.getSheetByName('차량DB'), is=ss.getSheetByName('사건DB'), ms=ss.getSheetByName('정비DB'), ds=ss.getSheetByName('기사DB'), ps=ss.getSheetByName('배차DB'), gs=viewerRole?ss.getSheetByName('배차간격조정DB'):null;
  if(!vs||!is||!ms||!ds) return {ok:false,error:'DB_MISSING',message:'현장 대응 DB를 찾을 수 없습니다.'};
  bus70EnsureSheetColumns_(ms,['정비완료일','운행가능일']);
  bus70EnsureSheetColumns_(is,['요청자']);
  if(gs)bus70EnsureSheetColumns_(gs,['노선','시간구분','공지상태','공지채널','원본근거']);
  const vr=vs.getDataRange().getDisplayValues(), vc=makeHeaderMap_(vr[0]);
  let vehicles=vr.slice(1).map(function(r){const no=String(r[vc['차량번호']]||'').replace(/\D/g,'');return {id:String(r[vc['vehicleId']]||''),no:no,displayNo:no.length===4?'경기71아'+no:no,type:String(r[vc['차량구분']]||''),status:String(r[vc['상태']]||''),route:String(r[vc['현재노선']]||''),note:String(r[vc['비고']]||''),order:Number(r[vc['표시순서']]||999),assignment:null,lastChangeReason:String(r[vc['비고']]||''),lastChangedAt:''};}).filter(function(v){return v.id;});
  const dr=ds.getDataRange().getDisplayValues(), dc=makeHeaderMap_(dr[0]), names={};
  dr.slice(1).forEach(function(r){names[String(r[dc['driverId']]||'')]=String(r[dc['성명']]||'');});
  const mr=ms.getDataRange().getDisplayValues(), mc=makeHeaderMap_(mr[0]), maintByIncident={};
  mr.slice(1).forEach(function(r){const incidentId=String(r[mc['incidentId']]||'');if(incidentId)maintByIncident[incidentId]={maintId:String(r[mc['maintId']]||''),status:String(r[mc['현재상태']]||''),reserveVehicleId:String(r[mc['예비차량ID']]||''),result:String(r[mc['정비결과']]||''),note:String(r[mc['비고']]||''),completedDate:bus70ManagerDateKey_(r[mc['정비완료일']]),availableDate:bus70ManagerDateKey_(r[mc['운행가능일']])};});
  const ir=is.getDataRange().getDisplayValues(), ic=makeHeaderMap_(ir[0]);
  let incidents=ir.slice(1).map(function(r){const id=String(r[ic['incidentId']]||''), m=maintByIncident[id]||{}, requester=String(r[ic['요청자']]||r[ic['처리자']]||''), handler=String(r[ic['처리자']]||'');return {accident:typeof bus70AccidentSummary_==='function'?bus70AccidentSummary_(r[ic['사고보고JSON']],requesterId,requester):null,incidentId:id,receivedAt:String(r[ic['접수시간']]||''),date:normalizeDate_(r[ic['날짜']]),driverId:String(r[ic['기사ID']]||''),driverName:names[String(r[ic['기사ID']]||'')]||'',requesterId:requester,requesterName:names[requester]||requester,requesterRole:bus70RoleFor_(requester)||'DRIVER',vehicleId:String(r[ic['차량ID']]||''),sequence:Number(r[ic['순차']]||0),type:String(r[ic['유형']]||''),content:String(r[ic['내용']]||''),status:String(r[ic['상태']]||''),handler:handler,handlerName:names[handler]||handler,handlerRole:bus70RoleFor_(handler)||'DRIVER',closedAt:String(r[ic['종결시간']]||''),maintId:m.maintId||'',maintenanceStatus:m.status||'',reserveVehicleId:m.reserveVehicleId||'',result:m.result||'',maintenanceNote:m.note||'',completedDate:m.completedDate||'',availableDate:m.availableDate||''};}).filter(function(v){return v.incidentId;}).reverse();
  const vehicleMap={};vehicles.forEach(function(v){vehicleMap[v.id]=v;});
  incidents.slice().reverse().forEach(function(v){
    const original=vehicleMap[v.vehicleId], reserve=vehicleMap[v.reserveVehicleId];
    if(original){original.lastChangeReason=v.status==='종결'?'정비 완료'+(v.result?' · '+v.result:'')+(v.availableDate?' · '+v.availableDate+'부터 운행 가능':''):v.type+' · '+v.content;original.lastChangedAt=v.completedDate||v.closedAt||v.receivedAt;original.completedDate=v.completedDate||'';original.availableDate=v.availableDate||'';}
    if(reserve){reserve.lastChangeReason='예비차 투입 · '+v.content;reserve.lastChangedAt=v.receivedAt;}
  });
  const pr=ps&&ps.getLastRow()>1?ps.getDataRange().getDisplayValues():[];
  if(pr.length){
    const pc=makeHeaderMap_(pr[0]);
    pr.slice(1).filter(function(r){return String(r[pc['상태']]||'')==='확정';}).sort(function(a,b){return normalizeDate_(a[pc['날짜']]).localeCompare(normalizeDate_(b[pc['날짜']]))||Number(a[pc['순차']]||0)-Number(b[pc['순차']]||0);}).forEach(function(r){const vehicle=vehicleMap[String(r[pc['차량ID']]||'')];if(vehicle)vehicle.assignment={date:normalizeDate_(r[pc['날짜']]),shift:String(r[pc['근무조']]||''),sequence:Number(r[pc['순차']]||0)};});
  }
  if(!viewerRole){
    const related={};
    // Only this service day's confirmed vehicles, never a driver's old vehicles.
    if(pr.length){const pc=makeHeaderMap_(pr[0]);pr.slice(1).forEach(function(r){if(normalizeDate_(r[pc['날짜']])===serviceDate&&String(r[pc['기사ID']]||'')===requesterId&&String(r[pc['상태']]||'')==='확정')related[String(r[pc['차량ID']]||'')]=true;});}
    incidents=incidents.filter(function(v){return v.requesterId===requesterId||Boolean(related[v.vehicleId]);});
    vehicles=vehicles.filter(function(v){return Boolean(related[v.id]);});
  }
  incidents=incidents.slice(0,30);
  vehicles.sort(function(a,b){return a.order-b.order||a.no.localeCompare(b.no);});
  let adjustments=[];
  if(gs&&gs.getLastRow()>1){const gr=gs.getDataRange().getDisplayValues(),gc=makeHeaderMap_(gr[0]);adjustments=gr.slice(1).map(function(r){return {gapId:String(r[gc['gapId']]||''),route:String(r[gc['노선']]||'70'),date:normalizeDate_(r[gc['날짜']]),sequence:Number(r[gc['순차']]||0),trip:Number(r[gc['탕']]||0),phase:String(r[gc['시간구분']]||'발차'),before:String(r[gc['기존시간']]||''),after:String(r[gc['조정시간']]||''),status:String(r[gc['공지상태']]||'확정'),channel:String(r[gc['공지채널']]||''),reason:String(r[gc['사유']]||'')};}).filter(function(v){return v.gapId;}).slice(-30).reverse();}
  return {ok:true,accidentReportVersion:typeof bus70AccidentSave_==='function'?1:0,role:viewerRole,serviceDate:serviceDate,vehicleScope:viewerRole?'OPERATIONS':'CURRENT_ASSIGNMENT',vehicles:vehicles,incidents:incidents,adjustments:viewerRole?adjustments:[]};
}

function bus70ScheduleAdjustmentSave_(body, requesterId) {
  if(!bus70IsManager_(requesterId)) return {ok:false,error:'MANAGER_REQUIRED',message:'시간 변경은 소장 이상만 가능합니다.'};
  const date=normalizeDate_(body.date),route=String(body.route||'70').trim().replace(/\s/g,'').replace(/번$/,''),sequence=Number(body.sequence||0),trip=Number(body.trip||0),phase=String(body.phase||'발차').trim(),before=String(body.before||'').trim(),after=String(body.after||'').trim(),reason=String(body.reason||'').trim();
  const sequenceMax=route==='5'?27:route==='70'?11:99,tripMax=route==='5'?7:20;
  if(!date||!route||!Number.isInteger(sequence)||sequence<1||sequence>sequenceMax||!Number.isInteger(trip)||trip<1||trip>tripMax||['발차','회차','도착'].indexOf(phase)===-1||!/^([01]\d|2[0-3]):[0-5]\d$/.test(before)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(after)||before===after||!reason) return {ok:false,error:'PARAM_REQUIRED',message:'노선·날짜·순차·탕·시간구분·변경 전후 시간·사유를 확인하세요.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(), gs=ss.getSheetByName('배차간격조정DB'), ps=ss.getSheetByName('배차DB'), cs=ss.getSheetByName('배차확인DB');
  if(!gs||!ps) return {ok:false,error:'DB_MISSING',message:'시간 변경 DB를 찾을 수 없습니다.'};
  bus70EnsureSheetColumns_(gs,['노선','시간구분','공지상태','공지채널','원본근거']);
  const pr=ps.getDataRange().getDisplayValues(),pc=makeHeaderMap_(pr[0]);let dispatchId='',scheduleVersion='';
  for(let i=1;i<pr.length;i++){
    const version=String(pr[i][pc['시간표버전']]||''),rowRoute=pc['노선']!==undefined?String(pr[i][pc['노선']]||'').replace(/\D/g,''):(version.indexOf('R5-')===0?'5':version.indexOf('R70-')===0?'70':'70');
    if(normalizeDate_(pr[i][pc['날짜']])===date&&Number(pr[i][pc['순차']])===sequence&&rowRoute===route&&String(pr[i][pc['상태']]||'')==='확정'){dispatchId=String(pr[i][pc['dispatchId']]||'');scheduleVersion=version;break;}
  }
  let reference=bus70ManagerReferenceData_(route,date,{allowPrediction:true});
  if(!dispatchId){
    if(reference&&reference.ok&&reference.assignments.some(function(v){return Number(v.sequence)===sequence;})){dispatchId='R'+route+'-'+date.replace(/-/g,'')+'-'+String(reference.shift||'B')+'-'+('0'+sequence).slice(-2);scheduleVersion=String(reference.scheduleVersion||'');}
  }
  if(!dispatchId)return {ok:false,error:'DISPATCH_NOT_FOUND',message:'선택 날짜·순차의 확정 배차를 찾을 수 없습니다.'};
  let scheduledTrips=[];
  if(reference&&reference.ok){
    scheduledTrips=bus70PrivateTripsForSequence_(reference.trips,sequence);
  }else{
    const scheduleSheet=ss.getSheetByName('스케줄');
    if(scheduleSheet&&scheduleSheet.getLastRow()>1){
      const sr=scheduleSheet.getDataRange().getDisplayValues(),sc=makeHeaderMap_(sr[0]);
      scheduledTrips=sr.slice(1).filter(function(item){return (!scheduleVersion||String(item[sc['버전']]||'')===scheduleVersion)&&Number(item[sc['순차']]||0)===sequence&&String(item[sc['상태']]||'')!=='중지';}).map(function(item){return {sequence:sequence,trip:Number(item[sc['탕']]||0),startTime:String(item[sc['발차시간']]||''),turnTime:String(item[sc['회차시간']]||''),endTime:String(item[sc['도착시간']]||'')};}).filter(function(item){return Number.isInteger(item.trip)&&item.trip>0;}).sort(function(a,b){return a.trip-b.trip;});
    }
  }
  if(!scheduledTrips.length)return {ok:false,error:'ROUTE_TIMETABLE_NOT_CONFIGURED',message:route+'번 '+sequence+'순차의 실제 탕별 시간표를 찾을 수 없습니다.'};
  const scheduledTrip=scheduledTrips.find(function(item){return Number(item.trip)===trip;});
  if(!scheduledTrip){
    const numbers=scheduledTrips.map(function(item){return Number(item.trip);}),first=numbers[0];
    return {ok:false,error:'TRIP_NOT_SCHEDULED',message:first>1&&trip<first?route+'번 '+sequence+'순차는 '+first+'탕부터 운행하며 '+trip+'탕은 결행·누락이 아니라 시간표에 존재하지 않습니다.':route+'번 '+sequence+'순차의 실제 운행 탕만 선택하세요. 운행 탕: '+numbers.join(', ')};
  }
  const phaseKey=phase==='발차'?'startTime':phase==='회차'?'turnTime':'endTime';
  if(!String(scheduledTrip[phaseKey]||'').trim())return {ok:false,error:'TRIP_PHASE_NOT_SCHEDULED',message:route+'번 '+sequence+'순차 '+trip+'탕에는 '+phase+' 시간이 없습니다.'};
  const gr=gs.getDataRange().getDisplayValues(),gc=makeHeaderMap_(gr[0]),row=new Array(gr[0].length).fill(''),gapId=newId_('GAP');
  row[gc['gapId']]=gapId;row[gc['노선']]=route;row[gc['날짜']]=date;row[gc['순차']]=sequence;row[gc['탕']]=trip;row[gc['시간구분']]=phase;row[gc['기존시간']]=before;row[gc['조정시간']]=after;row[gc['사유']]=reason;row[gc['적용시작']]=date;row[gc['적용종료']]=date;row[gc['처리자']]=requesterId;row[gc['처리시간']]=new Date();row[gc['공지상태']]='확정';row[gc['공지채널']]=String(body.announcementChannel||'단톡방');row[gc['원본근거']]=String(body.sourceEvidence||'소장 입력');gs.appendRow(row);
  if(cs&&cs.getLastRow()>1){const cr=cs.getDataRange().getDisplayValues(),cc=makeHeaderMap_(cr[0]);for(let j=1;j<cr.length;j++)if(String(cr[j][cc['dispatchId']]||'')===dispatchId)cs.getRange(j+1,cc['재확인필요']+1).setValue('Y');}
  writeAudit_(requesterId,bus70IsMaster_(requesterId)?'마스터':'소장','배차간격조정DB',gapId,'추가',{},row,reason);
  return {ok:true,message:route+'번 '+sequence+'순차 '+trip+'탕 '+phase+'시간이 '+before+' → '+after+'로 변경되고 단톡방 공지 이력으로 저장되었습니다.'};
}

function bus70TimetableApplyAdjustments_(ss, route, date, rawTrips) {
  const trips=bus70PrivateNormalizeTrips_((rawTrips||[]).map(function(item){const copy={};Object.keys(item||{}).forEach(function(key){copy[key]=item[key];});copy.appliedAdjustments=[];return copy;}));
  const byKey={};trips.forEach(function(item){byKey[Number(item.sequence)+'|'+Number(item.trip)]=item;});
  const sheet=ss&&ss.getSheetByName('배차간격조정DB');
  if(!sheet||sheet.getLastRow()<2)return {trips:trips,conflicts:[]};
  bus70EnsureSheetColumns_(sheet,['노선','시간구분','공지상태','공지채널','원본근거']);
  const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]),conflicts=[],grouped={};
  rows.slice(1).forEach(function(row){
    const rowRoute=bus70ManagerNormalizeRoute_(row[c['노선']]||'70'),rowDate=normalizeDate_(row[c['날짜']]),status=String(row[c['공지상태']]||'확정').trim();
    if(rowRoute!==route||rowDate!==date||(status&&status!=='확정'))return;
    const sequence=Number(row[c['순차']]||0),trip=Number(row[c['탕']]||0),phase=String(row[c['시간구분']]||'발차').trim(),item=byKey[sequence+'|'+trip];
    const field=phase==='발차'?'startTime':phase==='회차'?'turnTime':phase==='도착'?'endTime':'';
    if(!item||!field)return;
    const key=sequence+'|'+trip+'|'+field;if(!grouped[key])grouped[key]={item:item,field:field,sequence:sequence,trip:trip,phase:phase,records:[]};
    grouped[key].records.push({before:String(row[c['기존시간']]||'').trim(),after:String(row[c['조정시간']]||'').trim(),reason:String(row[c['사유']]||'')});
  });
  Object.keys(grouped).forEach(function(key){
    const group=grouped[key],item=group.item,records=group.records;let current=String(item[group.field]||'').trim(),resume=0;
    for(let index=records.length-1;index>=0;index--)if(records[index].after===current){resume=index+1;break;}
    records.forEach(function(record){item.appliedAdjustments.push({phase:group.phase,before:record.before,after:record.after,reason:record.reason});});
    for(let index=resume;index<records.length;index++){
      const record=records[index];
      if(current===record.before){current=record.after;item[group.field]=current;}
      else if(current!==record.after)conflicts.push({sequence:group.sequence,trip:group.trip,phase:group.phase,current:current,before:record.before,after:record.after});
    }
  });
  return {trips:trips,conflicts:conflicts};
}

function bus70RouteTimetableEditorData_(body) {
  const date=normalizeDate_(body&&body.date),route=bus70ManagerNormalizeRoute_(body&&body.route);
  if(!date||!route||route==='ALL')return {ok:false,error:'PARAM_REQUIRED',message:'시간표를 편집할 노선과 운행 날짜를 확인하세요.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(),storage=bus70EnsureRoutePartitions_(ss,route,date);
  if(!storage.ok)return {ok:false,error:'ROUTE_DB_MISSING',message:route+'번 노선별 배차스케줄DB를 준비하지 못했습니다.'};
  let reference=bus70ManagerReferenceData_(route,date,{allowPrediction:true});
  if(!reference||!reference.ok)return reference||{ok:false,error:'ROUTE_REFERENCE_NOT_CONFIGURED',message:date+' '+route+'번 시간표 기준자료가 없습니다.'};
  if(bus70ManagerNormalizeRoute_(reference.route)!==route||normalizeDate_(reference.date)!==date){
    return {ok:false,error:'ROUTE_DATA_MISMATCH',message:'선택한 '+route+'번·'+date+'와 다른 시간표 응답을 차단했습니다. 노선별 DB를 확인하세요.'};
  }
  if(!reference.predicted&&!(reference.phaseInference&&reference.phaseInference.managerReviewRequired)){
    bus70SyncRouteReferenceToDb_(ss,route,reference);
    reference=bus70ManagerReferenceData_(route,date);
    if(!reference||!reference.ok||bus70ManagerNormalizeRoute_(reference.route)!==route||normalizeDate_(reference.date)!==date){
      return {ok:false,error:'ROUTE_DATA_MISMATCH',message:'노선별 DB 이관 후 시간표의 노선 또는 날짜가 일치하지 않습니다.'};
    }
  }
  const adjusted=bus70TimetableApplyAdjustments_(ss,route,date,reference.trips||[]);
  if(!adjusted.trips.length)return {ok:false,error:'ROUTE_TIMETABLE_NOT_CONFIGURED',message:date+' '+route+'번의 탕별 배차시간표가 없습니다.'};
  return {ok:true,route:route,date:date,shift:String(reference.shift||''),serviceType:String(reference.serviceType||''),serviceClass:String(reference.serviceClass||bus70ServiceClassForDate_(date,reference.serviceType)),scheduleVersion:String(reference.scheduleVersion||''),sourceNote:String(reference.sourceNote||''),trips:adjusted.trips,tripNumbersBySequence:bus70PrivateTripNumbersBySequence_(adjusted.trips),patternSummary:reference.patternSummary||bus70RoutePatternSummary_(adjusted.trips),phaseInference:reference.phaseInference||null,operatingRules:reference.operatingRules||null,predicted:Boolean(reference.predicted),predictionSourceDate:String(reference.predictionSourceDate||''),predictionConfidence:String(reference.predictionConfidence||''),predictionEvidenceCount:Number(reference.predictionEvidenceCount||0),adjustmentConflicts:adjusted.conflicts,routeStorage:{partitioned:true,scheduleSheet:storage.scheduleSheet,stopSheet:storage.stopSheet}};
}

function bus70RouteTimetableEditorLoad_(body, requesterId) {
  if(!bus70IsManager_(requesterId))return {ok:false,error:'MANAGER_REQUIRED',message:'배차시간표 편집은 소장 이상만 가능합니다.'};
  return bus70RouteTimetableEditorData_(body||{});
}

function bus70RouteTimetableBulkSave_(body, requesterId) {
  if(!bus70IsManager_(requesterId))return {ok:false,error:'MANAGER_REQUIRED',message:'배차시간표 편집은 소장 이상만 가능합니다.'};
  const date=normalizeDate_(body.date),route=bus70ManagerNormalizeRoute_(body.route),reason=String(body.reason||'').trim(),changes=Array.isArray(body.changes)?body.changes:[];
  if(!date||!route||route==='ALL'||!reason||!changes.length||changes.length>700)return {ok:false,error:'PARAM_REQUIRED',message:'노선·날짜·변경 항목·변경 사유를 확인하세요.'};
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const current=bus70RouteTimetableEditorData_({route:route,date:date});if(!current.ok)return current;
    const phaseFields={'발차':'startTime','회차':'turnTime','도착':'endTime'},byKey={},seen={},normalized=[];
    current.trips.forEach(function(item){byKey[Number(item.sequence)+'|'+Number(item.trip)]=item;});
    for(let index=0;index<changes.length;index++){
      const change=changes[index]||{},sequence=Number(change.sequence||0),trip=Number(change.trip||0),phase=String(change.phase||'').trim(),field=phaseFields[phase],before=String(change.before||'').trim(),after=String(change.after||'').trim(),key=sequence+'|'+trip,unique=key+'|'+phase,item=byKey[key];
      if(!item||!field||seen[unique]||(before&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(before))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(after)||before===after){
        return {ok:false,error:'TIMETABLE_CHANGE_INVALID',message:'변경 목록의 순차·탕·시간을 확인하세요.'};
      }
      const actual=String(item[field]||'').trim();
      if(actual!==before)return {ok:false,error:'TIMETABLE_STALE',message:route+'번 '+sequence+'순차 '+trip+'탕 '+phase+' 시간이 이미 '+(actual||'미등록')+'로 바뀌었습니다. 전체 시간표를 다시 불러오세요.'};
      seen[unique]=true;normalized.push({sequence:sequence,trip:trip,phase:phase,field:field,before:before,after:after});
    }
    const ss=SpreadsheetApp.getActiveSpreadsheet(),scheduleSheet=bus70RoutePartitionSheet_(ss,route,'schedule',true,date),adjustmentSheet=ss.getSheetByName('배차간격조정DB');
    if(!scheduleSheet||!adjustmentSheet)return {ok:false,error:'DB_MISSING',message:'노선별 시간표 또는 시간 변경 이력 DB를 찾을 수 없습니다.'};
    bus70EnsureSheetColumns_(adjustmentSheet,['노선','시간구분','공지상태','공지채널','원본근거']);
    const scheduleRows=scheduleSheet.getDataRange().getDisplayValues(),scheduleHeaders=scheduleRows[0],sc=makeHeaderMap_(scheduleHeaders),revised={},revisionBase=scheduleRows.slice(1).reduce(function(max,row){return normalizeDate_(row[sc['운행일']])===date&&String(row[sc['시간표버전']]||'')===current.scheduleVersion?Math.max(max,Number(row[sc['개정번호']]||0)):max;},0),revision=revisionBase+1,now=new Date();
    normalized.forEach(function(change){const key=change.sequence+'|'+change.trip;if(!revised[key]){const source=byKey[key],copy={};Object.keys(source).forEach(function(name){copy[name]=source[name];});revised[key]=copy;}revised[key][change.field]=change.after;});
    if(current.predicted||(current.phaseInference&&current.phaseInference.managerReviewRequired)){
      const prediction=bus70ManagerReferenceData_(route,date,{allowPrediction:true});
      if(!prediction||!prediction.ok||(current.predicted&&!prediction.predicted))return {ok:false,error:'PREDICTION_REFRESH_REQUIRED',message:'예측 시간표 기준이 변경되었습니다. 전체 시간표를 다시 불러오세요.'};
      const confirmedReference=JSON.parse(JSON.stringify(prediction)),changed={};normalized.forEach(function(change){changed[change.sequence+'|'+change.trip+'|'+change.field]=change.after;});
      confirmedReference.trips=(confirmedReference.trips||[]).map(function(trip){const copy={};Object.keys(trip).forEach(function(name){copy[name]=trip[name];});['startTime','turnTime','endTime'].forEach(function(field){const key=Number(copy.sequence)+'|'+Number(copy.trip)+'|'+field;if(changed[key]!==undefined)copy[field]=changed[key];});return copy;});
      if(route==='5'&&typeof bus70Route5PhaseMissingFields_==='function'){
        const phaseRules=confirmedReference.operatingRules||bus70Route5EffectiveRules_({serviceType:confirmedReference.serviceType}),unresolved=confirmedReference.trips.filter(function(trip){return bus70Route5PhaseMissingFields_(trip,phaseRules).length;});
        if(unresolved.length)return {ok:false,error:'TIMETABLE_PHASES_INCOMPLETE',message:'회차·도착 시각이 미등록된 탕 '+unresolved.length+'개가 남아 있습니다. 같은 운행유형의 원본 시간표를 먼저 등록하거나 모든 누락 시각을 입력하세요.'};
        confirmedReference.trips.forEach(function(trip){if(trip.phaseStatus==='INFERRED'||trip.phaseStatus==='PARTIAL')trip.phaseStatus='CONFIRMED_INFERRED';});
      }
      const evidenceDate=prediction.predictionSourceDate||prediction.phaseInference&&prediction.phaseInference.sourceDate||date;
      confirmedReference.predicted=false;confirmedReference.dataStatus='CONFIRMED';confirmedReference.revision=revision;confirmedReference.revisionReason=reason;confirmedReference.confirmedBy=requesterId;confirmedReference.confirmedAt=now;confirmedReference.sourceDate=evidenceDate;confirmedReference.sourceNote=String(body.sourceEvidence||'소장 시간표 일괄편집')+' · '+evidenceDate+' 패턴 확정';
      const sync=bus70SyncRouteReferenceToDb_(ss,route,confirmedReference);if(!sync.ok)return {ok:false,error:'PREDICTED_SCHEDULE_CONFIRM_FAILED',message:'수정한 예측 시간표를 확정 DB에 저장하지 못했습니다.'};
    }else{
      const revisionRows=Object.keys(revised).sort(function(a,b){const ap=a.split('|').map(Number),bp=b.split('|').map(Number);return ap[0]-bp[0]||ap[1]-bp[1];}).map(function(key){
        const trip=revised[key],row=new Array(scheduleHeaders.length).fill('');
        row[sc['시간표ID']]=newId_('TT');row[sc['노선']]=route;row[sc['운행일']]=date;row[sc['시간표버전']]=current.scheduleVersion;row[sc['운행구분']]=current.serviceType;row[sc['운행유형코드']]=current.serviceClass;row[sc['기준일']]=date;row[sc['자료상태']]='CONFIRMED';row[sc['적용시작']]=date;row[sc['적용종료']]=date;row[sc['근무조']]=current.shift;row[sc['순차']]=Number(trip.sequence);row[sc['탕']]=Number(trip.trip);row[sc['발차지']]=String(trip.startPlace||'');row[sc['발차시간']]=String(trip.startTime||'');row[sc['회차지']]=String(trip.turnPlace||'');row[sc['회차시간']]=String(trip.turnTime||'');row[sc['도착지']]=String(trip.endPlace||'');row[sc['도착시간']]=String(trip.endTime||'');row[sc['시각상태']]=String(trip.phaseStatus||'');row[sc['시각근거일']]=String(trip.phaseSourceDate||'');row[sc['시각신뢰도']]=String(trip.phaseConfidence||'');row[sc['영업종료형태']]=String(trip.serviceEndType||'');row[sc['영업종료지']]=String(trip.serviceEndPlace||'');row[sc['회송목적지']]=String(trip.deadheadDestination||'');row[sc['서비스역할']]=String(trip.serviceRole||'');row[sc['최종운행']]=trip.finalService?'Y':'';row[sc['상태']]='사용';row[sc['개정번호']]=revision;row[sc['변경사유']]=reason;row[sc['처리자']]=requesterId;row[sc['확정시간']]=now;row[sc['원본근거']]=String(body.sourceEvidence||'소장 시간표 일괄편집');row[sc['수정시간']]=now;return row;
      });
      bus70AppendPartitionRows_(scheduleSheet,revisionRows,scheduleHeaders.length);
    }
    const adjustmentRows=adjustmentSheet.getDataRange().getDisplayValues(),adjustmentHeaders=adjustmentRows[0],ac=makeHeaderMap_(adjustmentHeaders),historyRows=normalized.map(function(change){const row=new Array(adjustmentHeaders.length).fill('');row[ac['gapId']]=newId_('GAP');row[ac['노선']]=route;row[ac['날짜']]=date;row[ac['순차']]=change.sequence;row[ac['탕']]=change.trip;row[ac['시간구분']]=change.phase;row[ac['기존시간']]=change.before;row[ac['조정시간']]=change.after;row[ac['사유']]=reason;row[ac['적용시작']]=date;row[ac['적용종료']]=date;row[ac['처리자']]=requesterId;row[ac['처리시간']]=now;row[ac['공지상태']]='확정';row[ac['공지채널']]=String(body.announcementChannel||'단톡방');row[ac['원본근거']]=String(body.sourceEvidence||'소장 시간표 일괄편집');return row;});
    adjustmentSheet.getRange(adjustmentSheet.getLastRow()+1,1,historyRows.length,adjustmentHeaders.length).setValues(historyRows);
    const dispatchSheet=ss.getSheetByName('배차DB'),confirmSheet=ss.getSheetByName('배차확인DB'),dispatchIds={};
    if(dispatchSheet)bus70ManagerAssignments_(dispatchSheet,date,route).forEach(function(item){dispatchIds[item.dispatchId]=true;});
    if(confirmSheet&&confirmSheet.getLastRow()>1&&Object.keys(dispatchIds).length){bus70EnsureSheetColumns_(confirmSheet,['재확인필요']);const confirmRows=confirmSheet.getDataRange().getDisplayValues(),cc=makeHeaderMap_(confirmRows[0]);for(let rowIndex=1;rowIndex<confirmRows.length;rowIndex++)if(dispatchIds[String(confirmRows[rowIndex][cc['dispatchId']]||'')])confirmSheet.getRange(rowIndex+1,cc['재확인필요']+1).setValue('Y');}
    writeAudit_(requesterId,bus70IsMaster_(requesterId)?'마스터':'소장',scheduleSheet.getName?scheduleSheet.getName():'노선_'+route+'_배차스케줄DB',route+'-'+date+'-R'+revision,'시간표일괄수정',normalized.map(function(v){return {sequence:v.sequence,trip:v.trip,phase:v.phase,time:v.before};}),normalized.map(function(v){return {sequence:v.sequence,trip:v.trip,phase:v.phase,time:v.after};}),reason);
    const data=bus70RouteTimetableEditorData_({route:route,date:date});
    return {ok:true,message:route+'번 '+date+' 배차시간표 '+normalized.length+'개 시간을 한 번에 저장했습니다. 기사 확인은 재확인이 필요합니다.',changeCount:normalized.length,revision:revision,data:data};
  }finally{lock.releaseLock();}
}

function bus70ReserveVehicleUpsert_(body, requesterId) {
  if(!bus70IsManager_(requesterId)) return {ok:false,error:'MANAGER_REQUIRED',message:'차량 등록·수정은 소장 이상만 가능합니다.'};
  const vehicleId=String(body.vehicleId||'').trim(), no=String(body.vehicleNo||'').replace(/\D/g,''), type=String(body.vehicleType||body.type||'예비').trim(), route=String(body.route||'70').trim(), status=String(body.status||'운행가능').trim(), note=String(body.note||'').trim();
  if(!/^\d{4}$/.test(no)||!route||!['일반','예비'].includes(type)||['운행가능','운행','정비중','운행불가'].indexOf(status)===-1) return {ok:false,error:'PARAM_REQUIRED',message:'차량번호 4자리·구분·노선·상태를 확인하세요.'};
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('차량DB'); if(!sheet)return {ok:false,error:'DB_MISSING',message:'차량DB를 찾을 수 없습니다.'};
  const rows=sheet.getDataRange().getDisplayValues(), c=makeHeaderMap_(rows[0]); let rowNo=0, duplicateNo=0;
  for(let i=1;i<rows.length;i++){if(String(rows[i][c['vehicleId']]||'')===vehicleId)rowNo=i+1;if(String(rows[i][c['차량번호']]||'').replace(/\D/g,'')===no)duplicateNo=i+1;}
  if(vehicleId&&!rowNo)return {ok:false,error:'VEHICLE_NOT_FOUND',message:'수정할 차량을 찾을 수 없습니다.'};
  if(duplicateNo&&duplicateNo!==rowNo)return {ok:false,error:'VEHICLE_NO_DUPLICATE',message:'이미 등록된 차량번호입니다.'};
  const before=rowNo?rows[rowNo-1].slice():[], row=rowNo?before.slice():new Array(rows[0].length).fill('');
  row[c['vehicleId']]=rowNo?String(row[c['vehicleId']]||''):newId_('VEH'); row[c['차량번호']]=no; row[c['차량구분']]=type; row[c['상태']]=status; row[c['현재노선']]=route; row[c['표시순서']]=row[c['표시순서']]||999; row[c['비고']]=note||(type==='예비'?'예비차 등록':'일반차 등록');
  if(rowNo)sheet.getRange(rowNo,1,1,row.length).setValues([row]);else sheet.appendRow(row);
  writeAudit_(requesterId,bus70IsMaster_(requesterId)?'마스터':'소장','차량DB',row[c['vehicleId']],rowNo?'수정':'추가',before,row,'차량 등록·수정');
  return {ok:true,vehicleId:row[c['vehicleId']],message:(rowNo?'차량 정보를 수정했습니다. ':type+' 차량을 등록했습니다. ')+no};
}

function bus70VehicleIncidentSave_(body, requesterId) {
  if(String(body.type||'').trim()==='사고')return {ok:false,error:'ACCIDENT_PHOTOS_REQUIRED',message:'사고는 차량번호와 필수 사진 5장을 포함한 사고 보고 화면에서 접수하세요.'};
  const requesterRole=bus70RoleFor_(requesterId), driverRequest=!requesterRole&&bus70IsKnownDriver_(requesterId);
  if(!bus70IsManager_(requesterId)&&requesterRole!=='CENTER'&&!driverRequest) return {ok:false,error:'REQUESTER_REQUIRED',message:'정비 요청은 기사·소장·정비소·마스터만 가능합니다.'};
  const date=normalizeDate_(body.date), vehicleId=String(body.vehicleId||'').trim(), reserveId=String(body.reserveVehicleId||'').trim(), type=String(body.type||'').trim(), content=String(body.content||'').trim(), sequence=Number(body.sequence||0);
  if(!date||!vehicleId||['정기점검','이상 증상','고장','사고','점검','운행불가','기타'].indexOf(type)===-1||!content) return {ok:false,error:'PARAM_REQUIRED',message:'날짜·차량·유형·상황 내용을 확인하세요.'};
  if(reserveId===vehicleId)return {ok:false,error:'SAME_VEHICLE',message:'예비차는 발생 차량과 달라야 합니다.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(), vs=ss.getSheetByName('차량DB'), is=ss.getSheetByName('사건DB'), ms=ss.getSheetByName('정비DB'), ps=ss.getSheetByName('배차DB'), cs=ss.getSheetByName('배차확인DB');
  if(!vs||!is||!ms||!ps)return {ok:false,error:'DB_MISSING',message:'돌발상황 처리 DB를 찾을 수 없습니다.'};
  const vr=vs.getDataRange().getDisplayValues(), vc=makeHeaderMap_(vr[0]); let vehicleRow=0,reserveRow=0;
  for(let i=1;i<vr.length;i++){const id=String(vr[i][vc['vehicleId']]||'');if(id===vehicleId)vehicleRow=i+1;if(id===reserveId)reserveRow=i+1;}
  if(!vehicleRow||(reserveId&&!reserveRow))return {ok:false,error:'VEHICLE_NOT_FOUND',message:'발생 차량 또는 예비차를 확인하세요.'};
  if(reserveId&&['운행가능','운행'].indexOf(String(vr[reserveRow-1][vc['상태']]||''))===-1)return {ok:false,error:'RESERVE_UNAVAILABLE',message:'운행 가능한 예비차만 투입할 수 있습니다.'};
  const existingMaintenance=ms.getDataRange().getDisplayValues(), existingColumns=makeHeaderMap_(existingMaintenance[0]);
  for(let openIndex=1;openIndex<existingMaintenance.length;openIndex++){
    if(String(existingMaintenance[openIndex][existingColumns['차량ID']]||'')===vehicleId&&String(existingMaintenance[openIndex][existingColumns['현재상태']]||'')!=='완료'){
      return {ok:false,error:'OPEN_MAINTENANCE_EXISTS',message:'이 차량에는 이미 미결 정비 요청이 있습니다. 기존 요청의 진행 상태를 먼저 확인하세요.'};
    }
  }
  let dispatchId='',driverId='';
  if(sequence){const pr=ps.getDataRange().getDisplayValues(),pc=makeHeaderMap_(pr[0]);let target=0,alreadyReplaced=false;for(let j=1;j<pr.length;j++){const assignedId=String(pr[j][pc['차량ID']]||'');if(normalizeDate_(pr[j][pc['날짜']])===date&&Number(pr[j][pc['순차']])===sequence&&(assignedId===vehicleId||(reserveId&&assignedId===reserveId))&&String(pr[j][pc['상태']]||'')==='확정'){target=j+1;alreadyReplaced=assignedId===reserveId;dispatchId=String(pr[j][pc['dispatchId']]||'');driverId=String(pr[j][pc['기사ID']]||'');break;}}if(!target)return {ok:false,error:'DISPATCH_NOT_FOUND',message:'선택 날짜·순차에서 발생 차량 또는 대체 차량의 확정 배차를 찾을 수 없습니다.'};if(driverRequest&&driverId!==requesterId)return {ok:false,error:'DRIVER_VEHICLE_MISMATCH',message:'본인에게 배차된 차량만 정비 요청할 수 있습니다.'};if(reserveId&&!alreadyReplaced){ps.getRange(target,pc['차량ID']+1).setValue(reserveId);ps.getRange(target,pc['확정시간']+1).setValue(new Date());ps.getRange(target,pc['비고']+1).setValue(type+' 대체차 투입');}if(reserveId&&cs&&cs.getLastRow()>1){const cr=cs.getDataRange().getDisplayValues(),cc=makeHeaderMap_(cr[0]);for(let k=1;k<cr.length;k++)if(String(cr[k][cc['dispatchId']]||'')===dispatchId)cs.getRange(k+1,cc['재확인필요']+1).setValue('Y');}}
  if(driverRequest&&!sequence){const pr=ps.getDataRange().getDisplayValues(),pc=makeHeaderMap_(pr[0]);for(let j=1;j<pr.length;j++)if(normalizeDate_(pr[j][pc['날짜']])===date&&String(pr[j][pc['기사ID']]||'')===requesterId&&String(pr[j][pc['차량ID']]||'')===vehicleId&&String(pr[j][pc['상태']]||'')==='확정'){driverId=requesterId;dispatchId=String(pr[j][pc['dispatchId']]||'');break;}if(!driverId)return {ok:false,error:'DRIVER_VEHICLE_MISMATCH',message:'선택 날짜에 본인에게 배차된 차량만 정비 요청할 수 있습니다.'};}
  if(['고장','사고','운행불가'].indexOf(type)!==-1)vs.getRange(vehicleRow,vc['상태']+1).setValue('정비중');
  bus70EnsureSheetColumns_(is,['요청자']);
  const incidentId=newId_('INC'), ir=is.getDataRange().getDisplayValues(),ic=makeHeaderMap_(ir[0]),irow=new Array(ir[0].length).fill('');
  irow[ic['incidentId']]=incidentId;irow[ic['접수시간']]=new Date();irow[ic['날짜']]=date;irow[ic['기사ID']]=driverId;irow[ic['차량ID']]=vehicleId;irow[ic['순차']]=sequence||'';irow[ic['유형']]=type;irow[ic['내용']]=content;irow[ic['상태']]='접수';irow[ic['요청자']]=requesterId;irow[ic['처리자']]=requesterId;irow[ic['비고']]=reserveId?'예비차 대체':'대체차 미정';is.appendRow(irow);
  const mr=ms.getDataRange().getDisplayValues(),mc=makeHeaderMap_(mr[0]),mrow=new Array(mr[0].length).fill('');mrow[mc['maintId']]=newId_('MNT');mrow[mc['incidentId']]=incidentId;mrow[mc['요청시간']]=new Date();mrow[mc['차량ID']]=vehicleId;mrow[mc['기사ID']]=driverId;mrow[mc['요청내용']]=content;mrow[mc['현재상태']]='접수';mrow[mc['예비차량ID']]=reserveId;ms.appendRow(mrow);
  writeAudit_(requesterId,requesterRole==='MASTER'?'마스터':requesterRole==='MANAGER'?'소장':requesterRole==='CENTER'?'정비소':'기사','사건DB',incidentId,'추가',{},irow,type+' 현장대응');
  return {ok:true,message:type+' 상황을 접수했습니다.'+(reserveId&&sequence?' '+sequence+'순차를 예비차로 변경했습니다.':'')};
}

function bus70MaintenanceUpdate_(body, requesterId) {
  const role=bus70RoleFor_(requesterId);
  if(role!=='CENTER'&&role!=='MASTER')return {ok:false,error:'CENTER_REQUIRED',message:'정비 과정과 결과는 정비소 Center에서 처리합니다.'};
  const maintId=String(body.maintId||'').trim(), status=String(body.status||'').trim(), result=String(body.result||'').trim(), note=String(body.note||'').trim(), completedDate=bus70ManagerDateKey_(body.completedDate), availableDate=bus70ManagerDateKey_(body.availableDate);
  if(!maintId||['접수','정비중','완료','운행불가'].indexOf(status)===-1)return {ok:false,error:'PARAM_REQUIRED',message:'정비 건과 처리 상태를 확인하세요.'};
  if(status==='완료'&&!result)return {ok:false,error:'MAINTENANCE_RESULT_REQUIRED',message:'완료 처리하려면 정비 결과를 입력하세요.'};
  if(status==='완료'&&(!completedDate||!availableDate||availableDate<completedDate))return {ok:false,error:'MAINTENANCE_DATES_REQUIRED',message:'정비 완료일과 운행 가능일을 확인하세요. 운행 가능일은 완료일보다 빠를 수 없습니다.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(),ms=ss.getSheetByName('정비DB'),hs=ss.getSheetByName('정비이력DB'),is=ss.getSheetByName('사건DB'),vs=ss.getSheetByName('차량DB');if(!ms||!hs||!is||!vs)return {ok:false,error:'DB_MISSING',message:'정비 처리 DB를 찾을 수 없습니다.'};
  bus70EnsureSheetColumns_(ms,['정비완료일','운행가능일']);
  const mr=ms.getDataRange().getDisplayValues(),mc=makeHeaderMap_(mr[0]);let rowNo=0;for(let i=1;i<mr.length;i++)if(String(mr[i][mc['maintId']]||'')===maintId){rowNo=i+1;break;}if(!rowNo)return {ok:false,error:'MAINT_NOT_FOUND',message:'정비 요청을 찾을 수 없습니다.'};
  const incidentId=String(mr[rowNo-1][mc['incidentId']]||''),vehicleId=String(mr[rowNo-1][mc['차량ID']]||'');ms.getRange(rowNo,mc['현재상태']+1).setValue(status);ms.getRange(rowNo,mc['정비결과']+1).setValue(result);ms.getRange(rowNo,mc['비고']+1).setValue(note);if(status==='정비중'&&!mr[rowNo-1][mc['입고시간']])ms.getRange(rowNo,mc['입고시간']+1).setValue(new Date());if(status==='완료'){ms.getRange(rowNo,mc['출고시간']+1).setValue(new Date());ms.getRange(rowNo,mc['정비완료일']+1).setValue(completedDate);ms.getRange(rowNo,mc['운행가능일']+1).setValue(availableDate);}
  const ir=is.getDataRange().getDisplayValues(),ic=makeHeaderMap_(ir[0]);for(let j=1;j<ir.length;j++)if(String(ir[j][ic['incidentId']]||'')===incidentId){is.getRange(j+1,ic['상태']+1).setValue(status==='완료'?'종결':status);is.getRange(j+1,ic['처리자']+1).setValue(requesterId);if(status==='완료')is.getRange(j+1,ic['종결시간']+1).setValue(new Date());break;}
  const vr=vs.getDataRange().getDisplayValues(),vc=makeHeaderMap_(vr[0]);for(let k=1;k<vr.length;k++)if(String(vr[k][vc['vehicleId']]||'')===vehicleId){if(status==='완료')vs.getRange(k+1,vc['상태']+1).setValue('운행가능');else if(status==='운행불가')vs.getRange(k+1,vc['상태']+1).setValue('운행불가');else if(status==='정비중')vs.getRange(k+1,vc['상태']+1).setValue('정비중');break;}
  const hr=hs.getDataRange().getDisplayValues(),hc=makeHeaderMap_(hr[0]),hrow=new Array(hr[0].length).fill('');hrow[hc['historyId']]=newId_('MNH');hrow[hc['maintId']]=maintId;hrow[hc['처리시간']]=new Date();hrow[hc['상태']]=status;hrow[hc['처리자']]=requesterId;hrow[hc['내용']]=result;hrow[hc['예비차량ID']]=String(mr[rowNo-1][mc['예비차량ID']]||'');hrow[hc['비고']]=note;hs.appendRow(hrow);
  return {ok:true,message:'정비 상태를 '+status+'로 저장했습니다.'+(status==='완료'?' '+availableDate+'부터 운행 가능합니다.':'')};
}

function bus70IsKnownDriver_(driverId) {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('기사DB');if(!sheet||sheet.getLastRow()<2)return false;
  const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]);
  for(let i=1;i<rows.length;i++)if(String(rows[i][c['driverId']]||'')===String(driverId||'')&&String(rows[i][c['상태']]||'')!=='퇴직')return true;
  return false;
}

function bus70EnsureSheetColumns_(sheet, required) {
  const rows=sheet.getDataRange().getDisplayValues(), headers=(rows[0]||[]).slice(), existing={};
  headers.forEach(function(v){if(v)existing[String(v)]=true;});
  required.forEach(function(header){if(!existing[header]){headers.push(header);sheet.getRange(1,headers.length).setValue(header);existing[header]=true;}});
}

function bus70MasterAdminBootstrap_(requesterId) {
  if (!bus70IsManager_(requesterId)) return {ok:false,error:'MANAGER_REQUIRED',message:'소장 이상 권한이 필요합니다.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(), ds=ss.getSheetByName('기사DB'), as=ss.getSheetByName('계정DB');
  if(!ds||!as) return {ok:false,error:'DB_MISSING',message:'기사DB 또는 계정DB를 찾을 수 없습니다.'};
  bus70ApplyDueDriverTransitions_(ds, ss.getSheetByName('근무변경DB'));
  const dr=ds.getDataRange().getDisplayValues(), dc=makeHeaderMap_(dr[0]);
  const drivers=dr.slice(1).map(function(r){return {driverId:String(r[dc['driverId']]||''),empId:String(r[dc['사원번호']]||''),name:String(r[dc['성명']]||''),shift:String(r[dc['근무조']]||''),driverType:String(r[dc['기사구분']]||''),route:String(r[dc['현재노선']]||''),status:String(r[dc['상태']]||''),test:String(r[dc['TEST']]||'')};})
    .filter(function(v){return v.driverId&&['마스터','소장','관리','정비','정비소'].indexOf(v.driverType)===-1;});
  let accounts=[];
  if(bus70IsMaster_(requesterId)) {
    const ar=as.getDataRange().getDisplayValues(), ac=makeHeaderMap_(ar[0]);
    accounts=ar.slice(1).map(function(r){return {accountId:String(r[ac['accountId']]||''),role:String(r[ac['권한']]||''),driverId:String(r[ac['driverId']]||''),loginName:String(r[ac['로그인이름']]||''),enabled:String(r[ac['사용여부']]||'Y')};})
      .filter(function(v){return v.role==='소장'||v.role==='관리자'||v.role==='정비소';});
  }
  const ws=ss.getSheetByName('근무변경DB'), names={}; drivers.forEach(function(v){names[v.driverId]=v.name;});
  let workChanges=[];
  if(ws&&ws.getLastRow()>1){bus70EnsureSheetColumns_(ws,['변경전노선','변경노선','변경전근무조','변경근무조','이전사원번호','새사원번호','변경전기사구분','변경기사구분']);const wr=ws.getDataRange().getDisplayValues(), wc=makeHeaderMap_(wr[0]); workChanges=wr.slice(1).map(function(r){return {changeId:String(r[wc['changeId']]||''),date:normalizeDate_(r[wc['날짜']]),driverId:String(r[wc['기사ID']]||''),driverName:names[String(r[wc['기사ID']]||'')]||'',type:String(r[wc['유형']]||''),sequence:Number(r[wc['적용순차']]||0),replacementId:String(r[wc['대체기사ID']]||''),replacementName:names[String(r[wc['대체기사ID']]||'')]||'',previousRoute:String(r[wc['변경전노선']]||''),newRoute:String(r[wc['변경노선']]||''),previousShift:String(r[wc['변경전근무조']]||''),newShift:String(r[wc['변경근무조']]||''),previousEmpId:String(r[wc['이전사원번호']]||''),newEmpId:String(r[wc['새사원번호']]||''),previousDriverType:String(r[wc['변경전기사구분']]||''),newDriverType:String(r[wc['변경기사구분']]||''),reason:String(r[wc['사유']]||'')};}).filter(function(v){return v.changeId;}).reverse();}
  return {ok:true,drivers:drivers,accounts:accounts,workChanges:workChanges,canManageAccounts:bus70IsMaster_(requesterId)};
}

function bus70WorkChangeSave_(body, requesterId) {
  if(!bus70IsManager_(requesterId)) return {ok:false,error:'MANAGER_REQUIRED',message:'소장 이상 권한이 필요합니다.'};
  const date=normalizeDate_(body.date), driverId=String(body.driverId||'').trim(), type=String(body.type||'').trim();
  const sequence=Number(body.sequence||0), replacementId=String(body.replacementId||'').trim(); let reason=String(body.reason||'').trim();
  if(!date||!driverId||['휴무','병가','지각','조퇴','결근','퇴직','복귀','재입사','노선이동','기타'].indexOf(type)===-1) return {ok:false,error:'PARAM_REQUIRED',message:'날짜·기사·발생유형을 확인하세요.'};
  if(replacementId===driverId) return {ok:false,error:'SAME_DRIVER',message:'대체기사는 기존 기사와 달라야 합니다.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(), ds=ss.getSheetByName('기사DB'), ws=ss.getSheetByName('근무변경DB'), ps=ss.getSheetByName('배차DB'), cs=ss.getSheetByName('배차확인DB');
  if(!ds||!ws||!ps) return {ok:false,error:'DB_MISSING',message:'근무변경 처리 DB를 찾을 수 없습니다.'};
  const dr=ds.getDataRange().getDisplayValues(), dc=makeHeaderMap_(dr[0]); let driverRow=0, replacementRow=0;
  for(let i=1;i<dr.length;i++){const id=String(dr[i][dc['driverId']]||''); if(id===driverId)driverRow=i+1; if(id===replacementId)replacementRow=i+1;}
  if(!driverRow||(replacementId&&!replacementRow)) return {ok:false,error:'DRIVER_NOT_FOUND',message:'기사 정보를 확인하세요.'};
  const currentState=bus70PersistentWorkState_(ws,driverId,date);
  if(type==='복귀'&&currentState!=='병가') return {ok:false,error:'RETURN_STATE_MISMATCH',message:'현재 병가 중인 기사만 복귀 처리할 수 있습니다.'};
  if(type==='재입사'&&currentState!=='퇴직') return {ok:false,error:'REHIRE_STATE_MISMATCH',message:'퇴직 처리된 기사만 재입사 처리할 수 있습니다.'};
  let rehireEmpId='',rehireShift='',rehireRoute='',rehirePrevious={empId:'',shift:'',route:'',driverType:''};
  if(type==='재입사'){
    rehirePrevious={empId:String(dr[driverRow-1][dc['사원번호']]||''),shift:String(dr[driverRow-1][dc['근무조']]||''),route:String(dr[driverRow-1][dc['현재노선']]||''),driverType:String(dr[driverRow-1][dc['기사구분']]||'')};
    rehireEmpId=String(body.rehireEmpId||dr[driverRow-1][dc['사원번호']]||'').replace(/\D/g,'');
    rehireShift=String(body.rehireShift||dr[driverRow-1][dc['근무조']]||'').trim();
    rehireRoute=String(body.rehireRoute||dr[driverRow-1][dc['현재노선']]||'').trim();
    if(!/^\d{6}$/.test(rehireEmpId)||['A','B','예비'].indexOf(rehireShift)===-1||!rehireRoute||rehireRoute.length>10) return {ok:false,error:'REHIRE_INFO_REQUIRED',message:'재입사 사원번호·근무조·노선을 확인하세요.'};
    for(let r=1;r<dr.length;r++)if(r+1!==driverRow&&String(dr[r][dc['사원번호']]||'')===rehireEmpId)return {ok:false,error:'EMP_ID_DUPLICATE',message:'이미 사용 중인 사원번호입니다.'};
  }
  if(replacementId&&String(dr[replacementRow-1][dc['상태']]||'')!=='재직') return {ok:false,error:'REPLACEMENT_UNAVAILABLE',message:'재직 중인 기사만 대체 투입할 수 있습니다.'};
  const driverShift=String(dr[driverRow-1][dc['근무조']]||'').trim(), driverRoute=String(dr[driverRow-1][dc['현재노선']]||'').trim();
  const newRoute=String(body.newRoute||'').trim(), newShift=String(body.newShift||driverShift).trim(), newEmpId=String(body.newEmpId||'').replace(/\D/g,''), newDriverType=String(body.newDriverType||'').trim();
  if(type==='노선이동'&&(!newRoute||newRoute.length>10||['A','B','예비'].indexOf(newShift)===-1)) return {ok:false,error:'TRANSFER_INFO_REQUIRED',message:'이동할 노선과 근무조를 확인하세요.'};
  if(type==='노선이동'&&newEmpId&&!/^4\d{5}$/.test(newEmpId)) return {ok:false,error:'REGULAR_EMP_ID_REQUIRED',message:'정규 전환 사원번호는 4로 시작하는 6자리 번호를 입력하세요.'};
  if(type==='노선이동'&&newEmpId){for(let r=1;r<dr.length;r++)if(r+1!==driverRow&&String(dr[r][dc['사원번호']]||'')===newEmpId)return {ok:false,error:'EMP_ID_DUPLICATE',message:'이미 사용 중인 사원번호입니다.'};}
  const replacementShift=replacementId?String(dr[replacementRow-1][dc['근무조']]||'').trim():'', replacementRoute=replacementId?String(dr[replacementRow-1][dc['현재노선']]||'').trim():'';
  if(replacementId&&replacementRoute!==driverRoute&&body.crossRouteReplacement!==true)return {ok:false,error:'CROSS_ROUTE_REPLACEMENT_REQUIRED',message:'다른 노선 대체기사는 대체기사 범위를 변경하고 사유를 입력하세요.'};
  if(replacementId&&(replacementShift!==driverShift||replacementRoute!==driverRoute)&&!reason) return {ok:false,error:'REPLACEMENT_OVERRIDE_REASON_REQUIRED',message:'다른 조 또는 다른 노선 기사를 투입할 때는 사유·현장 메모를 입력하세요.'};
  let dispatchChanged=false, dispatchId='';
  if(sequence||replacementId){
    if(!sequence||!replacementId) return {ok:false,error:'REPLACEMENT_INCOMPLETE',message:'대체 투입 시 순차와 대체기사를 모두 선택하세요.'};
    const pr=ps.getDataRange().getDisplayValues(), pc=makeHeaderMap_(pr[0]); let target=0,sameSequenceFound=false;
    for(let j=1;j<pr.length;j++){
      if(normalizeDate_(pr[j][pc['날짜']])!==date||Number(pr[j][pc['순차']])!==sequence||String(pr[j][pc['상태']]||'')!=='확정') continue;
      sameSequenceFound=true;
      if(String(pr[j][pc['기사ID']]||'')!==driverId) continue;
      target=j+1; dispatchId=String(pr[j][pc['dispatchId']]||''); break;
    }
    if(!target) return {ok:false,error:sameSequenceFound?'DISPATCH_DRIVER_MISMATCH':'DISPATCH_NOT_FOUND',message:sameSequenceFound?'선택 날짜·순차의 확정 배차에서 대상 기사를 찾을 수 없습니다. 노선과 기사를 다시 확인하세요.':'선택 날짜·순차의 확정 배차를 찾을 수 없습니다.'};
    for(let j=1;j<pr.length;j++) if(normalizeDate_(pr[j][pc['날짜']])===date&&String(pr[j][pc['기사ID']]||'')===replacementId&&j+1!==target&&String(pr[j][pc['상태']]||'')==='확정') return {ok:false,error:'REPLACEMENT_DUPLICATE',message:'대체기사가 같은 날짜 다른 순차에 이미 배정되었습니다.'};
    ps.getRange(target,pc['기사ID']+1).setValue(replacementId); ps.getRange(target,pc['확정시간']+1).setValue(new Date()); ps.getRange(target,pc['비고']+1).setValue(type+' 대체투입'); dispatchChanged=true;
    if(cs&&cs.getLastRow()>1){const cr=cs.getDataRange().getDisplayValues(), cc=makeHeaderMap_(cr[0]); for(let k=1;k<cr.length;k++) if(String(cr[k][cc['dispatchId']]||'')===dispatchId) cs.getRange(k+1,cc['재확인필요']+1).setValue('Y');}
  }
  if(type==='퇴직'||type==='복귀'||type==='재입사'){
    const row=dr[driverRow-1].slice(); row[dc['상태']]=type==='퇴직'?'퇴직':'재직';
    if(type==='퇴직')row[dc['종료일']]=date;
    if(type==='재입사'){
      const previous=[String(row[dc['사원번호']]||''),String(row[dc['근무조']]||''),String(row[dc['현재노선']]||'')];
      row[dc['사원번호']]=rehireEmpId;row[dc['근무조']]=rehireShift;row[dc['현재노선']]=rehireRoute;row[dc['투입일']]=date;row[dc['종료일']]='';
      const changeNote='재입사 정보 '+previous[0]+'/'+previous[1]+'조/'+previous[2]+'번 → '+rehireEmpId+'/'+rehireShift+'조/'+rehireRoute+'번';
      reason=reason?reason+' · '+changeNote:changeNote;
    }
    ds.getRange(driverRow,1,1,row.length).setValues([row]);
  }
  bus70EnsureSheetColumns_(ws,['변경전노선','변경노선','변경전근무조','변경근무조','이전사원번호','새사원번호','변경전기사구분','변경기사구분']);
  const wr=ws.getDataRange().getDisplayValues(), wc=makeHeaderMap_(wr[0]), row=new Array(wr[0].length).fill('');
  row[wc['changeId']]=newId_('WORK'); row[wc['날짜']]=date; row[wc['기사ID']]=driverId; row[wc['유형']]=type; row[wc['적용순차']]=sequence||''; row[wc['대체기사ID']]=replacementId; row[wc['시작시간']]=String(body.startTime||''); row[wc['종료시간']]=String(body.endTime||''); row[wc['사유']]=reason; row[wc['처리자']]=requesterId; row[wc['처리시간']]=new Date();
  if(type==='노선이동'){row[wc['변경전노선']]=driverRoute;row[wc['변경노선']]=newRoute;row[wc['변경전근무조']]=driverShift;row[wc['변경근무조']]=newShift;row[wc['이전사원번호']]=String(dr[driverRow-1][dc['사원번호']]||'');row[wc['새사원번호']]=newEmpId;row[wc['변경전기사구분']]=String(dr[driverRow-1][dc['기사구분']]||'');row[wc['변경기사구분']]=newDriverType||(newEmpId?'노선':'');}
  if(type==='재입사'){row[wc['변경전노선']]=rehirePrevious.route;row[wc['변경노선']]=rehireRoute;row[wc['변경전근무조']]=rehirePrevious.shift;row[wc['변경근무조']]=rehireShift;row[wc['이전사원번호']]=rehirePrevious.empId;row[wc['새사원번호']]=rehireEmpId;row[wc['변경전기사구분']]=rehirePrevious.driverType;row[wc['변경기사구분']]=String(dr[driverRow-1][dc['기사구분']]||rehirePrevious.driverType);}
  ws.appendRow(row);
  writeAudit_(requesterId,bus70IsMaster_(requesterId)?'마스터':'소장','근무변경DB',row[wc['changeId']],'추가',{},row,type+' 현장대응');
  return {ok:true,message:type+' 처리를 저장했습니다.'+(type==='노선이동'?' '+date+'부터 '+newRoute+'번 '+newShift+'조로 적용됩니다.':'')+(dispatchChanged?' '+sequence+'순차 대체기사 배차도 변경했습니다.':'')};
}

function bus70PersistentWorkState_(workSheet,driverId,date) {
  if(!workSheet||workSheet.getLastRow()<2)return '';
  const rows=workSheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]); let state='';
  rows.slice(1).map(function(r,index){return {r:r,index:index,date:bus70ManagerDateKey_(r[c['날짜']])};})
    .filter(function(v){return v.date&&v.date<=date&&String(v.r[c['기사ID']]||'')===driverId;})
    .sort(function(a,b){return a.date.localeCompare(b.date)||a.index-b.index;})
    .forEach(function(v){const type=String(v.r[c['유형']]||'');if(type==='병가'||type==='퇴직')state=type;else if(type==='복귀'||type==='재입사')state='';});
  return state;
}

function bus70MasterStaffUpsert_(body, requesterId) {
  if (!bus70IsMaster_(requesterId)) return {ok:false,error:'MASTER_REQUIRED',message:'마스터 권한이 필요합니다.'};
  const role=String(body.role||''), loginName=String(body.loginName||'').trim(), password=String(body.password||''), enabled=body.enabled===false?'N':'Y';
  if(['소장','정비소'].indexOf(role)===-1||!loginName) return {ok:false,error:'PARAM_REQUIRED',message:'권한과 계정명을 확인하세요.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(), ds=ss.getSheetByName('기사DB'), as=ss.getSheetByName('계정DB');
  if(!ds||!as) return {ok:false,error:'DB_MISSING',message:'기사DB 또는 계정DB를 찾을 수 없습니다.'};
  const driverId=String(body.driverId||((role==='정비소'?'CTR-':'MGR-')+Utilities.getUuid().slice(0,8))).trim();
  const dr=ds.getDataRange().getDisplayValues(), dc=makeHeaderMap_(dr[0]); let driverRow=0;
  for(let i=1;i<dr.length;i++) if(String(dr[i][dc['driverId']]||'')===driverId){driverRow=i+1;break;}
  const drow=driverRow?dr[driverRow-1].slice():new Array(dr[0].length).fill('');
  drow[dc['driverId']]=driverId; drow[dc['사원번호']]=String(drow[dc['사원번호']]||''); drow[dc['성명']]=loginName; drow[dc['기사구분']]=role==='정비소'?'정비':'관리'; drow[dc['현재노선']]=String(drow[dc['현재노선']]||''); drow[dc['표시순서']]=999; drow[dc['상태']]=enabled==='Y'?'재직':'종료'; drow[dc['TEST']]='Y'; drow[dc['비고']]='마스터 운영계정 관리';
  if(driverRow) ds.getRange(driverRow,1,1,drow.length).setValues([drow]); else ds.appendRow(drow);
  const ar=as.getDataRange().getDisplayValues(), ac=makeHeaderMap_(ar[0]); let accountRow=0;
  for(let j=1;j<ar.length;j++) if(String(ar[j][ac['driverId']]||'')===driverId){accountRow=j+1;break;}
  if(!accountRow && password.length<5) return {ok:false,error:'PASSWORD_REQUIRED',message:'새 계정 비밀번호를 5자 이상 입력하세요.'};
  const arow=accountRow?ar[accountRow-1].slice():new Array(ar[0].length).fill('');
  arow[ac['accountId']]=accountRow?String(ar[accountRow-1][ac['accountId']]||''):newId_('ACC'); arow[ac['권한']]=role; arow[ac['driverId']]=driverId; arow[ac['로그인이름']]=loginName; arow[ac['로그인사번']]=''; arow[ac['사용여부']]=enabled; arow[ac['비고']]='마스터 계정관리';
  if(password){ if(password.length<5||password.length>20) return {ok:false,error:'PASSWORD_FORMAT',message:'비밀번호는 5~20자로 입력하세요.'}; arow[ac['비밀번호해시']]=bus70PasswordHash_(password); arow[ac['비밀번호변경시간']]=new Date(); }
  if(accountRow) as.getRange(accountRow,1,1,arow.length).setValues([arow]); else as.appendRow(arow);
  writeAudit_(requesterId,'마스터','계정DB',arow[ac['accountId']],accountRow?'수정':'추가',{},arow,'운영계정 관리');
  return {ok:true,message:role+' 계정을 저장했습니다.'};
}

function bus70MasterDriverUpsert_(body, requesterId) {
  if (!bus70IsManager_(requesterId)) return {ok:false,error:'MANAGER_REQUIRED',message:'소장 이상 권한이 필요합니다.'};
  let driverId=String(body.driverId||'').trim(); const empId=String(body.empId||'').replace(/\D/g,''), name=String(body.name||'').trim(), shift=String(body.shift||'').toUpperCase(), route=String(body.route||'70').trim(), driverType=String(body.driverType||'').trim(), status=String(body.status||'').trim();
  if(!/^\d{6}$/.test(empId)||!name||!route||route.length>10||['A','B','예비'].indexOf(shift)===-1||['양성','예비','노선'].indexOf(driverType)===-1||['재직','휴무','병가','퇴직'].indexOf(status)===-1) return {ok:false,error:'PARAM_REQUIRED',message:'기사 정보를 모두 확인하세요.'};
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('기사DB');
  if(!sheet) return {ok:false,error:'DB_MISSING',message:'기사DB를 찾을 수 없습니다.'};
  const rows=sheet.getDataRange().getDisplayValues(), c=makeHeaderMap_(rows[0]); let rowNo=0;
  for(let i=1;i<rows.length;i++) if(String(rows[i][c['driverId']]||'')===driverId){rowNo=i+1;break;}
  if(driverId&&!rowNo) return {ok:false,error:'DRIVER_NOT_FOUND',message:'수정할 기사를 찾을 수 없습니다.'};
  for(let j=1;j<rows.length;j++) if(j+1!==rowNo&&String(rows[j][c['사원번호']]||'')===empId) return {ok:false,error:'EMP_ID_DUPLICATE',message:'이미 사용 중인 사원번호입니다.'};
  const before=rowNo?rows[rowNo-1].slice():[], row=rowNo?before.slice():new Array(rows[0].length).fill('');
  if(!driverId)driverId=newId_('DRV');
  row[c['driverId']]=driverId; row[c['사원번호']]=empId; row[c['성명']]=name; row[c['근무조']]=shift; row[c['기사구분']]=driverType; row[c['사번구분']]='정규'; row[c['현재노선']]=route; row[c['표시순서']]=row[c['표시순서']]||999; row[c['상태']]=status; row[c['TEST']]='N'; row[c['비고']]=rowNo?'기사정보 수정':'신규 기사 등록';
  if(rowNo)sheet.getRange(rowNo,1,1,row.length).setValues([row]);else sheet.appendRow(row);
  writeAudit_(requesterId,bus70IsMaster_(requesterId)?'마스터':'소장','기사DB',driverId,rowNo?'수정':'추가',before,row,'기사 등록·수정');
  return {ok:true,driverId:driverId,message:name+' 기사 정보를 '+(rowNo?'수정':'등록')+'했습니다.'};
}

function bus70IsManager_(driverId) {
  const role = bus70RoleFor_(driverId);
  return role === 'MASTER' || role === 'MANAGER';
}

function bus70IsMaster_(driverId) {
  return bus70RoleFor_(driverId) === 'MASTER';
}

// Permission source is read once per execution; reset at every authenticated request.
var BUS70_ROLE_READ_=null;
function bus70RoleFor_(driverId) {
  const id = String(driverId || '').trim();
  if (!id) return '';
  // 현장 기사 계정에는 운영계정 권한을 함께 부여하지 않는다.
  // 이전 시험 데이터에 남은 마스터 행이 있어도 기사 권한으로 고정한다.
  if(!BUS70_ROLE_READ_){
    const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('계정DB');
    BUS70_ROLE_READ_={driverOnly:typeof bus70PrivateDriverOnlyIds_==='function'?bus70PrivateDriverOnlyIds_():[],configured:String(PropertiesService.getScriptProperties().getProperty('BUS70_MANAGER_DRIVER_IDS')||'').split(',').map(function(v){return v.trim();}).filter(Boolean),rows:sheet&&sheet.getLastRow()>1?sheet.getDataRange().getDisplayValues():[]};
  }
  const driverOnlyIds=BUS70_ROLE_READ_.driverOnly;
  if(driverOnlyIds.indexOf(id)!==-1)return '';
  if(BUS70_ROLE_READ_.configured.indexOf(id)!==-1)return 'MANAGER';
  const rows=BUS70_ROLE_READ_.rows;if(!rows.length)return '';
  const c = makeHeaderMap_(rows[0]);
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][c['driverId']] || '').trim() !== id) continue;
    const role = String(rows[i][c['권한']] || '').trim();
    const enabled = String(rows[i][c['사용여부']] || '').trim();
    if (enabled === 'N') return '';
    if (role === '마스터') return 'MASTER';
    if (role === '소장' || role === '관리자') return 'MANAGER';
    if (role === '정비소') return 'CENTER';
    return '';
  }
  return '';
}

function bus70EnsureInitialAccounts_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('BUS70_ROLE_ACCOUNTS_V3') === 'Y') return;
  const bootstrapAccounts=typeof bus70PrivateBootstrapAccounts_==='function'?bus70PrivateBootstrapAccounts_():[];
  if(!bootstrapAccounts.length)return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const driverSheet = ss.getSheetByName('기사DB');
  const accountSheet = ss.getSheetByName('계정DB');
  if (!driverSheet || !accountSheet) return;
  const driverRows = driverSheet.getDataRange().getDisplayValues();
  const dc = makeHeaderMap_(driverRows[0]);
  function addPrincipal(driverId, loginName, driverType, route, note) {
    if (driverRows.slice(1).some(function (r) { return String(r[dc['driverId']] || '').trim() === driverId; })) return;
    driverSheet.appendRow([driverId,'',loginName,'',driverType,'계정','',route,999,'재직','','','Y',note]);
  }
  bootstrapAccounts.forEach(function(account){addPrincipal(account.driverId,account.loginName,account.role==='마스터'?'마스터':account.role==='정비소'?'정비':'관리',account.route,account.note);});
  let accountRows = accountSheet.getDataRange().getDisplayValues();
  const headers = accountRows[0], required = ['비밀번호해시','비밀번호변경시간'];
  required.forEach(function (header) { if (headers.indexOf(header) === -1) { headers.push(header); accountSheet.getRange(1,headers.length).setValue(header); } });
  accountRows = accountSheet.getDataRange().getDisplayValues();
  const ac = makeHeaderMap_(accountRows[0]);
  // 시험 단계에서 현장 기사에게 임시 부여했던 운영권한을 제거한다.
  const driverOnlyIds=typeof bus70PrivateDriverOnlyIds_==='function'?bus70PrivateDriverOnlyIds_():[];
  for (let i=1;i<accountRows.length;i++) {
    if (driverOnlyIds.indexOf(String(accountRows[i][ac['driverId']]||'').trim())===-1) continue;
    if (String(accountRows[i][ac['권한']]||'').trim() !== '마스터') continue;
    accountSheet.getRange(i+1,ac['권한']+1).setValue('기사');
  }
  function upsertAccount(accountId, role, targetDriverId, loginName, initialPassword, note) {
    let rowNo = 0;
    for (let i=1;i<accountRows.length;i++) if (String(accountRows[i][ac['driverId']]||'').trim()===targetDriverId) { rowNo=i+1; break; }
    const hash = bus70PasswordHash_(initialPassword);
    if (rowNo) {
      const row = accountRows[rowNo-1].slice();
      row[ac['권한']]=role; row[ac['로그인이름']]=loginName; row[ac['로그인사번']]=''; row[ac['사용여부']]='Y';
      if (!String(row[ac['비밀번호해시']]||'')) { row[ac['비밀번호해시']]=hash; row[ac['비밀번호변경시간']]=new Date(); }
      accountSheet.getRange(rowNo,1,1,accountRows[0].length).setValues([row]);
    } else {
      const row = new Array(accountRows[0].length).fill('');
      row[ac['accountId']]=accountId; row[ac['권한']]=role; row[ac['driverId']]=targetDriverId; row[ac['로그인이름']]=loginName;
      row[ac['사용여부']]='Y'; row[ac['비밀번호해시']]=hash; row[ac['비밀번호변경시간']]=new Date(); row[ac['비고']]=note;
      accountSheet.appendRow(row);
    }
  }
  bootstrapAccounts.forEach(function(account){upsertAccount(account.accountId,account.role,account.driverId,account.loginName,account.initialPassword,account.note);});
  props.setProperty('BUS70_ROLE_ACCOUNTS_V3','Y');
}

function bus70PasswordHash_(password) {
  const props = PropertiesService.getScriptProperties();
  let salt = props.getProperty('BUS70_PASSWORD_SALT');
  if (!salt) { salt = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('BUS70_PASSWORD_SALT',salt); }
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,salt+'|'+String(password||''))
    .map(function (b) { return ('0'+(b&255).toString(16)).slice(-2); }).join('');
}

function bus70StaffLogin_(name, password) {
  name=String(name||'').trim(); password=String(password||'');
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('계정DB');
  if(!sheet||sheet.getLastRow()<2) return {ok:false,error:'STAFF_NOT_FOUND'};
  const rows=sheet.getDataRange().getDisplayValues(), c=makeHeaderMap_(rows[0]);
  for(let i=1;i<rows.length;i++) {
    if(String(rows[i][c['로그인이름']]||'').trim()!==name) continue;
    const role=String(rows[i][c['권한']]||'').trim();
    if(['마스터','소장','관리자','정비소'].indexOf(role)===-1) return {ok:false,error:'STAFF_NOT_FOUND'};
    if(String(rows[i][c['사용여부']]||'').trim()==='N') return {ok:false,error:'ACCOUNT_DISABLED',message:'사용 중지된 계정입니다.'};
    if(String(rows[i][c['비밀번호해시']]||'')!==bus70PasswordHash_(password)) return {ok:false,error:'LOGIN_FAILED',message:'계정명 또는 비밀번호가 일치하지 않습니다.'};
    const result=apiGetDriver_(String(rows[i][c['driverId']]||'').trim());
    if(!result.ok) return {ok:false,error:'ACCOUNT_PRINCIPAL_MISSING',message:'계정 정보를 확인할 수 없습니다.'};
    return {ok:true,message:'로그인 성공',driver:result.driver};
  }
  return {ok:false,error:'STAFF_NOT_FOUND'};
}

function bus70ChangeStaffPassword_(body, driverId) {
  const role=bus70RoleFor_(driverId);
  if(!role) return {ok:false,error:'STAFF_REQUIRED',message:'운영 계정만 비밀번호를 변경할 수 있습니다.'};
  const current=String(body.currentPassword||''), next=String(body.newPassword||'');
  if(next.length<5||next.length>20) return {ok:false,error:'PASSWORD_FORMAT',message:'새 비밀번호는 5~20자로 입력하세요.'};
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('계정DB');
  const rows=sheet.getDataRange().getDisplayValues(), c=makeHeaderMap_(rows[0]);
  for(let i=1;i<rows.length;i++) if(String(rows[i][c['driverId']]||'').trim()===driverId) {
    if(String(rows[i][c['비밀번호해시']]||'')!==bus70PasswordHash_(current)) return {ok:false,error:'PASSWORD_MISMATCH',message:'현재 비밀번호가 일치하지 않습니다.'};
    sheet.getRange(i+1,c['비밀번호해시']+1).setValue(bus70PasswordHash_(next));
    sheet.getRange(i+1,c['비밀번호변경시간']+1).setValue(new Date());
    return {ok:true,message:'비밀번호를 변경했습니다. 다음 로그인부터 새 비밀번호를 사용하세요.'};
  }
  return {ok:false,error:'ACCOUNT_NOT_FOUND',message:'계정을 찾을 수 없습니다.'};
}

function bus70ManagerAccountList_(requesterId) {
  if (!bus70IsMaster_(requesterId)) return {ok:false,error:'MASTER_REQUIRED',message:'마스터 권한이 필요합니다.'};
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('계정DB');
  if (!sheet) return {ok:false,error:'DB_MISSING',message:'계정DB를 찾을 수 없습니다.'};
  const rows = sheet.getDataRange().getDisplayValues(), c = makeHeaderMap_(rows[0]);
  const accounts = rows.slice(1).map(function (r) { return {accountId:String(r[c['accountId']]||''),role:String(r[c['권한']]||''),
    driverId:String(r[c['driverId']]||''),name:String(r[c['로그인이름']]||''),empId:String(r[c['로그인사번']]||''),enabled:String(r[c['사용여부']]||'')}; });
  return {ok:true,accounts:accounts};
}

function bus70ManagerAccountUpsert_(body, requesterId) {
  if (!bus70IsMaster_(requesterId)) return {ok:false,error:'MASTER_REQUIRED',message:'마스터 권한이 필요합니다.'};
  const role = String(body.role || '').trim(), name = String(body.name || '').trim(), empId = String(body.empId || '').replace(/\D/g,'');
  const enabled = body.enabled === false ? 'N' : 'Y';
  if ((role !== '소장' && role !== '관리자') || !name || !/^\d{6}$/.test(empId)) {
    return {ok:false,error:'PARAM_REQUIRED',message:'소장 이름과 6자리 사원번호를 확인하세요.'};
  }
  const ss=SpreadsheetApp.getActiveSpreadsheet(), ds=ss.getSheetByName('기사DB'), as=ss.getSheetByName('계정DB');
  if(!ds||!as) return {ok:false,error:'DB_MISSING',message:'기사DB 또는 계정DB를 찾을 수 없습니다.'};
  const driverId=String(body.driverId||('MGR-'+empId)).trim();
  const dr=ds.getDataRange().getDisplayValues(), dc=makeHeaderMap_(dr[0]); let driverRow=0;
  for(let i=1;i<dr.length;i++) if(String(dr[i][dc['driverId']]||'').trim()===driverId){driverRow=i+1;break;}
  const driverValues=[driverId,empId,name,'','관리','계정','','70',999,enabled==='Y'?'재직':'종료','','','Y','소장 계정'];
  if(driverRow) ds.getRange(driverRow,1,1,driverValues.length).setValues([driverValues]); else ds.appendRow(driverValues);
  const ar=as.getDataRange().getDisplayValues(), ac=makeHeaderMap_(ar[0]); let accountRow=0;
  for(let j=1;j<ar.length;j++) if(String(ar[j][ac['driverId']]||'').trim()===driverId){accountRow=j+1;break;}
  const accountId=accountRow?String(ar[accountRow-1][ac['accountId']]||''):newId_('ACC');
  const accountValues=[accountId,role,driverId,name,empId,enabled,new Date(),'마스터 계정관리'];
  if(accountRow) as.getRange(accountRow,1,1,accountValues.length).setValues([accountValues]); else as.appendRow(accountValues);
  writeAudit_(requesterId,'마스터','계정DB',accountId,accountRow?'수정':'추가',{},accountValues,'소장 계정 관리');
  return {ok:true,message:'소장 계정을 저장했습니다.',account:{accountId:accountId,role:role,driverId:driverId,name:name,empId:empId,enabled:enabled}};
}

function bus70ManagerNormalizeRoute_(value) {
  const route=String(value===undefined||value===null?'':value).trim().toUpperCase();
  if(route==='ALL')return 'ALL';
  const digits=route.replace(/\D/g,'');
  return digits==='5'||digits==='70'?digits:'';
}

function bus70ManagerDispatchRoute_(row, columns) {
  const explicit=columns['노선']!==undefined?bus70ManagerNormalizeRoute_(row[columns['노선']]):'';
  if(explicit&&explicit!=='ALL')return explicit;
  const marker=String(row[columns['dispatchId']]||'')+' '+String(row[columns['시간표버전']]||'');
  const match=marker.match(/(?:DSP-|R)(5|70)-/i);
  return match?match[1]:'70';
}

function bus70ManagerReferenceData_(route, date, options) {
  try{
    if(route==='5'&&typeof bus70Route5ReferenceData_==='function')return bus70Route5ReferenceData_(date,null,options||{});
    if(route==='70'&&typeof bus70Route70ReferenceData_==='function')return bus70Route70ReferenceData_(date);
  }catch(error){console.error('Manager route reference failed: '+route,error);}
  return null;
}

function bus70ManagerReferenceDepartures_(reference) {
  const result={};
  (reference&&reference.trips||[]).slice().sort(function(a,b){return Number(a.sequence)-Number(b.sequence)||Number(a.trip)-Number(b.trip);}).forEach(function(trip){
    const sequence=Number(trip.sequence||0);if(!sequence||result[sequence])return;
    result[sequence]={time:String(trip.startTime||trip.turnTime||''),place:String(trip.startPlace||trip.turnPlace||'출발')};
  });
  return result;
}

function bus70ManagerReferenceTripNumbers_(reference) {
  return bus70PrivateTripNumbersBySequence_(reference&&reference.trips||[]);
}

function bus70ManagerMergeReferenceRoster_(reference, drivers, vehicles, route) {
  const byName={},byVehicleNo={};
  drivers.forEach(function(driver){if(String(driver.route)!==route)return;const key=String(driver.name||'').replace(/\s/g,'');if(key&&!byName[key])byName[key]=driver;});
  vehicles.forEach(function(vehicle){const key=String(vehicle.no||'').replace(/\D/g,'');if(key&&!byVehicleNo[key])byVehicleNo[key]=vehicle;});
  const assignments=[];
  (reference&&reference.assignments||[]).forEach(function(item){
    const name=String(item.driverName||'').trim(),nameKey=name.replace(/\s/g,''),no=String(item.vehicleNo||'').replace(/\D/g,'');
    let driver=drivers.find(function(d){return item.driverId&&d.id===item.driverId&&String(d.route)===route;})||byName[nameKey];
    if(!driver){driver={id:String(item.driverId||('R'+route+'-TMP-'+('00'+Number(item.sequence||0)).slice(-3))),name:name,empId:'',shift:String(reference.shift||''),route:route,driverType:'임시(TEST)',identityMode:'TEST_VIRTUAL',virtual:true};drivers.push(driver);byName[nameKey]=driver;}
    let vehicle=byVehicleNo[no];
    if(!vehicle){vehicle={id:String(item.vehicleId||('VEH-'+no)),no:no,last3:no.slice(-3),displayNo:no.length===4?'경기71아'+no:no,route:route,virtual:true};vehicles.push(vehicle);byVehicleNo[no]=vehicle;}
    assignments.push({dispatchId:'R'+route+'-'+String(reference.date||'').replace(/-/g,'')+'-'+String(reference.shift||'')+'-'+('0'+Number(item.sequence||0)).slice(-2),sequence:Number(item.sequence||0),driverId:driver.id,vehicleId:vehicle.id,shift:String(reference.shift||''),reference:true,confirmed:false});
  });
  return assignments.filter(function(item){return item.sequence&&item.driverId&&item.vehicleId;});
}

function bus70ManagerBootstrap_(rawDate, rawRoute) {
  const date = bus70ManagerDateKey_(rawDate);
  if (!date) return {ok:false, error:'DATE_REQUIRED', message:'운행 날짜를 선택하세요.'};
  const route=bus70ManagerNormalizeRoute_(rawRoute===undefined||rawRoute===null||rawRoute===''?'70':rawRoute);
  if(!route)return {ok:false,error:'ROUTE_REQUIRED',message:'관리할 노선을 선택하세요.'};
  const operatingShift=bus70OperatingShiftForDate_(date);
  if(!operatingShift)return {ok:false,error:'PRIVATE_CONFIG_NOT_CONFIGURED',message:'비공개 근무조 기준일 설정이 필요합니다.'};
  if(route==='ALL'){
    const routes=['70','5'].map(function(item){const data=bus70ManagerBootstrap_(date,item);return data.ok?{ok:true,route:item,operatingShift:data.operatingShift,scheduleVersion:data.scheduleVersion,sequenceCount:Object.keys(data.departures||{}).length,assignmentCount:(data.assignments||[]).length,confirmedCount:(data.assignments||[]).filter(function(v){return v.confirmed;}).length,driverCount:(data.drivers||[]).filter(function(v){return v.route===item;}).length,vehicleCount:(data.vehicles||[]).length,stopCount:Number(data.routeProfile&&data.routeProfile.stopCount||0),routeStorage:data.routeStorage||null}:{ok:false,route:item,error:data.error,message:data.message};});
    return {ok:true,mode:'SUMMARY',route:'ALL',date:date,operatingShift:operatingShift,routes:routes};
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const driverSheet = ss.getSheetByName('기사DB');
  const vehicleSheet = ss.getSheetByName('차량DB');
  const dispatchSheet = ss.getSheetByName('배차DB');
  const confirmSheet = ss.getSheetByName('배차확인DB');
  const scheduleSheet = ss.getSheetByName('스케줄');
  if (!driverSheet || !vehicleSheet || !dispatchSheet) {
    return {ok:false, error:'DB_MISSING', message:'배차 편집에 필요한 DB를 찾을 수 없습니다.'};
  }
  const routeStorage=bus70EnsureRoutePartitions_(ss,route,date);
  bus70EnsureSheetColumns_(dispatchSheet,['노선']);
  bus70ApplyDueDriverTransitions_(driverSheet, ss.getSheetByName('근무변경DB'));
  const allDrivers = bus70ManagerMasterRows_(driverSheet, 'driver');
  const unavailable={}, unavailableNames={}, workSheet=ss.getSheetByName('근무변경DB');
  const masterRows=driverSheet.getDataRange().getDisplayValues(),masterCols=makeHeaderMap_(masterRows[0]),driverNames={};
  for(let m=1;m<masterRows.length;m++)driverNames[String(masterRows[m][masterCols['driverId']]||'')]=String(masterRows[m][masterCols['성명']]||'').replace(/\s/g,'');
  if(workSheet&&workSheet.getLastRow()>1){
    bus70EnsureSheetColumns_(workSheet,['변경전노선','변경노선','변경전근무조','변경근무조']);
    const wr=workSheet.getDataRange().getDisplayValues(),wc=makeHeaderMap_(wr[0]),persistent={},daily={};
    const changes=wr.slice(1).map(function(r,index){return {row:r,index:index,date:bus70ManagerDateKey_(r[wc['날짜']])};})
      .filter(function(v){return v.date;}).sort(function(a,b){return a.date.localeCompare(b.date)||a.index-b.index;});
    changes.forEach(function(v){
      if(v.date>date)return;
      const id=String(v.row[wc['기사ID']]||''),type=String(v.row[wc['유형']]||'');
      if(!id)return;
      if(type==='병가'||type==='퇴직')persistent[id]=type;
      else if(type==='복귀'||type==='재입사')delete persistent[id];
      else if(v.date===date&&(type==='휴무'||type==='결근'))daily[id]=type;
    });
    Object.keys(persistent).forEach(function(id){unavailable[id]=persistent[id];});
    Object.keys(daily).forEach(function(id){unavailable[id]=daily[id];});
    Object.keys(unavailable).forEach(function(id){const name=driverNames[id]||'';if(name)unavailableNames[name]=unavailable[id];});
    allDrivers.forEach(function(driver){
      const driverEvents=changes.filter(function(v){return String(v.row[wc['기사ID']]||'')===driver.id&&['노선이동','재입사'].indexOf(String(v.row[wc['유형']]||''))!==-1;});
      if(driverEvents.length){const first=driverEvents[0].row;if(String(first[wc['변경전노선']]||''))driver.route=String(first[wc['변경전노선']]||'');if(String(first[wc['이전사원번호']]||''))driver.empId=String(first[wc['이전사원번호']]||'');if(String(first[wc['변경전근무조']]||''))driver.shift=String(first[wc['변경전근무조']]||'');if(String(first[wc['변경전기사구분']]||''))driver.driverType=String(first[wc['변경전기사구분']]||'');}
      driverEvents.forEach(function(v){if(v.date>date)return;const nextRoute=String(v.row[wc['변경노선']]||'').trim(),nextShift=String(v.row[wc['변경근무조']]||'').trim(),nextEmpId=String(v.row[wc['새사원번호']]||'').trim(),nextType=String(v.row[wc['변경기사구분']]||'').trim();if(nextRoute)driver.route=nextRoute;if(nextShift)driver.shift=nextShift;if(nextEmpId)driver.empId=nextEmpId;if(nextType)driver.driverType=nextType;});
    });
  }
  let drivers = allDrivers.filter(function(v){return !unavailable[v.id]&&!unavailableNames[String(v.name||'').replace(/\s/g,'')];});
  let vehicles = bus70ManagerMasterRows_(vehicleSheet, 'vehicle',route);
  const maintenanceSheet=ss.getSheetByName('정비DB'), unavailableVehicles={};
  if(maintenanceSheet&&maintenanceSheet.getLastRow()>1){
    const mr=maintenanceSheet.getDataRange().getDisplayValues(),mc=makeHeaderMap_(mr[0]);
    mr.slice(1).forEach(function(r){const vehicleId=String(r[mc['차량ID']]||''),status=String(r[mc['현재상태']]||''),available=bus70ManagerDateKey_(r[mc['운행가능일']]);if(vehicleId&&((status!=='완료'&&status!=='')||(status==='완료'&&available&&date<available)))unavailableVehicles[vehicleId]=status==='완료'?'정비완료·운행대기':status;});
    vehicles=vehicles.filter(function(v){return !unavailableVehicles[v.id];});
  }
  const reference=bus70ManagerReferenceData_(route,date,{allowPrediction:true});
  if(reference&&reference.ok&&(bus70ManagerNormalizeRoute_(reference.route)!==route||normalizeDate_(reference.date)!==date)){
    return {ok:false,error:'ROUTE_DATA_MISMATCH',message:'선택한 '+route+'번·'+date+'와 다른 노선 또는 날짜의 기준자료 응답을 차단했습니다.'};
  }
  const plannedLeaves=typeof bus70PlannedLeavesForDate_==='function'?bus70PlannedLeavesForDate_(ss,route,date):[],observedNames={},plannedLeaveOverrides=[],effectivePlannedLeaves=[];
  if(reference&&reference.ok&&!reference.predicted)(reference.assignments||[]).forEach(function(item){const name=String(item.driverName||'').replace(/\s/g,'');if(name)observedNames[name]=true;});
  plannedLeaves.forEach(function(plan){
    const names=[plan.driverName].concat(plan.aliases||[]).map(function(name){return String(name||'').replace(/\s/g,'');}).filter(Boolean),name=names[0];if(!name)return;
    if(names.some(function(candidate){return observedNames[candidate];})){plannedLeaveOverrides.push({driverName:plan.driverName,type:plan.type,reason:'확정 배차상황판 우선'});return;}
    effectivePlannedLeaves.push(plan);names.forEach(function(candidate){unavailableNames[candidate]=String(plan.type||'휴무');});
    allDrivers.forEach(function(driver){if(names.indexOf(String(driver.name||'').replace(/\s/g,''))!==-1&&String(driver.route||'')===route)unavailable[driver.id]=String(plan.type||'휴무');});
  });
  if(effectivePlannedLeaves.length)drivers=drivers.filter(function(driver){return !unavailable[driver.id]&&!unavailableNames[String(driver.name||'').replace(/\s/g,'')];});
  const routeStorageSync=reference&&reference.ok&&!reference.predicted&&!(reference.phaseInference&&reference.phaseInference.managerReviewRequired)?bus70SyncRouteReferenceToDb_(ss,route,reference):null;
  let scheduleVersion='',departures={},tripNumbersBySequence={};
  if(reference&&reference.ok){scheduleVersion=String(reference.scheduleVersion||'');departures=bus70ManagerReferenceDepartures_(reference);tripNumbersBySequence=bus70ManagerReferenceTripNumbers_(reference);}
  else if(route==='70'&&scheduleSheet){scheduleVersion=bus70ScheduleVersionForDate_(date);departures=bus70ManagerDepartures_(scheduleSheet,scheduleVersion);tripNumbersBySequence=bus70ManagerScheduleTripNumbers_(scheduleSheet,scheduleVersion);}
  else return reference||{ok:false,error:'ROUTE_REFERENCE_NOT_CONFIGURED',message:date+' '+route+'번 노선 상황판·배차시간표 기준자료가 설정되지 않았습니다.'};
  const savedAssignments = bus70ManagerAssignments_(dispatchSheet, date, route);
  const referenceAssignments=reference&&reference.ok?bus70ManagerMergeReferenceRoster_(reference,drivers,vehicles,route):[];
  const assignments=savedAssignments.length?savedAssignments:referenceAssignments;
  const expectedSequences=Object.keys(departures).map(Number).filter(Number.isInteger).sort(function(a,b){return a-b;});
  const serviceClass=String(reference&&reference.serviceClass||bus70ServiceClassForDate_(date,reference&&reference.serviceType||''));
  const predictions=bus70ManagerHasCompleteAssignments_(savedAssignments,expectedSequences,operatingShift)?
    {A:{assignments:[]},B:{assignments:[]},skippedReason:'CONFIRMED_DAY_COMPLETE'}:
    bus70PredictManagerAssignments_(dispatchSheet,date,expectedSequences,drivers,vehicles,route,serviceClass);
  const confirmed = confirmSheet ? bus70ManagerConfirmations_(confirmSheet, date) : {};
  assignments.forEach(function (item) {
    item.confirmed = Boolean(confirmed[item.dispatchId]);
    item.confirmedAt = confirmed[item.dispatchId] || '';
  });
  const routeUnavailable={},routeUnavailableNames={};
  Object.keys(unavailable).forEach(function(id){const driver=allDrivers.find(function(item){return item.id===id;});if(driver&&String(driver.route||'')===route){routeUnavailable[id]=unavailable[id];const name=String(driver.name||'').replace(/\s/g,'');if(name)routeUnavailableNames[name]=unavailable[id];}});
  effectivePlannedLeaves.forEach(function(plan){const name=String(plan.driverName||'').replace(/\s/g,'');if(name)routeUnavailableNames[name]=String(plan.type||'휴무');});
  return {ok:true, route:route, date:date, operatingShift:operatingShift, scheduleVersion:scheduleVersion, source:reference&&reference.ok?(reference.predicted?'ROUTE_PATTERN_PREDICTION':'ROUTE_REFERENCE'):'LEGACY_SCHEDULE', serviceType:reference&&reference.serviceType||'',serviceClass:serviceClass, drivers:drivers, unavailableDrivers:routeUnavailable, unavailableNames:Object.keys(routeUnavailableNames),
    vehicles:vehicles, unavailableVehicles:unavailableVehicles, departures:departures,tripNumbersBySequence:tripNumbersBySequence, assignments:assignments,predictions:predictions,plannedLeaves:effectivePlannedLeaves.map(function(plan){return {driverName:plan.driverName,type:plan.type,source:plan.source};}),plannedLeaveOverrides:plannedLeaveOverrides,routeRules:reference&&reference.operatingRules||null,patternSummary:reference&&reference.patternSummary||bus70RoutePatternSummary_(reference&&reference.trips||[]),phaseReview:reference&&reference.phaseInference&&reference.phaseInference.managerReviewRequired?reference.phaseInference:null,schedulePrediction:reference&&reference.predicted?{predicted:true,sourceDate:String(reference.predictionSourceDate||''),confidence:String(reference.predictionConfidence||''),evidenceCount:Number(reference.predictionEvidenceCount||0),requiresManagerConfirmation:true}:null,routeStorage:{partitioned:true,stopSheet:routeStorage.stopSheet,scheduleSheet:routeStorage.scheduleSheet,stopReady:routeStorage.stopReady,scheduleReady:routeStorage.scheduleReady,synced:routeStorageSync&&routeStorageSync.ok||false,stopAdded:routeStorageSync&&routeStorageSync.stopAdded||0,scheduleAdded:routeStorageSync&&routeStorageSync.scheduleAdded||0},routeProfile:reference&&reference.routeProfile||{route:route,displayName:route+'번',stops:[],stopCount:0,boardAvailable:false,timetableAvailable:Boolean(Object.keys(departures).length),viewModes:['SUMMARY','ROUTE']}};
}

function bus70ManagerHasCompleteAssignments_(assignments,sequences,shift){
  if(!sequences.length)return false;
  const scoped=(assignments||[]).filter(function(row){return row.shift===shift;});
  if(scoped.length!==sequences.length)return false;
  const seen={},drivers={},vehicles={};
  return scoped.every(function(row){
    const sequence=Number(row.sequence);
    if(sequences.indexOf(sequence)===-1||seen[sequence]||!row.driverId||!row.vehicleId||drivers[row.driverId]||vehicles[row.vehicleId])return false;
    seen[sequence]=true;drivers[row.driverId]=true;vehicles[row.vehicleId]=true;return true;
  });
}

function bus70PredictManagerAssignments_(dispatchSheet,targetDate,targetSequenceInput,drivers,vehicles,rawRoute,targetServiceClass){
  const route=bus70ManagerNormalizeRoute_(rawRoute||'70')||'70';
  const expectedClass=String(targetServiceClass||bus70ServiceClassForDate_(targetDate)),result={A:{assignments:[],sourceDate:'',offset:0,serviceClass:expectedClass,confidence:''},B:{assignments:[],sourceDate:'',offset:0,serviceClass:expectedClass,confidence:''}};
  const targetSequences=Array.isArray(targetSequenceInput)?targetSequenceInput.map(Number).filter(Number.isInteger).sort(function(a,b){return a-b;}):Array.from({length:Number(targetSequenceInput)||0},function(_,index){return index+1;}),targetCount=targetSequences.length;
  if(!dispatchSheet||dispatchSheet.getLastRow()<2||!targetDate||!targetCount)return result;
  const rows=dispatchSheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]),groups={A:{},B:{}};
  rows.slice(1).forEach(function(r){
    const date=normalizeDate_(r[c['날짜']]),shift=String(r[c['근무조']]||''),sequence=Number(r[c['순차']]||0);
    if(bus70ManagerDispatchRoute_(r,c)!==route||(shift!=='A'&&shift!=='B')||!date||date>=targetDate||String(r[c['상태']]||'')!=='확정'||!Number.isInteger(sequence)||bus70ServiceClassForDate_(date)!==expectedClass)return;
    if(!groups[shift][date])groups[shift][date]=[];
    groups[shift][date].push({sequence:sequence,driverId:String(r[c['기사ID']]||''),vehicleId:String(r[c['차량ID']]||'')});
  });
  const allowedDrivers={};(drivers||[]).forEach(function(v){if(String(v.route||'')===route)allowedDrivers[v.id]=true;});
  const allowedVehicles={};(vehicles||[]).forEach(function(v){allowedVehicles[v.id]=true;});
  ['A','B'].forEach(function(shift){
    const sourceDate=Object.keys(groups[shift]).filter(function(d){return groups[shift][d].length===targetCount;}).sort().pop();
    if(!sourceDate)return;
    const offset=((bus70ManagerDaysBetween_(sourceDate,targetDate)%targetCount)+targetCount)%targetCount;
    const sourceAssignments=groups[shift][sourceDate].slice().sort(function(a,b){return a.sequence-b.sequence;});
    result[shift]={sourceDate:sourceDate,offset:offset,serviceClass:expectedClass,confidence:'HIGH',assignments:sourceAssignments.map(function(v,index){
      return {sequence:targetSequences[(index+offset)%targetCount],driverId:allowedDrivers[v.driverId]?v.driverId:'',vehicleId:allowedVehicles[v.vehicleId]?v.vehicleId:'',predicted:true};
    }).sort(function(a,b){return a.sequence-b.sequence;})};
  });
  return result;
}

function bus70ManagerDaysBetween_(fromDate,toDate){
  const from=String(fromDate||'').split('-').map(Number),to=String(toDate||'').split('-').map(Number);
  if(from.length!==3||to.length!==3)return 0;
  return Math.round((Date.UTC(to[0],to[1]-1,to[2])-Date.UTC(from[0],from[1]-1,from[2]))/86400000);
}

// 월 경계와 무관한 전 노선 공통 연속 격일 근무입니다.
// 실제 기준일·기준조는 공개 소스가 아닌 비공개 설정에서 읽습니다.
function bus70OperatingShiftForDate_(rawDate){
  const date=bus70ManagerDateKey_(rawDate);
  if(!date)return '';
  const config=bus70PrivateConfig_();
  if(!config)return '';
  const days=bus70ManagerDaysBetween_(config.shiftAnchorDate,date),same=((days%2)+2)%2===0;
  return same?config.shiftAnchor:(config.shiftAnchor==='A'?'B':'A');
}

// 운행일 경계는 한국시간 03:30입니다. 00:00~03:29는 전날 운행일로 봅니다.
function bus70ServiceDateKey_(now){
  const instant=now instanceof Date?now:new Date();
  const date=Utilities.formatDate(instant,'Asia/Seoul','yyyy-MM-dd');
  const time=Utilities.formatDate(instant,'Asia/Seoul','HH:mm');
  if(time>='03:30')return date;
  const parts=date.split('-').map(Number);
  return Utilities.formatDate(new Date(Date.UTC(parts[0],parts[1]-1,parts[2])-86400000),'UTC','yyyy-MM-dd');
}

function bus70ManagerDateKey_(value) {
  const normalized=normalizeDate_(value);
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(normalized||'')))return normalized;
  if(value instanceof Date&&!isNaN(value.getTime()))return Utilities.formatDate(value,'Asia/Seoul','yyyy-MM-dd');
  const parts=String(value||'').match(/\d+/g)||[];
  if(parts.length>=3&&parts[0].length===4)return parts[0]+'-'+('0'+Number(parts[1])).slice(-2)+'-'+('0'+Number(parts[2])).slice(-2);
  return '';
}

function bus70ApplyDueDriverTransitions_(driverSheet,workSheet){
  if(!driverSheet||!workSheet||workSheet.getLastRow()<2)return;
  bus70EnsureSheetColumns_(workSheet,['변경전노선','변경노선','변경근무조','이전사원번호','새사원번호','변경전기사구분','변경기사구분']);
  const today=bus70ServiceDateKey_(new Date()),dr=driverSheet.getDataRange().getDisplayValues(),dc=makeHeaderMap_(dr[0]),rowsById={};
  for(let i=1;i<dr.length;i++)rowsById[String(dr[i][dc['driverId']]||'')]=i+1;
  const originalRows=dr.map(function(row){return row.slice();});
  const wr=workSheet.getDataRange().getDisplayValues(),wc=makeHeaderMap_(wr[0]);
  wr.slice(1).map(function(r,index){return {r:r,index:index,date:bus70ManagerDateKey_(r[wc['날짜']])};})
    .filter(function(v){return v.date&&v.date<=today&&String(v.r[wc['유형']]||'')==='노선이동';})
    .sort(function(a,b){return a.date.localeCompare(b.date)||a.index-b.index;})
    .forEach(function(v){
      const id=String(v.r[wc['기사ID']]||''),rowNo=rowsById[id];if(!rowNo)return;
      const row=dr[rowNo-1].slice(),newRoute=String(v.r[wc['변경노선']]||''),newShift=String(v.r[wc['변경근무조']]||''),newEmpId=String(v.r[wc['새사원번호']]||''),newType=String(v.r[wc['변경기사구분']]||'');
      if(newRoute)row[dc['현재노선']]=newRoute;if(newShift)row[dc['근무조']]=newShift;if(newEmpId)row[dc['사원번호']]=newEmpId;if(newType)row[dc['기사구분']]=newType;
      dr[rowNo-1]=row;
    });
  Object.keys(rowsById).forEach(function(id){const rowNo=rowsById[id],original=originalRows[rowNo-1],row=dr[rowNo-1];if(JSON.stringify(original)!==JSON.stringify(row))driverSheet.getRange(rowNo,1,1,row.length).setValues([row]);});
}

function bus70ManagerMasterRows_(sheet, type, selectedRoute) {
  const rows = sheet.getDataRange().getDisplayValues();
  const c = makeHeaderMap_(rows[0]);
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const route = String(rows[i][c['현재노선']] || '').trim();
    const status = String(rows[i][c['상태']] || '').trim();
    if (type === 'driver') {
      const driverId = String(rows[i][c['driverId']] || '').trim();
      const driverType = String(rows[i][c['기사구분']] || '').trim();
      if (['마스터','소장','관리','정비','정비소'].indexOf(driverType) !== -1) continue;
      if (status !== '재직' && status !== '1') continue;
      result.push({id:driverId, name:String(rows[i][c['성명']] || '').trim(),
        empId:String(rows[i][c['사원번호']] || '').trim(),
        shift:String(rows[i][c['근무조']] || '').trim(), route:route,
        driverType:driverType});
    } else {
      if (selectedRoute && route && route !== selectedRoute) continue;
      if (status !== '운행가능' && status !== '운행') continue;
      const no = String(rows[i][c['차량번호']] || '').replace(/\D/g, '');
      result.push({id:String(rows[i][c['vehicleId']] || '').trim(), no:no, last3:no.slice(-3),
        displayNo:no.length === 4 ? '경기71아' + no : no, route:route});
    }
  }
  return result.filter(function (v) { return v.id; });
}

function bus70ManagerDepartures_(sheet, version) {
  const rows = sheet.getDataRange().getDisplayValues();
  const c = makeHeaderMap_(rows[0]);
  const result = {};
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][c['버전']] || '').trim() !== version || String(rows[i][c['상태']] || '').trim() === '중지') continue;
    const seq = Number(rows[i][c['순차']]);
    if (!Number.isInteger(seq) || result[seq]) continue;
    const startTime = String(rows[i][c['발차시간']] || '').trim();
    const turnTime = String(rows[i][c['회차시간']] || '').trim();
    result[seq] = startTime ? {time:startTime, place:String(rows[i][c['발차지']] || '').trim()} :
      {time:turnTime, place:String(rows[i][c['회차지']] || '').trim()};
  }
  return result;
}

function bus70ManagerScheduleTripNumbers_(sheet, version) {
  const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]),result={};
  for(let i=1;i<rows.length;i++){
    if(String(rows[i][c['버전']]||'').trim()!==version||String(rows[i][c['상태']]||'').trim()==='중지')continue;
    const sequence=Number(rows[i][c['순차']]||0),trip=Number(rows[i][c['탕']]||0);
    if(!Number.isInteger(sequence)||sequence<1||!Number.isInteger(trip)||trip<1)continue;
    if(!result[sequence])result[sequence]=[];
    if(result[sequence].indexOf(trip)===-1)result[sequence].push(trip);
  }
  Object.keys(result).forEach(function(sequence){result[sequence].sort(function(a,b){return a-b;});});
  return result;
}

function bus70ManagerAssignments_(sheet, date, rawRoute) {
  const route=bus70ManagerNormalizeRoute_(rawRoute||'70')||'70';
  const rows = sheet.getDataRange().getDisplayValues();
  const c = makeHeaderMap_(rows[0]);
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    if (normalizeDate_(rows[i][c['날짜']]) !== date || bus70ManagerDispatchRoute_(rows[i],c)!==route || String(rows[i][c['상태']] || '').trim() !== '확정') continue;
    result.push({dispatchId:String(rows[i][c['dispatchId']] || '').trim(), sequence:Number(rows[i][c['순차']]), driverId:String(rows[i][c['기사ID']] || '').trim(),
      vehicleId:String(rows[i][c['차량ID']] || '').trim(), shift:String(rows[i][c['근무조']] || '').trim(),route:route,crossRouteAuthorized:/\[타노선 승인\]|대체투입/.test(String(rows[i][c['비고']]||''))});
  }
  return result;
}

function bus70ManagerConfirmations_(sheet, date) {
  const rows = sheet.getDataRange().getDisplayValues();
  if (!rows.length) return {};
  const c = makeHeaderMap_(rows[0]), result = {};
  for (let i = 1; i < rows.length; i++) {
    if (normalizeDate_(rows[i][c['날짜']]) !== date) continue;
    if (String(rows[i][c['재확인필요']] || '').trim() === 'Y') continue;
    const dispatchId = String(rows[i][c['dispatchId']] || '').trim();
    if (dispatchId) result[dispatchId] = String(rows[i][c['확인시간']] || '').trim();
  }
  return result;
}

function bus70SaveManagerDispatchDay_(body, managerId) {
  const date = normalizeDate_(body.date);
  const route=bus70ManagerNormalizeRoute_(body.route||'70');
  const shift = String(body.shift || '').trim().toUpperCase();
  const input = Array.isArray(body.assignments) ? body.assignments : [];
  if (!date || !route || route==='ALL' || (shift !== 'A' && shift !== 'B')) {
    return {ok:false, error:'PARAM_REQUIRED', message:'노선·날짜·근무조를 확인하세요.'};
  }
  const operatingShift=bus70OperatingShiftForDate_(date);
  if(!operatingShift)return {ok:false,error:'PRIVATE_CONFIG_NOT_CONFIGURED',message:'비공개 근무조 기준일 설정이 필요합니다.'};
  if(shift!==operatingShift){
    return {ok:false,error:'SHIFT_DATE_MISMATCH',message:date+'은 '+operatingShift+'조 근무일입니다. 날짜 기준 근무조로 다시 불러오세요.'};
  }
  const bootstrap = bus70ManagerBootstrap_(date,route);
  if (!bootstrap.ok) return bootstrap;
  const expectedSequences = Object.keys(bootstrap.departures).map(Number).filter(Number.isInteger).sort(function (a,b) { return a-b; });
  if (!expectedSequences.length || input.length !== expectedSequences.length) {
    return {ok:false, error:'SEQUENCE_COUNT_MISMATCH', message:'선택한 날짜의 운행 순차 ' + expectedSequences.length + '개를 모두 확인하세요.'};
  }
  const driverMap = {}; bootstrap.drivers.forEach(function (v) { driverMap[v.id] = v; });
  const vehicleMap = {}; bootstrap.vehicles.forEach(function (v) { vehicleMap[v.id] = v; });
  const seenDrivers = {}, seenVehicles = {}, normalized = [];
  for (let i = 0; i < input.length; i++) {
    const seq = Number(input[i].sequence), driverId = String(input[i].driverId || '').trim();
    const vehicleId = String(input[i].vehicleId || '').trim();
    if (seq !== expectedSequences[i] || !driverMap[driverId] || !vehicleMap[vehicleId]) {
      return {ok:false, error:'ROW_INVALID', message:expectedSequences[i] + '순차의 기사 또는 차량을 확인하세요.'};
    }
    const existingAssignment=(bootstrap.assignments||[]).find(function(v){return v.sequence===seq&&v.driverId===driverId&&v.crossRouteAuthorized;});
    if(String(driverMap[driverId].route)!==route&&!existingAssignment&&!(body.crossRouteAssignment===true&&String(body.reason||'').trim()))return {ok:false,error:'CROSS_ROUTE_ASSIGNMENT_BLOCKED',message:seq+'순차 기사는 '+route+'번 소속이 아닙니다. 근태·대체 메뉴에서 노선 간 지원을 지정하세요.'};
    if (seenDrivers[driverId] || seenVehicles[vehicleId]) {
      return {ok:false, error:'DUPLICATE_ASSIGNMENT', message:'같은 기사 또는 차량을 두 순차에 배정할 수 없습니다.'};
    }
    seenDrivers[driverId] = true; seenVehicles[vehicleId] = true;
    normalized.push({sequence:seq, driverId:driverId, vehicleId:vehicleId});
  }
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    let scheduleReviewPending=false;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('배차DB');
    bus70EnsureSheetColumns_(sheet,['노선']);
    const rows = sheet.getDataRange().getDisplayValues();
    const c = makeHeaderMap_(rows[0]);
    const existing = {},otherRouteDrivers={},otherRouteVehicles={};
    for (let r = 1; r < rows.length; r++) {
      if (normalizeDate_(rows[r][c['날짜']]) === date && String(rows[r][c['근무조']] || '').trim() === shift && bus70ManagerDispatchRoute_(rows[r],c)===route) {
        existing[Number(rows[r][c['순차']])] = {row:r + 1, values:rows[r]};
      }
      if(normalizeDate_(rows[r][c['날짜']])===date&&String(rows[r][c['상태']]||'')==='확정'&&bus70ManagerDispatchRoute_(rows[r],c)!==route){otherRouteDrivers[String(rows[r][c['기사ID']]||'')]=bus70ManagerDispatchRoute_(rows[r],c);otherRouteVehicles[String(rows[r][c['차량ID']]||'')]=bus70ManagerDispatchRoute_(rows[r],c);}
    }
    for(let n=0;n<normalized.length;n++){if(otherRouteDrivers[normalized[n].driverId])return {ok:false,error:'CROSS_ROUTE_DRIVER_CONFLICT',message:normalized[n].sequence+'순차 기사가 같은 날짜 '+otherRouteDrivers[normalized[n].driverId]+'번 노선에 이미 배정되어 있습니다.'};if(otherRouteVehicles[normalized[n].vehicleId])return {ok:false,error:'CROSS_ROUTE_VEHICLE_CONFLICT',message:normalized[n].sequence+'순차 차량이 같은 날짜 '+otherRouteVehicles[normalized[n].vehicleId]+'번 노선에 이미 배정되어 있습니다.'};}
    if(bootstrap.schedulePrediction&&bootstrap.schedulePrediction.predicted){
      const prediction=bus70ManagerReferenceData_(route,date,{allowPrediction:true});
      if(!prediction||!prediction.ok||!prediction.predicted)return {ok:false,error:'PREDICTION_REFRESH_REQUIRED',message:'예측 시간표 기준이 변경되었습니다. 날짜 자료를 다시 불러오세요.'};
      if(prediction.phaseInference&&prediction.phaseInference.confirmable===false)scheduleReviewPending=true;
      else{
        const confirmedReference=JSON.parse(JSON.stringify(prediction));confirmedReference.trips.forEach(function(trip){if(trip.phaseStatus==='INFERRED'||trip.phaseStatus==='PARTIAL')trip.phaseStatus='CONFIRMED_INFERRED';});confirmedReference.predicted=false;confirmedReference.dataStatus='CONFIRMED';confirmedReference.revision=1;confirmedReference.revisionReason='소장 기사·차량 배차 확정';confirmedReference.confirmedBy=managerId;confirmedReference.confirmedAt=new Date();confirmedReference.sourceDate=prediction.predictionSourceDate;confirmedReference.sourceNote='소장 확정 · '+prediction.predictionSourceDate+' '+bus70ServiceClassLabel_(prediction.serviceClass)+' 패턴 기준';
        const confirmedSchedule=bus70SyncRouteReferenceToDb_(SpreadsheetApp.getActiveSpreadsheet(),route,confirmedReference);
        if(!confirmedSchedule.ok)return {ok:false,error:'PREDICTED_SCHEDULE_CONFIRM_FAILED',message:'예측 시간표를 확정 DB에 저장하지 못했습니다.'};
      }
    }else if(bootstrap.phaseReview){
      if(!bootstrap.phaseReview.confirmable)scheduleReviewPending=true;
      else{
        const phaseReference=bus70ManagerReferenceData_(route,date,{allowPrediction:false});
        if(!phaseReference||!phaseReference.ok||!phaseReference.phaseInference||!phaseReference.phaseInference.confirmable)return {ok:false,error:'PHASE_REVIEW_REFRESH_REQUIRED',message:'회차·도착 시각 검토 기준이 변경되었습니다. 날짜 자료를 다시 불러오세요.'};
        const confirmedReference=JSON.parse(JSON.stringify(phaseReference));confirmedReference.trips.forEach(function(trip){if(trip.phaseStatus==='INFERRED'||trip.phaseStatus==='PARTIAL')trip.phaseStatus='CONFIRMED_INFERRED';});confirmedReference.dataStatus='CONFIRMED';confirmedReference.revision=1;confirmedReference.revisionReason='소장 기사·차량 배차 및 탕별 시각 검토 확정';confirmedReference.confirmedBy=managerId;confirmedReference.confirmedAt=new Date();confirmedReference.sourceDate=phaseReference.phaseInference.sourceDate||date;confirmedReference.sourceNote='소장 확정 · '+(phaseReference.phaseInference.sourceDate||date)+' 동일 시간표 버전 회차·도착 패턴 기준';
        const confirmedSchedule=bus70SyncRouteReferenceToDb_(SpreadsheetApp.getActiveSpreadsheet(),route,confirmedReference);
        if(!confirmedSchedule.ok)return {ok:false,error:'PHASE_SCHEDULE_CONFIRM_FAILED',message:'검토한 탕별 시간표를 확정 DB에 저장하지 못했습니다.'};
      }
    }
    normalized.forEach(function (item) {
      const dispatchId = 'DSP-' + route + '-' + date.replace(/-/g, '') + '-' + shift + '-' + ('0' + item.sequence).slice(-2);
      const values = new Array(rows[0].length).fill('');
      values[c['dispatchId']]=dispatchId;values[c['날짜']]=date;values[c['근무조']]=shift;values[c['순차']]=item.sequence;values[c['기사ID']]=item.driverId;values[c['차량ID']]=item.vehicleId;values[c['시간표버전']]=bootstrap.scheduleVersion;values[c['상태']]='확정';values[c['확정시간']]=new Date();values[c['비고']]='소장 '+route+'번 일괄 배차'+(String(driverMap[item.driverId].route)!==route?' [타노선 승인] '+String(body.reason||'기존 대체 배정 유지'):'');values[c['노선']]=route;
      if (existing[item.sequence]) sheet.getRange(existing[item.sequence].row, 1, 1, values.length).setValues([values]);
      else sheet.appendRow(values);
    });
    writeAudit_(managerId, '소장', '배차DB', route + '-' + date + '-' + shift, '일괄저장', bootstrap.assignments, normalized, route+'번 소장 배차 편집');
    return {ok:true, message:route+'번 '+expectedSequences.length+'개 순차 배차를 저장했습니다.'+(scheduleReviewPending?' 다만 회차·도착 시각 미등록 자료는 기사 알림 확정 전 소장 검토가 필요합니다.':''), scheduleReviewPending:scheduleReviewPending, data:bus70ManagerBootstrap_(date,route)};
  } finally { lock.releaseLock(); }
}

// 연락처는 인증 후 비공개 연락망DB에서만 읽습니다. 공개 웹 파일에는 넣지 않습니다.
function bus70DepotContactPhones_(value) {
  return (Array.isArray(value)?value:String(value||'').split(/\r?\n/)).map(function(v){return String(v||'').trim();}).filter(function(v){return v;});
}
function bus70DepotContactDb_() {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('연락망DB');
  if(!sheet||sheet.getLastRow()<2)return null;
  const rows=sheet.getDataRange().getDisplayValues(),columns=makeHeaderMap_(rows[0]);
  const headers=['contactId','직책','성명','전화번호','표시순서','사용여부','비고'];
  if(headers.some(function(h){return columns[h]===undefined;}))throw new Error('연락망DB 열 구성을 확인하세요.');
  const contacts=rows.slice(1).map(function(row,index){
    return {id:String(row[columns.contactId]||''),role:String(row[columns['직책']]||''),name:String(row[columns['성명']]||''),phones:bus70DepotContactPhones_(row[columns['전화번호']]),note:String(row[columns['비고']]||''),order:Number(row[columns['표시순서']]||0),enabled:String(row[columns['사용여부']]||'').toUpperCase()==='Y',row:index+2};
  }).filter(function(c){return c.id&&c.enabled;}).sort(function(a,b){return a.order-b.order||a.row-b.row;});
  return {sheet:sheet,columns:columns,contacts:contacts};
}
function bus70DepotContactPublic_(contact) {
  return {id:contact.id,role:contact.role,name:contact.name||'',phones:contact.phones,phone:contact.phones[0]||'',note:contact.note||''};
}
function bus70DepotContactsGet_(requesterId) {
  if(!bus70CanOperate_(requesterId)&&!bus70IsKnownDriver_(requesterId))return {ok:false,error:'LOGIN_REQUIRED',message:'로그인이 필요합니다.'};
  const db=bus70DepotContactDb_();
  if(db)return {ok:true,contactsVersion:2,contacts:db.contacts.map(bus70DepotContactPublic_)};
  // 구버전 설정은 읽기만 지원하며, 새 DB가 비어 있을 때만 표시합니다.
  let saved=[];try{saved=JSON.parse(PropertiesService.getScriptProperties().getProperty('BUS70_DEPOT_CONTACTS_JSON')||'[]');}catch(error){}
  return {ok:true,contactsVersion:1,contacts:(Array.isArray(saved)?saved:[]).map(function(c){return bus70DepotContactPublic_({id:'',role:String(c.role||''),name:String(c.name||''),phones:bus70DepotContactPhones_(c.phones||c.phone),note:String(c.note||'')});})};
}
function bus70DepotContactsSave_(body,requesterId) {
  if(!bus70IsManager_(requesterId))return {ok:false,error:'MANAGER_REQUIRED',message:'연락망 변경은 소장 이상만 가능합니다.'};
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    const db=bus70DepotContactDb_(),input=body.contacts;
    if(!db)return {ok:false,error:'CONTACT_DB_REQUIRED',message:'연락망DB를 먼저 등록하세요.'};
    if(!Array.isArray(input)||input.length!==db.contacts.length||db.contacts.some(function(c){return input.filter(function(v){return v&&v.id===c.id&&v.role===c.role;}).length!==1;}))return {ok:false,error:'CONTACTS_INVALID',message:'연락망을 다시 불러온 뒤 저장하세요.'};
    const contacts=db.contacts.map(function(c){
      const v=input.find(function(v){return v.id===c.id;});
      return {id:c.id,role:c.role,row:c.row,name:String(v.name||'').trim(),phones:bus70DepotContactPhones_(v.phones===undefined?v.phone:v.phones),note:String(v.note||'').trim()};
    });
    if(contacts.some(function(c){return c.name.length>80||c.note.length>200;}))return {ok:false,error:'CONTACTS_INVALID',message:'담당자 이름과 안내 내용을 확인하세요.'};
    if(contacts.some(function(c){return c.phones.length>4||c.phones.some(function(phone){const digits=phone.replace(/\D/g,'');return !/^\+?[0-9 ()-]{8,24}$/.test(phone)||digits.length<8||digits.length>15;});}))return {ok:false,error:'PHONE_INVALID',message:'전화번호를 한 줄에 하나씩 입력하세요. 숫자와 +, 괄호, 하이픈만 사용할 수 있습니다.'};
    contacts.forEach(function(c){
      [['성명',c.name],['전화번호',c.phones.join('\n')],['비고',c.note]].forEach(function(pair){
        // setValue는 =로 시작하는 사용자 입력을 수식으로 해석하므로 문자로 보존합니다.
        const value=pair[1];db.sheet.getRange(c.row,db.columns[pair[0]]+1).setValue(value.charAt(0)==='='?"'"+value:value);
      });
    });
    writeAudit_(requesterId,bus70IsMaster_(requesterId)?'마스터':'소장','연락망DB','긴급연락망','수정',{}, {contacts:contacts.length,phones:contacts.reduce(function(n,c){return n+c.phones.length;},0)},'긴급연락망 수정');
    return {ok:true,contactsVersion:2,contacts:contacts.map(bus70DepotContactPublic_),message:'긴급연락망을 저장했습니다.'};
  } finally {lock.releaseLock();}
}
