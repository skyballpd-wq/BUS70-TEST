package kr.bus70.driver;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;
public class JourneyVoicePolicyTest {
    @Test public void estimatesRequireTurnAndFreshnessAndMaterialChange()throws Exception{
        long now=2000000000000L;JSONObject schedule=new JSONObject(),trip=new JSONObject().put("actualStart","observed"),state=new JSONObject();
        JSONObject estimate=new JSONObject().put("available",true).put("timestamp",now).put("predictedAt",now+3600000).put("latestAt",now+3900000);
        assertNull(JourneyVoicePolicy.message(schedule,trip,estimate,state,now));trip.put("actualTurn","observed");
        assertNotNull(JourneyVoicePolicy.message(schedule,trip,estimate,state,now));JourneyVoicePolicy.accepted(state,estimate,now);
        assertNull(JourneyVoicePolicy.message(schedule,trip,estimate,state,now));
        estimate.put("timestamp",now+600000).put("predictedAt",now+4200000).put("latestAt",now+4500000);
        assertNotNull(JourneyVoicePolicy.message(schedule,trip,estimate,state,now+600000));
        estimate.put("warning",true);assertNull(JourneyVoicePolicy.message(schedule,trip,estimate,state,now+600000));estimate.put("warning",false);
        assertNull(JourneyVoicePolicy.message(schedule,trip,estimate,state,now+611000));trip.put("actualEnd","observed");assertNull(JourneyVoicePolicy.message(schedule,trip,estimate,state,now+600000));
    }
}
