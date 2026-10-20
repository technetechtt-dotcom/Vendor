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

`local:setup` builds the application and applies all pending migrations in filename order (`0000` through `0008`). It records each successful migration separately. Local state defaults to `~/sp-vendor-state`; set `SITES_LOCAL_PERSIST_PATH` to a separate short directory for an isolated test database. Never point a test run at operational records. The initial admin can be created locally from the sign-in page. Empty registers display zero records, not illustrative vendors.

If Windows reports a Workers runtime startup failure or the sign-in API returns 503, resolve that runtime issue before attempting registration. Re-running setup does not repair a native runtime crash. Do not delete an existing database or migration marker to work around it.

## Checks

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

The regression tests use an in-memory SQLite database and a simulated object store. They cover all migrations, parent constraints, export/restore, rejection of incomplete snapshots, preservation of accounts, stale submission keys, file rollback, mutation origins and field PIN/reset behavior. They do not replace testing against deployed D1/R2 or on Android.

As of 20 October 2026, type checks, regression tests and builds pass. Lint remains a release blocker due to existing explicit `any` types; see `../audit-report/PRODUCTION_REVIEW_2026-10-20.md` for counts and limitations.

## Production configuration

- Provision separate staging and production D1 and R2 resources. `.openai/hosting.json` declares binding names; the placeholder database ID in local configuration is not a production resource.
- Apply every pending SQL migration in order. Back up existing operational data and rehearse migration/restore on staging first.
- Set a secret `BOOTSTRAP_TOKEN` of at least 32 characters before creating the first administrator on a public hostname. The setup form requires this owner-provided token. Remove the secret after initial setup. Existing installations with users continue to sign in normally.
- Serve over HTTPS. Restrict staff accounts by role and review session revocations.
- `NOTICE_WEBHOOK_URL` connects the approved municipal notice sender. Without it, municipal send is unavailable; PDF and draft/handover records remain separate. Sender acceptance is not confirmed delivery.
- Deploy the signed Android package to `public/releases/LED-Field-Visits-1.0.0.apk`. `/field` links to that asset; `/field-app` redirects to it. The HTTP upload API explicitly reports that upload publication is unsupported and does not pretend a package was stored.
- Establish backup scheduling, encryption, retention, restore drills, alerting and operational ownership. Large backups and concurrent restores need staging/load testing; D1 and R2 do not form a shared atomic transaction.

## Recovery

The super user can export a version 2 JSON backup containing operational tables and referenced uploaded files, verify it, then enter its checksum-derived confirmation phrase to restore. Current accounts/sessions and the existing audit trail are retained. Old submission replay keys are cleared. Failed database restores attempt to restore overwritten file bytes; a process crash or storage failure still requires operator recovery. Older version 1 exports can be checked but cannot be restored automatically.

## Release status

**Not approved for production use.** Remaining blockers include encrypted field offline storage, lint/type debt, a working Workers/D1 test environment, authenticated end-to-end and visual testing, signed Android device testing, and approved municipal tariffs, notice wording and operating policies. See the dated review and release gate in the parent folder.
