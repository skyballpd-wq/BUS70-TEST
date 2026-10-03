/* Route 5 B-shift reference schedules transcribed from the 2026-10-02 and
 * 2026-10-04 dispatch-board/timetable photographs supplied by the operator.
 *
 * The timetable and the observed board are deliberately kept separate: on
 * 2026-10-04 the holiday timetable has 18 sequence rows while 15 assignments
 * were visible on the photographed board. Missing assignments are never
 * invented. Times use the service-day clock (03:30 through next-day 02:29).
 */

const BUS70_ROUTE5_REFERENCE_ = {
  '2026-10-02': {
    serviceType:'평일', scheduleVersion:'R5-WD-20260810', timetableSequences:27,
    sourceNote:'2026-10-02 5번 27대 평일시간표 및 B조 상황판 사진 판독',
    assignments:[
      [1,'이한욱','1663'],[2,'이정우','1664'],[3,'조영선','1665'],[4,'황대웅','1666'],[5,'박현우','1667'],[6,'윤솔뫼','1668'],[7,'천명서','1669'],[8,'윤재현','1670'],[9,'박복만','1671'],[10,'심현국','1672'],[11,'오금철','1673'],[12,'김영욱','1674'],[13,'이춘열','1145'],
      [14,'이병익','1117'],[15,'한청규','1121'],[16,'김동영','1148'],[17,'김현섭','1438'],[18,'박주신','1556'],[19,'박철완','1653'],[20,'김종근','1654'],[21,'김대연','1655'],[22,'김경이','1656'],[23,'정문식','1658'],[24,'조종진','1659'],[25,'김성훈','1660'],[26,'최관복','1661'],[27,'변상수','1662']
    ],
    departures:[
      ['05:00','07:05','10:30','13:38','16:40','20:07'],['','07:10','10:37','13:45','16:46','20:14','23:00'],['05:15','07:15','10:44','13:52','16:52','20:21'],['','07:20','10:51','13:59','16:59','20:28','23:10'],['05:30','07:26','10:58','14:06','17:06','20:35'],
      ['04:40','07:32','11:05','14:13','17:13','20:42'],['04:50','07:38','11:12','14:20','17:20','20:49'],['04:58','07:44','11:19','14:27','17:27','20:56'],['05:06','07:52','11:26','14:34','17:34','21:03'],['05:14','08:00','11:33','14:41','17:41','21:10'],
      ['05:22','08:09','11:40','14:48','17:48','21:16'],['05:30','08:18','11:47','14:55','17:56','21:22'],['05:38','08:27','11:54','15:02','18:04','21:28'],['05:46','08:36','12:01','15:09','18:12','21:34'],['05:53','08:45','12:08','15:16','18:20','21:40'],
      ['06:00','08:54','12:15','15:23','18:29','21:46'],['06:07','09:03','12:21','15:30','18:38','21:52'],['06:14','09:12','12:28','15:37','18:47','21:58'],['06:20','09:21','12:35','15:44','18:56','22:04'],['06:25','09:30','12:42','15:51','19:05','22:10'],
      ['06:30','09:38','12:49','15:58','19:14','22:16'],['06:35','09:46','12:56','16:04','19:22','22:22'],['06:40','09:54','13:03','16:10','19:30','22:28'],['06:45','10:02','13:10','16:16','19:38'],['06:50','10:09','13:17','16:22','19:46'],['06:55','10:16','13:24','16:28','19:53','22:40'],['07:00','10:23','13:31','16:34','20:00','22:50']
    ]
  },
  '2026-10-04': {
    serviceType:'휴일·공휴일', scheduleVersion:'R5-HD-20251018', timetableSequences:18,
    sourceNote:'2026-10-04 5번 18대 휴·공휴일 시간표 및 B조 상황판 사진 판독',
    assignments:[
      [1,'최관복','1661'],[2,'박주신','1556'],[3,'이한욱','1663'],[4,'이정우','1664'],[5,'조영선','1665'],[6,'황대웅','1666'],[7,'박현우','1667'],[8,'김종근','1654'],[9,'김대연','1655'],[10,'김경이','1656'],[11,'정문식','1658'],[12,'심현국','1672'],[13,'김성훈','1660'],[14,'박구봉','1674'],[15,'박철완','1671']
    ],
    departures:[
      ['05:00','07:00','10:18','13:30','16:52','20:10'],['','07:10','10:30','13:40','17:04','20:20','23:04'],['05:15','07:20','10:42','13:50','17:15','20:30'],['','07:30','10:54','14:00','17:26','20:40','23:10'],['05:30','07:40','11:05','14:11','17:37','20:50'],
      ['04:40','07:50','11:16','14:22','17:48','21:00'],['04:52','08:00','11:27','14:33','17:59','21:11'],['05:04','08:10','11:38','14:44','18:10','21:22'],['05:16','08:20','11:49','14:55','18:21','21:33'],['05:28','08:30','12:00','15:06','18:32','21:44'],
      ['05:39','08:42','12:10','15:17','18:43','21:55'],['05:50','08:54','12:20','15:28','18:54','22:06'],['06:00','09:06','12:30','15:40','19:05','22:17'],['06:10','09:18','12:40','15:52','19:16','22:28'],['06:20','09:30','12:50','16:04','19:27','22:35'],
      ['06:30','09:42','13:00','16:16','19:38','22:42'],['06:40','09:54','13:10','16:28','19:49','22:49'],['06:50','10:06','13:20','16:40','20:00','22:56']
    ],
    serviceExceptions:{15:{6:{serviceEndType:'UPBOUND_ONLY',serviceEndPlace:'테크노파크4차 정류장',deadheadDestination:'고강동공영차고지',postShift:['차량 청소','충전잭 연결','사무실 모니터 충전상태 확인']}}}
  }
};

