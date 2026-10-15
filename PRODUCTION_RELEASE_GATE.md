# Vendor system: production release gate (15 October 2026)

## Scope inspected
- Administration: `Sol_Plaatje_Vendor_System_Source` (Next/Vinext, Cloudflare D1 and R2)
- Field officer: `Field_Officer_App` (React, Vite, Capacitor Android)
- API: authentication, registration, notices, documents, photos and receipts
- Database migrations: `drizzle/0000` through `0005`

## Confirmed improvement on this branch
- Initial administrator setup no longer deletes the shared bootstrap claim on every request.
- Setup credentials are validated before the claim is acquired, preventing invalid form submissions from prematurely consuming bootstrap.
- Authentication mutation endpoint rejects explicitly foreign browser origins unless they are approved field-app origins.

## Must complete before live municipal use
1. **Authentication and bootstrap:** Validate admin bootstrap on a fresh staging D1 database, including two simultaneous first-admin requests. Ensure the site requires a trusted bootstrap ceremony: whoever reaches an uninitialized public deployment first can otherwise establish the first superuser. Provision or privately authorize the initial administrator before exposing the public URL.
2. **Security review:** Audit every mutating route for CSRF, role-based authorization, replay/idempotency and input limits; avoid treating CORS as authentication. Confirm the field origin allowance cannot be abused by hostile browser pages on localhost.
3. **Data privacy:** Review authenticated photo/document access against vendor ownership and field-officer least privilege. Configure POPIA retention, access logs, deletion/export, breach response and municipal data-processing agreements.
4. **Database:** Apply all six ordered migrations to staging and production; check unique constraints, foreign-key expectations, rollback/restore practice and allocated-unit consistency. Do not import sample vendors in production.
5. **App workflows:** End-to-end test formal vendor registration, informal GPS placement, unique hub/unit assignment, permit approval/revocation, card lookup, inspections, warnings, violations, delivery/email outcomes, fees, payments, refunds/adjustments, receipts, audits, and role restrictions.
6. **Offline field operations:** Test airplane mode, recovered connectivity, expired auth, duplicate submissions, rejected queue items, app restart, cleared data, camera permission denial and card scan on real Android devices. Offline evidence contains personal data and should not be stored in unencrypted browser storage in a production field deployment.
7. **Operations:** Configure and validate `DB`, `BUCKET`, notice sender, TLS, logging/alerting, backups, environment separation and least-privileged secrets. Verify notice acceptance is not misrepresented as delivery.
8. **Build/release:** Install dependencies from lockfiles, run lint/typecheck/production build, run Android build and device test, dependency/SCA scan, independent penetration test, accessibility audit (keyboard/screen-reader) and mobile responsiveness checks.
9. **Pilot:** Run role-based UAT with the Sol Plaatje LED Office on anonymized staging records; obtain signoff on tariff schedule, legal notice wording, official permissions, financial reconciliation and incident handling.

## Suggested acceptance matrix
| Role | Required pass cases |
|---|---|
| Superuser | bootstrap, users, role management, revoke sessions, audit access |
| Office | register/edit vendors, hub allocations, review and approve, charge/payment/receipt, reporting |
| Field | restricted single-vendor lookup, QR scan, inspection/warning/violation, offline queue retry |
| Unauthenticated | zero access to vendor PII, financial data, uploads and mutations |

**Current decision: NO-GO.** No staging environment, real database, sender, device, or complete automated test suite was available to validate these gates from repository access alone. This document is an evidence-based release checklist, not a certification of production readiness.
