const fs=require('fs'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const html=fs.readFileSync('index.html','utf8');
const rows=html.slice(html.indexOf('  function renderManagerRows('),html.indexOf('  function renderManagerSummary('));
const exporter=html.slice(html.indexOf('  function managerImageDateLabel('),html.indexOf('  document.getElementById("managerLoad").addEventListener'));
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
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']}));
 try{
  const page=await browser.newPage({viewport:{width:412,height:820},timezoneId:'America/Los_Angeles'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
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
  await page.click('#managerGenerate');
  await page.waitForFunction(()=>document.getElementById('managerStatus').textContent.includes('확인 필요 1개'));
  assert.match(await page.locator('#managerStatus').innerText(),/이미지를 생성/);
  assert.match(await page.locator('#managerStatus').innerText(),/확인 필요 1개/);
  assert.equal(await page.evaluate(()=>managerImageDateLabel('2026-10-18')),'2026-10-18 (일)');
  assert.equal(await page.evaluate(()=>managerImageDateLabel('2026-02-30')),'날짜 확인 필요');
  // Capture actual canvas glyph bounds, not just calls to the layout helper.
  await page.evaluate(()=>{
    window.drawn=[];const proto=CanvasRenderingContext2D.prototype,fill=proto.fillText,rect=proto.rect,clip=proto.clip,save=proto.save,restore=proto.restore;
    proto.save=function(){(this.testClips||(this.testClips=[])).push(this.testClip);return save.call(this);};
    proto.restore=function(){this.testClip=this.testClips.pop();return restore.call(this);};
    proto.rect=function(x,y,w,h){this.testRect={x,y,w,h};return rect.call(this,x,y,w,h);};
    proto.clip=function(){this.testClip=this.testRect;return clip.call(this);};
    proto.fillText=function(text,x,y){const m=this.measureText(text);window.drawn.push({text,clip:this.testClip,left:x-m.actualBoundingBoxLeft,right:x+m.actualBoundingBoxRight,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent});return fill.call(this,text,x,y);};
    window.makeBoard=async(count,route)=>{
      managerRoute.value=route;managerData={route,date:'2099-01-08',drivers:[],vehicles:[],assignments:[],departures:{}};
      for(let i=1;i<=count;i++){
        managerData.drivers.push({id:'SYN-D'+i,name:'시험기사'+String(i).padStart(2,'0'),route,shift:'B'});
        managerData.vehicles.push({id:'SYN-V'+i,last3:String(900+i),displayNo:'합성차량'+i});
        managerData.assignments.push({sequence:i,driverId:i===10?'SYN-MISSING-D':i===2?'':'SYN-D'+i,vehicleId:i===11?'SYN-MISSING-V':i===3?'':'SYN-V'+i,shift:'B'});
        managerData.departures[i]={time:String(5+Math.floor(i/60)).padStart(2,'0')+':'+String(i%60).padStart(2,'0'),place:i%2?'시험고강공영차고지':'시험장거리출발지정류소'};
      }
      renderManagerRows(managerData);window.drawn=[];const before=JSON.stringify(managerAssignments());await generateManagerImage();
      return {before,after:JSON.stringify(managerAssignments()),size:managerImageBlob.size,drawn:window.drawn,data:await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(managerImageBlob);})};
    };
  });
  const output=process.env.CONTACT_LAYOUT_OUTPUT||'/tmp/bus70-dispatch-layout';fs.mkdirSync(output,{recursive:true});
  for(const [count,route] of [[8,'70'],[22,'5'],[32,'5'],[80,'5']]){
    const board=await page.evaluate(([count,route])=>makeBoard(count,route),[count,route]);
    assert.equal(board.before,board.after,'image generation must not alter assignments');
    assert(board.size<5000000,'PNG fits the signed APK limit');
    const png=Buffer.from(board.data.split(',')[1],'base64');assert.equal(png.readUInt32BE(16),1440);assert(png.readUInt32BE(20)<=4096);
    assert.equal(board.drawn.filter(x=>/^\d+순차$/.test(x.text)).length,count,'retain every sequence');
    assert(board.drawn.map(x=>x.text).join('').includes('기사 미지정'));
    assert(board.drawn.map(x=>x.text).join('').includes('차량 미지정'));
    if(count>=22){assert(board.drawn.map(x=>x.text).join('').includes('기사 확인 필요'));assert(board.drawn.map(x=>x.text).join('').includes('차량 확인 필요'));}
    for(const glyph of board.drawn){const b=glyph.clip;assert(b,'text must be confined to a field');assert(glyph.left>=b.x-1&&glyph.right<=b.x+b.w+1&&glyph.top>=b.y-1&&glyph.bottom<=b.y+b.h+1,'glyph overflow: '+JSON.stringify(glyph));}
    if(count<=22)fs.writeFileSync(require('path').join(output,'dispatch-layout-'+route+'-'+count+'-synthetic.png'),png);
  }
  await page.evaluate(()=>{managerData.departures={};renderManagerRows(managerData);});await page.click('#managerGenerate');
  assert.match(await page.locator('#managerStatus').innerText(),/순차가 없습니다/);
  assert.deepEqual(errors,[]);console.log('Dispatch roster display, native PNG share/save, old APK, stale image and browser fallback passed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
