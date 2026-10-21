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
        for text in ["http://skyballpd-wq.github.io/BUS70-TEST/", "https://skyballpd-wq.github.io/other/", "https://example.com/BUS70-TEST/", "https://skyballpd-wq.github.io:8443/BUS70-TEST/"] {
            XCTAssertFalse(DriverController.trusted(URL(string: text)))
        }
    }
    func testNativeResourceRunsWithoutWebView() throws {
        let engine = try Engine(bundle: Bundle(for: DriverController.self))
        let value = try engine.object("status", [["outbox": []]])
        XCTAssertEqual(value["pendingCount"] as? Int, 0)
        XCTAssertEqual(value["driverId"] as? String, "")
    }
}
