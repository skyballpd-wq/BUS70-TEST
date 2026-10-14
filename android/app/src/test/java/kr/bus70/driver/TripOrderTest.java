package kr.bus70.driver;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

public class TripOrderTest {
    @Test public void recoverCurrentTripWithoutWritingHistoricalEvents() throws Exception {
        InputStream stream=getClass().getClassLoader().getResourceAsStream("active-trip-cases.json");
        assertNotNull(stream);
        String text=new String(stream.readAllBytes(),StandardCharsets.UTF_8);stream.close();
        JSONArray samples=new JSONArray(text);
        for(int i=0;i<samples.length();i++){
            JSONObject sample=samples.getJSONObject(i);JSONArray trips=sample.getJSONArray("trips"),logs=sample.getJSONArray("logs");
            for(int j=0;j<trips.length();j++){
                JSONObject log=logs.getJSONObject(j);java.util.Iterator<String> keys=log.keys();
                while(keys.hasNext()){String key=keys.next();trips.getJSONObject(j).put(key,log.get(key));}
            }
            String before=trips.toString();
            assertEquals(sample.getString("name"),sample.getInt("expected"),TripOrder.active(trips,sample.getString("date"),TripOrder.moment(sample.getString("date"),sample.getString("now"))));
            assertEquals("Do not fabricate event timestamps",before,trips.toString());
        }
    }
}
