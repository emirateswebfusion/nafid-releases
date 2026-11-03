# NAFID POS — UAE VAT 201 & FTA Audit Integration Architecture

## 1. Executive Summary & Statutory Scope

The UAE VAT subsystem in NAFID POS provides an end-to-end, statutory-grade tax accounting and filing preparation engine compliant with:
- **Federal Decree-Law No. 8 of 2017 on Value Added Tax**
- **Cabinet Decision No. 52 of 2017 on the Executive Regulations**
- **Federal Decree-Law No. 7 of 2017 on Tax Procedures**

The subsystem operates autonomously in **Offline-First Mode**, generating official **Form VAT 201** statutory returns, the machine-readable **FTA Audit File (FAF)**, structured multi-sheet Excel audit workbooks, and managing the complete return filing lifecycle with manual EmaraTax portal acknowledgement tracking.

---

## 2. Dual Jurisdiction Architecture (UAE vs India)

NAFID POS dynamically adapts its statutory compliance engines based on the store's profile:
- **UAE Mode (`country === 'AE'`):**
  - Currency: UAE Dirham (`AED`)
  - Tax Registration: 15-digit Tax Registration Number (`TRN`)
  - Statutory Return: **Form VAT 201** + **FTA Audit File (FAF)**
  - Jurisdiction: UAE Federal Tax Authority (FTA) / EmaraTax
  - Dashboard: Direct navigation to `VatReportScreen`
- **India Mode (`country === 'IN'`):**
  - Currency: Indian Rupee (`INR`)
  - Tax Registration: 15-digit `GSTIN`
  - Statutory Return: **GSTR-1** & **GSTR-3B**
  - Jurisdiction: Goods and Services Tax Network (GSTN)
  - Dashboard: Direct navigation to `GstReportScreen`

Cross-jurisdiction redirects automatically route users to their store's statutory home if a route from the alternative jurisdiction is triggered.

---

## 3. Statutory Form VAT 201 Calculation Engine

### Section 1: Output Tax (Supplies & Adjustments)
- **Boxes 1a to 1g — Standard Rated Supplies (5%):**
  Mandatory geographic breakdown of taxable sales supplies and credit note adjustments across all 7 Emirates:
  - **Box 1a:** Abu Dhabi
  - **Box 1b:** Dubai
  - **Box 1c:** Sharjah
  - **Box 1d:** Ajman
  - **Box 1e:** Umm Al Quwain
  - **Box 1f:** Ras Al Khaimah
  - **Box 1g:** Fujairah
- **Adjustments Column:**
  Credit notes issued against sales returns deduct from the corresponding Emirate's output liability under the adjustments column.
- **Box 4 — Zero-Rated Supplies (0%):**
  Exports of goods/services outside the GCC implementing states and designated zero-rated supplies. Contributes to total turnover in Box 8 but incurs 0 VAT.
- **Box 5 — Exempt Supplies:**
  Supplies exempt from VAT (e.g. certain financial services, bare land, local passenger transport).
- **Box 8 — Total Output Tax:**
  Sum of taxable supplies and net output VAT due across Boxes 1 through 7.

### Section 2: Input Tax (Expenses & Purchases)
- **Box 9 — Standard Rated Expenses (5%):**
  Aggregates verified purchase bills from suppliers. Gross purchase amounts and recoverable VAT ($5/105$ for tax-inclusive purchases or $5\%$ net) are computed.
- **Box 11 — Total Recoverable Input Tax:**
  Total VAT deductible by the taxable person. Non-recoverable expenses (e.g. entertainment expenses, personal use vehicles) are flagged during audit.

### Section 3: Net VAT Due / Reclaimable
- **Box 12:** Total Output Tax Due (from Box 8).
- **Box 13:** Total Recoverable Input Tax (from Box 11).
- **Box 14:** **Net VAT Due = Box 12 − Box 13**:
  - `PAYABLE`: Net amount payable to the FTA via GIBAN / e-Dirham / card by the 28th of the subsequent month.
  - `RECLAIMABLE`: Net excess input VAT refundable or carried forward as a tax credit.
  - `NIL`: Total output equals total recoverable input tax.

