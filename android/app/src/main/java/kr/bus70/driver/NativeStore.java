package kr.bus70.driver;

import android.content.Context;
import android.content.SharedPreferences;

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
}
