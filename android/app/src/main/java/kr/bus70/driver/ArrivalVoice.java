package kr.bus70.driver;
import android.content.Context;
import android.media.AudioAttributes;
import android.speech.tts.TextToSpeech;
import java.util.Locale;

/** Short navigation speech; never opens a full-screen alarm or queues stale advice. */
final class ArrivalVoice {
    private TextToSpeech engine;
    private boolean ready=false,closed=false;
    ArrivalVoice(Context context){
        engine=new TextToSpeech(context,status->{
            if(closed||engine==null)return;
            if(status==TextToSpeech.SUCCESS){
                int language=engine.setLanguage(Locale.KOREAN);
                ready=language!=TextToSpeech.LANG_MISSING_DATA&&language!=TextToSpeech.LANG_NOT_SUPPORTED;
                engine.setSpeechRate(.95f);
                engine.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            }
        });
    }
    boolean speak(){return ready&&!closed&&!engine.isSpeaking()&&engine.speak(EarlyArrivalPolicy.MESSAGE,TextToSpeech.QUEUE_FLUSH,null,"depot-early-arrival")==TextToSpeech.SUCCESS;}
    void close(){closed=true;ready=false;if(engine!=null){engine.stop();engine.shutdown();}}
}