---

## 4. Statutory Compliance & Validation Rules

- **TRN Validator (`trnValidator.ts`):**
  - Must be strictly 15 numeric digits.
  - Must begin with `100` (UAE country code prefix for tax registrants).
- **Full vs. Simplified Tax Invoice Rule:**
  - For taxable supplies $\ge \text{AED } 10,000$ to registered recipients, a **Full Tax Invoice** is legally required (recipient name, address, and valid 15-digit TRN).
  - Unregistered or B2C supplies $\ge \text{AED } 10,000$ are flagged as advisory compliance warnings.
- **Credit Note Validation:**
  - Credit notes without a valid reference to the original invoice number and date are flagged for audit reconciliation.
- **Record Retention Rule:**
  - Under Tax Procedures Law No. 7, all Tax Invoices, Credit Notes, Purchase Bills, and FAF exports must be retained for at least **5 years** (15 years for real estate).

---

## 5. Statutory Exporters

1. **FTA Audit File (FAF) (`ftaAuditFileExporter.ts`):**
   - Official tab-delimited (`ASCII 09`) format specified by the FTA.
   - Header metadata: Taxable Person Name (English & Arabic), TRN, Tax Agency Details, Audit Period.
   - Transaction sections:
     - `Supplier`: Supplier TRN, name, purchases total, input VAT.
     - `Customer`: Customer TRN, name, sales total, output VAT.
     - `GeneralLedger`: Opening, debits, credits, closing balance.
2. **Form VAT 201 Multi-Sheet Excel Workbook (`vat201ExcelExporter.ts`):**
   - Sheet 1: `VAT 201 Return` (Exact Form VAT 201 summary matching EmaraTax layout).
   - Sheet 2: `Sales Invoices` (Itemized invoice register).
   - Sheet 3: `Credit Notes` (Adjustments and original invoice links).
   - Sheet 4: `Purchase Bills` (Input tax register).
   - Sheet 5: `Compliance Audit` (Validation issues categorized by BLOCKING vs ADVISORY).
3. **VAT 201 JSON Payload (`vat201JsonSerializer.ts`):**
   - Machine-readable JSON export of all boxes, invoice lines, and metadata.

---

## 6. Local Filing Lifecycle & EmaraTax Guidance

### Local SQLite Database (`vat_local_filings`)
Migration `014-vat-local-filings.ts` establishes offline lifecycle tracking:
- `id`: UUID primary key
- `period`: Tax period key (e.g. `2026-Q3`, `2026-10`)
- `return_type`: `VAT201`
- `status`: `DRAFT` $\to$ `APPROVED` $\to$ `FILED`
- `filing_mode`: `EMARATAX_PORTAL`, `OFFLINE_FAF`, `OFFLINE_EXCEL`
- `acknowledgement_number`: Official FTA submission reference
- `filing_date`: Date submitted on EmaraTax
- `net_output_vat`, `recoverable_input_vat`, `net_vat_payable`, `net_vat_status`
- `summary_payload`: Complete JSON snapshot of the filed return
- `approved_by`, `approved_at`, `notes`

### EmaraTax Filing Guidance & One-Click Copy Helper
- Component: `VatFilingGuideTab.tsx`
- **Box-by-Box Copy Helper:** Instant clipboard copy buttons for Box 1a–1g (Amount & Adjustment), Box 4, Box 5, Box 9, etc., allowing cashiers/accountants to copy numbers into the EmaraTax portal (`eservices.tax.gov.ae`) without manual typing.
- **Filing Walkthrough:** Interactive 5-step guide covering UAE PASS login, Section 1 output entry, Section 2 input recovery, GIBAN wire transfer, and 5-year FAF archiving.

---

## 7. Data Access Layer & Layering Compliance

Following the NAFID architecture rules:
- **Statements:** `electron/db/statements/vatReports.ts` (prepared queries for sales, items, returns, purchases, local filings).
- **Services:**
  - `electron/services/vatReportService.ts`: Aggregation engine for Form VAT 201, Box lines, and compliance audit.
  - `electron/services/vatFilingService.ts`: Local filing persistence, approval, and manual acknowledgement recording.
