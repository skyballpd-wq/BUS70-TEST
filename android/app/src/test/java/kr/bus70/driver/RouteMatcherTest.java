package kr.bus70.driver;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.*;
import java.nio.charset.StandardCharsets;

public class RouteMatcherTest {
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
}
