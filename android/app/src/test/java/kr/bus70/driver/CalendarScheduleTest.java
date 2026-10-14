package kr.bus70.driver;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.HashMap;
import java.util.Map;

public class CalendarScheduleTest {
    private JSONObject payload() throws Exception {
        return new JSONObject().put("driverId","SYN-D").put("dispatchId","SYN-DSP").put("date","2099-01-10")
            .put("route","5").put("sequence",1).put("enabled",true).put("vehicle","SYN-V")
            .put("trips",new JSONArray().put(new JSONObject().put("trip",1).put("startTime","20:00").put("endTime","21:00"))
                .put(new JSONObject().put("trip",2).put("startTime","21:10").put("endTime","22:30"))
                .put(new JSONObject().put("trip",3).put("startTime","23:10").put("endTime","01:00")));
    }
    private static class Writer implements CalendarSchedule.Writer {
        int inserts,updates,deletes,failInsert;long next=100;
        JSONArray saved=new JSONArray();Map<Long,JSONObject> rows=new HashMap<>();
        public long insert(JSONObject event)throws Exception {if(failInsert>0&&inserts+1==failInsert)throw new Exception("provider unavailable");inserts++;rows.put(++next,event);return next;}
        public void update(long id,JSONObject event){updates++;assertTrue(rows.containsKey(id));rows.put(id,event);}
        public void delete(long id){deletes++;rows.remove(id);}
        public void save(JSONArray state)throws Exception {saved=new JSONArray(state.toString());}
    }
    @Test public void expiredTripIsNeverRecreatedAtScreenResume()throws Exception{
        Writer w=new Writer();JSONObject p=payload();long now=TripOrder.moment("2099-01-10","22:42");
        JSONArray desired=CalendarSchedule.plan(p,now);assertEquals(1,desired.length());assertTrue(desired.getJSONObject(0).getString("title").endsWith("3탕"));
        JSONArray state=CalendarSchedule.reconcile(new JSONArray(),desired,w);long id=state.getJSONObject(0).getLong("id");
        // Simulate many refreshes, including loading persisted state after process restart.
        for(int i=0;i<100;i++)state=CalendarSchedule.reconcile(new JSONArray(w.saved.toString()),CalendarSchedule.plan(p,now+i*1000),w);
        assertEquals(1,w.inserts);assertEquals(0,w.updates);assertEquals(0,w.deletes);assertEquals(id,state.getJSONObject(0).getLong("id"));
        state=CalendarSchedule.reconcile(state,CalendarSchedule.plan(p,TripOrder.moment("2099-01-10","23:10")),w);
        assertEquals(0,state.length());assertEquals(1,w.deletes);
        state=CalendarSchedule.reconcile(state,CalendarSchedule.plan(p,TripOrder.moment("2099-01-10","23:12")),w);
        assertEquals(1,w.inserts);assertEquals(1,w.deletes);
    }
    @Test public void changedDepartureUpdatesTheSameEventAndDoesNotTouchPersonalCalendar()throws Exception{
        Writer w=new Writer();w.rows.put(55L,new JSONObject().put("title","personal"));JSONObject p=payload();long now=TripOrder.moment("2099-01-10","22:42");
        JSONArray state=CalendarSchedule.reconcile(new JSONArray(),CalendarSchedule.plan(p,now),w);long id=state.getJSONObject(0).getLong("id");
        p.getJSONArray("trips").getJSONObject(2).put("startTime","23:20");
        state=CalendarSchedule.reconcile(state,CalendarSchedule.plan(p,now),w);
        assertEquals(id,state.getJSONObject(0).getLong("id"));assertEquals(1,w.inserts);assertEquals(1,w.updates);assertTrue(w.rows.containsKey(55L));
        p.put("enabled",false);CalendarSchedule.reconcile(state,CalendarSchedule.plan(p,now),w);
        assertEquals(1,w.rows.size());assertTrue(w.rows.containsKey(55L));
    }
    @Test public void actualDepartureAndCompletionSuppressEvenFuturePlannedEvents()throws Exception{
        JSONObject p=payload();p.getJSONArray("trips").getJSONObject(0).put("actualStart","19:59");
        p.getJSONArray("trips").getJSONObject(1).put("actualEnd","21:00");
        assertEquals(1,CalendarSchedule.plan(p,TripOrder.moment("2099-01-10","19:50")).length());
    }
    @Test public void overnightFutureEventUsesItsServiceDate()throws Exception{
        JSONObject p=payload();p.put("trips",new JSONArray().put(new JSONObject().put("trip",1).put("startTime","00:15").put("endTime","01:00")));
        assertEquals(1,CalendarSchedule.plan(p,TripOrder.moment("2099-01-10","23:59")).length());
        assertEquals(0,CalendarSchedule.plan(p,TripOrder.moment("2099-01-10","00:16")).length());
    }
    @Test public void successfulWritesSurviveLaterProviderFailure()throws Exception{
        JSONObject p=payload();Writer w=new Writer();w.failInsert=2;long now=TripOrder.moment("2099-01-10","19:00");
        try{CalendarSchedule.reconcile(new JSONArray(),CalendarSchedule.plan(p,now),w);fail("expected provider failure");}catch(Exception expected){}
        assertEquals(1,w.saved.length());assertEquals(1,w.rows.size());w.failInsert=0;
        CalendarSchedule.reconcile(w.saved,CalendarSchedule.plan(p,now),w);
        assertEquals(3,w.inserts);assertEquals(3,w.rows.size());
    }
}
