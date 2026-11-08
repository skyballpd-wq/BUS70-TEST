package kr.bus70.driver;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.*;
import java.time.Instant;
public class RoadSafetyPolicyTest {
 final long now=Instant.parse("2099-01-10T03:00:00Z").toEpochMilli();
 JSONObject zone()throws Exception{return new JSONObject().put("id","SYN-Z").put("verified",true).put("route","5").put("type","SCHOOL").put("source","synthetic fixture").put("validFrom","2099-01-01").put("validThrough","2099-01-31").put("lat",37.001).put("lng",127).put("bearing",0).put("speedLimit",30).put("stopOrder",3);}
 JSONObject schedule(JSONObject z)throws Exception{return new JSONObject().put("roadSafetyEnabled",true).put("route","5").put("roadSafety",new JSONObject().put("zones",new JSONArray().put(z)));}
 JSONObject trip()throws Exception{return new JSONObject().put("actualStart","2099-01-10 11:00:00").put("course",new JSONObject().put("stops",new JSONArray().put(new JSONObject().put("order",3))));}
 JSONObject nav()throws Exception{return new JSONObject().put("configured",true).put("matchedIndex",0);}
 JSONObject check(JSONObject s,JSONObject t,JSONObject n,long fix,double bearing)throws Exception{return RoadSafetyPolicy.evaluate(s,t,n,now,fix,37,127,5,10,bearing);}
 @Test public void warnsOnlyDuringSelectedServiceOnVerifiedCurrentForwardRoute()throws Exception{
  assertNotNull(check(schedule(zone()),trip(),nav(),now,0));
  assertNull(check(schedule(zone()).put("roadSafetyEnabled",false),trip(),nav(),now,0));
  assertNull(check(schedule(zone()),trip().put("actualStart",""),nav(),now,0));
  assertNull(check(schedule(zone()),trip().put("actualEnd","observed"),nav(),now,0));
  assertNull(check(schedule(zone()),trip(),nav(),now-7000,0));
  assertNull(check(schedule(zone()),trip(),nav(),now,180));
  assertNull(check(schedule(zone()),trip(),nav().put("retained",true),now,0));
  for(JSONObject z:new JSONObject[]{zone().put("verified",false),zone().put("route","70"),zone().put("speedLimit",JSONObject.NULL),zone().put("validThrough","2099-01-09"),zone().put("startMinute",0).put("endMinute",60),zone().put("startMinute",0),zone().put("lat",-37),zone().put("stopOrder",20)})assertNull(check(schedule(z),trip(),nav(),now,0));
 }
}
