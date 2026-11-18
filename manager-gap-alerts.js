/* Foreground observations only. No alarms from stale data or inferred ordering. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Bus70GapAlerts=api;})(typeof window==='object'?window:this,function(){
  const defaults={holdSeconds:180,closeStops:2,minMinutes:0,maxMinutes:0};
  function settings(raw={}){
    const v={...defaults,...raw};
    for(const [k,min,max] of [['holdSeconds',60,1800],['closeStops',0,10],['minMinutes',0,60],['maxMinutes',0,120]]){
      if(!Number.isFinite(v[k])||v[k]<min||v[k]>max)throw Error('경고 기준 범위를 확인하세요.');
    }
    if(v.minMinutes&&v.maxMinutes&&v.minMinutes>=v.maxMinutes)throw Error('벌어짐 기준은 좁음 기준보다 커야 합니다.');
    return v;
  }
  function update(previous,route,view,at,now,config){
    const next={},p=settings(config);
    if(!view.fresh||!Number.isFinite(at)||now-at<0||now-at>60000)return next;
    for(const leg of view.legs)for(let i=1;i<leg.groups.length;i++){
      const g=leg.groups[i],front=leg.groups[i-1];
      if(g.gap===null||g.sameStop||front.sameStop)continue;
      const kind=p.closeStops&&g.gap<=p.closeStops||p.minMinutes&&g.minutes!==null&&g.minutes<=p.minMinutes?'CLOSE':p.maxMinutes&&g.minutes!==null&&g.minutes>=p.maxMinutes?'WIDE':'';
      if(!kind)continue;
      const bus=g.buses[0],peer=front.buses[0],key=[route,leg.direction,bus.vehicleId,peer.vehicleId,kind].join('|'),old=previous[key];
      const continuous=old&&at>=old.lastAt&&at-old.lastAt<=90000;
      const item=continuous?{...old}:{key,route,kind,since:at,samples:0,lastAt:0,acknowledged:false,spokenAt:0};
      if(at>item.lastAt)item.samples++;
      Object.assign(item,{lastAt:at,bus,peer,gap:g.gap,minutes:g.minutes,stop:g.stop.name,direction:leg.direction});
      item.active=item.samples>=2&&at-item.since>=p.holdSeconds*1000;
      next[key]=item;
    }
    return next;
  }
  function draft(alert,audience,driver){
    return {audience,route:alert.route,driverId:driver?.driverId||'',vehicleId:driver?.vehicleId||'',title:'차량 간격 확인 안내',message:(audience==='WORKING'?'전체 노선':alert.route+'번')+' 운행 간격을 확인해 주세요. '+(alert.kind==='CLOSE'?'차량 간격이 좁아진 구간이 관측되었습니다.':'차량 간격이 벌어진 구간이 관측되었습니다.')+' 안전운행을 우선하고 현장 상황에 맞춰 운행해 주세요. 정차 후 필요 시 소장에게 상황을 알려 주세요.'};
  }
  return {defaults,settings,update,draft};
});