function bus70Route5OperationalMinutes_(value) {
  const match=String(value||'').match(/^(\d{2}):(\d{2})$/);if(!match)return null;
  let minutes=Number(match[1])*60+Number(match[2]);if(minutes<210)minutes+=1440;return minutes;
}

function bus70Route5ReferenceData_(rawDate) {
  const date=normalizeDate_(rawDate), source=BUS70_ROUTE5_REFERENCE_[date];
  if(!source)return {ok:false,error:'REFERENCE_NOT_FOUND',message:'선택 날짜의 5번 노선 기준 자료가 없습니다.'};
  const assignments=source.assignments.map(function(row){return {sequence:row[0],driverName:row[1],vehicleNo:row[2],vehicleId:'VEH-'+row[2]};});
  const trips=[];
  source.departures.forEach(function(row,index){
    row.forEach(function(time,tripIndex){if(time)trips.push({sequence:index+1,trip:tripIndex+1,startTime:time});});
  });
  trips.forEach(function(item){
    const sameTrip=trips.filter(function(v){return v.trip===item.trip;}).sort(function(a,b){return bus70Route5OperationalMinutes_(a.startTime)-bus70Route5OperationalMinutes_(b.startTime);});
    const position=sameTrip.indexOf(item),front=position>0?sameTrip[position-1]:null,rear=position<sameTrip.length-1?sameTrip[position+1]:null,own=bus70Route5OperationalMinutes_(item.startTime);
    item.plannedFrontGapMinutes=front?own-bus70Route5OperationalMinutes_(front.startTime):null;
    item.plannedRearGapMinutes=rear?bus70Route5OperationalMinutes_(rear.startTime)-own:null;
    item.frontSequence=front?front.sequence:null;item.rearSequence=rear?rear.sequence:null;
    const exception=source.serviceExceptions&&source.serviceExceptions[item.sequence]&&source.serviceExceptions[item.sequence][item.trip];
    if(exception)Object.keys(exception).forEach(function(key){item[key]=exception[key];});
  });
  return {ok:true,route:'5',date:date,shift:'B',serviceType:source.serviceType,scheduleVersion:source.scheduleVersion,timetableSequences:source.timetableSequences,observedAssignments:assignments.length,assignments:assignments,trips:trips,sourceNote:source.sourceNote,verificationStatus:'사진 판독 1차 데이터'};
}

function bus70Route5ScheduleForDriver_(driver, rawDate) {
  const reference=bus70Route5ReferenceData_(rawDate);if(!reference.ok)return null;
  const name=String(driver&&driver.name||driver&&driver.driverName||'').replace(/\s/g,''), assignment=reference.assignments.find(function(v){return v.driverName.replace(/\s/g,'')===name;});
  if(!assignment)return null;
  return {ok:true,type:'WORK',route:'5',date:reference.date,driverId:String(driver&&driver.driverId||''),dispatch:{id:'R5-'+reference.date.replace(/-/g,'')+'-B-'+('0'+assignment.sequence).slice(-2),date:reference.date,shift:'B',seq:assignment.sequence,sequence:assignment.sequence,vehicleId:assignment.vehicleId,vehicleNo:assignment.vehicleNo,scheduleVersion:reference.scheduleVersion,status:'확정',reference:true},scheduleVersion:reference.scheduleVersion,trips:reference.trips.filter(function(v){return v.sequence===assignment.sequence;}),sourceNote:reference.sourceNote,verificationStatus:reference.verificationStatus};
}
