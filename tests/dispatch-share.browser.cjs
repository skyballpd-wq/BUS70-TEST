const fs=require('fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const html=fs.readFileSync('index.html','utf8');
const rows=html.slice(html.indexOf('  function renderManagerRows('),html.indexOf('  function renderManagerSummary('));
const exporter=html.slice(html.indexOf('  function verticalText('),html.indexOf('  document.getElementById("managerLoad").addEventListener'));
const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${html.match(/<style>([\s\S]*?)<\/style>/)[1]}</style>
<main><input id="managerRoute" value="5"><input id="managerDate" value="2099-01-08"><input id="managerShift" value="B"><div id="managerRows"></div><div id="managerStatus"></div>
<button id="managerSave"></button><button id="managerOcr"></button><button id="managerGenerate">생성</button><div id="managerOutput" hidden><img id="managerResultImage"><button id="managerShare">공유</button><button id="managerDownload">저장</button></div></main>
<script>
let managerImageBlob=null,managerImageContext=null,managerImageRequest='',currentRole='MASTER';
const normalizedRoute=String,applyRouteBrand=()=>{};
function el(tag,text,cls){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;}
function managerNotice(message,error){document.getElementById('managerStatus').textContent=message;}
function managerAssignments(){return [...document.querySelectorAll('.manager-row')].map(row=>({sequence:Number(row.dataset.sequence),driverId:row.querySelector('.manager-driver').value,vehicleId:row.querySelector('.manager-vehicle').value}));}
let managerData={route:'5',date:'2099-01-08',drivers:[{id:'TEST-DRIVER',name:'가상기사',route:'5',shift:'B'}],vehicles:[{id:'TEST-CAR',last3:'999',displayNo:'시험차량'}],assignments:[{sequence:10,driverId:'TEST-DRIVER',vehicleId:'TEST-CAR',shift:'B'}],departures:{10:{time:'05:00',place:'시험기점'}},plannedLeaveOverrides:[{driverName:'가상기사',type:'휴무'}]};
window.exports=[];window.Bus70Android={exportDispatchImage:(...args)=>window.exports.push(args)};
${rows}
${exporter}
renderManagerRows(managerData);
managerGenerate.onclick=generateManagerImage;managerShare.onclick=shareManagerImage;managerDownload.onclick=downloadManagerImage;
</script>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:412,height:820}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(fixture);
  assert.equal(await page.locator('.manager-driver').inputValue(),'TEST-DRIVER');
  assert.match(await page.locator('#managerRows').innerText(),/당일 확정 배차/);
  await page.click('#managerGenerate');await page.locator('#managerOutput').waitFor({state:'visible'});
  await page.click('#managerShare');await page.waitForFunction(()=>window.exports.length===1);
  let result=await page.evaluate(()=>window.exports[0]);assert.equal(result[1],'share');assert.equal(result[2],'BUS5-2099-01-08.png');assert.equal(Buffer.from(result[3],'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  await page.evaluate(id=>bus70DispatchImageResult({requestId:id,ok:true,state:'opened',message:'공유창 열림'}),result[0]);
  assert.equal(await page.locator('#managerStatus').innerText(),'공유창 열림');
  await page.click('#managerDownload');await page.waitForFunction(()=>window.exports.length===2);
  assert.equal(await page.evaluate(()=>window.exports[1][1]),'save');
  await page.evaluate(()=>bus70DispatchImageResult({requestId:'old-request',ok:true,message:'오래된 저장 완료'}));
  assert.doesNotMatch(await page.locator('#managerStatus').innerText(),/오래된 저장 완료/);
  await page.locator('.manager-driver').selectOption('');await page.click('#managerShare');
  assert.equal(await page.evaluate(()=>window.exports.length),2);assert.match(await page.locator('#managerStatus').innerText(),/다시 생성/);
  await page.locator('.manager-driver').selectOption('TEST-DRIVER');await page.evaluate(()=>window.Bus70Android={});await page.click('#managerShare');
  assert.match(await page.locator('#managerStatus').innerText(),/v81/);
  await page.evaluate(()=>{delete window.Bus70Android;window.webShares=[];navigator.canShare=()=>true;navigator.share=async data=>window.webShares.push(data.files[0].name);});
  await page.click('#managerShare');assert.deepEqual(await page.evaluate(()=>window.webShares),['BUS5-2099-01-08.png']);
  await page.evaluate(()=>{managerData.drivers=[];renderManagerRows(managerData);});
  assert.equal(await page.locator('.manager-driver').inputValue(),'TEST-DRIVER');
  assert.match(await page.locator('.manager-driver option:checked').innerText(),/確定|확정 배차/);
  assert.equal(await page.locator('.manager-driver option:checked').isDisabled(),true);
  assert.deepEqual(errors,[]);console.log('Dispatch roster display, native PNG share/save, old APK, stale image and browser fallback passed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
