package kr.bus70.driver;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class EventOutboxTest {
    @Test public void earlyGpsEventIsVoidedAndDoesNotBlockReplacement()throws Exception {
        JSONObject s=schedule("D1","V1"),trip=s.getJSONArray("trips").getJSONObject(0);trip.put("startTime","14:41").put("actualStart","2099-01-08T14:20:00+09:00");
        long planned=TripOrder.moment("2099-01-08","14:41");JSONArray q=new JSONArray();
        EventOutbox.add(q,s,event("DEPART",planned-21*60000).put("source","GPS_AUTO"));q.getJSONObject(0).put("delivered",true);
        EventOutbox.overlay(q,s);assertTrue(q.getJSONObject(0).optBoolean("voided"));assertEquals("",trip.optString("actualStart"));assertTrue(trip.optBoolean("departureReset"));assertNull(EventOutbox.next(q,"D1",planned));
        assertTrue(EventOutbox.add(q,s,event("DEPART",planned+4000).put("source","GPS_AUTO")));assertEquals(2,q.length());assertNotEquals(q.getJSONObject(0).getString("key"),q.getJSONObject(1).getString("key"));
        EventOutbox.overlay(q,s);assertEquals(java.time.Instant.ofEpochMilli(planned+4000).toString(),trip.optString("actualStart"));
        q=new JSONArray(q.toString());assertEquals(planned+4000,EventOutbox.next(q,"D1",planned+5000).getJSONObject("body").getLong("observedAt"));
    }
    private JSONObject schedule(String driver,String vehicle) throws Exception {
        return new JSONObject().put("driverId",driver).put("vehicleId",vehicle).put("dispatchId","SYN-D1").put("date","2099-01-08").put("apiUrl","https://example.invalid/test")
            .put("trips",new JSONArray().put(new JSONObject().put("trip",2)));
    }
    private JSONObject event(String name,long at) throws Exception {
        return new JSONObject().put("trip",2).put("event",name).put("observedAt",at).put("token","synthetic-secret");
    }
    @Test public void offlineTripSurvivesRestartAndLateResponses() throws Exception {
        JSONObject s=schedule("D1","V1");JSONArray q=new JSONArray();long at=100000L;
        for(String name:new String[]{"DEPART","TURN","TURN_DEPART","CONTROL","ARRIVE","DEADHEAD_RETURN"}){
            EventOutbox.add(q,s,event(name,at));at+=60000;EventOutbox.overlay(q,s);
        }
        assertEquals(6,q.length());assertFalse(q.toString().contains("synthetic-secret"));
        // Process death: only serialized preferences survive.
        q=new JSONArray(q.toString());s=schedule("D1","V1");EventOutbox.overlay(q,s);
        assertFalse(s.getJSONArray("trips").getJSONObject(0).optString("actualEnd").isEmpty());
        assertEquals("DEPART",EventOutbox.next(q,"D1",10000000).getJSONObject("body").getString("event"));
        q.getJSONObject(0).put("retryAt",20000000);assertNull(EventOutbox.next(q,"D1",10000000));
        q.getJSONObject(0).put("delivered",true).put("recordedAt","2099-01-08T08:00:00+09:00");
        assertEquals("TURN",EventOutbox.next(q,"D1",10000000).getJSONObject("body").getString("event"));
        EventOutbox.add(q,s,event("TURN",99999999));assertEquals(6,q.length());assertEquals(160000,q.getJSONObject(1).getJSONObject("body").getLong("observedAt"));
    }
    @Test public void anotherDriverOrVehicleCannotInheritEvents() throws Exception {
        JSONArray q=new JSONArray();EventOutbox.add(q,schedule("D1","V1"),event("DEPART",100000));
        JSONObject other=schedule("D1","V2");EventOutbox.overlay(q,other);assertEquals("",other.getJSONArray("trips").getJSONObject(0).optString("actualStart"));
        assertNull(EventOutbox.next(q,"D2",200000));assertEquals(0,EventOutbox.pending(q,"D2"));
    }
    @Test public void pendingIsNeverPrunedAndFreshServerRecordsWin() throws Exception {
        JSONArray q=new JSONArray();JSONObject s=schedule("D1","V1");EventOutbox.add(q,s,event("DEPART",100000));
        assertEquals(1,EventOutbox.prune(q,999999999).length());
        s.getJSONArray("trips").getJSONObject(0).put("actualStart","server-corrected-time");EventOutbox.overlay(q,s);
        assertEquals("server-corrected-time",s.getJSONArray("trips").getJSONObject(0).getString("actualStart"));
        q.getJSONObject(0).put("delivered",true);assertEquals(0,EventOutbox.prune(q,999999999).length());
    }
}
