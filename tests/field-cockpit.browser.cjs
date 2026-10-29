const fs=require('fs'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const html=fs.readFileSync('index.html','utf8'),css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
const section=(a,b)=>html.slice(html.indexOf('  function '+a+'('),html.indexOf('  '+b));
const fixture=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body class="driver-mode"><main id="root"></main>
<script>${fs.readFileSync('driver-cockpit.js','utf8')}</script><script>
let activeTripIndex=0,followCurrentTrip=true;const lastSchedule={trips:Array.from({length:7},(_,i)=>({trip:i+1}))};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const firstActiveTripIndex=()=>2,tripOperationalState=(d,t,i)=>({key:i===2?'running':'',label:i===2?'운행 중':'예정'});
${section('selectDriverTrip','async function refreshCockpitWeather')}
function renderSchedule(){const root=document.getElementById('root');root.replaceChildren();renderTripPicker(root,lastSchedule);const box=el('section',null,'orbit-cockpit'),ring=el('div',null,'orbit-ring');ring.id='ring';box.append(ring);root.append(box);Bus70Cockpit.bindSwipe(box,delta=>selectDriverTrip(activeTripIndex+delta));Bus70Cockpit.drawRing(ring,114,25,22.4,false,{color:'#078564',key:'moving'},[{side:'front',fraction:30.5/114,sequence:3,stopName:'시험앞정류장',age:10},{side:'rear',fraction:20.5/114,sequence:1,stopName:'시험뒤정류장',age:45,stale:true}]);}
renderSchedule();
</script>`;
(async()=>{const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']}));try{
 for(const width of [320,360,412]){const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent(fixture);assert.deepEqual(errors,[]);
 assert.equal(await page.locator('.trip-chip').count(),7);assert.equal(await page.getByText('현재 탕으로').count(),0);
 assert(await page.locator('.trip-chip-list').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'seven circular tabs fit');
 assert.equal(await page.locator('#ring .route-tick').count(),114);
 assert.equal(await page.locator('#ring .route-peer').count(),2);
 assert.equal(await page.locator('#ring .route-peer.rear').getAttribute('fill'),'white');
 const arrow=await page.locator('.route-arrow path').evaluate(n=>({width:n.getBBox().width,height:n.getBBox().height}));assert(arrow.width<3&&arrow.height<=4,'arrow fits a stop segment');
 const fill=await page.locator('#ring .route-fill').nth(25).getAttribute('stroke-dasharray');assert(Number(fill.split(' ')[0])>0&&Number(fill.split(' ')[0])<1,'partial arc follows movement between stops');
 const swipe=async(dx,dy)=>page.locator('.orbit-cockpit').evaluate((n,{dx,dy})=>{n.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',isPrimary:true,pointerId:1,clientX:200,clientY:200}));n.dispatchEvent(new PointerEvent('pointerup',{pointerType:'touch',isPrimary:true,pointerId:1,clientX:200+dx,clientY:200+dy}));},{dx,dy});
 await swipe(-90,5);assert.equal(await page.evaluate(()=>activeTripIndex),1);
 await swipe(5,90);assert.equal(await page.evaluate(()=>activeTripIndex),1,'vertical scrolling does not switch');
 await page.locator('.trip-chip').nth(2).click();assert.equal(await page.evaluate(()=>followCurrentTrip),true,'tap current trip resumes following');
 await swipe(90,0);assert.equal(await page.evaluate(()=>activeTripIndex),1);assert.equal(await page.evaluate(()=>followCurrentTrip),false);
 const colors=await page.evaluate(()=>[8,1,0,null].map(speed=>Bus70Cockpit.movement({timestamp:Date.now(),coords:{speed,accuracy:5}},Date.now(),false).key));assert.deepEqual(colors,['moving','slow','stopped','unknown']);
 await page.evaluate(()=>Bus70Cockpit.drawRing(document.getElementById('ring'),114,25,22.4,true,{color:'#7b8b9e',key:'unknown'}));assert.notEqual(await page.locator('.route-arrow').getAttribute('style'),'display: none;');
 if(process.env.CONTACT_LAYOUT_OUTPUT){fs.mkdirSync(process.env.CONTACT_LAYOUT_OUTPUT,{recursive:true});await page.screenshot({path:process.env.CONTACT_LAYOUT_OUTPUT+'/field-cockpit-'+width+'.png',fullPage:true});}
 await page.close();
 }console.log('Phone-sized circular trip tabs, swipe/tap current following, N-stop partial arcs, motion colors and held arrow passed');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
