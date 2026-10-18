package kr.bus70.driver;

import org.json.JSONArray;
import org.json.JSONObject;

/** Read-only advisory; checkpoints are ordered stop occurrences, never stop names. */
final class EarlyArrivalPolicy {
    static final String INBOUND_KKACHIUL="212000105";
    static final String INBOUND_HWAGOK="115000108";
    static final String MESSAGE="차고지에 예정 시각보다 10분 이상 일찍 도착할 것으로 예상됩니다. 배차 시간을 확인하고 안전하게 운행하세요.";
    static void resetMotion(JSONObject state){state.remove("samples");state.remove("candidate");}
    static JSONObject update(JSONObject state,JSONObject trip,JSONObject nav,String binding,String route,long planned,long fix,long now,double accuracy,double lat,double lng)throws Exception {
        String station="5".equals(route)?INBOUND_KKACHIUL:"70".equals(route)?INBOUND_HWAGOK:"";
        String gateName="70".equals(route)?"하행 화곡역5번출구":"하행 까치울역5번출구";
        String key="stops-v4|"+route+"|"+station+"|"+binding+"|"+trip.optInt("trip")+"|"+planned+"|"+trip.optString("actualStart");
        if(!key.equals(state.optString("key"))){for(String k:new String[]{"samples","candidate","checkedIndex","lastAttemptAt","attemptIndex"})state.remove(k);state.put("key",key);}
        JSONObject out=new JSONObject().put("available",false).put("timestamp",fix).put("trip",trip.optInt("trip")).put("plannedAt",planned).put("warning",false).put("notify",false);
        if(station.isEmpty()){resetMotion(state);return out.put("reason","노선별 전착 안내 기준 미등록");}
        out.put("route",route).put("gateStationId",station);
        JSONObject course=trip.optJSONObject("course");JSONArray stops=course==null?null:course.optJSONArray("stops");
        String end=trip.optString("endPlace").replaceAll("\\s","");
        boolean depot=end.contains("고강")&&end.endsWith("차고지")&&(trip.optString("deadheadDestination").isEmpty()||trip.optString("deadheadDestination").equals(trip.optString("endPlace")));
        boolean active=!trip.optString("actualStart").isEmpty()&&trip.optString("actualEnd").isEmpty();
        boolean valid=depot&&active&&planned>0&&nav!=null&&nav.optBoolean("configured")&&!nav.optBoolean("waiting")&&nav.optBoolean("returnConfirmed")&&nav.optLong("timestamp")==fix&&now-fix>=-5000&&now-fix<=10000&&accuracy>=0&&accuracy<=40&&Double.isFinite(lat)&&Double.isFinite(lng)&&stops!=null&&stops.length()>2;
        if(!valid){resetMotion(state);return out.put("reason",!depot?"고강차고지 도착계획 확인 필요":!active?"운행 중 출발 확인 필요":"최신 하행 위치 확인 중");}
        JSONObject endpoint=trip.optJSONObject("endLocation"),last=stops.getJSONObject(stops.length()-1);
        if(endpoint==null||!Double.isFinite(endpoint.optDouble("lat"))||!Double.isFinite(endpoint.optDouble("lng"))||RouteMatcher.distance(last.optDouble("lat"),last.optDouble("lng"),endpoint)>100){resetMotion(state);return out.put("reason","차고지 기준점 확인 필요");}
        double[] positions=new double[stops.length()];int gate=-1;
        for(int i=0;i<stops.length();i++){
            JSONObject stop=stops.getJSONObject(i);
            if(!Double.isFinite(stop.optDouble("lat"))||!Double.isFinite(stop.optDouble("lng"))){resetMotion(state);return out.put("reason","정류장 좌표 확인 필요");}
            if(i>0){JSONObject a=stops.getJSONObject(i-1);positions[i]=positions[i-1]+RouteMatcher.distance(a.optDouble("lat"),a.optDouble("lng"),stop);}
            if(station.equals(stop.optString("stationId"))||station.equals(stop.optString("id"))||stop.optString("id").endsWith("-"+station))gate=i;
        }
        double meters=nav.optDouble("matchedMeters",Double.NaN),fraction=nav.optDouble("fraction",Double.NaN),remaining=positions[stops.length()-1]-meters;
        int pivot=course.optInt("pivotIndex",-1);if(pivot<0)pivot=course.optInt("turnIndex",-1);
        if(gate<0||gate<=pivot||pivot<0||gate>=stops.length()-2){resetMotion(state);return out.put("reason",gateName+" 기준점 확인 필요");}
        if(!Double.isFinite(remaining)||!Double.isFinite(fraction)||meters<0||remaining<=0||RouteMatcher.distance(lat,lng,endpoint)<=80){resetMotion(state);return out.put("reason","차고지 도착 구간 · 안내 종료");}
        JSONArray samples=state.optJSONArray("samples");if(samples==null)samples=new JSONArray();JSONObject previous=samples.optJSONObject(samples.length()-1);
        if(previous!=null&&(fix-previous.optLong("at")>30000||fix<previous.optLong("at")||meters<previous.optDouble("meters")-50||meters-previous.optDouble("meters")>Math.max(80,(fix-previous.optLong("at"))*.025+accuracy*2))){samples=new JSONArray();state.remove("candidate");previous=null;}
        if(previous==null||fix-previous.optLong("at")>=5000)samples.put(new JSONObject().put("at",fix).put("meters",meters));
        while(samples.length()>1&&fix-samples.getJSONObject(0).optLong("at")>300000)samples.remove(0);state.put("samples",samples);
        if(fraction<=gate+.15||meters<=positions[gate]+40){state.remove("candidate");return out.put("reason",gateName+" 통과 후 정류장별 확인");}
        int checkpoint=-1;double closest=Double.POSITIVE_INFINITY;
        for(int i=gate+1;i<stops.length()-1;i++){
            double distance=RouteMatcher.distance(lat,lng,stops.getJSONObject(i));
            if(distance<=50&&Math.abs(fraction-i)<=.35&&distance<closest){checkpoint=i;closest=distance;}
        }
        JSONObject candidate=state.optJSONObject("candidate");
        if(checkpoint<0){state.remove("candidate");return out.put("reason","다음 정류장 도착 시 조기 도착 확인");}
        out.put("stopIndex",checkpoint).put("stopName",stops.getJSONObject(checkpoint).optString("name"));
        if(candidate==null||candidate.optInt("index")!=checkpoint||fix-candidate.optLong("lastAt")>15000||fix<candidate.optLong("lastAt"))candidate=new JSONObject().put("index",checkpoint).put("since",fix);
        candidate.put("lastAt",fix);state.put("candidate",candidate);
        if(fix-candidate.optLong("since")<1500)return out.put("reason","정류장 도착 위치 확인 중");
        JSONObject first=samples.optJSONObject(0),recent=first;
        if(first==null||fix-first.optLong("at")<120000)return out.put("reason","최근 이동 자료 수집 중");
        for(int i=0;i<samples.length();i++)if(fix-samples.getJSONObject(i).optLong("at")>=60000)recent=samples.getJSONObject(i);
        double travel=meters-first.optDouble("meters"),recentTravel=meters-recent.optDouble("meters");
        double average=travel/((fix-first.optLong("at"))/1000.0),near=recentTravel/((fix-recent.optLong("at"))/1000.0),rate=Math.min(average,near);
        if(travel<250||recentTravel<100||!Double.isFinite(rate)||rate<2||rate>22.22)return out.put("reason","정차·이동 자료 추가 확인 중");
        long duration=(long)Math.ceil(remaining/rate*1000),margin=Math.max(120000L,(long)Math.ceil(duration*.25));
        long predicted=now+duration,conservative=predicted+margin;double early=(planned-conservative)/60000.0;
        boolean risk=early>=10,unchecked=checkpoint>state.optInt("checkedIndex",-1);
        boolean due=risk&&unchecked&&(state.optInt("attemptIndex",-1)!=checkpoint||now-state.optLong("lastAttemptAt")>=5000);
        if(!risk)state.put("checkedIndex",Math.max(checkpoint,state.optInt("checkedIndex",-1)));
        return out.put("available",true).put("predictedAt",predicted).put("latestAt",conservative).put("remainingM",Math.round(remaining)).put("earlyMinutes",early).put("warning",risk).put("notify",due).put("message",risk?MESSAGE:"").put("reason","정류장 도착 · 최근 2~5분 이동·정차 기준 추정");
    }
    static void attempted(JSONObject state,JSONObject result,long now,boolean accepted)throws Exception{
        state.put("lastAttemptAt",now).put("attemptIndex",result.optInt("stopIndex",-1));
        if(accepted)state.put("checkedIndex",Math.max(result.optInt("stopIndex",-1),state.optInt("checkedIndex",-1)));
    }
}
