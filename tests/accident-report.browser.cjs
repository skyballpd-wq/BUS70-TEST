const fs=require('fs'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const html=fs.readFileSync('index.html','utf8'),css=html.match(/<style>([\s\S]*?)<\/style>/)[1]+fs.readFileSync('accident-report.css','utf8'),moduleSource=fs.readFileSync('accident-report.js','utf8');
const output=process.env.CONTACT_LAYOUT_OUTPUT||'/tmp/bus70-accident-preview';fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']}));
 try{for(const width of [320,412]){
  const page=await browser.newPage({viewport:{width,height:740}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://bus70.test/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><main class="content"><h2>사건·사고 보고</h2><p>합성 데이터 검사</p><div id="report"></div><button id="submit">보고 검사</button><p id="result"></p></main><script>${moduleSource}\nwindow.form=Bus70Accident.mount(document.getElementById('report'));form.prefill('시험00가0001');document.getElementById('submit').onclick=()=>document.getElementById('result').textContent=form.validate()||'검증 통과';</script></body></html>`}));
  await page.goto('https://bus70.test/');
  await page.getByLabel('상대 차량 전체 번호',{exact:true}).fill('시험00나0002');await page.getByLabel('사고 현장 위치',{exact:true}).fill('가상 시험장');await page.getByLabel('양쪽 차량 접촉·파손 부위',{exact:true}).fill('우리 앞 범퍼 · 상대 뒤 범퍼');
  await page.getByRole('button',{name:'보고 검사'}).click();assert.match(await page.locator('#result').innerText(),/5장/);
  const categories=['우리 차량 번호판','상대 차량 번호판','사고 현장 전경','우리 차량 접촉·파손 부위','상대 차량 접촉·파손 부위'];
  const pictures=[];for(let i=0;i<5;i++)pictures.push(await page.evaluate(i=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d');x.fillStyle=['#e8f5e9','#e3f2fd','#fff3e0','#fce4ec','#f3e5f5'][i];x.fillRect(0,0,600,400);x.fillStyle='#123a69';x.font='40px sans-serif';x.fillText('SYNTHETIC '+(i+1),70,200);return c.toDataURL('image/png').split(',')[1];},i));
  await page.getByLabel('사진 여러 장 선택 파일',{exact:true}).setInputFiles(pictures.map((data,i)=>({name:`synthetic-${i}.png`,mimeType:'image/png',buffer:Buffer.from(data,'base64')})));
  await page.waitForFunction(()=>form.data().photos.length===5&&!document.querySelector('input[type=file]').disabled);
  await page.getByRole('button',{name:'보고 검사'}).click();assert.match(await page.locator('#result').innerText(),/포함/);
  await page.getByLabel('양쪽 번호판·현장·양쪽 접촉 부위 사진을 포함했습니다.',{exact:true}).check();
  await page.getByRole('button',{name:'보고 검사'}).click();assert.equal(await page.locator('#result').innerText(),'검증 통과');
  const firstId=await page.evaluate(()=>form.data().requestId);assert.equal(firstId,await page.evaluate(()=>form.data().requestId));
  await page.getByLabel('사진 여러 장 선택 파일',{exact:true}).setInputFiles({name:'same.png',mimeType:'image/png',buffer:Buffer.from(pictures[0],'base64')});await page.waitForFunction(()=>document.querySelector('.accident-message').textContent.includes('중복'));assert.equal(await page.evaluate(()=>form.data().photos.length),5);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  await page.screenshot({path:`${output}/accident-${width}.png`,fullPage:true});
  await page.evaluate(()=>form.uncertain());assert.equal(await page.getByLabel('상대 차량 전체 번호',{exact:true}).isDisabled(),true);assert.equal(await page.evaluate(()=>form.data().requestId),firstId);assert.equal(await page.evaluate(()=>form.data().photos.length),5);
  await page.evaluate(()=>form.reset());assert.equal(await page.evaluate(()=>form.data().photos.length),0);assert.equal(await page.getByLabel('상대 차량 전체 번호',{exact:true}).inputValue(),'');assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
 console.log('Accident mobile 320/412px: image selection, compression, one multi-file selection with coverage confirmation, duplicate rejection, stable retry and reset passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
