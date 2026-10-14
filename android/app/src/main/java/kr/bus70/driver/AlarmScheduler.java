package kr.bus70.driver;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

final class AlarmScheduler {

    static synchronized JSONObject sync(Context context, JSONObject payload) throws Exception {
        NativeStore store = new NativeStore(context);
        cancelAll(context, new JSONArray(store.alarms()));
        JSONArray alarms = AlarmPolicy.build(payload, store.soundUri());
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        boolean exactAllowed = Build.VERSION.SDK_INT < 31 || manager.canScheduleExactAlarms();
        long now = System.currentTimeMillis();
        JSONObject receipts=new JSONObject(store.alarmReceipts());JSONArray scheduled=new JSONArray();
        for (int i=0; i<alarms.length(); i++) {
            JSONObject item=alarms.getJSONObject(i);
            if(!AlarmPolicy.future(item,now,receipts))continue;
            PendingIntent pending=pendingIntent(context,item,PendingIntent.FLAG_UPDATE_CURRENT);
            if(exactAllowed){manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,item.getLong("at"),pending);scheduled.put(item);}
        }
        store.schedule(payload.toString()); store.alarms(scheduled.toString());
        return new JSONObject().put("ok",true).put("alarmCount",scheduled.length()).put("exactAllowed",exactAllowed);
    }

    static synchronized void cancel(Context context) throws Exception {
        NativeStore store=new NativeStore(context);
        cancelAll(context,new JSONArray(store.alarms()));store.alarms("[]");
        JSONObject test=new JSONObject(store.testAlarm());
        if(test.has("id"))cancelAll(context,new JSONArray().put(test));store.testAlarm("{}");
        if(!store.schedule().isEmpty()){JSONObject payload=new JSONObject(store.schedule());payload.put("enabled",false);store.schedule(payload.toString());}
        context.stopService(new Intent(context,AlarmPlaybackService.class));
    }

    static synchronized boolean claim(Context context,JSONObject item) throws Exception {
        NativeStore store=new NativeStore(context);long now=System.currentTimeMillis();
        JSONObject receipts=new JSONObject(store.alarmReceipts());
        if(!AlarmPolicy.due(item,now,receipts))return false;
        if(item.optBoolean("test")){
            if(!AlarmPolicy.receiptKey(new JSONObject(store.testAlarm())).equals(AlarmPolicy.receiptKey(item)))return false;
        }else{
            if(!AlarmPolicy.contains(new JSONArray(store.alarms()),item))return false;
            JSONObject latest=new JSONObject(store.trackingSchedule().isEmpty()?"{}":store.trackingSchedule());
            if(AlarmPolicy.obsolete(item,latest))return false;
        }
        // Save before playback so dismissal, refresh, or process restart cannot
        // replay an already delivered reminder.
        return store.alarmReceipts(AlarmPolicy.received(receipts,item,now).toString());
    }

    static void restore(Context context) {
        try { String raw=new NativeStore(context).schedule(); if(!raw.isEmpty())sync(context,new JSONObject(raw)); }
        catch(Exception ignored) {}
    }

    static JSONObject scheduleTest(Context context, int delaySeconds, boolean voice, boolean vibration) throws Exception {
        int safeDelay=Math.max(30,Math.min(delaySeconds,600));
        JSONObject item=new JSONObject().put("test",true).put("id",("SCREEN-OFF-TEST|"+System.currentTimeMillis()).hashCode()&0x7fffffff).put("at",System.currentTimeMillis()+safeDelay*1000L).put("title","운행 알림 화면 꺼짐 시험").put("message","화면이 꺼진 상태에서도 알람음과 한국어 음성 안내가 정상 작동했습니다.").put("soundUri",new NativeStore(context).soundUri()).put("voice",voice).put("vibration",vibration);
        AlarmManager manager=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        boolean exactAllowed=Build.VERSION.SDK_INT<31||manager.canScheduleExactAlarms();
        if(!exactAllowed)return new JSONObject().put("ok",false).put("message","정확한 알람 권한을 먼저 허용하세요.");
        NativeStore store=new NativeStore(context);JSONObject old=new JSONObject(store.testAlarm());
        if(old.has("id"))cancelAll(context,new JSONArray().put(old));
        store.testAlarm(item.toString());
        manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,item.getLong("at"),pendingIntent(context,item,PendingIntent.FLAG_UPDATE_CURRENT));
        return new JSONObject().put("ok",true).put("testAt",item.getLong("at")).put("message",safeDelay+"초 후 시험 알람을 예약했습니다. 앱을 닫고 화면을 잠그세요.");
    }

    static JSONObject status(Context context) throws Exception {
        JSONArray alarms=new JSONArray(new NativeStore(context).alarms());long now=System.currentTimeMillis();int future=0;
        for(int i=0;i<alarms.length();i++)if(alarms.getJSONObject(i).optLong("at",0)>now)future++;
        AlarmManager manager=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);boolean exactAllowed=Build.VERSION.SDK_INT<31||manager.canScheduleExactAlarms();
        return new JSONObject().put("ok",true).put("futureCount",future).put("exactAllowed",exactAllowed).put("message","운행 스케줄 미래 알람 "+future+"개 · 정확한 알람 권한 "+(exactAllowed?"허용":"미허용"));
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
