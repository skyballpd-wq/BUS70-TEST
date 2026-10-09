package kr.bus70.driver;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

final class CalendarSync {
    private static final ZoneId SEOUL=ZoneId.of("Asia/Seoul");
    static int sync(Context context,JSONObject payload)throws Exception{
        ContentResolver resolver=context.getContentResolver();NativeStore store=new NativeStore(context);
        JSONArray old=new JSONArray(store.calendarEvents());
        for(int i=0;i<old.length();i++)resolver.delete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI,old.getLong(i)),null,null);
        long calendarId=findWritableCalendar(resolver);if(calendarId<0)throw new IllegalStateException("기록 가능한 캘린더가 없습니다.");
        JSONArray ids=new JSONArray(),trips=payload.optJSONArray("trips");if(trips==null)return 0;String route=payload.optString("route","70"),brand=route+"번";
        for(int i=0;i<trips.length();i++){
            JSONObject trip=trips.getJSONObject(i);long start=moment(payload.getString("date"),trip.getString("startTime"));long end=moment(payload.getString("date"),trip.optString("endTime",trip.getString("startTime")));
            if(end<=start)end=start+60*60000L;
            String description="차량 "+payload.optString("vehicle")+" · "+brand+" 확정 배차";JSONObject finish=payload.optJSONObject("endOfShift");if(i==trips.length()-1&&finish!=null)description+=" · "+finish.optString("serviceEndPlace","테크노파크4차 정류장")+" 영업종료 후 "+finish.optString("deadheadDestination","고강동공영차고지")+" 회송·청소·충전잭 연결";
            ContentValues values=new ContentValues();values.put(CalendarContract.Events.CALENDAR_ID,calendarId);values.put(CalendarContract.Events.TITLE,brand+" "+payload.optInt("sequence")+"순차 "+trip.getInt("trip")+"탕");values.put(CalendarContract.Events.DESCRIPTION,description);values.put(CalendarContract.Events.DTSTART,start);values.put(CalendarContract.Events.DTEND,end);values.put(CalendarContract.Events.EVENT_TIMEZONE,"Asia/Seoul");values.put(CalendarContract.Events.HAS_ALARM,1);
            Uri uri=resolver.insert(CalendarContract.Events.CONTENT_URI,values);if(uri==null)continue;long eventId=ContentUris.parseId(uri);ids.put(eventId);
            JSONArray minutes=payload.optJSONArray("tripMinutes");if(minutes!=null)for(int m=0;m<minutes.length();m++){ContentValues reminder=new ContentValues();reminder.put(CalendarContract.Reminders.EVENT_ID,eventId);reminder.put(CalendarContract.Reminders.MINUTES,minutes.getInt(m));reminder.put(CalendarContract.Reminders.METHOD,CalendarContract.Reminders.METHOD_ALERT);resolver.insert(CalendarContract.Reminders.CONTENT_URI,reminder);}
        }
        store.calendarEvents(ids.toString());return ids.length();
    }
    private static long findWritableCalendar(ContentResolver resolver){
        String[] p={CalendarContract.Calendars._ID};String s=CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL+">=? AND "+CalendarContract.Calendars.VISIBLE+"=1";
        try(Cursor c=resolver.query(CalendarContract.Calendars.CONTENT_URI,p,s,new String[]{String.valueOf(CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR)},CalendarContract.Calendars.IS_PRIMARY+" DESC")){return c!=null&&c.moveToFirst()?c.getLong(0):-1;}
    }
    private static long moment(String serviceDate,String clock){LocalDate date=LocalDate.parse(serviceDate);LocalTime time=LocalTime.parse(clock);if(time.isBefore(LocalTime.of(3,30)))date=date.plusDays(1);return ZonedDateTime.of(date,time,SEOUL).toInstant().toEpochMilli();}
}
