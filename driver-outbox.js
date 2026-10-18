/* Checkpoint outbox helpers. Callers persist before advancing the trip. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.Bus70Outbox=factory();})(typeof window==='object'?window:this,function(){
  const fields={DEPART:'actualStart',TURN:'actualTurn',TURN_DEPART:'turnDepartedAt',CONTROL:'actualControl',ARRIVE:'actualEnd',DEADHEAD_RETURN:'deadheadReturnedAt'};
  const modes={DEPART:'startRecordMode',TURN:'turnRecordMode',TURN_DEPART:'turnDepartureMode',CONTROL:'controlRecordMode',ARRIVE:'endRecordMode',DEADHEAD_RETURN:'returnRecordMode'};
  const binding=(driverId,body)=>[driverId,body.date,body.dispatchId,body.vehicleId].join('|');
  function plannedAt(date,time){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{1,2}:\d{2}$/.test(String(time)))return NaN;const [y,m,d]=date.split('-').map(Number),[h,min]=time.split(':').map(Number);return h>47||min>59?NaN:Date.UTC(y,m-1,d+(h<24&&h*60+min<210?1:0),h-9,min);}
  function add(items,driverId,body){const id=binding(driverId,body),key=id+'|'+body.trip+'|'+body.event+'|'+body.observedAt;if(!items.some(i=>!i.voided&&i.binding===id&&Number(i.body.trip)===Number(body.trip)&&i.body.event===body.event)){const copy={...body};delete copy.token;items.push({key,driverId,binding:id,body:copy,delivered:false});}return items;}
  function next(items,driverId,now){const blocked=new Set(items.filter(i=>i.driverId===driverId&&i.blocked&&!i.delivered).map(i=>i.binding));const item=items.find(i=>i.driverId===driverId&&!i.delivered&&!blocked.has(i.binding));return item&&Number(item.retryAt||0)<=now?item:null;}
  function prune(items,now){return items.filter(i=>!i.delivered||now-Number(i.body.observedAt)<172800000);}
  function overlay(items,driverId,data){if(!data?.dispatch)return;const d=data.dispatch,v=data.vehicle||{},date=data.date?.value||data.date,id=binding(driverId,{date,dispatchId:d.dispatchId||d.id,vehicleId:v.vehicleId||v.id||d.vehicleId});data.runLogs=data.runLogs||[];
    for(const log of data.runLogs){const trip=(data.trips||[]).find(t=>Number(t.trip)===Number(log.trip)),planned=plannedAt(date,trip?.startTime),text=String(log.actualStart||'').replace(' ','T'),observed=Date.parse(/[Zz]|[+-]\d{2}:?\d{2}$/.test(text)?text:text+'+09:00');if(!log.actualTurn&&!log.actualEnd&&['GPS 자동','기기 저장·전송 대기'].includes(log.startRecordMode)&&observed<planned){log.actualStart='';log.startRecordMode='';log.startDeviationMinutes='';log.status='출발대기';}}
    for(const item of items){if(item.binding!==id||item.voided)continue;const b=item.body,field=fields[b.event],mode=modes[b.event],trip=(data.trips||[]).find(t=>Number(t.trip)===Number(b.trip));if(!field||!trip)continue;
      if(b.event==='DEPART'&&b.source==='GPS_AUTO'&&Number(b.observedAt)<plannedAt(date,trip.startTime)){item.voided=true;item.delivered=true;item.error='예정 발차시각 이전 GPS 오출발 제외';continue;}
      let log=data.runLogs.find(l=>l.date===date&&Number(l.sequence)===Number(b.sequence)&&Number(l.trip)===Number(b.trip));if(!log){log={date,sequence:b.sequence,trip:b.trip};data.runLogs.push(log);}
      if(!log[field]||log[mode]==='기기 저장·전송 대기'){log[field]=item.recordedAt||new Date(Number(b.observedAt)).toISOString();log[mode]=item.delivered?'GPS 자동':'기기 저장·전송 대기';}
    }
  }
  // History is a read model. Never replace the server copy with local overlays.
  function history(logs,items,driverId,from,to,plans=[]){
    const result=logs.map(log=>({...log,pendingEvents:[]}));
    for(const plan of plans){
      if(plan.date<from||plan.date>to)continue;
      if(!result.some(l=>l.date===plan.date&&Number(l.sequence)===Number(plan.sequence)&&Number(l.trip)===Number(plan.trip)&&(!l.dispatchId||l.dispatchId===plan.dispatchId)&&(!l.vehicleId||l.vehicleId===plan.vehicleId)))result.push({...plan,pendingEvents:[]});
    }
    const blockers=new Map(items.filter(i=>i.driverId===driverId&&!i.voided&&!i.delivered&&i.blocked).map(i=>[i.binding,i.error||'앞선 기록 확인 필요']));
    for(const item of items){
      const b=item.body||{},field=fields[b.event],mode=modes[b.event];
      if(item.driverId!==driverId||item.voided||!field||b.date<from||b.date>to)continue;
      let log=result.find(l=>l.date===b.date&&Number(l.sequence)===Number(b.sequence)&&Number(l.trip)===Number(b.trip)&&(!l.dispatchId||l.dispatchId===b.dispatchId)&&(!l.vehicleId||l.vehicleId===b.vehicleId));
      if(!log){log={date:b.date,sequence:b.sequence,trip:b.trip,dispatchId:b.dispatchId,vehicleId:b.vehicleId,route:b.route,plannedStart:b.plannedStart,plannedTurn:b.plannedTurn,plannedEnd:b.plannedEnd,startPlace:b.startPlace,turnPlace:b.turnPlace,endPlace:b.endPlace,pendingEvents:[]};result.push(log);}
      // A populated server field is authoritative, including manual corrections.
      if(log[field]&&log[mode]!=='기기 저장·전송 대기')continue;
      log[field]=item.recordedAt||new Date(Number(b.observedAt)).toISOString();
      log[mode]=item.delivered?'서버 저장 확인':'기기 저장·전송 대기';
      if(!item.delivered)log.pendingEvents.push({event:b.event,blocked:Boolean(item.blocked||blockers.has(item.binding)),error:item.error||blockers.get(item.binding)||''});
    }
    return result.sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.sequence)-Number(a.sequence)||Number(b.trip)-Number(a.trip));
  }
  function status(log,past){
    if(log.pendingEvents?.length)return log.pendingEvents.some(v=>v.blocked)?'저장 확인 필요':'서버 저장 대기';
    if(log.actualEnd&&(!log.deadheadDestination||log.deadheadDestination===log.endPlace||log.deadheadReturnedAt))return '완료';
    if(past)return log.actualStart||log.actualTurn||log.actualEnd?'기록 미완료':'기록 없음';
    return log.status||(log.actualStart?'운행 중':'기록');
  }
  return {fields,modes,binding,add,next,prune,overlay,history,status};
});
