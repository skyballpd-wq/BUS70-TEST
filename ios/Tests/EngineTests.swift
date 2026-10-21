import XCTest
@testable import SoshinDriver

final class EngineTests: XCTestCase {
    func testBundledEngineAndServiceDayFailClosed() throws {
        let engine = try Engine(bundle: Bundle(for: DriverController.self))
        XCTAssertEqual(try engine.call("valid", [[:], Date().timeIntervalSince1970 * 1000]) as? Bool, false)
        XCTAssertThrowsError(try engine.object("sync", [[:], ["date": "2000-01-01"], Date().timeIntervalSince1970 * 1000]))
    }
    func testOnlyExactWebOriginCanInvokeNativeBridge() {
        XCTAssertTrue(DriverController.trusted(URL(string: "https://skyballpd-wq.github.io/BUS70-TEST/")))
        for text in ["http://skyballpd-wq.github.io/BUS70-TEST/", "https://skyballpd-wq.github.io/other/", "https://example.com/BUS70-TEST/", "https://example.com:443/BUS70-TEST/", "http://skyballpd-wq.github.io:443/BUS70-TEST/", "https://skyballpd-wq.github.io/BUS70-TEST-other/", "https://skyballpd-wq.github.io/BUS70-TEST/../other/", "https://skyballpd-wq.github.io:8443/BUS70-TEST/"] {
            XCTAssertFalse(DriverController.trusted(URL(string: text)))
        }
    }
    func testServiceDayAndCheckpointStateBridge() throws {
        let engine = try Engine(bundle: Bundle(for: DriverController.self))
        let date = "2099-01-08", now = ISO8601DateFormatter().date(from: "2099-01-08T05:00:00Z")!.timeIntervalSince1970 * 1000
        let stops: [[String: Any]] = [["lat": 37.0, "lng": 127.0], ["lat": 37.01, "lng": 127.0]]
        let trip: [String: Any] = ["trip": 1, "startTime": "14:41", "endTime": "16:00", "course": ["stops": stops], "actualStart": "observed", "actualEnd": "observed"]
        let plan: [String: Any] = ["driverId": "SYN", "date": date, "dispatchId": "SYN-D", "vehicleId": "SYN-V", "route": "5", "trips": [trip], "token": "DO-NOT-PERSIST"]
        let state = try engine.object("sync", [[:], plan, now])
        XCTAssertNil((state["schedule"] as? [String: Any])?["token"])
        let fix: [String: Any] = ["timestamp": now, "coords": ["latitude": 37.0, "longitude": 127.0, "accuracy": 5, "speed": 0]]
        XCTAssertEqual(try engine.object("tick", [state, fix, now])["stop"] as? Bool, true)
    }
    func testNativeResourceRunsWithoutWebView() throws {
        let engine = try Engine(bundle: Bundle(for: DriverController.self))
        let value = try engine.object("status", [["outbox": []]])
        XCTAssertEqual(value["pendingCount"] as? Int, 0)
        XCTAssertEqual(value["driverId"] as? String, "")
    }
}
