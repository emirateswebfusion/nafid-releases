# 2. Codebase map

## Top level

| Path | Purpose |
|---|---|
| `src/` | Renderer (React UI + pure rules + data layer) |
| `electron/` | Main process + preload (compiled by `tsconfig.electron.json`, strict TypeScript) |
| `tests/unit/` | Vitest unit tests (the `npm test` suite) |
| `tests/characterization/` | Main-process harnesses run under plain Node: IPC equivalence, statement check, sync golden (see its README) |
| `scripts/` | `check-architecture.mjs` (guard), `lint-ratchet.mjs`, `fix-sqlite.js` (native rebuild), `upload-release.js` (GitHub release upload) |
| `docs/architecture/` | This documentation |
| `docs/ai-knowledge/` | Knowledge files used by the offline AI assistant |
| `docs/product/features.md` | Product feature list (what the POS does, for onboarding) |
| `arch-baseline.json`, `lint-baseline.json` | Ratchet baselines (may shrink, never grow) |
| `build/`, `release/`, `dist*/` | Packaging resources and build output (never edit by hand) |

## Renderer (`src/`)

```text
src/
  main.tsx               entry: renders PrintRouter for print windows (#/print-*), App otherwise
  App.tsx                shell: which screen is open; the screen-opening events and sync status live in
                         components/app/hooks (useScreenEvents, useSyncStatus); screens load lazily (components/app/lazyScreens.ts)
  index.css, global.d.ts global styles; the typed bridge contract (`IElectronAPI`)
  components/             one folder per feature; no loose files here (guard R14)
    <feature>/<Screen>.tsx   the screen (orchestration) next to its views/, modals/, hooks/ (e.g. billing/BillingPage.tsx,
                             sales/SalesHistory.tsx, cashier/CashierSettlement.tsx, inventory/InventoryManager.tsx)
    billing/              + checkout/, customerDirectory.ts, productSearch.ts, numberReservation.ts, BillingConstants.ts
    settings/             SettingsManager + tabs/, the settings panels (emergency purge, data masking, terminology)
    app/                  app shell: ErrorBoundary, PermissionGuard, SplashScreen, UpdateBanner, prompts, PrintRouter, lazyScreens, hooks/
    auth/ print/          login screen; receipt / A4 / barcode print views
    ui/                   design primitives (Button, Input, Modal, Select, Card, Badge, ScrollText, …)
  data/                   THE data-access layer (one module per domain; see 03-data-access.md)
  store/                  Zustand stores shared across screens (auth, cart, tabs, theme, flags, …)
  hooks/                  reusable React hooks (keyboard shortcuts, escape-to-close, …)
  utils/                  pure rules and generators (money, pricing, checkout lines, tax, numbering, HTML)
  services/               long-running renderer services (offline AI engine, FusionCart client)
    offlineAi/            offline AI engine: intentParser + intentRules* (question → intent), handlers/<domain>
                          (intent → answer from local data); offlineAiService.ts is the entry point
  config/                 static configuration: featureFlags.ts, labelCodeTypes.ts
```

### Responsibilities and allowed imports

| Layer | Owns | May import | Must not import |
|---|---|---|---|
| `components/**` | Rendering, user interaction, screen-local state | `components/ui`, `hooks`, `store`, `data`, `utils`, `lib`, `services` | `electron`, `window.electronAPI` |
| `store/**` | Cross-screen state + actions | `data`, `utils`, other stores | `components` *(enforced)* |
| `hooks/**` | Reusable behaviour | `store`, `data`, `utils` | `components` (except `ui`) |
| `data/**` | Bridge access, DTO types, mapping | `data/client` only | React, stores, UI, `any` *(enforced)* |
| `utils/**` | Pure functions (no IO, no React) | other `utils` | `data`, `store`, `components`, `window` |
| `services/**` | Long-running/background logic in the renderer | `data`, `utils`, `lib` | `components` |
| `data/cloud/*` | HTTP to `nafid-server` (`client.ts` is the only `fetch` caller) | nothing above `data/` (the auth store registers the token / 401 handlers) | UI, stores |

Dependency direction: `components → hooks / store → services → data / lib → utils`. Never the reverse.

### Feature folder shape

Big screens are being split into feature folders. Use this shape (do not create empty folders):

```text
components/<feature>/
  views/     presentational sections of the screen (props in, callbacks out)
  modals/    dialogs owned by the feature
  ui/        small feature-specific widgets
  <feature>Helpers.tsx / <rule>.ts   feature-local helpers (pure or data-calling use-cases)
```

Billing checkout lives in `components/billing/checkout/`: `createCheckoutHandler(ctx)` (sales checkout: validation,
payload, persistence, printing, WhatsApp, tab reset) and `runScrapCheckout(ctx, run)` (scrap purchase flow). The screen
passes its state and setters as a typed `CheckoutContext` each render.

