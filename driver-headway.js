/* Same-direction spacing assistance; observed spacing and timetable targets stay separate. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Bus70Headway=api;})(typeof window==='object'?window:this,function(){
  'use strict';
  const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  function sample(state,scope,nav,now){
    const key=[scope.route,scope.date,scope.vehicleId,scope.dispatchId,scope.trip,nav?.returnConfirmed?'return':'out'].join('|');
    if(state.key!==key)state={key,samples:[],alerts:{}};
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
  function comparison(peer,planned,state){
    const values=(state.samples||[]).map(s=>s.seconds).sort((a,b)=>a-b),pace=values.length>=3?values[Math.floor(values.length/2)]:null;
    const target=numeric(planned)&&Number(planned)>0&&pace?Math.max(1,Number(planned)*60/pace):null;
    const fresh=peer&&peer.fresh!==false;
    return {targetStops:target===null?null:Math.round(target*10)/10,
      estimatedMinutes:fresh&&pace?Math.round(peer.stopGap*pace/6)/10:null,
      status:!fresh?'unknown':peer.stopGap<=2?'close':target&&peer.stopGap<target*.7?'short':target&&peer.stopGap>target*1.4?'long':target?'balanced':'observing'};
  }
  function model(side,trip,fleet,peers,state){
    const peer=peers.find(p=>p.side===side&&p.rank===1),second=peers.find(p=>p.side===side&&p.rank===2);
    const planned=side==='front'?trip.plannedFrontGapMinutes:trip.plannedRearGapMinutes;
    const seq=side==='front'?trip.frontSequence:trip.rearSequence;
    const plannedDriver=(fleet.roster||[]).filter(r=>Number(r.sequence)===Number(seq));
    const person=peer||(plannedDriver.length===1?plannedDriver[0]:null);
    const name=person?.driverName||'기사 확인 중',plate=person?.vehicleNo||'';
    const digits=String(plate).match(/(\d{4})\s*$/),vehicle=digits?digits[1]+'호':plate?'차량 확인 중':'차량 대기';
    const c=comparison(peer,planned,state);
    return {side,peer,second,planned,comparison:c,identity:vehicle+' · '+name,
      actual:peer?(peer.fresh===false?'이전 위치 · '+peer.age+'초 전':'실제 '+peer.stopGap+'정류장'):'실제 간격 수신 대기',
      target:c.targetStops===null?'관측 중': '예정 환산 약 '+c.targetStops+'정류장',
      estimate:c.estimatedMinutes===null?'':'약 '+c.estimatedMinutes+'분 추정'};
  }
  function render(host,models){
    const key=JSON.stringify(models.map(m=>[m.identity,m.actual,m.target,m.planned,m.comparison.status,m.second?.stopGap,m.second?.fresh]));
    if(host.dataset.headway===key)return;host.dataset.headway=key;host.replaceChildren();
    for(const m of models){
      const doc=host.ownerDocument,item=doc.createElement('div');item.className='headway-card '+m.side+' '+m.comparison.status;
      const top=doc.createElement('div');top.className='headway-title';const label=doc.createElement('span');label.textContent=m.side==='front'?'예정 앞차':'예정 뒷차';const time=doc.createElement('strong');time.className=numeric(m.planned)?'':'unknown';time.textContent=numeric(m.planned)?m.planned+'분':'확인 중';top.append(label,time);
      const identity=doc.createElement('span');identity.className='headway-identity';identity.textContent=m.identity;
      const actual=doc.createElement('b');actual.className='headway-actual';actual.textContent=m.actual;
      const detail=doc.createElement('small');detail.textContent=m.target+(m.second?' · '+(m.side==='front'?'앞2 ':'뒤2 ')+(m.second.fresh===false?'이전 위치':m.second.stopGap+'정류장'):'');
      item.append(top,identity,actual,detail);item.title=[m.estimate,'권장 간격은 최근 정류장 통과시간과 예정 배차간격으로 환산',m.peer?.reference?'경기버스 조회 위치 기준':'앱 GPS 기준'].filter(Boolean).join(' · ');host.append(item);
    }
  }
  function warning(models,state,now,active){
    if(!active){for(const a of Object.values(state.alerts||{}))a.since=0;return null;}
    // Front takes priority. A stale/recovered location never triggers speech.
    for(const side of ['front','rear']){
      const p=models.find(m=>m.side===side)?.peer,key=side+'|'+(p?.vehicle||'');
      for(const k of Object.keys(state.alerts||{}))if(k.startsWith(side+'|')&&k!==key)state.alerts[k].since=0;
      if(!p||p.fresh===false||p.stopGap>2||p.stopGap<1){for(const k of Object.keys(state.alerts||{}))if(k.startsWith(side+'|'))state.alerts[k].since=0;continue;}
      const a=state.alerts[key]||(state.alerts[key]={since:now,last:0});if(!a.since)a.since=now;
      if(now-a.since<8000||a.last&&now-a.last<180000)continue;
      return {key,side,stopGap:p.stopGap,message:side==='front'?'앞차와 '+p.stopGap+'정류장 간격입니다. 배차 간격을 확인해 주세요.':'뒷차가 '+p.stopGap+'정류장 이내입니다. 운행 간격을 확인해 주세요.'};
    }
    return null;
  }
  function notified(state,result,now){if(result&&state.alerts[result.key])state.alerts[result.key].last=now;}
  return {sample,comparison,model,render,warning,notified};
});
