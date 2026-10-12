const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sheets={},reads=[];
function sheet(name,rows=[]){return sheets[name]={rows,getName:()=>name,getLastRow(){return this.rows.length;},setFrozenRows(){},getDataRange(){reads.push(name);return {getDisplayValues:()=>this.rows.map(r=>r.slice())};},getRange(row,col,h,w){return {setValues:values=>values.forEach((r,i)=>{this.rows[row-1+i]||=[];r.forEach((v,j)=>this.rows[row-1+i][col-1+j]=v);}),setValue:value=>{this.rows[row-1]||=[];this.rows[row-1][col-1]=value;}};},appendRow(r){this.rows.push(r.slice());}};}
const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>sheet(n)},ctx=vm.createContext({console,Date,SpreadsheetApp:{getActiveSpreadsheet:()=>ss},normalizeDate_:v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v))?String(v):'',PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})}});
vm.runInContext(fs.readFileSync('apps-script/PrivateRouteStore.gs','utf8'),ctx);
const headers=Array.from(ctx.bus70RoutePartitionHeaders_('schedule'));
function row(date,route,seq,time,revision=0){const values={'시간표ID':`${date}-${route}-${seq}-${revision}`,'노선':route,'운행일':date,'시간표버전':'SYN-MONTH','운행구분':'평일','운행유형코드':'WEEKDAY','자료상태':'CONFIRMED','적용시작':date,'적용종료':date,'근무조':'B','순차':seq,'탕':1,'발차지':'합성기점','발차시간':time,'도착시간':'08:00','상태':'사용','개정번호':revision};return headers.map(h=>values[h]??'');}
const legacy=sheet('노선_5_배차스케줄DB',[headers,row('2099-01-10','5',1,'06:00'),row('2099-02-02','5',2,'07:00')]);
assert.equal(ctx.bus70RouteScheduleFromDb_('5','2099-01-10').trips[0].startTime,'06:00','legacy readable before migration');
const january=ctx.bus70RoutePartitionSheet_(ss,'5','schedule',true,'2099-01-10');
assert.equal(january.rows.length,2);assert.equal(legacy.rows.length,3,'legacy retained');
assert.equal(ctx.bus70RoutePartitionSheet_(ss,'5','schedule',true,'2099-01-10').rows.length,2,'idempotent');
sheet('노선_70_배차스케줄DB_2099_01',[headers,row('2099-01-10','70',1,'10:00')]);
reads.length=0;ctx.bus70RouteScheduleFromDb_('5','2099-01-10');assert.deepEqual(reads,['노선_5_배차스케줄DB_2099_01'],'one selected month only');
january.rows.push(row('2099-01-10','5',1,'06:10',1));assert.equal(ctx.bus70RouteScheduleFromDb_('5','2099-01-10').trips[0].startTime,'06:10','latest monthly revision');
assert.equal(ctx.bus70RouteScheduleFromDb_('70','2099-01-10').trips[0].startTime,'10:00','routes isolated');
assert.equal(ctx.bus70RouteScheduleFromDb_('5','2099-01-11').available,false,'never use another day as confirmed');
const february=ctx.bus70RoutePartitionSheet_(ss,'5','schedule',true,'2099-02-02');assert.equal(february.rows.length,2,'new month seeds only its rows');
const febRowsBefore=february.rows.length;
const sync=ctx.bus70SyncRouteReferenceToDb_(ss,'5',{ok:true,date:'2099-01-11',route:'5',scheduleVersion:'SYN-MONTH',trips:[{sequence:1,trip:1,startTime:'06:30',endTime:'08:00'}]});
assert.equal(sync.scheduleAdded,1);assert.equal(february.rows.length,febRowsBefore);assert.equal(legacy.rows.length,3,'new writes do not grow legacy');
reads.length=0;ctx.bus70RouteSchedulePatternFromDb_('5','2099-03-03');assert(reads.every(n=>n.endsWith('_2099_01')||n.endsWith('_2099_02')||n.endsWith('_2099_03')),'bounded three-month pattern window');
ctx.BUS70_PARTITION_READS_={};reads.length=0;ctx.bus70RouteScheduleFromDb_('5','2099-01-10');ctx.bus70RouteScheduleFromDb_('5','2099-01-10');assert.equal(reads.length,1,'one execution reuses its read');
ctx.bus70InvalidatePartition_(january);ctx.bus70RouteScheduleFromDb_('5','2099-01-10');assert.equal(reads.length,2,'writes invalidate read cache');
console.log('Monthly partition migration, idempotency, route/date isolation, revision, write routing, bounded pattern reads and cache invalidation passed');
