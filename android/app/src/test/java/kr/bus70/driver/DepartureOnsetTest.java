package kr.bus70.driver;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.*;
public class DepartureOnsetTest {
 final long planned=2000000000000L;
 JSONObject start()throws Exception{return new JSONObject().put("lat",37).put("lng",127).put("radiusM",80).put("departureBearing",0);}
 void sample(JSONObject state,double meters,long seconds,double speed,double heading)throws Exception{DepartureOnset.update(state,start(),planned,planned+seconds*1000,37+meters/111195,127,5,speed,heading);}
 JSONObject fallback(long seconds)throws Exception{return new JSONObject().put("time",planned+seconds*1000);}
 @Test public void retainsDepotMotionThroughSignalStopUntilIndependentConfirmation()throws Exception{
  JSONObject s=new JSONObject().put("seenStart",true);sample(s,10,2,4,0);sample(s,30,7,4,0);
  for(int t=12;t<=32;t+=5)sample(s,70,t,0,0);
  sample(s,140,37,9,0);assertEquals(planned+2000,DepartureOnset.first(s,fallback(37)).getLong("time"));
 }
 @Test public void walkingEarlyWrongHeadingGapAndIdleCannotBackdate()throws Exception{
  for(int kind=0;kind<5;kind++){
   JSONObject s=new JSONObject().put("seenStart",true);sample(s,10,kind==1?-2:2,kind==0?1.2:4,kind==2?180:0);
   if(kind==4){sample(s,10,7,0,0);sample(s,10,12,0,0);sample(s,10,22,0,0);}
   sample(s,140,kind==3?30:12,9,0);assertEquals(planned+37000,DepartureOnset.first(s,fallback(37)).getLong("time"));
  }
 }
 @Test public void continuousLongQueueRetainsMeasuredOnsetButExpiresAfterTenMinutes()throws Exception{
  for(int until:new int[]{242,482,622}){
   JSONObject s=new JSONObject().put("seenStart",true);sample(s,10,2,4,0);sample(s,30,7,4,0);
   for(int t=12;t<=until;t+=5)sample(s,140,t,0,0);
   sample(s,200,until+5,9,0);
   assertEquals(planned+(until<600?2:until+5)*1000L,DepartureOnset.first(s,fallback(until+5)).getLong("time"));
  }
 }
 @Test public void longQueueDoesNotRetainOnsetAcrossGpsGapOrReturnToPark()throws Exception{
  for(boolean parked:new boolean[]{false,true}){
   JSONObject s=new JSONObject().put("seenStart",true);sample(s,10,2,4,0);sample(s,30,7,4,0);
   for(int t=12;t<=242;t+=5)sample(s,parked?70:140,t,0,0);
   sample(s,200,parked?247:272,9,0);
   assertEquals(planned+(parked?247000:272000),DepartureOnset.first(s,fallback(parked?247:272)).getLong("time"));
  }
 }
}