- **IPC Handlers:** `electron/ipc/invoiceHandlers.ts`:
  - `db:getVatReport`
  - `db:getLocalVatFilings`
  - `db:upsertLocalVatFiling`
  - `db:recordLocalVatManualAck`
- **Preload:** `electron/preload.ts` exposes bridge methods safely.
- **Renderer API:** `src/data/vat.ts` (`vatApi.getVatReport`, `vatApi.getLocalVatFilings`, etc.).
- **UI:** `src/components/reports/VatReportScreen.tsx` and `src/components/reports/vat/*`.

---

## 8. Verification & Test Suite

- **TRN & Emirate Validator:** `tests/unit/trnValidator.test.ts` (15-digit rules, `100` prefix, Emirate normalization).
- **VAT Report Aggregator & Lifecycle:** `tests/unit/vatReportService.test.ts` (Boxes 1–14 math, simplified vs full classification, draft/approve/ack lifecycle).
- **JSON Serializer:** `tests/unit/vat201JsonSerializer.test.ts` (Structure and formatting integrity).
- **Dashboard Dual-Country Integration:** `tests/unit/vatDashboardCard.test.ts` (UAE vs India card switching).

---

## 9. Printed documents: titles and Arabic

**Titles** (`uaeDocumentTitle` in `src/utils/print/uaeLabels.ts`). Cabinet Decision No. 52 of 2017 requires the words
"Tax Invoice" on both the full tax invoice (Art. 59(1)) and the simplified tax invoice (Art. 59(2): recipient not
registered, or supply up to AED 10,000), and "Tax Credit Note" on credit notes (Art. 60). "Invoice" alone does not
satisfy this. Only a registrant (a shop with a TRN) can issue either. So, in UAE mode:

| Document | Shop has TRN | No TRN |
|---|---|---|
| VAT sale (`GST`, B2B, or VAT charged), B2B or B2C | `TAX INVOICE / فاتورة ضريبية` | `INVOICE / فاتورة` |
| Zero-VAT bill of supply | `INVOICE / فاتورة` | `INVOICE / فاتورة` |
| Return / credit note | `TAX CREDIT NOTE / إشعار دائن ضريبي` | `CREDIT NOTE / إشعار دائن` |

Verify the article numbering against the FTA's current consolidated text (the regulation was amended in 2024/2025).
Arabic is not legally required on the invoice (English records are accepted; the FTA may ask for a translation); it is
printed because customers expect it.

**Labels.** Every English/Arabic label pair lives in `UAE_LABELS` (`uaeLabels.ts`); A4/half-A4/PDF, purchase bills,
quotations (and their preview iframe), thermal receipts and the WhatsApp bill text all read it. HTML pairs render the
Arabic half as `<span class="ar" dir="rtl" lang="ar">` with an Arabic-capable font stack (`UAE_ARABIC_CSS`).

**Setting `uae_arabic_print`** (`{ documents, thermal }`, default `{ true, false }`; Settings → Bill Content, UAE only,
saved straight away through `src/data/settings.ts`; loaded by `useStoreProfile`). The key is not in the settings pull
allowlist, so it stays per terminal.

**Thermal findings (code review, not proven on hardware).**
- USB / driver printers (`hardware:printReceipt` → `printReceiptUSB`) render the receipt text as HTML in Chromium and
  print a raster through the Windows driver, so Arabic glyphs are shaped and printed like any other text (Consolas has
  no Arabic; Chromium falls back to Segoe UI / Tahoma). The row-fitting script shrinks the font if a line overflows.
- Network ESC/POS printers (`config.type === 'network'`) receive ASCII bytes; generic printers have no Arabic code page
  or shaping. `sanitizeForEscPos` now drops the Arabic half (`Subtotal / المجموع الفرعي: …` → `Subtotal: …`) instead
  of printing `????`.
- On 58 mm paper the bilingual lines wrap heavily. Arabic on thermal therefore stays off until a shop's printer has
  been test-printed.
