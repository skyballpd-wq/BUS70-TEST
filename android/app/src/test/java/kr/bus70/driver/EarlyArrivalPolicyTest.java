package kr.bus70.driver;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.JSONArray;
import org.json.JSONObject;

public class EarlyArrivalPolicyTest {
    final long base=2000000000000L;
    double lat(double meters){return meters/6371000*180/Math.PI;}
    JSONObject trip()throws Exception{
        JSONArray stops=new JSONArray();
        for(int i=0;i<=6;i++)stops.put(new JSONObject().put("id","synthetic-"+i).put("stationId",i==2?EarlyArrivalPolicy.INBOUND_YEOKGOK:i==0?"210000298":"synthetic-"+i).put("name",i==0||i==2?"역곡역북부":"합성 정류장 "+i).put("lat",lat(i*1000)).put("lng",0));
        return new JSONObject().put("trip",2).put("actualStart","observed").put("endPlace","고강공영차고지").put("endLocation",stops.getJSONObject(6)).put("course",new JSONObject().put("pivotIndex",1).put("stops",stops));
    }
    JSONObject step(JSONObject state,JSONObject trip,long planned,int sec,double meters)throws Exception{
        return call(state,trip,planned,sec,meters,new JSONObject().put("configured",true).put("returnConfirmed",true).put("timestamp",base+sec*1000).put("fraction",meters/1000).put("matchedMeters",meters),8,0,lat(meters));
    }
    JSONObject call(JSONObject state,JSONObject trip,long planned,int sec,double meters,JSONObject nav,double accuracy,long delay,double latitude)throws Exception{
        return EarlyArrivalPolicy.update(state,trip,nav,"synthetic",trip.optString("route","5"),planned,base+sec*1000,base+sec*1000+delay,accuracy,latitude,0);
    }
    JSONObject arrive(JSONObject s,JSONObject t,long planned)throws Exception{
        for(int sec=0;sec<=160;sec+=5)step(s,t,planned,sec,1400+sec*10);
        return step(s,t,planned,162,3000);
    }
    @Test public void gateAndStopOnlyWithRestartDeduplication()throws Exception{
        JSONObject s=new JSONObject(),t=trip(),r=null;long p=base+2400000;
        for(int sec=0;sec<=150;sec+=5){r=step(s,t,p,sec,1400+sec*10);assertFalse(r.optBoolean("notify"));}
        r=step(s,t,p,160,3000);assertFalse(r.optBoolean("notify")); // first fix at stop
        r=step(s,t,p,162,3000);assertTrue(r.optBoolean("notify"));assertEquals(3,r.optInt("stopIndex"));
        EarlyArrivalPolicy.attempted(s,r,base+162000,true);
        s=new JSONObject(s.toString());assertFalse(step(s,t,p,164,3000).optBoolean("notify"));
        for(int sec=167;sec<=257;sec+=5)assertFalse(step(s,t,p,sec,3000+(sec-162)*10).optBoolean("notify"));
        step(s,t,p,262,4000);r=step(s,t,p,264,4000);assertTrue("next stop gets its own check",r.optBoolean("notify"));assertEquals(4,r.optInt("stopIndex"));
    }
    @Test public void tenMinuteBoundary()throws Exception{
        JSONObject t=trip(),r=arrive(new JSONObject(),t,base+2400000);long last=r.getLong("latestAt");
        r=arrive(new JSONObject(),t,last+600000);assertEquals(10,r.getDouble("earlyMinutes"),.001);assertTrue(r.optBoolean("notify"));
        r=arrive(new JSONObject(),t,last+599999);assertFalse(r.optBoolean("warning"));assertFalse(r.optBoolean("notify"));
    }
    @Test public void noFiveKilometerLimitAfterGate()throws Exception{
        JSONObject t=trip();JSONObject end=t.getJSONObject("course").getJSONArray("stops").getJSONObject(6);end.put("lat",lat(10000));
        assertTrue(arrive(new JSONObject(),t,base+3600000).optBoolean("notify"));
    }
    @Test public void sameNameOutboundAndMissingGateNeverQualify()throws Exception{
        JSONObject t=trip();t.getJSONObject("course").getJSONArray("stops").getJSONObject(2).put("stationId","210000298");
        assertFalse(arrive(new JSONObject(),t,base+2400000).optBoolean("available"));
    }
    @Test public void route70AfterLastInboundHwagokStopAndRouteIsolation()throws Exception{
        JSONObject t=trip().put("route","70"),s=new JSONObject();JSONArray stops=t.getJSONObject("course").getJSONArray("stops");
        stops.getJSONObject(2).put("stationId",EarlyArrivalPolicy.INBOUND_HWAGOK).put("name","화곡역5번출구");
        assertTrue(arrive(s,t,base+2400000).optBoolean("notify"));
        for(String id:new String[]{"115000604","115000052","115000051",EarlyArrivalPolicy.INBOUND_YEOKGOK}){
            stops.getJSONObject(2).put("stationId",id);assertFalse(arrive(new JSONObject(),t,base+2400000).optBoolean("available"));
        }
        stops.getJSONObject(2).put("stationId",EarlyArrivalPolicy.INBOUND_HWAGOK);
        t.put("route","5");assertFalse(arrive(new JSONObject(),t,base+2400000).optBoolean("available"));
        t.put("route","71");assertFalse(arrive(new JSONObject(),t,base+2400000).optBoolean("available"));
        t.put("route","70");t.getJSONObject("course").put("pivotIndex",4);assertFalse(arrive(new JSONObject(),t,base+2400000).optBoolean("available"));
    }
    @Test public void excludesUnstartedCompleteStaleWrongDirectionPoorFixAndNonDepot()throws Exception{
        for(int mode=0;mode<9;mode++){
            JSONObject t=trip(),s=new JSONObject();arrive(s,t,base+2400000);
            JSONObject n=new JSONObject().put("configured",true).put("returnConfirmed",true).put("timestamp",base+164000).put("fraction",3).put("matchedMeters",3000);
            if(mode==0)t.remove("actualStart");if(mode==1)t.put("actualEnd","done");if(mode==2)t.put("endPlace","합성 영업종점").put("deadheadDestination","고강공영차고지");
            if(mode==3)n.put("returnConfirmed",false);if(mode==4)n.put("configured",false);if(mode==5)t.remove("endLocation");
            JSONObject r=call(s,t,base+2400000,164,3000,n,mode==7?70:8,mode==6?20000:0,lat(mode==8?3300:3000));
            assertFalse("mode "+mode,r.optBoolean("available"));assertFalse(r.optBoolean("notify"));
        }
    }
    @Test public void stoppedJumpGapTripChangeAndDepotNeedNoWarning()throws Exception{
        JSONObject t=trip(),s=new JSONObject(),r=null;
        for(int sec=0;sec<=180;sec+=5)r=step(s,t,base+2400000,sec,3000);assertFalse(r.optBoolean("available"));
        s=new JSONObject();arrive(s,t,base+2400000);r=step(s,t,base+2400000,164,4000);assertFalse(r.optBoolean("available"));
        s=new JSONObject();arrive(s,t,base+2400000);r=step(s,t,base+2400000,200,3000);assertFalse(r.optBoolean("available"));
        s=new JSONObject();arrive(s,t,base+2400000);t.put("trip",3);r=step(s,t,base+2400000,164,3000);assertFalse(r.optBoolean("available"));
        t=trip();s=new JSONObject();arrive(s,t,base+2400000);assertFalse(step(s,t,base+2400000,462,6000).optBoolean("notify"));
    }
    @Test public void failedVoiceRetriesOnlyAtSameStopAndNeverOnDuplicateFix()throws Exception{
        JSONObject s=new JSONObject(),t=trip(),r=arrive(s,t,base+2400000);
        EarlyArrivalPolicy.attempted(s,r,base+162000,false);
        assertFalse(step(s,t,base+2400000,164,3000).optBoolean("notify"));
        assertTrue(step(s,t,base+2400000,167,3000).optBoolean("notify"));
        assertFalse(step(s,t,base+2400000,170,3200).optBoolean("notify"));
        s=new JSONObject();for(int i=0;i<10;i++)assertFalse(step(s,t,base+2400000,0,3000).optBoolean("notify"));
    }
}
