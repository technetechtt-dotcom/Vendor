# Sol Plaatje Vendor Platform Audit

**Audit date:** 15 October 2026  
**Scope:** Office vendor register and field officer application  
**Method:** Source review, desktop and 390 × 844 responsive walkthrough, read-only database inspection, type/build/lint checks  

## Executive assessment

The platform has a strong visual foundation and broad functional coverage. The office application exposes all 18 named workspaces, the field application supports vendor lookup and visit capture, and the core layouts, forms, focus treatment, modal behavior and responsive card conversion are thoughtfully implemented.

It is **not ready for dependable production use yet**. The main risks are not missing pages; they are missing operational safeguards and incomplete recovery paths:

1. Existing orphaned allocations, permits and events prove that referential integrity can fail.
2. Backup is export-and-verify only; there is no restore workflow, object-storage export or tested end-to-end disaster-recovery path.
3. A pending vendor with no issued card serial can still have an official-looking card printed.
4. Financial reconciliation omits the vendor/business identity and can be completed without confirmation.
5. The field app's device PIN can be skipped even though cached vendor profiles and visit evidence remain readable in local storage.

## Priority findings

| Priority | Finding | Evidence and impact | Required change |
|---|---|---|---|
| **P0** | Referential integrity is already broken | Vendor `SPM-2026-216FDC49` is absent from the vendor table but still has 1 allocation, 1 permit, 3 events and 1 allocation-history record. Its allocation points to nonexistent unit `ZZ-99`. The orphan is visible in Unit inventory and Permit history. | Add database foreign keys/transactional constraints, prevent deletion while dependants exist, repair existing orphans, and add an integrity-check job and admin report. |
| **P0** | Disaster recovery is incomplete | Backup can download and verify JSON, but cannot restore it. Uploaded photos/documents are excluded and the UI only says to export the bucket separately. Restore copy says to apply six migrations although the repository contains eight (`0000`–`0007`). | Build and test a restore/import path, include or pair object storage, update the runbook automatically from the current schema, and run a scheduled recovery drill. |
| **P1** | Permit/card issuance is not safely gated | The card modal allows printing for a vendor marked **Pending review**, with no issued card serial; the card still looks official. | Disable printing until permit approval and current card issuance are recorded. Show a non-printable draft watermark otherwise. |
| **P1** | Reconciliation lacks enough identity and confirmation | A receipt row shows amount, fee type, actor and date, but not vendor ID/business. **Mark reconciled** commits immediately; only reversal asks for a note. | Show vendor, business, receipt/reference and payment method; add a confirmation step and require a reconciliation note/batch reference. |
| **P1** | Field data protection can be bypassed | The first-run screen says a PIN protects vendor records and evidence, but **Continue without a PIN** proceeds without confirmation. Drafts, queues, cached profiles, GPS and visit history are plain local-storage records; the PIN hash does not encrypt them. | Make PIN/biometric protection policy-controlled and mandatory for production, encrypt sensitive offline data, add retry/rate-limit behavior and an explicit managed-device exception. |
| **P1** | Field release build is currently unreliable | TypeScript passes, but the production build repeatedly fails after transforming 2,138 modules because the Windows build process cannot remove its temporary esbuild folder (`Access is denied`). | Stabilize the build environment, pin/document the supported toolchain, add a clean CI build, and treat a signed build artifact as the release gate. |
| **P1** | Office quality gate is red | Typecheck and production build pass, but lint reports 131 issues (121 errors, 10 warnings), including state updates in effects, impure `Date.now()` during render, missing dependencies, raw anchors and widespread `any` use. | Fix correctness rules first, then type debt; make typecheck, lint and build mandatory CI checks. |
| **P2** | Mobile office navigation overflows and loses meaning | At 390 px the icon rail has a persistent horizontal scrollbar. The Field visits link loses its visible text and has no accessible name. The account actions dominate the header. | Replace the rail with a compact menu/bottom navigation, label every icon, keep one clear account menu and expose overflow workspaces intentionally. |
| **P2** | Registration is long and awkward on small screens | Mobile registration has both page and modal scrollbars; the submit action is far below the fold. Native date fields display US-style `mm/dd/yyyy` in a South African workflow. Informal registration can still show an irrelevant Occupancy agreement upload. | Use a stepped form or sticky action bar, locale-appropriate date guidance, and type-specific document requirements. Add `aria-pressed` to trader-type controls. |
| **P2** | Some interaction semantics are inaccessible | Vendor table rows are keyboard-focusable and respond to Enter but have no link/button role and do not respond to Space. Drawer tabs lack `role="tab"`, `aria-selected` and panel relationships. Repeated row actions have identical accessible names. | Use real links/buttons, implement the tab pattern and include vendor names in accessible action labels. |
| **P2** | Text contrast is below WCAG AA in common UI text | Confirmed examples include `#788681` on white (3.80:1), `#9aa69a` on white (2.53:1), `#8c9c80` on `#f4f6f4` (2.69:1), and amber badge text at 3.08:1. These colors are commonly used at 10–14 px. | Darken secondary and status text, then run automated and manual contrast checks across all states. |
| **P2** | Hub card actions clip at desktop widths | In the three-column hub grid, the right-side Allocate action extends beyond the card boundary. | Allow action wrapping, reduce action density or switch the grid to two columns earlier. |
| **P2** | Audit information is not usable by operational staff | Entries expose raw JSON and ISO timestamps, and the screen says the audit seal will not exist until a future change. | Render field-level before/after changes with friendly dates, actors and references; initialize and continuously verify the audit seal. |
| **P2** | Administration screens are incomplete | Sessions shows raw user-agent strings and has no per-device revoke action. Import is paste-only with no template, file upload or column mapping. Notice rows lack clear case/recipient context. | Add friendly device identity and revoke controls; add import template/upload/mapping; add notice type, target and delivery timeline. |
| **P3** | Information architecture and actions are too generic | **Register vendor** appears on Users, Backup, Settings and other unrelated workspaces. **Tariffs & reports** overlaps with the separate **Reports** workspace. Resolved compliance cases appear under Warnings & violations. | Use context-specific primary actions, rename/split finance administration from analytics, and separate open cases from history. |

