import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private var controller: DriverController?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        do { let controller = DriverController(tracker: try DriverTracker(engine: Engine(), store: SecureStore())); self.controller = controller; window.rootViewController = controller }
        catch { let screen = UIViewController(); screen.view.backgroundColor = .systemBackground; let label = UILabel(frame: screen.view.bounds); label.text = "기기 기록을 열 수 없습니다. 앱을 삭제하지 말고 관리자에게 문의하세요."; label.numberOfLines = 0; label.textAlignment = .center; screen.view.addSubview(label); window.rootViewController = screen }
        self.window = window; window.makeKeyAndVisible(); return true
    }
    func applicationDidBecomeActive(_ application: UIApplication) { controller?.resume() }
}
final class DriverController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler, WKUIDelegate {
    private let tracker: DriverTracker
    private var web: WKWebView!
    private let status = UILabel()
    private static let home = URL(string: "https://skyballpd-wq.github.io/BUS70-TEST/")!
    static func trusted(_ url: URL?) -> Bool {
        guard let url = url else { return false }
        guard url.scheme == "https" else { return false }
        guard url.host == "skyballpd-wq.github.io" else { return false }
        if let port = url.port { guard port == 443 else { return false } }
        let path = url.standardized.path
        return path == "/BUS70-TEST" || path.hasPrefix("/BUS70-TEST/")
    }
    init(tracker: DriverTracker) { self.tracker = tracker; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) unavailable") }
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .systemBackground
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "bus70")
        let script = """
        if (location.origin === 'https://skyballpd-wq.github.io' && location.pathname.startsWith('/BUS70-TEST/')) {
          const call=(method,args=[])=>window.webkit.messageHandlers.bus70.postMessage({method,args});
          window.Bus70IOS=Object.freeze({
            ensureLocationTracking:s=>call('ensure',[s]),syncTrackingSchedule:s=>call('sync',[s]),
            startLocationTracking:()=>call('start'),stopLocationTracking:()=>call('stop'),
            clearDriverSession:()=>call('logout'),locationStatus:()=>call('status'),
            syncPendingEvents:(driver,token)=>call('pending',[driver,token]),openLocationSettings:()=>call('settings')
          });
        }
        """
        config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: config); web.navigationDelegate = self; web.uiDelegate = self
        status.text = "iPhone 시험 앱 · 로그인 후 배차 확인"; status.font = .preferredFont(forTextStyle: .caption1); status.numberOfLines = 2; status.accessibilityIdentifier = "nativeStatus"
        let voice = UIButton(type: .system); voice.setTitle("음성 시험", for: .normal); voice.addTarget(self, action: #selector(testVoice), for: .touchUpInside)
        let stop = UIButton(type: .system); stop.setTitle("기록 중지", for: .normal); stop.addTarget(self, action: #selector(stopTracking), for: .touchUpInside)
        let bar = UIStackView(arrangedSubviews: [status, voice, stop]); bar.spacing = 8; bar.alignment = .center
        let stack = UIStackView(arrangedSubviews: [bar, web]); stack.axis = .vertical; stack.spacing = 4; stack.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 8),stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -8),stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),bar.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)])
        tracker.onStatus = { [weak self] value in
            guard let self = self else { return }; self.status.text = value["message"] as? String
            guard Self.trusted(self.web.url), let data = try? JSONSerialization.data(withJSONObject: value), let json = String(data: data, encoding: .utf8) else { return }
            self.web.evaluateJavaScript("window.bus70NativeLocationStatus && window.bus70NativeLocationStatus(\(json));", completionHandler: nil)
        }
        web.load(URLRequest(url: Self.home))
    }
    func resume() { tracker.resume() }
    @objc private func testVoice() { tracker.testVoice() }
    @objc private func stopTracking() {
        tracker.stop()
        if Self.trusted(web.url) { web.evaluateJavaScript("if (typeof driverLocationPreference==='function') localStorage.setItem(driverLocationPreference(),'N');") }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, Self.trusted(message.frameInfo.request.url), Self.trusted(web.url), let body = message.body as? [String: Any], let method = body["method"] as? String else { return }
        let args = body["args"] as? [String] ?? []
        switch method {
        case "ensure", "sync": if let json = args.first { tracker.configure(json, start: method == "ensure") }
        case "start": tracker.resume()
        case "stop": tracker.stop()
        case "logout": tracker.logout()
        case "status": tracker.report()
        case "pending": if args.count == 2 { tracker.syncPending(driver: args[0], token: args[1]) }
        case "settings": if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        default: break
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if Self.trusted(navigationAction.request.url) { decisionHandler(.allow); return }
        if navigationAction.navigationType == .linkActivated, let url = navigationAction.request.url, ["https", "tel", "mailto"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { tracker.report() }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "소신여객", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler() }); present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "소신여객", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(false) }); alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler(true) }); present(alert, animated: true)
    }
}
