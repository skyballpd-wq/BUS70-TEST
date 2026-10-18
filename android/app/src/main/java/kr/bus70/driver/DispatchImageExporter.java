package kr.bus70.driver;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import org.json.JSONObject;

/** Exports only user-requested dispatch PNGs; never chooses a recipient. */
final class DispatchImageExporter {
    static final int SAVE_IMAGE=81;
    interface Result { void send(JSONObject result); }
    private final Activity activity;
    private final Result result;
    private boolean busy;
    private byte[] pending;
    private String pendingId;
    DispatchImageExporter(Activity activity,Result result){this.activity=activity;this.result=result;}

    static byte[] decode(String name,String encoded){
        if(name==null||!name.matches("BUS[0-9]{1,4}-[0-9]{4}-[0-9]{2}-[0-9]{2}\\.png")||encoded==null||encoded.length()>7000000)throw new IllegalArgumentException();
        byte[] bytes=android.util.Base64.decode(encoded,android.util.Base64.DEFAULT);
        byte[] signature={(byte)137,80,78,71,13,10,26,10};
        if(bytes.length<signature.length||bytes.length>5000000)throw new IllegalArgumentException();
        for(int i=0;i<signature.length;i++)if(bytes[i]!=signature[i])throw new IllegalArgumentException();
        android.graphics.BitmapFactory.Options options=new android.graphics.BitmapFactory.Options();options.inJustDecodeBounds=true;
        android.graphics.BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
        if(options.outWidth<1||options.outHeight<1||options.outWidth>4096||options.outHeight>4096)throw new IllegalArgumentException();
        return bytes;
    }

    Intent shareIntent(String name,byte[] bytes) throws Exception {
        File folder=new File(activity.getCacheDir(),"dispatch-share");
        if(!folder.isDirectory()&&!folder.mkdirs())throw new java.io.IOException();
        File[] old=folder.listFiles();if(old!=null)for(File file:old)if(file.isFile()&&System.currentTimeMillis()-file.lastModified()>86400000L)file.delete();
        File file=File.createTempFile("dispatch-","-"+name,folder);
        try(FileOutputStream out=new FileOutputStream(file)){out.write(bytes);}
        Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".photos",file);
        Intent intent=new Intent(Intent.ACTION_SEND).setType("image/png")
            .putExtra(Intent.EXTRA_STREAM,uri).putExtra(Intent.EXTRA_TITLE,name)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.setClipData(ClipData.newUri(activity.getContentResolver(),name,uri));
        return intent;
    }

    // Called on the UI thread after checking the current WebView origin.
    void export(String requestId,String action,String name,String encoded){
        if(requestId==null||!requestId.matches("[A-Za-z0-9-]{1,80}"))return;
        if(busy){send(requestId,false,"error","이미지 처리 중입니다. 잠시 후 다시 누르세요.");return;}
        if(!"share".equals(action)&&!"save".equals(action)){send(requestId,false,"error","이미지 처리 방식을 확인하세요.");return;}
        busy=true;
        new Thread(()->{
            try{
                byte[] bytes=decode(name,encoded);
                Intent share="share".equals(action)?shareIntent(name,bytes):null;
                activity.runOnUiThread(()->{
                    try{
                        if(activity.isFinishing()||activity.isDestroyed())throw new IllegalStateException();
                        if(share!=null){
                            activity.startActivity(Intent.createChooser(share,"배차 이미지 공유 · 카카오톡 선택"));
                            busy=false;send(requestId,true,"opened","공유창을 열었습니다. 카카오톡에서 대화방과 전송을 확인하세요.");
                        }else{
                            pending=bytes;pendingId=requestId;
                            activity.startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/png").putExtra(Intent.EXTRA_TITLE,name),SAVE_IMAGE);
                        }
                    }catch(Exception error){pending=null;pendingId=null;busy=false;send(requestId,false,"error","이미지 공유·저장 화면을 열지 못했습니다. 다시 시도하세요.");}
                });
            }catch(Exception error){activity.runOnUiThread(()->{busy=false;send(requestId,false,"error","배차 이미지를 준비하지 못했습니다. 이미지를 다시 생성하세요.");});}
        },"dispatch-image-export").start();
    }

    boolean onResult(int requestCode,int resultCode,Intent data){
        if(requestCode!=SAVE_IMAGE)return false;
        byte[] bytes=pending;String id=pendingId;pending=null;pendingId=null;
        if(resultCode!=Activity.RESULT_OK||data==null||data.getData()==null||bytes==null){busy=false;if(id!=null)send(id,true,"cancelled","이미지 저장을 취소했습니다.");return true;}
        Uri destination=data.getData();
        new Thread(()->{
            boolean ok=false;
            try(OutputStream out=activity.getContentResolver().openOutputStream(destination)){if(out==null)throw new java.io.IOException();out.write(bytes);ok=true;}catch(Exception ignored){}
            final boolean saved=ok;activity.runOnUiThread(()->{busy=false;send(id,saved,saved?"saved":"error",saved?"배차 이미지 저장 완료":"이미지 저장에 실패했습니다. 다시 시도하세요.");});
        },"dispatch-image-save").start();
        return true;
    }
    private void send(String id,boolean ok,String state,String message){try{result.send(new JSONObject().put("requestId",id).put("ok",ok).put("state",state).put("message",message));}catch(Exception ignored){}}
}
