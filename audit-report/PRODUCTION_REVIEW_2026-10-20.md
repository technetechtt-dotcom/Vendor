# Platform production review — 20 October 2026

## Verdict and evidence limits

**Not production ready.** This pass repaired concrete source defects and added regression coverage. Office and field TypeScript checks and production web builds pass. Six regression tests pass. Office lint still fails with **112 errors and 9 warnings** (all errors are explicit `any` types).

This is a source/build/API review, not a completed visual or authenticated end-to-end audit. The in-app browser failed twice with “failed to write kernel assets”. No current screenshots were captured. The earlier screenshots in this folder were not reused as current evidence. The local authentication endpoint returned 503, and a fresh isolated Workers/D1 setup crashed before its first migration. Those failures prevent honest claims that every visible button or role flow has been clicked and verified.

No production deployment or production-data mutation was performed. An isolated local QA state directory was created for runtime testing. Existing APK artifacts were not rebuilt or signed.

## Completed repairs

1. **Backup download:** fixed a state variable named `document` shadowing the browser document and breaking anchor creation. The download now uses `window.document`.
2. **Integrity review:** completed the Audit component's missing interface and controls for the integrity issues already returned by the backend. Staff can inspect preserved details; superusers can record a confirmed review/closure. Closing an issue explicitly does not claim to repair it automatically.
3. **Audit pagination:** failed requests now display errors instead of silently ending pagination.
4. **Restore verification:** version 2 requires all table sections and manifest counts, valid unique stored files, referenced attachment bytes and additional parent relationships. Unsupported versions are rejected. Version 1 can be verified but cannot be restored automatically.
5. **Restore consistency:** clear stale submission replay keys when replacing operational events. Preserve current accounts. Attempt to restore overwritten object bytes when the database transaction fails. Return obsolete-file cleanup failures separately after a successful database restore.
6. **Request origins:** added shared checks to register, notice, permit, renewal and backup mutations. Cross-origin native/field writes require a bearer token instead of relying on browser cookies. Authentication mutations also enforce that boundary after login; setup permits only the site origin.
7. **Notice permissions:** finance-only accounts cannot mutate delivery/compliance records merely because they are signed in.
8. **First-admin authorization:** public-host setup requires the owner's server-configured `BOOTSTRAP_TOKEN` (at least 32 characters); the setup form includes that field. Existing-user sign-in is unaffected. Local setup remains available for development.
9. **Field Windows build:** added a launcher that gives esbuild a project-owned temporary directory. The previously failing build now passes through the normal build command.
10. **Field PIN:** removed the skip option and corrected startup so an existing sign-in without a PIN does not silently bypass PIN creation. Repeated incorrect PIN attempts are temporarily blocked.
11. **Phone reset:** forgotten-PIN reset now confirms data loss, removes actual offline drafts/queues/cache/history, waits for saved authentication removal, then reloads. Previously the button promised to clear phone data while retaining it.
12. **Lost-device content:** replaced the incorrect claim that clearing a replacement handset erases a lost phone. The instructions now require revocation and device-admin lock/erase of the original phone.
13. **Release endpoint:** removed the false-success upload behavior that accepted APK bytes but never stored/published them. It now explicitly reports unsupported upload publication. Release metadata returns a successful information response.
14. **Legacy APK URL:** `/field-app` redirects to the single published static APK instead of searching filesystem fallbacks that could serve an old debug build under a release filename.
15. **Missing/error pages:** added a useful 404 and a retryable page-error boundary with a path back to the register.
16. **Empty registers:** no longer automatically populate empty live screens with sample vendor/financial data. Empty-state guidance points to registration/import. Finance users cannot trigger the main registration action.
17. **Sign-in recovery:** session-service failures display a retry screen rather than silently presenting a normal login screen. Field-only accounts have a direct installation/help link.
18. **User loading:** added cancellation-safe initial loading in user administration, removing the synchronous-effect lint failure.
19. **Portable installation:** `install:ci` now uses the existing portable installer instead of a Bash-only entrypoint. This installer change was inspected, not followed by a destructive dependency reinstall.
20. **Migration recovery:** persist each successfully applied local migration immediately, so failure on a later migration does not cause earlier successful migrations to be replayed on retry.
21. **Operational content:** replaced outdated starter/first-version documentation with actual setup, secret configuration, recovery limits, Android build instructions and current release gates.

## Review steps and health

| Step | Surface or flow | Health and evidence |
|---|---|---|
| 1 | Source inventory / routes | Reviewed: office, 18 workspace branches, 10 API routes and Android source found. |
| 2 | Public entry, help and recovery | HTTP checked: home/help 200, missing address 404, legacy installer 307 to static APK. Visual appearance unverified. |
| 3 | Sign-in / first-admin setup | Source hardened; blocked in runtime by local auth 503 and Workers startup crash. |
| 4 | Office workspace navigation | Source branches present for all listed workspaces; authenticated screen/button execution blocked. |
| 5 | Register / profile / compliance / finance | Source reviewed; existing handlers present. Real saved workflows and all role affordances require UAT. |
| 6 | Audit / integrity / backup | Missing integrity controls fixed. Restore and failure cases pass local SQLite/object-store regression tests. D1/R2 deployment unverified. |
| 7 | Field PIN / recovery / build | PIN/reset regression passes; web type/build checks pass. Offline encryption and real Android tests still required. |
| 8 | Release and operations | False publication success fixed; static asset responds. Signing provenance, updated APK, sender and live operations unverified. |
| 9 | Release quality gates | Type/build/tests pass; lint fails. Desktop/mobile visual/accessibility walkthrough blocked by browser initialization. |

