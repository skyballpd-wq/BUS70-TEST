package kr.bus70.driver;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

final class AlarmScheduler {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    static JSONObject sync(Context context, JSONObject payload) throws Exception {
        NativeStore store = new NativeStore(context);
        cancelAll(context, new JSONArray(store.alarms()));
        JSONArray alarms = build(payload, store.soundUri());
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        boolean exactAllowed = Build.VERSION.SDK_INT < 31 || manager.canScheduleExactAlarms();
        long now = System.currentTimeMillis();
        for (int i=0; i<alarms.length(); i++) {
            JSONObject item=alarms.getJSONObject(i);
            if(item.getLong("at")<=now)continue;
            PendingIntent pending=pendingIntent(context,item,PendingIntent.FLAG_UPDATE_CURRENT);
            if(exactAllowed) manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,item.getLong("at"),pending);
        }
        store.schedule(payload.toString()); store.alarms(alarms.toString());
        return new JSONObject().put("ok",true).put("alarmCount",alarms.length()).put("exactAllowed",exactAllowed);
    }

    static void restore(Context context) {
        try { String raw=new NativeStore(context).schedule(); if(!raw.isEmpty())sync(context,new JSONObject(raw)); }
        catch(Exception ignored) {}
    }

    static JSONObject scheduleTest(Context context, int delaySeconds, boolean voice, boolean vibration) throws Exception {
        int safeDelay=Math.max(30,Math.min(delaySeconds,600));
        JSONObject payload=new JSONObject().put("dispatchId","SCREEN-OFF-TEST").put("date",LocalDate.now(SEOUL).toString()).put("route","TEST").put("voice",voice).put("vibration",vibration);
        JSONObject item=new JSONObject().put("id",("SCREEN-OFF-TEST|"+System.currentTimeMillis()).hashCode()&0x7fffffff).put("at",System.currentTimeMillis()+safeDelay*1000L).put("title","운행 알림 화면 꺼짐 시험").put("message","화면이 꺼진 상태에서도 알람음과 한국어 음성 안내가 정상 작동했습니다.").put("soundUri",new NativeStore(context).soundUri()).put("voice",voice).put("vibration",vibration);
        AlarmManager manager=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        boolean exactAllowed=Build.VERSION.SDK_INT<31||manager.canScheduleExactAlarms();
        if(!exactAllowed)return new JSONObject().put("ok",false).put("message","정확한 알람 권한을 먼저 허용하세요.");
        manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,item.getLong("at"),pendingIntent(context,item,PendingIntent.FLAG_UPDATE_CURRENT));
        return new JSONObject().put("ok",true).put("testAt",item.getLong("at")).put("message",safeDelay+"초 후 시험 알람을 예약했습니다. 앱을 닫고 화면을 잠그세요.");
    }

    static JSONObject status(Context context) throws Exception {
        JSONArray alarms=new JSONArray(new NativeStore(context).alarms());long now=System.currentTimeMillis();int future=0;
        for(int i=0;i<alarms.length();i++)if(alarms.getJSONObject(i).optLong("at",0)>now)future++;
        AlarmManager manager=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);boolean exactAllowed=Build.VERSION.SDK_INT<31||manager.canScheduleExactAlarms();
        return new JSONObject().put("ok",true).put("futureCount",future).put("exactAllowed",exactAllowed).put("message","운행 스케줄 미래 알람 "+future+"개 · 정확한 알람 권한 "+(exactAllowed?"허용":"미허용"));
    }

    private static JSONArray build(JSONObject payload,String soundUri) throws Exception {
        JSONArray result=new JSONArray(), trips=payload.optJSONArray("trips");
        if(trips==null||trips.length()==0||!payload.optBoolean("enabled",true))return result;
        String date=payload.getString("date"), sequence=String.valueOf(payload.optInt("sequence")), route=payload.optString("route","70");
        JSONArray commute=payload.optJSONArray("commuteMinutes"), tripMinutes=payload.optJSONArray("tripMinutes");
        long first=moment(date,trips.getJSONObject(0).getString("startTime"));
        addOffsets(result,"COMMUTE",first,commute,route+"번 출근 준비",sequence+"순차 운행 준비 시간입니다.",soundUri,payload);
        for(int i=0;i<trips.length();i++){
            JSONObject trip=trips.getJSONObject(i);int no=trip.getInt("trip");long start=moment(date,trip.getString("startTime"));
            String preparation=sequence+"순차 "+no+"탕 출발 준비 시간입니다. 출발 예정 "+trip.getString("startTime")+"."+(payload.optBoolean("electricVehicle",false)&&i>0?" 휴식 충전을 했다면 충전잭 분리와 출발 준비를 확인하십시오.":"");
            addOffsets(result,"TRIP_"+no,start,tripMinutes,route+"번 "+no+"탕 준비",preparation,soundUri,payload);
            if(payload.optBoolean("exact",true))add(result,"EXACT_"+no,start,route+"번 "+no+"탕 출발",sequence+"순차 "+no+"탕 출발 예정 시각입니다.",soundUri,payload);
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
        String key=payload.optString("dispatchId")+"|"+payload.optString("date")+"|"+type;
        out.put(new JSONObject().put("id",key.hashCode()&0x7fffffff).put("at",at).put("title",title).put("message",message).put("soundUri",sound).put("voice",payload.optBoolean("voice",true)).put("vibration",payload.optBoolean("vibration",true)));
    }

    private static long moment(String serviceDate,String clock){
        LocalDate date=LocalDate.parse(serviceDate);LocalTime time=LocalTime.parse(clock);
        if(time.isBefore(LocalTime.of(3,30)))date=date.plusDays(1);
        return ZonedDateTime.of(date,time,SEOUL).toInstant().toEpochMilli();
    }

    private static PendingIntent pendingIntent(Context context,JSONObject item,int flags)throws Exception{
        Intent intent=new Intent(context,AlarmReceiver.class).putExtra("alarm",item.toString());
        return PendingIntent.getBroadcast(context,item.getInt("id"),intent,flags|PendingIntent.FLAG_IMMUTABLE);
    }

    private static void cancelAll(Context context,JSONArray alarms)throws Exception{
        AlarmManager manager=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        for(int i=0;i<alarms.length();i++){PendingIntent pending=pendingIntent(context,alarms.getJSONObject(i),PendingIntent.FLAG_NO_CREATE);if(pending!=null)manager.cancel(pending);}
    }
}
