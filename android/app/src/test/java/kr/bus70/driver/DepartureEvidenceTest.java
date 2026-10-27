package kr.bus70.driver;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.*;

public class DepartureEvidenceTest {
    final long planned=2000000000000L;
    JSONObject trip()throws Exception{return new JSONObject().put("startLocation",new JSONObject().put("lat",37).put("lng",127).put("radiusM",80)).put("course",new JSONObject().put("turnIndex",8));}
    JSONObject drive(long identity,double speed,boolean returning,long shift)throws Exception{
        JSONObject state=new JSONObject().put("seenStart",true),result=null,t=trip();
        for(int i=0;i<16;i++){
            long at=planned+5000+i*5000+shift;double fraction=.3+i*.1;
            JSONObject nav=new JSONObject().put("configured",true).put("returnConfirmed",returning).put("fraction",fraction).put("timestamp",at);
            result=DepartureEvidence.update(state,t,nav,null,identity,planned,at,37+fraction*.0045,127,5,speed);
            if(result!=null)return result;
        }
        return null;
    }
    @Test public void recordsFirstFixAfterContinuousVehicleLikeTravel()throws Exception{
        JSONObject result=drive(planned-60000,10,false,0);assertNotNull(result);assertEquals(planned+5000,result.getLong("time"));
    }
    @Test public void rejectsWalkingUnknownOrExpiredIdentityEarlyReturnAndUnknownSpeed()throws Exception{
        assertNull(drive(0,10,false,0));assertNull(drive(planned-21*3600000L,10,false,0));
        assertNull(drive(planned-60000,1.2,false,0));assertNull(drive(planned-60000,Double.NaN,false,0));
        assertNull(drive(planned-60000,10,true,0));assertNull(drive(planned-600000,10,false,-300000));
    }
    @Test public void longGapDoesNotBackdateCandidate()throws Exception{
        JSONObject s=new JSONObject().put("seenStart",true),t=trip(),result=null;
        for(int i=0;i<20;i++){
            long at=planned+5000+i*5000+(i>=4?20000:0);double fraction=.3+i*.1;
            JSONObject nav=new JSONObject().put("configured",true).put("fraction",fraction).put("timestamp",at);
            result=DepartureEvidence.update(s,t,nav,null,planned-60000,planned,at,37+fraction*.0045,127,5,10);
            if(result!=null)break;
        }
        assertNotNull(result);assertEquals(planned+45000,result.getLong("time"));
    }
    @Test public void stopAndGoDoesNotDiluteMeasuredVehicleMotion()throws Exception{
        for(boolean walking:new boolean[]{false,true}){
            JSONObject state=new JSONObject().put("seenStart",true),result=null,t=trip();long at=planned;
            for(int i=0;i<100;i++){
                at+=5000;double fraction=.3+Math.floor(i/10.0)*.1;
                JSONObject nav=new JSONObject().put("configured",true).put("fraction",fraction).put("timestamp",at);
                result=DepartureEvidence.update(state,t,nav,null,planned-60000,planned,at,37+fraction*.0045,127,5,i%10==0?(walking?1.2:10):0);
                if(result!=null)break;
            }
            if(walking)assertNull(result);else {assertNotNull(result);assertEquals(planned+5000,result.getLong("time"));}
        }
    }
}
