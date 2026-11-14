package kr.bus70.driver;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class ActualCompletionAlarmTest {
    JSONObject payload()throws Exception{return new JSONObject().put("driverId","SYN-D").put("dispatchId","SYN-DSP").put("date","2099-01-10").put("route","5").put("sequence",1).put("electricVehicle",true).put("exact",false).put("endOfShift",new JSONObject()).put("trips",new JSONArray().put(new JSONObject().put("trip",6).put("startTime","21:00").put("endTime","22:00").put("endPlace","시험 종점").put("deadheadDestination","시험 차고지").put("actualStart","21:01:05")));}
    @Test public void timetableEndNeverClaimsCompletion()throws Exception{
        JSONObject p=payload();assertEquals(0,AlarmPolicy.build(p,"").length());
        JSONObject old=new JSONObject().put("type","END_OF_SHIFT").put("at",1000);
        assertFalse(AlarmPolicy.due(old,1000,new JSONObject()));old.put("type","BREAK_CHARGE_6");assertFalse(AlarmPolicy.due(old,1000,new JSONObject()));
    }
    @Test public void actualEventUsesSecondsAndSurvivesReplayAndCorrection()throws Exception{
        JSONObject p=payload();p.getJSONArray("trips").getJSONObject(0).put("actualEnd","22:04:37");
        JSONObject event=AlarmPolicy.build(p,"").getJSONObject(0);long at=TripOrder.moment("2099-01-10","22:04")+37000;
        assertEquals(at,event.getLong("at"));assertTrue(event.getString("message").contains("22시 4분"));
        assertFalse(AlarmPolicy.future(event,at-1,new JSONObject()));assertFalse(AlarmPolicy.due(event,at-1,new JSONObject()));
        assertTrue(AlarmPolicy.due(event,at+1000,new JSONObject()));assertFalse(AlarmPolicy.due(event,at+90001,new JSONObject()));
        JSONObject receipts=AlarmPolicy.received(new JSONObject(),event,at);
        assertFalse(AlarmPolicy.due(event,at+2000,new JSONObject(receipts.toString())));
        event.put("at",at+1000);assertFalse(AlarmPolicy.due(event,at+2000,receipts));
        p.put("enabled",false);assertEquals(0,AlarmPolicy.build(p,"").length());
    }
    @Test public void actualReturnSupersedesEarlierCompletionOnLateRefresh()throws Exception{
        JSONObject p=payload(),trip=p.getJSONArray("trips").getJSONObject(0);
        trip.put("actualEnd","22:04:37").put("deadheadReturnedAt","22:16:25");
        JSONArray events=AlarmPolicy.build(p,"");assertEquals(1,events.length());assertEquals("ACTUAL_RETURN_6",events.getJSONObject(0).getString("type"));
        assertEquals(TripOrder.moment("2099-01-10","22:16")+25000,events.getJSONObject(0).getLong("at"));
    }
}
