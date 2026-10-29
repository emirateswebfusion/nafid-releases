# 4. Business rules

Rules that decide money, numbers, tax or access must have **exactly one implementation** with unit tests.
Before writing a calculation, look for it here. If you change a rule, change the canonical module, extend its test,
and update every caller in the same change.

## 4.1 Canonical rule modules (renderer)

| Rule | Module | Tests |
|---|---|---|
| Line unit rate: list/grade rate → catalog offer/discount → ad-hoc cashier adjustment; scrap lines invert discounts | `src/utils/pricing/linePricing.ts` (`listRate`, `resolveLinePrice`) | `tests/unit/linePricing.test.ts` (incl. 5,000-case equivalence with the legacy rule) |
| Checkout payload lines, CGST/SGST/IGST split, Bill-of-Supply tax, receipt lines, quotation lines, supply type | `src/utils/pricing/checkoutLines.ts` | `tests/unit/checkoutLines.test.ts` |
| Return source discounts, fractional quantities, stored invoice tax, rounded line/header totals | `src/utils/pricing/returnPricing.ts` (reuses `resolveLinePrice`; invoice rates already include line discounts) | `tests/unit/returnPricing.test.ts`, `returnSelection.test.ts`, `billingScreen.ui.test.tsx` |
| Live cart totals (subtotal, tax, scrap, discounts) | `src/store/cartStore.ts` (`useCartTotals`, uses `resolveLinePrice`) | via `linePricing` tests |
| Money formatting (₹, en-IN grouping, sign) | `src/utils/pricing/money.ts` (`formatCurrency`, `formatAmount`) | `tests/unit/money.test.ts` |
| Document numbers: offsets (including digit-only values with an empty prefix), digit matching | `src/utils/pricing/invoiceNumberHelper.ts` | `tests/unit/invoiceNumberHelper.test.ts`, `deductionLookup.test.ts` |
| Tab number previews (peek + skip numbers other tabs show; series; per-type retitle rules) | `src/components/billing/numberReservation.ts` | `tests/unit/numberReservation.test.ts` (characterization) |
| Scrap/return credits that can be deducted from a bill | `src/components/billing/deductionLookup.ts` | `tests/unit/deductionLookup.test.ts` |
| Sales-history amounts and tax breakdown | `src/utils/pricing/salesHistoryAmount.ts`, `src/utils/pricing/salesHistoryTax.ts` | `tests/unit/salesHistory*.test.ts` |
| Permissions: keys, groups, legacy `restricted_page` conversion, `hasPermission`, `isAdminRole` | `src/utils/security/permissions.ts` | — (add tests when touched) |
| Pricing tiers applied to products | `src/utils/pricing/pricingTierHelper.ts` | — |
| Store timezone and UTC parsing | `src/utils/time/timezoneHelper.ts` | — |
| Staff data masking | `src/utils/security/staffDataMasking.ts` | — |
| Party roles, parsing, billing and purchase eligibility | `src/data/partyRoles.ts` | `tests/unit/partyRoles.test.ts` |
| Printed documents (receipt text, A4/half-A4 HTML, quotation HTML, party ledger PDF, WhatsApp bill) | `src/utils/print/receiptGenerator.ts`, `invoiceHtmlGenerator.ts`, `quotationHtmlGenerator.ts`, `partyLedgerPdfGenerator.ts`, `whatsappBillHelper.ts`, `printFormatHelper.ts` | — |

Sales History date filters and dashboard sales use invoice creation instants in the store timezone. The shared `electron/db/statements/invoiceDates.ts` predicate parses legacy UTC space-separated timestamps and ISO timestamps numerically; later settlement does not move a sale to another date. Tests: `invoiceDateFilters.test.ts`.

Main-process rules live in `electron/services/` (document numbering, party ledger, cash drawer reconciliation, store time)
and `electron/utils/` (ids, cashier settlement math).

### Customer credit ledger (`electron/services/partyLedgerService.ts`)

