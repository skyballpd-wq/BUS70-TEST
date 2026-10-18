package kr.bus70.driver;

import android.animation.ValueAnimator;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.widget.RemoteViews;
import java.util.HashMap;
import java.util.Map;

/** A transparent home-screen character, rendered entirely by the widget host.
 * ViewFlipper owns visible-window playback; no timer service, wakelock or network. */
public class MascotWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context context,AppWidgetManager manager,int[] ids){
        RemoteViews views=createViews(context,ValueAnimator.areAnimatorsEnabled());
        manager.updateAppWidget(ids,views);
    }
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int id,Bundle options){onUpdate(c,m,new int[]{id});}

    static RemoteViews createViews(Context context,boolean motion){
        RemoteViews root=new RemoteViews(context.getPackageName(),motion?R.layout.mascot_widget:R.layout.mascot_widget_still);
        PendingIntent open=PendingIntent.getActivity(context,76,new Intent(context,MainActivity.class).setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        root.setOnClickPendingIntent(R.id.mascot_root,open);
        if(!motion)return root;
        root.removeAllViews(R.id.mascot_flipper);
        DisplayMetrics metrics=context.getResources().getDisplayMetrics();
        // Budget below half of Android's screen-based RemoteViews bitmap limit.
        int size=Math.max(40,Math.min(160,(int)Math.sqrt((double)metrics.widthPixels*metrics.heightPixels*3/(40*4))));
        Bitmap[] faces=new Bitmap[4];
        int[] ids={R.drawable.mascot_0,R.drawable.mascot_1,R.drawable.mascot_2,R.drawable.mascot_3};
        for(int i=0;i<4;i++)faces[i]=BitmapFactory.decodeResource(context.getResources(),ids[i]);
        Map<String,Bitmap> frames=new HashMap<>();
        for(int i=0;i<MascotMotion.FRAME_COUNT;i++){
            MascotMotion.Pose pose=MascotMotion.at(i);
            Bitmap frame=frames.get(pose.key());
            if(frame==null){frame=render(faces[pose.face],pose,size);frames.put(pose.key(),frame);}
            RemoteViews item=new RemoteViews(context.getPackageName(),R.layout.mascot_frame);
            item.setImageViewBitmap(R.id.mascot_image,frame);
            root.addView(R.id.mascot_flipper,item);
        }
        // Frame bitmaps remain owned by RemoteViews; only source images are released.
        for(Bitmap face:faces)face.recycle();
        return root;
    }
    static Bitmap render(Bitmap face,MascotMotion.Pose pose,int size){
        Bitmap frame=Bitmap.createBitmap(size,size,Bitmap.Config.ARGB_8888);
        Canvas canvas=new Canvas(frame);canvas.translate(size*.5f,size*(.55f-pose.lift));
        canvas.rotate(pose.rotation);canvas.scale(pose.scaleX,pose.scaleY);
        float half=size*.31f;
        canvas.drawBitmap(face,new Rect(0,0,face.getWidth(),face.getHeight()),new RectF(-half,-half,half,half),new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG));
        return frame;
    }
}
