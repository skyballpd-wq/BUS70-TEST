package kr.bus70.driver;

import android.content.Intent;
import android.view.View;
import android.widget.FrameLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class SystemBarLayoutTest {
    @Test public void contentStaysInsideSystemBars() throws Exception {
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        try(ActivityScenario<PhotoTestActivity> scenario=ActivityScenario.launch(new Intent(context,PhotoTestActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK))){
            AtomicReference<FrameLayout> root=new AtomicReference<>();CountDownLatch ready=new CountDownLatch(1);
            scenario.onActivity(activity->{
                FrameLayout content=SystemBarLayout.install(activity,new View(activity));root.set(content);
                content.getViewTreeObserver().addOnGlobalLayoutListener(()->{
                    if(ViewCompat.getRootWindowInsets(content)!=null&&content.getChildAt(0).getHeight()>0)ready.countDown();
                });
            });
            assertTrue("system insets must arrive",ready.await(5,TimeUnit.SECONDS));
            scenario.onActivity(activity->{
                FrameLayout content=root.get();View child=content.getChildAt(0);
                Insets safe=ViewCompat.getRootWindowInsets(content).getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout()|WindowInsetsCompat.Type.ime());
                assertTrue("status bar must reserve space",safe.top>0);
                assertEquals(safe.top,content.getPaddingTop());assertEquals(safe.bottom,content.getPaddingBottom());
                assertTrue(child.getTop()>=safe.top);assertTrue(child.getBottom()<=content.getHeight()-safe.bottom);
                assertTrue(child.getLeft()>=safe.left);assertTrue(child.getRight()<=content.getWidth()-safe.right);
            });
        }
    }
}
