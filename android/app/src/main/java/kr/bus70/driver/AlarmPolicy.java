package kr.bus70.driver;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Iterator;

final class AlarmPolicy {
    static final long MAX_DELAY_MS=90_000;
    private static final long RECEIPT_RETENTION_MS=7*24*60*60*1000L;

    static boolean started(JSONObject trip){
        return trip!=null&&(!trip.optString("actualStart").isEmpty()||!trip.optString("actualEnd").isEmpty());
    }
    static boolean completion(JSONObject alarm){return alarm.optString("type").startsWith("ACTUAL_END_")||alarm.optString("type").startsWith("ACTUAL_RETURN_");}
    static String receiptKey(JSONObject alarm){return alarm.optString("key",String.valueOf(alarm.optInt("id")))+(completion(alarm)?"":"@"+alarm.optLong("at"));}
    static boolean future(JSONObject alarm,long now,JSONObject receipts){return !completion(alarm)&&alarm.optLong("at")>now&&!receipts.has(receiptKey(alarm));}
    static boolean due(JSONObject alarm,long now,JSONObject receipts){
        if(alarm.optString("type").equals("END_OF_SHIFT")||alarm.optString("type").startsWith("BREAK_CHARGE_"))return false;
        long at=alarm.optLong("at");return at>0&&now>=at&&now-at<=MAX_DELAY_MS&&!receipts.has(receiptKey(alarm));
    }
    static boolean contains(JSONArray alarms,JSONObject candidate){
        for(int i=0;i<alarms.length();i++)if(receiptKey(alarms.optJSONObject(i)).equals(receiptKey(candidate)))return true;
        return false;
    }
    static boolean obsolete(JSONObject alarm,JSONObject schedule){
        if(!alarm.optString("driverId").equals(schedule.optString("driverId"))||!alarm.optString("dispatchId").equals(schedule.optString("dispatchId"))||!alarm.optString("date").equals(schedule.optString("date")))return false;
        String type=alarm.optString("type");
        if(!(type.startsWith("COMMUTE")||type.startsWith("TRIP_")||type.startsWith("EXACT_")))return false;
        JSONArray trips=TripOrder.actual(schedule.optJSONArray("trips"));
        for(int i=0;i<trips.length();i++){JSONObject trip=trips.optJSONObject(i);if((type.startsWith("COMMUTE")&&i==0)||trip.optInt("trip")==alarm.optInt("trip"))return started(trip);}
        return false;
    }
    static JSONObject received(JSONObject receipts,JSONObject alarm,long now)throws Exception{
        JSONObject result=new JSONObject();Iterator<String> keys=receipts.keys();
        while(keys.hasNext()){String key=keys.next();if(receipts.optLong(key)>=now-RECEIPT_RETENTION_MS)result.put(key,receipts.optLong(key));}
        result.put(receiptKey(alarm),now);return result;
    }
    static JSONArray build(JSONObject payload,String soundUri) throws Exception {
        JSONArray result=new JSONArray(), trips=TripOrder.actual(payload.optJSONArray("trips"));
        if(trips==null||trips.length()==0||!payload.optBoolean("enabled",true))return result;
        String date=payload.getString("date"), sequence=String.valueOf(payload.optInt("sequence")), route=payload.optString("route","70");
        JSONArray commute=payload.optJSONArray("commuteMinutes"), tripMinutes=payload.optJSONArray("tripMinutes");
        long first=moment(date,trips.getJSONObject(0).getString("startTime"));
        if(!AlarmPolicy.started(trips.getJSONObject(0)))addOffsets(result,"COMMUTE",first,commute,route+"번 출근 준비",sequence+"순차 운행 준비 시간입니다.",soundUri,payload);
        for(int i=0;i<trips.length();i++){
            JSONObject trip=trips.getJSONObject(i);int no=trip.getInt("trip");long start=moment(date,trip.getString("startTime"));
            String preparation=sequence+"순차 "+no+"탕 출발 준비 시간입니다. 출발 예정 "+trip.getString("startTime")+"."+(payload.optBoolean("electricVehicle",false)&&i>0?" 휴식 충전을 했다면 충전잭 분리와 출발 준비를 확인하십시오.":"");
            if(!AlarmPolicy.started(trip))addOffsets(result,"TRIP_"+no,start,tripMinutes,route+"번 "+no+"탕 준비",preparation,soundUri,payload);
            if(!AlarmPolicy.started(trip)&&payload.optBoolean("exact",true))add(result,"EXACT_"+no,start,route+"번 "+no+"탕 출발",sequence+"순차 "+no+"탕 출발 예정 시각입니다.",soundUri,payload);
            long actualEnd=TripOrder.observedMoment(date,trip.optString("actualEnd"));
            boolean last=i==trips.length()-1,returning=!trip.optString("deadheadDestination").isEmpty()&&!trip.optString("deadheadDestination").equals(trip.optString("endPlace"));
            if(actualEnd>0&&trip.optString("deadheadReturnedAt").isEmpty()&&(last||payload.optBoolean("electricVehicle",false))){
                String clock=java.time.Instant.ofEpochMilli(actualEnd).atZone(java.time.ZoneId.of("Asia/Seoul")).format(java.time.format.DateTimeFormatter.ofPattern("H시 m분"));
                String message=clock+", "+no+"탕 "+(last?"영업운행":"운행")+" 종료가 기록되었습니다. ";
                if(last)message+=returning?trip.optString("deadheadDestination")+"로 복귀한 뒤 차량 점검과 퇴근 절차를 확인해 주세요.":"차량 점검과 퇴근 절차를 확인해 주세요.";
                if(payload.optBoolean("electricVehicle",false))message+=last?" 차고지 복귀 후 충전 상태를 확인해 주세요.":"배터리 상태와 다음 탕까지의 시간을 확인해 주세요.";
                add(result,"ACTUAL_END_"+no,actualEnd,last?"막탕 실제 영업 종료":"실제 운행 종료",message,soundUri,payload);
            }
            long returned=TripOrder.observedMoment(date,trip.optString("deadheadReturnedAt"));
            if(last&&actualEnd>0&&returning&&returned>=actualEnd)add(result,"ACTUAL_RETURN_"+no,returned,"차고지 실제 복귀","차고지 복귀가 기록되었습니다. 차량 점검과 퇴근 절차를 확인해 주세요.",soundUri,payload);
        }
        return result;
    }