- A party's balance is Σ credit − Σ debit over its active `party_ledger` rows (positive = the party owes the shop);
  `recalcPartyBalances` re-sequences `running_balance` and stores the totals after every write. Rows are never merged
  or "deduplicated" by content: two equal payments on the same day are two payments.
- A bill posts only its own rows, with deterministic ids and exact references: the sale (`<bill>`, "Credit Sale …")
  and the payments taken at checkout (`<bill>-PAY`, `-CASH`, `-UPI`, `-CARD`, `-BANK`, `-CHEQUE`). Saving, editing,
  changing the payment or the customer, deleting or restoring a bill first retires exactly those rows of that shop
  (`findInvoiceLedgerEntries`, `invoiceOwnedEntry`), then re-posts them, so a bill always has one adjustment. Never
  match ledger rows with `LIKE` on a number (bill 1 would match bill 10, payments and returns that mention it, and
  bills of another shop on the terminal).
- `invoiceCreditTerms` is the credit rule of a bill: CREDIT owes total − received; SPLIT owes its `credit` part and
  pays the other parts (capped at the non-credit part); other methods owe nothing. The billing screen saves a Credit
  bill with amounts in the Cash / Card / UPI / Cheque tiles as SPLIT (each part kept); a split with a credit part must
  add up to the bill total. Change Payment with cash below the total is saved as CREDIT with that amount paid.
- Returns (`syncReturnLedger`): CREDIT / STORE_CREDIT / ADJUST_BILL post a debit (`<return>`); a money refund (CASH,
  UPI, CARD, BANK_TRANSFER, CHEQUE) also posts the refund as a credit (`<return>-REFUND`), so the balance does not
  change; a return credit used on a bill posts a credit (`<return>-ADJ-<bill>`), released when that bill is deleted
  and used again when it is restored.
- Per-bill outstanding (`customerCreditService.computeCustomerCreditStatusSync`): a bill owes its credit portion less
  later payments referencing it and less checkout rows beyond what the bill shows as paid; other payments, return
  credits and overpayments go to the oldest open bills. The per-bill outstanding adds up to the balance. Customer invoice details show this computed `outstanding_amount` (including zero), not the original checkout balance snapshot.
- Editing a bill: the billing tab keeps the bill's own credit (`editingInvoiceContribution`) so the due, receipt
  balance and credit-limit check do not count the bill twice.
- Receipts explicitly referencing `OPENING-BALANCE` settle prior receivables only. They change the party balance,
  but are excluded from the pool allocated to newer invoices (mirrored by server `customerCredit.ts`).
- Tests: `creditLedger.test.ts` (real SQLite and services, incl. a 40-customer / 600-operation randomised run),
  `tabStoreEditing.test.ts`.

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

### Sales History totals and scope

- getSalesTaxBreakdown in salesHistoryAmount.ts separates the stored GST from the tax-inclusive sales total.
  Sales excluding GST + GST Amount = Grand Total including GST. These sales values are after invoice / points
  discounts and before scrap / return credits; revenue is the payable amount after those credits.
- REAL_SALES remains BOS only; TAX_FILING is official GST; ALL includes both document types in the list but totals
  count each real sale once, excluding synthetic GST conversion copies. Cash drawer session cash sales also exclude
  those copies. Direct GST bills still count. A payment-method filter shows that payment portion as revenue;
  the three sales/tax figures describe the matching invoices, not just that payment portion.
- Compare reports with the same invoice/payment scope and time window: Sales History filters creation dates,
  while Cash Register sessions and Shop Closing use settlement time when present. Financial Report payment distribution shows invoice allocations at checkout, excluding later ledger repayments and refunds. Cash collections, credit
  sales, gross sales and amounts before credits are different measures, not interchangeable totals.
- New tax breakdown fields are protected when staff revenue is masked; they cannot reveal real revenue by subtraction.

### Cash-register preferences

- `getRegisterCashEntries` and `computeDrawerTotals` in `electron/services/cashDrawerSession.ts` are the canonical
  cash feed and calculation used by Cash Register, Cash Settlement, drawer reconciliation and closing.
