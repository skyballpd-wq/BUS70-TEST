# v89 driver cockpit and departure recording

- A new trip leaving a shared origin/terminus now discards the previous inbound route match. Start-point accuracy allowance is bounded to 15 m; departure evidence, early-start protection and turnaround/arrival rules remain in place.
- Compact driver controls, date/time, weather icons, four-digit vehicle display, planned headways and origin-aware progress landmarks reduce scrolling. Record details retain their expanded state. Narrow enlarged layouts may wrap to preserve readable text.
- Fresh same-assignment vehicle references retain their original timestamp while a refresh is pending. Expired or mismatched references are never renewed artificially.
- Server changes add bounded hourly provider outcome aggregates and separately labelled SKY forecasts. These changes require a separate Apps Script deployment; a repository merge does not deploy that server.
- No 17:00 cutoff was found. Evening reliability still requires runtime evidence and field verification.

Validation: focused Node regressions pass. Android unit tests and signed APK89 build passed. Final Chromium/WebKit validation and web deployment are pending. Earlier WebKit testing exposed a 150% enlargement overflow; the pending fix must pass before release. No real driver, vehicle assignment or historical run record is included in tests or changed for validation.
