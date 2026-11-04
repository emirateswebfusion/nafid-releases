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
| Staff monthly pay statement (carried forward, salary added, extras, advances, store purchases, deductions, paid, balance) and total payable to staff | `src/utils/pricing/staffPayStatement.ts` (`buildPayStatement`, `totalPayableToStaff`) | `tests/unit/staffPayStatement.test.ts` |
| Party roles, parsing, billing and purchase eligibility | `src/data/partyRoles.ts` | `tests/unit/partyRoles.test.ts` |
| Tax calculations (GST split CGST/SGST/IGST & UAE VAT 5% inclusive/exclusive) | `src/utils/pricing/taxEngine.ts`, `electron/utils/gstEngine.ts` | `tests/unit/taxEngine.test.ts` |
| UAE TRN validation (15 digits, prefix 100) & Emirate normalization | `src/utils/pricing/trnValidator.ts`, `electron/utils/trnValidator.ts` | `tests/unit/trnValidator.test.ts` |
| UAE Form VAT 201 Return, FTA Audit File (FAF), and filing lifecycle | `electron/services/vatReportService.ts`, `vatFilingService.ts`, `src/utils/export/ftaAuditFileExporter.ts` | `tests/unit/vatReportService.test.ts`, `vat201JsonSerializer.test.ts`, `vatDashboardCard.test.ts` |
| Printed documents (receipt text, A4/half-A4 HTML, quotation HTML, party ledger PDF, WhatsApp bill) | `src/utils/print/receiptGenerator.ts`, `invoiceHtmlGenerator.ts`, `quotationHtmlGenerator.ts`, `partyLedgerPdfGenerator.ts`, `whatsappBillHelper.ts`, `printFormatHelper.ts`, `receiptCore.ts`, `styles/boxed.ts` | `tests/unit/thermalPrint.test.ts`, `printGenerators.characterization.test.ts` |

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
- Paying more than the bill (`src/components/billing/checkout/overpayment.ts`): when the billing screen shows the new
  due or advance (a customer with a balance, or a Credit bill), the excess stays on the customer's account. The bill is
  saved as CREDIT with `received_amount` = all the money and `split_details.on_account` = the excess; its total is
  unchanged, its one `<bill>-PAY` row records all the money, the drawer counts all of it, and allocation treats the
  excess as unallocated money. Anyone else sees change, and the excess is not recorded. A bill without the marker never
  posts an excess. Cash Settlement has no received-amount field, so an excess there goes through Ledger > Got Cash.
  Upgrade every terminal of a shop together: an older terminal re-saving such a bill would drop the excess.
- Returns (`syncReturnLedger`): CREDIT / STORE_CREDIT / ADJUST_BILL post a debit (`<return>`); a money refund (CASH,
  UPI, CARD, BANK_TRANSFER, CHEQUE) also posts the refund as a credit (`<return>-REFUND`), so the balance does not
  change; a return credit used on a bill posts a credit (`<return>-ADJ-<bill>`), released when that bill is deleted
  and used again when it is restored.
- Per-bill outstanding (`customerCreditService.computeCustomerCreditStatusSync`): a bill owes its credit portion less
  later payments referencing it and less checkout rows beyond what the bill shows as paid; other payments, return
  credits and overpayments go to the oldest open bills. The per-bill outstanding adds up to the balance. Customer invoice details show this computed `outstanding_amount` (including zero), not the original checkout balance snapshot.
- Editing a bill: the billing tab keeps the bill's own credit (`editingInvoiceContribution`) so the due, receipt
  balance and credit-limit check do not count the bill twice.
- Opening balance (`electron/services/partyOpeningBalance.ts`): one row per party, id `party_opening:<party_id>`,
  reference `OPENING-BALANCE`, method `OPENING`, description `Opening Balance (…)`, status `PENDING`. It moves no cash
  or payment account. Positive = the party owes the shop; a negative receivable is an advance. `db:importOpeningBalances`
  (Data Upload → Opening Balances) sets existing parties from a file: name match only, never phone; all rows or none;
  an unmatched or non-unique name or a different existing amount blocks the import; a repeat changes nothing.
  `db:bulkImportParties` never changes an existing party's money and reports `ignored_balances`.
