# iPhone native pilot — 0.1.0 (build 1)

This is an implementation and verification candidate, not a signed iPhone installation file. Android v82 remains the same signed package for first installation and in-place upgrades. Do not uninstall the old Android app: unsubmitted records can exist on the device.

## Implemented

- WKWebView uses the existing production login and dispatch screen. A separate iOS-only bridge advertises location support, not Android alarm support. Native messages require the exact HTTPS origin, application path, and main frame.
- Core Location feeds a bundled JavaScriptCore engine while the web view is suspended. The existing `driver-automation.js` and `driver-outbox.js` are bundled from their canonical files. Planned-before-actual, walking-phone, scoped vehicle evidence, completed-trip and service-day protections remain in force.
- Each checkpoint is atomically persisted before trip advancement, upload or speech. Network failures retain observations with original timestamps; idempotent replay is scoped by driver/date/dispatch/vehicle/trip/event. Latest telemetry has a 20-second minimum interval and never has two concurrent requests. Coordinates/tokens are never logged.
- The session token is Keychain `AfterFirstUnlockThisDeviceOnly`. The private state file uses complete-until-first-authentication protection and is excluded from backup. Logout deletes the token and stops location; unsent records remain isolated for the same driver to recover after login.
- Native Korean speech uses the audio playback/voice-prompt session only for actual announcements. It ducks other audio, releases the session after completion, and does not play silent audio to keep the app alive. A failed/interrupted announcement is eligible for a later fresh checkpoint retry.
- The arrival advisory follows the currently deployed Android ordered station IDs, conservative ETA margin and per-stop gating. This change does not move the operational warning gates.
- Always location authorization and precise location are required for the pilot. Tracking starts only from the authenticated current dispatch flow. Pause, logout, final completion and expired service day stop collection. A cold launch never silently resumes yesterday's shift.

## Build and verify

Install Xcode and XcodeGen on a Mac; then:

```sh
cd ios
xcodegen generate
open SoshinDriver.xcodeproj
```

The `iOS native pilot` GitHub workflow compiles the simulator and unsigned device targets and runs native JavaScriptCore tests. Synthetic Node tests cover route evidence, clock boundaries, owner isolation, retry persistence and per-stop warnings. These do not prove screen-lock behavior on a real iPhone.

## Required before tester distribution

1. Choose the company's or owner's Apple Developer Program team; confirm an available bundle identifier and App Store Connect app. The source's `kr.bus70.driver.ios` identifier is provisional until registered.
2. Configure signing/provisioning in Xcode with that team, add the approved iOS app icon assets, and complete App Store Connect privacy disclosures for driver identity, location and accident photos. No certificate, Apple password or provisioning profile belongs in this repository.
3. Archive a signed release and upload to App Store Connect. TestFlight external tester distribution requires Apple beta review. No invitation is sent automatically by this project.
4. Verify on real iPhones: first install/upgrade, Always/precise permissions, 30–60 minute screen lock, phone calls/Bluetooth/audio interruptions, poor connectivity and recovered uploads, account/vehicle change, pause/logout, finished shift/private commute, and a complete workday. Compare checkpoint timestamps to the observed field record.

## Explicit limits

- No signed IPA or TestFlight invitation has been produced. OS force-quit, revoked permission, power-off and location disabled prevent guaranteed continuous tracking. Reopen the app after a force-quit/reboot and verify current dispatch.
- Scheduled departure alarms, iOS calendar integration, native spreadsheet export/share and Android mascot widgets are not ported in this location/voice pilot. Safari remains available for ordinary web functions.
- Background dispatch refresh currently occurs through the live server's save validation plus foreground schedule refresh. Manager reassignment requires reopening and confirming the new dispatch; rejected old assignments stop tracking. A later native schedule-refresh path needs server/API review.
- Long-duration battery/network performance and 350-user production capacity are not certified by simulator tests. The current server and public web URLs are unchanged.

Official implementation/distribution references:
- https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background
- https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates
- https://developer.apple.com/documentation/avfaudio/avaudiosession/mode-swift.struct/voiceprompt
- https://developer.apple.com/testflight/