    private static void addOffsets(JSONArray out,String type,long target,JSONArray offsets,String title,String base,String sound,JSONObject payload)throws Exception{
        if(offsets==null)return;for(int i=0;i<offsets.length();i++){int min=offsets.getInt(i);add(out,type+"_"+min,target-min*60000L,title,min+"분 후 "+base,sound,payload);}
    }

    private static void add(JSONArray out,String type,long at,String title,String message,String sound,JSONObject payload)throws Exception{
        String key=payload.optString("driverId")+"|"+payload.optString("dispatchId")+"|"+payload.optString("date")+"|"+type;
        int trip=0;String[] parts=type.split("_");if(parts.length>1)try{trip=Integer.parseInt(parts[1]);}catch(NumberFormatException ignored){}
        out.put(new JSONObject().put("key",key).put("type",type).put("trip",trip).put("driverId",payload.optString("driverId")).put("dispatchId",payload.optString("dispatchId")).put("date",payload.optString("date")).put("id",key.hashCode()&0x7fffffff).put("at",at).put("title",title).put("message",message).put("soundUri",sound).put("voice",payload.optBoolean("voice",true)).put("vibration",payload.optBoolean("vibration",true)));
    }

    private static long moment(String serviceDate,String clock){return TripOrder.moment(serviceDate,clock);}
}
