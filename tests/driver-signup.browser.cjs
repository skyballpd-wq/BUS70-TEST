const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const out=process.env.CONTACT_LAYOUT_OUTPUT||'/tmp/bus70-signup';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']}));
 try{
  for(const width of [320,360,412]){
   const page=await browser.newPage({viewport:{width,height:850},serviceWorkers:'block'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='https://synthetic.test')return r.abort();const f=decodeURIComponent(u.pathname).slice(1)||'index.html';if(f.includes('..')||!fs.existsSync(f))return r.fulfill({status:404,body:''});return r.fulfill({contentType:f.endsWith('.html')?'text/html':f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(f)});});
   await page.goto('https://synthetic.test/');
   await page.evaluate(()=>{
    window.requests=[];window.joinState='대기';window.failFirst=true;
    apiPost=async body=>{
     requests.push(body);
     if(body.operation==='driverSignupSubmit'){
      if(failFirst){failFirst=false;throw new Error('synthetic lost response');}
      return {ok:true,requestId:'JOIN-SYNTHETIC',status:'대기',expiresAt:Date.now()+86400000,message:'마스터 승인 대기 중입니다.'};
     }
     if(body.operation==='driverSignupStatus')return {ok:true,requestId:'JOIN-SYNTHETIC',status:joinState,message:joinState==='승인'?'승인되었습니다.':'마스터 승인 대기 중입니다.'};
     if(body.operation==='driverSignupComplete')return {ok:true,token:'SYNTHETIC',expiresAt:new Date(Date.now()+86400000).toISOString(),role:'',driver:{driverId:'SYNTHETIC-D',name:'시험기사',empId:'000001',route:'70'},schedule:{ok:true,type:'OFF',date:body.date,message:'합성 휴무'},alertSettings:driverAlertSettings};
     return {ok:false,message:'합성 미제공'};
    };
   });
   await page.locator('#signupPanel summary').click();
   await page.locator('#signupName').fill('시험기사');await page.locator('#signupEmpId').fill('000001');
   await page.locator('#signupSubmit').click();await page.getByText(/통신을 확인하지 못했습니다/).waitFor();
   await page.locator('#signupSubmit').click();await page.locator('#signupPending').waitFor({state:'visible'});
   const state=await page.evaluate(()=>({requests,storage:localStorage.getItem('BUS70_SIGNUP_RECEIPT_V1'),token:authToken,wide:document.documentElement.scrollWidth>innerWidth}));
   assert.equal(state.requests[0].receipt,state.requests[1].receipt,'retry uses original opaque receipt');
   assert.equal(state.token,'','pending never authenticates');assert.equal(state.wide,false);
   assert.ok(!state.storage.includes('000001')&&!state.storage.includes('시험기사'),'receipt storage has no employee credentials');
   await page.locator('#signupStatus').screenshot({path:path.join(out,`signup-pending-${width}.png`)});
   await page.evaluate(()=>{joinState='승인';});await page.locator('#signupCheck').click();
   await page.locator('#sessionBar').waitFor({state:'visible'});assert.match(await page.locator('#sessionGreeting').innerText(),/시험기사/);
   assert.equal(await page.evaluate(()=>localStorage.getItem('BUS70_SIGNUP_RECEIPT_V1')),null);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(REMEMBER_KEY)).token),'SYNTHETIC');
   await page.locator('#logoutButton').click();await page.locator('#loginButton').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>authToken),'');
   await page.evaluate(()=>{
    authToken='MASTER-SYNTHETIC';currentRole='MASTER';currentIsManager=true;
    document.getElementById('loginSection').hidden=true;
    apiPost=async body=>{
     requests.push(body);
     if(body.operation==='driverSignupList')return {ok:true,requests:[{requestId:'JOIN-SYNTHETIC',name:'시험기사',empId:'000001',route:'70',status:'대기',revision:'R',candidates:[{driverId:'EXISTING',name:'시험기사',empId:'',route:'70',shift:'B',status:'재직',revision:'D'}]}]};
     if(body.operation==='driverSignupReview')return {ok:true,message:'승인했습니다.',status:'승인'};
     return {ok:false,message:'합성 미제공'};
    };
    initManagerWorkspace();showManagerPage('ROSTER',false);
   });
   await page.locator('#signupMasterLoad').click();await page.getByRole('heading',{name:'시험기사 · 000001'}).waitFor();
   await page.getByRole('button',{name:'확인 후 승인',exact:true}).click();
   assert.equal(await page.evaluate(()=>requests.filter(r=>r.operation==='driverSignupReview').length),0,'explicit review required');
   await page.getByLabel('시험기사 연결 기사').selectOption('EXISTING');
   await page.getByLabel('성명·사원번호와 연결 대상을 확인했습니다.').check();
   await page.locator('#signupMasterPanel').screenshot({path:path.join(out,`signup-master-${width}.png`)});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.getByRole('button',{name:'확인 후 승인',exact:true}).click();await page.getByRole('heading',{name:'시험기사 · 승인'}).waitFor();
   const review=await page.evaluate(()=>requests.find(r=>r.operation==='driverSignupReview'));
   assert.equal(review.driverId,'EXISTING');assert.equal(review.driverRevision,'D');assert.equal(review.revision,'R');assert.equal(review.confirmed,true);
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();}
 console.log('Signup UI: 320/360/412px, response retry, pending gate, receipt privacy, approval login, logout and explicit master review passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
