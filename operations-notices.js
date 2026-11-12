/* Private, foreground-only inbox. No message bodies or recipients in browser storage. */
(function(root){
  let cfg,epoch=0,timer=0,busy=false,items=[],lastSync=0,voice=false,speaking=null,preview=null,pending=null,managerData=null,attempts=new Map(),queued=new Map(),interaction=null;
  const $=id=>document.getElementById(id),node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const session=()=>cfg?.session()||{},active=()=>Boolean(session().token&&session().driverId&&!session().role);
  const fresh=()=>Date.now()-lastSync<70000;
  const current=n=>Date.parse(n.expiresAt)>Date.now();
  const status=(message,error=false)=>{const n=$('noticeStatus');if(n){n.textContent=message;n.classList.toggle('error',error);}};
  async function request(operation,body={}){return cfg.api({action:'managerAccountUpsert',operation,token:session().token,...body});}
  function stopSpeech(){if(!speaking)return;const s=speaking;speaking=null;if(s.native)root.Bus70Android?.stopOperationsNotice?.();else root.speechSynthesis?.cancel();}
  function reset(){epoch++;clearInterval(timer);timer=0;busy=false;items=[];lastSync=0;voice=false;preview=null;pending=null;managerData=null;attempts.clear();queued.clear();interaction=null;stopSpeech();root.Bus70Android?.setOperationsNoticeSession?.('');for(const id of ['noticeItems','noticeManagerList','noticePreview'])$(id)?.replaceChildren();if($('noticeInbox'))$('noticeInbox').hidden=true;if($('noticeManagerPanel'))$('noticeManagerPanel').hidden=true;status('');refreshStrip();}
  function start(){reset();if(!active())return;root.Bus70Android?.setOperationsNoticeSession?.(session().driverId);$('noticeInbox').hidden=false;const e=epoch;setTimeout(()=>{if(e===epoch)poll();},1500);timer=setInterval(poll,45000);}
  async function receipt(ids,event){if(!ids.length||!active())return false;const e=epoch;try{const r=await request('noticeReceipt',{ids,event});if(e!==epoch)return false;if(!r.ok){if(r.error==='NOT_AVAILABLE'){ids.forEach(id=>queued.delete(event+'|'+id));items=items.filter(n=>!ids.includes(n.id));}else ids.forEach(id=>queued.set(event+'|'+id,{id,event}));status(r.message||'수신 기록을 저장하지 못했습니다.',true);renderInbox();return false;}ids.forEach(id=>queued.delete(event+'|'+id));const field={RECEIVED:'receivedAt',PLAYED:'playedAt',ACKNOWLEDGED:'acknowledgedAt'}[event];items.forEach(n=>{if(ids.includes(n.id)){n[field]=n[field]||new Date().toISOString();n.receivedAt=n.receivedAt||new Date().toISOString();}});renderInbox();return true;}catch(error){if(e===epoch){ids.forEach(id=>queued.set(event+'|'+id,{id,event}));status('수신 기록 저장 대기 · 연결 후 다시 확인하세요.',true);renderInbox();}return false;}}
  async function poll(){
    if(!active()||document.hidden||busy)return;const e=epoch;busy=true;
    try{const r=await request('noticeFeed');if(e!==epoch)return;if(!r.ok){lastSync=0;status(r.message||'공지 연결을 확인하세요.',true);refreshStrip();return;}
      items=(r.items||[]).filter(current);lastSync=Date.now();if(speaking&&!items.some(n=>n.id===speaking.id))stopSpeech();status('공지 동기화 완료 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}));renderInbox();for(const event of ['PLAYED','ACKNOWLEDGED']){const ids=[...queued.values()].filter(q=>q.event===event&&items.some(n=>n.id===q.id)).map(q=>q.id);if(ids.length)await receipt(ids,event);}await receipt(items.filter(n=>!n.receivedAt).map(n=>n.id),'RECEIVED');if(e===epoch)tryAutoVoice();
    }catch(error){if(e===epoch){lastSync=0;status('공지 수신 지연 · 다시 연결 중',true);refreshStrip();}}finally{if(e===epoch)busy=false;}
  }
  function refreshStrip(){
    const host=document.querySelector('.driver-live-primary');if(!host){document.getElementById('driverNoticeStrip')?.remove();return;}
    let strip=$('driverNoticeStrip');if(!strip){strip=node('div','', 'driver-notice-strip');strip.id='driverNoticeStrip';strip.setAttribute('role','status');host.querySelector('.driver-scroll-hint')?.before(strip);}
    const unread=items.filter(n=>!n.acknowledgedAt&&current(n)),first=unread.find(n=>n.priority==='URGENT')||unread[0];
    strip.hidden=!active()||!first;strip.classList.toggle('urgent',Boolean(first?.priority==='URGENT'));
    strip.textContent=first?(fresh()?'':'이전 수신 · ')+(first.priority==='URGENT'?'긴급 공지':'공지')+' '+unread.length+'건 · '+first.title+' · 정차 후 아래 확인':'';
    strip.title=first?.title||'';
  }
  function renderInbox(){
    if(!$('noticeItems'))return;const list=$('noticeItems');list.replaceChildren();
    if(!items.length)list.append(node('p','새 공지·정비 회신이 없습니다.','hint'));
    for(const n of items.filter(current)){
      const card=node('article',undefined,'notice-message '+(n.priority==='URGENT'?'urgent':''));card.append(node('strong',(n.priority==='URGENT'?'긴급 · ':'')+n.title),node('p',n.message));
      card.append(node('small',(n.receivedAt?'수신 완료':'수신 기록 대기')+' · '+(n.playedAt?'음성 재생 완료':'음성 미재생')+' · '+(n.acknowledgedAt?'기사 확인 완료':'미확인')));
      const actions=node('div',undefined,'inline-actions'),listen=node('button','음성으로 듣기','secondary'),ack=node('button',n.acknowledgedAt?'확인 완료':'내용 확인');listen.type=ack.type='button';listen.disabled=ack.disabled=!cfg.canInteract()||!fresh();ack.disabled=ack.disabled||Boolean(n.acknowledgedAt);
      listen.addEventListener('click',()=>{voice=true;play(n,true);});ack.addEventListener('click',async()=>{if(!cfg.canInteract()||!fresh())return;ack.disabled=true;await receipt([n.id],'ACKNOWLEDGED');});actions.append(listen,ack);card.append(actions);list.append(card);
    }
    $('noticeVoice').textContent=voice?'공지 음성 끄기':'공지 음성 켜기';$('noticeVoice').disabled=!cfg.canInteract();refreshStrip();
  }
  function completeSpeech(requestId,done){const s=speaking;if(!s||s.requestId!==requestId)return;const id=s.id;speaking=null;if(s.epoch!==epoch||!active()||document.hidden)return;if(done&&items.some(n=>n.id===id&&current(n)))receipt([id],'PLAYED');else status('음성 재생을 완료하지 못했습니다. 정차 후 내용을 확인하세요.',true);}
  root.bus70OperationsNoticeResult=function(raw){try{const r=typeof raw==='string'?JSON.parse(raw):raw;if(r.state==='DONE'||r.state==='FAILED')completeSpeech(r.requestId,r.state==='DONE');}catch(ignore){}};
  function play(n,manual=false){
    if(!active()||document.hidden||!fresh()||!current(n)||speaking||!voice||cfg.audioBusy()||manual&&!cfg.canInteract())return false;
    const e=epoch,message=(n.kind==='MAINTENANCE_CALL'?'정비소 점검 안내입니다. ':n.kind==='MAINTENANCE'?'정비 회신입니다. ':'소장 공지입니다. ')+n.title+'. '+n.message;
    const requestId='PLAY-'+root.crypto.randomUUID();speaking={id:n.id,requestId,epoch:e,native:false};attempts.set(n.id,Date.now());
    if(root.Bus70Android?.speakOperationsNotice){speaking.native=true;root.Bus70Android.speakOperationsNotice(JSON.stringify({requestId,driverId:session().driverId,message:message.slice(0,800)}));}
    else if('speechSynthesis' in root&&typeof root.SpeechSynthesisUtterance==='function'){
      const speech=new root.SpeechSynthesisUtterance(message);speech.lang='ko-KR';speech.rate=.95;
      speech.onend=()=>completeSpeech(requestId,true);speech.onerror=()=>completeSpeech(requestId,false);root.speechSynthesis.speak(speech);
    }else{speaking=null;status('이 기기는 공지 음성 지원을 확인해야 합니다. 화면에서 내용을 확인하세요.',true);return false;}
    setTimeout(()=>{if(speaking?.requestId===requestId&&speaking.epoch===e){stopSpeech();status('음성 완료 확인이 없어 재생 완료로 기록하지 않았습니다.',true);}},90000);return true;
  }
  function tryAutoVoice(){if(!voice||!fresh())return;const n=items.find(n=>n.priority==='URGENT'&&!n.playedAt&&!n.acknowledgedAt&&current(n)&&!attempts.has(n.id));if(n)play(n);}
  function tick(){const allowed=cfg.canInteract()+'|'+fresh();if(interaction!==allowed){interaction=allowed;renderInbox();}refreshStrip();if(speaking&&(!active()||document.hidden||!fresh()||!items.some(n=>n.id===speaking.id&&current(n))))stopSpeech();tryAutoVoice();}
  function form(){return {date:managerData?.date||'',audience:$('noticeAudience').value,route:$('noticeRoute').value,driverId:$('noticeDriver').value,title:$('noticeTitle').value.trim(),message:$('noticeMessage').value.trim(),priority:$('noticePriority').value,minutes:Number($('noticeMinutes').value)};}
  function invalidate(){preview=null;pending=null;$('noticePreview').replaceChildren();$('noticeConfirm').checked=false;$('noticePublish').disabled=true;const a=$('noticeAudience').value;$('noticeRouteField').hidden=a!=='ROUTE';$('noticeDriverField').hidden=a!=='DRIVER';$('noticeMessage').maxLength=$('noticePriority').value==='URGENT'?140:500;}
  function managerStatus(text,error=false){const n=$('noticeManagerStatus');n.textContent=text;n.classList.toggle('error',error);}
  async function open(){
    const e=epoch;$('noticeManagerPanel').hidden=false;try{const r=await request('noticeManagerLoad');if(e!==epoch)return;if(!r.ok){managerStatus(r.message||'공지 관리 연결을 확인하세요.',true);return;}
      managerData=r;$('noticeDate').textContent=r.date+' 운행일 기준';const select=$('noticeDriver'),selected=select.value;select.replaceChildren(new Option('기사 선택',''));r.drivers.forEach(d=>select.add(new Option(d.name+(d.assignments.length?' · '+d.assignments.map(a=>a.route+'번 '+a.sequence+'순차 '+a.vehicleNo+'호').join(' / '):' · 당일 배차 없음'),d.id)));select.value=selected;renderManager(r.notices);invalidate();
    }catch(error){if(e===epoch)managerStatus('공지 관리 통신에 실패했습니다.',true);}
  }
  function renderManager(notices){const list=$('noticeManagerList');list.replaceChildren();if(!notices.length)list.append(node('p','발송한 공지가 없습니다.','hint'));
    notices.forEach(n=>{const card=node('article',undefined,'notice-message');card.append(node('strong',n.title),node('p',n.message));const counts=[['대상',n.recipients.length],['수신',n.recipients.filter(r=>r.receivedAt).length],['재생',n.recipients.filter(r=>r.playedAt).length],['확인',n.recipients.filter(r=>r.acknowledgedAt).length]];card.append(node('p',counts.map(([k,v])=>k+' '+v+'명').join(' · ')),node('small',({ACTIVE:'전달 중',CANCELLED:'취소',EXPIRED:'만료'}[n.status]||n.status)+' · 유효 '+new Date(n.expiresAt).toLocaleString('ko-KR')));
      const details=node('details'),summary=node('summary','기사별 수신·확인');details.append(summary);n.recipients.forEach(r=>details.append(node('p',r.name+' · '+(r.receivedAt?'수신':'미수신')+' · '+(r.playedAt?'음성 재생':'미재생')+' · '+(r.acknowledgedAt?'기사 확인':'미확인'))));card.append(details);
      if(n.status==='ACTIVE'){const cancel=node('button','공지 취소','secondary');cancel.type='button';cancel.addEventListener('click',async()=>{const e=epoch;cancel.disabled=true;try{const r=await request('noticeCancel',{noticeId:n.id});if(e!==epoch)return;managerStatus(r.message,!r.ok);if(r.ok)await open();}catch(error){if(e===epoch)managerStatus('취소 결과를 확인하지 못했습니다. 새로고침하세요.',true);}finally{cancel.disabled=false;}});card.append(cancel);}list.append(card);
    });}
  function init(options){cfg=options;
    $('noticeManagerPanel').innerHTML=`<h2>기사 공지·수신 확인</h2><p id="noticeDate" class="hint"></p><p class="hint">로그인한 기사가 앱을 열었을 때 전달합니다. 긴급 공지는 음성을 켠 기사에게 짧게 안내합니다.</p><div class="manager-tools"><div><label for="noticeAudience">대상</label><select id="noticeAudience"><option value="ROUTE">노선 기사</option><option value="WORKING">당일 배차 기사 전체</option><option value="ALL">전체 기사</option><option value="DRIVER">개별 기사</option></select></div><div id="noticeRouteField"><label for="noticeRoute">노선</label><select id="noticeRoute"><option>5</option><option>23</option><option>70</option></select></div><div id="noticeDriverField" hidden><label for="noticeDriver">기사·배차 차량</label><select id="noticeDriver"></select></div><div><label for="noticePriority">안내 방식</label><select id="noticePriority"><option value="NORMAL">일반 · 화면 안내</option><option value="URGENT">긴급 · 짧은 음성</option></select></div><div><label for="noticeMinutes">유효시간 · 운행일 종료 03:30 이내</label><select id="noticeMinutes"><option value="60">1시간</option><option value="180">3시간</option><option value="720">12시간</option><option value="1440">24시간</option></select></div></div><label for="noticeTitle">제목</label><input id="noticeTitle" maxlength="60" placeholder="예: 우회 운행 안내"><label for="noticeMessage">내용</label><textarea id="noticeMessage" rows="4" maxlength="500"></textarea><button id="noticeCheck" type="button" class="secondary">대상·내용 미리보기</button><div id="noticePreview"></div><label class="notice-confirm"><input id="noticeConfirm" type="checkbox">대상과 내용을 확인했습니다.</label><button id="noticePublish" type="button" disabled>공지 보내기</button><p id="noticeManagerStatus" role="status"></p><hr><button id="noticeManagerRefresh" type="button" class="secondary">수신 현황 새로고침</button><div id="noticeManagerList"></div>`;
    $('noticeInbox').innerHTML=`<h2>공지·정비 회신</h2><p class="hint">운행 중에는 조작하지 마세요. 상세 확인·음성 설정은 안전하게 정차한 뒤 이용하세요.</p><div class="inline-actions"><button id="noticeRefresh" type="button" class="secondary">새로고침</button><button id="noticeVoice" type="button" class="secondary">공지 음성 켜기</button></div><p id="noticeStatus" role="status"></p><div id="noticeItems"></div>`;
    for(const id of ['noticeAudience','noticeRoute','noticeDriver','noticePriority','noticeMinutes','noticeTitle','noticeMessage'])$(id).addEventListener('input',invalidate);
    $('noticeConfirm').addEventListener('change',()=>{$('noticePublish').disabled=!preview||!$('noticeConfirm').checked;});
    $('noticeCheck').addEventListener('click',async()=>{const body=form(),e=epoch;invalidate();try{const r=await request('noticePreview',body);if(e!==epoch||JSON.stringify(body)!==JSON.stringify(form()))return;if(!r.ok){managerStatus(r.message,true);return;}preview={...body,revision:r.revision};$('noticePreview').append(node('strong',r.targets.length+'명 대상 · '+body.title),node('p',body.message),node('p',r.targets.map(t=>t.name).join(', ')));managerStatus('대상과 내용을 확인한 뒤 보내세요.');}catch(error){if(e===epoch)managerStatus('미리보기 통신에 실패했습니다.',true);}});
    $('noticePublish').addEventListener('click',async()=>{if(!preview||!$('noticeConfirm').checked)return;const e=epoch;pending=pending||{...preview,confirmed:true,requestId:'NOTICE-'+root.crypto.randomUUID()};$('noticePublish').disabled=true;try{const r=await request('noticePublish',pending);if(e!==epoch)return;managerStatus(r.message,!r.ok);if(r.ok){pending=null;$('noticeTitle').value='';$('noticeMessage').value='';await open();}else if(r.error==='AUDIENCE_CHANGED')invalidate();}catch(error){if(e===epoch)managerStatus('저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 눌러 확인할 수 있습니다.',true);}finally{if(e===epoch)$('noticePublish').disabled=!preview||!$('noticeConfirm').checked;}});
    $('noticeManagerRefresh').addEventListener('click',open);$('noticeRefresh').addEventListener('click',poll);
    $('noticeVoice').addEventListener('click',()=>{if(!cfg.canInteract())return;voice=!voice;if(!voice)stopSpeech();status(voice?'공지 음성 켜짐 · 긴급 공지만 자동 안내합니다.':'공지 음성을 껐습니다.');renderInbox();if(voice){const n=items.find(n=>n.priority==='URGENT'&&!n.playedAt&&!n.acknowledgedAt);if(n)play(n,true);}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSpeech();else if(active())poll();});invalidate();
  }
  root.Bus70Notices={init,start,reset,open,poll,tick,refreshStrip,renderInbox,interrupt:stopSpeech};
})(typeof window==='object'?window:globalThis);