- Tenant settings `cash_register_include_scrap_sales` and `cash_register_deduct_returns` default to true.
  Turning them off excludes the corresponding cash flow without changing the underlying scrap/return document.
  Cash returns are derived from persisted return rows in the drawer session; old RETURN_REFUND cash transactions
  are excluded to prevent double counting and stale deductions after a return is deleted.
- `cash_register_ledger_mode` defaults to `all` (current behavior); `off` excludes manual ledger cash,
  `today` includes only entries dated the drawer business day in the store timezone. Both date modes select entries
  recorded in this drawer session; `all` permits any ledger document date, without recounting all historical cash.
- New manual CASH ledger creations (and entries edited to CASH) atomically write one idempotent cash transaction with category
  `PARTY_LEDGER:<ledger_id>`. The cash feed resolves the current ledger amount, direction, payment method and deletion
  state. These derived entries are edited in the Ledger, and return refunds in Return History, not deleted in Cash Register.
- Legacy `Party Payment` / `Party Receipt` cash transactions have no ledger id. Their original ledger date and later
  edits cannot be recovered reliably; today-only uses the cash-entry date. Migrating/relinking historical entries
  needs a separate decision. The first manual cash entry starts a zero-opening drawer when none is open;
  the real NOT NULL / foreign-key constraints are covered by `cashRegisterOptions.test.ts`.
- `cash_register_payment_methods` defaults to `[]`, preserving the existing display. Selected UPI, CARD,
  BANK_TRANSFER and CHEQUE collections use the drawer's invoice session, including split parts. These amounts
  are informational and never added to physical cash. `electron/utils/registerPaymentTotals.ts` owns the rule.
- WhatsApp checklist `scrapSales` and `scrapCategories` are optional booleans. Unset preserves the old message.
  Explicit selection enables purchase totals, optional sales totals and optional grouping by category and direction;
  the existing `scrap` master toggle controls the whole section. Preview and sending have matching unit coverage.
- Tests: `cashRegisterOptions.test.ts`, `registerPaymentTotals.test.ts`, `closingScrapOptions.test.ts`,
  `cashRegisterSettings.ui.test.tsx`; existing `tests/characterization/drawer-session.mts` remains applicable.

### Payment fields and electronic repayments/refunds

- Checkout computes saved change from the effective amount received, including the full-paid default for Cash,
  Card, UPI and Cheque. A fully paid bill has zero change; cheque received and its split allocation agree.
  Customer account snapshots remain in `old_due` / `new_due` and credit bills retain their account balance semantics.
- `electron/services/ledgerPaymentAccounts.ts` reconciles manual ledger UPI / CARD / BANK receipts and payouts,
  electronic return refunds, staff salary/advance payouts, and electronic purchase-bill payments with Payment Methods. It posts only the difference from the document's existing
  account movements, keyed by ledger id (`Party Ledger`), return id (`Return Refund`), staff transaction id (`Staff Payout`), or purchase id (`Purchase Payment`). Edits, cancellations and
  restorations therefore do not duplicate money. Staff accruals/bonuses/deductions are ledger adjustments, not payouts. Purchase amount/method edits and deletion replace or reverse their account effect. Invoice-owned checkout rows are excluded because billing posts them.
- The configured enabled default account of the method receives a new movement; later edits retain the original
  account while its type still matches. A method without a configured account still records the party payment.
  Cash/cheque do not automatically post to an electronic account. Account writes share the ledger/return transaction;
  staff and purchase writes are also atomic with their account posting; a failed posting rolls back the financial operation. Negative, zero, non-finite and malformed ledger amounts are rejected.
- Historical unlinked receipts/refunds are not automatically rewritten or inferred. No production backfill is part
  of this change. A failed ledger save keeps its form open and cannot report success or send a payment notice.
- Tests: `ledgerPaymentAccounts.test.ts`, `partyTransactionSave.ui.test.tsx`, `billingScreen.ui.test.tsx`.

### Conversion copies and revenue (`electron/db/statements/revenue.ts`)

