/*
 * Private route-data boundary.
 *
 * Production data is supplied by an untracked RoutePrivateData.js file or by
 * Script Properties. Public source files must contain no real driver roster,
 * employee identifier, dated dispatch board, exact timetable, or GPS point.
 */

function bus70PrivateData_() {
  let data=null;
  if(typeof BUS70_PRIVATE_ROUTE_DATA_!=='undefined'&&BUS70_PRIVATE_ROUTE_DATA_)data=BUS70_PRIVATE_ROUTE_DATA_;
  if(!data){
    try{
      const text=PropertiesService.getScriptProperties().getProperty('BUS70_PRIVATE_ROUTE_DATA_JSON');
      if(text)data=JSON.parse(text);
    }catch(error){data=null;}
  }
  return data;
}

function bus70PrivateRouteSource_(rawRoute, rawDate) {
  const route=String(rawRoute||'').replace(/\D/g,''),date=normalizeDate_(rawDate);
  if(!route||!date)return null;
  const data=bus70PrivateData_();
  const source=data&&data[route]&&data[route][date];
  return source?JSON.parse(JSON.stringify(source)):null;
}

function bus70PrivateConfig_() {
  const data=bus70PrivateData_(),embedded=data&&data.config&&typeof data.config==='object'?data.config:{};
  let shiftAnchorDate=String(embedded.shiftAnchorDate||''),shiftAnchor=String(embedded.shiftAnchor||'').toUpperCase();
  try{
    const properties=PropertiesService.getScriptProperties();
    shiftAnchorDate=String(properties.getProperty('BUS70_SHIFT_ANCHOR_DATE')||shiftAnchorDate);
    shiftAnchor=String(properties.getProperty('BUS70_SHIFT_ANCHOR_SHIFT')||shiftAnchor).toUpperCase();
  }catch(error){}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(shiftAnchorDate)||['A','B'].indexOf(shiftAnchor)===-1)return null;
  return {shiftAnchorDate:shiftAnchorDate,shiftAnchor:shiftAnchor};
}

function bus70PrivateBootstrapAccounts_() {
  const data=bus70PrivateData_(),embedded=data&&data.config&&Array.isArray(data.config.bootstrapAccounts)?data.config.bootstrapAccounts:[];
  let accounts=embedded;
  try{
    const text=PropertiesService.getScriptProperties().getProperty('BUS70_BOOTSTRAP_ACCOUNTS_JSON');
    if(text)accounts=JSON.parse(text);
  }catch(error){accounts=[];}
  if(!Array.isArray(accounts))return [];
  return accounts.map(function(account){return {
    accountId:String(account&&account.accountId||''),role:String(account&&account.role||''),driverId:String(account&&account.driverId||''),
    loginName:String(account&&account.loginName||''),initialPassword:String(account&&account.initialPassword||''),note:String(account&&account.note||''),route:String(account&&account.route||'')
  };}).filter(function(account){return account.accountId&&['마스터','소장','정비소'].indexOf(account.role)!==-1&&account.driverId&&account.loginName&&account.initialPassword.length>=5;});
}

// 월 근무실적표에서 확인한 사전 휴무·휴직은 배차 결과와 분리해 보관합니다.
// 배차표에 이름이 없다는 사실만으로 휴무를 추정하지 않고, 이 원본 목록에
// 명시된 경우에만 소장 예측의 제외 근거로 사용합니다.
function bus70PrivatePlannedLeaves_() {
  const data=bus70PrivateData_(),items=data&&data.config&&Array.isArray(data.config.plannedLeaves)?data.config.plannedLeaves:[];
  return items.map(function(item,index){
    return {planId:String(item&&item.planId||'PRIVATE-LEAVE-'+('0000'+(index+1)).slice(-4)),route:String(item&&item.route||'').replace(/\D/g,''),shift:String(item&&item.shift||''),driverId:String(item&&item.driverId||''),driverName:String(item&&item.driverName||'').trim(),aliases:(Array.isArray(item&&item.aliases)?item.aliases:[]).map(function(name){return String(name||'').trim();}).filter(Boolean),type:String(item&&item.type||'휴무'),date:normalizeDate_(item&&item.date),dates:(Array.isArray(item&&item.dates)?item.dates:[]).map(normalizeDate_).filter(Boolean),startDate:normalizeDate_(item&&item.startDate),endDate:normalizeDate_(item&&item.endDate),status:String(item&&item.status||'확정'),source:String(item&&item.source||'비공개 근무실적표 판독')};
  }).filter(function(item){return item.route&&item.driverName&&(item.date||item.dates.length||item.startDate);});
}

function bus70PrivateLeaveApplies_(item, date) {
  if(!item||!date)return false;
  if(item.date===date||item.dates.indexOf(date)!==-1)return true;
  return Boolean(item.startDate&&date>=item.startDate&&(!item.endDate||date<=item.endDate));
}

function bus70PrivateLeaveDates_(item) {
  const result=[];if(item.date)result.push(item.date);(item.dates||[]).forEach(function(date){if(result.indexOf(date)===-1)result.push(date);});
  if(item.startDate){let parts=item.startDate.split('-').map(Number),cursor=Date.UTC(parts[0],parts[1]-1,parts[2]),count=0;const end=item.endDate||item.startDate;while(count<370){const date=new Date(cursor).toISOString().slice(0,10);if(date>end)break;if(result.indexOf(date)===-1)result.push(date);cursor+=86400000;count++;}}
  return result.sort();
}

function bus70EnsurePlannedLeaveSheet_(ss) {
  const name='기사휴무계획DB',headers=['계획ID','노선','근무조','기사ID','기사명','별칭','유형','적용일','상태','원본근거','처리자','확정시간','수정시간'];if(!ss)return null;
  let sheet=ss.getSheetByName(name);if(!sheet&&typeof ss.insertSheet==='function'){sheet=ss.insertSheet(name);sheet.getRange(1,1,1,headers.length).setValues([headers]);if(typeof sheet.setFrozenRows==='function')sheet.setFrozenRows(1);}
  if(sheet){const current=(sheet.getDataRange().getDisplayValues()[0]||[]).map(function(value){return String(value||'').trim();});if(!current.some(Boolean))sheet.getRange(1,1,1,headers.length).setValues([headers]);else headers.forEach(function(header){if(current.indexOf(header)===-1){current.push(header);sheet.getRange(1,current.length).setValue(header);bus70InvalidatePartition_(sheet);}});}
  return sheet;
}

