/* Automatic recording lifecycle; no network or location persistence. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Bus70Recording=api;})(typeof window==='object'?window:this,function(){
  function shouldResume(input){
    if(!input.visible||!input.ready||input.active||input.paused||input.finished||input.permission==='denied'||input.locationEnabled===false)return false;
    return input.key!==input.previousKey||!input.lastAttempt||input.now-input.lastAttempt>=30000;
  }
  function crossCheckLabel(value,now){
    if(!value)return '경기도 차량정보 연결 확인 중';
    if(!value.available)return value.message||'경기도 차량정보 수신 대기';
    const age=Math.max(0,Math.floor((now-Number(value.fetchedAt||0))/1000));
    if(age>90)return '경기도 차량정보 갱신 대기';
    return '경기도 차량 대조 · '+(value.status==='AGREE'?'GPS 정류장 순서 일치':value.status==='DIFFERENT'?'수신 시차·진행방향 확인':value.stopName||'차량 확인')+' · '+age+'초 전 조회';
  }
  return {shouldResume,crossCheckLabel};
});
