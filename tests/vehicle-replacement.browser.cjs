const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const out=process.env.CONTACT_LAYOUT_OUTPUT||'/tmp/bus70-replacement';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']}));
 try{for(const width of [320,360,412,1280]){
  const page=await browser.newPage({viewport:{width,height:950},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='https://synthetic.test')return r.abort();const f=decodeURIComponent(u.pathname).slice(1)||'index.html';if(f.includes('..')||!fs.existsSync(f))return r.fulfill({status:404,body:''});return r.fulfill({contentType:f.endsWith('.html')?'text/html':f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(f)});});
  await page.goto('https://synthetic.test/');
  await page.evaluate(()=>{
   window.requests=[];window.saved=false;window.failFirst=true;window.newVehicle=false;
   authToken='SYNTHETIC';currentRole='MANAGER';currentIsManager=true;
   document.getElementById('loginSection').hidden=true;document.getElementById('managerDate').value='2026-11-09';document.getElementById('managerRoute').value='5';
   apiPost=async b=>{
    requests.push(b);
    if(b.operation==='vehicleReplacementLoad')return {ok:true,date:b.date,route:b.route,assignments:[{id:'P1',sequence:1,shift:'B',driverId:'D1',driverName:'합성기사',vehicleId:saved?'V2':'V1',revision:'R1'}],vehicles:[{id:'V1',no:'9001',route:'5',type:'일반',status:'운행가능',unavailable:[],assignments:[{id:'P1',route:'5',sequence:1}]},{id:'V2',no:'9002',route:'70',type:'일반',status:'운행가능',unavailable:[],assignments:[]},{id:'V3',no:'9003',route:'23',type:'예비',unavailable:[],assignments:[{id:'P2',route:'23',sequence:3}]},...(newVehicle?[{id:'V4',no:'9010',route:'23',type:'예비',unavailable:[],assignments:[]}]:[])],history:[]};
    if(b.operation==='replacementVehicleRegister'){newVehicle=true;return {ok:true,vehicleId:'V4',message:'합성 차량을 등록했습니다.'};}
    if(b.operation==='vehicleReplacementSave'){if(failFirst){failFirst=false;saved=true;throw Error('synthetic response lost');}return {ok:true,message:'대차를 저장했습니다. 기사 화면에서 배차를 다시 확인해 주세요.'};}
    return {ok:false,message:'합성 미제공'};
   };initManagerWorkspace();showManagerPage('HOME',false);
  });
  await page.locator('#managerHomeMenu [data-manager-page=REPLACEMENT]').click();await page.getByText(/확정 배차 1건을 불러왔습니다/).waitFor();
  assert.equal(await page.locator('#managerContext').isVisible(),false);
  await page.locator('#vrDispatch').selectOption('P1');await page.locator('#vrSearch').fill('9002');assert.match(await page.locator('#vrVehicle').textContent(),/70번 소속/);await page.locator('#vrVehicle').selectOption('V2');
  await page.locator('#vrReported').fill('2026-11-08T17:23');await page.locator('#vrReason').fill('합성 시험 · 에어펌프 고장');await page.locator('#vrConfirm').check();
  await page.locator('#replacementPanel').screenshot({path:path.join(out,`replacement-${width}.png`)});
  const wide=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right,left:e.getBoundingClientRect().left,width:e.getBoundingClientRect().width})).filter(e=>e.width&&e.right>innerWidth+1).slice(0,20)}));
  assert.equal(wide.scroll>wide.width,false,JSON.stringify(wide));
  await page.locator('#vrSave').click();await page.getByText(/저장 응답을 확인하지 못했습니다/).waitFor();assert.equal(await page.locator('#vrDate').isEnabled(),false);assert.equal(await page.locator('#vrVehicle').isEnabled(),false);assert.equal(await page.locator('#vrSave').isEnabled(),true);
  await page.locator('#vrSave').click();await page.getByText(/대차를 저장했습니다/).waitFor();
  let reqs=await page.evaluate(()=>requests.filter(r=>r.operation==='vehicleReplacementSave'));assert.equal(reqs.length,2);assert.deepEqual(reqs[0],reqs[1]);assert.equal(reqs[0].date,'2026-11-09');assert.equal(reqs[0].reportedAt,'2026-11-08T17:23');assert.equal(reqs[0].originalVehicleId,'V1');
  await page.locator('#vrDispatch').selectOption('P1');await page.locator('#vrAdd summary').click();await page.locator('#vrNewNo').fill('9010');await page.locator('#vrNewRoute').selectOption('23');await page.locator('#vrNewType').selectOption('예비');await page.locator('#vrNewStatus').selectOption('운행가능');
  await page.locator('#vrRegister').click();assert.equal(await page.evaluate(()=>requests.filter(r=>r.operation==='replacementVehicleRegister').length),0);await page.locator('#vrNewConfirm').check();await page.locator('#vrRegister').click();await page.getByText(/합성 차량을 등록했습니다/).waitFor();await page.waitForFunction(()=>document.getElementById('vrVehicle').value==='V4');
  assert.equal(await page.locator('#vrDispatch').inputValue(),'P1');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#vrDate').fill('2026-11-10');await page.locator('#vrDate').blur();await page.getByText(/날짜·노선이 바뀌었습니다/).waitFor();assert.equal(await page.locator('#vrDispatch option').count(),1);assert.equal(await page.locator('#vrConfirm').isChecked(),false);
  await page.locator('#vrLoad').click();await page.getByText(/2026-11-10 5번 확정 배차/).waitFor();
  await page.evaluate(()=>{Bus70Replacement.reset();authToken='';currentRole='';currentIsManager=false;});assert.equal(await page.locator('#vrVehicle option').count(),1);assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
 console.log('Replacement UI: 320/360/412/1280px, home shortcut, cross-route search, explicit registration, date separation, response-loss retry and session reset passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
