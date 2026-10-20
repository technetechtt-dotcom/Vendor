# Production release gate — 20 October 2026

**Code hardening is implemented and pushed to GitHub main. Production rollout still requires operator sign-off.**

See [the current verification report](audit-report/PRODUCTION_HARDENING_2026-10-20.md). The earlier review and its lint output are historical.

## Completed software gates

- Office lint/type checks and both application builds pass.
- Ten regression/acceptance tests cover migration application, backup/restore, file rollback, PIN/vault migration and failure, request origins, all four staff roles, operational workflows and concurrent-write leases.
- Actual Linux Workers/D1 HTTP acceptance checks pass in GitHub Actions.
- Chromium checks cover all 18 office workspaces, profile tabs, mobile registration and the field PIN/sign-in/lookup/encrypted-cache/reopen flow. Keyboard tab checks are included.
- Automated WCAG A/AA scans across the checked screens report zero violations. This does not replace manual screen-reader testing.
- Both production dependency trees report zero known vulnerabilities after Next.js and Capacitor patches.
- Android debug compilation passes, and three Android Keystore instrumentation tests passed on an isolated Android 36 emulator.
- Version 1.0.1 / Android version code 2 uses encrypted offline records and credentials. Verified release publication requires the signed APK and its checksum/certificate manifest. An absent package shows pending status, without a dead download link.

## Required for live rollout

1. Supply the existing municipal signing key and run the signed artifact workflow. No key is configured here; no production-signed APK was manufactured or deployed.
2. Configure real staging and production D1/R2 bindings, the owner-only bootstrap secret and approved notice-sender credentials. Apply all ten migrations (`0000`–`0009`) to the appropriate environment after a staging rehearsal.
3. Perform a backup/restore drill on representative staging data, including uploaded files, long/interrupted restores, concurrent access and recovery after storage failure. Operational writes use a five-minute crash-recovery lease; conduct restores in a maintenance window.
4. Test the signed app on managed physical handsets: real camera/GPS permissions, scanning, offline correction, screen lock, lost-device procedures and file sharing. Emulator security tests are completed evidence, not a physical-device pilot.
5. Approve actual municipal tariffs, inventory, requirements, legal notice wording, retention/access policies and incident/recovery ownership. These values and approvals cannot be invented from repository access.
6. Complete staff UAT and manual assistive-technology checks on the deployed staging environment before approving live municipal records.

The Windows native Workers runtime still encounters a host filesystem-permission error in this environment. The same application was validated on the Linux Workers runtime in CI; no Windows security controls were disabled to hide that local issue.
