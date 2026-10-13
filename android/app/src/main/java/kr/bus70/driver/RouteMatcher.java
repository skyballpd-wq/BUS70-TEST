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
    static JSONObject match(JSONObject course,JSONObject previous,double lat,double lng,double accuracy,double speed,double heading,long timestamp,boolean turnRecorded) throws Exception {
        JSONObject held=previous==null?new JSONObject():new JSONObject(previous.toString());held.put("configured",false);
        JSONArray stops=course==null?null:course.optJSONArray("stops");if(stops==null||stops.length()<2||accuracy>60)return held;
        double dt=previous==null?0:(timestamp-previous.optLong("timestamp"))/1000.0;
        if(previous!=null&&dt<=0)return held;
        boolean continuous=previous!=null&&previous.has("matchedMeters")&&dt<=120;
        double old=previous==null?0:previous.optDouble("matchedMeters"),meters=0;
        ArrayList<double[]> candidates=new ArrayList<>();
        for(int i=0;i<stops.length()-1;i++){
            JSONObject a=stops.getJSONObject(i),b=stops.getJSONObject(i+1);double length=distance(a.optDouble("lat"),a.optDouble("lng"),b),base=meters;meters+=length;
            if(turnRecorded&&course.optInt("turnIndex",-1)>=0&&i<course.optInt("turnIndex"))continue;
            double scale=Math.cos(lat*Math.PI/180),ax=(a.optDouble("lng")-lng)*111320*scale,ay=(a.optDouble("lat")-lat)*110540,bx=(b.optDouble("lng")-lng)*111320*scale,by=(b.optDouble("lat")-lat)*110540,dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
            double t=den>0?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0,d=Math.hypot(ax+t*dx,ay+t*dy),along=base+length*t,courseHeading=bearing(a,b);
            if(d>160||continuous&&(along<old-100||along>old+Math.max(160,dt*40)))continue;
            double diff=speed>2&&Double.isFinite(heading)?Math.abs((heading-courseHeading+540)%360-180):0;
            if(!continuous&&diff>105)continue;
            double score=d+diff*.65+(continuous?Math.abs(along-old)*.025:0);
            candidates.add(new double[]{i,t,d,along,score});
        }
        candidates.sort(Comparator.comparingDouble(v->v[4]));if(candidates.isEmpty())return held;
        double[] best=candidates.get(0);
        if(!continuous)for(double[] other:candidates)if(Math.abs(other[3]-best[3])>500&&other[4]-best[4]<30)return held;
        double fraction=Math.max(continuous?previous.optDouble("fraction"):0,best[0]+best[1]);
        int index=Math.min(stops.length()-1,(int)Math.floor(fraction)),pivot=course.optInt("pivotIndex",course.optInt("turnIndex",-1));
        boolean returning=previous!=null&&previous.optBoolean("returnConfirmed")||pivot>=0&&fraction>pivot+.15;
        JSONObject result=new JSONObject().put("configured",true).put("fraction",fraction).put("matchedIndex",index).put("matchedMeters",Math.max(continuous?old:0,best[3])).put("timestamp",timestamp).put("returnConfirmed",returning).put("turnPassed",course.optInt("turnIndex",-1)>=0&&fraction>course.optInt("turnIndex")+.15);
        // Only two distinct observed return stops are kept, as event evidence.
        JSONArray evidence=previous==null?new JSONArray():previous.optJSONArray("returnEvidence");if(evidence==null)evidence=new JSONArray();
        JSONObject stop=stops.getJSONObject(index);
        if(returning&&index<stops.length()-1&&distance(lat,lng,stop)<=Math.max(35,accuracy)&& (evidence.length()==0||!evidence.getJSONObject(evidence.length()-1).optString("stopId").equals(stop.optString("id")))){
            evidence.put(new JSONObject().put("stopId",stop.optString("id")).put("order",stop.optInt("order")).put("observedAt",timestamp).put("latitude",lat).put("longitude",lng).put("accuracy",accuracy));
            while(evidence.length()>2)evidence.remove(0);
        }
        result.put("returnEvidence",evidence);return result;
    }
}
