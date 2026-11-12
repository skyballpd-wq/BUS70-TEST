const fs=require('fs'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']}));
 try{for(const width of [320,412,1008]){
  const page=await browser.newPage({viewport:{width,height:850},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2099-01-08T10:00:00+09:00')});
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='https://synthetic.test')return r.abort();const f=decodeURIComponent(u.pathname).slice(1)||'index.html';if(f.includes('..')||!fs.existsSync(f))return r.fulfill({status:404,body:''});return r.fulfill({contentType:f.endsWith('.html')?'text/html':f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(f)});});
  await page.goto('https://synthetic.test/');
  await page.evaluate(async()=>{
   authToken='TEST';currentRole='MANAGER';currentDriverId='MANAGER';currentIsManager=true;document.getElementById('loginSection').hidden=true;
   window.noticeCalls=[];window.spoken=[];window.failPublish=true;window.failReceipt=false;window.feed=[];
   window.Bus70Android={setOperationsNoticeSession(){},stopOperationsNotice(){},speakOperationsNotice(raw){spoken.push(JSON.parse(raw));}};
   apiPost=async b=>{noticeCalls.push(structuredClone(b));
    if(b.operation==='noticeManagerLoad')return {ok:true,date:'2099-01-08',drivers:[{id:'D1',name:'합성기사',assignments:[{route:'5',sequence:1,vehicleNo:'시험0001'}]}],notices:[]};
    if(b.operation==='noticePreview')return {ok:true,revision:'SYNTHETIC-REVISION',targets:[{id:'D1',name:'합성기사'}]};
    if(b.operation==='noticePublish'){if(failPublish){failPublish=false;throw Error('synthetic response lost');}return {ok:true,message:'시험 저장 완료'};}
    if(b.operation==='noticeFeed')return {ok:true,items:structuredClone(feed)};
    if(b.operation==='noticeReceipt'){if(failReceipt)throw Error('synthetic receipt outage');for(const n of feed)if(b.ids.includes(n.id)){n.receivedAt=n.receivedAt||new Date().toISOString();n[{RECEIVED:'receivedAt',PLAYED:'playedAt',ACKNOWLEDGED:'acknowledgedAt'}[b.event]]=new Date().toISOString();}return {ok:true};}
    return {ok:false,message:'합성 미제공'};
   };
   initManagerWorkspace();showManagerPage('HOME',false);
  });
  await page.locator('#managerHomeMenu [data-manager-page=NOTICES]').click();await page.locator('#noticeDate').getByText(/2099/).waitFor();
  assert.equal(await page.locator('#managerContext').isVisible(),false);
  await page.locator('#noticeTitle').fill('합성 우회 안내');await page.locator('#noticeMessage').fill('<img src=x onerror=alert(1)> 긴 공지도 겹치지 않고 확인합니다.');
  await page.locator('#noticeCheck').click();await page.locator('#noticePreview strong').waitFor();assert.equal(await page.locator('#noticePreview img').count(),0);
  await page.locator('#noticeConfirm').check();await page.locator('#noticeMessage').fill('변경한 합성 안내');assert.equal(await page.locator('#noticePublish').isEnabled(),false);
  await page.locator('#noticeCheck').click();await page.locator('#noticePreview strong').waitFor();await page.locator('#noticeConfirm').check();await page.locator('#noticePublish').click();await page.getByText(/저장 결과를 확인하지 못했습니다/).waitFor();
  await page.locator('#noticePublish').click();await page.getByText('시험 저장 완료').waitFor();
  const calls=await page.evaluate(()=>noticeCalls.filter(b=>b.operation==='noticePublish'));assert.equal(calls.length,2);assert.equal(calls[0].requestId,calls[1].requestId,'lost response retry uses identical request ID');
  await page.evaluate(async()=>{
   currentRole='';currentIsManager=false;currentDriverId='D1';lastSchedule=null;
   feed=[{id:'N1',kind:'NOTICE',title:'합성 긴급 공지',message:'합성 시험 내용',priority:'URGENT',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),receivedAt:'',playedAt:'',acknowledgedAt:''}];
   Bus70Notices.start();await Bus70Notices.poll();
  });
  assert.match(await page.locator('#noticeItems').innerText(),/수신 완료.*음성 미재생.*미확인/);assert.equal(await page.evaluate(()=>spoken.length),0,'default voice is off');
  await page.locator('#noticeVoice').click();assert.equal(await page.evaluate(()=>spoken.length),1);assert.equal(await page.evaluate(()=>noticeCalls.filter(b=>b.event==='PLAYED').length),0,'speech acceptance is not completion');
  await page.evaluate(()=>bus70OperationsNoticeResult({requestId:spoken[0].requestId,state:'DONE'}));await page.getByText(/음성 재생 완료/).waitFor();assert.equal(await page.evaluate(()=>noticeCalls.filter(b=>b.event==='ACKNOWLEDGED').length),0);
  await page.evaluate(()=>{document.getElementById('workDate').value='2099-01-08';lastSchedule={trips:[{trip:1}],dispatch:{seq:1},runLogs:[{date:'2099-01-08',sequence:1,trip:1,actualStart:'10:00:00'}]};lastDriverPosition={timestamp:Date.now(),coords:{speed:8}};Bus70Notices.tick();});
  assert.equal(await page.locator('#noticeItems button').last().isEnabled(),false,'moving driver cannot acknowledge');
  await page.evaluate(()=>{lastDriverPosition.coords.speed=0;Bus70Notices.tick();});assert.equal(await page.locator('#noticeItems button').last().isEnabled(),true);
  await page.evaluate(()=>{failReceipt=true;});await page.locator('#noticeItems button').last().click();await page.getByText(/수신 기록 저장 대기/).waitFor();
  await page.evaluate(async()=>{failReceipt=false;await Bus70Notices.poll();});await page.getByText(/기사 확인 완료/).waitFor();
  // A callback from a previous session cannot mark a new session's playback.
  const oldId=await page.evaluate(()=>spoken[0].requestId);
  await page.evaluate(async()=>{Bus70Notices.reset();feed[0].playedAt='';feed[0].acknowledgedAt='';Bus70Notices.start();await Bus70Notices.poll();});
  await page.locator('#noticeVoice').click();assert.notEqual(await page.evaluate(()=>spoken.at(-1).requestId),oldId);
  const played=await page.evaluate(()=>noticeCalls.filter(b=>b.event==='PLAYED').length);
  await page.evaluate(id=>bus70OperationsNoticeResult({requestId:id,state:'DONE'}),oldId);assert.equal(await page.evaluate(()=>noticeCalls.filter(b=>b.event==='PLAYED').length),played);
  await page.evaluate(()=>bus70OperationsNoticeResult({requestId:spoken.at(-1).requestId,state:'FAILED'}));assert.equal(await page.evaluate(()=>noticeCalls.filter(b=>b.event==='PLAYED').length),played);
  await page.evaluate(async()=>{feed=[];await Bus70Notices.poll();});assert.equal(await page.locator('.notice-message').count(),0,'cancelled/removed items leave the inbox');
  assert.equal(await page.evaluate(()=>Object.values(localStorage).some(v=>/합성 긴급 공지|합성 시험 내용/.test(v))),false,'no notice body in browser storage');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
  if(process.env.CONTACT_LAYOUT_OUTPUT){fs.mkdirSync(process.env.CONTACT_LAYOUT_OUTPUT,{recursive:true});await page.screenshot({path:process.env.CONTACT_LAYOUT_OUTPUT+'/notices-'+width+'.png',fullPage:true});}
  assert.deepEqual(errors,[]);await page.close();
 }console.log('Notice manager retry, text safety, distinct receipts, stationary actions, native completion, session isolation and cancellation passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