Workspace inventory (source coverage, not a claim of clicked screens):

| Workspace | Implementation / outstanding validation |
|---|---|
| Overview | Counts/charts/register summary exist; empty register no longer uses auto-samples. |
| Vendor register | Search/filter/export, forms and profile tabs exist; full save/upload/validation tests needed. |
| Business hubs | Add/rename/allocation controls exist; verify inventory rules and role affordances. |
| Trading locations | Informal coordinates/map controls exist; GPS/permissions require device testing. |
| Fees & payments | Ledger/actions exist; verify money amounts, reversals and double submission with staging data. |
| Compliance | Permit/finding flows exist; test approval, suspension, resolution and role restrictions. |
| Users | Create/edit/reset/disable controls exist; initial load fixed; real sessions/UAT blocked. |
| Follow-ups | Assignment/scheduling/status/findings handlers exist; saved transitions require UAT. |
| Unit inventory | Unit/pitch forms and history exist; verify concurrent allocation on D1. |
| Permits & cards | Lifecycle/documents/renewals controls exist; printing already gates approval/current serial in source. Test actual printer/scanner and revoked/replaced cards. |
| Tariffs & reconciliation | Identity/reference/confirmation are already present in current source; verify with finance staff. |
| Reports | Report/export component present; validate reconciled totals against approved test data. |
| Notice queue | Case/recipient/retry controls present; test sender acceptance, rejection, retry and actual delivery separately. |
| Audit | Human-readable diffs/pagination/integrity review present; visual and seal concurrency tests required. |
| Settings | Requirements/sender status/note controls present; approved content must be supplied. |
| Import | File/template/mapping/correction/approval exist; test municipal exports and duplicate handling. |
| Backup | Export/verify/confirmed restore exist; critical fixes and regression coverage added. |
| Sessions | Friendly devices and individual revocation already present; verify remote revocation on actual devices. |

## HTTP smoke evidence

| Path | Observed status |
|---|---:|
| `/` | 200 |
| `/field` | 200 |
| `/field-app` | 307 to the versioned APK |
| `/missing-page` | 404 |
| `/api/auth` | **503** — local D1/runtime failure |
| `/api/register` without authentication | 401 |
| `/api/backup` without authentication | 401 |
| `/api/releases` | 200 metadata |
| `/manifest.webmanifest` | 200 |
| `/sw.js` | 200 |
| `/releases/LED-Field-Visits-1.0.0.apk` | 200; binary signing/content not certified |

Seven hostile-origin POST checks also returned 403: backup, notice, permit, renewals, register, auth and releases. No mutation was submitted with valid authorization.

## Tests and reproducibility

From the office directory, `npm run typecheck`, `npm test` and `npm run build` passed. Tests apply all nine migrations to in-memory SQLite with foreign keys enabled, reject invalid parents, restore records while preserving accounts, clear actual stale replay keys, reject incomplete/unsupported backups, roll back overwritten file bytes on a failed database batch, reject hostile-origin writes, and check PIN throttling and offline-data reset.

From the field directory, `npm run typecheck` and `npm run build` passed using the normal launcher. No SDK/signing operation was performed. The existing installable APK still predates these source fixes.

Full lint evidence is saved in [lint-2026-10-20.json](lint-2026-10-20.json): 112 errors and 9 warnings. The rules were not weakened to manufacture a green gate.

## Remaining release blockers

- **Field data protection:** offline records are not encrypted; PIN is an app lock. Capacitor Preferences is not encrypted keychain storage. Implement encryption/key management and test migration, restart, loss, sign-out and recovery.
- **Runtime/integration:** local Workers/D1 startup crashes; authenticated flows could not be tested. Use a working isolated runtime/staging environment and verify all roles and mutations.
- **Type quality:** resolve 112 lint errors and review warnings; add continuous checks once the gate is genuinely green.
- **Visual/accessibility:** complete desktop/mobile screenshots and keyboard/screen-reader/contrast testing. No screenshots or visual QA were possible in this pass.
- **Recovery operations:** test actual D1/R2 restore under concurrent writes, process interruption, object-store rollback failure, large payload limits and cleanup failure. R2 and D1 do not share an atomic transaction. Schedule encrypted backups and a recovery drill.
- **Android release:** rebuild, sign, publish and device-test the updated package. Test camera/GPS denial, offline rejected visits, expiry/revocation, file sharing and handset reset.
- **Municipal content/configuration:** supply approved inventory, tariffs, document requirements, notice wording, sender integration, retention/access rules and incident/recovery owners. These cannot be invented from code.

The platform has broad page coverage. The outstanding risks are operational/security assurance and saved workflow validation; adding decorative pages would not resolve them.
