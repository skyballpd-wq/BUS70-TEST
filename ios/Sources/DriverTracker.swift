import UIKit
import CoreLocation

final class DriverTracker: NSObject, CLLocationManagerDelegate {
    static let apiURL = "https://script.google.com/macros/s/AKfycbyFE-F4JEI8ITYO6RouVJh6KS5kvCFfs8y1u3_VO541SCpaSviwexPAOV6zPNculXfP/exec"
    private let engine: Engine
    private let store: SecureStore
    private let location = CLLocationManager()
    private let speaker = ArrivalSpeaker()
    private var state: [String: Any]
    private var wanted = false, active = false, liveBusy = false, eventBusy = false
    private var askedAlways = false
    private var lastSnapshot: Double = 0
    private var lastLive: Double = 0
    private var message = "로그인 후 현재 배차를 확인하세요."
    var onStatus: (([String: Any]) -> Void)?
    private let network: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 20; config.timeoutIntervalForResource = 30
        config.urlCache = nil; config.httpCookieStorage = nil
        return URLSession(configuration: config)
    }()
    private var now: Double { Date().timeIntervalSince1970 * 1000 }
    private var schedule: [String: Any] { state["schedule"] as? [String: Any] ?? [:] }
    private var owner: String { schedule["driverId"] as? String ?? "" }
    private var binding: String { state["binding"] as? String ?? "" }
    init(engine: Engine, store: SecureStore) throws {
        self.engine = engine; self.store = store; self.state = try store.read()
        super.init()
        location.delegate = self; location.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        location.distanceFilter = kCLDistanceFilterNone; location.activityType = .automotiveNavigation
        location.pausesLocationUpdatesAutomatically = false
        location.allowsBackgroundLocationUpdates = true; location.showsBackgroundLocationIndicator = true
        // Never auto-start solely from a persisted old shift after app launch.
    }
    private func persist(_ next: [String: Any]) throws { try store.write(next); state = next; lastSnapshot = now }
    func configure(_ json: String, start: Bool) {
        do {
            guard json.utf8.count < 2_000_000, let data = json.data(using: .utf8), var incoming = try JSONSerialization.jsonObject(with: data) as? [String: Any], incoming["apiUrl"] as? String == Self.apiURL, let token = incoming.removeValue(forKey: "token") as? String, !token.isEmpty, let driver = incoming["driverId"] as? String else { throw NativeFailure.session }
            let oldOwner = owner
            let next = try engine.object("sync", [state, incoming, now])
            if oldOwner != driver { stop(); if !oldOwner.isEmpty { store.removeToken(oldOwner) } }
            try store.setToken(token, owner: driver); try persist(next)
            flushEvents()
            if start { wanted = true; authorize() }
        } catch { stop("배차·인증·기기 저장 확인 필요") }
        report()
    }
    private func authorize() {
        guard wanted, UIApplication.shared.applicationState == .active else { return }
        switch location.authorizationStatus {
        case .notDetermined: location.requestWhenInUseAuthorization()
        case .authorizedWhenInUse: message = "화면 잠금 중 기록을 위해 설정에서 위치를 ‘항상’으로 허용하세요."; if !askedAlways { askedAlways = true; location.requestAlwaysAuthorization() }
        case .authorizedAlways:
            guard location.accuracyAuthorization == .fullAccuracy else { message = "설정에서 정확한 위치를 켜 주세요."; report(); return }
            location.startUpdatingLocation(); active = true; message = "위치 자동기록 중 · 잠금 상태 실기기 검증 필요"
        default: stop("위치 권한 필요 · 설정에서 항상 허용 및 정확한 위치 켜기")
        }
        report()
    }
    func resume() { if wanted { authorize() }; flushEvents(); report() }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus != .authorizedAlways { location.stopUpdatingLocation(); active = false }
        if wanted { authorize() }; report()
    }
    func stop(_ text: String = "위치 자동기록 일시중지") { wanted = false; active = false; location.stopUpdatingLocation(); speaker.cancel(); message = text; report() }
    func logout() { stop("로그아웃 · 위치 수집 중지"); store.removeToken(owner) }
    func syncPending(driver: String, token: String) {
        guard driver == owner, !token.isEmpty else { return }
        do { try store.setToken(token, owner: driver); flushEvents() } catch { stop("인증정보 저장 확인 필요") }
    }
    func report() {
        var result = (try? engine.object("status", [state])) ?? [:]
        result["active"] = active; result["ok"] = true; result["message"] = message
        result["permissionGranted"] = location.authorizationStatus == .authorizedAlways && location.accuracyAuthorization == .fullAccuracy
        result["locationEnabled"] = CLLocationManager.locationServicesEnabled()
        result["platform"] = "ios"; onStatus?(result)
    }
    func testVoice() { _ = speaker.speak("소신여객 아이폰 음성 안내 시험입니다. 안전하게 운행하세요.") { _ in } }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code == .denied { stop("위치 권한이 해제되었습니다.") }
        else { message = "GPS 재수신 대기"; report() }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard active, let fix = locations.last else { return }
        if fix.sourceInformation?.isSimulatedBySoftware == true && !_isDebugAssertConfiguration() { message = "모의 위치는 운행기록에 사용하지 않습니다."; report(); return }
        let speed: Any = fix.speed >= 0 && fix.speedAccuracy >= 0 && fix.speedAccuracy <= 4 ? fix.speed : NSNull()
        let position: [String: Any] = ["timestamp": fix.timestamp.timeIntervalSince1970 * 1000, "coords": ["latitude": fix.coordinate.latitude, "longitude": fix.coordinate.longitude, "accuracy": fix.horizontalAccuracy, "speed": speed, "speedAccuracy": fix.speedAccuracy, "heading": fix.course >= 0 ? fix.course as Any : NSNull()]]
        do {
            let result = try engine.object("tick", [state, position, now])
            guard let next = result["state"] as? [String: Any] else { throw NativeFailure.engine }
            let oldEvents = state["outbox"] as? NSArray ?? []
            let newEvents = next["outbox"] as? NSArray ?? []
            // Checkpoints commit immediately. Coalesce ordinary GPS snapshots so
            // the full route plan is not rewritten to flash on every 1 Hz fix.
            if !oldEvents.isEqual(newEvents) || result["stop"] as? Bool == true || now-lastSnapshot >= 15000 {
                try persist(next)
            } else { state = next }
            message = result["message"] as? String ?? "GPS 수신 중"
            flushEvents()
            if result["stop"] as? Bool == true { stop("오늘 운행 종료 · 위치 수집 중지"); return }
            if let body = result["location"] as? [String: Any] { sendLive(body) }
            if result["speak"] as? Bool == true { announce() }
            report()
        } catch { stop("기기 기록 저장 실패 · 저장 공간 확인 필요") }
    }
    private func announce() {
        let captured = binding, trip = state["currentTrip"] as? Int
        let current = (state["states"] as? [String: Any])?[String(trip ?? -1)] as? [String: Any]
        let estimate = current?["estimate"] as? [String: Any]
        let expected: [String: Any] = ["trip": trip ?? -1, "stopIndex": estimate?["stopIndex"] ?? -1]
        do { try persist(engine.object("spoke", [state, now, false, expected])) } catch { return }
        _ = speaker.speak("차고지에 예정 시각보다 10분 이상 일찍 도착할 것으로 예상됩니다. 배차 시간을 확인하고 안전하게 운행하세요.") { [weak self] accepted in
            guard let self = self, self.binding == captured, self.state["currentTrip"] as? Int == trip else { return }
            do { try self.persist(self.engine.object("spoke", [self.state, self.now, accepted, expected])) } catch { self.stop("음성 안내 상태 저장 실패") }
        }
    }
    private func post(_ body: [String: Any], token: String, completion: @escaping ([String: Any]) -> Void) {
        var body = body; body["token"] = token
        guard let url = URL(string: Self.apiURL), let data = try? JSONSerialization.data(withJSONObject: body) else { completion([:]); return }
        var request = URLRequest(url: url); request.httpMethod = "POST"; request.httpBody = data
        request.setValue("text/plain;charset=utf-8", forHTTPHeaderField: "Content-Type")
        let task = UIApplication.shared.beginBackgroundTask(withName: "운행기록 전송")
        network.dataTask(with: request) { data, response, _ in
            let ok = (response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
            let result = ok ? data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:] : [:]
            DispatchQueue.main.async { completion(result); if task != .invalid { UIApplication.shared.endBackgroundTask(task) } }
        }.resume()
    }
    private func bindingError(_ r: [String: Any]) -> Bool { ["AUTH_REQUIRED", "INVALID_TOKEN", "TOKEN_EXPIRED", "DISPATCH_NOT_FOUND", "DISPATCH_MISMATCH", "VEHICLE_NOT_ASSIGNED", "VEHICLE_MISMATCH", "TRIP_NOT_SCHEDULED"].contains(r["error"] as? String ?? "") }
    private func sendLive(_ body: [String: Any]) {
        guard !liveBusy, now-lastLive >= 20000, let token = store.token(owner) else { return }
        liveBusy = true; lastLive = now; let captured = binding
        post(body, token: token) { [weak self] result in
            guard let self = self else { return }; self.liveBusy = false
            guard self.binding == captured else { return }
            if self.bindingError(result) { self.stop("로그인 또는 배정 차량 재확인 필요"); return }
            if result["ok"] as? Bool == true { do { try self.persist(self.engine.object("reference", [self.state, result, self.now])) } catch { self.stop("차량 대조 저장 실패") } }
            else { self.message = "통신 확인 필요 · 기점 기록은 기기에 보관" }
            self.report()
        }
    }
    private func flushEvents() {
        guard !eventBusy, !owner.isEmpty, let token = store.token(owner), let item = try? engine.call("next", [state, owner, now]) as? [String: Any], let key = item["key"] as? String, var body = item["body"] as? [String: Any] else { return }
        eventBusy = true; body["deferredGPS"] = true; let captured = binding
        post(body, token: token) { [weak self] result in
            guard let self = self else { return }; self.eventBusy = false
            do { try self.persist(self.engine.object("response", [self.state, key, result, self.now])) } catch { self.stop("전송 상태 저장 실패"); return }
            if self.binding == captured && self.bindingError(result) { self.stop("인증·배차 재확인 필요 · 미전송 기록 보관") }
            self.report()
            if result["ok"] as? Bool == true { self.flushEvents() }
        }
    }
}
