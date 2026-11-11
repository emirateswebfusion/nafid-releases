# NAFID POS — Bahrain NBR VAT & Audit Integration Architecture

## 1. Statutory Scope & Legal Framework

The Bahrain VAT subsystem in NAFID POS provides statutory-grade tax accounting, document generation, and return preparation compliant with:
- **Decree-Law No. (48) of 2018 on Value Added Tax** (Kingdom of Bahrain)
- **Executive Regulations of the Value Added Tax Law** issued under Decision No. (12) of 2018
- **NBR (National Bureau for Revenue) VAT Guides and Directives**

The subsystem operates in **Offline-First Mode**, generating statutory tax invoices, simplified tax invoices, thermal receipts, and aggregated data for the periodic Bahrain VAT Return.

---

## 2. Country Architecture: Bahrain (`BH`)

NAFID POS dynamically configures its financial and tax rules based on the store's profile:
- **Country Code:** `BH` (Bahrain)
- **Currency:** Bahraini Dinar (`BHD`), code `BHD`
- **Fractional Precision:** 3 decimal places (1 BHD = 1,000 fils)
- **Timezone:** `Asia/Bahrain` (GMT+3)
- **Tax Registration:** 15-digit **VAT Account Number** (رقم الحساب الضريبي)
- **Default VAT Rate:** Standard rate 10% (post-2022 amendment); zero-rated 0%; exempt
- **Barcode Prefix:** GS1 prefix `608`
- **Phone Prefix:** `+973`
- **Fiscal Calendar:** Calendar Year (January – December)
- **Statutory Authority:** National Bureau for Revenue (NBR)

---

## 3. Precision & Monetary Architecture

Bahraini Dinar is a 3-decimal currency. The architecture strictly enforces 3 decimals across all layers:

### 3.1 Client / Renderer Layer
- Form inputs for rates, prices, and amounts specify `step="any"` to prevent step validation errors on 3-decimal inputs.
- All formatted currency values pass through `moneyFixed(amount, decimals)` or `formatCurrency(amount)` from `src/utils/pricing/money.ts`.
- Float comparison tolerances are calibrated to `0.001` (1 fils) instead of `0.01`.
- Input validation sanitizes typed amounts via `sanitizeAmountInput` and parses via `parseAmount`.

### 3.2 Main Process / SQLite Data Layer
- SQLite stores amounts as numeric values; `roundStoreMoney(amount, country)` rounds to 3 decimals when `country === 'BH'`.
- Number formatting in reports and receipts queries `storeMoneyProfile()` / `storeMoneyDecimals()`.
- Customer credit balances, cash drawer calculations, and party ledger transactions use `roundStoreMoney`.

### 3.3 Server & Central Sync Layer
- Tenant PostgreSQL columns are widened to `NUMERIC(15, 3)` via migration `104_widen_money_columns_for_three_decimals.sql` across 22 entities (invoices, items, payments, ledger, purchase bills, returns, etc.).
- Central trial registration allows `BH` via migration `095_allow_bahrain_trial_accounts.sql`.

---

## 4. Invoice & Document Compliance (NBR Rules)

### 4.1 Document Titles
Under Bahrain NBR VAT Regulations:
- **Simplified Tax Invoice (فاتورة ضريبية مبسطة):**
  - Permitted for B2C retail transactions where total consideration is $\le 500\text{ BHD}$.
- **Tax Invoice (فاتورة ضريبية):**
  - Mandatory for all B2B transactions (customer has a registered VAT Account Number or business identity).
  - Mandatory for transactions where total consideration exceeds $500\text{ BHD}$.

### 4.2 Mandatory Invoicing Elements
1. **Seller Information:** Trade name, address, and 15-digit VAT Account Number.
2. **Document Metadata:** Distinct sequential invoice number, date of supply/issue.
3. **Item Details:** Description of goods/services, quantity, unit rate excluding VAT, applicable VAT rate (10% standard, 0% zero-rated, exempt), line VAT amount, line total.
4. **Totals:** Total taxable amount, total VAT charge, grand total payable in BHD.
5. **B2B / High-Value Additions (> 500 BHD):** Customer name, address, and customer VAT Account Number (if registered). Checkout enforces these fields before issuing a standard tax invoice.

### 4.3 Bilingual Receipts & Documentation
- Thermal receipts and A4 invoices support English and Arabic labels.
- For Bahrain stores (`store_country === 'BH'`), VAT labels dynamically resolve to:
  - English: `VAT Account No.` / Arabic: `رقم الحساب الضريبي`
  - Currency subtitle: `All amounts in BHD; rates exclude VAT`
  - Simplified Tax Invoice: `SIMPLIFIED TAX INVOICE` / `فاتورة ضريبية مبسطة`
  - Tax Invoice: `TAX INVOICE` / `فاتورة ضريبية`

---

## 5. Bahrain VAT Return Engine

### 5.1 Structure
The Bahrain VAT Return aggregates:
1. **Standard-Rated Sales (10%):** Total taxable sales supplies and output VAT collected.
2. **Sales to Registered Businesses in Other GCC States:** Intra-GCC supplies (if applicable).
3. **Zero-Rated Sales (0%):** Qualifying exports and domestic zero-rated supplies.
4. **Exempt Sales:** Supplies exempt from VAT.
5. **Standard-Rated Purchases (10%):** Verified supplier bills and recoverable input VAT ($10/110$ for tax-inclusive or $10\%$ net).
6. **Input Tax Adjustments:** Adjustments from purchase returns and debit/credit notes.
7. **Net Tax Payable or Reclaimable:** Total Output Tax minus Total Recoverable Input Tax.

### 5.2 UI Representation
- When `isVatStore()` is true and `country === 'BH'`, the VAT Return screen displays **"Bahrain NBR VAT Return & Audit"**.
- Unlike UAE Form VAT 201, Bahrain does not require an Emirate-by-Emirate geographical breakdown; Box 1 Emirates tabs are hidden for Bahrain stores.
- Direct quick links route to the return screen from both the Owner Dashboard card and navigation shortcuts.

---

## 6. Store Creation & Country Protection

- **Country Selection:** Bahrain (`BH`) is selectable during store initialization and Trial signup.
- **Data Protection Lock:** Once transactions, sales, ledger entries, or product prices are created, `saveStoreCountry` refuses country changes to protect ledger integrity and prevent corrupted currency conversions.
- **Zero Cross-Contamination:** All checks use partitioned helpers:
  - `isVatStore()` / `isVatCountry()` for shared VAT rules (single rate, inclusive/exclusive pricing, VAT invoice format).
  - `isUaeStore()` for UAE-specific rules (Emirates breakdown, Form VAT 201, FTA Audit File, UAE e-invoicing).
  - `isBahrainStore()` for Bahrain-specific rules (BHD 3 decimals, NBR 500 BHD threshold, VAT Account No.).
