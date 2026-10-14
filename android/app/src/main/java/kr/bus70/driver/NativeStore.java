package kr.bus70.driver;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;
import org.json.JSONArray;

final class NativeStore {
    private static final String FILE = "bus70_native";
    private final SharedPreferences prefs;
    NativeStore(Context context) { prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE); }
    String schedule() { return prefs.getString("schedule", ""); }
    void schedule(String json) { prefs.edit().putString("schedule", json).apply(); }
    String trackingSchedule() { return prefs.getString("trackingSchedule", schedule()); }
    void trackingSchedule(String json) { prefs.edit().putString("trackingSchedule", json).apply(); }
    String alarms() { return prefs.getString("alarms", "[]"); }
    void alarms(String json) { prefs.edit().putString("alarms", json).apply(); }
    String calendarEvents() { return prefs.getString("calendarEvents", "[]"); }
    void calendarEvents(String json) { if(!prefs.edit().putString("calendarEvents", json).commit())throw new IllegalStateException("캘린더 정리 상태 저장 실패"); }
    int calendarSyncVersion() { return prefs.getInt("calendarSyncVersion", 0); }
    String calendarEntries() { return prefs.getString("calendarEntries", "[]"); }
    void calendarState(JSONArray entries) throws Exception {
        JSONArray ids=new JSONArray();for(int i=0;i<entries.length();i++)ids.put(entries.getJSONObject(i).getLong("id"));
        if(!prefs.edit().putString("calendarEntries",entries.toString()).putString("calendarEvents",ids.toString()).putInt("calendarSyncVersion",2).commit())throw new IllegalStateException("캘린더 연결 상태 저장 실패");
    }
    String alarmReceipts() { return prefs.getString("alarmReceipts", "{}"); }
    boolean alarmReceipts(String json) { return prefs.edit().putString("alarmReceipts", json).commit(); }
    String testAlarm() { return prefs.getString("testAlarm", "{}"); }
    void testAlarm(String json) { prefs.edit().putString("testAlarm", json).apply(); }
    String soundUri() { return prefs.getString("soundUri", ""); }
    String soundName() { return prefs.getString("soundName", "휴대폰 기본 알람음"); }
    void sound(String uri, String name) { prefs.edit().putString("soundUri", uri).putString("soundName", name).apply(); }
    boolean locationTracking() { return prefs.getBoolean("locationTracking", false); }
    void locationTracking(boolean active) { prefs.edit().putBoolean("locationTracking", active).apply(); }
    String locationStatus() { return prefs.getString("locationStatus", "위치 자동 기록을 시작하지 않았습니다."); }
    void locationStatus(String message) { prefs.edit().putString("locationStatus", message).apply(); }
    String locationState() { return prefs.getString("locationState", "{}"); }
    void locationState(String json) { prefs.edit().putString("locationState", json).apply(); }
    String eventOutbox() { return prefs.getString("eventOutbox", "[]"); }
    boolean eventOutbox(String json) { return prefs.edit().putString("eventOutbox", json).commit(); }
    String eventSyncError() { return prefs.getString("eventSyncError", ""); }
    void eventSyncError(String text) { prefs.edit().putString("eventSyncError", text).apply(); }
    void lastLocation(android.location.Location location,float speed) {
        prefs.edit().putLong("locationLat",Double.doubleToRawLongBits(location.getLatitude())).putLong("locationLng",Double.doubleToRawLongBits(location.getLongitude())).putFloat("locationAccuracy",location.getAccuracy()).putFloat("locationSpeed",speed).putLong("locationTimestamp",location.getTime())
            .putFloat("locationHeading",location.hasBearing()&&(!location.hasBearingAccuracy()||location.getBearingAccuracyDegrees()<=45)?location.getBearing():-1)
            .putFloat("locationSpeedAccuracy",location.hasSpeedAccuracy()?location.getSpeedAccuracyMetersPerSecond():-1).putString("locationProvider",location.getProvider()).apply();
    }
    float locationHeading(){return prefs.getFloat("locationHeading",-1);}
    float locationSpeedAccuracy(){return prefs.getFloat("locationSpeedAccuracy",-1);}
    String locationProvider(){return prefs.getString("locationProvider","");}
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
                .remove("locationHeading").remove("locationSpeedAccuracy").remove("locationProvider").remove("locationSpeed").remove("locationTimestamp").remove("trackingSchedule").apply();
    }
}