- Allocation (mirrored by server `customerCredit.ts`): the opening balance is the customer's oldest debt, so
  unallocated money clears it before any bill. A receipt referencing `OPENING-BALANCE` only reduces it, and any excess
  becomes unallocated. A payment naming a bill goes to that bill. An opening advance is unallocated money. Per-bill
  outstanding plus the remaining opening balance adds up to the balance.
- Backfill repairs only a credit bill with no ledger rows at all. Retired rows mean another terminal cancelled the bill
  and its copy has not arrived; posting them again brought cancelled bills back, in the cloud too.
- A ledger failure while saving a bill or return now fails the save and rolls it back, so a document cannot exist
  without its rows. Backfill keeps going past one document that cannot be posted. Rows re-pointed by pull
  de-duplication go back to `PENDING`, so they upload.
- Ledger row ids of a bill use its invoice id, so bills sharing a number across terminals cannot overwrite each other.
  Rows under the older number-based ids are replaced on the bill's next save. Upgrade every terminal of a shop together.
- Identity: the same name with a different phone is another person (POS `CustomerIdentityService`, server `pushParties`).
  A missing phone on either side still matches by name.
- A party with no ledger rows at all keeps its stored balance on screen, in both apps, because older shops may hold real
  balances that way. New code always posts a row, so no new balance can arise without one.
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
- Tests: `tests/characterization/drawer-session.mts`, `tests/unit/scrapCashReconciliation.test.ts`.
- Scrap purchases: a single consolidated cash-out row is written for a cash scrap purchase (`Scrap Purchase`). Legacy per-item system-generated cash entries are filtered at runtime in `getRegisterCashEntries` and permanently cleaned up via migrations (015, 016) and `purgeDuplicateScrapCashTransactions` so scrap purchase cash is never deducted twice from the drawer.

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
- **Shop Closing Scrap Accounting**:
  - `scrapSummary` in `electron/whatsapp/shopClosingSummary.ts` aggregates exclusively from `scrap_transactions` for the given business date.
  - Bill-level scrap deductions (`invoices.scrap_deduction`) are **never** added into `scrapSummary` as scrap purchases. Scrap deducted on a bill is a payment deduction / credit redemption settling gross sales to net sales; the physical scrap item was already recorded in `scrap_transactions` upon intake. Adding invoice scrap deductions into scrap purchase totals caused duplicate counting (e.g., ₹673 actual purchase reported as ₹1,346).
- **Shop Closing Timestamps and Status Labels**:
  - An open / in-progress register (`status === 'OPEN'`) must be labeled `⏰ *Report Time:* <time>`. It must **never** be labeled `Closing Time:`, which falsely represents active trading shifts as closed. Only settled registers (`status === 'CLOSED'`) display `⏰ *Closing Time:* <time>`.
  - Database timestamps (such as SQLite `closed_at = CURRENT_TIMESTAMP`) are stored in UTC without timezone text. They must always be parsed via `electron/utils/timestamps.ts:toEpochMs()` before formatting in the tenant's store timezone (`store_timezone`). Unparsed `new Date(drawer.closed_at)` is banned because V8 interprets timezone-free strings as host local time, shifting the hour when converted to the store timezone.
  - Scheduled dispatch times (`scheduledTime`) in settings use 24-hour format (`HH:mm`, default `22:00`). The settings UI provides a live 12-hour AM/PM badge and warns when morning hours (< 12:00) are selected for shop closing, preventing accidental AM scheduling (e.g. `10:50` morning instead of `22:50` night).
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
When editing an invoice's bill date (invoiceEditService.ts), if the document is a converted GST copy or a source Bill of Supply, both linked documents (converted_from_invoice_id / converted_to_invoice_id) and their line items have their created_at synchronized and marked PENDING for cloud sync. Startup migrations must never overwrite converted invoice dates back to source dates.
Tests: osConversionRevenue.test.ts (real in-memory SQLite), osConversionService.test.ts, and convertedInvoiceDateEdit.test.ts.

