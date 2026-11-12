package kr.bus70.driver;
import android.content.Context;
import android.media.AudioAttributes;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import java.util.Locale;

/** Short navigation speech; never opens a full-screen alarm or queues stale advice. */
final class ArrivalVoice {
    private static ArrivalVoice activeVoice;
    private java.util.function.Consumer<Boolean> completion;
    private boolean notice;
    private String utteranceId="";
    private TextToSpeech engine;
    private boolean ready=false,closed=false;
    ArrivalVoice(Context context){
        engine=new TextToSpeech(context,status->{
            if(closed||engine==null)return;
            if(status==TextToSpeech.SUCCESS){
                int language=engine.setLanguage(Locale.KOREAN);
                ready=language!=TextToSpeech.LANG_MISSING_DATA&&language!=TextToSpeech.LANG_NOT_SUPPORTED;
                engine.setSpeechRate(.95f);
                engine.setOnUtteranceProgressListener(new UtteranceProgressListener(){
                    public void onStart(String id){}
                    public void onDone(String id){finish(id,true);}
                    public void onError(String id){finish(id,false);}
                    @Override public void onStop(String id,boolean interrupted){finish(id,false);}
                });
                engine.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            }
        });
    }
    boolean speak(){return speak(EarlyArrivalPolicy.MESSAGE);}
    boolean ready(){return ready&&!closed;}
    boolean speak(String message){return speak(message,false,null);}
    boolean speakNotice(String message,java.util.function.Consumer<Boolean> done){return speak(message,true,done);}
    private synchronized boolean speak(String message,boolean isNotice,java.util.function.Consumer<Boolean> done){
        if(!ready||closed)return false;
        synchronized(ArrivalVoice.class){
            if(activeVoice!=null){if(!isNotice&&activeVoice.notice)activeVoice.stopNotice();else return false;}
            activeVoice=this;notice=isNotice;completion=done;utteranceId=java.util.UUID.randomUUID().toString();
            boolean ok=engine.speak(message,TextToSpeech.QUEUE_FLUSH,null,utteranceId)==TextToSpeech.SUCCESS;
            if(!ok)finish(false);return ok;
        }
    }
    private void finish(boolean ok){finish(null,ok);}
    private void finish(String id,boolean ok){java.util.function.Consumer<Boolean> done;
        synchronized(ArrivalVoice.class){if(id!=null&&!id.equals(utteranceId))return;if(activeVoice==this)activeVoice=null;done=completion;completion=null;notice=false;utteranceId="";}
        if(done!=null)done.accept(ok);
    }
    void stopNotice(){if(notice){if(engine!=null)engine.stop();finish(false);}}
    void close(){finish(false);closed=true;ready=false;if(engine!=null){engine.stop();engine.shutdown();}}
}
