# 4. Business rules

Rules that decide money, numbers, tax or access must have **exactly one implementation** with unit tests.
Before writing a calculation, look for it here. If you change a rule, change the canonical module, extend its test,
and update every caller in the same change.

### Combo availability

`src/utils/pricing/comboStock.ts` owns complete-combo availability for billing search.
Use component `product_stock` from the combo API, divide by the required quantity,
and take the lowest whole result. Repeated product requirements are combined first.
Empty or invalid requirements and negative availability return zero. Thus 12 and 11
pieces at one each yield 11 combos; two pieces of the first yield 6.
Tests: `productSearch.test.ts`, `comboStock.test.ts`. No IPC or sync contract changes.

### Billing product search ordering

`src/components/billing/productSearch.ts` (`buildProductSearchResults`) partitions billing search results by inventory availability:
1. In-stock combos (`current_stock > 0`)
2. In-stock products (`current_stock > 0` or service items)
3. Out-of-stock combos (`current_stock <= 0`)
4. Out-of-stock products (`current_stock <= 0` and non-service items)

Within each availability partition, query relevance ranking from `sortProductsBySearchPriority` is preserved. At most 50 rows are returned.
Tests: `tests/unit/productSearch.test.ts`. No IPC or sync contract changes.

## 4.1 Canonical rule modules (renderer)

| Rule | Module | Tests |
|---|---|---|
| Line unit rate: list/grade rate → catalog offer/discount → ad-hoc cashier adjustment; scrap lines invert discounts | `src/utils/pricing/linePricing.ts` (`listRate`, `resolveLinePrice`) | `tests/unit/linePricing.test.ts` (incl. 5,000-case equivalence with the legacy rule) |
| Product/variant draft discount conversion, offer exclusivity and MRP recalculation | `src/utils/pricing/productDiscounts.ts` (`changeProductDiscount`, `recalculateProductDiscount`) | `tests/unit/productDiscounts.test.ts`, `discountSection.ui.test.tsx` |
| Checkout payload lines, CGST/SGST/IGST split, Bill-of-Supply tax, receipt lines, quotation lines, supply type | `src/utils/pricing/checkoutLines.ts` | `tests/unit/checkoutLines.test.ts` |
| Return source discounts, fractional quantities, stored invoice tax, rounded line/header totals | `src/utils/pricing/returnPricing.ts` (reuses `resolveLinePrice`; invoice rates already include line discounts) | `tests/unit/returnPricing.test.ts`, `returnSelection.test.ts`, `billingScreen.ui.test.tsx` |
| Live cart totals (subtotal, tax, scrap, discounts) | `src/store/cartStore.ts` (`useCartTotals`, uses `resolveLinePrice`) | via `linePricing` tests |
| Money formatting (₹/en-IN or AED/en-AE from the store profile, sign) | `src/utils/pricing/money.ts` (`formatCurrency`, `formatAmount`); main process: `electron/services/storeCountryService.ts` (`formatStoreMoney`, `storeMoneyProfile`) | `tests/unit/money.test.ts`, `storeProfile.test.ts`, `storeMoneyText.test.ts` |
| Typed amounts: amount boxes take numbers only (digits and one decimal point; no commas, letters, signs, symbols or spinner arrows) and are read with one parser | `src/utils/pricing/money.ts` (`sanitizeAmountInput` while typing, `parseAmount` for stored/typed values; never bare `Number()`/`parseFloat()`, since `Number('1,250')` is NaN and `parseFloat('1,250')` is 1) | `tests/unit/money.test.ts`, `quickProductEntry.ui.test.tsx` |
| Document numbers: offsets (including digit-only values with an empty prefix), digit matching | `src/utils/pricing/invoiceNumberHelper.ts` | `tests/unit/invoiceNumberHelper.test.ts`, `deductionLookup.test.ts` |
| Tab number previews (peek + skip numbers other tabs show; series; per-type retitle rules) | `src/components/billing/numberReservation.ts` | `tests/unit/numberReservation.test.ts` (characterization) |
| Scrap/return credits that can be deducted from a bill | `src/components/billing/deductionLookup.ts` | `tests/unit/deductionLookup.test.ts` |
| Sales-history amounts and tax breakdown | `src/utils/pricing/salesHistoryAmount.ts`, `src/utils/pricing/salesHistoryTax.ts` | `tests/unit/salesHistory*.test.ts` |
| Permissions: keys, groups, legacy `restricted_page` conversion, `hasPermission`, `isAdminRole` | `src/utils/security/permissions.ts` | — (add tests when touched) |
| Pricing tiers applied to products | `src/utils/pricing/pricingTierHelper.ts` | — |
| Store timezone and UTC parsing | `src/utils/time/timezoneHelper.ts` | — |
| Financial Year: India (Apr-Mar) & UAE (Jan-Dec) fiscal cycles, year-end rollover and period locking | `src/utils/time/financialYear.ts` | `tests/unit/financialYear.test.ts`, `tests/unit/financialYearSettings.ui.test.tsx` |
| Staff data masking | `src/utils/security/staffDataMasking.ts` | — |
| Staff monthly pay statement (carried forward, salary added, extras, advances, store purchases, deductions, paid, balance) and total payable to staff | `src/utils/pricing/staffPayStatement.ts` (`buildPayStatement`, `totalPayableToStaff`) | `tests/unit/staffPayStatement.test.ts` |
| Party roles, parsing, billing and purchase eligibility | `src/data/partyRoles.ts` | `tests/unit/partyRoles.test.ts` |
| Tax calculations (GST split CGST/SGST/IGST & UAE VAT 5% inclusive/exclusive) | `src/utils/pricing/taxEngine.ts`, `electron/utils/gstEngine.ts` | `tests/unit/taxEngine.test.ts` |
| UAE TRN validation (15 digits, prefix 100) & Emirate normalization | `src/utils/pricing/trnValidator.ts`, `electron/utils/trnValidator.ts` | `tests/unit/trnValidator.test.ts` |
| UAE e-invoicing on the terminal: seller setting keys, buyer profile checks, status labels (the PINT AE document is built on the server, `nafid-server/src/services/einvoice/`) | `src/utils/einvoice/einvoice.ts`, `electron/services/einvoiceService.ts` (profile sanitizing) | `tests/unit/uaeEinvoice.test.ts` |
| UAE Form VAT 201 Return, FTA Audit File (FAF), and filing lifecycle | `electron/services/vatReportService.ts`, `vatFilingService.ts`, `src/utils/export/ftaAuditFileExporter.ts` | `tests/unit/vatReportService.test.ts`, `vat201JsonSerializer.test.ts`, `vatDashboardCard.test.ts` |
| Restaurant mode: order-time menu price, service charge (UAE: standard-rated, VAT on top of / inside it like any line), add-on limits, order → billing cart lines, guest check totals | `src/components/restaurant/restaurantRules.ts`, `guestCheck.ts` (reuse `linePricing`, `checkoutLines`) | `tests/unit/restaurantRules.test.ts` |
| Restaurant mode: KOT station routing and ticket text; orders, voids, merge / split, billing claim, settlement inside checkout; forward-only statuses | `electron/services/restaurantKot.ts`, `restaurantOrderService.ts`, migration `016-restaurant.ts` triggers | `tests/unit/restaurantOrders.test.ts`, `restaurantRules.test.ts` |
| Printed documents (receipt text, A4/half-A4 HTML, quotation HTML, party ledger PDF, WhatsApp bill) | `src/utils/print/receiptGenerator.ts`, `invoiceHtmlGenerator.ts`, `quotationHtmlGenerator.ts`, `partyLedgerPdfGenerator.ts`, `whatsappBillHelper.ts`, `printFormatHelper.ts`, `receiptCore.ts`, `styles/boxed.ts` | `tests/unit/thermalPrint.test.ts`, `printGenerators.characterization.test.ts`, `thermalBillTaxBreakup.test.ts` |
| Inventory product CSV export formatting & bulk upload header normalization | `src/components/inventory/hooks/useInventoryExports.ts` (`buildInventoryCsvRow`), `src/components/data-upload/dataUploadTypes.ts` (`PRODUCT_HEADER_MAP`, `resolveDynamicTierName`) | `tests/unit/inventoryCsvExport.test.ts` |

