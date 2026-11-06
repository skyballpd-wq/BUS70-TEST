const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('apps-script/AuthStep9.gs','utf8');
const date='2099-01-10',now=Date.UTC(2099,0,10,1),header=['날짜','노선','기사ID','배차ID','차량ID','순차','탕','발차실제','도착실제'];
const rows=[header],snapshots={};
const record=(sequence,trip,start,end,more={})=>{const r={[header[0]]:date,노선:'5',기사ID:'SYN-D'+sequence,배차ID:'SYN-A'+sequence,차량ID:'SYN-V'+sequence,순차:sequence,탕:trip,발차실제:start,도착실제:end,...more};rows.push(header.map(k=>r[k]));};
const snapshot=(sequence,trip=1)=>snapshots[String(sequence)]={driverId:'SYN-D'+sequence,dispatchId:'SYN-A'+sequence,vehicleId:'SYN-V'+sequence,sequence,trip,route:'5',date,matchedStopOrder:sequence*2,recordedAtMs:now,recordedAt:new Date(now).toISOString(),accuracyM:5};
class Clock extends Date{static now(){return now;}}
const context={Date:Clock,SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getLastRow:()=>rows.length,getDataRange:()=>({getDisplayValues:()=>rows.map(r=>r.slice())})})})},makeHeaderMap_:h=>Object.fromEntries(h.map((k,i)=>[k,i])),normalizeDate_:v=>String(v||'').slice(0,10),bus70LiveLocationRoute_:String,bus70LiveLocationSnapshotMap_:()=>snapshots,BUS70_LIVE_LOCATION_FRESH_MS:180000,BUS70_LIVE_LOCATION_TTL_SECONDS:180,bus70LiveLocationDistance_:()=>0};
vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function bus70LiveLocationPublic_('),source.indexOf('function bus70DriverLiveLocationSave_(')),context);
const view=()=>context.bus70DriverLiveView_({route:'5',date,sequence:3},'SYN-D3');
for(let i=1;i<=5;i++)snapshot(i);
record(1,1,'2099-01-10 09:00:00','2099-01-10 10:00:00');
record(2,1,'2099-01-10 09:00:00','');record(3,1,'2099-01-10 09:01:00','');
record(4,1,'',''); // Timetable and fresh GPS alone must not imply departure.
assert.deepEqual(Array.from(view().positions,p=>p.running),[false,true,true,false,false]);
record(4,1,'2099-01-10 09:05:00','');assert(view().positions.find(p=>p.sequence===4).running);
record(2,1,'2099-01-10 09:00:00','2099-01-10 10:02:00');assert(!view().positions.find(p=>p.sequence===2).running,'completion removes front bus even if its cached GPS is fresh');
record(2,1,'2099-01-10 09:00:00','');assert(!view().positions.find(p=>p.sequence===2).running,'duplicate open record never reopens completion');
record(4,2,'2099-01-10 10:20:00','');assert(!view().positions.find(p=>p.sequence===4).running,'old snapshot cannot follow a new trip');snapshot(4,2);assert(view().positions.find(p=>p.sequence===4).running);
for(const more of [{날짜:'2099-01-09'},{노선:'23'},{배차ID:'OTHER'},{차량ID:'OTHER'},{기사ID:'OTHER'},{순차:99}])record(5,1,'2099-01-10 09:00:00','',more);
assert(!view().positions.find(p=>p.sequence===5).running,'route, day, assignment, vehicle and driver all match');
record(5,1,'2099-01-10','');assert(!view().positions.find(p=>p.sequence===5).running,'date-only legacy cell is not a departure time');
assert.equal(view().own.own,true);assert(!JSON.stringify(view()).includes('SYN-D'),'no driver identifiers exposed to peers');
snapshots['2'].recordedAtMs=now+1000;snapshots['1'].recordedAtMs=now-180001;assert.equal(view().positions.length,3,'future and stale snapshots excluded');
assert(rows.length>1);console.log('Authoritative run-state projection, departure, completion, duplicate/old trip, identity scope and stale GPS passed');
