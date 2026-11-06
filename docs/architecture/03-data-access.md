# 3. Data access

All data the renderer reads or writes goes through one of three doors:

| Door | Module | Transport | Use for |
|---|---|---|---|
| Local data (default) | `src/data/<domain>.ts` | IPC → main process → SQLite | Everything the POS does offline: products, billing, parties, cashier, settings… |
| Push events | `src/data/events.ts` (`bridgeEvents`) | main → renderer events | Sync finished, barcode scanned, scale weight, update status, token expired… |
| Cloud API | `src/data/cloud/*` (`client.ts`: `cloudFetch`, `cloudRequest`) | HTTPS + JWT | Online-only features: AI assistant, ads, super-admin, party connect. Login/password flows live in `store/authStore.ts` |

## 3.1 The IPC data layer (`src/data/`)

`src/data/client.ts` is the **only** module that reads `window.electronAPI`. It provides:

| Helper | Purpose |
|---|---|
| `bindBridge({ alias: 'channel' })` | Builds a typed domain repository. Each function keeps the exact signature declared in `src/global.d.ts` and throws `IpcUnavailableError` outside the desktop runtime |
| `bindEvents({ alias: 'onChannel' })` | Same for subscriptions; returns a no-op unsubscribe when the bridge/channel is absent |
| `hasBridge('channel')` | Feature detection for channels older desktop builds may lack |
| `isDesktopRuntime()` | `true` inside Electron |
| `api()`, `ensureSuccess()`, `WriteResult` | Low-level access for hand-written repository functions |

Each domain module exports a **channel catalog** named `<domain>Api` (method name = channel name without the `db`/domain
prefix), plus optional hand-written, typed functions when mapping or defaults are needed:

```ts
// src/data/scrap.ts
export const scrapApi = bindBridge({
  getScrapInvoiceByNumber: 'dbGetScrapInvoiceByNumber',
  getScrapInvoiceList: 'dbGetScrapInvoiceList',
  // …
});

// usage in UI code
import { scrapApi } from '../data/scrap';
const inv = await scrapApi.getScrapInvoiceByNumber({ tenant_id, scrap_invoice_number });
```

| Module | Domain |
|---|---|
| `app.ts` | version, updater, network info, `logError()` (safe outside desktop) |
| `auth.ts` | token, offline-session persistence, Quick PIN login and terminal configuration |
| `settings.ts` | key/value settings + typed helpers (`getSetting`, `getStringSetting`, `setSetting`, …) |
| `products.ts`, `grades.ts`, `pricingTiers.ts`, `combos.ts` | catalog, stock, print queue, grades, tier prices, combos |
| `invoices.ts` | checkout, invoices, numbering, held bills, BOS→GST conversion |
| `gst.ts`, `vat.ts` | statutory tax returns (GSTR-1, GSTR-3B, Form VAT 201), FTA Audit File (FAF), local filing lifecycles |
| `quotations.ts`, `returns.ts`, `warranties.ts` | documents |
| `scrap.ts`, `purchases.ts` | scrap buy-back and purchase bills |
| `parties.ts`, `customers.ts` | party ledger accounts, customers, credit status, loyalty |
| `cashier.ts`, `paymentSources.ts` | cash drawer, settlements, bank/UPI sources |
| `staff.ts` | staff, PIN, staff ledger, attendance |
| `recycleBin.ts` | soft-deleted records, restore, hard delete, emergency purge |
| `printing.ts`, `whatsapp.ts`, `ecommerce.ts`, `sync.ts` | hardware printing, WhatsApp, FusionCart, sync control |
| `cardTerminal.ts` | bank card machine (ECR): sale, void, refund, cancel, slip resolution, journal (`card-terminal-design.md`) |
| `restaurant.ts` | restaurant mode: tables, kitchen stations, add-ons, orders, KOT printing, kitchen display, reports |
| `events.ts` | `bridgeEvents` subscriptions |

### Adding or changing an IPC channel (5 steps, one change)

1. **Main process** — SQL in `electron/db/statements/<domain>.ts` (`export const findThing = (db: Db) => db.prepare(…)`),
   the use-case in `electron/services/<domain>Service.ts` (`export function doThing(payload) { … }`, validates input,
   returns `{ success, error? }`), and one registration line in `electron/ipc/<domain>Handlers.ts`:
   `handle('db:doThing', domainService.doThing)` (`{ safe: true }` to wrap in `safeHandler`). Only a handler that needs the
   `event` (e.g. to stream progress to `event.sender`) may use `ipcMain.handle` directly.
