# 6. Change guide

## 6.1 Where does my code go?

| You are adding / changing… | Put it in | Notes |
|---|---|---|
| A new screen | `src/components/<Feature>.tsx` + `src/components/<feature>/{views,modals,ui}` | Register navigation in `App.tsx`; wrap with `PermissionGuard` if gated |
| A section of an existing big screen | a new file under `components/<feature>/views/` | Pass data + callbacks as props; do not grow the screen file |
| A dialog | `components/<feature>/modals/` | Use `ui/Modal` |
| A reusable visual primitive | `components/ui/` | No business logic |
| State shared by several screens | `src/store/<name>Store.ts` | Selectors only in consumers |
| A calculation (money, tax, pricing, numbering, permission) | `src/utils/<topic>.ts` + `tests/unit/<topic>.test.ts` | Check [04-business-rules](04-business-rules.md) first — it may already exist |
| A use-case combining data calls + a rule (e.g. "find scrap credit") | `components/<feature>/<useCase>.ts` | Calls `src/data/*`; tested with `vi.mock` |
| Reading/writing local data | `src/data/<domain>.ts` | Existing channel → just call `<domain>Api`; new channel → the 5-step recipe in [03](03-data-access.md#adding-or-changing-an-ipc-channel-5-steps-one-change) |
| Listening to main-process events | `src/data/events.ts` (`bridgeEvents`) | Return the unsubscribe from your effect |
| A cloud (online-only) call | `src/lib/api.ts` `fetchApi` (target: `src/data/cloud/<domain>.ts`) | Verify the server route exists |
| SQL | `electron/db/statements/<domain>.ts` | Intent-named factory `(db: Db) => db.prepare(…)`; bind user values with `?` |
| Schema / migration | `electron/db/localDb.ts` | Idempotent `ALTER … ADD COLUMN`; mirror synced columns in the server migrations |
| A main-process use-case | `electron/services/<domain>Service.ts` | Validates, applies rules, runs statements in `db.transaction`; never imports `electron/ipc/` |
| An IPC channel | `electron/ipc/<domain>Handlers.ts` | One line: `handle('db:doThing', domainService.doThing)` |
| Printer / scale / scanner / WhatsApp behaviour | `electron/hardware/*`, `electron/whatsapp/*` | Adapters only |
| A synced table or column | `electron/sync/syncWorker.ts` + `nafid-server/src/routes/sync/*` + server migration | Characterization test first; update both repos and the docs together |

## 6.2 Workflow for any change

1. **Locate the owner.** Use the table above and [02-codebase-map](02-codebase-map.md). One change belongs to one layer.
2. **Read before you write.** Find every caller of what you change (`grep` the function/channel name across `src/` and
   `electron/`; for sync/REST also grep `nafid-server`).
3. **Rules first.** Write or change the pure function and its test before wiring UI.
4. **Data second.** Reuse the domain repository; add a channel only if none fits.
5. **UI last, in small files.** Extract instead of growing a screen.
6. **Verify:** `npm run verify` (must pass), and run the app for UI changes (`npm run dev`) — exercise the screen you changed
   and one neighbouring flow (for billing: create a bill, hold/recall, print preview).
7. **Document:** update these docs if you changed a contract, a layer, a rule module or a convention.

## 6.3 Modifying an existing feature safely

- **Billing / checkout:** line money math is in `utils/linePricing.ts` and `utils/checkoutLines.ts`; totals in
  `store/cartStore.ts`; deduction lookups in `components/billing/deductionLookup.ts`. Change those, not inline copies.
- **Big screens** (`BillingPage`, `SalesHistory`, `PurchaseBillManager`, `CashierSettlement`, `CustomersPage`):
  extract the block you need to change into `views/` or a hook first (move code verbatim, compile, then edit), so the
  change is reviewable and the screen shrinks.
- **Main process:** change the use-case in `electron/services/` and the SQL in `electron/db/statements/`; handlers stay
  one-liners. When you touch a legacy inline filter builder, move it to `db/statements` (the guard locks in the gain).
  Prove moves with `tests/characterization/`.
- **Sync, numbering, stock, ledger:** add a characterization test that captures current behaviour, then change.

## 6.4 Definition of done

- [ ] `npm run verify` passes (tsc app, tsc electron, unit tests, architecture guard).
- [ ] `npm run lint:ratchet` does not report growth.
- [ ] No new `window.electronAPI` outside `src/data/`, no new `any`, no file over budget, baselines did not grow.
- [ ] New/changed rules have unit tests; nothing was copy-pasted.
- [ ] Manual check of the affected screen in `npm run dev`.
- [ ] Docs updated for contract/structure changes. Commit only when asked; one slice per commit.

## 6.5 Commands

```bash
npm run dev            # vite + electron
npm run verify         # tsc -b + electron typecheck + vitest + architecture guard
npm test               # vitest run
npm run check:arch     # architecture guard only
npm run lint:ratchet   # lint debt must not grow (npm run lint alone is not a gate)
npm run build          # tsc + vite build + electron tsc
npm run package:win    # rebuild natives + build + electron-builder
```

## 6.6 Current hot spots and next refactors

| Item | State | Next step |
|---|---|---|
| `BillingPage.tsx` (6.9k lines, 130+ `useState`) | Views (cart, totals, payment, search bar, customer details, ERP grid layout), modals, deduction editor, pricing/checkout line builders and the checkout use-case extracted | Group customer and search state into hooks (`useBillingCustomer`, `useProductSearch`) so the views take one object instead of 37–68 props; then tab/number reservation and the keyboard handler |
| Other oversized screens | Capped by the guard | Split into `views/` per tab/section when touched |
| Main process layering | **Done:** IPC registration-only (0 SQL); services all < 800 lines; ~560 statements + 18 filter builders in `db/statements`; staff/offline-auth/purge use-cases moved out of `localDb.ts` (now connection + schema, 2.2k) | Move the last 6 date-range builders (resolve the date range in the service, pass it in) |
| Checkout | **Done:** `handleCheckout` moved to `billing/checkout/` (`createCheckoutHandler`, `runScrapCheckout` + tests); payloads identical to HEAD in 4 browser scenarios | Split the sales path further (validation → payload → persist → print) with unit tests per step |
| Fixed defects (22 Oct) | Biller PIN could not be saved (`status = "ACTIVE"` double-quoted string); staff credit purchases never updated the staff ledger running balance (`staff_ledger.updated_at` does not exist); customer-invoice lookup by name threw (double-quoted literals) | Keep `check-statements.mts` at 0 failures |
| Versioned SQLite migrations | Inline self-healing migrations | Introduce `user_version`-based runner |
| Sync outbox + LAN auth | Characterization harness in place (`tests/characterization/sync-run.mts`, golden file) | Decide the LAN auth scheme (shared secret vs JWT) and outbox design; change with the golden diff reviewed |
| Cloud calls | `lib/api.ts` + raw `fetch` in `authStore` | Group into `src/data/cloud/*` |
