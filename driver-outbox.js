/* Checkpoint outbox helpers. Callers persist before advancing the trip. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.Bus70Outbox=factory();})(typeof window==='object'?window:this,function(){
  const fields={DEPART:'actualStart',TURN:'actualTurn',TURN_DEPART:'turnDepartedAt',CONTROL:'actualControl',ARRIVE:'actualEnd',DEADHEAD_RETURN:'deadheadReturnedAt'};
  const modes={DEPART:'startRecordMode',TURN:'turnRecordMode',TURN_DEPART:'turnDepartureMode',CONTROL:'controlRecordMode',ARRIVE:'endRecordMode',DEADHEAD_RETURN:'returnRecordMode'};
  const binding=(driverId,body)=>[driverId,body.date,body.dispatchId,body.vehicleId].join('|');
  function add(items,driverId,body){const key=binding(driverId,body)+'|'+body.trip+'|'+body.event;if(!items.some(i=>i.key===key)){const copy={...body};delete copy.token;items.push({key,driverId,binding:binding(driverId,body),body:copy,delivered:false});}return items;}
  function next(items,driverId,now){const blocked=new Set(items.filter(i=>i.driverId===driverId&&i.blocked&&!i.delivered).map(i=>i.binding));const item=items.find(i=>i.driverId===driverId&&!i.delivered&&!blocked.has(i.binding));return item&&Number(item.retryAt||0)<=now?item:null;}
  function prune(items,now){return items.filter(i=>!i.delivered||now-Number(i.body.observedAt)<172800000);}
  function overlay(items,driverId,data){if(!data?.dispatch)return;const d=data.dispatch,v=data.vehicle||{},date=data.date?.value||data.date,id=binding(driverId,{date,dispatchId:d.dispatchId||d.id,vehicleId:v.vehicleId||v.id||d.vehicleId});data.runLogs=data.runLogs||[];
    for(const item of items){if(item.binding!==id)continue;const b=item.body,field=fields[b.event],mode=modes[b.event];if(!field||!(data.trips||[]).some(t=>Number(t.trip)===Number(b.trip)))continue;
      let log=data.runLogs.find(l=>l.date===date&&Number(l.sequence)===Number(b.sequence)&&Number(l.trip)===Number(b.trip));if(!log){log={date,sequence:b.sequence,trip:b.trip};data.runLogs.push(log);}
      if(!log[field]||log[mode]==='기기 저장·전송 대기'){log[field]=item.recordedAt||new Date(Number(b.observedAt)).toISOString();log[mode]=item.delivered?'GPS 자동':'기기 저장·전송 대기';}
    }
  }
  return {fields,modes,binding,add,next,prune,overlay};
});
