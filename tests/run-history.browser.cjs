const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});try{
 for(const width of [320,412]){
  const page=await browser.newPage({viewport:{width,height:824},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='https://synthetic.test')return r.abort();const file=decodeURIComponent(u.pathname).replace(/^\//,'')||'index.html';if(file.includes('..')||!fs.existsSync(file))return r.fulfill({status:404,body:''});return r.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(file)});});
  await page.goto('https://synthetic.test/');
  await page.evaluate(()=>{
   authToken='SYNTHETIC';openDriverScreen({driverId:'SYN-D',name:'시험 기사',route:'5'},false,false,'',false);
   operationData={accidentReportVersion:1,vehicles:[],incidents:[],adjustments:[]};operationDataLoaded=true;fillOperationVehicles();toggleDriverWorkMenu('ACCIDENT');
  });
  assert.equal(await page.locator('#driverNoAssignedVehicle').isVisible(),true);assert.equal(await page.locator('#driverIncidentSave').isDisabled(),true);
  await page.evaluate(()=>{
   document.getElementById('workDate').value='2000-01-08';window.historyRequests=[];
   const plans=[2,3,4,5,6,7].map(trip=>({date:'2000-01-08',route:'5',sequence:2,trip,dispatchId:'SYN-A',vehicleId:'SYN-V',startPlace:'합성 기점',turnPlace:trip===7?'':'합성 회차',endPlace:trip===7?'합성 종점':'합성 기점',plannedStart:trip===7?'23:00':'07:00',plannedTurn:trip===7?'':'08:00',plannedEnd:trip===7?'00:00':'09:00'}));
   apiPost=async body=>{window.historyRequests.push(body);return body.from==='2000-01-08'?{ok:true,logs:plans.slice(0,3).map(v=>({...v,actualStart:v.date+' 07:01:00',actualTurn:v.date+' 08:01:00',actualEnd:v.date+' 09:01:00'})),plannedTrips:plans,planCoverage:{complete:true}}:{ok:true,logs:[],plannedTrips:[],planCoverage:{complete:true}};};
   toggleDriverWorkMenu('LOG');
  });
  await page.waitForSelector('.run-log-count');assert.match(await page.locator('.run-log-count').innerText(),/조회 6탕 · 완료 3 · 시각 미기록 3/);
  assert.equal(await page.locator('.run-log-row').count(),6);assert.equal(await page.locator('.run-log-row[open]').count(),0);
  assert.match(await page.locator('.run-log-row').first().innerText(),/7탕/);assert.equal(await page.locator('.run-log-head span').filter({hasText:'기록 없음'}).count(),3);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'no mobile horizontal overflow');
  const out=process.env.CONTACT_LAYOUT_OUTPUT;if(out){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,`run-history-${width}.png`),fullPage:true});}
  await page.locator('.run-log-head').first().click();assert.equal(await page.locator('.run-log-row[open]').count(),1);assert.match(await page.locator('.run-log-row').first().innerText(),/저장된 실제 시각이 없습니다/);
  assert.equal(await page.locator('.run-log-row').first().locator('.ledger-table').count(),1);
  assert.equal(await page.locator('#exportRunLogs').isDisabled(),false);
  await page.locator('.ledger-sheet-view summary').click();
  assert.equal(await page.locator('.ledger-sheet thead th').count(),18);
  assert.equal(await page.locator('.ledger-sheet tbody tr').count(),6);
  assert.equal(await page.locator('.ledger-sheet tbody tr').first().locator('td').nth(14).innerText(),'09:01:00');
  assert.equal(await page.locator('.ledger-sheet tbody tr').last().locator('td').nth(14).innerText(),'');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'wide ledger scroll stays in its own container');
  await page.locator('.ledger-sheet-view summary').click();
  await page.locator('.run-log-row').last().locator('summary').click();assert.equal(await page.locator('.run-log-row').last().locator('.actual-arrival').count(),1);
  assert.equal(await page.locator('.run-log-row').last().locator('.actual-arrival').evaluate(el=>getComputedStyle(el).color),'rgb(185, 28, 28)');
  await page.locator('.run-log-row').last().locator('summary').click();
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.equal(await page.locator('.run-log-row[open]').count(),6);
  await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));assert.equal(await page.locator('.run-log-row[open]').count(),1);
  await page.locator('#runLogFrom').fill('2000-01-09');await page.locator('#runLogFrom').dispatchEvent('change');
  await page.waitForFunction(()=>window.historyRequests.some(v=>v.from==='2000-01-09'&&v.to==='2000-01-09'&&v.includePlans===true));
  assert.equal(await page.locator('.run-log-row').count(),0);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Mobile 320/412: no-assignment notice, complete/missing trip overview, collapsed detail, automatic dates, printable detail and no horizontal overflow passed.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
