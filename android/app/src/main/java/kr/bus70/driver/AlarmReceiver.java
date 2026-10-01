package kr.bus70.driver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String alarm=intent.getStringExtra("alarm");if(alarm==null)return;
        Intent service=new Intent(context,AlarmPlaybackService.class).putExtra("alarm",alarm);
        context.startForegroundService(service);
    }
}
