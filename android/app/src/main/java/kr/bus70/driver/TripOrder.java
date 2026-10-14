package kr.bus70.driver;

import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Uses only trips that really exist in the timetable; a sequence may start at trip 2. */
final class TripOrder {
    private TripOrder() {}

    static long moment(String date, String time) {
        try {
            if (!time.matches("\\d{1,2}:\\d{2}")) return 0;
            String[] parts=time.split(":"); int hour=Integer.parseInt(parts[0]),minute=Integer.parseInt(parts[1]);
            if(hour>47||minute>59)return 0;
            LocalDate day=LocalDate.parse(date);
            if(hour<24&&hour*60+minute<210)day=day.plusDays(1);
            return day.atStartOfDay(ZoneId.of("Asia/Seoul")).plusHours(hour).plusMinutes(minute).toInstant().toEpochMilli();
        } catch(Exception ignored){return 0;}
    }
    static long observedMoment(String date,String value){
        try {
            if(value.matches("\\d{1,2}:\\d{2}(:\\d{2})?"))return moment(date,value.split(":")[0]+":"+value.split(":")[1]);
            String iso=value.replace(' ','T');
            if(iso.matches(".*([Zz]|[+-]\\d{2}:?\\d{2})$"))return OffsetDateTime.parse(iso).toInstant().toEpochMilli();
            return LocalDateTime.parse(iso).atZone(ZoneId.of("Asia/Seoul")).toInstant().toEpochMilli();
        }catch(Exception ignored){return 0;}
    }
    private static boolean complete(JSONObject t){
        boolean needsReturn=!t.optString("deadheadDestination").isEmpty()&&!t.optString("deadheadDestination").equals(t.optString("endPlace"));
        return !t.optString("actualEnd").isEmpty()&&(!needsReturn||!t.optString("deadheadReturnedAt").isEmpty());
    }
    static int active(JSONArray trips,String date,long now){
        int lastComplete=-1,running=-1;
        for(int i=0;i<trips.length();i++)if(complete(trips.optJSONObject(i)))lastComplete=i;
        for(int i=lastComplete+1;i<trips.length();i++){
            JSONObject t=trips.optJSONObject(i);
            if(!t.optString("actualStart").isEmpty()||!t.optString("actualEnd").isEmpty())running=i;
        }
        if(running>=0){
            JSONObject t=trips.optJSONObject(running);long end=moment(date,t.optString("endTime")),delay=0;
            for(String phase:new String[]{"Start","Turn"}){
                long planned=moment(date,t.optString(phase.toLowerCase()+"Time")),observed=observedMoment(date,t.optString("actual"+phase));
                if(planned>0&&observed>0)delay=Math.max(delay,observed-planned);
            }
            // Advance tracking only; preserve every missing actual timestamp.
            if(end>0&&now>=end+delay)for(int i=trips.length()-1;i>running;i--){
                JSONObject next=trips.optJSONObject(i);long start=moment(date,next.optString("startTime"));
                if(!complete(next)&&start>0&&start<=now)return i;
            }
            return running;
        }
        for(int i=lastComplete+1;i<trips.length();i++){
            JSONObject t=trips.optJSONObject(i);long end=moment(date,t.optString("endTime"));
            if(!complete(t)&&(end==0||end>=now))return i;
        }
        return Math.max(0,trips.length()-1);
    }

    static JSONArray actual(JSONArray source) {
        List<JSONObject> values = new ArrayList<>();
        Set<Integer> seen = new HashSet<>();
        if (source != null) {
            for (int index = 0; index < source.length(); index++) {
                JSONObject trip = source.optJSONObject(index);
                int number = trip == null ? 0 : trip.optInt("trip", 0);
                if (number < 1 || trip.optString("startTime", "").isEmpty() || !seen.add(number)) continue;
                values.add(trip);
            }
        }
        values.sort(Comparator.comparingInt(value -> value.optInt("trip", Integer.MAX_VALUE)));
        JSONArray result = new JSONArray();
        for (JSONObject value : values) result.put(value);
        return result;
    }
}
