# LED Field Visits

React/Vite companion app packaged for Android with Capacitor. It connects to the office register through authenticated APIs for vendor lookup, card checks, inspections, warnings, notices and offline visit recovery.

## Build and check

Use Node.js 22.13 or newer:

```sh
npm ci
npm run typecheck
npm run build
npm run dev
```

On Windows the launcher uses `.build-temp` for esbuild temporary files. This folder is ignored. The browser preview uses port 5174.

## Android

Install JDK 21 and the Android SDK. `npm run apk` produces a debug package for tests. `npm run apk:release` requires the municipality signing key through `android/keystore.properties` or the documented `LED_KEYSTORE*` variables. Never commit keys, passwords or local SDK settings. Signed releases must be tested on a device before being copied into the office application's `public/releases/` directory.

Version 1.0.1 / Android version code 2 contains the security updates. A debug build has been compiled and the Keystore tests passed on an isolated Android 36 emulator. A production-signed release still requires the existing municipal key. Web builds do not update installed phones. Release builds verify the APK signature and generate the checksum/certificate manifest used by the office build to publish the download.

## Device security and recovery

A PIN is required by the app interface. Five failed attempts temporarily block further checks. Forgotten-PIN reset asks for confirmation, clears all locally cached profiles, drafts, queued visits and visit history, and waits for saved authentication to be removed before reloading.

A PIN of 6–12 digits derives a non-exportable AES-256-GCM key through PBKDF2-SHA-256 (600,000 iterations). The browser stores ciphertext; Android additionally wraps that ciphertext with a non-exportable Android Keystore key. Drafts, queues, cached records, GPS history and saved credentials use this vault. Legacy plaintext is removed only after an encrypted commit succeeds. The app flushes pending writes before locking or acknowledging queued submissions. Old PINs are accepted once to unlock legacy data and require upgrading to the new encrypted vault. Forgotten PIN/device keys cannot decrypt unsent records; reset explicitly erases them.

If a phone is lost, revoke its session from the office register and ask the device administrator to lock/erase the original handset. Clearing another phone cannot erase the lost handset. Unsent records on a lost handset are not automatically recoverable.

See `../audit-report/PRODUCTION_HARDENING_2026-10-20.md` for current verification and remaining release blockers.

## Native security tests

The instrumentation class `za.solplaatje.led.field.DeviceVaultTest` uses isolated test aliases to verify randomized encryption, round trips, non-exportable keys, wrong-key rejection and missing-key behavior. Build it with `android/gradlew :app:assembleDebug :app:assembleDebugAndroidTest`; run on an isolated emulator. These tests do not authorize resetting or installing over an operational handset.
