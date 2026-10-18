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
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground GPS recorder for screen-off operation. Confirmed
 * departure/turn/arrival events are stored in the run log. A throttled latest
 * position snapshot is also sent for route navigation and front/rear vehicle
 * spacing; the server cache expires it instead of building a location history.
 */
public class DriverLocationService extends Service implements LocationListener {
    static volatile boolean running=false;
    static final String ACTION_START = "kr.bus70.driver.LOCATION_START";
    static final String ACTION_STOP = "kr.bus70.driver.LOCATION_STOP";
    private static final String CHANNEL = "bus70_driver_location";
    private static final int NOTIFICATION_ID = 7054;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Set<String> inFlight = Collections.synchronizedSet(new HashSet<>());
    private LocationManager locationManager;
    private NativeStore store;
    private ArrivalVoice arrivalVoice;
    private JSONObject schedule;
    private JSONObject states;
    private JSONObject routeReference;
    private String scheduleRaw = "";
    private String scheduleKey = "";
    private volatile boolean liveLocationInFlight;
    private long lastLiveLocationAt;
    private Location lastLiveLocation;
    private long lastAcceptedFix;
    private long lastGpsElapsed;
    private final Runnable retryEvents = new Runnable() {
        @Override public void run() { if(loadSchedule())flushEvents();if(store.locationTracking()&&System.currentTimeMillis()-store.locationTimestamp()>45000L)setStatus("GPS 재수신 대기 · 위치를 수신하지 못한 구간은 기록할 수 없습니다.");main.postDelayed(this,15000L); }
    };

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
        arrivalVoice = new ArrivalVoice(this);
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
        if (!loadSchedule()) {
            failAndStop("로그인 기사·확정 배차·배정 차량 정보를 확인할 수 없습니다.");
            return START_NOT_STICKY;
        }
        if (configuredPoints() == 0 && configuredRouteStops() < 2) {
            failAndStop("검증된 노선 정류장 좌표 또는 위치 기준점이 없어 자동 기록을 시작할 수 없습니다.");
            return START_NOT_STICKY;
        }
        try {
            boolean requested = false;
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this);
                requested = true;
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000L, 0f, this);
                requested = true;
            }
            if (!requested) {
                failAndStop("휴대폰 위치 기능이 꺼져 있습니다.");
                return START_NOT_STICKY;
            }
            running=true;store.locationTracking(true);
            main.removeCallbacks(retryEvents);main.post(retryEvents);
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
            String raw = store.trackingSchedule();
            if (raw.isEmpty()) return false;
            if (raw.equals(scheduleRaw) && schedule != null) return true;
            schedule = new JSONObject(raw);
            schedule.put("trips", TripOrder.actual(schedule.optJSONArray("trips")));
            JSONArray queued=new JSONArray(store.eventOutbox());EventOutbox.overlay(queued,schedule);store.eventOutbox(queued.toString());
            scheduleRaw = raw;
            String nextKey = schedule.optString("driverId") + "|" + schedule.optString("dispatchId") + "|" + schedule.optString("vehicleId") + "|" + schedule.optString("date");
            JSONObject saved = new JSONObject(store.locationState());
            if (!nextKey.equals(saved.optString("scheduleKey"))) {
                saved = new JSONObject().put("scheduleKey", nextKey).put("trips", new JSONObject());
            }
            states = saved;
            JSONArray ordered=schedule.optJSONArray("trips");for(int i=0;i<ordered.length();i++){JSONObject t=ordered.getJSONObject(i);if(t.optBoolean("departureReset")){states.getJSONObject("trips").remove(String.valueOf(t.optInt("trip")));t.remove("departureReset");}}
            scheduleKey = nextKey;
            store.locationState(states.toString());
            return !schedule.optString("apiUrl").isEmpty() && !schedule.optString("token").isEmpty()
                    && !schedule.optString("driverId").isEmpty() && !schedule.optString("dispatchId").isEmpty()
                    && schedule.optInt("sequence") > 0 && !schedule.optString("vehicleId").isEmpty()
                    && schedule.optJSONArray("trips") != null;
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

    private int configuredRouteStops() {
        JSONArray stops = schedule == null ? null : schedule.optJSONArray("routeStops");
        if (stops == null) return 0;
        int count = 0;
        for (int i = 0; i < stops.length(); i++) {
            JSONObject stop = stops.optJSONObject(i);
            if (stop != null && Double.isFinite(stop.optDouble("lat", Double.NaN)) && Double.isFinite(stop.optDouble("lng", Double.NaN))) count++;
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
        ZonedDateTime localNow = ZonedDateTime.now(ZoneId.of("Asia/Seoul"));
        String serviceDate = localNow.minusHours(3).minusMinutes(30).toLocalDate().toString();
        if (!serviceDate.equals(schedule.optString("date"))) { failAndStop("운행일이 바뀌었습니다. 오늘 배차를 확인하세요."); return; }
        long now = System.currentTimeMillis(), fix = location.getTime();
        long elapsed=android.os.SystemClock.elapsedRealtimeNanos()/1000000L,fixElapsed=location.getElapsedRealtimeNanos()/1000000L;
        boolean gps=LocationManager.GPS_PROVIDER.equals(location.getProvider());
        if(!location.hasAccuracy()||!LocationFixPolicy.accept(elapsed-fixElapsed,fix,lastAcceptedFix,gps,lastGpsElapsed==0?Long.MAX_VALUE:elapsed-lastGpsElapsed,location.getAccuracy()))return;
        if(gps)lastGpsElapsed=elapsed;
        lastAcceptedFix=fix;
        float speed=LocationFixPolicy.speed(gps,location.hasSpeed(),location.getSpeed(),location.hasSpeedAccuracy(),location.getSpeedAccuracyMetersPerSecond());
        if(speed<0)location.removeSpeed();else location.setSpeed(speed);
        store.lastLocation(location,speed);
        JSONArray trips = schedule.optJSONArray("trips");
        if (trips == null || trips.length() == 0) return;
        int index = activeTripIndex(trips);
        JSONObject trip = trips.optJSONObject(index);
        if (trip == null) return;
        if (!trip.optString("actualEnd").isEmpty() && (!needsReturn(trip) || !trip.optString("deadheadReturnedAt").isEmpty())) {
            try { if(EventOutbox.pending(new JSONArray(store.eventOutbox()),schedule.optString("driverId"))>0){setStatus("운행기록 임시 저장 완료 · 서버 전송 재시도 중");flushEvents();return;} }catch(Exception ignored){}
            failAndStop("오늘 탕 운행 자동 기록을 완료했습니다."); return;
        }
        int tripNo = trip.optInt("trip", index + 1);
        JSONObject tripStates = states.optJSONObject("trips");
        if (tripStates == null) {
            tripStates = new JSONObject();
            try { states.put("trips", tripStates); } catch (Exception ignored) {}
        }
        JSONObject state = tripStates.optJSONObject(String.valueOf(tripNo));
        if (state == null) state = new JSONObject();
        JSONObject start = point(trip, "startLocation"), turn = point(trip, "turnLocation"), end = point(trip, "endLocation"), control = point(trip,"controlLocation"), returned = point(trip,"returnLocation");
        long previousSample=state.optLong("sampleTime");
        try{if(previousSample>0&&fix-previousSample>15000)for(String key:new String[]{"startInside","startOutside","turnInside","turnStay","turnOutside","endInside","controlInside","returnInside"})state.remove(key);state.put("sampleTime",fix);}catch(Exception ignored){}
        String actualStart = trip.optString("actualStart"), actualTurn = trip.optString("actualTurn"), actualEnd = trip.optString("actualEnd");
        JSONObject navigation=state.optJSONObject("navigation");
        JSONObject hint=routeReference;
        try{
            if(hint!=null&&(!hint.optString("date").equals(schedule.optString("date"))||!hint.optString("dispatchId").equals(schedule.optString("dispatchId"))||!hint.optString("vehicleId").equals(schedule.optString("vehicleId"))))hint=null;
            navigation=RouteMatcher.matchTrip(trip,scheduleMoment(trip.optString("startTime")),navigation,location.getLatitude(),location.getLongitude(),location.getAccuracy(),location.hasSpeed()?location.getSpeed():0,location.hasBearing()?location.getBearing():Double.NaN,fix,hint);state.put("navigation",navigation);}catch(Exception ignored){}
        boolean inbound=navigation!=null&&navigation.optBoolean("returnConfirmed");
        postLiveLocation(trip, location, navigation!=null&&navigation.optBoolean("waiting")?"":inbound?"RETURN":"OUTBOUND",navigation);
        String nearestText = nearestText(location, tripNo, start, turn, end);
        setStatus(navigation!=null&&navigation.optBoolean("waiting")?tripNo+"탕 출발 대기 · "+trip.optString("startTime"):nearestText);
        try {
            JSONObject advisory=state.optJSONObject("arrivalAdvisoryState");
            if(advisory==null)advisory=new JSONObject();
            JSONObject estimate=EarlyArrivalPolicy.update(advisory,trip,navigation,scheduleKey,schedule.optString("route"),scheduleMoment(trip.optString("endTime")),fix,now,location.getAccuracy(),location.getLatitude(),location.getLongitude());
            if(estimate.optBoolean("notify")){
                boolean voice=schedule.optBoolean("voice",true)&&schedule.optBoolean("enabled",true);
                boolean accepted=!voice||arrivalVoice.speak();
                EarlyArrivalPolicy.attempted(advisory,estimate,now,accepted);
                estimate.put("voiceStatus",!voice?"음성 안내 꺼짐":accepted?"음성 안내 요청":"음성 엔진 확인 필요");
            }
            state.put("arrivalAdvisoryState",advisory).put("arrivalEstimate",estimate);
            if(estimate.optBoolean("warning"))setStatus(EarlyArrivalPolicy.MESSAGE+(estimate.has("voiceStatus")?" · "+estimate.optString("voiceStatus"):""));
        } catch(Exception ignored) {}

        try {
            long plannedStart = scheduleMoment(trip.optString("startTime"));
            if (actualStart.isEmpty() && start != null && reliable(location, start) && plannedStart>0 && now<=plannedStart+7200000L) {
                double distance = distance(location, start);
                if (distance <= radius(start) && matchesDirection(location,start,"approachBearing")) {
                    state.put("startInside", state.optInt("startInside") + 1).put("startOutside", 0);
                    if (state.optInt("startInside") >= 2) state.put("seenStart", true);
                } else if (fix>=plannedStart && state.optBoolean("seenStart") && distance > radius(start) + Math.max(30, location.getAccuracy()) && matchesDirection(location,start,"departureBearing") && RouteMatcher.vehicleDeparture(state,trip.optJSONObject("course"),navigation,location.getLatitude(),location.getLongitude(),location.hasSpeed()?location.getSpeed():-1,fix,plannedStart,hint)) {
                    state.put("startOutside", state.optInt("startOutside") + 1);
                    rememberFix(state,"departure",location,state.optInt("startOutside")==1);
                    if (state.optInt("startOutside") >= 2) postEvent(trip, "DEPART", rememberedFix(state,"departure",location));
                    state.put("startInside", 0);
                } else { state.put("startInside", 0).put("startOutside", 0);state.remove("departureFix"); }
            }
            if (actualEnd.isEmpty() && !actualStart.isEmpty() && actualTurn.isEmpty() && turn != null && reliable(location, turn)) {
                boolean near=distance(location,turn)<=radius(turn);
                int turnIndex=trip.optJSONObject("course")==null?-1:trip.getJSONObject("course").optInt("turnIndex",-1);
                boolean ordered=navigation!=null&&navigation.optBoolean("configured")&&Math.abs(navigation.optDouble("fraction")-turnIndex)<=1.2;
                near=near&&(trip.optJSONObject("course")==null||ordered);
                state.put("turnInside",near?state.optInt("turnInside")+1:0);
                rememberFix(state,"turn",location,state.optInt("turnInside")==1);
                if(state.optInt("turnInside")>=2||near&&ordered&&location.getAccuracy()<=20&&distance(location,turn)<=30)postEvent(trip,"TURN",rememberedFix(state,"turn",location));
            }
            if (actualEnd.isEmpty() && !actualStart.isEmpty() && trip.optString("actualControl").isEmpty() && control != null) {
                state.put("controlInside", distance(location,control) <= radius(control) ? state.optInt("controlInside")+1 : 0);
                if (state.optInt("controlInside")>=2) postEvent(trip,"CONTROL",location);
            }
            if (actualEnd.isEmpty() && !actualTurn.isEmpty() && trip.optString("turnDepartedAt").isEmpty() && turn != null) {
                if(distance(location,turn)<=radius(turn)) { state.put("turnStay",state.optInt("turnStay")+1).put("turnOutside",0); }
                else if(state.optInt("turnInside")>=2 || state.optInt("turnStay")>=2) {
                    state.put("turnOutside",distance(location,turn)>radius(turn)+Math.max(30,location.getAccuracy()) && matchesDirection(location,turn,"departureBearing") ? state.optInt("turnOutside")+1 : 0);
                    rememberFix(state,"turnDeparture",location,state.optInt("turnOutside")==1);
                    if(state.optInt("turnOutside")>=2) postEvent(trip,"TURN_DEPART",rememberedFix(state,"turnDeparture",location));
                }
            }
            if (!actualEnd.isEmpty() && needsReturn(trip) && trip.optString("deadheadReturnedAt").isEmpty() && returned != null) {
                state.put("returnInside",distance(location,returned)<=radius(returned) && matchesDirection(location,returned,"approachBearing") ? state.optInt("returnInside")+1 : 0);
                if(state.optInt("returnInside")>=2)postEvent(trip,"DEADHEAD_RETURN",location);
            }
            if ((!actualStart.isEmpty() || inbound&&navigation.optJSONArray("returnEvidence")!=null&&navigation.optJSONArray("returnEvidence").length()>=2) && actualEnd.isEmpty() && end != null && ((trip.optString("turnPlace").isEmpty() && trip.optString("turnTime").isEmpty()) || !actualTurn.isEmpty() || inbound&&navigation.optJSONArray("returnEvidence")!=null&&navigation.optJSONArray("returnEvidence").length()>=2) && reliable(location, end)) {
                state.put("endInside", distance(location, end) <= radius(end) ? state.optInt("endInside") + 1 : 0);
                rememberFix(state,"arrival",location,state.optInt("endInside")==1);
                if (state.optInt("endInside") >= 2) {
                    trip.put("returnEvidence",navigation==null?new JSONArray():navigation.optJSONArray("returnEvidence"));
                    postEvent(trip, "ARRIVE", rememberedFix(state,"arrival",location));
                }
            }
            tripStates.put(String.valueOf(tripNo), state);
            store.locationState(states.toString());
        } catch (Exception ignored) {}
    }

    private void rememberFix(JSONObject state,String key,Location fix,boolean first)throws Exception {
        if(first)state.put(key+"Fix",new JSONObject().put("latitude",fix.getLatitude()).put("longitude",fix.getLongitude()).put("accuracy",fix.getAccuracy()).put("time",fix.getTime()));
    }
    private Location rememberedFix(JSONObject state,String key,Location fallback){
        JSONObject p=state.optJSONObject(key+"Fix");if(p==null)return fallback;
        Location fix=new Location(fallback);fix.setLatitude(p.optDouble("latitude"));fix.setLongitude(p.optDouble("longitude"));fix.setAccuracy((float)p.optDouble("accuracy"));fix.setTime(p.optLong("time"));return fix;
    }

    private boolean needsReturn(JSONObject trip) {
        return !trip.optString("deadheadDestination").isEmpty() && !trip.optString("deadheadDestination").equals(trip.optString("endPlace"));
    }

    private int activeTripIndex(JSONArray trips) {
        return TripOrder.active(trips, schedule.optString("date"), System.currentTimeMillis());
    }

    private long scheduleMoment(String time) {
        try {
            String[] parts = time.split(":");
            int hour = Integer.parseInt(parts[0]), minute = Integer.parseInt(parts[1]);
            if (hour < 0 || hour > 47 || minute < 0 || minute > 59) return 0;
            LocalDate day = LocalDate.parse(schedule.optString("date"));
            if (hour < 24 && hour * 60 + minute < 210) day = day.plusDays(1);
            return day.atStartOfDay(ZoneId.of("Asia/Seoul")).plusHours(hour).plusMinutes(minute).toInstant().toEpochMilli();
        } catch (Exception error) { return 0; }
    }

    private boolean reliable(Location location, JSONObject point) {
        return location.hasAccuracy() && location.getAccuracy() <= 60;
    }

    private boolean matchesDirection(Location location, JSONObject point, String field) {
        if (!point.has(field) || !location.hasBearing() || !location.hasSpeed() || location.getSpeed()<1.5) return true;
        return Math.abs((location.getBearing()-point.optDouble(field)+540)%360-180)<=100;
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
                    .put("dispatchId", schedule.optString("dispatchId")).put("vehicleId", schedule.optString("vehicleId"))
                    .put("sequence", schedule.optInt("sequence")).put("trip", tripNo).put("event", event)
                    .put("route",schedule.optString("route")).put("startPlace",trip.optString("startPlace")).put("turnPlace",trip.optString("turnPlace")).put("endPlace",trip.optString("endPlace"))
                    .put("plannedStart", trip.optString("startTime")).put("plannedTurn", trip.optString("turnTime"))
                    .put("plannedEnd", trip.optString("endTime")).put("plannedFrontGap", trip.opt("plannedFrontGap"))
                    .put("plannedRearGap", trip.opt("plannedRearGap")).put("source", "GPS_AUTO")
                    .put("latitude", location.getLatitude()).put("longitude", location.getLongitude())
                    .put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL)
                    .put("observedAt", location.getTime()).put("returnEvidence",trip.optJSONArray("returnEvidence"));
        } catch (Exception error) {
            inFlight.remove(key);
            return;
        }
        try {
            JSONArray items=EventOutbox.prune(new JSONArray(store.eventOutbox()),System.currentTimeMillis());
            EventOutbox.add(items,schedule,body);
            if(!store.eventOutbox(items.toString()))throw new IllegalStateException("local storage");
            // Advance locally only after durable storage, even when the network is down.
            EventOutbox.overlay(items,schedule);scheduleRaw=schedule.toString();store.trackingSchedule(scheduleRaw);
            setStatus(tripNo+"탕 "+eventLabel(event)+" 기기 저장 · 서버 전송 대기");
        } catch(Exception error) { setStatus("기기 저장 실패 · 휴대폰 저장 공간을 확인하세요."); }
        inFlight.remove(key);flushEvents();
    }

    private void flushEvents() {
        if(schedule==null)return;
        final String owner=schedule.optString("driverId");
        EventSync.flush(this,owner,schedule.optString("token"),result->{
            try {
                if(running&&loadSchedule()&&owner.equals(schedule.optString("driverId"))){
                    EventOutbox.overlay(new JSONArray(store.eventOutbox()),schedule);
                    store.trackingSchedule(schedule.toString());scheduleRaw=schedule.toString();
                }
                if(result.optBoolean("ok")&&running)flushEvents();
                else if(!result.optBoolean("ok")&&running)setStatus("기록 전송 확인 필요 · "+store.eventSyncError());
            }catch(Exception error){setStatus("기점 기록 전송 재시도 대기");}
        });
    }

    private void postLiveLocation(JSONObject trip, Location location, String direction,JSONObject navigation) {
        JSONObject live = schedule.optJSONObject("liveLocation");
        if (live != null && !live.optBoolean("enabled", true)) return;
        long now = System.currentTimeMillis(), minimum = Math.max(15, live == null ? 20 : live.optInt("minimumIntervalSeconds", 20)) * 1000L;
        if (liveLocationInFlight || now - lastLiveLocationAt < minimum) return;
        if (lastLiveLocation != null && now - lastLiveLocationAt < 60000L && location.distanceTo(lastLiveLocation) < 20f) return;
        liveLocationInFlight = true;
        lastLiveLocationAt = now;
        lastLiveLocation = new Location(location);
        JSONObject body = new JSONObject();
        try {
            body.put("action", "managerAccountUpsert").put("operation", "driverLiveLocationSave")
                    .put("token", schedule.optString("token")).put("date", schedule.optString("date"))
                    .put("dispatchId", schedule.optString("dispatchId")).put("vehicleId", schedule.optString("vehicleId"))
                    .put("sequence", schedule.optInt("sequence"))
                    .put("trip", trip.optInt("trip")).put("latitude", location.getLatitude())
                    .put("longitude", location.getLongitude()).put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL)
                    .put("speedKmh", (navigation==null||!navigation.optBoolean("waiting")) && location.hasSpeed() ? Math.max(0, location.getSpeed() * 3.6) : JSONObject.NULL)
                    .put("heading", location.hasBearing() ? location.getBearing() : JSONObject.NULL)
                    .put("direction", direction).put("observedAt", location.getTime());
            if(navigation!=null&&navigation.optBoolean("configured")&&trip.optJSONObject("course")!=null){JSONArray stops=trip.getJSONObject("course").optJSONArray("stops");int index=navigation.optInt("matchedIndex",-1);if(stops!=null&&index>=0&&index<stops.length())body.put("matchedStopOrder",stops.getJSONObject(index).optInt("order"));}
        } catch (Exception error) {
            liveLocationInFlight = false;
            return;
        }
        network.execute(() -> {
            try {
                JSONObject result = postJson(schedule.optString("apiUrl"), body);
                if(result.optBoolean("ok")&&result.optJSONObject("crossCheck")!=null){
                    JSONObject reference=result.getJSONObject("crossCheck");
                    main.post(()->{routeReference=reference;});
                }
                if (!result.optBoolean("ok") && bindingError(result.optString("error"))) {
                    main.post(() -> failAndStop(result.optString("message", "확정 배차 또는 배정 차량이 변경되어 위치 추적을 중지했습니다.")));
                }
            } catch (Exception error) {
                lastLiveLocationAt = Math.max(0, System.currentTimeMillis() - minimum);
            } finally {
                liveLocationInFlight = false;
            }
        });
    }

    static JSONObject postJson(String endpoint, JSONObject body) throws Exception {
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
        if("TURN_DEPART".equals(event))return "회차 후 출발";
        if("CONTROL".equals(event))return "중간 기준점";
        if("DEADHEAD_RETURN".equals(event))return "차고지 복귀";
        if ("DEPART".equals(event)) return "발차";
        if ("TURN".equals(event)) return "회차";
        return "도착";
    }

    private boolean bindingError(String error) {
        return "AUTH_REQUIRED".equals(error) || "DISPATCH_NOT_FOUND".equals(error) || "DISPATCH_MISMATCH".equals(error)
                || "VEHICLE_NOT_ASSIGNED".equals(error) || "VEHICLE_MISMATCH".equals(error);
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
        running=false;
        if(arrivalVoice!=null)arrivalVoice.close();
        try { if (locationManager != null) locationManager.removeUpdates(this); } catch (SecurityException ignored) {}
        store.locationTracking(false);
        main.removeCallbacksAndMessages(null);
        network.shutdownNow();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
