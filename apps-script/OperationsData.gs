/* Relational read model over the private operational tables.
 * No snapshots of driver data are shipped with the app. Read-only: never infer
 * actual times, fixed vehicles, assignments, or a missing day's schedule.
 */
function bus70DbKey_(parts) { return JSON.stringify(parts.map(function(v){return String(v===undefined||v===null?'':v);})); }
function bus70DbObjects_(values) {
  if(!values||!values.length)return [];
  const headers=values[0];return values.slice(1).filter(function(row){return row.some(function(v){return v!==''&&v!==null&&v!==undefined;});}).map(function(row,index){
    const item={_row:index+2};headers.forEach(function(h,i){item[h]=row[i]===undefined?'':row[i];});return item;
  });
}
function bus70DbText_(value){return String(value===undefined||value===null?'':value).trim();}
function bus70DbActive_(row,date,from,to){
  const a=normalizeDate_(row[from]),b=normalizeDate_(row[to]);return (!a||a<=date)&&(!b||date<=b);
}
function bus70DbOverview_(body,requesterId){
  if(!bus70IsManager_(requesterId))return {ok:false,error:'MANAGER_REQUIRED',message:'소장·마스터 권한이 필요합니다.'};
  const route=bus70DbText_(body.route),date=normalizeDate_(body.date);
  if(!/^(ALL|[1-9]\d*)$/.test(route)||!/^\d{4}-\d{2}-\d{2}$/.test(date))return {ok:false,error:'SCOPE_REQUIRED',message:'노선과 운행일을 확인하세요.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(),memo={},stats={tablesRead:0,rowsRead:0},issues=[];
  function table(name){
    if(Object.prototype.hasOwnProperty.call(memo,name))return memo[name];
    const sheet=ss.getSheetByName(name),values=sheet?bus70PartitionRows_(sheet):[];
    stats.tablesRead++;stats.rowsRead+=Math.max(0,values.length-1);return memo[name]=bus70DbObjects_(values);
  }
  function issue(code,entity,message){issues.push({code:code,entity:entity,message:message});}
  function unique(rows,column,entity){
    const map={};rows.forEach(function(r){const k=bus70DbText_(r[column]);if(!k)return;
      if(Object.prototype.hasOwnProperty.call(map,k)){issue('DUPLICATE_ID',entity,'중복 식별값 · '+r._row+'행');map[k]=null;}else map[k]=r;
    });return map;
  }
  const master=table('노선마스터DB'),available=master.filter(function(r){return r['사용여부']==='Y'&&bus70DbActive_(r,date,'적용시작일','적용종료일');});
  const scope=available.filter(function(r){return route==='ALL'||bus70DbText_(r.routeId)===route;});
  if(!scope.length)return {ok:false,error:'ROUTE_NOT_REGISTERED',message:'사용 중인 노선 기준이 없습니다.'};
  const drivers=unique(table('기사DB'),'driverId','기사DB'),vehicles=unique(table('차량DB'),'vehicleId','차량DB');
  const days=unique(table('운행일DB'),'serviceDayId','운행일DB'),versions=unique(table('시간표버전DB'),'versionId','시간표버전DB');
  const dispatches=table('배차DB').filter(function(r){return normalizeDate_(r['날짜'])===date&&r['상태']==='확정';});
  const fixed=table('고정차량배정DB').filter(function(r){return r['상태']==='확정'&&bus70DbActive_(r,date,'적용시작일','적용종료일');});
  const rows=[],routes=[];
  scope.forEach(function(routeRow){
    const id=bus70DbText_(routeRow.routeId),issueStart=issues.length,names=bus70RoutePartitionNames_(id,date);
    const rawPlans=table(names.schedule).filter(function(r){return bus70DbText_(r['노선'])===id&&normalizeDate_(r['운행일'])===date&&['중지','삭제','폐지','N'].indexOf(bus70DbText_(r['상태']))<0;});
    const plans={},revisionKeys={};
    rawPlans.forEach(function(p){
      const seq=Number(p['순차']),trip=Number(p['탕']),revision=Number(p['개정번호']||0),version=bus70DbText_(p['시간표버전']),shift=bus70DbText_(p['근무조']);
      if(!Number.isInteger(seq)||seq<1||!Number.isInteger(trip)||trip<1||!Number.isInteger(revision)||revision<0||!version||!shift){issue('PLAN_KEY',names.schedule,'순차·탕·개정·버전·근무조 확인 · '+p._row+'행');return;}
      const key=bus70DbKey_([id,date,version,shift,seq,trip]),revisionKey=bus70DbKey_([key,revision]);
      if(revisionKeys[revisionKey]){issue('DUPLICATE_REVISION',names.schedule,'같은 운행계획 개정 중복 · '+p._row+'행');revisionKeys[revisionKey].conflict=true;p.conflict=true;}
      revisionKeys[revisionKey]=p;
      if(!plans[key]||revision>Number(plans[key]['개정번호']||0))plans[key]=p;
      if(!versions[version]||bus70DbText_(versions[version]['노선'])!==id)issue('PLAN_VERSION',names.schedule,'노선·시간표 버전 연결 확인 · '+p._row+'행');
    });
    const planGroups={};Object.keys(plans).forEach(function(k){const p=plans[k];if(p.conflict)return;
      const g=bus70DbKey_([p['시간표버전'],p['근무조'],Number(p['순차'])]);if(!planGroups[g])planGroups[g]=[];planGroups[g].push(Number(p['탕']));
    });
    Object.keys(planGroups).forEach(function(k){planGroups[k].sort(function(a,b){return a-b;});});
    const selected=dispatches.filter(function(r){return bus70DbText_(r['노선'])===id;}),slots={},assignedDrivers={},assignedVehicles={};
    selected.forEach(function(d){
      const shift=bus70DbText_(d['근무조']),seq=Number(d['순차']),driverId=bus70DbText_(d['기사ID']),vehicleId=bus70DbText_(d['차량ID']);
      const driver=drivers[driverId],vehicle=vehicles[vehicleId],day=days[bus70DbText_(d['운행일ID'])],version=bus70DbText_(d['시간표버전']);
      const slot=bus70DbKey_([id,date,shift,seq]),driverKey=bus70DbKey_([shift,driverId]),vehicleKey=bus70DbKey_([shift,vehicleId]);
      const trips=planGroups[bus70DbKey_([version,shift,seq])]||[],problems=[];
      if(slots[slot])problems.push('동일 순차 중복');slots[slot]=true;
      if(assignedDrivers[driverKey])problems.push('동일 기사 중복');assignedDrivers[driverKey]=true;
      if(assignedVehicles[vehicleKey])problems.push('동일 차량 중복');assignedVehicles[vehicleKey]=true;
      if(!driver)problems.push('기사 ID');if(!vehicle)problems.push('차량 ID');
      if(!day||normalizeDate_(day['운행일'])!==date||bus70DbText_(day['노선'])!==id||bus70DbText_(day['근무조'])!==shift||bus70DbText_(day['시간표버전'])!==version)problems.push('운행일 연결');
      if(!trips.length)problems.push('해당 버전·순차 시간표 없음');
      const fixedMatches=fixed.filter(function(f){return bus70DbText_(f['노선'])===id&&bus70DbText_(f['기사ID'])===driverId&&bus70DbText_(f['근무조'])===shift;});
      const fixedVehicles=fixedMatches.map(function(f){const v=vehicles[bus70DbText_(f['차량ID'])];if(!v){problems.push('고정차량 ID');return '';}return bus70DbText_(v['차량번호']);}).filter(Boolean);
      if(fixedMatches.length>1)problems.push('고정차량 적용기간 중복');
      if(problems.length)issue('DISPATCH_RELATION','배차DB',id+'번 '+shift+'조 '+seq+'순차 · '+problems.join(', '));
      rows.push({route:id,shift:shift,sequence:seq,driverName:driver?bus70DbText_(driver['성명']):'기사 연결 확인',vehicleNo:vehicle?bus70DbText_(vehicle['차량번호']):'차량 연결 확인',fixedVehicles:fixedVehicles,tripNumbers:trips,version:version,serviceDayId:bus70DbText_(d['운행일ID']),state:problems.length?'확인 필요':'연결 확인'});
    });
    table(names.stops);
    const stops=bus70RouteStopsFromDb_(id,date),occurrences={},orders={};
    (stops.stops||[]).forEach(function(s){const k=bus70DbKey_([id,s.dataSetId,s.id]);
      if(occurrences[k]||orders[s.order])issue('STOP_OCCURRENCE',names.stops,'정류장 버전·순서 중복');occurrences[k]=true;orders[s.order]=true;
      if(!Number.isFinite(s.lat)||!Number.isFinite(s.lng)||Math.abs(s.lat)>90||Math.abs(s.lng)>180)issue('STOP_COORDINATE',names.stops,'정류장 좌표 확인');
    });
    const gate=bus70DbText_(routeRow['전착경고기준정류장ID']),gateStop=(stops.stops||[]).find(function(s){return String(s.externalStopId||'')===gate;});
    if(!gateStop)issue('ARRIVAL_GATE','노선마스터DB',id+'번 전착 안내 기준 정류장 연결 확인');
    routes.push({route:id,name:bus70DbText_(routeRow['노선명']),stopCount:(stops.stops||[]).length,stopVersion:stops.dataSetId||'',planCount:Object.keys(plans).length,dispatchCount:selected.length,fixedCount:fixed.filter(function(f){return bus70DbText_(f['노선'])===id;}).length,issues:issues.length-issueStart,ruleLabel:gateStop?gateStop.name+' 통과 후 정류장 도착마다 · '+bus70DbText_(routeRow['전착경고분'])+'분 전착':'기준 확인 필요',scheduleSheet:names.schedule});
  });
  rows.sort(function(a,b){return Number(a.route)-Number(b.route)||a.shift.localeCompare(b.shift)||a.sequence-b.sequence;});
  return {ok:true,schemaVersion:1,route:route,date:date,checkedAt:new Date().toISOString(),routes:routes,rows:rows,issues:issues,stats:stats,readOnly:true};
}
