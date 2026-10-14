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
    static String receiptKey(JSONObject alarm){return alarm.optString("key",String.valueOf(alarm.optInt("id")))+"@"+alarm.optLong("at");}
    static boolean future(JSONObject alarm,long now,JSONObject receipts){return alarm.optLong("at")>now&&!receipts.has(receiptKey(alarm));}
    static boolean due(JSONObject alarm,long now,JSONObject receipts){
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
            if(payload.optBoolean("electricVehicle",false)&&i<trips.length()-1){long end=moment(date,trip.optString("endTime",trip.getString("startTime")));add(result,"BREAK_CHARGE_"+no,end,"전기버스 휴식 충전 선택",no+"탕 운행을 마쳤습니다. 배터리 상태와 대기시간을 확인하여 필요한 경우 충전잭을 연결하십시오. 운행 중 휴식 충전은 기사 판단 사항입니다.",soundUri,payload);}
        }
        JSONObject finish=payload.optJSONObject("endOfShift");
        if(finish!=null){JSONObject last=trips.getJSONObject(trips.length()-1);long end=moment(date,last.optString("endTime",last.getString("startTime")));String endPlace=finish.optString("serviceEndPlace","테크노파크4차 정류장"),garage=finish.optString("deadheadDestination","고강동공영차고지");add(result,"END_OF_SHIFT",end,"막탕 영업운행 종료",endPlace+"에서 영업운행을 종료했습니다. "+garage+"로 회송한 뒤 차량 청소와 충전잭 연결을 반드시 완료하고 퇴근 처리하십시오. 다음 조 운행을 위해 막탕 후 충전은 필수입니다. 충전 상태는 사무실에서 확인합니다.",soundUri,payload);}
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
