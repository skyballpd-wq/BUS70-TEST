/* Self-enrolment UI. All decisions and identity linking are checked by server. */
(function(root){
  'use strict';
  const KEY='BUS70_SIGNUP_RECEIPT_V1';
  let cfg,receipt=null,timer=0,busy=false,generation=0,masterGeneration=0,masterBusy=false;
  const byId=id=>document.getElementById(id);
  function node(tag,text,cls){const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;}
  function message(text,error){const e=byId('signupStatus');e.textContent=text;e.className='notice'+(error?' error':'');}
  function clearReceipt(){generation++;clearTimeout(timer);receipt=null;localStorage.removeItem(KEY);sessionStorage.removeItem(KEY);byId('signupPending').hidden=true;}
  function saveReceipt(value){receipt=value;localStorage.removeItem(KEY);sessionStorage.removeItem(KEY);(value.remember?localStorage:sessionStorage).setItem(KEY,JSON.stringify(value));}
  function token(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');}
  function pending(){byId('signupPanel').open=true;byId('signupForm').hidden=true;byId('signupPending').hidden=false;}
  function schedule(){clearTimeout(timer);if(receipt&&!cfg.loggedIn()&&!document.hidden)timer=setTimeout(check,20000);}
  async function submit(){
    if(busy||cfg.loggedIn())return;
    const name=byId('signupName').value.trim().normalize('NFC'),empId=byId('signupEmpId').value.trim(),route=byId('signupRoute').value;
    if(!/^[가-힣A-Za-z][가-힣A-Za-z .'·-]{1,19}$/.test(name)||!/^\d{6}$/.test(empId)){message('실제 성명과 6자리 사원번호를 확인하세요.',true);return;}
    const key=JSON.stringify([name,empId,route]);
    // Credentials remain in memory only. The receipt is safe to retry after a
    // lost response; a different input gets a new receipt.
    if(!receipt||receipt.inputKey!==key){clearReceipt();saveReceipt({receipt:token(),remember:byId('signupRemember').checked,createdAt:Date.now()});receipt.inputKey=key;}
    const own=receipt,epoch=generation;busy=true;byId('signupSubmit').disabled=true;message('가입 신청을 보내는 중입니다.');
    try{
      const data=await cfg.api({action:'loginSecure',operation:'driverSignupSubmit',name,empId,route,receipt:own.receipt});
      if(epoch!==generation||cfg.loggedIn())return;
      if(!data.ok){message(data.message||'신청하지 못했습니다.',true);return;}
      if(data.status==='REGISTERED'||data.status==='ALREADY_PENDING'){clearReceipt();message(data.message);return;}
      saveReceipt({receipt:own.receipt,requestId:data.requestId,expiresAt:data.expiresAt,remember:own.remember,createdAt:own.createdAt});
      byId('signupEmpId').value='';pending();message(data.message);schedule();
    }catch(e){message('통신을 확인하지 못했습니다. 같은 정보로 다시 누르면 중복 신청 없이 확인합니다.',true);}
    finally{busy=false;byId('signupSubmit').disabled=false;}
  }
  async function check(){
    if(busy||!receipt||cfg.loggedIn()||document.hidden)return;
    const own={...receipt},epoch=generation;busy=true;byId('signupCheck').disabled=true;
    try{
      const data=await cfg.api({action:'loginSecure',operation:'driverSignupStatus',requestId:own.requestId,receipt:own.receipt});
      if(epoch!==generation||cfg.loggedIn())return;
      if(!data.ok){message(data.message||'신청 상태를 확인하지 못했습니다.',true);if(data.error==='RECEIPT_INVALID')clearReceipt();return;}
      if(!own.requestId&&data.requestId){own.requestId=data.requestId;own.expiresAt=data.expiresAt;saveReceipt(own);}
      message(data.message+(data.reason?' 사유: '+data.reason:''),data.status==='반려');
      if(data.status==='승인'){
        const date=cfg.today();
        const login=await cfg.api({action:'loginSecure',operation:'driverSignupComplete',requestId:own.requestId,receipt:own.receipt,date});
        if(epoch!==generation||cfg.loggedIn())return;
        if(login.ok&&login.driver&&!login.role){clearReceipt();cfg.accept(login,date,own.remember);}
        else {message(login.message||'성명·사원번호로 로그인하세요.',true);if(['RECEIPT_USED','DRIVER_CHANGED','LOGIN_UNAVAILABLE'].includes(login.error))clearReceipt();}
      }else if(['반려','EXPIRED'].includes(data.status)){clearReceipt();byId('signupForm').hidden=false;}
    }catch(e){if(epoch===generation)message('연결을 기다리고 있습니다. 인터넷 연결 후 승인 상태를 다시 확인합니다.',true);}
    finally{busy=false;byId('signupCheck').disabled=false;schedule();}
  }
  function start(){
    cfg=arguments[0];
    byId('signupSubmit').addEventListener('click',submit);
    byId('signupCheck').addEventListener('click',check);
    byId('signupForget').addEventListener('click',()=>{clearReceipt();byId('signupForm').hidden=false;message('이 휴대폰의 자동 확인을 해제했습니다. 기존 신청은 유지되며 승인 후 일반 로그인할 수 있습니다.');});
    byId('signupPanel').addEventListener('toggle',()=>{if(byId('signupPanel').open&&!receipt){byId('signupForm').hidden=false;if(!byId('signupName').value)byId('signupName').value=byId('driverName').value;}});
    byId('signupMasterLoad').addEventListener('click',loadMaster);
    document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)check();});
    window.addEventListener('online',check);
    try{receipt=JSON.parse(localStorage.getItem(KEY)||sessionStorage.getItem(KEY)||'null');}catch(e){clearReceipt();}
    if(receipt&&/^[a-f0-9]{64}$/.test(receipt.receipt)&&(receipt.expiresAt||receipt.createdAt+7*86400000)>Date.now()){pending();message('저장된 신청의 승인 상태를 확인합니다.');check();}
    else if(receipt){clearReceipt();}
  }
  function masterMessage(text,error){byId('signupMasterStatus').textContent=text;byId('signupMasterStatus').className='notice'+(error?' error':'');}
  async function loadMaster(){
    if(!cfg||cfg.role()!=='MASTER'||masterBusy)return;
    const own=cfg.token(),epoch=++masterGeneration;byId('signupMasterLoad').disabled=true;masterMessage('가입 신청을 불러오는 중입니다.');
    try{const data=await cfg.api({action:'managerAccountList',operation:'driverSignupList',token:own});
      if(own!==cfg.token()||epoch!==masterGeneration||cfg.role()!=='MASTER')return;
      if(!data.ok){masterMessage(data.message||'목록을 불러오지 못했습니다.',true);return;}
      renderMaster(data.requests||[]);masterMessage('승인 대기 '+(data.requests||[]).filter(r=>r.status==='대기').length+'건');
    }catch(e){masterMessage('신청 목록을 불러오지 못했습니다. 다시 확인하세요.',true);}
    finally{byId('signupMasterLoad').disabled=false;}
  }
  function renderMaster(requests){
    const list=byId('signupMasterList');list.replaceChildren();
    requests.forEach(r=>{
      const card=node('article',null,'signup-request');card.append(node('h4',r.name+' · '+r.empId),node('p',r.route+'번 신청 · '+r.status));
      if(r.status!=='대기'){card.append(node('p',r.reason||'처리 완료'));list.append(card);return;}
      const label=node('label','연결할 기사'),select=node('select');select.setAttribute('aria-label',r.name+' 연결 기사');
      select.append(new Option('확인 후 선택하세요',''));
      (r.candidates||[]).forEach(d=>select.add(new Option(d.name+' · '+(d.empId||'사번 미등록')+' · '+d.route+'번 '+d.shift+'조 · '+d.status,d.driverId)));
      if(!(r.candidates||[]).length)select.add(new Option('기존 기사 없음 · 신규 등록','NEW'));
      label.append(select);card.append(label);
      const extra=node('div'),shift=node('select'),route=node('select');extra.hidden=true;
      shift.setAttribute('aria-label','신규 기사 근무조');['','A','B','예비'].forEach(v=>shift.add(new Option(v?v+'조':'근무조 선택',v)));
      route.setAttribute('aria-label','승인 노선');['5','23','70'].forEach(v=>route.add(new Option(v+'번',v)));route.value=r.route;extra.append(shift,route);card.append(extra);
      select.addEventListener('change',()=>extra.hidden=select.value!=='NEW');
      const confirm=node('label','성명·사원번호와 연결 대상을 확인했습니다.','signup-confirm'),checked=node('input');checked.type='checkbox';confirm.prepend(checked);card.append(confirm);
      const reason=node('input');reason.type='text';reason.maxLength=200;reason.placeholder='반려 시 사유 입력';reason.setAttribute('aria-label','처리 사유');card.append(reason);
      const actions=node('div',null,'signup-actions'),approve=node('button','확인 후 승인'),reject=node('button','반려','secondary');approve.type=reject.type='button';actions.append(approve,reject);card.append(actions);
      async function review(decision){
        if(masterBusy||cfg.role()!=='MASTER')return;
        if(!checked.checked){masterMessage('성명·사원번호와 연결 대상을 먼저 확인하세요.',true);return;}
        if(decision==='승인'&&(!select.value||(select.value==='NEW'&&!shift.value))){masterMessage('연결할 기사와 필요한 근무조를 선택하세요.',true);return;}
        if(decision==='반려'&&!reason.value.trim()){masterMessage('반려 사유를 입력하세요.',true);return;}
        const own=cfg.token(),candidate=(r.candidates||[]).find(d=>d.driverId===select.value);masterBusy=true;approve.disabled=reject.disabled=true;
        try{const data=await cfg.api({action:'managerAccountUpsert',operation:'driverSignupReview',token:own,requestId:r.requestId,revision:r.revision,decision,confirmed:true,driverId:select.value,driverRevision:candidate?.revision||'',shift:shift.value,route:route.value,reason:reason.value.trim()});
          if(own!==cfg.token()||cfg.role()!=='MASTER')return;
          masterMessage(data.message||'처리를 확인하지 못했습니다.',!data.ok);
          if(data.ok){card.replaceChildren(node('h4',r.name+' · '+decision),node('p',data.message));cfg.updated();}
        }catch(e){masterMessage('처리 결과를 확인하지 못했습니다. 목록을 다시 불러와 확인하세요.',true);}
        finally{masterBusy=false;approve.disabled=reject.disabled=false;}
      }
      approve.addEventListener('click',()=>review('승인'));reject.addEventListener('click',()=>review('반려'));list.append(card);
    });
    if(!requests.length)list.append(node('p','접수된 가입 신청이 없습니다.'));
  }
  root.Bus70Signup={start,clear:clearReceipt,loadMaster,resetMaster(){masterGeneration++;byId('signupMasterList').replaceChildren();byId('signupMasterStatus').textContent='';}};
})(window);
