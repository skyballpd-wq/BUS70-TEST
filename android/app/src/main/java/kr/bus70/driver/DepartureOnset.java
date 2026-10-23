package kr.bus70.driver;

import org.json.JSONObject;

/** Remember measured movement at the origin; never authorizes departure itself. */
final class DepartureOnset {
    static void update(JSONObject state, JSONObject start, long planned, long at,
                       double lat, double lng, double accuracy, double speed, double heading) throws Exception {
        JSONObject proof=state.optJSONObject("departureOnset");
        boolean valid=state.optBoolean("seenStart")&&start!=null&&planned>0&&at>=planned&&at<=planned+7200000
                &&Double.isFinite(lat)&&Double.isFinite(lng)&&Double.isFinite(accuracy)&&accuracy>=0&&accuracy<=25
                &&Double.isFinite(speed)&&speed>=0&&speed<=25;
        double bearing=start==null?Double.NaN:start.optDouble("departureBearing",Double.NaN);
        if(speed>=1.5&&Double.isFinite(bearing)&&(!Double.isFinite(heading)||Math.abs((heading-bearing+540)%360-180)>75))valid=false;
        if(proof!=null){
            double dt=(at-proof.optLong("lastAt"))/1000.0;
            if(dt<=0)return;
            if(dt>15||at-proof.getJSONObject("first").optLong("time")>180000||RouteMatcher.distance(lat,lng,proof.getJSONObject("last"))>dt*30+2*accuracy)valid=false;
        }
        if(!valid){state.remove("departureOnset");return;}
        double radius=start.optDouble("radiusM",80);
        if(proof==null&&speed>=2.8&&RouteMatcher.distance(lat,lng,start)<=radius){
            proof=new JSONObject().put("first",new JSONObject().put("latitude",lat).put("longitude",lng).put("accuracy",accuracy).put("time",at));
        }
        if(proof==null)return;
        JSONObject first=proof.getJSONObject("first");
        double moved=RouteMatcher.distance(lat,lng,new JSONObject().put("lat",first.optDouble("latitude")).put("lng",first.optDouble("longitude")));
        if(speed<1.5&&moved<Math.max(12,accuracy)&&at-first.optLong("time")>15000){state.remove("departureOnset");return;}
        proof.put("last",new JSONObject().put("lat",lat).put("lng",lng)).put("lastAt",at).put("moved",Math.max(moved,proof.optDouble("moved",0)));
        state.put("departureOnset",proof);
    }
    static JSONObject first(JSONObject state, JSONObject fallback) throws Exception {
        JSONObject proof=state.optJSONObject("departureOnset");
        if(proof==null||proof.optDouble("moved")<20)return fallback;
        JSONObject first=proof.getJSONObject("first");
        return first.optLong("time")<=fallback.optLong("time")&&fallback.optLong("time")-first.optLong("time")<=180000?first:fallback;
    }
}
