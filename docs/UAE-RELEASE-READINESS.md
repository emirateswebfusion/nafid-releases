# UAE release readiness — 29 October 2026

Decision: **v2.2.0 release requested on 30 October 2026.** Automated release checks passed; physical printing and final visual installer checks remain unverified.

## Resolved blockers

1. **Inclusive quotation value changed on reopening.** UAE quotation lines now store a net unit rate.
   `pricing/quotationPrice.ts` uses stored taxable amount / quantity to recover older quotations that stored
   a gross rate, then restores the selling price using line-rounded VAT. Explicit zero rates survive loading.
   Automated coverage includes inclusive/exclusive basis, old rows, fractional quantities, discounts and fils.
   Real desktop test: saved CCZH-QTN-001 at net AED 100 / VAT AED 5 / total AED 105, reopened with unit price
   AED 105 and unchanged totals, resaved the same quotation, and confirmed history still shows AED 105.

2. **UAE receipt credits were displayed without reducing the payable total.**
   `pricing/receiptCredits.ts` applies scrap and return credits exactly once to the existing pre-credit print
   total. Both HTML and thermal use it. AED 105 minus AED 20 now prints AED 85. Regression tests cover
   initial/reprint input, combined credits, fils, excess-credit refunds and points discounts already included
   in grandTotal. Net-only reprint inputs without credit fields remain unchanged. Physical printing is untested.

3. **Quotation preview and defaults still exposed Indian tax wording.**
   UAE quotation preview, print and PDF now share one print-data builder and the UAE document generator.
   Real desktop preview shows TRN, AED 100 net unit price, VAT AED 5 and total AED 105 without Indian tax splits.
   Badges and default terms follow the shop profile and VAT price basis. Custom saved shop terms are preserved; the exact legacy built-in GST terms now resolve to the UAE default.

4. **Other default GST wording and alternate views.** Future UAE default tax invoice allocations use VAT-
   with the current counter and collision checks; historical identifiers and custom prefixes are preserved.
   Billing headers/tabs no longer invent GST- before UAE numbers. Print settings, stock report selectors,
   party forms and purchase/sales actions use VAT/TRN wording. UAE ERP rows use canonical checkout prices
   (inclusive AED 105 stays AED 105), and cashier details reuse the corrected VAT item table.
   Real ERP desktop check: header/tab VAT-002, TRN input, one unit net AED 100 / VAT AED 5 / gross AED 105;
   no Indian tax component columns. The synthetic cart was not checked out.

## Verification

- POS full verification passed: 103 test files / 658 tests, application and Electron type checks, and architecture guard.
- Lint ratchet passed with 0 errors / 0 warnings; production build passed (existing large-chunk warning).
- New regressions: `tests/unit/uaeReleaseBlockers.test.ts` and `uaeQuotationPreview.ui.test.tsx`, `uaeNumbering.characterization.test.ts`, and `uaeWording.ui.test.tsx`.
- Existing Indian checkout and print characterization snapshots pass without snapshot updates.
- Architecture docs describe the quotation rate basis and receipt credit contract. No new schema or bridge access.

## Still required before release

- IPC equivalence and statement checks; cloud/LAN characterization, including country and price-basis synchronization.
  The local Node SQLite runtime check fails because its native binding targets Electron ABI 146 while Node needs 137.
  Use a separate compatible harness runtime; do not replace the working desktop binding during UI testing.
- Physical printer checks on intended paper sizes, including credit deductions and reprints.
- Installer smoke test and final release-candidate checks.

## Previously observed working sale

An isolated desktop shop created an AED 105 inclusive product, billed quantity 2, showed net 200 / VAT 10 /
total 210, saved a pending invoice, displayed matching sales history, reopened the sale without changing its
total, and reduced stock from 10 to 8. TRN loading, AED input spacing and the UAE detail-view GST fallback
were fixed during that test. These observations do not prove all flows are release-ready.

No commit or release was made.

## Release candidate verification — 30 October 2026

- Version: 2.2.0. Full verify passed: 103 files / 668 tests, both type checks and architecture guard.
- Lint ratchet passed: 0 errors / 0 warnings. Windows NSIS installer and differential blockmap built successfully.
- Isolated Node runtime: 806 SQL statements prepared, 0 failures; production Electron native binding preserved.
- IPC comparison: 1,548 calls / 227 handlers. Seven intended closing-summary additions (`storeCountry: IN`); eight temporary-path differences in missing WhatsApp dependency errors. After explicitly reviewing these differences, zero remaining differences.
- Fresh v2.1.6 vs candidate cloud sync: 50 recorded entries, zero differences; signed-out sync: six entries, zero differences and no cloud requests. Existing golden files have drift from the released baseline; no snapshots were overwritten.
- LAN harness: open health endpoint, unauthorized/missing key rejected, valid and normalized keys accepted, connection test and sync succeed, pairing key preserved. This scenario did not transfer product rows and does not prove full catalog replication.
- Country and price-basis cloud synchronization covered by `storeProfileSync.test.ts`.
- User confirmed physical printer checks have not been performed. Visual packaged-app smoke test could not be completed because the desktop helper did not expose a targetable release window. Prior desktop UI observations above remain the available manual evidence.
