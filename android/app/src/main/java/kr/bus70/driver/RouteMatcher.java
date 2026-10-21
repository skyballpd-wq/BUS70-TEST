package kr.bus70.driver;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Comparator;

/** Ordered stop occurrences, not a nearest-name or log-phase lookup. No history archive. */
final class RouteMatcher {
    static double distance(double lat,double lng,JSONObject p) {
        double r=Math.PI/180,dl=(p.optDouble("lat")-lat)*r,dn=(p.optDouble("lng")-lng)*r;
        double v=Math.pow(Math.sin(dl/2),2)+Math.cos(lat*r)*Math.cos(p.optDouble("lat")*r)*Math.pow(Math.sin(dn/2),2);
        return 6371000*2*Math.atan2(Math.sqrt(v),Math.sqrt(Math.max(0,1-v)));
    }
    static double bearing(JSONObject a,JSONObject b){
        double r=Math.PI/180,dl=(b.optDouble("lng")-a.optDouble("lng"))*r,y=Math.sin(dl)*Math.cos(b.optDouble("lat")*r),x=Math.cos(a.optDouble("lat")*r)*Math.sin(b.optDouble("lat")*r)-Math.sin(a.optDouble("lat")*r)*Math.cos(b.optDouble("lat")*r)*Math.cos(dl);
        return (Math.atan2(y,x)/r+360)%360;
    }
    static boolean vehicleDeparture(JSONObject state,JSONObject course,JSONObject nav,double lat,double lng,double speed,long timestamp,long planned,JSONObject hint)throws Exception {
        if(planned<=0||timestamp<planned)return false;
        if(nav==null||!nav.optBoolean("configured")||nav.optBoolean("returnConfirmed")||nav.optLong("timestamp")!=timestamp||hint==null||!hint.optBoolean("available")||!"GYEONGGI_BUS_LOCATION_V2".equals(hint.optString("source"))||hint.optLong("fetchedAt")<planned||timestamp-hint.optLong("fetchedAt")>60000||hint.optLong("fetchedAt")>timestamp+5000)return false;
        JSONArray stops=course==null?null:course.optJSONArray("stops");if(stops==null)return false;
        int index=-1;for(int i=1;i<Math.min(5,stops.length());i++){JSONObject stop=stops.getJSONObject(i);String id=hint.optString("stationId");if(stop.optInt("order")==hint.optInt("stationSeq")&&distance(lat,lng,stop)<=120&&(id.isEmpty()||id.equals(stop.optString("stationId",stop.optString("id")))||stop.optString("id").endsWith("-"+id)))index=i;}
        int turn=course.optInt("turnIndex",-1);if(index<1||turn>0&&index>=turn||Math.abs(nav.optDouble("fraction")-index)>1.5)return false;
        JSONObject prior=state.optJSONObject("departureVehicle");boolean advanced=prior!=null&&timestamp-prior.optLong("at")<=90000&&index>prior.optInt("index");
        if(prior==null||timestamp-prior.optLong("at")>90000)state.put("departureVehicle",new JSONObject().put("index",index).put("at",timestamp));
        return speed>=2.8||advanced;
    }
    static JSONObject matchTrip(JSONObject trip,long plannedStart,JSONObject previous,double lat,double lng,double accuracy,double speed,double heading,long timestamp,JSONObject hint) throws Exception {
        JSONObject course=trip.optJSONObject("course"),start=trip.optJSONObject("startLocation");
        JSONArray stops=course==null?null:course.optJSONArray("stops");
        if(start==null&&stops!=null)start=stops.optJSONObject(0);
        boolean observed=!trip.optString("actualStart").isEmpty()||!trip.optString("actualTurn").isEmpty()||!trip.optString("actualEnd").isEmpty();
        JSONArray evidence=previous==null?null:previous.optJSONArray("returnEvidence");
        boolean recovering=previous!=null&&previous.optBoolean("returnConfirmed")&&evidence!=null&&evidence.length()==2&&timestamp>=previous.optLong("timestamp")&&timestamp-previous.optLong("timestamp")<=120000;
        boolean atStart=start!=null&&distance(lat,lng,start)<=start.optDouble("radiusM",80)+Math.max(30,accuracy);
        boolean vehicleMatched=false;
        boolean knownVehicle=DepartureEvidence.identityFresh(trip.optLong("vehicleIdentityAt"),timestamp);
        if(hint!=null&&hint.optBoolean("available")&&"GYEONGGI_BUS_LOCATION_V2".equals(hint.optString("source"))&&timestamp-hint.optLong("fetchedAt")<=60000&&hint.optLong("fetchedAt")<=timestamp+5000&&stops!=null){for(int i=1;i<stops.length()-1;i++){JSONObject stop=stops.getJSONObject(i);String id=hint.optString("stationId");if(stop.optInt("order")==hint.optInt("stationSeq")&&distance(lat,lng,stop)<=120&&(id.isEmpty()||id.equals(stop.optString("stationId",stop.optString("id")))||stop.optString("id").endsWith("-"+id)))vehicleMatched=true;}}
        if(!observed&&plannedStart>0&&(timestamp<plannedStart||atStart&&!recovering||!recovering&&!vehicleMatched&&!knownVehicle))return new JSONObject().put("configured",false).put("waiting",true).put("returnConfirmed",false).put("turnPassed",false).put("returnEvidence",new JSONArray());
        if(previous!=null&&previous.optBoolean("waiting"))previous=null;
        return match(course,previous,lat,lng,accuracy,speed,heading,timestamp,!trip.optString("actualTurn").isEmpty(),hint);
    }
    static JSONObject match(JSONObject course,JSONObject previous,double lat,double lng,double accuracy,double speed,double heading,long timestamp,boolean turnRecorded) throws Exception {
        return match(course,previous,lat,lng,accuracy,speed,heading,timestamp,turnRecorded,null);
    }
    static JSONObject match(JSONObject course,JSONObject previous,double lat,double lng,double accuracy,double speed,double heading,long timestamp,boolean turnRecorded,JSONObject hint) throws Exception {
        JSONObject held=previous==null?new JSONObject():new JSONObject(previous.toString());held.put("configured",false);
        JSONArray stops=course==null?null:course.optJSONArray("stops");if(stops==null||stops.length()<2||accuracy>60)return held;
        double dt=previous==null?0:(timestamp-previous.optLong("timestamp"))/1000.0;
        if(previous!=null&&dt<=0)return held;
        boolean continuous=previous!=null&&previous.has("matchedMeters")&&dt<=120;
        double old=previous==null?0:previous.optDouble("matchedMeters"),meters=0;
        JSONObject motion=previous==null?null:previous.optJSONObject("motion");
        double elapsed=motion==null?0:(timestamp-motion.optLong("timestamp"))/1000.0,travel=motion==null?0:distance(lat,lng,motion);
        double courseValue=speed>2&&Double.isFinite(heading)?heading:Double.NaN;
        JSONObject here=new JSONObject().put("lat",lat).put("lng",lng).put("accuracy",accuracy).put("timestamp",timestamp);
        if(!Double.isFinite(courseValue)&&elapsed>=3&&elapsed<=120&&travel>=Math.max(25,(motion.optDouble("accuracy")+accuracy)*1.5)&&travel/elapsed<40)courseValue=bearing(motion,here);
        if(motion==null||elapsed>120||travel>=Math.max(25,(motion.optDouble("accuracy")+accuracy)*1.5))motion=here;
        held.put("motion",motion);
        int reference=-1;
        if(hint!=null&&hint.optBoolean("available")&&"GYEONGGI_BUS_LOCATION_V2".equals(hint.optString("source"))&&timestamp-hint.optLong("fetchedAt")<=60000&&hint.optLong("fetchedAt")<=timestamp+5000){
            for(int i=0;i<stops.length();i++){
                JSONObject stop=stops.getJSONObject(i);String id=hint.optString("stationId");
                if(stop.optInt("order")==hint.optInt("stationSeq")&&distance(lat,lng,stop)<=500&&(id.isEmpty()||id.equals(stop.optString("stationId",stop.optString("id")))||stop.optString("id").endsWith("-"+id)))reference=i;
            }
        }
        ArrayList<double[]> candidates=new ArrayList<>();
        for(int i=0;i<stops.length()-1;i++){
            JSONObject a=stops.getJSONObject(i),b=stops.getJSONObject(i+1);double length=distance(a.optDouble("lat"),a.optDouble("lng"),b),base=meters;meters+=length;
            if(turnRecorded&&course.optInt("turnIndex",-1)>=0&&i<course.optInt("turnIndex"))continue;
            double scale=Math.cos(lat*Math.PI/180),ax=(a.optDouble("lng")-lng)*111320*scale,ay=(a.optDouble("lat")-lat)*110540,bx=(b.optDouble("lng")-lng)*111320*scale,by=(b.optDouble("lat")-lat)*110540,dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
            double t=den>0?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0,d=Math.hypot(ax+t*dx,ay+t*dy),along=base+length*t,courseHeading=bearing(a,b);
            if(d>160||continuous&&(along<old-100||along>old+Math.max(160,dt*40)))continue;
            double diff=Double.isFinite(courseValue)?Math.abs((courseValue-courseHeading+540)%360-180):0;
            if(!continuous&&diff>105)continue;
            double score=d+diff*.65+(continuous?Math.abs(along-old)*.025:0);
            candidates.add(new double[]{i,t,d,along,score});
        }
        candidates.sort(Comparator.comparingDouble(v->v[4]));if(candidates.isEmpty())return held;
        String source="GPS";
        if(!continuous&&reference>=0){
            ArrayList<double[]> corroborated=new ArrayList<>();
            for(double[] v:candidates)if(Math.abs(v[0]+v[1]-reference)<=2&&v[2]<=candidates.get(0)[2]+40)corroborated.add(v);
            if(!corroborated.isEmpty()){candidates=corroborated;source="GPS_GBIS";}
        }
        double[] best=candidates.get(0);
        if(!continuous)for(double[] other:candidates)if(Math.abs(other[3]-best[3])>500&&other[4]-best[4]<30)return held;
        double fraction=Math.max(continuous?previous.optDouble("fraction"):0,best[0]+best[1]);
        int index=Math.min(stops.length()-1,(int)Math.floor(fraction)),pivot=course.optInt("pivotIndex",-1);
        if(pivot<0)pivot=course.optInt("turnIndex",-1);
        boolean returning=continuous&&previous.optBoolean("returnConfirmed")||pivot>=0&&fraction>pivot+.15;
        JSONObject result=new JSONObject().put("configured",true).put("motion",motion).put("matchSource",source).put("fraction",fraction).put("matchedIndex",index).put("matchedMeters",Math.max(continuous?old:0,best[3])).put("timestamp",timestamp).put("returnConfirmed",returning).put("turnPassed",course.optInt("turnIndex",-1)>=0&&fraction>course.optInt("turnIndex")+.15);
        // Only two distinct observed return stops are kept, as event evidence.
        JSONArray evidence=!continuous?new JSONArray():previous.optJSONArray("returnEvidence");if(evidence==null)evidence=new JSONArray();
        JSONObject stop=stops.getJSONObject(index);
        if(returning&&index<stops.length()-1&&distance(lat,lng,stop)<=Math.max(35,accuracy)&& (evidence.length()==0||!evidence.getJSONObject(evidence.length()-1).optString("stopId").equals(stop.optString("id")))){
            evidence.put(new JSONObject().put("stopId",stop.optString("id")).put("order",stop.optInt("order")).put("observedAt",timestamp).put("latitude",lat).put("longitude",lng).put("accuracy",accuracy));
            while(evidence.length()>2)evidence.remove(0);
        }
        result.put("returnEvidence",evidence);return result;
    }
}
