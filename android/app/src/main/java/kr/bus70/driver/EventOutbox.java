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
        String key=binding(schedule)+"|"+body.optInt("trip")+"|"+body.optString("event");
        for(int i=0;i<items.length();i++)if(key.equals(items.getJSONObject(i).optString("key")))return false;
        JSONObject copy=new JSONObject(body.toString());copy.remove("token");
        items.put(new JSONObject().put("key",key).put("binding",binding(schedule))
            .put("driverId",schedule.optString("driverId")).put("apiUrl",schedule.optString("apiUrl"))
            .put("body",copy).put("delivered",false));
        return true;
    }
    static void overlay(JSONArray items,JSONObject schedule) throws Exception {
        JSONArray trips=schedule.optJSONArray("trips");if(trips==null)return;
        for(int i=0;i<items.length();i++) {
            JSONObject item=items.getJSONObject(i);if(!binding(schedule).equals(item.optString("binding")))continue;
            JSONObject body=item.getJSONObject("body");String field=field(body.optString("event"));
            for(int j=0;j<trips.length();j++) {
                JSONObject trip=trips.getJSONObject(j);if(trip.optInt("trip")!=body.optInt("trip"))continue;
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
