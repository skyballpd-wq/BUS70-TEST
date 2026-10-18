package kr.bus70.driver;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import android.webkit.WebChromeClient;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AccidentPhotoChooserTest {
    @Test public void privateCameraUriAndGalleryIntent() throws Exception {
        Instrumentation instrument=InstrumentationRegistry.getInstrumentation();android.content.Context context=instrument.getTargetContext();
        Activity activity=instrument.startActivitySync(new Intent(context,PhotoTestActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try{
            AccidentPhotoChooser chooser=new AccidentPhotoChooser(activity);
            Intent camera=chooser.createIntent(true,false);assertEquals(MediaStore.ACTION_IMAGE_CAPTURE,camera.getAction());
            Uri uri=camera.getParcelableExtra(MediaStore.EXTRA_OUTPUT);assertNotNull(uri);assertEquals("content",uri.getScheme());assertEquals(context.getPackageName()+".photos",uri.getAuthority());
            try(android.os.ParcelFileDescriptor descriptor=context.getContentResolver().openFileDescriptor(uri,"rw")){assertNotNull(descriptor);}assertTrue((camera.getFlags()&Intent.FLAG_GRANT_WRITE_URI_PERMISSION)!=0);
            Intent gallery=chooser.createIntent(false,true);assertEquals(Intent.ACTION_OPEN_DOCUMENT,gallery.getAction());assertEquals("image/*",gallery.getType());assertTrue(gallery.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE,false));
            assertFalse(chooser.result(71,Activity.RESULT_CANCELED,null));assertTrue(chooser.result(77,Activity.RESULT_CANCELED,null));
        }finally{finishAndWait(instrument,activity);}
    }
    @Test public void cancelledPickerCompletesCallbackOnce() throws Exception {
        Instrumentation instrument=InstrumentationRegistry.getInstrumentation();android.content.Context context=instrument.getTargetContext();
        Activity activity=instrument.startActivitySync(new Intent(context,PhotoTestActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        Instrumentation.ActivityMonitor monitor=instrument.addMonitor(new android.content.IntentFilter(Intent.ACTION_OPEN_DOCUMENT),new Instrumentation.ActivityResult(Activity.RESULT_CANCELED,null),true);
        try{
            AccidentPhotoChooser chooser=new AccidentPhotoChooser(activity);java.util.concurrent.atomic.AtomicInteger calls=new java.util.concurrent.atomic.AtomicInteger();
            WebChromeClient.FileChooserParams params=new WebChromeClient.FileChooserParams(){public int getMode(){return MODE_OPEN;}public String[] getAcceptTypes(){return new String[]{"image/*"};}public boolean isCaptureEnabled(){return false;}public CharSequence getTitle(){return "사진 선택";}public String getFilenameHint(){return null;}public Intent createIntent(){return new Intent(Intent.ACTION_OPEN_DOCUMENT);}};
            instrument.runOnMainSync(()->{assertTrue(chooser.open(values->{assertNull(values);calls.incrementAndGet();},params));chooser.result(77,Activity.RESULT_CANCELED,null);chooser.cancel();});
            assertEquals(1,calls.get());
        }finally{instrument.removeMonitor(monitor);finishAndWait(instrument,activity);}
    }
    private void finishAndWait(Instrumentation instrument,Activity activity) throws Exception {
        java.util.concurrent.CountDownLatch detached=new java.util.concurrent.CountDownLatch(1);
        instrument.runOnMainSync(()->{android.view.View decor=activity.getWindow().getDecorView();decor.addOnAttachStateChangeListener(new android.view.View.OnAttachStateChangeListener(){public void onViewAttachedToWindow(android.view.View v){}public void onViewDetachedFromWindow(android.view.View v){detached.countDown();}});activity.finish();});
        assertTrue("Photo test window detached",detached.await(5,java.util.concurrent.TimeUnit.SECONDS));
    }

}
