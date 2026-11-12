package kr.bus70.driver;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;
public class DriverGuidancePolicyTest {
    @Test public void fixedMessagesRequireCurrentEnabledBinding() throws Exception {
        JSONObject schedule=new JSONObject().put("roadSafetyEnabled",true).put("driverId","SYN-D").put("dispatchId","SYN-A").put("date","2099-01-01");
        JSONObject request=new JSONObject(schedule.toString()).put("kind","FRONT").put("gap",2);
        assertTrue(DriverGuidancePolicy.message(request,schedule).contains("앞차와 2정류장"));
        request.put("gap",3);assertNull(DriverGuidancePolicy.message(request,schedule));
        request.put("kind","SCHOOL_FACILITY");String message=DriverGuidancePolicy.message(request,schedule);assertTrue(message.contains("속도표지"));assertFalse(message.contains("30"));
        request.put("kind","ARBITRARY_TEXT");assertNull(DriverGuidancePolicy.message(request,schedule));
        request.put("kind","REAR").put("gap",1).put("driverId","OTHER");assertNull(DriverGuidancePolicy.message(request,schedule));
        request.put("driverId","SYN-D");schedule.put("roadSafetyEnabled",false);assertNull(DriverGuidancePolicy.message(request,schedule));
    }
}
