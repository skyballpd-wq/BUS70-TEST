/* Same-direction spacing assistance; observed spacing and timetable targets stay separate. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Bus70Headway=api;})(typeof window==='object'?window:this,function(){
  'use strict';
  const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  function sample(state,scope,nav,now){
    const key=[scope.route,scope.date,scope.vehicleId,scope.dispatchId,scope.trip,nav?.returnConfirmed?'return':'out'].join('|');
    if(state.key!==key)state={key,samples:[],alerts:{}};
    state.now=now;state.vehicleId=scope.vehicleId;state.running=scope.running;
    if(!scope.running){state.neighbours={};state.observations={};state.appObservations={};}
    const i=nav?.matchedIndex;
    if(!scope.running||!nav?.configured||nav.retained||!Number.isInteger(i)||!numeric(nav.timestamp)||now-nav.timestamp>10000||now<nav.timestamp){state.last=null;return state;}
    now=Number(nav.timestamp);const last=state.last;
    if(last&&i!==last.index){
      const elapsed=now-last.at,steps=i-last.index;
      if(steps===1&&elapsed>=10000&&elapsed<=300000)state.samples.push({at:now,seconds:elapsed/1000});
      else if(steps<0||elapsed>300000)state.samples=[];
      state.last={index:i,at:now};
    }else if(!last)state.last={index:i,at:now};
    state.samples=state.samples.filter(s=>now-s.at<=900000).slice(-8);
    return state;
  }
  function pace(state){
    const values=(state.samples||[]).filter(s=>numeric(s.seconds)&&s.seconds>=10&&s.seconds<=300&&(!numeric(state.now)||state.now-s.at<=900000)).map(s=>s.seconds).sort((a,b)=>a-b);
    return values.length>=3?values[Math.floor(values.length/2)]:null;
  }
  function lastDirection(trip,nav){
    const type=String(trip.serviceEndType||''),role=String(trip.serviceRole||'');
    if(type==='UPBOUND_LAST'||role==='FINAL_UPBOUND_LAST')return '상행';
    if(type==='ROUND_TRIP_LAST'||type==='DOWNBOUND_LAST'||role==='FINAL_ROUND_TRIP_LAST'||role==='FINAL_DOWNBOUND_LAST'){
      const path=nav?.path,pivot=path?.pivotIndex;
      if(nav?.returnConfirmed||Number.isInteger(pivot)&&pivot>=0&&nav?.matchedIndex>pivot)return '하행';
    }
    return '';
  }
  // Each phone is authenticated and bound to a running trip by the server.
  // Keep its passage history separate from GBIS. Cached responses are not new fixes.
  function observePhones(state,scope,nav,fleet,now){
    state.appAvailable=false;const path=nav?.path;
    if(!scope.running||!nav?.configured||nav.retained||nav.waiting||!numeric(nav.timestamp)||now-nav.timestamp<0||now-nav.timestamp>10000||fleet.error||fleet.route!==scope.route||fleet.date!==scope.date||!path)return;
    const ownStop=path.stops[nav.matchedIndex];if(!ownStop)return;
    const own={vehicleId:scope.vehicleId,matchedStopOrder:ownStop.order,recordedAt:new Date(Number(nav.timestamp)).toISOString(),dispatchId:scope.dispatchId,trip:scope.trip,running:true,accuracyM:0};
    // Native phones can send a stationary heartbeat every 60 seconds.
    // Retain bounded HISTORY for 90 seconds, but keep live positions at 45.
    const next={};
    for(const [id,old] of Object.entries(state.appObservations||{})){
      if(now>=old.at&&now-old.at<=90000)next[id]=old;
    }
    const rows=[own,...(fleet.positions||[]).filter(p=>p.vehicleId!==scope.vehicleId)];
    for(const p of rows){
      const at=Date.parse(p.recordedAt),stop=path.stops.find(s=>Number(s.order)===Number(p.matchedStopOrder));
      const binding=[p.dispatchId,p.trip].join('|'),old=next[p.vehicleId];
      if(!p.vehicleId||rows.filter(q=>q.vehicleId===p.vehicleId).length!==1||!p.dispatchId||!(Number(p.trip)>0)||!stop||!numeric(p.accuracyM)||p.accuracyM<0||p.accuracyM>60||!Number.isFinite(at)||now<at||now-at>90000||p.running!==true||(p!==own&&(p.route!==scope.route||p.date!==scope.date))){
        delete next[p.vehicleId];continue;
      }
      const order=Number(stop.order),leg=stop.direction||'';
      if(now-at>45000){
        // A stale response can retain an identical previous observation only.
        if(!old||old.binding!==binding||old.leg!==leg||old.at!==at||old.order!==order)delete next[p.vehicleId];
        continue;
      }
      const continuous=old&&old.binding===binding&&old.leg===leg&&at>=old.at&&at-old.at<=90000&&order>=old.order;
      if(continuous&&at===old.at){if(order!==old.order)delete next[p.vehicleId];continue;}
      const passages=continuous?old.passages.filter(v=>at-v.hi<=1800000).slice(-39):[];
      if(continuous&&order===old.order+1)passages.push({order,lo:old.at,hi:at});
      next[p.vehicleId]={order,leg,at,binding,passages};
    }
    state.appObservations=next;state.appAvailable=Boolean(next[scope.vehicleId]&&now-next[scope.vehicleId].at<=10000);
  }
  // Reuse route-wide responses already received. These are bounded passage
  // intervals, never exact terminal headways or fabricated timetable times.
  function observeFleet(state,scope,nav,fleet,peers,now){
    state.now=now;state.vehicleId=scope.vehicleId;state.observationsAvailable=false;
    state.navigation=nav;
    observePhones(state,scope,nav,fleet,now);
    const ref=fleet.crossCheck,items=ref?.fleet||[],path=nav?.path;
    const at=Number(ref?.fetchedAt||Math.max(0,...items.map(p=>Number(p.fetchedAt)||0)));
    const usable=scope.running&&nav?.configured&&!nav.retained&&!fleet.error&&!ref?.error&&fleet.route===scope.route&&fleet.date===scope.date&&at>0&&now>=at&&now-at<=60000;
    if(usable){
      const valid=items.filter(p=>p.source==='GYEONGGI_BUS_LOCATION_V2'&&p.positionBasis==='PROVIDER_STOP_REFERENCE'&&p.route===scope.route&&p.date===scope.date&&p.vehicleId&&Number(p.fetchedAt)===at&&[0,1,2].includes(p.stateCd));
      if(at!==state.fleetAt){
        const next={};
        for(const p of valid){
          if(valid.filter(q=>q.vehicleId===p.vehicleId).length!==1)continue;
          const stop=path?.stops.find(s=>Number(s.order)===Number(p.matchedStopOrder));if(!stop)continue;
          const old=state.observations?.[p.vehicleId],order=Number(stop.order),leg=stop.direction||'';
          const continuous=old&&at>old.at&&at-old.at<=90000&&old.leg===leg&&order>=old.order;
          const passages=continuous?old.passages.filter(v=>at-v.hi<=1800000).slice(-39):[];
          if(continuous&&order===old.order+1)passages.push({order,lo:old.at,hi:at});
          next[p.vehicleId]={order,leg,at,passages};
        }
        state.observations=next;state.fleetAt=at;
      }
      const own=state.observations?.[scope.vehicleId],phoneOrder=path?.stops[nav.matchedIndex]?.order;
      state.observationsAvailable=Boolean(own&&numeric(phoneOrder)&&Math.abs(own.order-Number(phoneOrder))<=1);
    }
    state.neighbours=state.neighbours||{};
    for(const side of ['front','rear']){
      const peer=peers.find(p=>p.side===side&&p.rank===1),previous=state.neighbours[side];
      if(peer?.fresh!==false&&peer?.vehicle){
        const changed=previous&&previous.peer.vehicle!==peer.vehicle;
        state.neighbours[side]={peer:{...peer},at:now-Number(peer.age||0)*1000,changedUntil:changed?now+45000:previous?.changedUntil||0};
      }else if(previous&&now-previous.at>180000)delete state.neighbours[side];
    }
    return state;
  }
  function observedGap(peer,side,state){
    if(!peer||peer.fresh===false||peer.positionDisagreement)return null;
    const phone=peer.source==='APP_GPS'&&!peer.reference,observations=phone?state.appObservations:state.observations;
    if(phone?!state.appAvailable:!peer.reference||!state.observationsAvailable||state.now-state.fleetAt>60000)return null;
    const own=observations?.[state.vehicleId],other=observations?.[peer.vehicle];
    if(phone&&(!own||!other||state.now-own.at>10000||state.now-other.at>45000||other.binding!==peer.binding))return null;
    if(!own||!other||!own.leg||own.leg!==other.leg||other.order!==Number(peer.order)||(side==='front'?other.order<=own.order:other.order>=own.order))return null;
    if(Object.values(observations).filter(v=>v.leg===own.leg&&v.order===other.order&&(!phone||state.now-v.at<=45000)).length!==1)return null;
    let best=null;
    for(const a of own.passages){const b=other.passages.find(p=>p.order===a.order);if(!b||state.now-Math.max(a.hi,b.hi)>180000)continue;
      const lo=side==='front'?a.lo-b.hi:b.lo-a.hi,hi=side==='front'?a.hi-b.lo:b.hi-a.lo;
      if(lo<0||hi>1800000||hi-lo>180000)continue;
      if(!best||a.order>best.order)best={order:a.order,minutes:Math.round((lo+hi)/12000)/10,min:Math.round(lo/6000)/10,max:Math.round(hi/6000)/10,at:Math.max(a.hi,b.hi)};
    }return best;
  }
  function comparison(peer,planned,state){
    const seconds=pace(state);
    const target=numeric(planned)&&Number(planned)>0&&seconds?Math.max(1,Number(planned)*60/seconds):null;
    const fresh=peer&&peer.fresh!==false;
    return {targetStops:target===null?null:Math.round(target*10)/10,
      estimatedMinutes:fresh&&seconds?Math.round(peer.stopGap*seconds/6)/10:null,
      status:!fresh?'unknown':peer.stopGap<=2?'close':target&&peer.stopGap<target*.7?'short':target&&peer.stopGap>target*1.4?'long':target?'balanced':'observing'};
  }
  function model(side,trip,fleet,peers,state){
    const peer=peers.find(p=>p.side===side&&p.rank===1),second=peers.find(p=>p.side===side&&p.rank===2),finalDirection=lastDirection(trip,state.navigation),noPlannedRear=side==='rear'&&Boolean(finalDirection);
    const planned=noPlannedRear?null:side==='front'?trip.plannedFrontGapMinutes:trip.plannedRearGapMinutes;
    const seq=side==='front'?trip.frontSequence:trip.rearSequence;
    const plannedDriver=noPlannedRear?[]:(fleet.roster||[]).filter(r=>Number(r.sequence)===Number(seq));
    const previous=state.neighbours?.[side],remembered=previous&&state.now-previous.at<=180000?previous.peer:null;
    const person=peer||remembered||(plannedDriver.length===1?plannedDriver[0]:null);
    const name=person?.driverName||'기사 확인 중',plate=person?.vehicleNo||'';
    const digits=String(plate).match(/(\d{4})\s*$/),vehicle=digits?digits[1]+'호':plate?'차량 확인 중':'차량 대기';
    const c=comparison(peer,planned,state),gap=observedGap(peer,side,state);
    const fresh=peer&&peer.fresh!==false;
    const phone=peer?.source==='APP_GPS',observations=phone?state.appObservations:state.observations,own=observations?.[state.vehicleId],available=phone?state.appAvailable:state.observationsAvailable;
    const sameStop=Boolean(available&&own&&Object.entries(observations||{}).some(([id,v])=>id!==state.vehicleId&&v.leg===own.leg&&v.order===own.order&&(!phone||state.now-v.at<=45000)));
    if(sameStop||peer?.positionDisagreement)c.status='unknown';
    const other=peer&&observations?.[peer.vehicle],matched=own&&other&&(own.passages||[]).some(a=>(other.passages||[]).some(b=>a.order===b.order));
    const reason=gap?'통과 관측 '+Math.max(0,Math.floor((state.now-gap.at)/1000))+'초 전':sameStop?'같은 정류장 · 순서 확인 중':!fresh?'최신 위치 미수신':!available?'내 차 위치 대조 중':matched?'통과 관측 만료·재수집':'통과시각 관측 중';
    const plannedMismatch=peer&&plannedDriver.length===1&&plannedDriver[0].vehicleId!==peer.vehicle;
    const plannedPlate=plannedMismatch?String(plannedDriver[0].vehicleNo||'').match(/(\d{4})\s*$/):null;
    const notice=peer?.fresh===false?'마지막 위치 '+peer.age+'초 전':!peer&&remembered?'마지막 관측 '+Math.max(0,Math.floor((state.now-previous.at)/1000))+'초 전':plannedMismatch?'예정 '+(plannedPlate?plannedPlate[1]+'호':'차량')+' · 관측 다름':previous?.changedUntil>state.now?'관측 차량 변경':'';
    const noPeer=noPlannedRear&&!peer&&!remembered;
    return {side,peer,second,planned,comparison:c,identity:noPeer?'예정 뒷차 없음':vehicle+' · '+name,
      noPlannedRear,finalDirection,ambiguous:Boolean(sameStop||peer?.positionDisagreement),basis:noPeer?'실시간 위치 별도 확인':peer?.positionDisagreement?'차량·앱 위치 차이':phone?'앱 GPS · '+(gap?'통과시각 비교':'시간 수집 중'):reason,distanceNotice:!sameStop&&fresh&&peer.stopGap<=2?'거리 가까움 · '+peer.stopGap+'정류장':'',
      identityBasis:peer?(peer.fresh===false?'마지막':'관측'):remembered?'마지막':'예정',notice,observedGap:gap,
      plannedLine:noPlannedRear?finalDirection+' 막차 · 뒷차 없음':(numeric(planned)?planned+'분':'—분')+' · '+(c.targetStops===null?'환산 대기':'약'+c.targetStops+'정류장'),
      actualLine:(sameStop?'순서 확인':gap?'약 '+gap.minutes+'분':fresh?'시간 수집 중':'미수신')+(fresh?' · '+peer.stopGap+'정류장':''),
      crowding:peer?.fresh!==false&&[1,2,3,4].includes(peer?.crowded)?['','여유','보통','혼잡','매우혼잡'][peer.crowded]:'미수신',
      actual:peer?(peer.fresh===false?'이전 위치 · '+peer.age+'초 전':'실제 '+peer.stopGap+'정류장'):'실제 간격 수신 대기',
      target:c.targetStops===null?'관측 중': '예정 환산 약 '+c.targetStops+'정류장',
      estimate:c.estimatedMinutes===null?'':'약 '+c.estimatedMinutes+'분 추정'};
  }
  function render(host,models){
    const key=JSON.stringify(models.map(m=>[m.identity,m.identityBasis,m.notice,m.basis,m.distanceNotice,m.actualLine,m.plannedLine,m.crowding,m.comparison.status,m.observedGap?.min,m.observedGap?.max,m.second?.stopGap,m.second?.fresh]));
    if(host.dataset.headway===key)return;host.dataset.headway=key;host.replaceChildren();
    for(const m of models){
      const doc=host.ownerDocument,item=doc.createElement('div');item.className='headway-card '+m.side+' '+m.comparison.status;
      const top=doc.createElement('div');top.className='headway-title';top.textContent=m.ambiguous?(m.side==='front'?'앞쪽 위치':'뒤쪽 위치'):m.side==='front'?'앞차':'뒷차';
      const row=(label,text,cls)=>{const node=doc.createElement('div');node.className=cls;const tag=doc.createElement('span');tag.className='headway-row-label';tag.textContent=label;const value=doc.createElement('span');value.textContent=text;node.append(tag,value);return node;};
      const planned=row('예정',m.plannedLine,'headway-planned'),actual=row('관측',m.actualLine,'headway-actual');
      const identity=doc.createElement('span');identity.className='headway-identity';identity.textContent=(m.identityBasis==='예정'&&!m.noPlannedRear?'예정 ':'')+m.identity;identity.title=m.identityBasis+' 차량 · 기사명은 등록된 배차 정보 기준';
      const crowd=doc.createElement('span');crowd.className='headway-crowding';crowd.textContent=m.crowding==='미수신'?'혼잡 미수신':m.crowding;crowd.title='혼잡도';crowd.dataset.level=m.crowding;
      const meta=doc.createElement('div');meta.className='headway-meta';meta.append(identity,crowd);item.append(top,planned,actual,meta);
      if(m.basis){const basis=doc.createElement('small');basis.className='headway-basis';basis.textContent=(m.distanceNotice?'거리 주의 · ':'')+m.basis.replace('통과시각 관측 중','시간 관측 중');basis.title=m.basis;item.append(basis);}
      if(m.notice){const notice=doc.createElement('small');notice.className='headway-reception';notice.textContent=m.notice;item.append(notice);}
      item.title=['예정 정류장 수는 최근 정류장 통과시간으로 환산',m.observedGap?'동일 정류장 통과 관측: '+m.observedGap.min+'~'+m.observedGap.max+'분':'실제 시간 간격은 동일 정류장 관측 수집 중',m.peer?.reference?'경기버스 조회 위치 기준':'앱 GPS 또는 배차 정보',m.second?(m.side==='front'?'앞2 ':'뒤2 ')+(m.second.fresh===false?'이전 위치':m.second.stopGap+'정류장'):''].filter(Boolean).join(' · ');host.append(item);
    }
  }
  function warning(models,state,now,active,priority=false){
    state.alerts=state.alerts||{};
    if(!active||priority){state.alerts={};return null;}
    for(const side of ['front','rear']){
      const m=models.find(m=>m.side===side),p=m?.ambiguous?null:m?.peer;
      const at=Number(p?.observedAt),key=side+'|'+(p?.vehicle||'')+'|'+(p?.source||'')+'|'+(p?.binding||'');
      for(const k of Object.keys(state.alerts))if(k.startsWith(side+'|')&&k!==key)delete state.alerts[k];
      const bound=p?.source!=='APP_GPS'||String(p.binding||'').split('|').length===2&&String(p.binding).split('|').every(Boolean);
      const timely=bound&&Number.isFinite(at)&&now>=at&&now-at<=(p?.reference?60000:45000);
      // A small stop count is not a timing violation when measured headway is on target.
      const onTarget=m?.observedGap&&numeric(m.planned)&&m.planned>0&&m.observedGap.minutes>=m.planned*.8;
      if(!p||p.fresh===false||!timely||p.stopGap>2||p.stopGap<1||onTarget){delete state.alerts[key];continue;}
      const signature=p.stopGap+'|'+(m.observedGap?Math.round(m.observedGap.minutes):'distance');
      let a=state.alerts[key];
      if(!a||at<a.at||at-a.at>90000||a.signature!==signature)a=state.alerts[key]={since:at,at,signature,last:a?.last||0};
      if(at<=a.at&&at!==a.since)continue;
      a.at=at;
      if(at-a.since<180000||a.last&&now-a.last<600000)continue;
      return {key,side,stopGap:p.stopGap,message:(side==='front'?'앞차와 ':'뒷차와 ')+p.stopGap+'정류장 간격이 지속됩니다. 운행 간격을 확인해 주세요.'};
    }
    return null;
  }

  function notified(state,result,now){if(result&&state.alerts[result.key])state.alerts[result.key].last=now;}
  return {sample,pace,observeFleet,observedGap,comparison,model,render,warning,notified,lastDirection};
});