function bus70SyncPrivatePlannedLeaves_(ss) {
  const plans=bus70PrivatePlannedLeaves_(),sheet=bus70EnsurePlannedLeaveSheet_(ss);if(!sheet)return {ok:false,added:0};
  const rows=sheet.getDataRange().getDisplayValues(),headers=rows[0],c=bus70RoutePartitionHeaderMap_(headers),existing={};rows.slice(1).forEach(function(row){const key=[String(row[c['노선']]||''),normalizeDate_(row[c['적용일']]),String(row[c['기사명']]||'').replace(/\s/g,''),String(row[c['유형']]||'')].join('|');existing[key]=true;});
  let added=0;plans.forEach(function(plan){bus70PrivateLeaveDates_(plan).forEach(function(date){
    const key=[plan.route,date,plan.driverName.replace(/\s/g,''),plan.type].join('|');if(existing[key])return;
    const row=new Array(headers.length).fill('');row[c['계획ID']]=plan.planId+'-'+date.replace(/-/g,'');row[c['노선']]=plan.route;row[c['근무조']]=plan.shift;row[c['기사ID']]=plan.driverId;row[c['기사명']]=plan.driverName;row[c['별칭']]=(plan.aliases||[]).join(',');row[c['유형']]=plan.type;row[c['적용일']]=date;row[c['상태']]=plan.status;row[c['원본근거']]=plan.source;row[c['처리자']]='PRIVATE_IMPORT';row[c['확정시간']]=new Date();row[c['수정시간']]=new Date();sheet.appendRow(row);existing[key]=true;added++;
  });});return {ok:true,added:added,sheetName:'기사휴무계획DB'};
}

function bus70PlannedLeavesForDate_(ss, rawRoute, rawDate) {
  const route=String(rawRoute||'').replace(/\D/g,''),date=normalizeDate_(rawDate);if(!route||!date)return [];
  // Ordinary schedule reads must not import/write the entire historical leave
  // plan. Explicit imports remain available through bus70SyncPrivatePlannedLeaves_.
  let sheet=null;try{if(ss)sheet=ss.getSheetByName('기사휴무계획DB');}catch(error){sheet=null;}
  if(!sheet||sheet.getLastRow()<2)return bus70PrivatePlannedLeaves_().filter(function(item){return item.route===route&&bus70PrivateLeaveApplies_(item,date)&&['취소','삭제','N'].indexOf(item.status)===-1;});
  const rows=bus70PartitionRows_(sheet),c=bus70RoutePartitionHeaderMap_(rows[0]),latest={};
  // Keep unimported private plans readable, while explicit DB cancellations or
  // overrides win. No cross-user cache and no synthetic leave records are saved.
  bus70PrivatePlannedLeaves_().filter(function(item){return item.route===route&&bus70PrivateLeaveApplies_(item,date);}).forEach(function(item){latest['private:'+item.driverName.replace(/\s/g,'')]=item;});
  rows.slice(1).forEach(function(row,index){
    const item={planId:String(row[c['계획ID']]||''),route:String(row[c['노선']]||'').replace(/\D/g,''),shift:String(row[c['근무조']]||''),driverId:String(row[c['기사ID']]||''),driverName:String(row[c['기사명']]||'').trim(),aliases:String(row[c['별칭']]||'').split(',').map(function(name){return name.trim();}).filter(Boolean),type:String(row[c['유형']]||'휴무'),date:normalizeDate_(row[c['적용일']]),status:String(row[c['상태']]||'확정'),source:String(row[c['원본근거']]||''),index:index};if(item.route!==route||item.date!==date||!item.driverName)return;
    Object.keys(latest).filter(function(key){const prior=latest[key];return key.indexOf('private:')===0&&((item.driverId&&prior.driverId===item.driverId)||prior.driverName.replace(/\s/g,'')===item.driverName.replace(/\s/g,''));}).forEach(function(key){delete latest[key];});
    const key=item.driverId||item.driverName.replace(/\s/g,'');latest[key]=item;
  });
  return Object.keys(latest).map(function(key){return latest[key];}).filter(function(item){return ['취소','삭제','N'].indexOf(item.status)===-1;});
}

function bus70PrivateDriverOnlyIds_() {
  const data=bus70PrivateData_(),embedded=data&&data.config&&Array.isArray(data.config.driverOnlyIds)?data.config.driverOnlyIds:[];
  let ids=embedded;
  try{
    const text=PropertiesService.getScriptProperties().getProperty('BUS70_DRIVER_ONLY_IDS');
    if(text)ids=text.split(',');
  }catch(error){ids=[];}
  return (Array.isArray(ids)?ids:[]).map(function(value){return String(value||'').trim();}).filter(Boolean);
}

function bus70PrivateVirtualDriverId_(route, sequence) {
  return 'R'+String(route||'').replace(/\D/g,'')+'-TMP-'+('00'+Number(sequence||0)).slice(-3);
}

// 순차의 첫 운행은 반드시 1탕이라는 전제를 두지 않습니다. 실제 시간표에
// 존재하는 양의 탕 번호만 남기고 정렬하여, 2탕부터 시작하는 순차에서도
// 화면·알람·캘린더·운행기록이 같은 목록을 사용하게 합니다.
function bus70PrivateNormalizeTrips_(items) {
  const seen={};
  return (Array.isArray(items)?items:[]).filter(function(item){
    if(!item||typeof item!=='object')return false;
    const sequence=Number(item.sequence||0),trip=Number(item.trip||0);
    if(!Number.isInteger(sequence)||sequence<1||!Number.isInteger(trip)||trip<1)return false;
    const key=sequence+'-'+trip;if(seen[key])return false;seen[key]=true;return true;
  }).sort(function(a,b){return Number(a.sequence)-Number(b.sequence)||Number(a.trip)-Number(b.trip);});
}

function bus70PrivateTripsForSequence_(items, rawSequence) {
  const sequence=Number(rawSequence||0);
  const scoped=(Array.isArray(items)?items:[]).map(function(item){
    if(!item||typeof item!=='object'||Number(item.sequence||0)>0)return item;
    const copy={};Object.keys(item).forEach(function(key){copy[key]=item[key];});copy.sequence=sequence;return copy;
  });
  return bus70PrivateNormalizeTrips_(scoped).filter(function(item){return Number(item.sequence)===sequence;});
}

