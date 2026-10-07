# Sol Plaatje Municipality — Vendor Identification System

This is the complete editable source of the private first version built on 1 October 2026. Open this folder in Cursor using File → Open Folder.

## What is included

- Formal and informal vendor registration and editing.
- Craven Street, Arena, Platfontein and Greenpoint Container Hubs, and Galeshewe SMME Village.
- Formal hub/unit allocations, including a duplicate allocation check.
- Informal trader GPS coordinates, device location capture and external maps.
- Vendor photograph upload, printable identification cards and Code 39 barcodes.
- Charges, payments, balances and account history.
- Warnings, violations, inspection findings, follow-up dates and case resolution.
- Permit status, verification checklist and CSV export.
- Database schema and generated migration files.

The code does not contain an export of the hosted database or uploaded photographs. Sample records, illustrative fees and example GPS locations are included in lib/data.ts. A fresh local database opens in sample preview mode; click Load sample records to save those examples locally, or create your first real vendor to begin an empty live register.

## Run locally on Windows, macOS or Linux

1. Install Node.js version 22.13.0 or newer and pnpm 11.25.0. If pnpm is missing, run `npm install -g pnpm@11.25.0`.
2. Extract the ZIP completely. Open the extracted Sol_Plaatje_Vendor_System_Source folder in Cursor.
3. Open Cursor's terminal in that folder and run:

```sh
pnpm install --frozen-lockfile
pnpm run local:setup
pnpm dev
```

The development server normally starts at http://localhost:5173. Use the address printed in your terminal if that port is busy. Keep the terminal running while developing. Stop the server with Ctrl+C.

`local:setup` builds the Worker and applies the initial database migration locally. It records a marker so a successful setup can be rerun without replaying that migration. It uses local Cloudflare emulation and does not require a Cloudflare login or modify the hosted site.

Run `pnpm build` to check the production build, and `pnpm run typecheck` to check TypeScript. To preview the built Worker, use `pnpm start` and the address printed in the terminal.

After changing the schema, generate a NEW migration with `pnpm db:generate`, build, and apply the new migration locally using the instructions in README.md. The local setup helper handles only the initial migration. Preserve migration files already applied; do not edit them. Local D1 and R2 state is stored in the home directory at `sp-vendor-state` so Windows can open the database. Back up that folder before any database reset.

If a pnpm script approval prompt occurs, review it before approving dependency build scripts. If installation fails, share the error with Cursor instead of deleting the lockfile.

## Where to make changes

| File / folder | Purpose |
| --- | --- |
| app/page.tsx | Dashboard, vendor forms, profile drawer, hubs, GPS, accounts, compliance and cards |
| app/globals.css | Responsive styles and card print layout |
| app/api/register/route.ts | Vendor and ledger endpoints, validation, case updates |
| app/api/photo/route.ts | Photo uploads and retrieval |
| lib/data.ts | Shared types, five hub names, sample data and balance calculation |
| lib/server.ts | Cloudflare database and object storage bindings |
| db/schema.ts | Drizzle schema for vendors and events |
| drizzle/ | SQL migrations and migration metadata |
| vite.config.ts | Vinext/Vite configuration and local D1/R2 bindings |
| .openai/hosting.json | Original Site identity and logical storage bindings |
| CURSOR_PROJECT_BRIEF.md | Context and a suggested starting prompt for Cursor |

The frontend uses React and TypeScript through Vinext/Vite with Next.js-compatible APIs. Storage is Cloudflare D1 (SQLite) and R2. `pnpm dev` emulates those resources on your computer. This is not a plain Next.js Node-server project: cloudflare:workers imports require the Worker runtime.

The export omits .sites-runtime, so it automatically chooses the portable profile suitable for your computer. It also omits node_modules, Git credentials, production data and build output. Dependencies are restored by pnpm install.

## Development boundaries

