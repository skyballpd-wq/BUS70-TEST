import Foundation
import JavaScriptCore

enum NativeFailure: Error { case engine, storage, session }
final class Engine {
    private let context: JSContext
    init(bundle: Bundle = .main) throws {
        guard let context = JSContext() else { throw NativeFailure.engine }
        self.context = context
        for name in ["driver-automation", "driver-outbox", "arrival-policy", "native-engine"] {
            guard let url = bundle.url(forResource: name, withExtension: "js") else { throw NativeFailure.engine }
            context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
            guard context.exception == nil else { throw NativeFailure.engine }
        }
    }
    func call(_ method: String, _ args: [Any]) throws -> Any {
        context.exception = nil
        guard let result = context.objectForKeyedSubscript("Bus70NativeEngine")?.invokeMethod(method, withArguments: args), context.exception == nil else { throw NativeFailure.engine }
        return result.isNull || result.isUndefined ? NSNull() : result.toObject() as Any
    }
    func object(_ method: String, _ args: [Any]) throws -> [String: Any] {
        guard let object = try call(method, args) as? [String: Any] else { throw NativeFailure.engine }
        return object
    }
}