function bus70PrivateTripNumbersBySequence_(items) {
  const result={};
  bus70PrivateNormalizeTrips_(items).forEach(function(item){
    const sequence=String(Number(item.sequence));
    if(!result[sequence])result[sequence]=[];
    result[sequence].push(Number(item.trip));
  });
  return result;
}

// 노선별 시간표는 평일/토요일/일요일·공휴일 구조가 서로 다를 수 있습니다.
// 화면에 쓰인 한글 명칭과 과거 영문 코드를 하나의 안정된 코드로 정규화합니다.
function bus70NormalizeServiceClass_(value) {
  const text=String(value||'').trim().replace(/\s+/g,'').toUpperCase();
  if(!text)return '';
  if(text==='WEEKDAY'||/평일/.test(text))return 'WEEKDAY';
  const saturday=text==='SATURDAY'||/토요일|토요|(^|[^가-힣])토($|[·\/,])/.test(text);
  const holiday=text==='SUNDAY_HOLIDAY'||text==='HOLIDAY'||/일요일|공휴일|휴일|주말/.test(text);
  if(saturday&&holiday)return 'WEEKEND_HOLIDAY';
  if(saturday)return 'SATURDAY';
  if(holiday)return 'SUNDAY_HOLIDAY';
  if(text==='WEEKEND_HOLIDAY')return 'WEEKEND_HOLIDAY';
  return '';
}

// GAS globals live for one execution. Reuse the year's resolved holidays while
// scanning dispatch rows, but read updated overrides on the next request.
var bus70ServiceHolidayDatesByYear_ = {};

function bus70ServiceClassForDate_(rawDate, explicitLabel) {
  const date=normalizeDate_(rawDate),explicit=bus70NormalizeServiceClass_(explicitLabel);
  if(explicit&&explicit!=='WEEKEND_HOLIDAY')return explicit;
  if(!date)return explicit;
  let holiday=false;
  try{
    if(typeof bus70HolidayDates_==='function'){
      const year=date.slice(0,4);
      if(!Object.prototype.hasOwnProperty.call(bus70ServiceHolidayDatesByYear_,year)){
        bus70ServiceHolidayDatesByYear_[year]=bus70HolidayDates_(year);
      }
      holiday=bus70ServiceHolidayDatesByYear_[year].indexOf(date)!==-1;
    }
  }catch(error){holiday=false;}
  const parts=date.split('-').map(Number),day=new Date(Date.UTC(parts[0],parts[1]-1,parts[2])).getUTCDay();
  if(holiday||day===0)return 'SUNDAY_HOLIDAY';
  if(day===6)return 'SATURDAY';
  return 'WEEKDAY';
}

function bus70ServiceClassLabel_(serviceClass) {
  return serviceClass==='WEEKDAY'?'평일':serviceClass==='SATURDAY'?'토요일':serviceClass==='SUNDAY_HOLIDAY'?'일요일·공휴일':serviceClass==='WEEKEND_HOLIDAY'?'주말·공휴일':'';
}

function bus70ServiceClassMatches_(candidate, target) {
  if(!candidate||!target)return false;
  return candidate===target||(candidate==='WEEKEND_HOLIDAY'&&(target==='SATURDAY'||target==='SUNDAY_HOLIDAY'));
}

function bus70RouteTripPatternSignature_(items) {
  return bus70PrivateNormalizeTrips_(items).map(function(item){
    return [Number(item.sequence),Number(item.trip),String(item.startPlace||''),String(item.turnPlace||''),String(item.endPlace||''),String(item.serviceEndType||''),item.finalService?'Y':''].join('~');
  }).join('|');
}

function bus70RoutePatternSummary_(items) {
  const trips=bus70PrivateNormalizeTrips_(items),bySequence={},finalServices=[],upboundOnlyReturns=[];
  trips.forEach(function(item){
    const sequence=Number(item.sequence);if(!bySequence[sequence])bySequence[sequence]=[];bySequence[sequence].push(item);
    if(item.finalService||String(item.serviceRole||'').indexOf('FINAL_')===0)finalServices.push({sequence:sequence,trip:Number(item.trip),type:String(item.serviceEndType||'ROUND_TRIP_LAST'),serviceEndPlace:String(item.serviceEndPlace||item.endPlace||''),deadheadDestination:String(item.deadheadDestination||'')});
    if(String(item.serviceEndType||'').indexOf('UPBOUND_')===0||String(item.serviceRole||'')==='SHORT_TURN_END')upboundOnlyReturns.push({sequence:sequence,trip:Number(item.trip),type:String(item.serviceEndType||'UPBOUND_ONLY'),serviceEndPlace:String(item.serviceEndPlace||item.endPlace||''),deadheadDestination:String(item.deadheadDestination||''),finalService:Boolean(item.finalService)});
  });
  const operations=Object.keys(bySequence).map(Number).sort(function(a,b){return a-b;}).map(function(sequence){
    const sequenceTrips=bySequence[sequence].sort(function(a,b){return Number(a.trip)-Number(b.trip);}),first=sequenceTrips[0],last=sequenceTrips[sequenceTrips.length-1];
    return {sequence:sequence,tripNumbers:sequenceTrips.map(function(item){return Number(item.trip);}),firstScheduledTrip:Number(first.trip),firstStartPlace:String(first.startPlace||''),firstStartTime:String(first.startTime||''),lastScheduledTrip:Number(last.trip),lastEndPlace:String(last.serviceEndPlace||last.endPlace||''),lastEndTime:String(last.endTime||''),serviceEndType:String(last.serviceEndType||'ROUND_TRIP'),deadheadDestination:String(last.deadheadDestination||'')};
  });
  return {sequenceCount:operations.length,totalTrips:trips.length,operations:operations,sequencesStartingAfterTrip1:operations.filter(function(item){return item.firstScheduledTrip>1;}).map(function(item){return item.sequence;}),specialFirstOrigins:operations.filter(function(item){return item.firstStartPlace&&item.firstStartPlace!=='고강공영차고지';}).map(function(item){return {sequence:item.sequence,trip:item.firstScheduledTrip,place:item.firstStartPlace};}),upboundOnlyReturns:upboundOnlyReturns,finalServices:finalServices,multipleFinalServices:finalServices.length>1};
}

function bus70RouteStorePublicSchemaVersion_() { return 2; }


