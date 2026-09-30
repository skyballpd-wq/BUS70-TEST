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

    private static JSONArray build(JSONObject payload,String soundUri) throws Exception {
        JSONArray result=new JSONArray(), trips=payload.optJSONArray("trips");
        if(trips==null||trips.length()==0||!payload.optBoolean("enabled",true))return result;
        String date=payload.getString("date"), sequence=String.valueOf(payload.optInt("sequence"));
        JSONArray commute=payload.optJSONArray("commuteMinutes"), tripMinutes=payload.optJSONArray("tripMinutes");
        long first=moment(date,trips.getJSONObject(0).getString("startTime"));
        addOffsets(result,"COMMUTE",first,commute,"BUS70 출근 준비",sequence+"순차 운행 준비 시간입니다.",soundUri,payload);
        for(int i=0;i<trips.length();i++){
            JSONObject trip=trips.getJSONObject(i);int no=trip.getInt("trip");long start=moment(date,trip.getString("startTime"));
            addOffsets(result,"TRIP_"+no,start,tripMinutes,"BUS70 "+no+"탕 준비",sequence+"순차 "+no+"탕 출발 준비 시간입니다. 출발 예정 "+trip.getString("startTime")+".",soundUri,payload);
            if(payload.optBoolean("exact",true))add(result,"EXACT_"+no,start,"BUS70 "+no+"탕 출발",sequence+"순차 "+no+"탕 출발 예정 시각입니다.",soundUri,payload);
        }
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