## Workflow health

| Step | Flow checked | Health | Result |
|---:|---|---|---|
| 1 | Office sign-in and session landing | **Healthy** | Sign-in structure is clear and the authenticated shell loads consistently. |
| 2 | Overview, workspace selector and sidebar navigation | **Mostly healthy** | Every named workspace loaded; mobile overflow and action relevance need work. |
| 3 | Vendor register, search, filters and profile opening | **Mostly healthy** | Search and record opening work. Desktop table overflows; row semantics are incomplete. |
| 4 | Vendor profile tabs | **Mostly healthy** | Profile, Fees, Compliance and History all render; ARIA tab semantics are missing. |
| 5 | Formal/informal vendor registration | **At risk** | Both variants render, but the form is long, double-scrolls on mobile and does not fully tailor documents by trader type. |
| 6 | Business hubs, locations and inventory | **At risk** | Screens load, but card actions clip and the live dataset contains orphaned allocation history. |
| 7 | Fees, payments and reconciliation | **At risk** | Ledger views exist; reconciliation identity and confirmation are insufficient. |
| 8 | Compliance, permits and cards | **At risk** | Review/history screens exist, but card printing is not gated by approval/issuance. |
| 9 | Reports, notices and audit | **Partial** | Reports are comprehensive but table-heavy; notices lack context; audit output is too technical. |
| 10 | Users, import, settings, backup and sessions | **At risk** | Pages are reachable, but restore, granular session control and guided import are missing. |
| 11 | Field first run, PIN and sign-in | **At risk** | Flow is clear, but the device-protection promise is undermined by the PIN bypass and unencrypted local cache. |
| 12 | Field scan/manual lookup and vendor tabs | **Mostly healthy** | Manual lookup, profile, Fees and Compliance worked in the test flow. Camera scanning requires device testing. |
| 13 | Field visit form and offline recovery | **Mostly healthy** | Draft/retry/recovery UI is present. Wording exposes browser/storage implementation details, and device loss recovery remains weak. |
| 14 | Responsive office behavior | **At risk** | Tables convert usefully to cards, but navigation, modal scrolling and header density need redesign. |
| 15 | Build and static checks | **At risk** | Office typecheck/build pass; office lint fails. Field typecheck passes; field production build fails in the current Windows environment. |