Sales History date filters and dashboard sales use invoice creation instants in the store timezone. The shared `electron/db/statements/invoiceDates.ts` predicate parses legacy UTC space-separated timestamps and ISO timestamps numerically; later settlement does not move a sale to another date. Tests: `invoiceDateFilters.test.ts`.

Main-process rules live in `electron/services/` (document numbering, party ledger, cash drawer reconciliation, store time)
and `electron/utils/` (ids, cashier settlement math).

### Saved bill line order

Checkout and bill edits insert lines in submitted cart/receipt order. Invoice reads and legacy invoice push use
explicit SQLite row order in `electron/db/statements/invoices.ts` and `statements/sync/salesDocsSync.ts`.
`electron/sync/invoiceItemOrder.ts` is the single legacy-pull ordering rule: preserve surviving local item-id
order, omit removed items, append new items in incoming order, and leave caller arrays unchanged. The existing
divergent-PENDING-edit guard runs first. This is local compatibility behavior, not a persisted cross-terminal
position contract. First imports retain incoming order; previously lost original positions cannot be recovered.
See [data access](03-data-access.md#saved-invoice-line-order). Tests: `invoiceItemOrder.test.ts`,
`preserveInvoiceItemOrder.test.ts`, `stockSnapshotSync.test.ts`.

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

### Card terminal payments (`electron/services/cardTerminalService.ts`, `src/components/app/cardTerminalStep.ts`)

- Off by default, per PC (`card_terminal_config`, device-local). When on, the card part of a CARD / SPLIT bill is sent
  to the machine before the bill is saved; the approved result is stored as `split_details.card_terminal` (last 4 card
  digits only). Ledger rows and amounts do not change.
- Every request is journaled in `card_terminal_transactions` before it is sent. A missing answer is resolved by an
  inquiry or by the cashier from the slip, never by sending the payment again. A save that fails after a charge voids it.
- Design and flows: `card-terminal-design.md`. Tests: `cardTerminalService.test.ts`, `cardTerminalStep.test.ts`.

### Cash drawer sessions (`electron/services/cashDrawerSession.ts`)

- Legacy cash-drawer pull (`electron/sync/entities/cashSync.ts`) accepts a received `CLOSED` status and its
  closing metadata/totals without applying the local open-balance maximums. A nonzero opening balance cannot
  reopen a received close. Same-day alternate drawer IDs use the existing matching path. This is a receiving
  terminal fix, not a change to the wire contract or a guarantee about server/LAN conflict resolution.
  Regression: `tests/unit/cashDrawerCloseSync.test.ts`.
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
- `cash_register_ledger_mode` defaults to `today`; `off` excludes manual ledger cash,
  `today` includes only entries dated the drawer business day in the store timezone. Both date modes select entries
  recorded in this drawer session; `all` permits any ledger document date, without recounting all historical cash.
- New manual CASH ledger creations (and entries edited to CASH) atomically write one idempotent cash transaction with category
  `PARTY_LEDGER:<ledger_id>`. The cash feed resolves the current ledger amount, direction, payment method, party name (attached to notes as
  `<party_name> — <description>` or `<party_name>`) and exact ledger timestamp (`ledger_date`) to prevent naive timezone drift.
  These derived entries are edited in the Ledger, and return refunds in Return History, not deleted in Cash Register.
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
  the rounded remainder, so both add up to the tax. Existing invoice rows are not rewritten. Renderer summaries, cart totals
  (`cartStore.ts`), checkout payload line builders (`checkoutHandler.ts`), thermal receipt renderers (`receiptCore.ts`, `boxed.ts`),
  and WhatsApp bill messages (`whatsappBillHelper.ts`) reuse this canonical helper whenever `tax > 0` on intra-state sales
  (including Bill of Supply with tax enabled or legacy documents where `cgst` and `sgst` are zero), guaranteeing consistent
  non-zero CGST and SGST and eliminating 0.00 tax rows. Supply type resolution is strictly owned by `resolveSupplyType` from
  `src/utils/pricing/checkoutLines.ts`. Tests: `tests/unit/checkoutLines.test.ts`, `tests/unit/thermalBillTaxBreakup.test.ts`.
  The main-process Bill-of-Supply conversion uses the same rule in `electron/utils/taxSplit.ts` to keep the process boundary intact.
- `nafid-server/src/utils/cashierSettlement.ts` and `electron/utils/cashierSettlement.ts`, and the permission conversion in
  `src/utils/security/permissions.ts` vs `nafid-server/src/services/permissions.ts`, are **cross-app copies of one rule**.
  They must stay behaviourally identical until a shared package exists; change both with tests.
- Per-bill credit outstanding: `electron/services/customerCreditService.ts` (with `invoiceCreditTerms`) and
  `nafid-server/src/db/repositories/customerCredit.ts` are cross-app copies of one rule (`tests/unit/creditLedger.test.ts`,
  `nafid-server/tests/customerCredit.test.ts`).
- `electron/sync/syncConfig.ts` still has date parsing also present in `electron/services/storeTime.ts`.
  Consolidate only together with sync characterization tests. Auth-file reading is shared through
  `electron/services/authStorage.ts`; services and sync must use that canonical reader.

## 4.3 Authentication and authorization (POS side)

| Concern | Where |
|---|---|
| Online login | `authStore` → `authCloud.login` → scoped main `cloudLoginService` on desktop → server `/auth/login`; browser surfaces retain direct HTTP |
| Password reset/change, tenant domain | `src/store/authStore.ts` → server `/auth/*` |
| Offline login (no network) | `authApi.loginOffline` → IPC registration → `electron/services/localAuthService.ts:localAuthenticateUser` (against users cached locally by sync) |
| Token persistence | `authApi.saveToken` → `electron/services/authSessionService.ts`; reads/encryption through canonical `authStorage.ts` (Electron `safeStorage`, `auth.enc`) |
| Session state, role, permissions | `useAuthStore` (`role`, `permissions`, `isAuthenticated`) |
| UI permission checks | `hasPermission(user, 'sales.create')` from `src/utils/security/permissions.ts`; `<PermissionGuard>` component |
| Biller PIN (quick user switch) | `BillerPinModal` → `staffApi.verifyBillerPin` |
| Quick PIN Login (terminal switch) | `QuickPinLogin` → `authApi.loginWithPin` (`localAuthenticatePin`, against staff `biller_pin_hash` scoped to `tenant_id`) |
| Staff protection | `StaffProfileHeader`, `StaffBasicTab`, `staffService.saveStaff` (prevents self-deactivation and Admin account deactivation) |
| Rejected/expired cloud session | `syncTransport.fetchWithFallback` / `cloudFetch` → cloud sync paused + session-expired modal; only the current credential may be rejected |

Permission keys are the shared contract with the server (`requirePermission('sales.view')`). Admin/owner roles bypass
checks on both sides. Add a new permission key in **both** `src/utils/security/permissions.ts` (with its UI group/label) and
`nafid-server/src/services/permissions.ts`.

`products.create` requires the explicit `products.create` permission, wildcard, or admin/owner bypass. Other
`products.*` permissions retain the broad fallback for `products.view`.

### Cloud recovery and offline access

`authStore.login` owns POS entry and offline fallback. Cached email/password works without a PIN during provider
outages; explicit offline entry uses the same account/password checks after failure. A terminal without cached
credentials still requires an online login once. HTTP 400/401/403/429 must never silently bypass the cloud denial.

Cloud recovery belongs to the closable `SessionExpiredModal` → `store/cloudSyncRecovery.ts` →
`authApi.resumeCloudSession` → `cloudSessionRecoveryService`. It stays inside the authenticated POS and never clears
the cart, resets the domain, logs out or switches the local user. Only an online credential for the current shop may
restore sync. Main rechecks the expected local session before saving, retaining local identity/permissions separately
from the cloud user; an owner reconnecting sync cannot turn the active cashier into an administrator. The saved offline
session takes precedence over the cloud auth record. Remembered terminal display context neither authorizes recovery
after logout nor blocks it when missing or stale. `quickPinLogin` covers these recovery boundaries. Restart
restores the local user and independently restores cloud availability. Failed/cancelled recovery leaves offline work
available with Re-Login Needed visible. A domain-confirmation cache failure must not demote an online POS login.

`syncTransport` owns request-specific cloud 401 handling. Stale rejections and LAN pairing errors cannot pause
replacement credentials; renderer events are matched to current/terminal credentials. Reauthentication restarts the
cancelled scheduler once. Token parsing/expiry lives in `utils/security/authToken.ts`.
See [data access](03-data-access.md#cloud-session-recovery) for the typed local IPC and compatibility contract.
Tests: `cloudRelogin.ui`, `cloudSyncRecovery.ui`, `cloudSyncDialog.ui`, `reloginScreen.ui`, `sessionUnauthorized.ui`,
`syncReauthentication`, `syncResumeTimer`, `quickPinLogin`. Server credential-version rules remain in its HTTP guide.

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

Bill edit redemption (14 November 2026): the billing tab stores the original invoice id, redeemed points and
historical discount, plus an optional explicit redemption draft. Totals and checkout consume the same resolved
values. An unchanged redemption survives a zero current balance, a changed redemption rate, disabled loyalty
and tab navigation. Explicit changes use the current rate and the balance including this bill's original redemption;
main-process validation remains authoritative. The update response returns the persisted earned/opening/closing
snapshots for immediate printing, preventing a second award from appearing on the edit receipt. Tests:
`billingEditRedemption`, `loyaltyPersistence`, `loyaltyReceipt`.

Loyalty earning basis: `electron/utils/loyalty.ts` is shared by checkout, edit/settlement and renderer receipt preparation. `loyalty_config.includeTax` defaults to true for compatibility; false subtracts tax from the eligible total before flooring points. The preference uses the main Settings Save Changes draft. Reconciliation refreshes invoice opening and closing point snapshots after an edit.

Loyalty review (6 November 2026): payment/edit refresh respects `counts_in_revenue`, and disabled earning still reconciles historical contributions. Customer detail summaries refresh from the stored customer alongside invoice/activity reads; stale detail responses cannot replace another customer. Receipt point balances preserve zero and negative values. Regression coverage: `customerPointsRefresh.ui`, `loyaltyReceipt`, `loyaltyPersistence`.

Zero-counter recovery: customer directory reads transactionally restore all-three-zero customer loyalty counters from the recorded loyalty ledger, marking repaired rows PENDING through the existing repository. Nonzero counters are preserved; no invoice-based re-award, rate change, or inferred opening balance occurs. Recovery is tenant-scoped and idempotent (`loyaltyPersistence`).

Customer directory create/edit rejects another active customer with the same whitespace/case-normalized name or normalized phone (existing last-ten-digit convention). The manual Merge Duplicates header action is removed; historical startup/sync identity reconciliation remains internal. Tests: `loyaltyPersistence` duplicate create/edit regression.

`electron/services/loyaltyService.ts` is the main-process authority for enabling loyalty, settlement/edit earnings,
return and cancellation adjustments. Both `loyalty_config.enabled` and `feature_flags.loyalty` must permit loyalty:
an explicit false wins; if neither setting exists, loyalty is off. Disabled shops cannot newly earn, redeem,
manually adjust or recalculate points; historical invoice money remains unchanged and historical reversals still
correct the stored balance. Renderer visibility is read by `src/hooks/useLoyaltyEnabled.ts` (billing also reloads
its earning/redemption rates on `settings:updated`).

Checkout calculates earnings from the saved eligible net grand total (subtracting tax when `includeTax` is false) and validates whole-point redemption against the actual
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
- **UPI QR and points**: `electron/utils/upiQr.ts` owns the 25 mm thermal QR size and four-module white border; `receiptPaymentPanel.ts` derives the four points-row heights from that size and renders escaped HTML. The boxed generator emits the QR and four loyalty rows before the signature/footer. USB printing and both previews share the panel through renderer re-exports in `src/utils/print/`; no Electron APIs or Node dependencies may enter these pure modules. Group only a complete adjacent boxed points table; otherwise keep existing text rows. QR-off preserves the points table; a QR generation failure retains point values and displays a fallback. Network ESC/POS retains its existing text-only points behavior; A4 layouts are unchanged.
- Tests: `tests/unit/thermalPrint.test.ts`, `tests/unit/receiptPaymentPanel.test.ts`, `tests/unit/printGenerators.characterization.test.ts`. Digital 58/80 mm PDF layout was visually verified; this does not certify phone scanning or physical hardware.


### India / UAE shop profile

`src/utils/localization/storeProfile.ts` owns renderer country, currency, locale and tax terminology.
`store_country` defaults to `IN` for existing shops; `AE` selects AED, en-AE, Asia/Dubai and VAT/TRN.
`vat_price_inclusive` is a shared boolean setting. Select both before entering prices or transactions.
`electron/services/storeCountryService.ts` rejects country changes on shops with monetary data and rejects
UAE price-basis changes after trading starts; neither operation converts balances. SQL remains in
`electron/db/statements/settings.ts`. Existing India behavior and persisted invoice kinds remain compatible.

Bahrain (`BH`, completed 11 Nov 2026): full statutory country support across POS and server.
- **Profile:** Currency BHD (three decimals, 1 BHD = 1000 fils), locale `en-BH`, timezone `Asia/Bahrain`, default VAT 10%, 15-digit VAT Account Number, GS1 prefix 608.
- **Selection & Locking:** Selectable in `SELECTABLE_STORE_COUNTRIES` (`['IN', 'AE', 'BH']`) and trial signup. Country changes after transactions/prices exist are refused by `saveStoreCountry` to protect financial ledger integrity.
- **Precision & Math:** 3-decimal precision across renderer (`moneyFixed`, `parseAmount`, `step="any"` on all money inputs) and main process (`roundStoreMoney`, `storeMoneyDecimals`, `formatStoreMoney`). Floating point tolerances calibrated to 0.001. Widened server tenant schema to `NUMERIC(15, 3)` across 22 entities.
- **Documents & Invoices:** Bahrain NBR compliant document titles (Simplified Tax Invoice for B2C <= 500 BHD; Tax Invoice for B2B or > 500 BHD). Bilingual labels (VAT Account No. / رقم الحساب الضريبي). Validated checkout requirements: seller name, address, 15-digit VAT account number, customer name and address for B2B / > 500 BHD.
- **VAT Return:** Bahrain NBR VAT Return & Audit screen in POS with 10% standard rate, zero-rated, exempt, and input tax recovery (Box 1 Emirates breakdown omitted).
- **Layering & Scope:** Country checks are cleanly partitioned into `isVatStore()` (renderer) / `isVatCountry()` (main) for shared single-rate VAT behavior, and `isUaeStore()` / `isBahrainStore()` for jurisdiction-specific rules. India (`IN`) and UAE (`AE`) behavior remains byte-for-byte identical.

No screen in a UAE shop shows ₹, INR, en-IN grouping or Indian sample data. Amounts go through `money.ts`;
legacy ₹ label strings go through `localizeCurrencyText` (`Rate (₹)` → `Rate (AED)`, `₹15` → `AED 15`); currency
codes in labels use `getStoreProfile().currency`; preview/template barcodes use `getSampleBarcode()` (GS1 890 / 629);
money icons use `components/ui/CurrencyIcon`. Main-process text (checkout errors, ledger and loyalty descriptions,
WhatsApp closing) uses `formatStoreMoney` / `storeMoneyProfile` with the tenant's `store_country`; stored ledger and
loyalty descriptions keep their ungrouped India text (`Total ₹1500.00`) and only take the prefix from the profile.
The main process cannot import `src/` (`tsconfig.electron.json` rootDir), so these two helpers mirror the profile
values; change both together. GST report
screens and `gstReportService` remain India-only (UAE opens the VAT report).

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


### UAE document titles and Arabic labels

One module: `src/utils/print/uaeLabels.ts`. `uaeDocumentTitle` decides Tax Invoice / Invoice / Tax Credit Note
(FTA rule, see `vat-uae-integration.md` §9); `UAE_LABELS` holds every English/Arabic label pair; `getUaeArabicPrint()`
reads the `uae_arabic_print` setting. India printing never calls it. Tests: `printGenerators.characterization.test.ts`
(UAE section), `thermalPrint.test.ts` (network printers print the English-only receipt), `uaeArabicPrintSetting.ui.test.tsx`.
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

- In `buildShopClosingSummaryData`, gross sales uses stored subtotal plus tax before discounts and credit deductions; net sales uses stored grand totals.
- Scrap and return credits reduce net sales; gross sales is derived from the original sales value, not reconstructed from net sales.
- Both closing formatters use the pure `electron/utils/closingSales.ts` rule for Sales Today (gross less discounts, floored at zero). Gross Sales is labelled before discounts; Net Sales retains stored grand totals after credits. Different report windows can still produce different totals.
- Tests: `tests/unit/shopClosingGrossAmount.test.ts`, `tests/unit/salesHistoryReports.test.ts`.

### Inline Pricing Tier Creation (`src/components/inventory/views/form/PricingSection.tsx`, `InventoryManager.tsx`)

- Allows creating new custom pricing tiers (e.g. Wholesale, VIP, Retail Tier B) directly inline inside the product form via `onAddPricingTier`.
- Persists via `pricingTiersApi.addPricingTier` and reloads active tiers into state dynamically without navigating away from the active product draft.

### Accounts sharing a phone

Billing customerDirectory prefers an exact normalized name with a compatible phone before a phone-only match, for balances and loyalty. Regression: tests/unit/customerDirectory.test.ts.

### Filtered ledger balance direction

Ledger date and GST/Estimate filters use `calculateLedgerStatement` for opening, running and closing balances. `components/party/ledgerBalances.ts` derives each bucket closing balance through that canonical calculation; date filtering must retain advances before the period. Positive means the customer owes the shop, negative means the shop owes the customer. Regression: `ledgerBalanceDirection.ui.test.tsx`.

### Historical credit notes

Returns > Record credit note uses `returns/creditNote.ts` and canonical returnPricing for original printed rates/tax; no fabricated sale is created. Historical migration 017 (replayed idempotently by compatibility migration 021, with UAE e-invoicing schema ensured by 022) allows nullable original invoice ids while preserving returns/items/indexes/outbox triggers. `returnsService.createReturn` accepts an optional original return date and uses it consistently for return_date, created_at and ledger transaction date. Existing dates/fields are sent through the existing sync contract; server already accepts a null invoice. Financial amounts are validated before writes. Regression: historicalReturnMigration, historicalCreditNote and creditLedger tests.

### v2.2.44 register, closing and staff rules

- `duplicateScrapCash.isDuplicateScrapCash` identifies only invoice-linked legacy scrap purchase rows
  with a system/blank/placeholder actor. Category, actor and note matching ignore case; standalone
  scrap and entries attributed to a person remain cash. Register and every day-history query use
  this predicate. Register reads purge legacy duplicates then reconcile the open drawer immediately.
- Closing gross sales is stored sales subtotal plus header tax, before invoice/points discounts and
  scrap/return credit deductions. Net sales remains the stored payable total. Never reconstruct gross
  by adding redeemed credits to a clamped payable amount. The enabled checklist always shows gross,
  including a zero-discount day; preview and sending follow the same rule.
- Manual WhatsApp shares use `buildReceiptLines`, like checkout, including effective item prices,
  HSN/SAC and tax rates. Text and PDF receive header tax components, subtotal and discount. History
  respects stored INTER supply/IGST evidence and the canonical cents split; UAE keeps VAT labels.
- Staff monthly statements classify UTC instants in the shop timezone. Attendance exposes every day
  of the selected calendar month, including unmarked days and holidays; marking does not accrue salary.
- `last_active_terminal_session` stores only shop/user display context in a LOCAL global setting on
  this PC. Login and logout update it without storing a PIN or granting access. A legacy multi-shop
  PC without remembered context requires email login instead of selecting an arbitrary first tenant.
- Quick PIN login preserves an existing valid cloud session for the same shop/tenant. Local PIN
  authentications persist the local user separately without rewriting the cloud account or its cached password, preventing
  spurious "token expired" alerts while keeping background sync connected. An offline PIN login sets
  `isCloudSyncPaused: true` without a usable terminal cloud token. Main returns `cloud_sync_ready` for both PIN and cached-password entry; renderer must use it rather than infer readiness from local login success. Resuming cloud sync opens the closable cloud-only login dialog without signing out.

Coverage: `scrapCashReconciliation`, `shopClosingGrossAmount`, `quickPinLogin`, `releaseFixes.ui`,
`whatsappBillBreakdown`, `whatsappTaxBreakdown`, `staffPayStatement`, and print characterization.


### Product variants

`components/inventory/variantProducts.ts` owns draft validation, complete paged child lookup,
edit hydration and child/tier persistence. The form repeats the canonical `PricingSection` below
Inventory & Pricing for each named variant (S, XL, packs). Each has independent purchase/MRP/offer,
real/paper stock, reorder level, unit and tier overrides. Names must be nonblank and unique within
the parent. Sibling/parent barcodes must differ; price/tier values must be finite and nonnegative.
Explicit zero prices are retained; a blank offer clears the child offer and a blank tier clears its override.

Variants remain existing product rows linked by `domain_attributes.parent_product_id` and
`variant_name`; tiers remain existing product-pricing rows. No schema/IPC/sync contract changes.
Editing preserves other child fields and attributes. A failed child or tier write keeps the draft
open with an error and retains successful product IDs for retry. Existing IPC writes are separate
transactions, so a failed multi-variant save can leave already-saved rows; retry completes them.
Removing an unsaved section removes only the draft; saved variants use the explicit recycle-bin
flow on the standalone Product Variants page.

The dashboard page follows inventory/products.view and gates create/edit/delete using existing
products permissions. It searches and filters individual variant rows across the complete catalog and delegates edits
to the shared single-variant Modal through `variants/hooks/useVariantEditor.ts`. Add Variant
selects an existing non-variant product; saving writes only the selected child and its tiers. It replaces the inventory toolbar Variants button/subview.
Coverage: variantProducts, variantsSection.ui and variantPersistence (real SQLite/service roundtrip,
independent tiers, preserved parent/sibling stock and tenant isolation).
`inventoryVariantSave.ui` proves failure/retry retains parent and child IDs; `variantsManager.ui`
proves search, selected-child editing, existing-product selection, read-only access, deletion
confirmation and refresh recovery. `variantEditor.ui` covers sibling validation and partial-save
retry; `variantCatalogLoad.ui` covers stale-read and tenant isolation. Zero offers remain visible
and exclude competing discounts. No new bridge, schema or sync contract is introduced.


### Settings: one explicit Save Changes action

All preferences and feature switches in Settings are drafts. Only the header Save Changes action
persists and applies them. No section may introduce its own Save button or write settings from
an input/checkbox handler. This includes modules, restaurant setup, printer targets, service charge,
WhatsApp preferences, theme, ledger terminology, dashboard order, sync engine, pairing keys and UAE
seller/provider settings. Password changes, device linking, test print/report, updates and other explicit
operations remain separate actions; they must not silently save edited preferences.

`SettingsManager` owns the main form and feature draft. Visited sections remain mounted but hidden
so their local drafts survive navigation. Nested setup panes and hardware/WhatsApp preferences also
retain their draft state. `SettingsSaveSession` collects dirty sections by unique identity;
`useSettingsSectionSave` registers the latest async callback. The header aggregates all dirty state,
disables editing during save, awaits every section, and reports success only after completion. A failed
section rejects to the header and retains its draft for retry. Writes span existing data APIs and are
not one database transaction: successfully written sections may remain saved when a later section fails.
Do not report rollback or atomicity. No persistence contracts or sync payloads change.

Restaurant setup edits use `useRestaurantSettingsDraft`, retaining stable IDs for additions and saving
only changed rows through `restaurantApi`. Table labels and numeric setup values are checked before
writes; existing server/main-process validation remains authoritative. Theme/terminology/dashboard
changes are applied to their runtime stores only after persistence succeeds.

Regression checks: `settingsSaveSession.ui`, `businessModules.ui`, `cashRegisterSettings.ui`,
`filingOnlySettings.ui`, `uaeArabicPrintSetting.ui`, and `timezoneSettingsSave.ui`. Renderer acceptance:
Vite > `/tests/fixtures/moduleWorkspace.html?settings` uses isolated test shop storage. Check drafts across
sections, exactly one Save Changes button, unsaved discard on reload, saved persistence on reload,
and a failing/retried section. It does not prove installed native hardware behavior.


### Shared display clock contract

The root architecture's application-wide time contract applies to every module, including restaurant pages, reports, AI replies, receipts and exports. Use `storeDate`, `storeTime`, `storeDateTime` from `src/utils/time/dateDisplay.ts`; these enforce the current shared timezone and 12/24-hour setting. Pass date-only strings unchanged. Use `getStoreBusinessDate` for current-day defaults, `toStoreWallClock` / `storeWallClockToUtcIso` for editable timestamp inputs, and `storeCalendarDate` / `calendarDateKey` only for calendar arithmetic, never storage. The renderer re-exports the pure main-process UTC parser to keep one implementation. Main-process report services convert calendar filters once with `getUtcRangeForStoreDateRange`, then statement factories compare `julianday` instants. Purchase document dates remain calendar labels. Tests: `timeContract.test.ts`, `shopDayQueries.test.ts`, `timeDisplayArchitecture.test.ts`, `shopClockProfile.ui.test.tsx`, `timezoneHelper.test.ts`, `storeTime.test.ts`, `invoiceDateFilters.test.ts`.


### Shared invoice tax-breakup presentation

`src/utils/print/receipt/receiptCore.ts:resolveTaxBreakup` owns the shared tax-breakup visibility, taxable base and CGST/SGST rounding used by thermal receipts and invoice HTML. `invoiceHtml/taxBreakup.ts:renderTaxBreakup` only formats the result; the five Indian invoice styles call it rather than calculating tax independently. `showBosTaxBreakup` controls non-GST documents; zero-tax documents omit the section. UAE documents retain their separate existing VAT layout. Coverage: `pdfTaxBreakup`, `thermalBillTaxBreakup` and `printGenerators.characterization`.

### Inventory bulk product import

`components/data-upload/productFile.ts` owns product-file parsing and validation. CSV and Excel retain displayed identifier zeros, formatted money, percentage points, discounts, paper prices/stock and billing type. Malformed numeric values, repeated product identities and invalid tier prices block the whole product file. File replacement clears stale preview rows; parsing and saving block concurrent submission. Tier matching uses exact normalized names or explicit tier headings, never substring/typo guesses.

`electron/services/bulkProductValidation.ts` validates typed batches before `productsService.bulkImportProducts` starts its transaction. All rows must belong to one shop. Conflicting barcode/item-code identities roll the transaction back; an existing or deleted matching product keeps its ID. Product, tier and tier-price writes remain atomic, PENDING, and covered by the existing stock-counter/outbox triggers. Tests: `productFile.test.ts`, `productImport.ui.test.tsx`, `bulkProducts.test.ts`, plus `inventoryCsvExport.test.ts`. The 11,032-row regression checks initial import and repeat import. This does not bypass cloud authentication or make stale terminals safe to reconnect.





### Product and variant discount drafts

`src/utils/pricing/productDiscounts.ts` owns percentage/flat conversion, MRP recalculation and offer exclusivity for both product and variant forms. Variants repeat Inventory & Pricing and Discount & Offers after the parent discounts; variant discounts load/save independently. New variant barcodes use compact 12-character uppercase hexadecimal values; saved barcodes stay unchanged and existing duplicate validation still applies. Coverage: `productDiscounts.test.ts`, `variantsSection.ui.test.tsx`, `variantProducts.test.ts`.

### Payment Methods date-range display

Payment Methods overview filters sources by `last_transaction_date`; this is latest activity, not a historical balance report. Its metric cards and available balances remain lifetime/current values. The selected source ledger applies the shared inclusive shop-calendar range to `transaction_date`, combined with text search. Cash-in/out summary totals reflect those visible entries; saved running balances remain historical ledger values. Clearing both dates includes undated entries; an active range excludes missing or invalid dates. `components/payment-methods/paymentDateFilter.ts` owns matching through canonical timezone/calendar utilities; `tests/unit/paymentDateFilter.test.ts` covers boundaries, one-sided ranges and invalid values. No financial posting, IPC or sync contract changes.

### Financial Year lifecycle, rollover and audit period locking

`src/utils/time/financialYear.ts` owns fiscal calendar calculation, rollover prefix suggestions, and period lock verification:
- **Fiscal Calendar Boundaries**: Auto-detected via `getStoreCountry()`. India (IN) follows April 1 to March 31 (`04-01` to `03-31`); UAE (AE) and others follow January 1 to December 31 (`01-01` to `12-31`). Leap-year endings are handled cleanly.
- **Rollover & Counter Safety**: When transitioning into a new financial year, resetting the invoice sequence counter to 1 without changing the prefix would violate unique invoice constraints against previous fiscal years in the same shop. `generateSuggestedPrefix` constructs fiscal prefixes (e.g. `POS1-2627-` or `POS1-2026-`) ensuring counters restart from 001 without collision.
- **Audit Period Locking**: Prior financial years can be locked (`lockedYearIds`, `lockPriorYears`), preventing modifying, settling or deleting historical vouchers in closed audit periods. `isDateInLockedFiscalYear(dateStr, config, country)` checks document dates against locked boundaries.
- **Settings & Single Save**: `FinancialYearSettings.tsx` adheres to AGENTS.md Rule 18 via `useSettingsSectionSave`; toggle preferences stay in a draft until the header Save Changes action. The annual rollover wizard is an explicit operational action requiring confirmation via `ConfirmFinancialYearModal.tsx`.
- **UI Integration**: Filter presets (`This FY`, `Prev FY`) are integrated into `DateRangeFilter.tsx` and `FinancialReport.tsx`. Active status and navigation are surfaced in `FinancialYearDropup.tsx` in the status bar.
- Tests: `tests/unit/financialYear.test.ts`, `tests/unit/financialYearSettings.ui.test.tsx`.
