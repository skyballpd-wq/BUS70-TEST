package kr.bus70.driver;

import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;

/** Durable checkpoint events only; never a continuous location trail. */
final class EventOutbox {
    static String field(String event) {
        switch (event) {
            case "DEPART": return "actualStart";
            case "TURN": return "actualTurn";
            case "TURN_DEPART": return "turnDepartedAt";
            case "CONTROL": return "actualControl";
            case "DEADHEAD_RETURN": return "deadheadReturnedAt";
            default: return "actualEnd";
        }
    }
    static String binding(JSONObject s) {
        return s.optString("driverId")+"|"+s.optString("date")+"|"+s.optString("dispatchId")+"|"+s.optString("vehicleId");
    }
    static boolean add(JSONArray items, JSONObject schedule, JSONObject body) throws Exception {
        String key=binding(schedule)+"|"+body.optInt("trip")+"|"+body.optString("event")+"|"+body.optLong("observedAt");
        for(int i=0;i<items.length();i++){JSONObject item=items.getJSONObject(i),old=item.getJSONObject("body");if(!item.optBoolean("voided")&&binding(schedule).equals(item.optString("binding"))&&old.optInt("trip")==body.optInt("trip")&&old.optString("event").equals(body.optString("event")))return false;}
        JSONObject copy=new JSONObject(body.toString());copy.remove("token");
        items.put(new JSONObject().put("key",key).put("binding",binding(schedule))
            .put("driverId",schedule.optString("driverId")).put("apiUrl",schedule.optString("apiUrl"))
            .put("body",copy).put("delivered",false));
        return true;
    }
    static void overlay(JSONArray items,JSONObject schedule) throws Exception {
        JSONArray trips=schedule.optJSONArray("trips");if(trips==null)return;
        for(int i=0;i<items.length();i++) {
            JSONObject item=items.getJSONObject(i);if(!binding(schedule).equals(item.optString("binding"))||item.optBoolean("voided"))continue;
            JSONObject body=item.getJSONObject("body");String field=field(body.optString("event"));
            for(int j=0;j<trips.length();j++) {
                JSONObject trip=trips.getJSONObject(j);if(trip.optInt("trip")!=body.optInt("trip"))continue;
                long planned=TripOrder.moment(schedule.optString("date"),trip.optString("startTime"));
                if("DEPART".equals(body.optString("event"))&&"GPS_AUTO".equals(body.optString("source"))&&planned>0&&body.optLong("observedAt")<planned){
                    item.put("voided",true).put("delivered",true).put("error","예정 발차시각 이전 GPS 오출발 제외");trip.put("departureReset",true);
                    long recorded=TripOrder.observedMoment(schedule.optString("date"),trip.optString("actualStart"));
                    if(recorded>0&&recorded<planned&&trip.optString("actualTurn").isEmpty()&&trip.optString("actualEnd").isEmpty()&&!"수동".equals(trip.optString("startRecordMode")))trip.put("actualStart","");
                    continue;
                }
                if(trip.optString(field).isEmpty())trip.put(field,item.optString("recordedAt",Instant.ofEpochMilli(body.getLong("observedAt")).toString()));
            }
        }
    }
    static JSONObject next(JSONArray items,String driverId,long now) throws Exception {
        java.util.Set<String> blocked=new java.util.HashSet<>();for(int i=0;i<items.length();i++){JSONObject item=items.getJSONObject(i);if(driverId.equals(item.optString("driverId"))&&item.optBoolean("blocked")&&!item.optBoolean("delivered"))blocked.add(item.optString("binding"));}
        for(int i=0;i<items.length();i++) {
            JSONObject item=items.getJSONObject(i);
            if(!driverId.equals(item.optString("driverId"))||item.optBoolean("delivered")||blocked.contains(item.optString("binding")))continue;
            // Preserve order. A failed departure must precede its turn and arrival.
            return item.optLong("retryAt")>now?null:item;
        }
        return null;
    }
    static int pending(JSONArray items,String driverId) throws Exception {
        int count=0;for(int i=0;i<items.length();i++){JSONObject item=items.getJSONObject(i);if(driverId.equals(item.optString("driverId"))&&!item.optBoolean("delivered"))count++;}return count;
    }
    static JSONArray prune(JSONArray items,long now) throws Exception {
        JSONArray keep=new JSONArray();for(int i=0;i<items.length();i++){JSONObject item=items.getJSONObject(i);if(!item.optBoolean("delivered")||now-item.getJSONObject("body").optLong("observedAt")<172800000L)keep.put(item);}return keep;
    }
}
