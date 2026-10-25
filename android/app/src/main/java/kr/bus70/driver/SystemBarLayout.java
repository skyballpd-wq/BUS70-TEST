package kr.bus70.driver;

import android.app.Activity;
import android.graphics.Color;
import android.view.View;
import android.widget.FrameLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

/** Keep the WebView viewport clear of Android system controls and the keyboard. */
final class SystemBarLayout {
    static FrameLayout install(Activity activity,View web){
        WindowCompat.setDecorFitsSystemWindows(activity.getWindow(),false);
        FrameLayout content=new FrameLayout(activity);
        content.setBackgroundColor(Color.WHITE);
        content.addView(web,new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.MATCH_PARENT));
        ViewCompat.setOnApplyWindowInsetsListener(content,(view,insets)->{
            Insets safe=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout()|WindowInsetsCompat.Type.ime());
            view.setPadding(safe.left,safe.top,safe.right,safe.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        activity.setContentView(content);
        WindowCompat.getInsetsController(activity.getWindow(),content).setAppearanceLightStatusBars(true);
        WindowCompat.getInsetsController(activity.getWindow(),content).setAppearanceLightNavigationBars(true);
        ViewCompat.requestApplyInsets(content);
        return content;
    }
}
