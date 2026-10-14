package kr.bus70.driver;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Sends durable checkpoints without requiring a GPS service or today's trip. */
final class EventSync {
    private static final ExecutorService network=Executors.newSingleThreadExecutor();
    private static final Handler main=new Handler(Looper.getMainLooper());
    private static boolean sending;
    interface Completion { void done(JSONObject result); }

    // All outbox reads and commits run on the main thread, as does GPS enqueue.
    static void flush(Context context,String driverId,String token,Completion completion) {
        if(Looper.myLooper()!=Looper.getMainLooper())throw new IllegalStateException("main thread required");
        if(sending||driverId.isEmpty()||token.isEmpty())return;
        final NativeStore store=new NativeStore(context.getApplicationContext());
        try {
            JSONObject item=EventOutbox.next(new JSONArray(store.eventOutbox()),driverId,System.currentTimeMillis());
            if(item==null)return;
            final String key=item.getString("key"),endpoint=item.getString("apiUrl");
            final JSONObject body=new JSONObject(item.getJSONObject("body").toString());
            body.put("token",token).put("deferredGPS",true);
            sending=true;
            network.execute(()->{
                JSONObject response;
                try{response=DriverLocationService.postJson(endpoint,body);}
                catch(Exception error){response=new JSONObject();}
                final JSONObject result=response;
                main.post(()->{
                    sending=false;
                    try {
                        // Re-read after I/O so events captured meanwhile cannot be lost.
                        JSONArray items=new JSONArray(store.eventOutbox());
                        EventOutbox.applyResponse(items,key,result,System.currentTimeMillis());
                        if(!store.eventOutbox(items.toString()))throw new IllegalStateException("outbox commit failed");
                        store.eventSyncError(result.optBoolean("ok")?"":result.optString("message","통신 대기 · 기점 시각은 기기에 보관 중"));
                        completion.done(result);
                    }catch(Exception error){store.eventSyncError("기록 전송 상태 저장 실패 · 재시도 대기");}
                });
            });
        }catch(Exception error){store.eventSyncError("기기 보관 기록 확인 필요");}
    }
}