// Per-execution reads, never shared across users or persisted in a public cache.
var BUS70_PARTITION_READS_ = null;
function bus70PartitionRows_(sheet){
  const key=sheet.getName?sheet.getName():'';
  if(key&&BUS70_PARTITION_READS_&&BUS70_PARTITION_READS_[key])return BUS70_PARTITION_READS_[key];
  const rows=sheet.getDataRange().getDisplayValues();
  if(key&&BUS70_PARTITION_READS_)BUS70_PARTITION_READS_[key]=rows;
  return rows;
}
function bus70InvalidatePartition_(sheet){if(BUS70_PARTITION_READS_&&sheet&&sheet.getName)delete BUS70_PARTITION_READS_[sheet.getName()];}
function bus70AppendPartitionRows_(sheet,rows,width){
  if(!rows.length)return;const first=sheet.getLastRow()+1,end=first+rows.length-1;
  if(typeof sheet.getMaxRows==='function'&&end>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),Math.max(500,end-sheet.getMaxRows()));
  sheet.getRange(first,1,rows.length,width).setValues(rows);bus70InvalidatePartition_(sheet);
}
function bus70SeedScheduleMonth_(ss,route,date,target,headers){
  const legacy=ss.getSheetByName(bus70RoutePartitionNames_(route).schedule);if(!legacy||legacy.getLastRow()<2)return;
  const rows=bus70PartitionRows_(legacy),c=bus70RoutePartitionHeaderMap_(rows[0]),month=normalizeDate_(date).slice(0,7),first=month+'-01',last=month+'-31';
  const selected=rows.slice(1).filter(function(r){
    const day=normalizeDate_(r[c['운행일']]),from=normalizeDate_(r[c['적용시작']]),to=normalizeDate_(r[c['적용종료']]);
    return day?day.slice(0,7)===month:(!from||from<=last)&&(!to||to>=first);
  }).map(function(r){return headers.map(function(h){return c[h]===undefined?'':r[c[h]];});});
  if(selected.length)bus70AppendPartitionRows_(target,selected,headers.length);
  bus70InvalidatePartition_(target);
}
function bus70SchedulePatternRows_(ss,route,date){
  const headers=bus70RoutePartitionHeaders_('schedule'),result=[headers],parts=date.split('-').map(Number);let found=false;
  for(let i=0;i<3;i++){
    const d=new Date(Date.UTC(parts[0],parts[1]-1-i,1)),key=d.toISOString().slice(0,10),sheet=ss.getSheetByName(bus70RoutePartitionNames_(route,key).schedule);
    if(!sheet)continue;found=true;const rows=bus70PartitionRows_(sheet),c=bus70RoutePartitionHeaderMap_(rows[0]);
    rows.slice(1).forEach(function(r){result.push(headers.map(function(h){return c[h]===undefined?'':r[c[h]];}));});
  }
  if(!found){const legacy=ss.getSheetByName(bus70RoutePartitionNames_(route).schedule);return legacy?bus70PartitionRows_(legacy):[];}
  return result;
}

function bus70RoutePartitionNames_(rawRoute, rawDate) {
  const route=String(rawRoute||'').replace(/\D/g,'');
  if(!route)return null;
  const date=normalizeDate_(rawDate),month=/^\d{4}-\d{2}-\d{2}$/.test(date)?date.slice(0,7).replace('-','_'):'';
  return {route:route,stops:'노선_'+route+'_정류장DB',schedule:'노선_'+route+'_배차스케줄DB'+(month?'_'+month:'')};
}

function bus70RoutePartitionHeaders_(kind) {
  return kind==='stops'?
    ['stopId','노선','방향','정류장순서','정류장명','정류장번호','위도','경도','기점','종점','적용시작','적용종료','상태','원본근거','수정시간','자료세트ID','외부노선ID','외부정류장ID','시도코드','시군구코드','읍면동코드','자료기준일','자료제공처','좌표제공처','좌표상태','검토상태','처리자','회차점']:
    ['시간표ID','노선','운행일','시간표버전','운행구분','운행유형코드','기준일','자료상태','적용시작','적용종료','근무조','순차','탕','발차지','발차시간','회차지','회차시간','도착지','도착시간','시각상태','시각근거일','시각신뢰도','영업종료형태','영업종료지','회송목적지','서비스역할','최종운행','상태','개정번호','변경사유','처리자','확정시간','원본근거','수정시간','시간기준지','시간기준시각','시간기준설명'];
}

function bus70RoutePartitionHeaderMap_(headers) {
  const result={};(headers||[]).forEach(function(header,index){result[String(header)]=index;});return result;
}

function bus70RoutePartitionSheet_(ss, rawRoute, kind, createIfMissing, rawDate) {
  const names=bus70RoutePartitionNames_(rawRoute,kind==='schedule'?rawDate:null);if(!ss||!names||['stops','schedule'].indexOf(kind)===-1)return null;
  const name=names[kind];let sheet=null;
  try{sheet=ss.getSheetByName(name);}catch(error){sheet=null;}
  if(!sheet&&!createIfMissing&&kind==='schedule'&&rawDate)return bus70RoutePartitionSheet_(ss,rawRoute,kind,false);
  if(!sheet&&createIfMissing&&typeof ss.insertSheet==='function'){
    sheet=ss.insertSheet(name);const headers=bus70RoutePartitionHeaders_(kind);
    if(typeof sheet.getMaxColumns==='function'&&sheet.getMaxColumns()<headers.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length-sheet.getMaxColumns());
    sheet.getRange(1,1,1,headers.length).setValues([headers]);if(typeof sheet.setFrozenRows==='function')sheet.setFrozenRows(1);
    if(kind==='schedule'&&rawDate)bus70SeedScheduleMonth_(ss,rawRoute,rawDate,sheet,headers);
  }
  if(sheet&&createIfMissing){
    const required=bus70RoutePartitionHeaders_(kind),current=(bus70PartitionRows_(sheet)[0]||[]).map(function(value){return String(value||'').trim();});
    if(!current.some(Boolean))sheet.getRange(1,1,1,required.length).setValues([required]);
    else required.forEach(function(header){if(current.indexOf(header)===-1){current.push(header);sheet.getRange(1,current.length).setValue(header);bus70InvalidatePartition_(sheet);}});
  }
  return sheet;
}