- Fees are entered manually; sample rates are not municipal tariffs.
- Checklist entries record an officer's verification; they do not validate uploaded compliance evidence.
- Recording a payment does not collect money or reconcile a bank statement.
- Printable cards contain a barcode; there is no public QR verification service or scanner UI yet.
- Maps need an internet connection. GPS requires browser location permission, and the position must be checked at the actual trading pitch.
- The hosted version relies on its private Sites access boundary. Local development has no equivalent production access restriction. Before deploying independently or using real municipal records, implement staff authentication and server-side role permissions for every endpoint. Do not expose this development server publicly.
- A full municipal production rollout still needs approved tariffs and requirements, staff roles, stronger audit controls, data protection/retention rules, backups, operational testing and deployment configuration.
- TypeScript and the production build passed during creation. End-to-end browser workflows were not verified; test them before operational use.

## Hosted version and deployment

The original private version is https://sol-plaatje-vendor-register.technetech-tt.chatgpt.site . Local edits do not automatically update it. The hosting manifest preserves that original Site ID for continuity, but it is not a credential and cannot authenticate a deployment. To update that Site through ChatGPT, provide the revised project. For another host, have Cursor prepare a Cloudflare-compatible deployment with your own D1/R2 resources and access controls; the local placeholder database ID is not a production database ID.

## Vendor register as a Progressive Web App

The office register at `/` is an installable Progressive Web App. Chrome and Edge offer installation once the site is open (a button appears when the browser allows it, or use the browser menu → Install app). Vendor records are not cached on the device. The service worker only provides the offline notice.

## Field officer Android app

Field visits are a separate Android app in `../Field_Officer_App`, not a page of this website. `/field` only explains that the scanner has moved. Build and install `Field_Officer_App/LED-Field-Visits.apk`. On the phone, sign in with the account created by the super user. An address without a protocol uses HTTPS. Local development still accepts HTTP for localhost, 127.0.0.1, the emulator address 10.0.2.2, and private network addresses such as `http://192.168.x.x:5173`. A release build of the app blocks cleartext; the debug APK allows it so a phone can reach the local register.

Scan a Code 39 vendor card barcode or QR code containing an existing vendor ID. The current profile, hub/unit or street GPS, fees and compliance findings are retrieved from the shared database. Manual vendor ID entry is available if camera permission is denied or scanning fails. Existing legacy ID cards must have their printed ID registered/linked in this database; the system does not reconstruct identity from an unlinked card.

Officials can save inspections, warnings and violations with findings, an optional follow-up date and visit GPS. Records receive the server timestamp and signed-in officer identity. Visit GPS does not overwrite the vendor's registered pitch. Warnings and violations use an approved notice template. Officials can download a PDF, record that a copy was handed to the trader or acknowledged, and open an email draft as a fallback. The draft is not marked as sent. Municipal email is used only when `NOTICE_WEBHOOK_URL` is set on the register; otherwise the screen says municipal email is not connected. Escalation is stored as its own case entry.

The field app requires a network connection to the vendor register. It does not cache vendor profiles, fees or inspection records, and it does not queue visits offline. The first time the register has no users, the sign-in screen asks for the super user once. No default password is published. An account that still has to replace a temporary or previously published password cannot open records until that password is changed. The super user creates each official’s account and can set a temporary password if someone is locked out. Installing the APK does not grant access. Sign-in is throttled after repeated failures. A person can sign out other devices from either app. The field app keeps its sign-in token in protected device storage on Android and in the browser session on the computer preview, not in persistent web storage.

The installed app loads from the phone, so the camera and GPS prompts are Android permissions. The debug APK can use the local HTTP development server on the same network. A release build requires HTTPS. Do not expose the development server publicly.

The Android project is `Field_Officer_App`. It calls `GET /api/register?vendorId=...` and posts visit records to the same API. Rebuild the APK from that folder with `npm install`, `npm run build`, then `npm run apk` (JDK 17 and the Android SDK are required).
