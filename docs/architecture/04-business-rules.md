# 4. Business rules

Rules that decide money, numbers, tax or access must have **exactly one implementation** with unit tests.
Before writing a calculation, look for it here. If you change a rule, change the canonical module, extend its test,
and update every caller in the same change.

## 4.1 Canonical rule modules (renderer)

| Rule | Module | Tests |
|---|---|---|
| Line unit rate: list/grade rate → catalog offer/discount → ad-hoc cashier adjustment; scrap lines invert discounts | `src/utils/linePricing.ts` (`listRate`, `resolveLinePrice`) | `tests/unit/linePricing.test.ts` (incl. 5,000-case equivalence with the legacy rule) |
| Checkout payload lines, CGST/SGST/IGST split, Bill-of-Supply tax, receipt lines, quotation lines, supply type | `src/utils/checkoutLines.ts` | `tests/unit/checkoutLines.test.ts` |
| Live cart totals (subtotal, tax, scrap, discounts) | `src/store/cartStore.ts` (`useCartTotals`, uses `resolveLinePrice`) | via `linePricing` tests |
| Money formatting (₹, en-IN grouping, sign) | `src/utils/money.ts` (`formatCurrency`, `formatAmount`) | `tests/unit/money.test.ts` |
| Document numbers: offsets (including digit-only values with an empty prefix), digit matching | `src/utils/invoiceNumberHelper.ts` | `tests/unit/invoiceNumberHelper.test.ts`, `deductionLookup.test.ts` |
| Tab number previews (peek + skip numbers other tabs show; series; per-type retitle rules) | `src/components/billing/numberReservation.ts` | `tests/unit/numberReservation.test.ts` (characterization) |
| Scrap/return credits that can be deducted from a bill | `src/components/billing/deductionLookup.ts` | `tests/unit/deductionLookup.test.ts` |
| Sales-history amounts and tax breakdown | `src/utils/salesHistoryAmount.ts`, `src/utils/salesHistoryTax.ts` | `tests/unit/salesHistory*.test.ts` |
| Permissions: keys, groups, legacy `restricted_page` conversion, `hasPermission`, `isAdminRole` | `src/utils/permissions.ts` | — (add tests when touched) |
| Pricing tiers applied to products | `src/utils/pricingTierHelper.ts` | — |
| Store timezone and UTC parsing | `src/utils/timezoneHelper.ts` | — |
| Staff data masking | `src/utils/staffDataMasking.ts` | — |
| Printed documents (receipt text, A4/half-A4 HTML, quotation HTML, party ledger PDF, WhatsApp bill) | `src/utils/receiptGenerator.ts`, `invoiceHtmlGenerator.ts`, `quotationHtmlGenerator.ts`, `partyLedgerPdfGenerator.ts`, `whatsappBillHelper.ts`, `printFormatHelper.ts` | — |

Main-process rules live in `electron/services/` (document numbering, party ledger, cash drawer reconciliation, store time)
and `electron/utils/` (ids, cashier settlement math).

### Cash drawer sessions (`electron/services/cashDrawerSession.ts`)

- Timestamps are stored in UTC; the store timezone setting decides business dates and wall-clock times
  (`storeTime.ts`: `localDate`, `storeWallClockToUtc`).
- A drawer's **session** runs from the close of the previous drawer (else the start of its business date in the store
  timezone) to its own close; an open drawer's session has no end. Cash sales and cash in / out are summed over the
  session (`computeDrawerTotals`, the only implementation; `reconcileCashDrawer` and the sync pull both use it), so bills
  made after midnight stay with the drawer that is still open, and every bill belongs to exactly one drawer.
- Drawers closed before sessions were installed on a terminal (`cash_drawer_session_since`, a `LOCAL` setting written
  on first use) are history: never recomputed. On installation, drawers still open from an earlier day are closed at
  the end of their own business day (what the previous version did on its next start).