### Paper stock and conversion quantities (`electron/services/paperStockAllocation.ts`)

- **Balance & Adjustments** (`paperStockBalanceSql` in `electron/db/statements/products.ts`): paper purchase lines
  (`skip_stock_update = 1`) with manual adjustments (`domain_attributes.paper_adjustment`), else the manual `domain_attributes.paper_stock`,
  less `qty_from_paper_stock` of active GST lines, never below zero.
  - The Inventory table renders direct `+` and `-` increment/decrement buttons for Paper Stock calling `dbAdjustStock` with `paperDelta`.
  - When paper stock is 0, the `-` button is disabled (clamped to 0) while the `+` button remains active so incoming shipments can be added with a single click.
  - Zero-stock persistence: When paper stock drops to 0, paper identity, Paper MRP (`paper_mrp`), and purchase pricing (`gst_purchase_price` / `paper_purchase_price`) are strictly preserved in `domain_attributes` and form state (`useInventoryFormOpen`, `useInventorySave`); they are never wiped on form open or edit.
- **Partial Conversion & Paper Pricing**:
  - Available stock determines conversion quantity: When available paper stock is less than the sold quantity (e.g. Sold 70, Paper Stock 50), the system performs **partial conversion** (50 converted, 20 skipped) rather than blocking the whole bill.
  - Skipped quantity (`qty_short`, `skipped: true`) is recorded in the conversion history and previewed in the GST Conversion Dialog cards (`ConversionPaperLines`).
  - Converted quantities adopt the configured Paper Selling Price (Paper MRP) for tax calculation and legal invoice generation, ensuring converted GST tax documents reflect realistic, compliant values.
  - Complete block only occurs when 0 units across all items in a bill are convertible.
- The conversion dialog displays itemized cards showing Product Name, Available Paper Stock, Conversion Qty, Skipped Qty, Paper Selling Price, Conversion Total, and GST calculation.
- Direct GST sales beyond real purchases, and older copies that exceeded paper stock, reduce the Inventory balance and
  later coverage alike.
- Stock Report Est Qty is Bill-of-Supply quantity not carried to a GST copy (matched by `source_item_id`).
- Existing GST copies are never rewritten: an overdrawn product shows 0 until a copy is deleted or more paper arrives.
- Startup must keep paper prices of a product with paper purchase lines, even when flagged `REAL`
  (`localDb.ts` cleanup, `migrationsRepairs.ts`). Deleted copies return their paper stock.
- Tests: `tests/unit/paperStockConversion.test.ts`, `tests/unit/inventoryPaperSettings.ui.test.tsx`.

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
| Quick PIN Login (terminal switch) | `QuickPinLogin` → `authApi.loginWithPin` (`localAuthenticatePin`, against staff `biller_pin_hash` scoped to `tenant_id`) |
| Staff protection | `StaffProfileHeader`, `StaffBasicTab`, `staffService.saveStaff` (prevents self-deactivation and Admin account deactivation) |
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

### Thermal receipt printing and item quantity formatting

