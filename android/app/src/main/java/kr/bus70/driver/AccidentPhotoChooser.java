package kr.bus70.driver;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.File;
import java.util.ArrayList;

/** Camera uses a private cache file; gallery access is granted only to chosen images. */
final class AccidentPhotoChooser {
    static final int REQUEST=77;
    private final Activity activity;
    private ValueCallback<Uri[]> callback;
    private Uri cameraUri;
    AccidentPhotoChooser(Activity activity){this.activity=activity;}
    boolean open(ValueCallback<Uri[]> next,WebChromeClient.FileChooserParams params){
        cancel();callback=next;
        try{
            Intent intent=createIntent(params.isCaptureEnabled(),params.getMode()==WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);
            activity.startActivityForResult(intent,REQUEST);
        }catch(Exception error){cancel();Toast.makeText(activity,"촬영 또는 사진 선택 앱을 열지 못했습니다.",Toast.LENGTH_LONG).show();}
        return true;
    }
    Intent createIntent(boolean capture,boolean multiple) throws java.io.IOException {
            Intent intent;
            if(capture){
                File dir=new File(activity.getCacheDir(),"accident-camera");if(!dir.exists()&&!dir.mkdirs())throw new IllegalStateException();
                File[] files=dir.listFiles();if(files!=null)for(File f:files)if(System.currentTimeMillis()-f.lastModified()>86400000L)f.delete();
                File photo=File.createTempFile("capture-",".jpg",dir);
                cameraUri=FileProvider.getUriForFile(activity,activity.getPackageName()+".photos",photo);
                intent=new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT,cameraUri);
                intent.setClipData(ClipData.newRawUri("Accident photo",cameraUri));
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            }else{
                intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,multiple);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
            return intent;
    }
    boolean result(int requestCode,int resultCode,Intent data){
        if(requestCode!=REQUEST)return false;
        ValueCallback<Uri[]> target=callback;callback=null;
        if(target==null){cameraUri=null;return true;}
        ArrayList<Uri> values=new ArrayList<>();
        if(resultCode==Activity.RESULT_OK){
            if(cameraUri!=null)values.add(cameraUri);
            else if(data!=null){
                ClipData clip=data.getClipData();
                if(clip!=null)for(int i=0;i<Math.min(10,clip.getItemCount());i++)addSelected(values,clip.getItemAt(i).getUri());
                else addSelected(values,data.getData());
            }
        }
        cameraUri=null;target.onReceiveValue(values.isEmpty()?null:values.toArray(new Uri[0]));return true;
    }
    private void addSelected(ArrayList<Uri> values,Uri uri){
        if(uri==null||!"content".equals(uri.getScheme())||(activity.getPackageName()+".photos").equals(uri.getAuthority()))return;
        try{String mime=activity.getContentResolver().getType(uri);if(mime!=null&&mime.startsWith("image/")&&!values.contains(uri))values.add(uri);}catch(Exception ignored){}
    }
    void cancel(){if(callback!=null){callback.onReceiveValue(null);callback=null;}cameraUri=null;}
}
