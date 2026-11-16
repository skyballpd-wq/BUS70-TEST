package kr.bus70.driver;

import org.json.JSONObject;

/** Ordered checkpoint visits. A departure needs measured movement after the visit. */
final class ControlPointEvidence {
    static JSONObject update(JSONObject state, JSONObject trip, JSONObject nav, long at,
            double lat, double lng, double accuracy, double speed, double heading) throws Exception {
        JSONObject point=trip.optJSONObject("controlLocation"),path=trip.optJSONObject("course");
        String purpose=trip.optString("controlPurpose");
        boolean departure=purpose.matches(".*(전철|연계|출발).*"),hasTurn=!trip.optString("turnPlace").isEmpty()||!trip.optString("turnTime").isEmpty();
        int order=path==null?-1:path.optInt("controlIndex",-1),turn=path==null?-1:path.optInt("turnIndex",-1);
        boolean afterTurn=hasTurn&&(departure||order>turn);
        double fraction=nav==null?Double.NaN:nav.optDouble("fraction",Double.NaN);
        boolean ordered=order>=0&&nav!=null&&nav.optBoolean("configured")&&!nav.optBoolean("retained")&&!nav.optBoolean("waiting")&&Math.abs(fraction-order)<=1.5;
        if(trip.optString("actualStart").isEmpty()||!trip.optString("actualEnd").isEmpty()||!trip.optString("actualControl").isEmpty()||point==null||afterTurn&&trip.optString("actualTurn").isEmpty()||departure&&!ordered||!Double.isFinite(accuracy)||accuracy<0||accuracy>60){state.remove("controlVisit");return null;}
        JSONObject s=state.optJSONObject("controlVisit");
        if(s!=null&&at<=s.optLong("at"))return null;
        if(s==null||at-s.optLong("at")>15000)s=new JSONObject();
        s.put("at",at);state.put("controlVisit",s);
        double d=RouteMatcher.distance(lat,lng,point),radius=point.optDouble("radiusM",80);
        JSONObject fix=new JSONObject().put("latitude",lat).put("longitude",lng).put("accuracy",accuracy).put("time",at);
        if(!departure){
            if(d<=radius&&heading(point,"approachBearing",speed,heading)){
                if(s.optInt("inside")==0)s.put("fix",fix);
                s.put("inside",s.optInt("inside")+1);if(s.optInt("inside")>=2)return s.optJSONObject("fix");
            }else state.remove("controlVisit");
            return null;
        }
        if(d<=radius&&heading(point,"approachBearing",speed,heading)){
            s.put("inside",s.optInt("inside")+1).put("outside",0);if(s.optInt("inside")>=2)s.put("visited",true);
        }
        boolean forward=ordered&&fraction>=order&&Double.isFinite(heading)&&Double.isFinite(point.optDouble("departureBearing",Double.NaN))&&heading(point,"departureBearing",speed,heading)&&Double.isFinite(speed)&&speed>=1.5;
        if(s.optBoolean("visited")&&forward){
            if(!s.has("motion"))s.put("motion",fix);
            if(d>radius+Math.max(20,accuracy)){s.put("outside",s.optInt("outside")+1);if(s.optInt("outside")>=2)return s.optJSONObject("motion");}
        }else {s.put("outside",0);s.remove("motion");}
        return null;
    }
    private static boolean heading(JSONObject p,String key,double speed,double heading){
        double target=p.optDouble(key,Double.NaN);
        return !Double.isFinite(target)||!Double.isFinite(heading)||speed<1.5||Math.abs((heading-target+540)%360-180)<=80;
    }
}
