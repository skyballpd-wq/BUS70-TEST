const fs=require('fs'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']}));
 try{for(const width of [320,360,412]){
  const page=await browser.newPage({viewport:{width,height:800},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='https://synthetic.test')return r.abort();const file=decodeURIComponent(u.pathname).slice(1)||'index.html';if(file.includes('..')||!fs.existsSync(file))return r.fulfill({status:404,body:''});return r.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(file)});});
  await page.goto('https://synthetic.test/');
  await page.evaluate(()=>{
   document.querySelectorAll('body>*').forEach(n=>{if(n.contains(document.getElementById('managerPanel')))return;n.hidden=true;});
   let n=document.getElementById('managerPanel');while(n&&n!==document.body){n.hidden=false;n=n.parentElement;}
   document.querySelectorAll('section').forEach(n=>{if(n.id!=='managerPanel'&&!n.contains(document.getElementById('managerPanel')))n.hidden=true;});
   currentRole='MANAGER';authToken='SYNTHETIC';managerRequestId++;
   document.getElementById('managerRoute').value='5';document.getElementById('managerDate').value='2099-01-08';document.getElementById('managerShift').value='B';
   managerData={route:'5',date:'2099-01-08',drivers:[{id:'D1',name:'시험기사1',route:'5',shift:'B'},{id:'D2',name:'시험지원기사',route:'23',shift:'B'}],vehicles:[{id:'V1',last3:'001',displayNo:'시험차량1'}],assignments:[],predictions:{B:{assignments:[{sequence:1,driverId:'D1',vehicleId:'V1',predicted:true}]}},departures:{1:{time:'06:00',place:'시험차고지'}},schedulePrediction:{predicted:true,sourceDate:'2099-01-06'}};
   window.savedCalls=[];apiPost=body=>{savedCalls.push(body);return new Promise(resolve=>window.resolveSave=resolve);};renderManagerRows(managerData);
  });
  assert.match(await page.locator('.manager-confirm').innerText(),/예측/);
  assert(await page.locator('#managerSave').isVisible());
  assert(await page.locator('#managerSave').evaluate(n=>n.getBoundingClientRect().height>=44));
  await page.locator('#managerSave').click();assert(await page.locator('#managerSave').isDisabled());
  await page.evaluate(()=>resolveSave({ok:false,message:'합성 저장 실패'}));
  await page.waitForFunction(()=>!document.getElementById('managerSave').disabled);
  assert.equal(await page.locator('.manager-driver').inputValue(),'D1');assert.match(await page.locator('#managerStatus').innerText(),/합성 저장 실패/);
  await page.locator('#managerSupport summary').click();await page.locator('#managerCrossRoute').check();await page.locator('#managerCrossRouteReason').fill('시험 지원');await page.locator('.manager-driver').selectOption('D2');
  await page.locator('#managerSave').click();
  await page.evaluate(()=>{const a=savedCalls.at(-1).assignments[0];resolveSave({ok:true,message:'배차 저장 완료',data:{...managerData,schedulePrediction:null,assignments:[{...a,shift:'B',dispatchId:'EXISTING-ID'}]}});});
  await page.waitForFunction(()=>!document.getElementById('managerSave').disabled);
  assert.equal(await page.locator('.manager-driver').inputValue(),'D2');assert.match(await page.locator('.manager-confirm').innerText(),/저장됨/);assert.equal(await page.getByText('소장 확정 전 시간표 예측',{exact:true}).count(),0);
  assert(await page.locator('.manager-row').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'manager rows fit narrow phones');
  await page.evaluate(()=>{
   const root=document.createElement('div');root.id='syntheticDriver';document.body.append(root);
   const trip={startTime:'22:28',turnPlace:'시험복지회관',controlPoint:'시험역',controlTime:'00:05',controlPurpose:'전철 막차 연계',endTime:'00:30'};
   root.append(cockpitPhaseTable({routeProfile:{stops:[]}},trip,{},true));
   const safety=document.createElement('div');safety.id='driverRoadSafety';safety.className='road-safety';safety.innerHTML='<span class="road-safety-status"></span><button>경고음 켜기</button>';root.append(safety);
   lastSchedule={route:'5',dispatch:{dispatchId:'TEST'},roadSafety:{zones:[]}};updateRoadSafety({trip:{trip:1},log:{actualStart:'10:00'}},{configured:false},true);
  });
  assert.match(await page.locator('#syntheticDriver .cockpit-phases').innerText(),/다음날 00:05/);assert.match(await page.locator('#syntheticDriver .cockpit-phases').innerText(),/시험복지회관/);
  assert.match(await page.locator('#driverRoadSafety').innerText(),/자료 미등록/);assert.equal(await page.locator('#driverRoadSafety button').isVisible(),false);
  if(process.env.CONTACT_LAYOUT_OUTPUT){fs.mkdirSync(process.env.CONTACT_LAYOUT_OUTPUT,{recursive:true});await page.screenshot({path:process.env.CONTACT_LAYOUT_OUTPUT+'/field-operations-'+width+'.png',fullPage:true});}
  assert.deepEqual(errors,[]);await page.close();
 }console.log('Mobile manager prediction/save/failure/support assignment, overnight connection checkpoint and unavailable safety data passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
