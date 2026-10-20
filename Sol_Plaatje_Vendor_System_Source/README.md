# Sol Plaatje Vendor Register

Office register and API for formal and informal traders, business hubs, unit allocations, compliance visits, permit/card history, fees, receipts, reconciliation, imports, reporting, audit review and backup/recovery. The companion Android project is `../Field_Officer_App`.

## Local development

Use Node.js 22.13 or newer. From this directory:

```sh
npm run install:ci
npm run local:setup
npm run dev
```

The preview normally runs at http://127.0.0.1:5173. This application requires the Cloudflare Workers runtime, D1 database (`DB`) and R2 storage (`BUCKET`); an ordinary Node-only Next.js server does not provide these bindings.

`local:setup` builds the application and applies all pending migrations in filename order (`0000` through `0009`). It records each successful migration separately. Local state defaults to `~/sp-vendor-state`; set `SITES_LOCAL_PERSIST_PATH` to a separate short directory for an isolated test database. Never point a test run at operational records. The initial admin can be created locally from the sign-in page. Empty registers display zero records, not illustrative vendors.

If Windows reports a Workers runtime startup failure or the sign-in API returns 503, resolve that runtime issue before attempting registration. Re-running setup does not repair a native runtime crash. Do not delete an existing database or migration marker to work around it.

## Checks

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

The local regression tests use an in-memory SQLite database and a simulated object store. GitHub checks additionally run the actual Workers/D1 runtime, authenticated HTTP workflows, Chromium navigation and WCAG A/AA scans. They cover all migrations, parent constraints, export/restore, rejection of incomplete snapshots, preservation of accounts, stale submission keys, file rollback, mutation origins and field PIN/reset behavior. They do not replace testing against deployed D1/R2 or on Android.

The lint and type gates are green. Ten local regression/acceptance tests and three Android Keystore instrumentation tests pass. Both production dependency trees report zero known vulnerabilities. The updated source is on GitHub `main`; see `../audit-report/PRODUCTION_HARDENING_2026-10-20.md` for final CI evidence and remaining deployment requirements.

## Production configuration

- Provision separate staging and production D1 and R2 resources. `.openai/hosting.json` declares binding names; the placeholder database ID in local configuration is not a production resource.
- Apply every pending SQL migration in order. Back up existing operational data and rehearse migration/restore on staging first.
- Set a secret `BOOTSTRAP_TOKEN` of at least 32 characters before creating the first administrator on a public hostname. The setup form requires this owner-provided token. Remove the secret after initial setup. Existing installations with users continue to sign in normally.
- Serve over HTTPS. Restrict staff accounts by role and review session revocations.
- `NOTICE_WEBHOOK_URL` connects the approved municipal notice sender. Without it, municipal send is unavailable; PDF and draft/handover records remain separate. Sender acceptance is not confirmed delivery.
- Build a verified signed package with `npm run apk:release` in the field project. It produces the APK plus a SHA-256/signing-certificate manifest. The office dev/build launcher validates and copies this pair from `Field_Officer_App/releases/` into its static assets. The current package is `public/releases/LED-Field-Visits-1.0.1.apk`. `/field` links to that asset; `/field-app` redirects to it. An absent/unverified release is shown as pending, with no dead download button. The HTTP upload API explicitly reports that upload publication is unsupported and does not pretend a package was stored.
- Establish backup scheduling, encryption, retention, restore drills, alerting and operational ownership. Large backups and concurrent restores need staging/load testing; D1 and R2 do not form a shared atomic transaction.

## Recovery

The super user can export a version 2 JSON backup containing operational tables and referenced uploaded files, verify it, then enter its checksum-derived confirmation phrase to restore. Current accounts/sessions and the existing audit trail are retained. Old submission replay keys are cleared. Failed database restores attempt to restore overwritten file bytes; a process crash or storage failure still requires operator recovery. Older version 1 exports can be checked but cannot be restored automatically.

## Release status

**Deployment sign-off is still required.** Field records and saved credentials are now encrypted using PIN-derived AES-GCM; Android adds a non-exportable Keystore key. The code quality, dependency, authenticated runtime and browser gates are automated. Live rollout still requires the existing municipal signing key, actual staging/production bindings and sender credentials, an operational recovery drill, physical handset testing and approved municipal content/policies. See the current hardening report and release gate in the parent folder.

## CI and release artifacts

`Production checks` builds both apps, audits production dependencies, runs strict office lint/type/security tests, applies every migration to an isolated Linux Workers database, exercises all roles and operational APIs, and checks all 18 office workspaces plus the field PIN/sign-in/cache/reopen flow in Chromium. Screenshots and accessibility results are retained as browser evidence. Debug APKs are test artifacts.

`Prepare signed Android artifact` is a manual workflow. Configure the existing municipal key as `LED_KEYSTORE_BASE64`, `LED_KEYSTORE_PASSWORD`, `LED_KEY_ALIAS` and `LED_KEY_PASSWORD` repository secrets. It builds and verifies a signed APK and its manifest; it does not deploy production. Never substitute a newly invented signing identity for an existing installation's key.

Operational writes share a shared write boundary: a five-minute database lease excludes simultaneous mutation/restore requests and expires after a crashed writer. A busy register returns a retryable 503. Run restores in a maintenance window; exercise interrupted and large restores against actual storage before rollout. Lease state is transient and excluded from exports.
