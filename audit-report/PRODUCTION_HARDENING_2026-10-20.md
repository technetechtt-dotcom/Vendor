# Production hardening and verification — 20 October 2026

## Outcome

The remaining code-quality, encryption, dependency and automated runtime/browser blockers identified in the first pass have been repaired and pushed to `technetechtt-dotcom/Vendor` on `main`. Production deployment is still awaiting the municipality's signing key, real environment configuration and operational acceptance.

Earlier successful verification is recorded in [GitHub Actions](https://github.com/technetechtt-dotcom/Vendor/actions/runs/39400200052). The final commit's checks are available in [Production checks](https://github.com/technetechtt-dotcom/Vendor/actions/workflows/production-checks.yml). No production deployment or municipal-data mutation was performed.

## Completed changes

- Replaced 112 explicit-any lint failures with typed SQL projections, request-object checks, vendor schema validation and typed client contracts. Office lint now reports zero errors and zero warnings; no lint rules were weakened.
- Fixed the card-event refresh operation that incorrectly attempted to overwrite a settings note. Refresh now reloads data directly.
- Encrypted drafts, queued visits, cached profiles, GPS history and saved credentials using PIN-derived AES-256-GCM with PBKDF2-SHA-256, 600,000 iterations and random salts/IVs. Android adds a non-exportable, device-bound Keystore key. Legacy plaintext is removed after successful encrypted persistence.
- Added durable save/flush boundaries, explicit storage errors, safe failed-migration behavior, PIN throttling, reset and vault lock/reopen checks. Unsent records cannot be recovered without the original PIN/device key; reset makes that data loss explicit.
- Added cross-instance operational write leases and additional parent-deletion guards. Restore excludes simultaneous operational changes, and a crashed writer's lease expires. Recovery under real data volumes still requires staging drills.
- Repaired the dependency lockfile so clean installs work. Patched critical/high framework/image dependencies and the critical Capacitor internal-proxy issue. Both production dependency audits now contain zero known vulnerabilities.
- Added Linux CI for clean installs, strict lint/type checks, regression/security tests, real Workers/D1 acceptance workflows, Chromium navigation, accessibility scans and Android compilation. Debug APKs and browser evidence are retained as artifacts.
- Updated the field app to 1.0.1 / Android version code 2. Added a manual signing workflow that consumes the existing municipal key, verifies the APK signature and emits a package checksum/certificate manifest. The office build validates and copies that pair. Missing/unverified releases show pending installation status, not a broken download.
- Darkened secondary/status text, corrected header alignment, consolidated header account controls, replaced clickable table-row roles with real vendor-opening buttons, and added keyboard movement to office and field profile tabs. Invalid profile-tab URLs fall back to Profile.

## Verification steps

| Step | Flow | Health / evidence |
|---|---|---|
| 1 | Clean office and field installs | Pass in Linux CI after lockfile repair. |
| 2 | Lint, types and production web builds | Pass; office lint has 0 errors / 0 warnings. |
| 3 | Migration and storage regression suite | Pass: ten tests, all ten migrations applied to SQLite; export/restore, stale replay keys, object rollback, encrypted migration/reset/failure and write-lease behavior checked. |
| 4 | Authenticated operational APIs | Pass against actual Linux Workers/D1: bootstrap, temporary-password changes, all four roles, registration, allocation conflicts, lookup, charges/payment replay, reconciliation, permits/cards, notices, resolution, audit integrity, backup verification and session views. |
| 5 | Office navigation and profile | Pass in Chromium: all 18 workspaces and four profile tabs; keyboard coverage added. |
| 6 | Mobile office registration | Pass in Chromium at 390 px, including no page-level horizontal overflow and open/close of registration. |
| 7 | Field web flow | Pass in Chromium: PIN creation, sign-in, lookup, encrypted cache, reload lock and unlock. |
| 8 | Automated accessibility | Zero WCAG 2 A/AA and 2.1 AA violations in the checked office screens, profile/mobile registration and field profile. Manual screen-reader and physical-device review remain required. |
| 9 | Android security | Debug app compiles. Three Keystore tests passed on an isolated Android 36 emulator: randomized encryption/round-trip/non-exportable key, wrong-key rejection and missing-key behavior. |
| 10 | Production dependency audit | Zero known production-tree vulnerabilities in both applications; this is dependency-scan evidence, not a penetration-test certificate. |

The browser workspaces checked were Overview, Vendor register, Business hubs, Trading locations, Fees & payments, Compliance, Users, Follow-ups, Unit inventory, Permits & cards, Tariffs & reconciliation, Reports, Notice queue, Audit, Settings, Import, Backup and Sessions.

## Current screen evidence

All records in these captures are synthetic acceptance fixtures. They contain no municipal vendor dataset. Each capture was downloaded from this run's CI artifacts and visually inspected.

- [Desktop overview](verified-2026-10-20/01-office-overview.png)
- [Vendor profile](verified-2026-10-20/02-vendor-profile.png)
- [Mobile register](verified-2026-10-20/03-office-mobile.png)
- [Mobile registration](verified-2026-10-20/04-registration-mobile.png)
- [Field profile](verified-2026-10-20/05-field-profile.png)
- [Automated accessibility results](verified-2026-10-20/accessibility.json)
- [Final lint evidence](lint-final-2026-10-20.json)
- [Production dependency audit counts](dependency-audit-2026-10-20.json)

## What is still required from the operator

- The existing municipal Android signing keystore and secure signing configuration. No signing key is currently configured; a replacement identity was not invented.
- Actual staging/production bindings and notice-sender credentials, followed by staging deployment and a representative recovery drill.
- Managed physical-handset testing, staff UAT, manual assistive-technology testing and municipal approval of tariffs, legal content, retention and operational ownership.

Windows local Workers startup remains affected by host filesystem permissions. An isolated newer runtime reports `CreateDirectory: Access is denied`; Linux CI executes the application and actual D1 workflow successfully. This local host restriction was not bypassed by disabling Windows protections.

The [release gate](../PRODUCTION_RELEASE_GATE.md) records these deployment requirements. Passing source checks does not authorize inventing municipal policy or claim that an unsigned artifact is an approved release.
