package kr.bus70.driver;

import org.json.JSONObject;

/** Bounded per-trip proof. An earlier vehicle match is identity, never live position. */
final class DepartureEvidence {
    static boolean identityFresh(long at,long now){return at>0&&now>=at&&now-at<=20*3600000L;}
    static JSONObject update(JSONObject state,JSONObject trip,JSONObject nav,JSONObject hint,long identityAt,long planned,long time,double lat,double lng,double accuracy,double speed)throws Exception {
        JSONObject start=trip.optJSONObject("startLocation"),course=trip.optJSONObject("course");
        int turn=course==null?-1:course.optInt("turnIndex",-1);
        double fraction=nav==null?Double.NaN:nav.optDouble("fraction",Double.NaN);
        if(!state.optBoolean("seenStart")||planned<=0||time<planned||time>planned+7200000||start==null||nav==null||!nav.optBoolean("configured")||nav.optBoolean("returnConfirmed")||nav.optLong("timestamp")!=time||course==null||!Double.isFinite(fraction)||fraction<.2||fraction>=Math.min(8,turn>0?turn:8)||!Double.isFinite(accuracy)||!Double.isFinite(speed)||!Double.isFinite(lat)||!Double.isFinite(lng)||accuracy<0||accuracy>25||speed<0||speed>25||hint!=null&&"DIFFERENT".equals(hint.optString("status"))||RouteMatcher.distance(lat,lng,start)<=start.optDouble("radiusM",80)+Math.max(30,accuracy)){
            state.remove("gpsDeparture");return null;
        }
        JSONObject proof=state.optJSONObject("gpsDeparture");
        if(proof!=null){double dt=(time-proof.optLong("lastAt"))/1000.0,travel=RouteMatcher.distance(lat,lng,proof.getJSONObject("last"));if(dt<=0)return null;if(dt>15||fraction<proof.optDouble("lastFraction")-.1||travel>dt*30+2*accuracy||time-proof.getJSONObject("first").optLong("time")>180000)proof=null;}
        if(proof==null&&speed<2.8)return null;
        if(proof==null)proof=new JSONObject().put("first",new JSONObject().put("latitude",lat).put("longitude",lng).put("accuracy",accuracy).put("time",time)).put("firstFraction",fraction).put("samples",0);
        proof.put("last",new JSONObject().put("lat",lat).put("lng",lng)).put("lastAt",time).put("lastFraction",fraction).put("samples",proof.optInt("samples")+1);state.put("gpsDeparture",proof);
        JSONObject first=proof.getJSONObject("first");double seconds=(time-first.optLong("time"))/1000.0,meters=RouteMatcher.distance(lat,lng,new JSONObject().put("lat",first.optDouble("latitude")).put("lng",first.optDouble("longitude")));
        boolean ready=proof.optInt("samples")>=6&&seconds>=20&&meters>=180&&meters/seconds>=2.8&&fraction-proof.optDouble("firstFraction")>=.75;proof.put("ready",ready);
        return ready&&identityFresh(identityAt,time)?first:null;
    }
}
