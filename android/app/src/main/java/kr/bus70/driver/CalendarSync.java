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

final class CalendarSync {
    // Only IDs saved by this app are eligible for migration/deletion. Never
    // search personal calendars by a bus-like title or delete unrelated events.
    static synchronized void migrateLegacy(Context context)throws Exception{
        NativeStore store=new NativeStore(context);
        if(store.calendarSyncVersion()>=2)return;
        ContentResolver resolver=context.getContentResolver();
        JSONArray remaining=new JSONArray(store.calendarEvents());
        while(remaining.length()>0){
            resolver.delete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI,remaining.getLong(0)),null,null);
            remaining.remove(0);store.calendarEvents(remaining.toString());
        }
        store.calendarState(new JSONArray());
    }

    static synchronized int sync(Context context,JSONObject payload)throws Exception{
        migrateLegacy(context);
        ContentResolver resolver=context.getContentResolver();NativeStore store=new NativeStore(context);
        JSONArray desired=CalendarSchedule.plan(payload,System.currentTimeMillis());
        JSONArray entries=CalendarSchedule.reconcile(new JSONArray(store.calendarEntries()),desired,new CalendarSchedule.Writer(){
            private ContentValues values(JSONObject event)throws Exception{
                ContentValues v=new ContentValues();
                v.put(CalendarContract.Events.TITLE,event.getString("title"));
                v.put(CalendarContract.Events.DESCRIPTION,event.getString("description"));
                v.put(CalendarContract.Events.DTSTART,event.getLong("start"));
                v.put(CalendarContract.Events.DTEND,event.getLong("end"));
                v.put(CalendarContract.Events.EVENT_TIMEZONE,"Asia/Seoul");
                v.put(CalendarContract.Events.HAS_ALARM,0);
                return v;
            }
            public long insert(JSONObject event)throws Exception{
                long calendarId=findWritableCalendar(resolver);
                if(calendarId<0)throw new IllegalStateException("기록 가능한 캘린더가 없습니다.");
                ContentValues v=values(event);v.put(CalendarContract.Events.CALENDAR_ID,calendarId);
                Uri uri=resolver.insert(CalendarContract.Events.CONTENT_URI,v);
                if(uri==null)return -1;
                long id=ContentUris.parseId(uri);
                // Some providers add default reminders: remove them as well.
                try{silence(resolver,id);}catch(Exception e){delete(id);throw e;}
                return id;
            }
            public void update(long id,JSONObject event)throws Exception{
                silence(resolver,id);
                resolver.update(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI,id),values(event),null,null);
            }
            public void delete(long id){resolver.delete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI,id),null,null);}
            public void save(JSONArray state)throws Exception{store.calendarState(state);}
        });
        return entries.length();
    }

    private static void silence(ContentResolver resolver,long id){
        resolver.delete(CalendarContract.Reminders.CONTENT_URI,CalendarContract.Reminders.EVENT_ID+"=?",new String[]{String.valueOf(id)});
        ContentValues silent=new ContentValues();silent.put(CalendarContract.Events.HAS_ALARM,0);
        resolver.update(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI,id),silent,null,null);
    }
    private static long findWritableCalendar(ContentResolver resolver){
        String[] p={CalendarContract.Calendars._ID};String s=CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL+">=? AND "+CalendarContract.Calendars.VISIBLE+"=1";
        try(Cursor c=resolver.query(CalendarContract.Calendars.CONTENT_URI,p,s,new String[]{String.valueOf(CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR)},CalendarContract.Calendars.IS_PRIMARY+" DESC")){return c!=null&&c.moveToFirst()?c.getLong(0):-1;}
    }
}
