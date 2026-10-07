# Cursor project brief

## Product
Build on this vendor identification and management system for the Sol Plaatje Municipality Local Economic Development (LED) Office in Kimberley, South Africa. Preserve the existing working interface and features unless a change is explicitly requested.

Formal vendors are allocated to one of these five locations:
1. Craven Street Container Hub
2. Arena Container Hub
3. Platfontein Container Hub
4. Greenpoint Container Hub
5. Galeshewe SMME Village

Informal vendors trade on street sidewalks and require recorded latitude/longitude and a trading pitch reference. A device GPS position must be confirmed as the actual trading pitch.

Manage vendor identity, registration and permit dates, fee charges, received payments, compliance verification, inspections, warnings, violations and resolution history. Keep financial status separate from permit approval: a balance alone must not silently change a permit.

## Current architecture
React/TypeScript in app/page.tsx, custom CSS, Vinext/Vite, Cloudflare Worker APIs, D1 SQLite, R2 photos, Drizzle migrations. The full source and lockfile are included. Do not replace the backend with browser localStorage. Currency calculations use integer cents. Prepared SQL and database batch operations are used for linked writes.

## Suggested prompt

Read START_HERE.md, CURSOR_PROJECT_BRIEF.md, package.json and the app, lib and db source. Help me run this existing project locally first. Preserve its interface and feature set. Verify registration/editing, hub unit uniqueness, informal GPS validation, photo uploads, fee charges/payments, permit expiry, warnings and case resolution. Report any reproducible bugs and fix them with focused changes. Then propose an implementation plan for staff authentication and server-side permissions, configurable municipal tariffs and compliance requirements, stronger audit history, evidence documents and database backups. Do not invent legal requirements or fee amounts, and do not deploy or connect to the original private Site without my instruction.

## Next development priorities

1. Local workflow verification and bug fixes.
2. LED administrator, registration officer, compliance officer and finance roles, backed by server-side authorization.
3. Configurable fee schedules, annual tariff versions and financial corrections/reversals.
4. Verified document attachments, permit renewal workflow and recorded location changes.
5. QR-based restricted record verification and scanning, with minimal exposed information.
6. Stronger append-only audit logging, transactional case resolution and simultaneous unit-allocation protection.
7. Backup/restore, retention rules, imports, reporting and a controlled pilot with the LED Office.

These are proposed next steps, not implemented features. The existing demonstration data must never be mistaken for real municipal records.

## Implemented field visit extension

The vendor register is a Progressive Web App. Field visits are a separate Android app (`Field_Officer_App`) that scans Code 39 and QR codes, opens current vendor profiles, and records inspections, warnings and violations with optional visit GPS. Notice drafts still use the shared wording. Test the installed APK for camera scanning, permission denial, unknown/legacy IDs, saved inspection history and email-client draft opening. Maintain server-side access controls; neither installing the APK nor a camera scan is proof of authorisation. Automated notice email delivery with a municipal sender and delivery audit is a future integration, not a currently implemented feature.