The screen file (`components/<feature>/<Screen>.tsx`) keeps orchestration only. Shared pure rules go to `src/utils/`.

## Main process (`electron/`)

```text
electron/
  main.ts            composition root: windows, lifecycle, deep links, registers IPC (no business logic)
  preload.ts         contextBridge → window.electronAPI (one function per channel, no logic)
  ipc/               REGISTRATION ONLY — no SQL, no rules (enforced)
    index.ts         registerAllIpcHandlers() — the single registration point
    common.ts        handle(channel, fn, { safe }) + safeHandler + validators (re-exported from utils)
    <domain>Handlers.ts   handle('db:getQuotations', quotationsService.getQuotations); …
  services/          use-cases, one module per domain; function name = preload method minus the `db` prefix
    invoicesService.ts      public entry for invoices; re-exports the use-case modules below
      invoiceCheckoutService.ts · heldBillsService.ts · invoiceQueryService.ts
      invoiceEditService.ts · bosConversionService.ts
    productsService · gradesService · pricingTiersService · combosService
    customersService · partiesService · partyLedgerService
    customerCreditService (credit limits/overdue) · quotationsService · returnsService · warrantiesService
    scrapService · purchasesService · cashierService · cashDrawerService · paymentSourcesService
    staffService (staff, biller PIN, staff ledger, attendance) · localAuthService (offline login)
    emergencyPurgeService · settingsService · recycleBinService · syncService · ecommerceService
    invoiceNumberService · storeTime · authStorage · windowRegistry · updater · fusionCartBridge …
  db/
    localDb.ts       SQLite connection (getDb/getOpenDb) and initDb, which runs in order:
                     schemaCoreTables / schemaExtendedTables (CREATE IF NOT EXISTS), schemaColumns (missing
                     columns), migrationsRepairs (legacy data fixes), migrationsColumns (later column migrations)
    customerIdentity.ts   customer/party identity resolution and upsert
    customerDedupe.ts     startup backfill from invoices + customer / party de-duplication (data repair)
    statements/      SQL text, one module per service: `export const findX = (db: Db) => db.prepare(SQL)`;
                     dynamic filters: `export function getXStatement(db, args) → { statement, params }`
      productSearch.ts    shared product search WHERE-fragment builder
      types.ts       `Db = Pick<Database, 'prepare'>`
  sync/              highest data risk; change only behind the sync / LAN characterization harnesses
    syncWorker.ts    public API + scheduler: init, fast bill pull, urgent triggers, page context, initial sync
    syncCycle.ts     one cycle: cloud status, lightweight / delta pulls, the push → pull sequence
    syncTransport.ts endpoints + connectivity, fetch with LAN→cloud fallback, pushBatch + outbox, cursors, pullPaginated
    syncConfig.ts / cloudAccess.ts / syncProgress.ts / syncState.ts   limits + stored login / access rules / progress / shared state
    entities/        per-table push + pull: catalog, salesDocs, parties, cash, stockDocs, settings
    localHostServer.ts (LAN server) + lanUpsert.ts (LAN row merge)
  hardware/          printer (ESC/POS, A4/PDF), weighingScale (serial), barcodeScanner (keyboard wedge)
  whatsapp/          Baileys session, invoice sending, shop-closing report (service + IPC; shopClosingSummary = data,
                     shopClosingMessage = WhatsApp text, shopClosingTypes)
  utils/             pure helpers for the main process (ids, gst, validation, timestamps, cashier settlement math)
```

Dependency direction: `main → ipc → services → db/statements`, `sync → services/db`; `hardware`/`whatsapp` are adapters.
*Enforced:* `services`, `db`, `sync` never import `ipc`; `ipc` contains no `.prepare(` and never imports
`db/statements`; services, sync and `main.ts` contain no `.prepare(` at all: every statement, including the dynamic query
builders (`getProductsStatement`, `getInvoicesStatement`, `deltaRowsQuery`, …, returning `{ statement, params }`), lives in
`db/statements`, `db/statements/sync/*` or `db/statements/main.ts`. Services resolve inputs such as store-day UTC ranges first.

## Size budgets

- Components: **800 lines**, 20 `useState`, 20 props. Oversized legacy files are listed in `arch-baseline.json`
  (`sizeCaps`) and may only shrink. The largest are `BillingPage.tsx`, `SalesHistory.tsx`, `PurchaseBillManager.tsx`,
  `CashierSettlement.tsx`, `CustomersPage.tsx`.
- Main process: every `electron/**` file shares the 800-line budget; all services are under it. Capped legacy files:
  none — every file is under the budget; sync files change only behind the sync characterization harness.
