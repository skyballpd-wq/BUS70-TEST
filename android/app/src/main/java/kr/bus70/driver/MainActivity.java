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
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int PERMISSIONS=70, RINGTONE=71;
    private WebView web;
    @Override protected void onCreate(Bundle state){super.onCreate(state);web=new WebView(this);setContentView(web);WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView view,android.webkit.WebResourceRequest request){Uri uri=request.getUrl();if("https".equals(uri.getScheme())&&"skyballpd-wq.github.io".equals(uri.getHost())&&uri.getPath().startsWith("/BUS70-TEST/"))return false;startActivity(new Intent(Intent.ACTION_VIEW,uri));return true;}});web.setWebChromeClient(new WebChromeClient());web.addJavascriptInterface(new Bridge(),"Bus70Android");web.loadUrl("https://skyballpd-wq.github.io/BUS70-TEST/");}
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}

    private void requestSetup(){
        java.util.ArrayList<String> permissions=new java.util.ArrayList<>();
        if(checkSelfPermission(Manifest.permission.READ_CALENDAR)!=PackageManager.PERMISSION_GRANTED)permissions.add(Manifest.permission.READ_CALENDAR);
        if(checkSelfPermission(Manifest.permission.WRITE_CALENDAR)!=PackageManager.PERMISSION_GRANTED)permissions.add(Manifest.permission.WRITE_CALENDAR);
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        if(!permissions.isEmpty())requestPermissions(permissions.toArray(new String[0]),PERMISSIONS);else requestExactAlarmAccess();
    }
    private void requestExactAlarmAccess(){if(Build.VERSION.SDK_INT>=31){AlarmManager manager=(AlarmManager)getSystemService(ALARM_SERVICE);if(!manager.canScheduleExactAlarms())startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));}}
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){super.onRequestPermissionsResult(requestCode,permissions,results);if(requestCode==PERMISSIONS)requestExactAlarmAccess();}
    private boolean calendarAllowed(){return checkSelfPermission(Manifest.permission.READ_CALENDAR)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.WRITE_CALENDAR)==PackageManager.PERMISSION_GRANTED;}
    private void callback(String name,JSONObject data){runOnUiThread(()->web.evaluateJavascript("window."+name+"&&window."+name+"("+JSONObject.quote(data.toString())+")",null));}

    public final class Bridge {
        @JavascriptInterface public void requestSetup(){runOnUiThread(()->MainActivity.this.requestSetup());}
        @JavascriptInterface public void chooseAlarmSound(){runOnUiThread(()->{Intent i=new Intent(RingtoneManager.ACTION_RINGTONE_PICKER).putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE,RingtoneManager.TYPE_ALARM).putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT,true).putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI,new NativeStore(MainActivity.this).soundUri().isEmpty()?null:Uri.parse(new NativeStore(MainActivity.this).soundUri()));startActivityForResult(i,RINGTONE);});}
        @JavascriptInterface public String capabilities(){try{AlarmManager a=(AlarmManager)getSystemService(ALARM_SERVICE);return new JSONObject().put("android",true).put("calendar",calendarAllowed()).put("exactAlarm",Build.VERSION.SDK_INT<31||a.canScheduleExactAlarms()).put("soundName",new NativeStore(MainActivity.this).soundName()).toString();}catch(Exception e){return "{\"android\":true}";}}
        @JavascriptInterface public void syncSchedule(String json){runOnUiThread(()->{try{JSONObject payload=new JSONObject(json),result=AlarmScheduler.sync(MainActivity.this,payload);if(calendarAllowed())result.put("calendarCount",CalendarSync.sync(MainActivity.this,payload));else result.put("calendarPermission",false);callback("bus70NativeSyncResult",result);}catch(Exception e){try{callback("bus70NativeSyncResult",new JSONObject().put("ok",false).put("message",e.getMessage()));}catch(Exception ignored){}}});}
        @JavascriptInterface public void scheduleTestAlarm(int seconds,boolean voice,boolean vibration){runOnUiThread(()->{try{callback("bus70NativeTestResult",AlarmScheduler.scheduleTest(MainActivity.this,seconds,voice,vibration));}catch(Exception e){try{callback("bus70NativeTestResult",new JSONObject().put("ok",false).put("message",e.getMessage()));}catch(Exception ignored){}}});}
        @JavascriptInterface public void alarmStatus(){runOnUiThread(()->{try{callback("bus70NativeAlarmStatus",AlarmScheduler.status(MainActivity.this));}catch(Exception e){try{callback("bus70NativeAlarmStatus",new JSONObject().put("ok",false).put("message",e.getMessage()));}catch(Exception ignored){}}});}
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);if(requestCode==RINGTONE&&resultCode==RESULT_OK&&data!=null){Uri uri=data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);String value=uri==null?"":uri.toString();String name=uri==null?"휴대폰 기본 알람음":RingtoneManager.getRingtone(this,uri).getTitle(this);new NativeStore(this).sound(value,name);try{callback("bus70NativeSoundSelected",new JSONObject().put("soundName",name));}catch(Exception ignored){}}}
}
