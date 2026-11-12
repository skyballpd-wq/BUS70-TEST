package kr.bus70.driver;

import org.json.JSONObject;

/** Fixed foreground messages; the web bridge cannot submit arbitrary speech. */
final class DriverGuidancePolicy {
    static String message(JSONObject request, JSONObject schedule) {
        if (!schedule.optBoolean("roadSafetyEnabled") || request.optString("driverId").isEmpty()
                || !request.optString("driverId").equals(schedule.optString("driverId"))
                || !request.optString("date").equals(schedule.optString("date"))
                || !request.optString("dispatchId").equals(schedule.optString("dispatchId"))) return null;
        String kind=request.optString("kind"); int gap=request.optInt("gap",-1);
        if ("SCHOOL_FACILITY".equals(kind)) return "어린이보호시설 인근입니다. 속도표지와 보행자를 확인해 주세요.";
        if (gap<1 || gap>2) return null;
        if ("FRONT".equals(kind)) return "앞차와 "+gap+"정류장 간격입니다. 배차 간격을 확인해 주세요.";
        if ("REAR".equals(kind)) return "뒷차가 "+gap+"정류장 이내입니다. 운행 간격을 확인해 주세요.";
        return null;
    }
}