## Alignment, responsiveness and visual consistency

- The core spacing system, typography hierarchy, card treatment and restrained municipal palette are consistent.
- Desktop overview and register screens have clear hierarchy and good information density.
- The register's responsive table-to-card conversion is effective.
- Modal focus trapping, Escape handling, visible focus styles and reduced-motion handling are implemented well.
- Desktop hub actions do not fit their cards, while the mobile icon strip and long registration modal create visible overflow.
- Secondary text is often too light, particularly captions, table metadata, footers, help copy and status badges.
- Raw technical content—JSON, ISO timestamps, user-agent strings, storage terminology and internal release paths—should not be exposed as primary user-facing content.

## Dead pages, links, tabs and buttons

### Confirmed working in the walkthrough

- All 18 office workspaces open.
- Workspace selector, sidebar navigation, vendor search and vendor profile opening.
- Vendor profile tabs: Profile, Fees & payments, Compliance and History.
- Formal/informal registration toggle.
- Field manual vendor lookup, profile tabs, visit form opening and offline-recovery navigation.
- Destructive controls reviewed in source generally include confirmation for remove/clear actions.

### Not dead, but functionally incomplete

- **Backup:** export and verification only; no restore.
- **Sessions:** no per-session/device revoke.
- **Import:** no file upload, template or mapping workflow.
- **Permits & cards:** print eligibility is not enforced.
- **Audit:** integrity seal can be absent and records are not human-readable.
- **Settings/notice delivery:** sender status exists, but operational delivery evidence remains limited.

### Not executed during this read-only audit

Save, delete, reconcile, reverse, approve, user creation and notice-delivery mutations were not submitted. Camera scanning, GPS capture, native secure storage, printing and email handoff require real device/permission/integration testing. Their controls and handlers were reviewed, but this report does not claim end-to-end success for them.

## Missing content and capabilities

- A tested restore experience and object-storage backup/export.
- Data-integrity dashboard and repair workflow.
- Card issuance eligibility, serial assignment and print audit trail.
- Reconciliation references, vendor identity and approval evidence.
- Managed-device security policy and encrypted offline storage.
- Import template, file upload, column mapping and example validation errors.
- Friendly device/session names with individual revoke actions.
- Human-readable audit diffs and sealed-log health.
- Explicit open-versus-resolved compliance views.
- Empty-state guidance for maps and trading locations.
- Clear ownership of Tariff administration versus analytical Reports.
- Automated accessibility, integration and end-to-end regression tests.

## Technical check summary

| Application | Check | Result |
|---|---|---|
| Office register | TypeScript | Pass |
| Office register | Production build | Pass |
| Office register | ESLint | **Fail — 131 issues** |
| Field officer app | TypeScript | Pass |
| Field officer app | Production build | **Fail — Windows temp/esbuild access error after module transformation** |

## Evidence

Representative captures:

- [Desktop overview](01-overview-desktop.png)
- [Vendor registration](07-registration-form-formal.png)
- [Business-hub action clipping](09-business-hubs-desktop.png)
- [Orphan allocation visible in inventory](15-unit-inventory.png)
- [Finance reconciliation missing vendor identity](17-tariffs-reconciliation.png)
- [Raw audit output](20-audit-history.png)
- [Incomplete backup workflow](23-backup.png)
- [Optional field PIN](26-field-pin-mobile.png)
- [Field offline recovery](33-field-offline-recovery-mobile.png)
- [Mobile navigation overflow](35-office-register-mobile.png)
- [Mobile modal double scroll](36-office-registration-mobile.png)
- [Pending vendor card can be printed](37-id-card-mobile.png)

All captured screens are stored in this folder for implementation reference.

## Recommended delivery order

1. Repair orphaned records and enforce relational integrity.
2. Implement and prove backup restoration, including uploaded files.
3. Gate card printing and harden reconciliation controls.
4. Make field offline data protection enforceable and encrypted.
5. Restore green release gates: office lint, field production build and CI.
6. Fix mobile navigation/modal overflow and accessibility semantics/contrast.
7. Complete sessions, import, audit and notice-management workflows.

