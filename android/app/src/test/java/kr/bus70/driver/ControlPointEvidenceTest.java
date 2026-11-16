package kr.bus70.driver;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.*;
public class ControlPointEvidenceTest {
 JSONObject trip()throws Exception{return new JSONObject().put("actualStart","recorded").put("actualTurn","recorded").put("turnPlace","synthetic turn").put("controlPurpose","전철 막차 연계").put("controlLocation",new JSONObject().put("lat",37).put("lng",127).put("radiusM",80).put("approachBearing",0).put("departureBearing",0)).put("course",new JSONObject().put("controlIndex",8).put("turnIndex",5));}
 JSONObject sample(JSONObject state,JSONObject trip,double meters,int seconds,double speed,double heading)throws Exception{return ControlPointEvidence.update(state,trip,new JSONObject().put("configured",true).put("fraction",8+meters/1000),2000000000000L+seconds*1000,37+meters/111195,127,5,speed,heading);}
 @Test public void outwardVisitAndReturnDwellAreNotDeparture()throws Exception{
  JSONObject s=new JSONObject(),t=trip();t.remove("actualTurn");assertNull(sample(s,t,0,4,0,0));assertNull(sample(s,t,0,8,0,0));assertNull(sample(s,t,120,12,4,0));assertNull(sample(s,t,160,16,4,0));
  t.put("actualTurn","recorded");assertNull(sample(s,t,0,20,0,0));assertNull(sample(s,t,0,24,0,0));assertNull(sample(s,t,20,28,4,0));assertNull(sample(s,t,120,32,4,0));assertEquals(2000000028000L,sample(s,t,160,36,4,0).getLong("time"));
 }
 @Test public void reverseUnknownAndLostGpsDoNotCreateDeparture()throws Exception{
  for(int kind=0;kind<3;kind++){
   JSONObject s=new JSONObject(),t=trip();sample(s,t,0,4,0,0);sample(s,t,0,8,0,0);
   if(kind==1)t.getJSONObject("course").put("controlIndex",-1);
   assertNull(sample(s,t,kind==0?-120:120,kind==2?120:12,4,kind==0?180:0));assertNull(sample(s,t,kind==0?-160:160,kind==2?124:16,4,kind==0?180:0));
  }
 }
 @Test public void ordinaryArrivalAndCompletedTrip()throws Exception{
  JSONObject s=new JSONObject(),t=trip().put("controlPurpose","중간 도착");sample(s,t,0,4,0,0);assertNotNull(sample(s,t,0,8,0,0));
  t.put("actualEnd","recorded");assertNull(sample(s,t,0,12,0,0));
 }
}
