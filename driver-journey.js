/* Read-only endpoint times. Forecasts never become ledger events. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Bus70Journey=api;})(typeof window==='object'?window:this,function(){
  'use strict';
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  // Use the selected route occurrence, not a similarly named stop or the
  // timetable turnaround. Upper last services end here and must never forecast a depot return.
  function forecastGate(route,trip,path){
    if(String(route)!=='5'||!/고강.*차고지$/.test(String(trip.endPlace||'').replace(/\s/g,'')))return null;
    const stops=path?.stops||[],matches=stops.map((s,i)=>({s,i})).filter(({s})=>s.stationId==='212000047'||s.id==='212000047'||String(s.id||'').endsWith('-212000047'));
    const gate=matches.length===1?matches[0].i:-1;
    return gate>=0&&gate<stops.length-1&&gate===path.pivotIndex?gate:-1;
  }
  function clock(at,date,seconds=false){
    if(!finite(at)||at<=0)return '—';const d=new Date(at),day=new Date(at+32400000).toISOString().slice(0,10);
    return (day>date?'다음날 ':'')+d.toLocaleTimeString('en-GB',{timeZone:'Asia/Seoul',hour12:false,hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit'}:{})});
  }
  function update(state,input){
    const {scope,trip,now,nav={},log={},native=null}=input,key=[scope.date,scope.dispatchId,scope.vehicleId,trip.trip,log.startAt,log.turnAt].join('|');
    if(state.key!==key)state={key,samples:[]};
    const result={departure:log.startAt||null,arrival:log.endAt||null,forecast:null,reason:log.startAt?'회차 기록 후 예상':'출발 기록 대기'};
    if(log.endAt){state.samples=[];return {state,...result,reason:'도착 기록'};}
    const turnRequired=Boolean(trip.turnPlace||trip.turnTime),ready=log.startAt&&(!turnRequired||log.turnAt);
    if(!input.live||!ready){state.samples=[];return {state,...result};}
    const fresh=nav.configured&&!nav.retained&&!nav.waiting&&finite(nav.timestamp)&&now-nav.timestamp>=0&&now-nav.timestamp<=10000;
    if(!fresh){state.samples=[];return {state,...result,reason:'최신 위치 확인 중'};}
    const gate=forecastGate(scope.route,trip,nav.path||input.path);
    if(gate!==null&&(gate<0||!finite(nav.fraction)||nav.fraction<=gate+.15)){
      state.samples=[];return {state,...result,reason:gate<0?'예상 기준점 확인':'테크노파크 통과 후 예상'};
    }
    const same=native&&native.date===scope.date&&native.dispatchId===scope.dispatchId&&native.vehicleId===scope.vehicleId&&Number(native.trip)===Number(trip.trip);
    if(same&&(gate===null||native.policyVersion===5)&&native.available&&!native.retained&&finite(native.timestamp)&&now-native.timestamp>=0&&now-native.timestamp<=10000&&native.predictedAt>=now&&native.latestAt>=native.predictedAt){
      result.forecast={at:native.predictedAt,latest:native.latestAt,observedAt:native.timestamp,basis:'최근 구간 이동·정차 기준'};
    }
    // Projected route metres already include the selected stop occurrence.
    // A gap, reversal, implausible leap or missing coordinates resets motion.
    const meters=nav.matchedMeters,total=input.totalMeters,at=nav.timestamp,last=state.samples.at(-1);
    if(!finite(meters)||!finite(total)||meters<0||meters>total){state.samples=[];return {state,...result,reason:result.forecast?'':'노선 위치 확인 중'};}
    if(last&&(at<last.at||at-last.at>30000||meters<last.meters-50||meters-last.meters>Math.max(80,(at-last.at)*.03)))state.samples=[];
    if(!state.samples.length||at-state.samples.at(-1).at>=5000)state.samples.push({at,meters});
    state.samples=state.samples.filter(v=>at-v.at<=600000);
    const first=state.samples[0],recent=state.samples.filter(v=>at-v.at>=60000).at(-1);
    if(!result.forecast&&first&&recent&&at-first.at>=120000&&meters-first.meters>=250&&meters-recent.meters>=100){
      const average=(meters-first.meters)/(at-first.at),near=(meters-recent.meters)/(at-recent.at),rate=average*.7+near*.3;
      if(rate>=.002&&rate<=.02222&&total-meters>0){const duration=(total-meters)/rate;result.forecast={at:now+duration,latest:now+duration+Math.max(120000,duration*.25),observedAt:at,basis:'최근 2~10분 이동·정차 기준 · 참고 예상'};}
    }
    return {state,...result,reason:result.forecast?'':'예상 계산 중'};
  }
  function notice(model,input,receipts){
    if(!input.live||!input.enabled)return null;
    const {scope,trip,now}=input,key=[scope.date,scope.dispatchId,scope.vehicleId,trip.trip].join('|');
    for(const [event,at,label] of [['ARRIVE',model.arrival,'도착'],['DEPART',model.departure,'출발']]){
      const id=key+'|'+event;if(at&&now>=at&&now-at<=90000&&!receipts[id])return {id,at:now,message:trip.trip+'탕 '+label+' 기록 '+clock(at,scope.date,true).replace(/(\d{2}):(\d{2}):(\d{2})/,'$1시 $2분 $3초')+'.'};
    }
    const f=model.forecast,id=key+'|ETA',old=receipts[id];
    if(f&&(!old||now-old.at>=600000&&Math.abs(f.at-old.predictedAt)>=300000))return {id,at:now,predictedAt:f.at,message:'도착 예상 시각은 '+clock(f.at,scope.date)+'에서 '+clock(f.latest,scope.date)+' 사이입니다. 교통상황에 따라 달라질 수 있습니다.'};
    return null;
  }
  return {update,clock,notice,forecastGate};
});
