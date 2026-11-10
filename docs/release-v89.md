# v89 driver cockpit and departure recording

- A new trip leaving a shared origin/terminus now discards the previous inbound route match. Start-point accuracy allowance is bounded to 15 m; departure evidence, early-start protection and turnaround/arrival rules remain in place.
- Compact driver controls, date/time, weather icons, four-digit vehicle display, planned headways and origin-aware progress landmarks reduce scrolling. Record details retain their expanded state. Narrow enlarged layouts may wrap to preserve readable text.
- Fresh same-assignment vehicle references retain their original timestamp while a refresh is pending. Expired or mismatched references are never renewed artificially.
- Server changes add bounded hourly provider outcome aggregates and separately labelled SKY forecasts. These changes require a separate Apps Script deployment; a repository merge does not deploy that server.
- No 17:00 cutoff was found. Evening reliability still requires runtime evidence and field verification.

Validation completed: focused Node regressions, Chromium/WebKit 320/360/412 px and 150% enlargement checks, Android unit tests and signed APK89 build. The earlier WebKit overflow is fixed. See PR65 and the mobile-layout workflow run 42762821514.

Web v89 was merged in PR65 and published by Pages run 42764452856. The live HTML, service worker, automation and cockpit modules match the validated files. Apps Script source is saved and read back successfully, but its production deployment remains pending approval. Do not treat the repository merge or an editor diagnostic as proof of server deployment. Real handset installation and driving validation remain separate.
