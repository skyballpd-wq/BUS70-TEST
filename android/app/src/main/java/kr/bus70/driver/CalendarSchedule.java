package kr.bus70.driver;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

/** Calendar entries are silent schedule references. AlarmScheduler owns reminders. */
final class CalendarSchedule {
    interface Writer {
        long insert(JSONObject event) throws Exception;
        void update(long id, JSONObject event) throws Exception;
        void delete(long id) throws Exception;
        void save(JSONArray entries) throws Exception;
    }

    static JSONArray plan(JSONObject payload, long now) throws Exception {
        JSONArray result=new JSONArray(),trips=TripOrder.actual(payload.optJSONArray("trips"));
        if(!payload.optBoolean("enabled",true))return result;
        String date=payload.optString("date"),route=payload.optString("route","70");
        for(int i=0;i<trips.length();i++){
            JSONObject trip=trips.getJSONObject(i);
            long start=TripOrder.moment(date,trip.optString("startTime"));
            if(start<=now||AlarmPolicy.started(trip))continue;
            long end=TripOrder.moment(date,trip.optString("endTime"));
            if(end<=start)end=start+60*60000L;
            String key=payload.optString("driverId")+"|"+payload.optString("dispatchId")+"|"+date+"|"+trip.getInt("trip");
            String description="차량 "+payload.optString("vehicle")+" · "+route+"번 확정 배차 · 알림은 소신여객 기사 앱에서 제공";
            result.put(new JSONObject().put("key",key).put("title",route+"번 "+payload.optInt("sequence")+"순차 "+trip.getInt("trip")+"탕")
                    .put("description",description).put("start",start).put("end",end));
        }
        return result;
    }

    // Keep the provider event ID across refresh/resume. Persist each successful
    // write so a later failure cannot lose ownership of already-created events.
    static JSONArray reconcile(JSONArray previous, JSONArray desired, Writer writer) throws Exception {
        JSONArray state=new JSONArray(previous.toString());
        Set<String> keys=new HashSet<>();
        for(int i=0;i<desired.length();i++)keys.add(desired.getJSONObject(i).getString("key"));
        for(int i=state.length()-1;i>=0;i--){
            JSONObject old=state.getJSONObject(i);
            if(!keys.contains(old.getString("key"))){writer.delete(old.getLong("id"));state.remove(i);writer.save(state);}
        }
        for(int i=0;i<desired.length();i++){
            JSONObject event=desired.getJSONObject(i),old=null;
            for(int j=0;j<state.length();j++)if(state.getJSONObject(j).getString("key").equals(event.getString("key"))){old=state.getJSONObject(j);break;}
            String signature=event.getString("title")+"\n"+event.getString("description")+"\n"+event.getLong("start")+"\n"+event.getLong("end");
            if(old!=null){
                if(!signature.equals(old.optString("signature"))){writer.update(old.getLong("id"),event);old.put("signature",signature);writer.save(state);}
            }else{
                long id=writer.insert(event);
                if(id<=0)throw new IllegalStateException("캘린더 일정 저장에 실패했습니다.");
                state.put(new JSONObject().put("id",id).put("key",event.getString("key")).put("signature",signature));
                try{writer.save(state);}catch(Exception error){writer.delete(id);throw error;}
            }
        }
        return state;
    }
}