- **Receipt Totals**: Dual `Grand Total` / `Net Total` lines are banned. Thermal receipts must show a single clean `Net Total` after all deductions (`Total` − `Discount` − `Scrap Return Amount` = `Net Total`). This avoids customer confusion when scrap or return deductions are applied. Tax breakdown (CGST, SGST, Cess) is never mingled into the payable calculation lines; it is reported strictly in the dedicated `TAX BREAKUP` section.
- **Weight and Scrap Quantities**: All weight and scrap items (`billing_type === 'WEIGHT'` or unit in `kg`, `kgs`, `g`, `gm`, `gram`) must format with exactly 3 decimal places (`numQty.toFixed(3)`, e.g., `1.000`, `2.500`, `0.200`), preserving trailing zeroes. In retail scrap and weight trade, decimals denote grams ($1\text{ kg} = 1000\text{ g}$); stripping zeroes (`1.0` or `1`) causes disputes at checkout.
- **Roll width and column budget**: 80mm roll width (8.0 cm / 42 characters per line) and `boxed` style are the standard defaults. On 42-char lines, the inner table budget is 36 characters: `idxW(2)` + `nameW(13)` + `qtyW(6)` + `rateW(7)` + `amtW(8)` = 36. `qtyW = 6` guarantees quantities up to `99.999` fit without column shifting or truncation. Total labels occupy 31 characters, aligning the right vertical pipe `│` exactly with the column pipe between Rate and Amount.
- **Receipt typography and vertical spacing**: 80mm thermal receipts use an `11.5px` font size (dynamically clamped by DOM canvas character budget if lines exceed printable width), `1.22` line height for clear row distinction, `font-weight: 800` with `-webkit-text-stroke: 0.25px #000` to ensure solid, high-density black strokes on 203 DPI thermal heads without gray dithering, `2px` vertical margins around horizontal divider rules (`<hr>`) to prevent text from touching dividers, and `4px 3px` inner padding inside the 2px border.
- **Roll margin balance and centering**: Thermal printers differ across manufacturers in their hardware origin (Epson/TVS/Bixolon align flush at ~0-2mm, while Xprinter/POS-80 series have an internal rightward offset). Rather than querying or recalculating on every transaction during high-volume checkout, the recommended left margin offset is automatically profiled once when the printer is selected in Settings (0mm for flush models like Epson/TVS; -3.5mm for offset models like Xprinter/POS-80) and stored in local printer configuration. The `#receipt-root` applies this stored `leftMarginOffsetMm` directly (`margin-left: ${marginOffsetMm}mm`), ensuring zero clipping on flush printers and balanced ~8mm margins on offset printers with 0 runtime overhead per bill.
- **Continuous roll printing**: Always render with `usePrinterDefaultPageSize: true` and CSS `@page { size: auto; margin: 0 !important; }`. Custom micro-heights or dynamic page sizes cause Windows GDI thermal drivers to fall back to centered multi-page cuts with top empty voids (~40mm) and cut-offs. Cutter mode in Windows driver settings must be configured to "Document Cut" (end of job) rather than "Page Cut" to guarantee continuous single-piece receipts regardless of item count.
- Tests: `tests/unit/thermalPrint.test.ts`, `tests/unit/printGenerators.characterization.test.ts`.


### India / UAE shop profile

`src/utils/localization/storeProfile.ts` owns renderer country, currency, locale and tax terminology.
`store_country` defaults to `IN` for existing shops; `AE` selects AED, en-AE, Asia/Dubai and VAT/TRN.
`vat_price_inclusive` is a shared boolean setting. Select both before entering prices or transactions.
`electron/services/storeCountryService.ts` rejects country changes on shops with monetary data and rejects
UAE price-basis changes after trading starts; neither operation converts balances. SQL remains in
`electron/db/statements/settings.ts`. Existing India behavior and persisted invoice kinds remain compatible.

`src/utils/pricing/vat.ts` owns inclusive extraction and two-decimal line VAT rounding. Zero product rates
remain zero; new UAE product forms start at 5%. Checkout, receipt and quotation line builders use the same
basis. UAE VAT is stored in existing `tax_amount` / `tax_total`; CGST/SGST/IGST fields stay zero, including
conversion copies. Saved net rates are restored to the selected price basis when editing a UAE sale.
`useStoreProfile` loads tenant settings before authenticated screens and reloads after settings/sync events.