`counterSalePredicate` is the shared SQL rule for excluding BOS-to-GST copies from actual collections.
The original BOS remains the sale; its GST copy is a tax document linked by `converted_from_invoice_id`.
Dashboard totals, sales summaries, product revenue, drawer cash, cashier lists/history and shop-closing
queries reuse this predicate. Direct GST bills still count. Tax-filing views deliberately include the copy.
Copies are excluded from pending settlement to prevent collecting the same sale twice. Frozen closed drawer
balances are not rewritten; active sessions use the corrected query on reconciliation.
Tests: `bosConversionRevenue.test.ts` (real in-memory SQLite) and `bosConversionService.test.ts`.
Filing-only billing (`bill_purpose = 'FILING_ONLY'`) captures its revenue and stock decisions at checkout:
- `filing_only_mode.countInRevenue`: controls whether new filing-only bills count in store revenue (`counts_in_revenue = 1`). When turned off, filing-only bills are strictly excluded from Dashboard Sales Today and Cash Drawer reconciliation, while Sales History allows accountant review under B2C/B2B (when enabled) and under Tax Filing (`TAX_FILING`).
- `filing_only_mode.showB2bInSalesCategory` and `showB2cInSalesCategory`: control whether filing-only bills appear in the respective B2B/B2C category views or only under the dedicated `Filing-only` filter (`FILING_ONLY`).
- In Sales History, the dedicated `FILING_ONLY` filter reports statutory filing totals even when `counts_in_revenue = 0`.
- The `CONVERTED_GST` filter isolates synthetic tax copies converted from Bill of Supply (`converted_from_invoice_id IS NOT NULL`), calculating their statutory turnover and count without `counterSalePredicate` zeroing them out.
Tests: `tests/unit/filingRevenue.test.ts`, `tests/unit/filingOnlySettings.ui.test.tsx`, `tests/unit/bosConversionRevenue.test.ts`, `tests/unit/billPolicy.test.ts`.


## 4.2 Known duplication (do not extend, consolidate when touched)

- Intra-state tax amounts use `splitTaxAmount` from `src/utils/pricing/checkoutLines.ts`: CGST is rounded first and SGST is
  the rounded remainder, so both add up to the tax. Existing invoice rows are not rewritten. Renderer summaries and
  historical fallbacks reuse this helper; the main-process Bill-of-Supply conversion uses the same rule in
  `electron/utils/taxSplit.ts` to keep the process boundary intact.
- `nafid-server/src/utils/cashierSettlement.ts` and `electron/utils/cashierSettlement.ts`, and the permission conversion in
  `src/utils/security/permissions.ts` vs `nafid-server/src/services/permissions.ts`, are **cross-app copies of one rule**.
  They must stay behaviourally identical until a shared package exists; change both with tests.
- Per-bill credit outstanding: `electron/services/customerCreditService.ts` (with `invoiceCreditTerms`) and
  `nafid-server/src/db/repositories/customerCredit.ts` are cross-app copies of one rule (`tests/unit/creditLedger.test.ts`,
  `nafid-server/tests/customerCredit.test.ts`).
- `electron/sync/syncWorker.ts` has private copies of the auth-file reader and date parsing that also exist in
  `electron/services/{authStorage,storeTime}.ts`. Consolidate only together with sync characterization tests.

## 4.3 Authentication and authorization (POS side)

| Concern | Where |
|---|---|
| Online login, password reset/change, tenant domain | `src/store/authStore.ts` → `nafid-server` `/auth/*` |
| Offline login (no network) | `authApi.loginOffline` → `electron/ipc/authHandlers.ts` (`localAuthenticateUser`, against users cached locally by sync) |
| Token persistence | `authApi.saveToken/getToken` → `electron/services/authStorage.ts` (Electron `safeStorage`, `auth.enc`) |
| Session state, role, permissions | `useAuthStore` (`role`, `permissions`, `isAuthenticated`) |
| UI permission checks | `hasPermission(user, 'sales.create')` from `src/utils/security/permissions.ts`; `<PermissionGuard>` component |
| Biller PIN (quick user switch) | `BillerPinModal` → `staffApi.verifyBillerPin` |
| Expired token | `bridgeEvents.onTokenExpired` / 401 in `fetchApi` → cloud sync paused + session-expired modal |

