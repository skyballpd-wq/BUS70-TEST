package kr.bus70.driver;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground GPS recorder for screen-off operation. Continuous positions stay
 * on the phone; only confirmed departure/turn/arrival events are sent.
 */
public class DriverLocationService extends Service implements LocationListener {
    static final String ACTION_START = "kr.bus70.driver.LOCATION_START";
    static final String ACTION_STOP = "kr.bus70.driver.LOCATION_STOP";
    private static final String CHANNEL = "bus70_driver_location";
    private static final int NOTIFICATION_ID = 7054;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Set<String> inFlight = Collections.synchronizedSet(new HashSet<>());
    private LocationManager locationManager;
    private NativeStore store;
    private JSONObject schedule;
    private JSONObject states;
    private String scheduleRaw = "";
    private String scheduleKey = "";

    static void start(Context context) {
        Intent intent = new Intent(context, DriverLocationService.class).setAction(ACTION_START);
        context.startForegroundService(intent);
    }

    static void stop(Context context) {
        context.startService(new Intent(context, DriverLocationService.class).setAction(ACTION_STOP));
    }

    @Override public void onCreate() {
        super.onCreate();
        store = new NativeStore(this);
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        createChannel();
        startForeground(NOTIFICATION_ID, notification("위치 자동 기록 준비 중"));
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            store.locationStatus("위치 자동 기록을 중지했습니다.");
            store.locationTracking(false);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!locationAllowed()) {
            failAndStop("위치 권한이 없습니다. 앱에서 위치 권한을 허용하세요.");
            return START_NOT_STICKY;
        }
        if (!loadSchedule() || configuredPoints() == 0) {
            failAndStop("검증된 노선 위치 기준점이 없어 자동 기록을 시작할 수 없습니다.");
            return START_NOT_STICKY;
        }
        try {
            boolean requested = false;
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 4000L, 10f, this);
                requested = true;
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 8000L, 20f, this);
                requested = true;
            }
            if (!requested) {
                failAndStop("휴대폰 위치 기능이 꺼져 있습니다.");
                return START_NOT_STICKY;
            }
            store.locationTracking(true);
            setStatus("화면이 꺼져도 위치 자동 기록이 실행 중입니다.");
            return START_STICKY;
        } catch (SecurityException error) {
            failAndStop("위치 권한을 확인하지 못했습니다.");
            return START_NOT_STICKY;
        }
    }

    private boolean locationAllowed() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean loadSchedule() {
        try {
            String raw = store.schedule();
            if (raw.isEmpty()) return false;
            if (raw.equals(scheduleRaw) && schedule != null) return true;
            schedule = new JSONObject(raw);
            scheduleRaw = raw;
            String nextKey = schedule.optString("dispatchId") + "|" + schedule.optString("date");
            JSONObject saved = new JSONObject(store.locationState());
            if (!nextKey.equals(saved.optString("scheduleKey"))) {
                saved = new JSONObject().put("scheduleKey", nextKey).put("trips", new JSONObject());
            }
            states = saved;
            scheduleKey = nextKey;
            store.locationState(states.toString());
            return !schedule.optString("apiUrl").isEmpty() && !schedule.optString("token").isEmpty() && schedule.optJSONArray("trips") != null;
        } catch (Exception error) {
            setStatus("위치 추적 스케줄을 읽지 못했습니다.");
            return false;
        }
    }

    private int configuredPoints() {
        JSONArray trips = schedule == null ? null : schedule.optJSONArray("trips");
        if (trips == null) return 0;
        int count = 0;
        for (int i = 0; i < trips.length(); i++) {
            JSONObject trip = trips.optJSONObject(i);
            if (trip == null) continue;
            if (point(trip, "startLocation") != null) count++;
            if (point(trip, "turnLocation") != null) count++;
            if (point(trip, "endLocation") != null) count++;
        }
        return count;
    }

    private JSONObject point(JSONObject trip, String key) {
        JSONObject point = trip.optJSONObject(key);
        if (point == null) return null;
        double lat = point.optDouble("lat", Double.NaN), lng = point.optDouble("lng", Double.NaN);
        return Double.isFinite(lat) && Double.isFinite(lng) ? point : null;
    }

    @Override public void onLocationChanged(Location location) {
        if (!loadSchedule()) return;
        store.lastLocation(location.getLatitude(), location.getLongitude(), location.getAccuracy(), location.hasSpeed() ? location.getSpeed() : 0, location.getTime());
        JSONArray trips = schedule.optJSONArray("trips");
        if (trips == null || trips.length() == 0) return;
        int index = activeTripIndex(trips);
        JSONObject trip = trips.optJSONObject(index);
        if (trip == null) return;
        int tripNo = trip.optInt("trip", index + 1);
        JSONObject tripStates = states.optJSONObject("trips");
        if (tripStates == null) {
            tripStates = new JSONObject();
            try { states.put("trips", tripStates); } catch (Exception ignored) {}
        }
        JSONObject state = tripStates.optJSONObject(String.valueOf(tripNo));
        if (state == null) state = new JSONObject();
        JSONObject start = point(trip, "startLocation"), turn = point(trip, "turnLocation"), end = point(trip, "endLocation");
        String actualStart = trip.optString("actualStart"), actualTurn = trip.optString("actualTurn"), actualEnd = trip.optString("actualEnd");
        String nearestText = nearestText(location, tripNo, start, turn, end);
        setStatus(nearestText);
        try {
            if (actualStart.isEmpty() && start != null && reliable(location, start)) {
                double distance = distance(location, start);
                if (distance <= radius(start)) {
                    state.put("startInside", state.optInt("startInside") + 1).put("startOutside", 0);
                    if (state.optInt("startInside") >= 2) state.put("seenStart", true);
                } else if (state.optBoolean("seenStart") && distance > radius(start) + 25) {
                    state.put("startOutside", state.optInt("startOutside") + 1);
                    if (state.optInt("startOutside") >= 2) postEvent(trip, "DEPART", location);
                }
            }
            if (!actualStart.isEmpty() && actualTurn.isEmpty() && turn != null && reliable(location, turn)) {
                state.put("turnInside", distance(location, turn) <= radius(turn) ? state.optInt("turnInside") + 1 : 0);
                if (state.optInt("turnInside") >= 2) postEvent(trip, "TURN", location);
            }
            if (!actualStart.isEmpty() && actualEnd.isEmpty() && end != null && (turn == null || !actualTurn.isEmpty()) && reliable(location, end)) {
                state.put("endInside", distance(location, end) <= radius(end) ? state.optInt("endInside") + 1 : 0);
                if (state.optInt("endInside") >= 2) postEvent(trip, "ARRIVE", location);
            }
            tripStates.put(String.valueOf(tripNo), state);
            store.locationState(states.toString());
        } catch (Exception ignored) {}
    }

    private int activeTripIndex(JSONArray trips) {
        for (int i = 0; i < trips.length(); i++) {
            JSONObject trip = trips.optJSONObject(i);
            if (trip != null && !trip.optString("actualStart").isEmpty() && trip.optString("actualEnd").isEmpty()) return i;
        }
        for (int i = 0; i < trips.length(); i++) {
            JSONObject trip = trips.optJSONObject(i);
            if (trip != null && trip.optString("actualEnd").isEmpty()) return i;
        }
        return Math.max(0, trips.length() - 1);
    }

    private boolean reliable(Location location, JSONObject point) {
        return location.hasAccuracy() && location.getAccuracy() <= Math.max(100, radius(point) * 2);
    }

    private double radius(JSONObject point) { return Math.max(20, Math.min(500, point.optDouble("radiusM", 80))); }

    private float distance(Location location, JSONObject point) {
        float[] result = new float[1];
        Location.distanceBetween(location.getLatitude(), location.getLongitude(), point.optDouble("lat"), point.optDouble("lng"), result);
        return result[0];
    }

    private String nearestText(Location location, int tripNo, JSONObject start, JSONObject turn, JSONObject end) {
        JSONObject[] points = {start, turn, end};
        String[] labels = {"발차지", "회차지", "도착지"};
        float nearest = Float.MAX_VALUE;
        String text = tripNo + "탕 위치 자동 판정 중";
        for (int i = 0; i < points.length; i++) {
            if (points[i] == null) continue;
            float current = distance(location, points[i]);
            if (current < nearest) {
                nearest = current;
                text = labels[i] + " " + points[i].optString("place") + "까지 약 " + Math.round(current) + "m · " + tripNo + "탕 자동 판정 중";
            }
        }
        return text;
    }

    private void postEvent(JSONObject trip, String event, Location location) {
        int tripNo = trip.optInt("trip");
        String key = scheduleKey + "|" + tripNo + "|" + event;
        if (!inFlight.add(key)) return;
        setStatus(tripNo + "탕 " + eventLabel(event) + " 자동 기록 중");
        JSONObject body = new JSONObject();
        try {
            body.put("action", "managerAccountUpsert").put("operation", "driverRunLogSave")
                    .put("token", schedule.optString("token")).put("date", schedule.optString("date"))
                    .put("sequence", schedule.optInt("sequence")).put("trip", tripNo).put("event", event)
                    .put("plannedStart", trip.optString("startTime")).put("plannedTurn", trip.optString("turnTime"))
                    .put("plannedEnd", trip.optString("endTime")).put("plannedFrontGap", trip.opt("plannedFrontGap"))
                    .put("plannedRearGap", trip.opt("plannedRearGap")).put("source", "GPS_AUTO")
                    .put("latitude", location.getLatitude()).put("longitude", location.getLongitude())
                    .put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
        } catch (Exception error) {
            inFlight.remove(key);
            return;
        }
        network.execute(() -> {
            try {
                JSONObject result = postJson(schedule.optString("apiUrl"), body);
                main.post(() -> {
                    try {
                        if (result.optBoolean("ok")) {
                            String field = "DEPART".equals(event) ? "actualStart" : "TURN".equals(event) ? "actualTurn" : "actualEnd";
                            trip.put(field, result.optString("recordedAt", String.valueOf(System.currentTimeMillis())));
                            scheduleRaw = schedule.toString();
                            store.schedule(scheduleRaw);
                            setStatus(result.optString("message", tripNo + "탕 " + eventLabel(event) + " 자동 기록 완료"));
                        } else {
                            setStatus(result.optString("message", "위치 이벤트를 서버에 기록하지 못했습니다."));
                            if ("AUTH_REQUIRED".equals(result.optString("error"))) stopSelf();
                        }
                    } catch (Exception ignored) {}
                    inFlight.remove(key);
                });
            } catch (Exception error) {
                main.post(() -> {
                    setStatus("서버 연결 후 " + tripNo + "탕 " + eventLabel(event) + " 기록을 다시 시도합니다.");
                    inFlight.remove(key);
                });
            }
        });
    }

    private JSONObject postJson(String endpoint, JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setInstanceFollowRedirects(true);
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "text/plain;charset=utf-8");
        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(bytes.length);
        try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();
        StringBuilder text = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) text.append(line);
        } finally { connection.disconnect(); }
        if (status < 200 || status >= 400) throw new IllegalStateException("HTTP " + status);
        return new JSONObject(text.toString());
    }

    private String eventLabel(String event) {
        if ("DEPART".equals(event)) return "발차";
        if ("TURN".equals(event)) return "회차";
        return "도착";
    }

    private void setStatus(String message) {
        store.locationStatus(message);
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, notification(message));
    }

    private void failAndStop(String message) {
        store.locationStatus(message);
        store.locationTracking(false);
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, notification(message));
        stopSelf();
    }

    private void createChannel() {
        NotificationChannel channel = new NotificationChannel(CHANNEL, "운행 위치 자동 기록", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("화면이 꺼진 동안 발차·회차·도착 기준점을 확인합니다.");
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
    }

    private Notification notification(String message) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPending = PendingIntent.getActivity(this, 70540, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(this, DriverLocationService.class).setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(this, 70541, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = schedule == null ? "BUS70 위치 자동 기록" : schedule.optString("route", "") + "번 · " + schedule.optInt("sequence") + "순차 위치 기록";
        return new Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle(title)
                .setContentText(message).setStyle(new Notification.BigTextStyle().bigText(message)).setContentIntent(openPending)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "추적 중지", stopPending).build()).setOngoing(true).setOnlyAlertOnce(true).build();
    }

    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) { setStatus("위치 기능이 꺼졌습니다. GPS를 켜 주세요."); }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override public void onDestroy() {
        try { if (locationManager != null) locationManager.removeUpdates(this); } catch (SecurityException ignored) {}
        store.locationTracking(false);
        network.shutdownNow();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