2. **Register** — only if you created a new handler file: add it to `electron/ipc/index.ts`.
3. **Preload** — `electron/preload.ts`: `dbDoThing: (payload: …) => ipcRenderer.invoke('db:doThing', payload)`.
4. **Type** — `src/global.d.ts` → `IElectronAPI.dbDoThing: (payload: …) => Promise<…>`. Inputs the service validates
   are `unknown`; the output is a type from `src/data/`: a generated row (`Rows.XxxRow` from `src/data/dbRows.ts`) or a
   shape defined next to the domain catalog that `extends` / `Pick`s rows for joined or aliased columns (e.g. `Product`,
   `Invoice`, `PurchaseSearchProduct`, `DeletedProduct`). Derive it from the SQL that produces the value. Never `any`;
   never import `electron/` types into `src/`. After a schema change regenerate the rows with
   `tests/characterization/gen-row-types.mts` (see `tests/characterization/README.md`).
5. **Repository** — add `doThing: 'dbDoThing'` to the domain's `bindBridge({...})` in `src/data/<domain>.ts`
   (or a typed wrapper function next to it). UI code calls `<domain>Api.doThing(...)`.

Keep existing channel names and payload shapes stable — the LAN server and older terminals depend on them.
db:getBosConvertibleInvoices keeps its legacy (tenant_id) form. Sales History supplies an optional
invoice_ids: string[] as its second argument, limited to the just-fetched page (30 rows). An empty list returns
no rows; the service binds IDs in the statement factory. It does not scan all shop invoices during screen opening.
The invoice list renders independently of its full-filter summary; stale filter responses are ignored.

Main → renderer events follow the same path with `bindEvents` in `src/data/events.ts`.

### Error handling

- Writes return `{ success, error? }`. UI code either branches on `success` or calls `ensureSuccess(result, 'Save product')`
  in a repository wrapper to turn failures into exceptions — pick one style per domain.
- `src/data/**` contains no React, no toasts, no formatting.

## 3.2 Cloud REST (`src/data/cloud/`)

`client.ts` is the only module that calls `fetch` (guard R11). Base URL `CLOUD_API` = `VITE_CLOUD_API`.
- `cloudFetch<T>(endpoint, init)` adds `Authorization: Bearer <jwt>` and JSON headers, parses the body, throws
  `Error(body.error)` when the response is not OK, and on **401** pauses cloud sync and opens the session-expired modal.
- `cloudRequest(url, init)` returns the raw `Response` for callers that inspect status / bodies themselves (login,
  staff accounts, health checks); a `/path` is relative to `CLOUD_API`.
- The data layer does not import stores: `store/authStore.ts` calls `registerCloudAuth({ getToken, onUnauthorized })`
  (token recovery from the bridge, sync pause + modal).
- One repository per domain exports `<domain>Cloud`: `ads`, `aiAssistant`, `authCloud`, `emergency`, `health`,
  `partyConnect`, `sales`, `staffCloud`, `superAdmin`. UI code calls them, never `fetch`.
Before adding a cloud call, confirm the route is mounted in `nafid-server/src/index.ts` (the REST contract is documented
in `nafid-server/docs/architecture/02-http-api.md`).

### Cloud session recovery

`LoginScreen` retains the `auth_prefer_email` recovery intent across StrictMode effects and failed retries.
It calls `authStore.login(..., { requireCloud: true })` (fourth argument): recovering cloud sync requires an online
login and successful `authApi.saveToken`; it cannot silently succeed through cached offline credentials.
Ordinary login may still fall back for network/provider outages (including hosting HTTP 402), but never for
invalid login input, a credential/account denial or rate limiting (HTTP 400/401/403/429). Local-authentication
failures return an error so the login form remains retryable.
Missing/expired tokens and persistence failures remain on the login screen. A later domain-confirmation cache failure
must not replace the saved online session with an offline one.

The sync transport handles cloud HTTP 401 responses using the token and route of the individual request.
It compares the rejected token with the current persisted token before pausing; LAN pairing errors and stale
responses cannot pause a replacement session. `onTokenExpired` optionally carries `{ token }` through the preload,
`global.d.ts` and `bridgeEvents`; the renderer ignores mismatched/signed-out events and honors matching server
rejections even when JWT expiry is in the future. Payload-free events from older main processes retain their expiry
check. PIN users compare the stored terminal credential for their tenant without adopting its owner JWT;
a user/session change during that read cancels the stale prompt. Reauthentication restarts a cancelled background
timer once. REST/sync payloads and persisted business rows are unchanged. Regression coverage: `cloudRelogin.ui`, `reloginScreen.ui`, `syncReauthentication`, `syncResumeTimer`.

