/* Automatic recording lifecycle; no network or location persistence. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Bus70Recording=api;})(typeof window==='object'?window:this,function(){
  function shouldResume(input){
    if(!input.visible||!input.ready||input.active||input.paused||input.finished||input.permission==='denied'||input.locationEnabled===false)return false;
    return input.key!==input.previousKey||!input.lastAttempt||input.now-input.lastAttempt>=30000;
  }
  function crossCheckLabel(value,now){
    if(!value)return '경기도 차량정보 연결 확인 중';
    if(!value.available){
      const code=/^GBIS_HTTP_(\d{3})$/.exec(value.error||'');
      return (value.message||'경기도 차량정보 수신 대기')+(code?' · HTTP '+code[1]:'');
    }
    const age=Math.max(0,Math.floor((now-Number(value.fetchedAt||0))/1000));
    if(age>90)return '경기도 차량정보 갱신 대기';
    return '경기도 차량 대조 · '+(value.status==='AGREE'?'GPS 정류장 순서 일치':value.status==='DIFFERENT'?'수신 시차·진행방향 확인':value.stopName||'차량 확인')+' · '+age+'초 전 조회';
  }
  // GPS reception, provider corroboration and record delivery are independent.
  // This is presentation only: it must never create a departure or relax its guards.
  function health(input){
    if(!input.live)return {blocked:false,warning:false,label:''};
    const ref=input.reference,age=input.now-Number(ref&&ref.fetchedAt||0);
    const verified=Boolean(ref&&ref.available&&Number(ref.fetchedAt)>0&&age>=0&&age<=90000);
    const blocked=Boolean(!input.actualStart&&Number.isFinite(input.plannedAt)&&input.plannedAt<=input.now&&(!verified||input.serverError));
    const pending=Math.max(0,Number(input.pending)||0),parts=[];
    if(input.paused)parts.push('자동기록 일시중지');
    else if(!input.active)parts.push(input.inactiveReason||'GPS 수집 준비 중');
    else parts.push(input.gpsFresh?'GPS 수신 중':'GPS 최신 수신 대기');
    if(blocked)parts.push(input.serverError?'서버 연결 실패 · 출발 기록 확인 불가':'차량정보 확인 불가 · 자동 출발 기록 대기');
    else if(input.serverError)parts.push('서버 연결 실패');
    else if(!verified)parts.push('차량정보 대조 대기');
    else parts.push('차량정보 수신');
    if(pending)parts.push('기기 보관 '+pending+'건 · 서버 전송 대기');
    if(input.syncError)parts.push('기록 전송 오류');
    if(!input.actualStart&&!blocked)parts.push('실제 출발 미기록');
    return {blocked,warning:Boolean(blocked||input.serverError||input.syncError||pending||!input.gpsFresh),label:parts.join(' · ')};
  }
  return {shouldResume,crossCheckLabel,health};
});