function bus70EnsureRoutePartitions_(ss, rawRoute, rawDate) {
  const names=bus70RoutePartitionNames_(rawRoute,rawDate);if(!names)return {ok:false,error:'ROUTE_REQUIRED'};
  const stops=bus70RoutePartitionSheet_(ss,names.route,'stops',true),schedule=bus70RoutePartitionSheet_(ss,names.route,'schedule',true,rawDate);
  return {ok:Boolean(stops&&schedule),route:names.route,stopSheet:names.stops,scheduleSheet:names.schedule,stopReady:Boolean(stops),scheduleReady:Boolean(schedule)};
}

function bus70RoutePartitionDateActive_(date, start, end) {
  const from=normalizeDate_(start),to=normalizeDate_(end);
  return (!from||date>=from)&&(!to||date<=to);
}

function bus70RoutePartitionNumber_(value) {
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const number=Number(value);return Number.isFinite(number)?number:null;
}

function bus70RouteScheduleTripFromRow_(row, c) {
  return {sequence:Number(row[c['순차']]||0),trip:Number(row[c['탕']]||0),startPlace:String(row[c['발차지']]||''),startTime:String(row[c['발차시간']]||''),turnPlace:String(row[c['회차지']]||''),turnTime:String(row[c['회차시간']]||''),endPlace:String(row[c['도착지']]||''),endTime:String(row[c['도착시간']]||''),phaseStatus:String(row[c['시각상태']]||''),phaseSourceDate:normalizeDate_(row[c['시각근거일']]),phaseConfidence:String(row[c['시각신뢰도']]||''),serviceEndType:String(row[c['영업종료형태']]||''),serviceEndPlace:String(row[c['영업종료지']]||''),deadheadDestination:String(row[c['회송목적지']]||''),serviceRole:String(row[c['서비스역할']]||''),finalService:String(row[c['최종운행']]||'').toUpperCase()==='Y',controlPoint:String(row[c['시간기준지']]||''),controlTime:String(row[c['시간기준시각']]||''),controlPurpose:String(row[c['시간기준설명']]||'')};
}

function bus70RouteScheduleLatestRows_(rows, c) {
  const latestTrips={};(rows||[]).forEach(function(row,index){
    const key=Number(row[c['순차']]||0)+'|'+Number(row[c['탕']]||0),effective=normalizeDate_(row[c['적용시작']])||normalizeDate_(row[c['운행일']])||'',revision=Number(row[c['개정번호']]||0),rank=effective+'|'+('000000'+revision).slice(-6);
    if(!latestTrips[key]||rank>latestTrips[key].rank||(rank===latestTrips[key].rank&&index>latestTrips[key].index))latestTrips[key]={row:row,rank:rank,index:index};
  });
  return Object.keys(latestTrips).map(function(key){return latestTrips[key].row;});
}

function bus70RouteStopsFromDb_(rawRoute, rawDate) {
  const names=bus70RoutePartitionNames_(rawRoute),date=normalizeDate_(rawDate);if(!names)return {configured:false,stops:[]};
  let ss,sheet;try{ss=SpreadsheetApp.getActiveSpreadsheet();sheet=bus70RoutePartitionSheet_(ss,names.route,'stops',false);}catch(error){return {configured:false,route:names.route,sheetName:names.stops,stops:[]};}
  if(!sheet)return {configured:false,route:names.route,sheetName:names.stops,stops:[]};
  const rows=bus70PartitionRows_(sheet);if(rows.length<2)return {configured:true,route:names.route,sheetName:names.stops,stops:[]};
  const c=bus70RoutePartitionHeaderMap_(rows[0]),active=rows.slice(1).map(function(row,index){return {row:row,index:index};}).filter(function(item){
    const row=item.row;
    const rowRoute=String(row[c['노선']]||names.route).replace(/\D/g,''),status=String(row[c['상태']]||'사용').toUpperCase();
    return rowRoute===names.route&&['N','중지','폐지','삭제'].indexOf(status)===-1&&(!date||bus70RoutePartitionDateActive_(date,row[c['적용시작']],row[c['적용종료']]));
  }),dataSets={};
  active.forEach(function(item){
    const row=item.row,dataSetId=c['자료세트ID']===undefined?'':String(row[c['자료세트ID']]||'').trim();if(!dataSetId)return;
    const sourceDate=normalizeDate_(row[c['자료기준일']])||normalizeDate_(row[c['적용시작']])||'',rank=sourceDate+'|'+('000000'+item.index).slice(-6);
    if(!dataSets[dataSetId]||rank>dataSets[dataSetId])dataSets[dataSetId]=rank;
  });
  const selectedDataSet=Object.keys(dataSets).sort(function(a,b){return dataSets[b].localeCompare(dataSets[a]);})[0]||'',scoped=selectedDataSet?active.filter(function(item){return String(item.row[c['자료세트ID']]||'').trim()===selectedDataSet;}):active,latest={};
  scoped.forEach(function(item){
    const row=item.row,id=String(row[c['stopId']]||names.route+'-STOP-'+('000'+(item.index+1)).slice(-3)),rank=normalizeDate_(row[c['적용시작']])||'';
    if(!latest[id]||rank>latest[id].rank||(rank===latest[id].rank&&item.index>latest[id].index))latest[id]={id:id,row:row,index:item.index,rank:rank};
  });
  const stops=Object.keys(latest).map(function(id){
    const item=latest[id],row=item.row,index=item.index;
    const name=String(row[c['정류장명']]||'').trim();if(!name)return null;
    return {id:id,name:name,number:String(row[c['정류장번호']]||''),order:Number(row[c['정류장순서']]||index+1),direction:String(row[c['방향']]||''),lat:bus70RoutePartitionNumber_(row[c['위도']]),lng:bus70RoutePartitionNumber_(row[c['경도']]),origin:String(row[c['기점']]||'').toUpperCase()==='Y',terminal:String(row[c['종점']]||'').toUpperCase()==='Y',turnaround:c['회차점']===undefined?false:String(row[c['회차점']]||'').toUpperCase()==='Y',effectiveStart:normalizeDate_(row[c['적용시작']]),effectiveEnd:normalizeDate_(row[c['적용종료']]),dataSetId:c['자료세트ID']===undefined?'':String(row[c['자료세트ID']]||''),externalRouteId:c['외부노선ID']===undefined?'':String(row[c['외부노선ID']]||''),externalStopId:c['외부정류장ID']===undefined?'':String(row[c['외부정류장ID']]||''),sourceDate:c['자료기준일']===undefined?'':normalizeDate_(row[c['자료기준일']]),provider:c['자료제공처']===undefined?'':String(row[c['자료제공처']]||''),coordinateProvider:c['좌표제공처']===undefined?'':String(row[c['좌표제공처']]||''),coordinateStatus:c['좌표상태']===undefined?'':String(row[c['좌표상태']]||''),reviewStatus:c['검토상태']===undefined?'':String(row[c['검토상태']]||'')};
  }).filter(Boolean).sort(function(a,b){return a.order-b.order||a.direction.localeCompare(b.direction);});
  return {configured:true,route:names.route,sheetName:names.stops,dataSetId:selectedDataSet,stops:stops};
}