- A drawer from an earlier day that is still open must be closed before today's is opened
  (`setOpeningBalance` → `PREVIOUS_DRAWER_OPEN`).
- Auto close (`cash_drawer_auto_close`, default off; `cash_drawer_auto_close_time`, default 23:30, a time before 12:00
  means after midnight): the renderer watcher asks "the auto close time is now — do you need more time?" (snooze
  +30 min / +1 h, `cash_drawer_auto_close_snooze`), closes after 5 minutes without an answer or when the app has been
  idle for 10 minutes; the main process closes drawers still open 15 minutes past the due time
  (`autoCloseOverdueDrawers`). An auto close counts the expected cash (no short / excess).
- Tests: `tests/characterization/drawer-session.mts`.

## 4.2 Known duplication (do not extend, consolidate when touched)

- Intra-state tax amounts use `splitTaxAmount` from `src/utils/checkoutLines.ts`: CGST is rounded first and SGST is
  the rounded remainder, so both add up to the tax. Existing invoice rows are not rewritten. Renderer summaries and
  historical fallbacks reuse this helper; the main-process Bill-of-Supply conversion uses the same rule in
  `electron/utils/taxSplit.ts` to keep the process boundary intact.
- `nafid-server/src/utils/cashierSettlement.ts` and `electron/utils/cashierSettlement.ts`, and the permission conversion in
  `src/utils/permissions.ts` vs `nafid-server/src/services/permissions.ts`, are **cross-app copies of one rule**.
  They must stay behaviourally identical until a shared package exists; change both with tests.
- `electron/sync/syncWorker.ts` has private copies of the auth-file reader and date parsing that also exist in
  `electron/services/{authStorage,storeTime}.ts`. Consolidate only together with sync characterization tests.

## 4.3 Authentication and authorization (POS side)

| Concern | Where |
|---|---|
| Online login, password reset/change, tenant domain | `src/store/authStore.ts` → `nafid-server` `/auth/*` |
| Offline login (no network) | `authApi.loginOffline` → `electron/ipc/authHandlers.ts` (`localAuthenticateUser`, against users cached locally by sync) |
| Token persistence | `authApi.saveToken/getToken` → `electron/services/authStorage.ts` (Electron `safeStorage`, `auth.enc`) |
| Session state, role, permissions | `useAuthStore` (`role`, `permissions`, `isAuthenticated`) |
| UI permission checks | `hasPermission(user, 'sales.create')` from `src/utils/permissions.ts`; `<PermissionGuard>` component |
| Biller PIN (quick user switch) | `BillerPinModal` → `staffApi.verifyBillerPin` |
| Expired token | `bridgeEvents.onTokenExpired` / 401 in `fetchApi` → cloud sync paused + session-expired modal |

Permission keys are the shared contract with the server (`requirePermission('sales.view')`). Admin/owner roles bypass
checks on both sides. Add a new permission key in **both** `src/utils/permissions.ts` (with its UI group/label) and
`nafid-server/src/services/permissions.ts`.

`products.create` requires the explicit `products.create` permission, wildcard, or admin/owner bypass. Other
`products.*` permissions retain the broad fallback for `products.view`.

## 4.4 Domain glossary

| Term | Meaning |
|---|---|
| Tenant | One shop/business. All rows are scoped by `tenant_id` |
| GST invoice / BOS | Tax invoice / Bill of Supply (no GST; optional state BOS tax) |
| Estimate | Non-tax internal bill series |
| CGST / SGST / IGST | Intra-state halves / inter-state tax |
| Scrap | Material bought back from a customer; its credit can be deducted from a bill |
| Return | Customer return; its unadjusted remainder can be deducted from a later bill |
| Held bill | Parked cart (`HOLD` invoice) that can be recalled |
| Pricing tier | Customer-specific price list |
| Grade rate | Per-grade price for `GRADE_RATE` products (e.g. gold/silver purity) |
| Party | Ledger account (supplier or customer) with GST/estimate balances |
| Settlement | Cashier day-closing and collection of pending invoices |
