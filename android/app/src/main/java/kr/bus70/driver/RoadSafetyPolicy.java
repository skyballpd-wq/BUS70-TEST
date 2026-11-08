package kr.bus70.driver;

import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/** Verified hazard assistance, independent of WebView visibility. Never records a trip event. */
final class RoadSafetyPolicy {
    static JSONObject evaluate(JSONObject schedule,JSONObject trip,JSONObject nav,long now,long fix,
                               double lat,double lng,double accuracy,double speed,double heading) throws Exception {
        if(!schedule.optBoolean("roadSafetyEnabled")||trip.optString("actualStart").isEmpty()||!trip.optString("actualEnd").isEmpty()||nav==null||!nav.optBoolean("configured")||nav.optBoolean("retained"))return null;
        if(now-fix<0||now-fix>6000||!Double.isFinite(lat)||!Double.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Double.isFinite(accuracy)||accuracy<0||accuracy>30||!Double.isFinite(speed)||speed<0||speed>55||!Double.isFinite(heading)||heading<0||heading>=360)return null;
        JSONObject data=schedule.optJSONObject("roadSafety"),course=trip.optJSONObject("course");
        JSONArray zones=data==null?null:data.optJSONArray("zones"),stops=course==null?null:course.optJSONArray("stops");
        int index=nav.optInt("matchedIndex",-1);if(zones==null||stops==null||index<0||index>=stops.length())return null;
        int order=stops.getJSONObject(index).optInt("order",-100);
        ZonedDateTime clock=Instant.ofEpochMilli(now).atZone(ZoneId.of("Asia/Seoul"));String date=clock.toLocalDate().toString();int minute=clock.getHour()*60+clock.getMinute();
        JSONObject best=null;double bestDistance=Double.POSITIVE_INFINITY;boolean bestOver=false;
        for(int i=0;i<zones.length();i++){
            JSONObject z=zones.optJSONObject(i);if(z==null)continue;
            double zlat=z.optDouble("lat",Double.NaN),zlng=z.optDouble("lng",Double.NaN),bearing=z.optDouble("bearing",Double.NaN),limit=z.optDouble("speedLimit",Double.NaN);
            String from=z.optString("validFrom"),through=z.optString("validThrough"),type=z.optString("type");
            if(!z.optBoolean("verified")||z.optString("id").isEmpty()||z.optString("source").isEmpty()||!z.optString("route").equals(schedule.optString("route"))||!from.matches("\\d{4}-\\d{2}-\\d{2}")||!through.matches("\\d{4}-\\d{2}-\\d{2}")||date.compareTo(from)<0||date.compareTo(through)>0||!(type.equals("SCHOOL")||type.equals("CAMERA"))||!Double.isFinite(zlat)||!Double.isFinite(zlng)||Math.abs(zlat)>90||Math.abs(zlng)>180||!Double.isFinite(bearing)||bearing<0||bearing>=360||!Double.isFinite(limit)||limit<10||limit>120||Math.abs(z.optDouble("stopOrder",-1000)-order)>1)continue;
            if(Math.abs((heading-bearing+540)%360-180)>40)continue;
            if(!z.isNull("startMinute")||!z.isNull("endMinute")){
                int start=z.optInt("startMinute",-1),end=z.optInt("endMinute",-1);if(start<0||start>=1440||end<0||end>=1440)continue;
                if(!(start<=end?minute>=start&&minute<end:minute>=start||minute<end))continue;
            }
            double north=Math.toRadians(zlat-lat)*6371000,east=Math.toRadians(zlng-lng)*6371000*Math.cos(Math.toRadians(lat)),angle=Math.toRadians(heading),forward=north*Math.cos(angle)+east*Math.sin(angle),lateral=Math.abs(-north*Math.sin(angle)+east*Math.cos(angle));
            double distance=RouteMatcher.distance(lat,lng,z);boolean over=speed*3.6>limit;
            if(forward< -15||lateral>35||distance>Math.max(180,Math.min(400,speed*15)))continue;
            if(best!=null&&(bestOver&&!over||bestOver==over&&bestDistance<=distance))continue;
            String shown=String.valueOf((int)limit);
            best=new JSONObject().put("key",z.getString("id")+"|"+(over?"over":"approach")).put("cooldownMs",over?20000:180000).put("message",over?"제한속도 "+shown+"킬로미터입니다. 속도를 줄여 주세요.":(type.equals("SCHOOL")?"전방 어린이보호구역입니다. ":"전방 속도제한 구간입니다. ")+"제한속도 "+shown+"킬로미터입니다.");bestDistance=distance;bestOver=over;
        }
        return best;
    }
}