function bus70RouteScheduleFromDb_(rawRoute, rawDate, preferredVersion) {
  const names=bus70RoutePartitionNames_(rawRoute,rawDate),date=normalizeDate_(rawDate);if(!names||!date)return {configured:false,available:false,trips:[]};
  let ss,sheet;try{ss=SpreadsheetApp.getActiveSpreadsheet();sheet=bus70RoutePartitionSheet_(ss,names.route,'schedule',false,rawDate);}catch(error){return {configured:false,available:false,route:names&&names.route||'',sheetName:names&&names.schedule||'',trips:[]};}
  if(!sheet)return {configured:false,available:false,route:names.route,sheetName:sheet&&sheet.getName?sheet.getName():names.schedule,trips:[]};
  const rows=bus70PartitionRows_(sheet);if(rows.length<2)return {configured:true,available:false,route:names.route,sheetName:sheet&&sheet.getName?sheet.getName():names.schedule,trips:[]};
  const c=bus70RoutePartitionHeaderMap_(rows[0]),targetClass=bus70ServiceClassForDate_(date);let candidates=rows.slice(1).filter(function(row){
    const rowRoute=String(row[c['노선']]||names.route).replace(/\D/g,''),serviceDate=normalizeDate_(row[c['운행일']]),status=String(row[c['상태']]||'사용').toUpperCase();
    return rowRoute===names.route&&['N','중지','폐지','삭제'].indexOf(status)===-1&&(!serviceDate||serviceDate===date)&&bus70RoutePartitionDateActive_(date,row[c['적용시작']],row[c['적용종료']]);
  });
  const exact=candidates.filter(function(row){return normalizeDate_(row[c['운행일']])===date;});if(exact.length)candidates=exact;
  else{
    const matchingClass=candidates.filter(function(row){const rowClass=bus70ServiceClassForDate_(date,row[c['운행유형코드']]||row[c['운행구분']]);return bus70ServiceClassMatches_(rowClass,targetClass);});
    if(matchingClass.length)candidates=matchingClass;
  }
  const preferred=String(preferredVersion||'');if(preferred&&candidates.some(function(row){return String(row[c['시간표버전']]||'')===preferred;}))candidates=candidates.filter(function(row){return String(row[c['시간표버전']]||'')===preferred;});
  else if(candidates.length){
    const versions={};candidates.forEach(function(row){const version=String(row[c['시간표버전']]||''),rank=normalizeDate_(row[c['운행일']])||normalizeDate_(row[c['적용시작']])||'';if(!versions[version]||rank>versions[version])versions[version]=rank;});
    const selected=Object.keys(versions).sort(function(a,b){return versions[b].localeCompare(versions[a])||b.localeCompare(a);})[0];candidates=candidates.filter(function(row){return String(row[c['시간표버전']]||'')===selected;});
  }
  candidates=bus70RouteScheduleLatestRows_(candidates,c);
  const version=candidates.length?String(candidates[0][c['시간표버전']]||''):'',serviceType=candidates.length?String(candidates[0][c['운행구분']]||''):'',shift=candidates.length?String(candidates[0][c['근무조']]||''):'',serviceClass=candidates.length?bus70ServiceClassForDate_(date,candidates[0][c['운행유형코드']]||serviceType):targetClass,sourceDate=candidates.length?normalizeDate_(candidates[0][c['기준일']]||candidates[0][c['운행일']])||date:'';
  const trips=bus70PrivateNormalizeTrips_(candidates.map(function(row){return bus70RouteScheduleTripFromRow_(row,c);}));
  return {configured:true,available:trips.length>0,route:names.route,sheetName:sheet&&sheet.getName?sheet.getName():names.schedule,scheduleVersion:version,serviceType:serviceType||bus70ServiceClassLabel_(serviceClass),serviceClass:serviceClass,shift:shift,sourceDate:sourceDate,dataStatus:candidates.length?String(candidates[0][c['자료상태']]||'CONFIRMED'):'',trips:trips,patternSummary:bus70RoutePatternSummary_(trips)};
}

