package kr.bus70.driver;

import org.json.JSONObject;

/** Arrival estimates are advisory, never checkpoint records. Safety alerts win. */
final class JourneyVoicePolicy {
    static String message(JSONObject schedule,JSONObject trip,JSONObject estimate,JSONObject state,long now){
        if(!schedule.optBoolean("enabled",true)||!schedule.optBoolean("voice",true)
                ||trip.optString("actualStart").isEmpty()||trip.optString("actualTurn").isEmpty()
                ||!trip.optString("actualEnd").isEmpty()||!estimate.optBoolean("available")
                ||estimate.optBoolean("retained")||estimate.optBoolean("warning")
                ||now-estimate.optLong("timestamp")<0||now-estimate.optLong("timestamp")>10000)return null;
        long at=estimate.optLong("predictedAt"),latest=estimate.optLong("latestAt"),last=state.optLong("journeyVoiceAt");
        if(at<now||latest<at||latest-now>6*3600000L||last>0&&(now-last<600000||Math.abs(at-state.optLong("journeyVoicePrediction"))<300000))return null;
        return "도착 예상 시각은 "+clock(at)+"에서 "+clock(latest)+" 사이입니다. 교통상황에 따라 달라질 수 있습니다.";
    }
    static String clock(long at){return java.time.Instant.ofEpochMilli(at).atZone(java.time.ZoneId.of("Asia/Seoul")).format(java.time.format.DateTimeFormatter.ofPattern("H시 m분"));}
    static void accepted(JSONObject state,JSONObject estimate,long now)throws Exception{state.put("journeyVoiceAt",now).put("journeyVoicePrediction",estimate.optLong("predictedAt"));}
}