`src/utils/print/uaeInvoice.ts` renders UAE AED/TRN/VAT invoices and thermal receipts. UAE uses this layout
rather than the Indian templates; quotation and purchase print entry points also dispatch through it.
UAE Form VAT 201 Return & FTA Audit File (FAF) subsystem (`docs/architecture/vat-uae-integration.md`) implements
the complete statutory tax filing preparation engine:
- Section 1: Standard rated supplies across 7 Emirates (Box 1a–1g), Box 4 Zero-Rated Supplies, Box 5 Exempt Supplies, Box 8 Total Output Tax.
- Section 2: Box 9 Standard Rated Purchases & Box 11 Total Recoverable Input Tax.
- Section 3: Net VAT Due / Reclaimable (Box 14).
- Full vs Simplified Tax Invoice rules (AED 10,000 threshold under Cabinet Decision No. 52).
- Credit Note adjustments per Emirate mapped to original invoice references.
- Statutory Exporters: Official tab-delimited FTA Audit File (FAF), Form VAT 201 multi-sheet Excel workbook, JSON export.
- Offline filing lifecycle management in local SQLite (`vat_local_filings`) with manual EmaraTax acknowledgement tracking.
Tests: `trnValidator.test.ts`, `vatReportService.test.ts`, `vat201JsonSerializer.test.ts`, `vatDashboardCard.test.ts`.

UAE real-UI regression checks (29 Oct 2026): numeric-only `shop_gstin` values remain text in both
settings reads (`taxRegistrationSetting.test.ts`), so TRNs survive billing load. UAE invoice item
details treat stored `total` as net, add stored `tax_amount` for gross, and never infer CGST/SGST
(`uaeInvoiceItems.ui.test.tsx`). Verified in an isolated desktop shop: create product at AED 105
inclusive, quantity 2, save pending invoice, review net 200 / VAT 10 / gross 210, reopen for editing,
and verify stock 10 → 8. Physical printer output was not tested.

UAE quotation persistence uses net `rate` and `taxable_amount`. `pricing/quotationPrice.ts` recovers the
net unit rate from stored taxable amount / quantity (including older quotes with gross `rate`) and restores
the configured selling-price basis for the cart. Quotation printing uses that same net rate. Explicit zero
VAT rates survive reopening. `localization/quotationTerms.ts` supplies profile-aware defaults without rewriting
saved shop terms. `pricing/receiptCredits.ts` owns UAE printed payable/refund totals: the print contract receives
`grandTotal` after discounts/points but before scrap and return credits. HTML and thermal apply those credits
once, retain fils, and show any excess as a refund. Reprint callers that supply a net-only total omit credits.
Regression tests: `uaeReleaseBlockers.test.ts`; existing Indian checkout/print snapshots remain unchanged.

Quotation history uses `components/quotation/quotationPrintData.ts` for preview/print/PDF input. UAE preview
embeds the same escaped HTML document in a sandboxed iframe (`UaeQuotationDocumentView`); it does not reuse
the Indian tax-split preview. Coverage: `uaeQuotationPreview.ui.test.tsx`.

UAE terminology follow-up (29 Oct): `resolveQuotationTerms` upgrades only the exact legacy built-in
GST terms to the selected VAT basis; custom text stays unchanged. `displayInvoiceNumber` and billing tabs
show actual UAE identifiers without adding a GST display prefix. Main-process `invoiceNumberPrefix.ts`
resolves the built-in single tax-series prefix from GST- to VAT- for future UAE allocations, keeping the
counter and collision checks. Saved document numbers, custom prefixes and B2B/B2C series are unchanged;
o sync payload or server route shape changes (the server already accepts the requested prefix). Online,
peek and allocation paths share this rule. Tests: `uaeNumbering.characterization.test.ts`.
UAE ERP display reuses `buildCheckoutLines`; UAE cashier items reuse `InvoiceItemsTable`, showing VAT
without an Indian tax split. UI coverage: `uaeWording.ui.test.tsx`.


### Staff Monthly Pay Statement (`src/utils/pricing/staffPayStatement.ts`)

- `buildPayStatement(staffId, year, month, entries, baseSalary, joiningDate)`: Computes the precise monthly payroll breakdown (opening balance carried forward from prior months, earned salary based on calendar days and joining date, extra additions, cash advances, store purchases/credits on staff account, deductions, net paid, and closing balance).
- `totalPayableToStaff(statements)`: Summarizes total accrued liability payable to staff across all active team members.
- Staff UI components (`StaffManager.tsx`, `SalarySteps.tsx`, `StaffAttendanceTab.tsx`, `StaffDetailPanel.tsx`, `StaffLedgerTab.tsx`, `StaffSalaryTab.tsx`) provide full staff profile management, salary history, attendance tracking, and monthly statement generation with print export.

