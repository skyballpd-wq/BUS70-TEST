package kr.bus70.driver;

/** Local decorative timeline. It never reads driver, trip, alarm or GPS state. */
public final class MascotMotion {
    public static final int FRAME_COUNT=64, FRAME_MS=120;
    public static final class Pose {
        public final int face;
        public final float rotation, lift, scaleX, scaleY;
        Pose(int face,float rotation,float lift,float scaleX,float scaleY){this.face=face;this.rotation=rotation;this.lift=lift;this.scaleX=scaleX;this.scaleY=scaleY;}
        public String key(){return face+":"+rotation+":"+lift+":"+scaleX+":"+scaleY;}
    }
    public static Pose at(int index){
        int frame=Math.floorMod(index,FRAME_COUNT);
        int face=(frame==10||frame==11)?1:((frame==42||frame==43)?3:(frame>=18&&frame<60?2:0));
        float rotation=frame>=24&&frame<=39?360f*(frame-24)/15f:0;
        float lift=frame>=44&&frame<=55?(float)(.16*Math.sin(Math.PI*(frame-44)/11)):0;
        float sx=frame>=56&&frame<=58?1.06f:1f,sy=frame>=56&&frame<=58?.94f:1f;
        return new Pose(face,rotation,lift,sx,sy);
    }
    private MascotMotion(){}
}
