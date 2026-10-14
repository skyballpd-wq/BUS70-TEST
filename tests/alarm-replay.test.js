const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function extract(name){const a=html.indexOf('function '+name+'('),b=html.indexOf('{',a);let depth=0;for(let i=b;i<html.length;i++){if(html[i]==='{')depth++;if(html[i]==='}'&&!--depth)return html.slice(a,i+1);}throw Error(name);}
let now=Date.parse('2099-01-10T12:09:00Z'),cancel=0,native=0;const timers=[],fired=[];
class Clock extends Date{static now(){return now;}}
const data={ok:true,type:'WORK',date:{value:'2099-01-10'},dispatch:{seq:1},route:'5',trips:[{trip:6,startTime:'21:10'},{trip:7,startTime:'23:00'}]};
const c=vm.createContext({Date:Clock,alarmTimers:[],lastSchedule:data,driverAlertSettings:{enabled:true,commuteMinutes:[],tripMinutes:[],exact:true},currentRoute:'5',
 document:{getElementById:()=>({value:'2099-01-10',replaceChildren(){}})},window:{Bus70Android:{cancelDriverAlarms:()=>cancel++}},
 clearDriverAlarms(){c.alarmTimers=[];},hasAndroidBridge:()=>false,syncNativeSchedule:()=>false,
 normalizeScheduleTrips:x=>x,prepareDriverLocationPoints(){},runLogForTrip:(d,t)=>t.log||{},normalizedRoute:x=>x,el(){},
 setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},fireDriverAlert:(...args)=>fired.push(args)
});
vm.runInContext(extract('scheduleMoment')+'\n'+extract('armDriverAlarms'),c);
c.armDriverAlarms();assert.equal(timers.length,2);
// The browser may queue callbacks until the screen wakes. Drop stale alerts.
now=Date.parse('2099-01-10T13:42:00Z');timers[0].fn();assert.equal(fired.length,0);
now=Date.parse('2099-01-10T14:00:01Z');timers[1].fn();assert.equal(fired.length,1);
// Disabling must reach native cancellation even without a loaded schedule.
c.hasAndroidBridge=()=>true;c.lastSchedule=null;c.driverAlertSettings.enabled=false;c.armDriverAlarms();assert.equal(cancel,1);
c.driverAlertSettings.enabled=true;c.lastSchedule=data;c.syncNativeSchedule=()=>{native++;return true;};c.armDriverAlarms();assert.equal(native,1);
// Actual departure suppresses a future planned reminder as well.
c.hasAndroidBridge=()=>false;c.syncNativeSchedule=()=>false;timers.length=0;now=Date.parse('2099-01-10T12:09:00Z');data.trips[0].log={actualStart:'21:09'};c.armDriverAlarms();assert.equal(timers.length,1);
data.trips[1].log={actualStart:'22:59'};now=Date.parse('2099-01-10T14:00:00Z');timers[0].fn();assert.equal(fired.length,1,'a trip started after scheduling must not ring');
const calendar=fs.readFileSync('android/app/src/main/java/kr/bus70/driver/CalendarSync.java','utf8');
assert.doesNotMatch(calendar,/resolver\.insert\(CalendarContract\.Reminders/);
assert.doesNotMatch(calendar,/HAS_ALARM,1/);
console.log('Expired web callbacks, native opt-out cancellation, departed trips and single-source calendar reminders passed');
