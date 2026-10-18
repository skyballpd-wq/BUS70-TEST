package kr.bus70.driver;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Parcel;
import android.app.Instrumentation;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import android.widget.ViewFlipper;

@RunWith(AndroidJUnit4.class)
public class MascotWidgetTest {
    private Instrumentation getInstrumentation(){return InstrumentationRegistry.getInstrumentation();}
    @Test public void testRealRemoteViewsInflateAnimateAndStopWhenDetached() throws Exception {
        android.content.Context context=getInstrumentation().getTargetContext();
        Activity activity=getInstrumentation().startActivitySync(new Intent(context,MascotTestActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        RemoteViews views=MascotWidget.createViews(context,true);
        Parcel parcel=Parcel.obtain();views.writeToParcel(parcel,0);assertTrue("Binder payload stays bounded",parcel.dataSize()<900000);parcel.recycle();
        ViewFlipper[] flipper=new ViewFlipper[1];
        getInstrumentation().runOnMainSync(()->{
            FrameLayout host=new FrameLayout(activity);activity.setContentView(host);
            View widget=views.apply(activity,host);host.addView(widget,new FrameLayout.LayoutParams(300,300));
            flipper[0]=widget.findViewById(R.id.mascot_flipper);
            assertEquals(64,flipper[0].getChildCount());assertEquals(120,flipper[0].getFlipInterval());assertTrue(flipper[0].isAutoStart());
            assertTrue(widget.findViewById(R.id.mascot_root).hasOnClickListeners());
        });
        getInstrumentation().waitForIdleSync();int before=flipper[0].getDisplayedChild();Thread.sleep(420);
        assertTrue("Actual Android ViewFlipper advances frames",flipper[0].getDisplayedChild()!=before);
        // Activity.finish() returns before the window's exit animation and detach.
        // Observe the real detach event before checking that no frame is scheduled.
        java.util.concurrent.CountDownLatch detached=new java.util.concurrent.CountDownLatch(1);
        getInstrumentation().runOnMainSync(()->{
            flipper[0].addOnAttachStateChangeListener(new View.OnAttachStateChangeListener(){
                @Override public void onViewAttachedToWindow(View view){}
                @Override public void onViewDetachedFromWindow(View view){detached.countDown();}
            });
            activity.finish();
        });
        assertTrue("Window must detach",detached.await(5,java.util.concurrent.TimeUnit.SECONDS));
        getInstrumentation().waitForIdleSync();
        int stopped=flipper[0].getDisplayedChild();Thread.sleep(360);assertEquals(stopped,flipper[0].getDisplayedChild());
    }
    @Test public void testAlphaAndReducedMotionFallback(){
        android.content.Context context=getInstrumentation().getTargetContext();
        Bitmap face=BitmapFactory.decodeResource(context.getResources(),R.drawable.mascot_0);
        assertEquals(0,Color.alpha(face.getPixel(0,0)));
        for(int i=0;i<64;i++){
            Bitmap frame=MascotWidget.render(face,MascotMotion.at(i),160);
            assertEquals(0,Color.alpha(frame.getPixel(0,0)));assertEquals(0,Color.alpha(frame.getPixel(159,159)));frame.recycle();
        }
        getInstrumentation().runOnMainSync(()->{
            View still=MascotWidget.createViews(context,false).apply(context,new FrameLayout(context));
            assertNull(still.findViewById(R.id.mascot_flipper));assertTrue(still.hasOnClickListeners());
        });face.recycle();
    }
}
