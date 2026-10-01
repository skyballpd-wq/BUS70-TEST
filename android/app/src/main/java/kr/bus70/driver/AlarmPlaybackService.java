package kr.bus70.driver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import org.json.JSONObject;
import java.util.Locale;

public class AlarmPlaybackService extends Service implements TextToSpeech.OnInitListener {
    private static final String CHANNEL="bus70_driver_alarm"; private TextToSpeech tts; private Ringtone ringtone; private JSONObject alarm; private boolean ttsReady=false,speakPending=false;
    @Override public void onCreate(){super.onCreate();createChannel();tts=new TextToSpeech(this,this);}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if("STOP".equals(intent.getAction())){stopPlayback();return START_NOT_STICKY;}
        try{alarm=new JSONObject(intent.getStringExtra("alarm"));startForeground(alarm.getInt("id"),notification(alarm));playSound(alarm);if(alarm.optBoolean("vibration",true)){Vibrator v=(Vibrator)getSystemService(VIBRATOR_SERVICE);v.vibrate(VibrationEffect.createWaveform(new long[]{0,500,250,500},-1));}}
        catch(Exception e){stopSelf();}
        return START_NOT_STICKY;
    }
    private void createChannel(){NotificationChannel c=new NotificationChannel(CHANNEL,"BUS70 운행 알람",NotificationManager.IMPORTANCE_HIGH);c.setDescription("출근 및 탕별 운행 준비 알람");c.setSound(null,null);getSystemService(NotificationManager.class).createNotificationChannel(c);}
    private Notification notification(JSONObject a)throws Exception{
        Intent open=new Intent(this,MainActivity.class);PendingIntent openPi=PendingIntent.getActivity(this,1,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Intent stop=new Intent(this,AlarmPlaybackService.class).setAction("STOP");PendingIntent stopPi=PendingIntent.getService(this,2,stop,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle(a.getString("title")).setContentText(a.getString("message")).setStyle(new Notification.BigTextStyle().bigText(a.getString("message"))).setPriority(Notification.PRIORITY_MAX).setCategory(Notification.CATEGORY_ALARM).setOngoing(true).setContentIntent(openPi).addAction(new Notification.Action.Builder(null,"알람 끄기",stopPi).build()).build();
    }
    private void playSound(JSONObject a){try{String selected=a.optString("soundUri");Uri uri=selected.isEmpty()?RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM):Uri.parse(selected);ringtone=RingtoneManager.getRingtone(this,uri);ringtone.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());ringtone.play();new Handler(Looper.getMainLooper()).postDelayed(()->{if(ringtone!=null&&ringtone.isPlaying())ringtone.stop();speak();},3000);}catch(Exception e){speak();}}
    private void speak(){if(alarm==null||!alarm.optBoolean("voice",true)){stopPlayback();return;}if(!ttsReady){speakPending=true;return;}Bundle params=new Bundle();tts.speak(alarm.optString("message"),TextToSpeech.QUEUE_FLUSH,params,"BUS70_ALARM");}
    @Override public void onInit(int status){if(status==TextToSpeech.SUCCESS){ttsReady=true;tts.setLanguage(Locale.KOREAN);tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){public void onStart(String id){}public void onDone(String id){stopSelf();}public void onError(String id){stopSelf();}});if(speakPending)speak();}else stopPlayback();}
    private void stopPlayback(){if(ringtone!=null&&ringtone.isPlaying())ringtone.stop();if(tts!=null)tts.stop();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    @Override public void onDestroy(){if(tts!=null){tts.stop();tts.shutdown();}super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
