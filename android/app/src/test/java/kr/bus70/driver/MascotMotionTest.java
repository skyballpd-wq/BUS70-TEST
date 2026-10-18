package kr.bus70.driver;
import org.junit.Test;
import static org.junit.Assert.*;
public class MascotMotionTest {
    @Test public void greetingBlinksSmilesTurnsAndReturnsHome(){
        assertEquals(0,MascotMotion.at(0).face);assertEquals(1,MascotMotion.at(10).face);
        assertEquals(0,MascotMotion.at(12).face);assertEquals(2,MascotMotion.at(18).face);
        assertEquals(0,MascotMotion.at(24).rotation,0);assertEquals(360,MascotMotion.at(39).rotation,0);
        assertEquals(3,MascotMotion.at(42).face);assertTrue(MascotMotion.at(49).lift>.15f);
        assertEquals(0,MascotMotion.at(55).lift,.00001f);
        assertEquals(MascotMotion.at(0).key(),MascotMotion.at(63).key());
        assertEquals(MascotMotion.at(0).key(),MascotMotion.at(64).key());
    }
    @Test public void everyPoseStaysInsideBoundedAnimation(){
        java.util.Set<String> unique=new java.util.HashSet<>();
        for(int i=0;i<MascotMotion.FRAME_COUNT;i++){
            MascotMotion.Pose p=MascotMotion.at(i);unique.add(p.key());
            assertTrue(p.face>=0&&p.face<4);assertTrue(p.rotation>=0&&p.rotation<=360);
            assertTrue(p.lift>=0&&p.lift<=.16f);assertTrue(p.scaleX<=1.06f&&p.scaleY>=.94f);
        }
        assertTrue("Memory budget assumes at most 40 unique bitmaps",unique.size()<=40);
    }
}
