package kr.bus70.driver;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.net.Uri;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class DispatchImageExporterTest {
    private byte[] png(){Bitmap bitmap=Bitmap.createBitmap(3,3,Bitmap.Config.ARGB_8888);java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,out);bitmap.recycle();return out.toByteArray();}
    @Test public void onlyPngAndSafeNamesAreAccepted(){
        String encoded=android.util.Base64.encodeToString(png(),android.util.Base64.NO_WRAP);
        assertTrue(DispatchImageExporter.decode("BUS5-2099-01-08.png",encoded).length>8);
        for(String name:new String[]{"../secret.png","BUS5-2099-01-08.html","anything.png"})try{DispatchImageExporter.decode(name,encoded);fail(name);}catch(IllegalArgumentException expected){}
        try{DispatchImageExporter.decode("BUS70-2099-01-08.png","aGVsbG8=");fail();}catch(IllegalArgumentException expected){}
    }
    @Test public void shareUsesReadablePrivateUriAndSaveCancellationIsHonest() throws Exception {
        Instrumentation instrument=InstrumentationRegistry.getInstrumentation();android.content.Context context=instrument.getTargetContext();
        // Launch a fresh task and wait for its lifecycle, independently of the preceding chooser tests.
        try(ActivityScenario<PhotoTestActivity> scenario=ActivityScenario.launch(new Intent(context,PhotoTestActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK))){
        java.util.concurrent.atomic.AtomicReference<Activity> host=new java.util.concurrent.atomic.AtomicReference<>();scenario.onActivity(host::set);Activity activity=host.get();
        IntentFilter saveFilter=new IntentFilter(Intent.ACTION_CREATE_DOCUMENT);saveFilter.addCategory(Intent.CATEGORY_OPENABLE);saveFilter.addDataType("image/png");
        Instrumentation.ActivityMonitor monitor=instrument.addMonitor(saveFilter,new Instrumentation.ActivityResult(Activity.RESULT_CANCELED,null),true);
        try{
            java.util.concurrent.atomic.AtomicReference<JSONObject> result=new java.util.concurrent.atomic.AtomicReference<>();CountDownLatch cancelled=new CountDownLatch(1);
            DispatchImageExporter exporter=new DispatchImageExporter(activity,value->{result.set(value);cancelled.countDown();});
            byte[] bytes=png();Intent share=exporter.shareIntent("BUS70-2099-01-08.png",bytes);
            assertEquals(Intent.ACTION_SEND,share.getAction());assertEquals("image/png",share.getType());assertNull(share.getPackage());assertNull(share.getComponent());
            Uri uri=share.getParcelableExtra(Intent.EXTRA_STREAM);assertNotNull(uri);assertEquals("content",uri.getScheme());assertEquals(context.getPackageName()+".photos",uri.getAuthority());
            assertEquals(uri,share.getClipData().getItemAt(0).getUri());assertTrue((share.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION)!=0);assertEquals(0,share.getFlags()&Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            try(java.io.InputStream in=context.getContentResolver().openInputStream(uri)){java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[1024];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);assertArrayEquals(bytes,out.toByteArray());}
            String encoded=android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP);
            instrument.runOnMainSync(()->exporter.export("test-save","save","BUS5-2099-01-08.png",encoded));
            long until=System.currentTimeMillis()+5000;while(monitor.getHits()==0&&System.currentTimeMillis()<until)Thread.sleep(20);
            assertEquals(1,monitor.getHits());
            instrument.runOnMainSync(()->assertTrue(exporter.onResult(DispatchImageExporter.SAVE_IMAGE,Activity.RESULT_CANCELED,null)));
            assertTrue(cancelled.await(3,TimeUnit.SECONDS));assertEquals("cancelled",result.get().getString("state"));
            assertNotEquals("saved",result.get().getString("state"));
        }finally{instrument.removeMonitor(monitor);}
        }
    }
}
