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
| State + effects + handlers for one section of a big screen | `components/<feature>/hooks/use<Section>.ts`; pure matching/lookup rules it uses in `components/<feature>/<topic>.ts` + a unit test | Hand views the hook's result as one prop (`customerFields={customerFields}`), not its members. Feature-specific, so not `src/hooks/` |
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
| `BillingPage.tsx` (1.6k lines, ~45 `useState`) | Views (cart, totals, payment, search bar, customer details, ERP grid layout, header, toasts, deduction dropdowns), modals, deduction editor, pricing/checkout line builders, the checkout use-case and the customer fields (`billing/hooks/useCustomerDirectory`, `useCustomerFieldState`, `useCustomerFieldHandlers`; rules in `billing/customerDirectory.ts` + tests) extracted; product search state (`useProductSearchState`), its loaders (`useSearchResultsLoader`) and matching rules (`billing/productSearch.ts` + tests) and the selection/keyboard handlers (`useSearchSelection`) extracted; tab number previews in `billing/numberReservation.ts` (tested); keyboard shortcuts in `useBillingShortcuts`; deduction/loyalty state passed as one typed `deductions` object (`DeductionState`); documents handed over from other screens (edit bill, return, quotation edit/new) in `useIncomingDocuments`; quick product form state in `useProductFormState` (CreateProductModal takes `productForm`, 60 -> 12 props) and its actions in `useProductFormHandlers`; billing configuration in `useBillingSettings` (state) + `useBillingSettingsLoader` (initial load, `settings:updated`); cart line key handlers in `useCartKeyboard` and cart focus movement in `useCartFocus`; held bills (list, hold, recall, release) in `useHeldBills`; WhatsApp send in `useWhatsAppSend`, save quotation in `useSaveQuotation`, return from cart in `useReturnFromCart`; mount/unmount tab handling in `useBillingEntry`, reserved-number refresh in `useTabNumberRefresh`, scrap invoice edit loading in `useScrapInvoiceEdit`; pricing tiers in `usePricingTier`, customer tier/loyalty auto-match in `useCustomerAutoMatch`, hardware barcode scans in `useHardwareBarcodeScanner`, most-sold products in `useMostSoldProducts` | ERP grid (51 props) and totals panel (66): group cart and payment state the same way as `deductions` |
| `SalesHistory.tsx` (714 lines, under the cap) | Display helpers in `sales/salesHistoryFormat.ts`, row/badges in `sales/views/InvoiceRow`, `StatCard`; CSV export, reprint, WhatsApp send and invoice details (with cache), the list loader and the GST conversion preview in `sales/hooks/`; loose row types in one place (`sales/salesTypes.ts`); views `SalesHistoryHeader`, `InvoiceDetailModal` (+ `InvoiceItemsTable`), `CollectPaymentModal`, `ConversionModal`, `SalesBillsView`, `SalesAnalyticsView`; linked-invoice view and collect payment in `useLinkedInvoiceView`, `useCollectPayment` | The React Compiler lint now analyses the file and reports 4 existing `set-state-in-effect` patterns (filter-reset and initial-search effects); fixing them changes behaviour, so they are baseline debt |
| `PurchaseBillManager.tsx` (772 lines, under the cap) | Types in `purchase/purchaseTypes.ts` (incl. `PurchaseFormItem`), helpers in `purchaseFormat.ts`; hooks: list summaries, print, CSV export, quick product create, and the product form state (`usePurchaseProductFormState`, passed to views as one `productForm`); views: bill list, bill detail dialog, supplier dialog, product search (+ product dialog), add-grade and cleanup dialogs, bill items table; `purchase/PurchaseBillFormSection.tsx` (one GST / estimate bill form) with its save, product actions, edit-load and search-results hooks | — |
| `CashierSettlement.tsx` (750 lines, under the cap) | Helpers in `cashier/cashierFormat.ts`, loose rows named in `cashier/cashierTypes.ts`; hooks: drawer actions, invoice view, settlement amount editing; 11 views (header, pending settlement, cash register, history, invoice / split / transaction / day-close / reopen / delete dialogs, loading skeleton). `InvoiceTypeBadge` / `getInvoiceTypeInfo` now come from `sales/` (were identical copies) | Consolidate deliberately (behaviour decisions): Cashier and Sales History keep separate payment label sets (Sales has SPLIT) and separate MRP-enrichment implementations that have diverged |
| `CustomersPage.tsx` (795 lines, under the cap) | Types in `customers/customerTypes.ts`, helpers in `customerFormat.tsx`; hooks: data loading, add/edit/points, customer actions, invoice exports; views: list, detail, invoice dialog, add and edit dialogs | Add and edit dialogs are near-duplicates (kept as is); type the auth store (see Type safety) |
| Type safety | `useAuthStore` is now explicitly typed: its initializer calls `useAuthStore.getState()`, and with `noImplicitAny` off tsc had inferred the whole store as `any`, so the gate never type-checked `tenantId` / `userId` / `role` (this hid the customers refresh bug and the `user` field bug). The other stores were already typed. Session values passed to APIs that require a string now carry type-only `as string` casts (logged-in screens; runtime unchanged) | Replace the casts with a typed session accessor; **product decision:** the biller-only options OPT_VIEW_GST / OPT_VIEW_GST_INVOICES_ONLY are checked against role 'BILLER', which never occurs (roles are normalised to STAFF), so they are not enforced (`isLegacyBillerRole` in `utils/permissions.ts`); pre-existing runtime errors seen in the app: Stock Report renders a `<div>` inside `<p>` |
| `ScrapManager.tsx` (729 lines, under the cap) | Types and loose-row aliases in `scrap/scrapTypes.ts`, helpers in `scrapFormat.ts`; hooks: invoice actions, stock actions; 10 views (category list / form, transactions, transaction form, selling, invoices, invoice detail, edit-transaction / edit-header / add-item dialogs) | — |
| `SettingsManager.tsx` (673 lines, under the cap) | All settings state in `settings/hooks/useSettingsFormState` (passed as one `form` object), loading in `useSettingsLoader`, saving in `useSettingsSave`; views `SettingsSectionContent` (the section switch) and `LanSyncHelpModal`; loose values named in `settings/settingsTypes.ts`. `buildSettingsSnapshot` is called during render, so `useSettingsLoader` must stay above `getSettingsSnapshot` | Opening Theme & Typography / Billing Page Customizer re-saves their current values (pre-existing) |
| `InventoryManager.tsx` (628 lines, under the cap) | All state in `inventory/hooks/useInventoryState` (one `inv` object); hooks: loader, save, form open, form handlers, list actions, exports, and `useInventoryEffects` (all 24 effects, original order, called last so every input exists); view `InventoryHeader` | Note for testing: the row buttons Add / Reduce Real Stock change stock immediately (±1) for Pcs products |
| `EcommercePortal.tsx` (581 lines, under the cap) | State in `ecommerce/hooks/useEcommerceState` (one `ec` object; the registration form stays in the portal); views: header, overview / registration / products / orders / settings tabs, edit-product dialog | — |
| `PartyManager.tsx` (766 lines, under the cap) | Types in `party/partyTypes.ts`, helpers in `partyFormat.ts`; state in `party/hooks/usePartyManagerState` (one `pm` object); hooks: loaders, party save, transaction save, bill preview, ledger sharing, and `usePartyManagerEffects` (all effects, original order, called last); view `PartyManagerHeader` | — |
| Other oversized screens | Capped by the guard | Split into `views/` per tab/section when touched |
| Main process layering | **Done:** IPC registration-only (0 SQL); services all < 800 lines; ~560 statements + 18 filter builders in `db/statements`; staff/offline-auth/purge use-cases moved out of `localDb.ts` (now connection + schema, 2.2k) | Move the last 6 date-range builders (resolve the date range in the service, pass it in) |
| Checkout | **Done:** `handleCheckout` moved to `billing/checkout/` (`createCheckoutHandler`, `runScrapCheckout` + tests); payloads identical to HEAD in 4 browser scenarios | Split the sales path further (validation → payload → persist → print) with unit tests per step |
| Fixed defects (22 Oct) | Biller PIN could not be saved (`status = "ACTIVE"` double-quoted string); staff credit purchases never updated the staff ledger running balance (`staff_ledger.updated_at` does not exist); customer-invoice lookup by name threw (double-quoted literals) | Keep `check-statements.mts` at 0 failures |
| Fixed defects (23 Oct) | With no cloud login (offline login, or none: tenant id taken from the local DB) the sync worker treated the `lan-local-token` placeholder as a valid cloud token and ran cloud sync with it (49 requests in the no-login sync harness, 41 with that bearer). `electron/sync/syncAuth.ts` `cloudTokenUnusable` now rejects it on the cloud route; LAN is unchanged (sync and LAN harness identical) | Decide whether `getTenantIdFromDb` should be used at all outside LAN |
| Fixed defects (23 Oct, billing) | GST header badge showed `GST-GST-001` (single-series GST numbers already carry `GST-`; rule now `displayInvoiceNumber` in `utils/invoiceNumberHelper.ts`); leaving quotation mode kept the GST invoice type set on entry, so the next sale was GST (`billing/hooks/useQuotationToggle.ts` restores it); the ERP grid showed a made-up number `6019` when none was reserved; warranty expiry and a tab-store comment held `�` | — |
| Fixed defects (23 Oct, customers) | After adjusting or recalculating loyalty points the customer list went empty and the open customer's points did not refresh: the refresh called `customersApi.getCustomers(tenantId)` with a bare string, so the main process (which reads `{ tenant_id }`) returned `[]`. Now `getCustomers({ tenant_id })`. The bug was invisible to the gate because `useAuthStore` resolves to `any` there (see Type safety) | — |
| Versioned SQLite migrations | Inline self-healing migrations | Introduce `user_version`-based runner |
| Sync outbox + LAN auth | Characterization harness in place (`tests/characterization/sync-run.mts`, golden file) | Decide the LAN auth scheme (shared secret vs JWT) and outbox design; change with the golden diff reviewed |
| Cloud calls | `lib/api.ts` + raw `fetch` in `authStore` | Group into `src/data/cloud/*` |
