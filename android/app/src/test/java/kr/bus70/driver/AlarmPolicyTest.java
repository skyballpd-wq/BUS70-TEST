package kr.bus70.driver;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class AlarmPolicyTest {
    private final long at=TripOrder.moment("2099-01-10","21:10");
    private JSONObject alarm() throws Exception {return new JSONObject().put("id",1).put("key","SYN-D|SYN-DSP|2099-01-10|EXACT_6").put("at",at).put("type","EXACT_6").put("trip",6).put("driverId","SYN-D").put("dispatchId","SYN-DSP").put("date","2099-01-10");}
    @Test public void delayedAndPreviouslyDeliveredAlarmsNeverReplay()throws Exception{
        JSONObject item=alarm(),receipts=new JSONObject();
        assertTrue(AlarmPolicy.future(item,at-1,receipts));assertFalse(AlarmPolicy.due(item,at-1,receipts));
        assertTrue(AlarmPolicy.due(item,at,receipts));assertTrue(AlarmPolicy.due(item,at+90000,receipts));
        assertFalse(AlarmPolicy.due(item,at+90001,receipts));
        assertFalse(AlarmPolicy.due(item,TripOrder.moment("2099-01-10","22:42"),receipts));
        receipts=AlarmPolicy.received(receipts,item,at);
        // Dismissal, repeated broadcasts, process restart and clock rollback.
        JSONObject restored=new JSONObject(receipts.toString());
        assertFalse(AlarmPolicy.due(item,at+1000,restored));assertFalse(AlarmPolicy.future(item,at-60000,restored));
        JSONObject changed=new JSONObject(item.toString()).put("at",at+600000);
        assertTrue(AlarmPolicy.future(changed,at,restored));
    }
    @Test public void canceledOrReplacedPendingIntentIsRejected()throws Exception{
        JSONObject item=alarm();JSONArray saved=new JSONArray().put(item);
        assertTrue(AlarmPolicy.contains(saved,item));assertFalse(AlarmPolicy.contains(new JSONArray(),item));
        assertFalse(AlarmPolicy.contains(saved,new JSONObject(item.toString()).put("at",at+60000)));
        assertFalse(AlarmPolicy.contains(saved,new JSONObject(item.toString()).put("key","OTHER")));
    }
    @Test public void departedTripIsRejectedAtDeliveryWithoutAWebRefresh()throws Exception{
        JSONObject latest=new JSONObject().put("driverId","SYN-D").put("dispatchId","SYN-DSP").put("date","2099-01-10")
            .put("trips",new JSONArray().put(new JSONObject().put("trip",6).put("startTime","21:10").put("actualStart","21:09")));
        assertTrue(AlarmPolicy.obsolete(alarm(),latest));
        latest.put("dispatchId","OTHER");assertFalse(AlarmPolicy.obsolete(alarm(),latest));
    }
    @Test public void schedulerExcludesDepartedTripPreparationButKeepsFutureTrip()throws Exception{
        JSONObject p=new JSONObject().put("driverId","SYN-D").put("dispatchId","SYN-DSP").put("date","2099-01-10").put("route","5").put("sequence",1)
            .put("commuteMinutes",new JSONArray().put(10)).put("tripMinutes",new JSONArray().put(3)).put("exact",true)
            .put("trips",new JSONArray().put(new JSONObject().put("trip",6).put("startTime","21:10").put("actualStart","21:09"))
                .put(new JSONObject().put("trip",7).put("startTime","23:00")));
        JSONArray alarms=AlarmPolicy.build(p,"");assertEquals(2,alarms.length());
        for(int i=0;i<alarms.length();i++)assertEquals(7,alarms.getJSONObject(i).getInt("trip"));
        p.put("enabled",false);assertEquals(0,AlarmPolicy.build(p,"").length());
    }
}