Permission keys are the shared contract with the server (`requirePermission('sales.view')`). Admin/owner roles bypass
checks on both sides. Add a new permission key in **both** `src/utils/security/permissions.ts` (with its UI group/label) and
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

## WhatsApp sharing preferences

`utils/print/whatsappSharing.ts` owns format selection, dynamic party-type eligibility, and purchase ledger messages.
`whatsapp_bill_formats` defaults to text plus the existing invoice PDF; available choices are text, A4 PDF, and thermal receipt PDF.
`ledger_whatsapp_party_types` defaults to all types (null); an empty array excludes all. Types come from active party rows,
using custom categories where present. Explicit selections apply to manual ledger messages, statement PDFs, automated ledger alerts,
and purchase-page messages. Newly encountered categories appear when preferences reopen; all-types mode includes them automatically.
Purchase messages use the matched historical ledger debit and running balance; opening = running - credit + debit.
Cash purchases have no supplier ledger entry, so the purchase action reports that limitation instead of guessing balances.
Tests: `whatsappSharing`, `whatsappSendFlows`, `whatsappPurchaseRegression`, `whatsappPreferences.ui`, `whatsappPdfDelivery`.

## Loyalty points

`electron/services/loyaltyService.ts` is the main-process authority for enabling loyalty, settlement/edit earnings,
return and cancellation adjustments. Both `loyalty_config.enabled` and `feature_flags.loyalty` must permit loyalty:
an explicit false wins; if neither setting exists, loyalty is off. Disabled shops cannot newly earn, redeem,
manually adjust or recalculate points; historical invoice money remains unchanged and historical reversals still
correct the stored balance. Renderer visibility is read by `src/hooks/useLoyaltyEnabled.ts` (billing also reloads
its earning/redemption rates on `settings:updated`).

Checkout calculates earnings from saved net grand total and validates whole-point redemption against the actual
customer balance and configured redemption value. HOLD never earns/redeems; PENDING earns only if its existing
setting permits it. Payment, discount and edit entry points capture the old contribution and reconcile to the
new one. Ledger balance differences carry the direction of ADJUSTED and reversal rows; `points` remains absolute.
Returns proportionally reduce the original stored award, cumulatively, with whole points rounded down on the
remaining award. Returns on GST conversion copies adjust their original BoS; the copy never earns twice.
Deleting a return restores the previous contribution. Cancellation removes earned points and restores redeemed
points once, and restoration re-applies the contribution. Spent awards can produce a negative balance when
reversed; clamping to zero would create points. Existing historical redemption discounts are not refunded as
extra points on ordinary returns (the refund already includes the original discount).

Recalculation uses recorded ledger movements, including manual adjustments, instead of re-awarding at today's
rate or flooring an aggregate of sales. Legacy invoice contributions without a ledger are captured from their
stored point fields; missing historical awards/manual opening amounts cannot be inferred reliably. Recalculation refuses a ledger/balance mismatch atomically and asks for opening-balance review instead of erasing unknown history. No startup
backfill or sync contract/schema change is made. Tests: `loyaltyPersistence.test.ts`, `loyaltyVisibility.ui.test.tsx`.

### UTC storage and shop timezones

`created_at` and other instants are UTC (ISO with Z or legacy SQLite UTC text); `electron/utils/timestamps.ts` parses timezone-free database text as UTC. Business dates are date-only labels, calculated with the tenant timezone by `electron/services/storeTime.ts`, never the viewer PC timezone. The shop timezone setting is saved per tenant, supports plain strings and legacy JSON, and takes priority over the global fallback. Missing/invalid renderer settings reset to India rather than retaining another shop timezone. Store-day UTC bounds include the final millisecond. New held-bill expiry values carry an explicit UTC Z; legacy PC-local expiry text is interpreted using its original local-time convention without rewriting rows. Tests: `utcStorage`, `cashierTimezone`, `storeTime`, `timezoneHelper`, `timezoneSettingsSave.ui`.
