package kr.bus70.driver;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.*;
import java.nio.charset.StandardCharsets;

public class RouteMatcherTest {
    @Test public void walkingPhoneNeedsActualVehicleProgress()throws Exception {
        JSONArray stops=new JSONArray(new String(getClass().getResourceAsStream("/route5-public-stops.json").readAllBytes(),StandardCharsets.UTF_8));
        JSONObject course=new JSONObject().put("stops",stops).put("turnIndex",55).put("pivotIndex",57),state=new JSONObject();long planned=100000000L;
        JSONObject stop=stops.getJSONObject(1),hint=new JSONObject().put("available",true).put("source","GYEONGGI_BUS_LOCATION_V2").put("stationSeq",stop.optInt("order")).put("stationId",stop.optString("id")).put("fetchedAt",planned);
        JSONObject nav=new JSONObject().put("configured",true).put("fraction",1).put("timestamp",planned);
        assertFalse(RouteMatcher.vehicleDeparture(state,course,nav,stop.getDouble("lat"),stop.getDouble("lng"),1.2,planned,planned,hint));
        assertFalse(RouteMatcher.vehicleDeparture(state,course,nav,stop.getDouble("lat"),stop.getDouble("lng"),6,planned,planned,null));
        assertTrue(RouteMatcher.vehicleDeparture(state,course,nav,stop.getDouble("lat"),stop.getDouble("lng"),6,planned,planned,hint));
        assertFalse(RouteMatcher.vehicleDeparture(state,course,nav,stop.getDouble("lat"),stop.getDouble("lng"),6,planned,planned+1000,hint));
        stop=stops.getJSONObject(2);hint.put("stationSeq",stop.optInt("order")).put("stationId",stop.optString("id")).put("fetchedAt",planned+10000);nav.put("fraction",2).put("timestamp",planned+10000);
        assertTrue(RouteMatcher.vehicleDeparture(state,course,nav,stop.getDouble("lat"),stop.getDouble("lng"),1,planned+10000,planned,hint));
        hint.put("fetchedAt",planned-60000);assertFalse(RouteMatcher.vehicleDeparture(state,course,nav,stop.getDouble("lat"),stop.getDouble("lng"),6,planned+10000,planned,hint));
    }
    @Test public void nextTripWaitsAtSharedDepotUntilDeparture()throws Exception {
        JSONArray stops=new JSONArray(new String(getClass().getResourceAsStream("/route5-public-stops.json").readAllBytes(),StandardCharsets.UTF_8));
        JSONObject course=new JSONObject().put("stops",stops).put("turnIndex",55).put("pivotIndex",57),trip=new JSONObject().put("course",course).put("startLocation",stops.getJSONObject(0));
        JSONObject end=stops.getJSONObject(113),next=stops.getJSONObject(1);long now=100000000L,planned=now+39*60000;
        JSONObject polluted=new JSONObject().put("configured",true).put("fraction",113).put("matchedMeters",35000).put("returnConfirmed",true).put("turnPassed",true).put("timestamp",now).put("returnEvidence",new JSONArray().put(new JSONObject().put("stopId","old-1")).put(new JSONObject().put("stopId","old-2")));
        JSONObject waiting=RouteMatcher.matchTrip(trip,planned,polluted,end.getDouble("lat"),end.getDouble("lng"),8,4/3.6,RouteMatcher.bearing(stops.getJSONObject(112),end),now,null);
        assertTrue(waiting.optBoolean("waiting"));assertFalse(waiting.optBoolean("configured"));assertFalse(waiting.optBoolean("returnConfirmed"));assertFalse(waiting.optBoolean("turnPassed"));assertFalse(waiting.has("matchedMeters"));assertEquals(0,waiting.getJSONArray("returnEvidence").length());
        assertTrue(RouteMatcher.matchTrip(trip,planned,waiting,end.getDouble("lat"),end.getDouble("lng"),8,0,Double.NaN,planned+60000,null).optBoolean("waiting"));
        // A confirmed manager-adjusted schedule permits an observed departure.
        trip.put("actualStart","observed");
        JSONObject departed=RouteMatcher.matchTrip(trip,planned-360000,waiting,next.getDouble("lat"),next.getDouble("lng"),8,6,RouteMatcher.bearing(stops.getJSONObject(0),next),planned-300000,null);
        assertTrue(departed.optBoolean("configured"));assertFalse(departed.optBoolean("waiting"));assertFalse(departed.optBoolean("returnConfirmed"));assertEquals(1,departed.optDouble("fraction"),.05);
        trip.remove("actualStart");polluted.put("timestamp",planned+3600000);
        assertFalse(RouteMatcher.matchTrip(trip,planned,polluted,end.getDouble("lat"),end.getDouble("lng"),8,0,Double.NaN,planned+3603000,null).optBoolean("waiting"));
    }
    @Test public void priorityAndFreshness(){
        assertTrue(LocationFixPolicy.accept(1000,2000,1000,true,1000,5));
        assertFalse(LocationFixPolicy.accept(1000,2000,1000,false,1000,5));
        assertFalse(LocationFixPolicy.accept(12000,2000,1000,true,1000,5));
        assertFalse(LocationFixPolicy.accept(1000,1000,1000,true,1000,5));
        assertEquals(-1,LocationFixPolicy.speed(false,true,8,true,1),0);
        assertEquals(-1,LocationFixPolicy.speed(true,true,8,true,5),0);
        assertEquals(8,LocationFixPolicy.speed(true,true,8,true,1),0);
    }
    @Test public void fullCircuitWithoutTurnTimestamp()throws Exception {
        JSONArray stops=new JSONArray(new String(getClass().getResourceAsStream("/route5-public-stops.json").readAllBytes(),StandardCharsets.UTF_8));
        JSONObject course=new JSONObject().put("stops",stops).put("turnIndex",55).put("pivotIndex",57),previous=null;long time=100000000L;double last=0;
        for(int i=0;i<stops.length()-1;i++){
            JSONObject a=stops.getJSONObject(i),b=stops.getJSONObject(i+1);double length=RouteMatcher.distance(a.getDouble("lat"),a.getDouble("lng"),b);int count=(int)Math.ceil(length/25);
            for(int j=0;j<count;j++){
                double f=(double)j/count;time+=3000;
                JSONObject next=RouteMatcher.match(course,previous,a.getDouble("lat")+(b.getDouble("lat")-a.getDouble("lat"))*f,a.getDouble("lng")+(b.getDouble("lng")-a.getDouble("lng"))*f,5,length/count/3,RouteMatcher.bearing(a,b),time,false);
                assertTrue("Lost occurrence "+i+" sample "+j,next.optBoolean("configured"));assertTrue(next.getDouble("fraction")>=last);assertEquals(i+f,next.getDouble("fraction"),.3);last=next.getDouble("fraction");previous=next;
                if(i==56)assertFalse(next.optBoolean("returnConfirmed"));if(i==58)assertTrue(next.optBoolean("returnConfirmed"));
            }
        }
        assertEquals(2,previous.getJSONArray("returnEvidence").length());assertTrue(previous.optBoolean("returnConfirmed"));
        String evidence=previous.getJSONArray("returnEvidence").toString();JSONObject end=stops.getJSONObject(stops.length()-1);
        JSONObject arrival=RouteMatcher.match(course,previous,end.getDouble("lat"),end.getDouble("lng"),5,3,RouteMatcher.bearing(stops.getJSONObject(stops.length()-2),end),time+3000,false);
        assertEquals(evidence,arrival.getJSONArray("returnEvidence").toString());
    }
    @Test public void stationaryReferenceAndSlowMotionRecovery()throws Exception {
        JSONArray stops=new JSONArray(new String(getClass().getResourceAsStream("/route5-public-stops.json").readAllBytes(),StandardCharsets.UTF_8));
        JSONObject course=new JSONObject().put("stops",stops).put("turnIndex",55).put("pivotIndex",57);long now=100000000L;
        for(int index:new int[]{13,15,98,100}){
            JSONObject stop=stops.getJSONObject(index),hint=new JSONObject().put("available",true).put("source","GYEONGGI_BUS_LOCATION_V2").put("stationSeq",stop.optInt("order")).put("fetchedAt",now-17000);
            JSONObject unknown=RouteMatcher.match(course,null,stop.getDouble("lat"),stop.getDouble("lng"),8,0,Double.NaN,now,false);
            assertFalse(unknown.optBoolean("configured"));
            JSONObject found=RouteMatcher.match(course,unknown,stop.getDouble("lat"),stop.getDouble("lng"),8,0,Double.NaN,now,false,hint);
            assertTrue(found.optBoolean("configured"));assertEquals(index,found.getDouble("fraction"),.001);assertEquals(index>57,found.optBoolean("returnConfirmed"));assertEquals(now,found.getLong("timestamp"));
            hint.put("fetchedAt",now-61000);
            assertFalse(RouteMatcher.match(course,null,stop.getDouble("lat"),stop.getDouble("lng"),8,0,Double.NaN,now,false,hint).optBoolean("configured"));
        }
        JSONObject previous=null,a=stops.getJSONObject(13),b=stops.getJSONObject(14);
        for(int i=0;i<=3;i++)previous=RouteMatcher.match(course,previous,a.getDouble("lat")+(b.getDouble("lat")-a.getDouble("lat"))*i*.1,a.getDouble("lng")+(b.getDouble("lng")-a.getDouble("lng"))*i*.1,8,.5,Double.NaN,now+i*15000,false);
        assertTrue(previous.optBoolean("configured"));assertEquals(13.3,previous.getDouble("fraction"),.01);assertFalse(previous.optBoolean("returnConfirmed"));
        JSONObject inbound=stops.getJSONObject(98),hint=new JSONObject().put("available",true).put("source","GYEONGGI_BUS_LOCATION_V2").put("stationSeq",99).put("fetchedAt",now);
        course.put("pivotIndex",-1);
        assertTrue(RouteMatcher.match(course,null,inbound.getDouble("lat"),inbound.getDouble("lng"),8,0,Double.NaN,now,false,hint).optBoolean("returnConfirmed"));
    }
}