## 3.3 Main-process data layer

```text
ipc/<domain>Handlers.ts   handle('db:getReturns', returnsService.getReturns)          registration only
services/returnsService.ts export function getReturns(filters) { … returnsSql.listReturns(db).all(…) }   rules
db/statements/returns.ts  export const listReturns = (db: Db) => db.prepare(`SELECT …`)                  SQL text
```

- A statement factory takes the connection (`getDb()` or the transaction's `db`) and returns the prepared statement, so
  callers keep using `.get/.all/.run` and transactions work unchanged. Name it by intent: `find…`, `list…`, `count…`,
  `insert…`, `update…`, `upsert…`, `delete…`/`softDelete…`, `mark…`.
- Dynamic SQL (an `IN (?,?,…)` list, an optional column) is a factory with string parameters documented as
  *trusted values only* — placeholders and column names built in code, never user input. User values are always bound `?`.
- Filter builders that assemble a `WHERE` from optional filters live in `db/statements` as
  `export function getXStatement(db, args) { …; return { statement: db.prepare(query), params }; }`; the service calls
  `const { statement, params } = xSql.getXStatement(db, { … }); statement.all(...params)`. Six builders that resolve
  store-time date ranges are still inline (capped in `arch-baseline.json` → `servicePrepareCounts`).
- **Proving a main-process refactor:** `tests/characterization/` replays a seeded scenario plus every IPC
  channel against a baseline checkout and the working tree and diffs the results; `check-statements.mts` prepares
  every statement against a fresh schema; `sync-run.mts` pins the sync push/pull contract against `sync-golden.json`.
  Run them after moving SQL, splitting a service or touching sync.

## 3.4 Local database and sync (main process)

- **SQLite** (`electron/db/localDb.ts`): one file per terminal, WAL mode. `initDb` runs two layers:
  1. **Startup baseline** (frozen): `schemaCoreTables` / `schemaExtendedTables` / `schemaColumns` create the schema, and
     `migrationsRepairs` / `migrationsColumns` plus the repairs in `localDb.ts` normalise legacy data. It runs on every
     start because older terminals keep syncing old shapes in; it must stay idempotent
     (`tests/characterization/startup-idempotency.mts`). Guard R10 stops these files from growing. Startup repairs must never overwrite user-mutable fields on recurring runs (e.g. converted invoice dates; document synchronization belongs in transactional service logic).
  2. **Versioned migrations** (`electron/db/migrations/`): each runs once, in order, in a transaction, recorded in
     `schema_migrations` and `PRAGMA user_version`; a failing one rolls back and is retried on the next start.
     **Every new schema or data change goes here**: add `NNN-short-name.ts` exporting a `Migration`
     (`{ version, name, up(db) }`) with the next number, list it in `migrations/index.ts`, extend
     `tests/characterization/migrations.mts`, and mirror synced columns in `nafid-server/src/db/migrations/tenant/NNN_*.sql`.
     Never edit or renumber a released migration; write a new one.
  Synced business tables carry `tenant_id`, `updated_at`, `sync_status` (`PENDING` / `SYNCED`) and soft delete (`is_deleted`).
- **Writes** run in `db.transaction(...)` and set `sync_status = 'PENDING'`.
- **Push**: `syncWorker.ts` scans `PENDING` rows per table and posts batches to `POST /api/sync/<entity>`; rows reported in
  `synced[]` become `SYNCED`.
- **Pull**: `POST /api/sync/delta-pull` with a per-table `since` cursor; local upserts are guarded by
  `WHERE sync_status != 'PENDING'` so unsynced local edits are not overwritten. Do not add an `updated_at` tiebreak:
  local `CURRENT_TIMESTAMP` (`2026-10-27 12:00:00`) and server ISO strings (`…T12:00:00Z`) compare as text, so the
  server always looked newer and pulls overwrote pending party phone edits (`tests/unit/partyPhoneSyncProtection.test.ts`).
- **LAN**: the primary terminal serves a subset of the sync API to other terminals (`localHostServer.ts`). Every
  endpoint except `/health` requires the **shop pairing key** in the `X-Nafid-Lan-Key` header (401 otherwise). The
  primary generates the key on first start of its LAN server; it is shown in Settings → Network (copy/regenerate)
  and entered once on each secondary (`components/settings/tabs/LanPairingKeyPanel.tsx`). It lives in the
  device-local `network_sync_config` setting (never synced) and is sent only on LAN requests, never to the cloud
  (`electron/services/lanPairing.ts`). Saving network settings keeps the stored key.
- **Emergency wipe**: a local wipe (`emergency:purgeLocal`) requires an administrator's email and password, checked
  in the main process, and is appended to `userData/emergency-purge-audit.jsonl` before data is removed. Remote wipes
  are owner-issued server commands polled by `electron/sync/emergencyCommands.ts` (see the server sync docs);
  wipe commands are never accepted through synced settings.
- The sync payload contract is shared with `nafid-server/src/routes/sync/*`. Any change must update both sides and the
  docs in the same change, and must be preceded by a characterization test (sync is the highest data-risk area).

### WhatsApp bill sharing

`whatsapp:sendInvoice` also accepts optional `receiptText` and `receiptWidthMm` (58 or 80).
The adapter renders receipt text through the existing hardware receipt renderer, then generates a receipt-width PDF.
Existing HTML and text payloads retain their behavior; PDF rendering failures return a failed result.

- **Dynamic thermal PDF sizing:** In `electron/whatsapp/whatsappService.ts`, thermal mode dynamically measures the rendered receipt DOM height (`document.body.scrollHeight`), calculates exact millimeter length (`pageHeightMm = Math.max(40, Math.ceil(heightPx * 25.4 / 96 + 3))`), injects matching `@page { size: ${widthMm}mm ${pageHeightMm}mm !important; margin: 0 !important; }`, and invokes Electron `webContents.printToPDF` with custom paper roll dimensions `{ width: widthMm / 25.4, height: pageHeightMm / 25.4 }` and `preferCSSPageSize: true`. This prevents thermal receipt PDFs sent via WhatsApp from displaying on an oversized A4 canvas with excessive blank white space.
- **Automatic checkout dispatch persistence:** The checkout auto-send toggle (`auto_whatsapp_send`) is saved to the SQLite `settings` table via `setSetting` on change and settings save, synchronized to `localStorage` during initial startup via `useSettingsLoader`, and auto-healed from SQLite in `checkoutHandler.ts` if `localStorage` was cleared.


### Shop localization settings

Shared settings `store_country` (`IN` / `AE`) and `vat_price_inclusive` (boolean) use existing settings IPC
and cloud/LAN settings payloads. Legacy pulls allow both keys. No columns or invoice enum values change;
UAE VAT remains `tax_total` / `tax_amount`, with Indian component fields zero. Older clients are not UAE
aware: all terminals of a UAE shop must run a UAE-capable version. Server contract coverage:
`nafid-server/tests/storeProfileSync.test.ts`; POS pull coverage: `storeProfileSync.test.ts`.

`uae_arabic_print` (`{ documents, thermal }`, typed in `KnownSettings`) uses the same settings IPC. It is pushed like
any setting but deliberately not in the pull allowlist (`electron/sync/entities/settingsSync.ts`), so each terminal
keeps its own choice; no server change is needed (the settings push accepts any key).

### UAE e-invoicing (migration 017, 3 Nov 2026)

`einvoice_documents` is a read-only mirror of the server-owned statuses. `electron/sync/einvoiceSync.ts` fills it after each cloud cycle: `POST /api/einvoice/process`, then `GET /api/sync/einvoice-documents`. It is cloud-only, so it stays outside `sync/entities/` (the LAN table rules cover entities only).

`customers.einvoice_profile` (JSON) is synced in both directions. A pull with no profile keeps the local one. The outbox trigger for `customers` is rebuilt by 017.

IPC channels: `db:getEinvoiceStatuses`, `db:getEinvoiceSummary`, `db:getCustomerEinvoiceProfile`, `db:saveCustomerEinvoiceProfile` (`src/data/einvoice.ts`). Cloud configuration goes through `src/data/cloud/einvoiceCloud.ts`. Design: `uae-einvoicing-design.md`.



### Unified release / UAE feature migration histories (4 November 2026)

Released POS 2.2.35–2.2.37 databases recorded scrap repairs at versions 015/016, while
local UAE previews recorded card-terminal / restaurant schema at those versions. Historical
files and applied records are preserved. The canonical registry keeps feature migrations
015–017, then 018 idempotently ensures card-terminal and restaurant schema for released shops;
019/020 reuse the historical scrap repair implementations for preview shops. The runner never
registers duplicate versions. No shop settings or feature flags are enabled by the upgrade.
Fresh databases and both prior histories are covered by `migrationBranchCompatibility.test.ts`.

### Repeated cloud authorization failures

Cloud JSON calls notify once while the current session is paused. A 401 from a previous token is ignored
for session state after login or sign-out; the request still rejects. Local POS access remains active.
Regression: `sessionUnauthorized.ui.test.ts` (concurrent failures and delayed prior-session responses).

### Installer-to-renderer readiness

`app:rendererReady` / `appApi.rendererReady()` acknowledges a painted initial app view after auth/profile loading.
Only the main window may acknowledge. A numeric `--nafid-update-ready=<installer PID>` launch argument selects
`nafid-update-<PID>.ready` inside Nafid's canonical per-user data directory; arbitrary paths and ambiguous arguments are rejected.
NSIS uses the same current-user `$APPDATA\Nafid` root. Do not use TEMP: a shell-launched app may inherit a different temporary directory.
The service writes only after the main window is visible. Normal startup creates no marker. The NSIS installer keeps
its Starting Nafid status open until this acknowledgement, with an explicit retry/close prompt after a bounded wait.
No shop data, sync payload, authentication permission or server endpoint changes.

### Update verification progress

The worker reports measured file bytes through update-verification-progress and the preload/data events catalog onUpdateVerificationProgress. Its percent payload is 0–99 while hashing and 100 only after SHA-512 matches. The install store keeps this separate from download progress and ignores events outside an active install. Windows process creation and app startup remain indeterminate; their duration has no measurable overall percentage. Installer timeout text distinguishes a possible Windows publisher/security block from ordinary slow startup without claiming automatic policy detection.

### Updater IPC ownership

`electron/ipc/updaterHandlers.ts` owns the three one-line install/download/check registrations.
`electron/services/updaterService.ts` owns the state machine and exported use-cases; it does not register IPC.
Channel names and result payloads are unchanged. The IPC equivalence harness compares baseline/candidate
registration and local behavior; updater-specific state/launch behavior is covered by `updaterInstall.test.ts`.

### Shared update state in Settings

`useUpdateStore` owns the update event subscriptions, check response, download progress and ready/install state for every screen. Settings reads its current snapshot through `useSettingsUpdater` using Zustand selectors and derives its display status without mirroring store fields in local state. It immediately receives updates that finished before Settings opened. Do not add a second screen-specific bridge subscription or discard the `checkForUpdates` response: a downloaded update may only replay its ready status, with metadata returned by that response. The ready action must remain available even when release metadata is absent. Regression tests: `updateStore.test.ts` and `settingsUpdater.ui.test.tsx`.

### Feature settings consistency (5 November 2026)

`feature_flags` remains a shared per-tenant JSON setting through existing settings sync. A cloud pull cannot
overwrite a PENDING local selection. A push acknowledgement clears only the exact value/timestamp sent,
so edits during upload remain pending. Non-pending cloud snapshots and LAN upserts compare parsed dates
for feature_flags; a stale snapshot cannot rewind these module choices. Server settings upsert likewise
rejects older feature_flags timestamps. Other settings keep their existing conflict rules. Renderer reloads
on sync data events. Disconnected terminals receive changes after reconnection/sync, not instantaneously.
Contract coverage: tests/unit/featureSettingsSync.test.ts and server tests/featureSettingsSync.test.ts;
server golden change is limited to the feature_flags conflict condition.

### Last terminal session (v2.2.44)

`auth:getTerminalConfig` returns optional `user_name`, `role`, and `user_id` beside the existing shop
fields. The local `last_active_terminal_session` setting is written with sync_status LOCAL under global;
it contains display context only, never credentials. Auth token/offline session save and logout preserve
this context through `authSessionService` and `terminalSession`. PIN authentication still validates the
staff hash, tenant status, active status and login permissions. Quick PIN login (`auth:loginWithPin`)
preserves an existing valid cloud session for the same tenant instead of wiping on-disk credentials,
updating the session user and keeping background sync active (`isCloudSyncPaused: false`). Offline-only
PIN login sets `isCloudSyncPaused: true` without raising false expiry errors. Clicking resume sync
prioritizes the email/password login tab. No cloud/LAN payload changes.
