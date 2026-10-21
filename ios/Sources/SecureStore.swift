import Foundation
import Security

final class SecureStore {
    private let file: URL
    init() throws {
        let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var excluded = directory
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try excluded.setResourceValues(values)
        file = directory.appendingPathComponent("driver-state.json")
    }
    func read() throws -> [String: Any] {
        if !FileManager.default.fileExists(atPath: file.path) { return [:] }
        guard let value = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any] else { throw NativeFailure.storage }
        return value
    }
    func write(_ state: [String: Any]) throws {
        // Atomic durable write BEFORE trip advancement or network transmission.
        let data = try JSONSerialization.data(withJSONObject: state)
        try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    private func query(_ owner: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "kr.bus70.driver.ios.session", kSecAttrAccount as String: owner]
    }
    func token(_ owner: String) -> String? {
        var q = query(owner); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    func setToken(_ token: String, owner: String) throws {
        let q = query(owner), attrs: [String: Any] = [kSecValueData as String: Data(token.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var result = SecItemUpdate(q as CFDictionary, attrs as CFDictionary)
        if result == errSecItemNotFound { result = SecItemAdd(q.merging(attrs) { _, new in new } as CFDictionary, nil) }
        guard result == errSecSuccess else { throw NativeFailure.storage }
    }
    func removeToken(_ owner: String) { SecItemDelete(query(owner) as CFDictionary) }
}
