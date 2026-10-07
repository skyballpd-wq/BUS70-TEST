package kr.bus70.driver;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;

final class NativeStore {
    private static final String FILE = "bus70_native";
    private final SharedPreferences prefs;
    NativeStore(Context context) { prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE); }
    String schedule() { return prefs.getString("schedule", ""); }
    void schedule(String json) { prefs.edit().putString("schedule", json).apply(); }
    String alarms() { return prefs.getString("alarms", "[]"); }
    void alarms(String json) { prefs.edit().putString("alarms", json).apply(); }
    String calendarEvents() { return prefs.getString("calendarEvents", "[]"); }
    void calendarEvents(String json) { prefs.edit().putString("calendarEvents", json).apply(); }
    String soundUri() { return prefs.getString("soundUri", ""); }
    String soundName() { return prefs.getString("soundName", "휴대폰 기본 알람음"); }
    void sound(String uri, String name) { prefs.edit().putString("soundUri", uri).putString("soundName", name).apply(); }
    boolean locationTracking() { return prefs.getBoolean("locationTracking", false); }
    void locationTracking(boolean active) { prefs.edit().putBoolean("locationTracking", active).apply(); }
    String locationStatus() { return prefs.getString("locationStatus", "위치 자동 기록을 시작하지 않았습니다."); }
    void locationStatus(String message) { prefs.edit().putString("locationStatus", message).apply(); }
    String locationState() { return prefs.getString("locationState", "{}"); }
    void locationState(String json) { prefs.edit().putString("locationState", json).apply(); }
    void lastLocation(double latitude,double longitude,float accuracy,float speed,long timestamp) {
        prefs.edit().putLong("locationLat",Double.doubleToRawLongBits(latitude)).putLong("locationLng",Double.doubleToRawLongBits(longitude)).putFloat("locationAccuracy",accuracy).putFloat("locationSpeed",speed).putLong("locationTimestamp",timestamp).apply();
    }
    double locationLatitude() { return Double.longBitsToDouble(prefs.getLong("locationLat",Double.doubleToRawLongBits(0))); }
    double locationLongitude() { return Double.longBitsToDouble(prefs.getLong("locationLng",Double.doubleToRawLongBits(0))); }
    float locationAccuracy() { return prefs.getFloat("locationAccuracy",0); }
    float locationSpeed() { return prefs.getFloat("locationSpeed",0); }
    long locationTimestamp() { return prefs.getLong("locationTimestamp",0); }
    void clearDriverSession() {
        try {
            JSONObject saved = new JSONObject(schedule());
            saved.remove("token");
            saved.remove("apiUrl");
            saved.remove("driverId");
            schedule(saved.toString());
        } catch (Exception ignored) {}
        prefs.edit().putBoolean("locationTracking",false).remove("locationState").remove("locationStatus")
                .remove("locationLat").remove("locationLng").remove("locationAccuracy")
                .remove("locationSpeed").remove("locationTimestamp").apply();
    }
}
