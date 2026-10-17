const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const head=['계획ID','노선','근무조','기사ID','기사명','별칭','유형','적용일','상태','원본근거','처리자','확정시간','수정시간','시작일','종료일'];
const leaves=[head];
function plan(id,start,end,status='확정',type='휴무',driver='SYN-1') {return [id,'5','B',driver,'가상기사','',type,start,status,'SYNTHETIC','','','',start,end];}
leaves.push(plan('single','2099-01-10','2099-01-10'),plan('range','2099-01-20','2099-01-22','승인','신청휴가'),plan('pending','2099-01-12','2099-01-12','신청'),plan('cancel','2099-01-14','2099-01-14'),plan('cancel','2099-01-14','2099-01-14','취소'),plan('other','2099-01-16','2099-01-16','확정','휴무','SYN-2'),plan('border1','2098-12-31','2098-12-31'),plan('border2','2099-01-01','2099-01-01'),plan('gap','2099-01-03','2099-01-03'));
const changes=[['changeId','날짜','기사ID','유형','처리자','처리시간','상태','시작일','종료일'],['approved-change','2099-01-24','SYN-1','휴무','SYN-MANAGER','2099-01-01 12:00:00','','2099-01-24','2099-01-26'],['unapproved-change','2099-01-28','SYN-1','휴무','SYN-MANAGER','2099-01-01 12:00:00','대기','','']];
const tables={'기사휴무계획DB':leaves,'근무변경DB':changes};
const c=vm.createContext({console,Date,normalizeDate_:v=>String(v||'').slice(0,10),makeHeaderMap_:h=>Object.fromEntries(h.map((v,i)=>[v,i])),SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>tables[n]?{getLastRow:()=>tables[n].length,getDataRange:()=>({getDisplayValues:()=>tables[n]})}:null})},bus70OperatingShiftForDate_:day=>Number(day.slice(-2))%2?'A':'B'});
vm.runInContext(fs.readFileSync('apps-script/AuthStep9.gs','utf8'),c);
const driver={driverId:'SYN-1',name:'가상기사',route:'5',shift:'B'},lookup=date=>c.bus70DriverLeaveContext_(driver,date);
let r=lookup('2099-01-10');assert.equal(r.groupStatus,'WORK');assert.equal(r.personalLeave.kind,'DESIGNATED');assert.equal(r.personalLeave.startDate,r.personalLeave.endDate);assert.equal(r.month.groupRestDates.length,16);
assert.equal(lookup('2099-01-11').groupStatus,'REST');
for(const date of ['2099-01-12','2099-01-14','2099-01-16','2099-01-28'])assert.equal(lookup(date).personalLeave,null,date+' is not approved personal leave');
r=lookup('2099-01-21');assert.equal(r.personalLeave.kind,'APPROVED_REQUEST');assert.equal(r.personalLeave.startDate,'2099-01-20');assert.equal(r.personalLeave.endDate,'2099-01-22');
r=lookup('2099-01-01');assert.equal(r.personalLeave.startDate,'2098-12-31');assert.equal(r.personalLeave.endDate,'2099-01-01');assert.equal(lookup('2099-01-02').personalLeave,null,'group off/gaps do not merge personal leave');
assert.equal(lookup('2099-01-25').personalLeave.endDate,'2099-01-26');
assert.equal(JSON.stringify(r).includes('SYN-MANAGER'),false,'no private handler or roster in driver response');
// A confirmed service-day exception takes precedence over the repeating anchor.
tables['운행일DB']=[['운행일','노선','근무조','배차상태'],['2099-01-11','5','B','확정']];assert.equal(lookup('2099-01-11').groupStatus,'WORK');
// Verify the actual secure schedule path, not just leave formatting.
Object.assign(c,{apiGetDriver_:()=>({driver}),apiMySchedule_:()=>({ok:true,type:'NO_DISPATCH'}),bus70DriverContextForDate_:v=>v,bus70ConfirmedAssignedRoute_:()=>'',bus70ConfirmedRouteScheduleForDriver_:()=>null,bus70ReferenceScheduleForDriver_:()=>null,bus70ScheduleWithAdjustments_:v=>v,bus70EnrichDriverSchedule_:v=>v,bus70ScheduleTemporalState_:()=> 'CURRENT'});
r=c.bus70SecureScheduleForDriver_('SYN-1','2099-01-10');assert.equal(r.type,'REST');assert.equal(r.leaveContext.personalLeave.kind,'DESIGNATED');
r=c.bus70SecureScheduleForDriver_('SYN-1','2099-01-12');assert.equal(r.type,'NO_DISPATCH');assert.equal(r.leaveContext.personalLeave,null);
c.bus70ConfirmedRouteScheduleForDriver_=()=>({ok:true,type:'WORK',dispatch:{seq:1},vehicle:{},trips:[{sequence:1,trip:1}]});c.bus70PrivateTripsForSequence_=v=>v;
r=c.bus70SecureScheduleForDriver_('SYN-1','2099-01-10');assert.equal(r.type,'WORK');assert.equal(r.leaveContext.dispatchConflict,true,'confirmed assignment is preserved for manager conflict review');
console.log('Driver leave: confirmed designation, approved range, pending/cancelled, identity, month boundary, group exception and dispatch conflict passed');
