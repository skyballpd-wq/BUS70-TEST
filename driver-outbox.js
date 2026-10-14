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
  return {fields,modes,binding,add,next,prune,overlay};
});