### Scrap Purchase Cash Register Deduplication & Reconciliation (`electron/services/scrapService.ts`, migration `015-dedupe-scrap-cash-transactions.ts`)

- Scrap purchase invoice checkouts create a consolidated cashier payout (`Scrap Purchase`, entered by active cashier) in the open cash drawer for the invoice net total.
- Individual line item insertion (`addScrapTransaction`) checks `if (!t.scrap_invoice_number)` before posting cash drawer movements. When an item belongs to an invoice checkout, per-item `SCRAP_PURCHASE` cash movements are bypassed to prevent double deductions from the cash register.
- Migration `015` cleans up legacy duplicate per-item `SCRAP_PURCHASE` cash transactions matching a consolidated `Scrap Purchase` payout in the same drawer.
- Invoice updates (`updateScrapInvoiceFull`) and cancellations (`deleteScrapInvoice`) purge associated cash transactions and trigger `reconcileCashDrawer` to recompute expected cash balances cleanly.
- Tests: `tests/unit/scrapCashReconciliation.test.ts`.

### WhatsApp Bill tax breakdown (`src/utils/print/whatsappBillHelper.ts`)

- `formatWhatsAppBillMessage` outputs detailed tax and discount breakdown lines: `Subtotal`, `CGST` & `SGST` (for intra-state supplies) or `IGST` (for inter-state supplies) or `Tax`, and `Discount`, matching physical thermal receipt layouts.
- Invoices without tax (e.g. Bill of Supply / zero tax) omit tax lines cleanly.
- Tests: `tests/unit/whatsappTaxBreakdown.test.ts`.

### Shop Closing Gross Sales reconciliation (`electron/whatsapp/shopClosingSummary.ts`)

- In `buildShopClosingSummaryData`, `grossSales` is strictly calculated as `netSales + totalDiscount` (`gTotal + disc`), matching the ground truth in `FinancialReport.tsx`.
- Bill-level scrap deductions (`scrap_deduction`) and return deductions (`return_deduction`) are accounted for in their dedicated summary sections, never added into `grossSales`.
- In the closing WhatsApp message (`shopClosingMessage.ts` and `shopClosingHelper.ts`), `Gross Sales` and `Total Discount` are displayed before `Net Sales` whenever discounts exist.
- Tests: `tests/unit/shopClosingGrossAmount.test.ts`.

### Inline Pricing Tier Creation (`src/components/inventory/views/form/PricingSection.tsx`, `InventoryManager.tsx`)

- Allows creating new custom pricing tiers (e.g. Wholesale, VIP, Retail Tier B) directly inline inside the product form via `onAddPricingTier`.
- Persists via `pricingTiersApi.addPricingTier` and reloads active tiers into state dynamically without navigating away from the active product draft.

### Accounts sharing a phone

Billing customerDirectory prefers an exact normalized name with a compatible phone before a phone-only match, for balances and loyalty. Regression: tests/unit/customerDirectory.test.ts.

### Filtered ledger balance direction

Ledger date and GST/Estimate filters use `calculateLedgerStatement` for opening, running and closing balances. `components/party/ledgerBalances.ts` derives each bucket closing balance through that canonical calculation; date filtering must retain advances before the period. Positive means the customer owes the shop, negative means the shop owes the customer. Regression: `ledgerBalanceDirection.ui.test.tsx`.

### Historical credit notes

Returns > Record credit note uses `returns/creditNote.ts` and canonical returnPricing for original printed rates/tax; no fabricated sale is created. Migration 017 allows nullable original invoice ids while preserving returns/items/indexes/outbox triggers. `returnsService.createReturn` accepts an optional original return date and uses it consistently for return_date, created_at and ledger transaction date. Existing dates/fields are sent through the existing sync contract; server already accepts a null invoice. Financial amounts are validated before writes. Regression: historicalReturnMigration, historicalCreditNote and creditLedger tests.
