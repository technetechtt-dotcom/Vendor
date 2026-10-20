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

Install JDK 17 and the Android SDK. `npm run apk` produces a debug package for tests. `npm run apk:release` requires the municipality signing key through `android/keystore.properties` or the documented `LED_KEYSTORE*` variables. Never commit keys, passwords or local SDK settings. Signed releases must be tested on a device before being copied into the office application's `public/releases/` directory.

Existing APKs in this repository have not been rebuilt as part of the 20 October source fixes. Web builds do not update installed phones.

## Device security and recovery

A PIN is required by the app interface. Five failed attempts temporarily block further checks. Forgotten-PIN reset asks for confirmation, clears all locally cached profiles, drafts, queued visits and visit history, and waits for saved authentication to be removed before reloading.

The PIN is an application lock, not encryption. Offline data currently remains in local storage, and Capacitor Preferences does not constitute encrypted keychain storage. A device encryption/key management implementation and managed-device policy are still required for production.

If a phone is lost, revoke its session from the office register and ask the device administrator to lock/erase the original handset. Clearing another phone cannot erase the lost handset. Unsent records on a lost handset are not automatically recoverable.

See `../audit-report/PRODUCTION_REVIEW_2026-10-20.md` for current verification and remaining release blockers.
