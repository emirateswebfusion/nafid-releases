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
| `auth.ts` | token and offline-session persistence |
| `settings.ts` | key/value settings + typed helpers (`getSetting`, `getStringSetting`, `setSetting`, …) |
| `products.ts`, `grades.ts`, `pricingTiers.ts`, `combos.ts` | catalog, stock, print queue, grades, tier prices, combos |
| `invoices.ts` | checkout, invoices, numbering, held bills, BOS→GST conversion |
| `quotations.ts`, `returns.ts`, `warranties.ts` | documents |
| `scrap.ts`, `purchases.ts` | scrap buy-back and purchase bills |
| `parties.ts`, `customers.ts` | party ledger accounts, customers, credit status, loyalty |
| `cashier.ts`, `paymentSources.ts` | cash drawer, settlements, bank/UPI sources |
| `staff.ts` | staff, PIN, staff ledger, attendance |
| `recycleBin.ts` | soft-deleted records, restore, hard delete, emergency purge |
| `printing.ts`, `whatsapp.ts`, `ecommerce.ts`, `sync.ts` | hardware printing, WhatsApp, FusionCart, sync control |
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
     (`tests/characterization/startup-idempotency.mts`). Guard R10 stops these files from growing.
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
  `WHERE sync_status != 'PENDING'` so unsynced local edits are not overwritten.
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
