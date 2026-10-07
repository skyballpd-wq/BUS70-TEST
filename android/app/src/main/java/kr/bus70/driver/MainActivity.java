package kr.bus70.driver;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int PERMISSIONS=70, RINGTONE=71, LOCATION_PERMISSIONS=72;
    private WebView web;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;
    private boolean startLocationAfterPermission;
    @Override protected void onCreate(Bundle state){super.onCreate(state);web=new WebView(this);setContentView(web);WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setGeolocationEnabled(true);settings.setAllowFileAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView view,android.webkit.WebResourceRequest request){Uri uri=request.getUrl();if("https".equals(uri.getScheme())&&"skyballpd-wq.github.io".equals(uri.getHost())&&uri.getPath().startsWith("/BUS70-TEST/"))return false;startActivity(new Intent(Intent.ACTION_VIEW,uri));return true;}});web.setWebChromeClient(new WebChromeClient(){@Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback callback){if(locationAllowed()){callback.invoke(origin,true,false);return;}geoOrigin=origin;geoCallback=callback;requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_PERMISSIONS);}});web.addJavascriptInterface(new Bridge(),"Bus70Android");web.loadUrl("https://skyballpd-wq.github.io/BUS70-TEST/");}
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}

    private void requestSetup(){
        java.util.ArrayList<String> permissions=new java.util.ArrayList<>();
        if(checkSelfPermission(Manifest.permission.READ_CALENDAR)!=PackageManager.PERMISSION_GRANTED)permissions.add(Manifest.permission.READ_CALENDAR);
        if(checkSelfPermission(Manifest.permission.WRITE_CALENDAR)!=PackageManager.PERMISSION_GRANTED)permissions.add(Manifest.permission.WRITE_CALENDAR);
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        if(!permissions.isEmpty())requestPermissions(permissions.toArray(new String[0]),PERMISSIONS);else requestExactAlarmAccess();
    }
    private void requestExactAlarmAccess(){if(Build.VERSION.SDK_INT>=31){AlarmManager manager=(AlarmManager)getSystemService(ALARM_SERVICE);if(!manager.canScheduleExactAlarms())startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));}}
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){super.onRequestPermissionsResult(requestCode,permissions,results);if(requestCode==PERMISSIONS){requestExactAlarmAccess();return;}if(requestCode==LOCATION_PERMISSIONS){boolean allowed=locationAllowed();if(geoCallback!=null){geoCallback.invoke(geoOrigin,allowed,false);geoCallback=null;geoOrigin=null;}if(startLocationAfterPermission){startLocationAfterPermission=false;if(allowed)startLocationService();else sendLocationStatus(false,false,"위치 권한이 거부되어 자동 기록을 시작할 수 없습니다.");}}}
    private boolean calendarAllowed(){return checkSelfPermission(Manifest.permission.READ_CALENDAR)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.WRITE_CALENDAR)==PackageManager.PERMISSION_GRANTED;}
    private boolean locationAllowed(){return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;}
    private void callback(String name,JSONObject data){runOnUiThread(()->web.evaluateJavascript("window."+name+"&&window."+name+"("+JSONObject.quote(data.toString())+")",null));}
    private void startLocationService(){DriverLocationService.start(this);sendLocationStatus(true,true,"위치 자동 기록을 준비 중입니다.");web.postDelayed(()->{NativeStore store=new NativeStore(MainActivity.this);sendLocationStatus(store.locationTracking(),store.locationTracking(),store.locationStatus());},1500);}
    private void requestLocationAndStart(){if(locationAllowed()){startLocationService();return;}startLocationAfterPermission=true;requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_PERMISSIONS);}
    private void sendLocationStatus(boolean ok,boolean active,String message){try{NativeStore store=new NativeStore(this);JSONObject result=new JSONObject().put("ok",ok).put("active",active).put("message",message==null?store.locationStatus():message);if(store.locationTimestamp()>0)result.put("latitude",store.locationLatitude()).put("longitude",store.locationLongitude()).put("accuracy",store.locationAccuracy()).put("speed",store.locationSpeed()).put("timestamp",store.locationTimestamp());callback("bus70NativeLocationStatus",result);}catch(Exception ignored){}}

    public final class Bridge {
        @JavascriptInterface public void requestSetup(){runOnUiThread(()->MainActivity.this.requestSetup());}
        @JavascriptInterface public void chooseAlarmSound(){runOnUiThread(()->{Intent i=new Intent(RingtoneManager.ACTION_RINGTONE_PICKER).putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE,RingtoneManager.TYPE_ALARM).putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT,true).putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI,new NativeStore(MainActivity.this).soundUri().isEmpty()?null:Uri.parse(new NativeStore(MainActivity.this).soundUri()));startActivityForResult(i,RINGTONE);});}
        @JavascriptInterface public String capabilities(){try{AlarmManager a=(AlarmManager)getSystemService(ALARM_SERVICE);return new JSONObject().put("android",true).put("calendar",calendarAllowed()).put("location",locationAllowed()).put("exactAlarm",Build.VERSION.SDK_INT<31||a.canScheduleExactAlarms()).put("soundName",new NativeStore(MainActivity.this).soundName()).toString();}catch(Exception e){return "{\"android\":true}";}}
        @JavascriptInterface public void syncSchedule(String json){runOnUiThread(()->{try{JSONObject payload=new JSONObject(json),result=AlarmScheduler.sync(MainActivity.this,payload);if(calendarAllowed())result.put("calendarCount",CalendarSync.sync(MainActivity.this,payload));else result.put("calendarPermission",false);callback("bus70NativeSyncResult",result);}catch(Exception e){try{callback("bus70NativeSyncResult",new JSONObject().put("ok",false).put("message",e.getMessage()));}catch(Exception ignored){}}});}
        @JavascriptInterface public void scheduleTestAlarm(int seconds,boolean voice,boolean vibration){runOnUiThread(()->{try{callback("bus70NativeTestResult",AlarmScheduler.scheduleTest(MainActivity.this,seconds,voice,vibration));}catch(Exception e){try{callback("bus70NativeTestResult",new JSONObject().put("ok",false).put("message",e.getMessage()));}catch(Exception ignored){}}});}
        @JavascriptInterface public void alarmStatus(){runOnUiThread(()->{try{callback("bus70NativeAlarmStatus",AlarmScheduler.status(MainActivity.this));}catch(Exception e){try{callback("bus70NativeAlarmStatus",new JSONObject().put("ok",false).put("message",e.getMessage()));}catch(Exception ignored){}}});}
        @JavascriptInterface public void startLocationTracking(){runOnUiThread(()->requestLocationAndStart());}
        @JavascriptInterface public void stopLocationTracking(){runOnUiThread(()->{NativeStore store=new NativeStore(MainActivity.this);if(store.locationTracking())DriverLocationService.stop(MainActivity.this);else store.locationStatus("위치 자동 기록을 중지했습니다.");sendLocationStatus(true,false,"위치 자동 기록을 중지했습니다.");});}
        @JavascriptInterface public void locationStatus(){runOnUiThread(()->{NativeStore store=new NativeStore(MainActivity.this);sendLocationStatus(true,store.locationTracking(),store.locationStatus());});}
        @JavascriptInterface public void clearDriverSession(){runOnUiThread(()->{NativeStore store=new NativeStore(MainActivity.this);if(store.locationTracking())DriverLocationService.stop(MainActivity.this);store.clearDriverSession();});}
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);if(requestCode==RINGTONE&&resultCode==RESULT_OK&&data!=null){Uri uri=data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);String value=uri==null?"":uri.toString();String name=uri==null?"휴대폰 기본 알람음":RingtoneManager.getRingtone(this,uri).getTitle(this);new NativeStore(this).sound(value,name);try{callback("bus70NativeSoundSelected",new JSONObject().put("soundName",name));}catch(Exception ignored){}}}
}
