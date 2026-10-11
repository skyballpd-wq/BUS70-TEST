package kr.bus70.driver;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Uses only trips that really exist in the timetable; a sequence may start at trip 2. */
final class TripOrder {
    private TripOrder() {}

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