// 확정 자료가 없는 날짜에는 같은 운행유형의 가장 가까운 과거 시간표만
// 예측 초안으로 사용합니다. 이 결과는 소장이 저장하기 전까지 확정 자료가 아닙니다.
function bus70RouteSchedulePatternFromDb_(rawRoute, rawDate) {
  const names=bus70RoutePartitionNames_(rawRoute),date=normalizeDate_(rawDate);if(!names||!date)return {configured:false,available:false,predicted:false,trips:[]};
  let ss,rows;try{ss=SpreadsheetApp.getActiveSpreadsheet();rows=bus70SchedulePatternRows_(ss,names.route,date);}catch(error){return {configured:false,available:false,predicted:false,route:names&&names.route||'',trips:[]};}
  if(!rows.length)return {configured:false,available:false,predicted:false,route:names.route,sheetName:names.schedule,trips:[]};
  if(rows.length<2)return {configured:true,available:false,predicted:false,route:names.route,sheetName:names.schedule,trips:[]};
  const c=bus70RoutePartitionHeaderMap_(rows[0]),targetClass=bus70ServiceClassForDate_(date),groups={};
  rows.slice(1).forEach(function(row,index){
    const rowRoute=String(row[c['노선']]||names.route).replace(/\D/g,''),sourceDate=normalizeDate_(row[c['운행일']]||row[c['기준일']]),status=String(row[c['상태']]||'사용').toUpperCase(),dataStatus=String(row[c['자료상태']]||'CONFIRMED').toUpperCase();
    if(rowRoute!==names.route||!sourceDate||sourceDate>=date||['N','중지','폐지','삭제'].indexOf(status)!==-1||dataStatus==='DRAFT'||dataStatus==='PREDICTED')return;
    const serviceType=String(row[c['운행구분']]||''),candidateClass=bus70ServiceClassForDate_(sourceDate,row[c['운행유형코드']]||serviceType);
    if(!bus70ServiceClassMatches_(candidateClass,targetClass))return;
    const version=String(row[c['시간표버전']]||''),key=sourceDate+'|'+version+'|'+candidateClass;
    if(!groups[key])groups[key]={sourceDate:sourceDate,version:version,serviceType:serviceType,serviceClass:candidateClass,shift:String(row[c['근무조']]||''),rows:[],firstIndex:index};
    groups[key].rows.push(row);
  });
  const choices=Object.keys(groups).map(function(key){const group=groups[key];group.rows=bus70RouteScheduleLatestRows_(group.rows,c);group.trips=bus70PrivateNormalizeTrips_(group.rows.map(function(row){return bus70RouteScheduleTripFromRow_(row,c);}));group.signature=bus70RouteTripPatternSignature_(group.trips);return group;}).filter(function(group){return group.trips.length;}).sort(function(a,b){
    const aSpecific=a.serviceClass===targetClass?1:0,bSpecific=b.serviceClass===targetClass?1:0;return bSpecific-aSpecific||b.sourceDate.localeCompare(a.sourceDate)||b.version.localeCompare(a.version);
  });
  if(!choices.length)return {configured:true,available:false,predicted:false,route:names.route,sheetName:names.schedule,serviceClass:targetClass,trips:[]};
  const selected=choices[0],evidenceCount=choices.filter(function(group){return group.serviceClass===selected.serviceClass&&group.signature===selected.signature;}).length,confidence=selected.serviceClass===targetClass?(evidenceCount>=2?'HIGH':'MEDIUM'):'LOW';
  return {configured:true,available:true,predicted:true,route:names.route,date:date,sheetName:names.schedule,scheduleVersion:selected.version,serviceType:selected.serviceType||bus70ServiceClassLabel_(targetClass),serviceClass:targetClass,shift:selected.shift,sourceDate:selected.sourceDate,evidenceCount:evidenceCount,confidence:confidence,trips:selected.trips,patternSignature:selected.signature,patternSummary:bus70RoutePatternSummary_(selected.trips)};
}

function bus70SyncRouteReferenceToDb_(ss, rawRoute, reference) {
  const names=bus70RoutePartitionNames_(rawRoute);if(!names||!reference||!reference.ok)return {ok:false,error:'REFERENCE_REQUIRED'};
  const storage=bus70EnsureRoutePartitions_(ss,names.route,reference.date);if(!storage.ok)return storage;
  const date=normalizeDate_(reference.date),now=new Date(),stopSheet=bus70RoutePartitionSheet_(ss,names.route,'stops',false),scheduleSheet=bus70RoutePartitionSheet_(ss,names.route,'schedule',false,reference.date);let stopAdded=0,scheduleAdded=0;const schedulePending=[];
  const stopRows=stopSheet.getDataRange().getDisplayValues(),stopHeaders=stopRows[0],stopColumns=bus70RoutePartitionHeaderMap_(stopHeaders),stopIds={};stopRows.slice(1).forEach(function(row){stopIds[String(row[stopColumns['stopId']]||'')]=true;});
  ((reference.routeProfile&&reference.routeProfile.stops)||[]).forEach(function(stop,index){
    const id=String(stop.id||names.route+'-STOP-'+('000'+(index+1)).slice(-3));if(stopIds[id])return;
    const row=new Array(stopHeaders.length).fill('');row[stopColumns['stopId']]=id;row[stopColumns['노선']]=names.route;row[stopColumns['방향']]=String(stop.direction||'');row[stopColumns['정류장순서']]=Number(stop.order||index+1);row[stopColumns['정류장명']]=String(stop.name||'');row[stopColumns['정류장번호']]=String(stop.number||'');row[stopColumns['위도']]=stop.lat||'';row[stopColumns['경도']]=stop.lng||'';row[stopColumns['기점']]=stop.origin?'Y':'';row[stopColumns['종점']]=stop.terminal?'Y':'';row[stopColumns['적용시작']]=date;row[stopColumns['상태']]='사용';row[stopColumns['원본근거']]=String(reference.sourceNote||'승인 노선 기준자료');row[stopColumns['수정시간']]=now;stopSheet.appendRow(row);bus70InvalidatePartition_(stopSheet);stopIds[id]=true;stopAdded++;
  });
  const scheduleRows=bus70PartitionRows_(scheduleSheet),scheduleHeaders=scheduleRows[0],scheduleColumns=bus70RoutePartitionHeaderMap_(scheduleHeaders);
  const existing={};scheduleRows.slice(1).forEach(function(row,index){
    const key=[normalizeDate_(row[scheduleColumns['운행일']]),String(row[scheduleColumns['시간표버전']]||''),Number(row[scheduleColumns['순차']]||0),Number(row[scheduleColumns['탕']]||0)].join('|'),revision=Number(row[scheduleColumns['개정번호']]||0);
    if(!existing[key]||revision>existing[key].revision||(revision===existing[key].revision&&index>existing[key].index))existing[key]={row:row,revision:revision,index:index};
  });
  (reference.trips||[]).forEach(function(trip){
    const key=[date,String(reference.scheduleVersion||''),Number(trip.sequence||0),Number(trip.trip||0)].join('|'),current=existing[key],requestedRevision=Number(reference.revision||0),dataStatus=String(reference.dataStatus||'CONFIRMED'),currentStatus=current?String(current.row[scheduleColumns['자료상태']]||'CONFIRMED'):'',phaseUpgrade=current&&['회차지','회차시간','도착지','도착시간'].some(function(header){return !String(current.row[scheduleColumns[header]]||'')&&String(trip[header==='회차지'?'turnPlace':header==='회차시간'?'turnTime':header==='도착지'?'endPlace':'endTime']||'');});
    if(current&&requestedRevision<=current.revision&&!(dataStatus==='CONFIRMED'&&currentStatus!=='CONFIRMED')&&!phaseUpgrade)return;
    const revision=current?Math.max(requestedRevision,current.revision+1):requestedRevision,row=new Array(scheduleHeaders.length).fill(''),serviceClass=String(reference.serviceClass||bus70ServiceClassForDate_(date,reference.serviceType));
    row[scheduleColumns['시간표ID']]='R'+names.route+'-'+date.replace(/-/g,'')+'-'+('00'+Number(trip.sequence||0)).slice(-3)+'-'+('00'+Number(trip.trip||0)).slice(-2)+(revision?'-R'+revision:'');row[scheduleColumns['노선']]=names.route;row[scheduleColumns['운행일']]=date;row[scheduleColumns['시간표버전']]=String(reference.scheduleVersion||'');row[scheduleColumns['운행구분']]=String(reference.serviceType||bus70ServiceClassLabel_(serviceClass));row[scheduleColumns['운행유형코드']]=serviceClass;row[scheduleColumns['기준일']]=String(reference.predictionSourceDate||reference.sourceDate||date);row[scheduleColumns['자료상태']]=dataStatus;row[scheduleColumns['적용시작']]=date;row[scheduleColumns['적용종료']]=date;row[scheduleColumns['근무조']]=String(reference.shift||'');row[scheduleColumns['순차']]=Number(trip.sequence||0);row[scheduleColumns['탕']]=Number(trip.trip||0);row[scheduleColumns['발차지']]=String(trip.startPlace||'');row[scheduleColumns['발차시간']]=String(trip.startTime||'');row[scheduleColumns['회차지']]=String(trip.turnPlace||'');row[scheduleColumns['회차시간']]=String(trip.turnTime||'');row[scheduleColumns['도착지']]=String(trip.endPlace||'');row[scheduleColumns['도착시간']]=String(trip.endTime||'');row[scheduleColumns['시각상태']]=String(trip.phaseStatus||'');row[scheduleColumns['시각근거일']]=String(trip.phaseSourceDate||'');row[scheduleColumns['시각신뢰도']]=String(trip.phaseConfidence||'');row[scheduleColumns['영업종료형태']]=String(trip.serviceEndType||'');row[scheduleColumns['영업종료지']]=String(trip.serviceEndPlace||'');row[scheduleColumns['회송목적지']]=String(trip.deadheadDestination||'');row[scheduleColumns['서비스역할']]=String(trip.serviceRole||'');row[scheduleColumns['최종운행']]=trip.finalService?'Y':'';row[scheduleColumns['상태']]='사용';row[scheduleColumns['개정번호']]=revision;row[scheduleColumns['변경사유']]=String(reference.revisionReason||'');row[scheduleColumns['처리자']]=String(reference.confirmedBy||'');row[scheduleColumns['확정시간']]=reference.confirmedAt||'';row[scheduleColumns['원본근거']]=String(reference.sourceNote||'승인 노선 기준자료');row[scheduleColumns['수정시간']]=now;row[scheduleColumns['시간기준지']]=String(trip.controlPoint||'');row[scheduleColumns['시간기준시각']]=String(trip.controlTime||'');row[scheduleColumns['시간기준설명']]=String(trip.controlPurpose||'');schedulePending.push(row);existing[key]={row:row,revision:revision,index:scheduleRows.length+scheduleAdded};scheduleAdded++;
  });
  if(schedulePending.length){bus70AppendPartitionRows_(scheduleSheet,schedulePending,scheduleHeaders.length);}
  return {ok:true,route:names.route,stopSheet:names.stops,scheduleSheet:storage.scheduleSheet,stopAdded:stopAdded,scheduleAdded:scheduleAdded};
}

