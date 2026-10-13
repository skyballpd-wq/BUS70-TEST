package kr.bus70.driver;

/** Pure acceptance rules, independently testable without a phone. */
final class LocationFixPolicy {
    static boolean accept(long ageMs,long timestamp,long lastTimestamp,boolean gps,long sinceGpsMs,float accuracy) {
        return ageMs>=-1000&&ageMs<=10000&&timestamp>lastTimestamp&&accuracy>=0&&accuracy<=60&&(gps||sinceGpsMs>6000);
    }
    static float speed(boolean gps,boolean hasSpeed,float speed,boolean hasAccuracy,float accuracy) {
        return gps&&hasSpeed&&speed>=0&&speed<=55&&(!hasAccuracy||accuracy<=2.5f)?speed:-1;
    }
}