function bus70PrivateRouteProfile_(rawRoute, source, rawDate, dbSchedule) {
  const route=String(rawRoute||'').replace(/\D/g,''),profile=source&&source.routeProfile||{},stops=[];
  const names=bus70RoutePartitionNames_(route),stored=rawDate?bus70RouteStopsFromDb_(route,rawDate):{configured:false,stops:[]},sourceStops=stored.stops.length?stored.stops:(Array.isArray(source&&source.stops)?source.stops:Array.isArray(profile.stops)?profile.stops:[]);
  sourceStops.forEach(function(item,index){
    if(typeof item==='string'){if(item.trim())stops.push({id:route+'-STOP-'+('000'+(index+1)).slice(-3),name:item.trim(),order:index+1,direction:''});return;}
    if(!item||typeof item!=='object')return;
    const name=String(item.name||item.stopName||'').trim();if(!name)return;
    stops.push({id:String(item.id||item.stopId||route+'-STOP-'+('000'+(index+1)).slice(-3)),name:name,number:String(item.number||''),order:Number(item.order||index+1),direction:String(item.direction||''),lat:bus70RoutePartitionNumber_(item.lat),lng:bus70RoutePartitionNumber_(item.lng),origin:Boolean(item.origin),terminal:Boolean(item.terminal),turnaround:Boolean(item.turnaround),provider:String(item.provider||''),externalStopId:String(item.externalStopId||''),effectiveStart:String(item.effectiveStart||''),effectiveEnd:String(item.effectiveEnd||'')});
  });
  return {route:route,displayName:String(profile.displayName||source&&source.displayName||route+'번'),stops:stops,stopCount:stops.length,boardAvailable:Boolean(source&&Array.isArray(source.assignments)),timetableAvailable:Boolean(dbSchedule&&dbSchedule.available||source&&(Array.isArray(source.tripTimings)||Array.isArray(source.timings)||Array.isArray(source.departures))),storage:{partitioned:true,stopSheet:names&&names.stops||'',scheduleSheet:dbSchedule&&dbSchedule.sheetName||names&&names.schedule||'',stopSource:stored.stops.length?'ROUTE_DB':'PRIVATE_REFERENCE',scheduleSource:dbSchedule&&dbSchedule.available?'ROUTE_DB':'PRIVATE_REFERENCE'},viewModes:['SUMMARY','ROUTE']};
}

function bus70PrivateRouteStatus_() {
  const routes={};
  let source='NONE';
  if(typeof BUS70_PRIVATE_ROUTE_DATA_!=='undefined'&&BUS70_PRIVATE_ROUTE_DATA_)source='LOCAL_PRIVATE_MODULE';
  else{try{if(PropertiesService.getScriptProperties().getProperty('BUS70_PRIVATE_ROUTE_DATA_JSON'))source='SCRIPT_PROPERTY';}catch(error){}}
  const data=bus70PrivateData_();
  Object.keys(data||{}).filter(function(route){return /^\d+$/.test(route);}).forEach(function(route){routes[route]=Object.keys(data[route]||{}).sort();});
  return {configured:Boolean(data&&bus70PrivateConfig_()),source:source,routes:routes,shiftConfigured:Boolean(bus70PrivateConfig_()),bootstrapAccountsConfigured:bus70PrivateBootstrapAccounts_().length>0,driverOnlyIdsConfigured:bus70PrivateDriverOnlyIds_().length>0};
}

