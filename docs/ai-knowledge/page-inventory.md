# Nafid POS — Complete Page Inventory & Route Map

**Application:** Nafid POS (Desktop Hybrid Electron-React Application)  
**Verification Method:** Static Code Analysis of `src/App.tsx`, `src/components/app/PrintRouter.tsx`, `src/config/featureFlags.ts`, `src/utils/security/permissions.ts`, `electron/main.ts`, `electron/preload.ts`, and all underlying React components.  
**Version:** 2.0.1  
**Audit Date:** October 2026  

---

## 1. Page Counting Methodology & Architecture

In Nafid POS, the user interface follows a single-page hybrid desktop model with two primary routing paradigms:
1. **Hash Routes (`#/print-*`)**: Dedicated standalone browser/Electron windows for hardware rendering (thermal receipts, barcodes, bulk labels, A4 printouts) routed by `PrintRouter.tsx` or top-level URL hash detection in `App.tsx`.
2. **Conditional State-Driven Workspace Overlays**: Full-screen workspace views mounted inside `App.tsx` on top of or replacing the Store Owner Dashboard, gated by `useAuthStore` credentials, `useFeatureFlagsStore` flags, and `<PermissionGuard>` permission checks.

### Classification Rules

| Classification Category | Definition | Count |
| :--- | :--- | :--- |
| **Top-Level Screen Pages** | Distinct, full-screen primary workspaces that can serve as the focal interface for user operations (Dashboard, Billing, Managers, Portals). | **22** |
| **Dedicated Print Views** | Distinct hash-routed hardware layout screens rendered in isolated windows for physical document generation. | **4** |
| **Authentication & Shell Pages** | System lifecycle entrypoints (Login, Splash, Super Admin tenant portal). | **3** |
| **Sub-Pages / Tab Modules** | Sub-workspaces embedded inside parent pages (e.g., Settings 10 sections, Staff 5 tabs, Scrap 7 subviews, Party 4 views). | **31** |
| **Operational Dialogs & Drawers** | Contextual modal forms or flyout drawers that do not displace the page context. | **28** |
| **Reusable UI Components** | Atomic building blocks (`Button`, `Input`, `Select`, `Modal`, `CustomDialog`, `FloatToast`, etc.). | **12** |

> **Total Unique Pages Discovered:** **29 unique pages/views** (22 Top-Level Screens + 4 Dedicated Print Views + 3 Authentication/Shell Views).

---

## 2. Complete Inventory of Discovered Pages

### A. Authentication & Core Shell Views

#### 1. Splash Screen
- **Route / Trigger:** Default startup view when `isLoading === true` in `useAuthStore`.
- **Source Component:** [`src/components/app/SplashScreen.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/app/SplashScreen.tsx)
- **Parent Module:** Application Root / Bootstrapper
- **Navigation Location:** Auto-rendered on startup while checking local token / offline session.
- **Roles & Permissions:** Public / Unauthenticated.
- **Enablement Requirements:** Always active.
- **Main UI Actions:** Shows animated logo, system loading indicator.
- **Related Components:** None.
- **States:** Loading only.
- **Status:** **Active** (VERIFIED).

#### 2. Login Screen
- **Route / Trigger:** Rendered when `!isAuthenticated && !isLoading`.
- **Source Component:** [`src/components/auth/LoginScreen.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/auth/LoginScreen.tsx)
- **Parent Module:** Authentication
- **Navigation Location:** Root entrypoint.
- **Roles & Permissions:** Unauthenticated users.
- **Enablement Requirements:** Always active.
- **Main UI Actions:** 
  - Tenant ID input / Cloud Auth Login
  - Offline staff selector and 4-digit PIN authentication
  - Password-based login fallback
  - Deep-link auth callback listener (`onDeepLink`)
- **Related Components:** `Input`, `Button`, `FloatToast`.
- **States:** Idle, Authenticating / Loading, Invalid PIN / Error, Offline fallback mode.
- **Status:** **Active** (VERIFIED).

#### 3. Super Dashboard (Super Admin Portal)
- **Route / Trigger:** Rendered when `isAuthenticated && role === 'SUPER_ADMIN'`.
- **Source Component:** [`src/components/super-dashboard/SuperDashboard.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/super-dashboard/SuperDashboard.tsx)
- **Parent Module:** Super Admin Cloud Administration
- **Navigation Location:** Exclusive root screen for Super Admins.
- **Roles & Permissions:** `SUPER_ADMIN` only.
- **Enablement Requirements:** Multi-tenant cloud backend enabled.
- **Main UI Actions:**
  - Create new tenant store with Neon PostgreSQL database provisioning
  - Tenant list search, filter by domain (GENERAL, PHARMACY, RESTAURANT), sorting
  - Test tenant DB connection health (`checkConnectionHealth`)
  - Reveal/copy unmasked DB credentials after 2FA code verification
  - Cloud access window scheduling and manual override (`AUTO`, `FORCE_ON`, `FORCE_OFF`)
  - Tenant database provision logs viewer
- **Related Components:** `RedCrossButton`, `Modal`, `Input`, `Select`.
- **States:** Loading tenants, Provisioning in-progress, Connection health checking, Error alert.
- **Status:** **Active** (VERIFIED).

---

### B. Core Operational Pages

#### 4. Owner Dashboard
- **Route / Trigger:** Default landing view for authenticated users when `restrictedActivePage !== 'BILLING'` and no manager overlay is active.
- **Source Component:** [`src/components/owner-dashboard/OwnerDashboard.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/owner-dashboard/OwnerDashboard.tsx)
- **Parent Module:** System Shell / Navigation Hub
- **Navigation Location:** Home screen.
- **Roles & Permissions:** Accessible to all store roles (`OWNER`, `ADMIN`, `BILLER`, `CASHIER`, `STAFF`); tiles dynamically filtered by `hasPermission`.
- **Enablement Requirements:** Always active.
- **Main UI Actions:**
  - 19 interactive module launch cards (Billing [F1], Cashier Settlement, Inventory, E-Commerce, AI Assistant, Categories/Grades, Pricing Tiers, Financial Report, Stock Report, Quotations, Purchase Bills, Warranties, Returns, Scrap, Ledger, Payments, Customers, Staff, Sales History)
  - Today's live sales amount & invoice count pill
  - Online / LAN / Cloud sync status indicator pill (triggers `SessionExpiredModal` if session expired)
  - 2-Column vs. 3-Column layout toggle
  - Light/Dark theme toggle
  - Store profile & Logout menu
  - Digital store clock ([`DigitalClock.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/owner-dashboard/DigitalClock.tsx))
- **Related Components:** `Card`, `DigitalClock`, `UpdateBanner`, `SessionExpiredModal`.
- **States:** Loading stats, Real-time sync progress banner, Empty state ("No Modules Assigned" if permissions empty).
- **Status:** **Active** (VERIFIED).

#### 5. POS Billing Page
- **Route / Trigger:** Event `open-billing-page` or keyboard shortcut `F1` (`restrictedActivePage === 'BILLING'`).
- **Source Component:** [`src/components/billing/BillingPage.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/billing/BillingPage.tsx)
- **Parent Module:** Sales & Checkout
- **Navigation Location:** Main billing engine.
- **Roles & Permissions:** `sales.create` (or `sales.create_gst`, `sales.create_estimate`). Admin/Owner bypasses checks.
- **Enablement Requirements:** Feature Flag `billing: true`.
- **Main UI Actions:**
  - Multi-tab checkout bar ([`BillingTabBar.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/billing/BillingTabBar.tsx)) supporting up to 10 independent active carts
  - Live product search by Barcode / Item Code / Name / Category with scanner burst suppression
  - Live electronic weighing scale USB/Serial sync ([`scaleStore.ts`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/store/scaleStore.ts))
  - Quantity, rate override (`sales.edit_price`), discount (`sales.discount`)
  - Invoice Type toggle: GST Tax Invoice vs. Non-GST / Bill of Supply
  - Pricing tier selection dropdown (Wholesale, Retail, VIP)
  - Customer selection with instant credit limit check and overdue warning banner
  - Sales Staff / Customer Handler attribution
  - Split Payment calculation modal
  - Transport & vehicle details modal (e-Way bill fields)
  - Loyalty points redemption drawer
  - Scrap deduction against sale (`scrapDeduction`)
  - Return credit deduction against sale (`returnDeduction`)
  - Hold current bill / Recall held bill drawer
  - Express Cash Register till drawer flyout (`showCashRegister`)
  - Checkout & Instant Thermal Print / A4 Invoice / WhatsApp send
  - Biller 4-digit PIN verification modal on print ([`BillerPinModal.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/billing/BillerPinModal.tsx))
- **Related Components:** `BillingTabBar`, `BillerPinModal`, `Modal`, `Select`, `Skeleton`, `Barcode`.
- **States:** Empty cart, Active cart, Holding bill, Checkout processing, Printer error fallback dialog, Quotation conversion mode, Return refund mode, Scrap purchase mode, Edit invoice mode.
- **Status:** **Active** (VERIFIED).

#### 6. Sales History & Invoicing Archive
- **Route / Trigger:** Event `open-sales-history` (`showSalesHistory === true`).
- **Source Component:** [`src/components/sales/SalesHistory.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/sales/SalesHistory.tsx)
- **Parent Module:** Sales Management & Reporting
- **Navigation Location:** Dashboard tile or Billing Header quick action.
- **Roles & Permissions:** `sales.view` (or `sales.view_gst`, `sales.view_estimate`).
- **Enablement Requirements:** Feature Flag `sales_history: true`.
- **Main UI Actions:**
  - Transaction search by invoice number, customer name, phone, item name
  - Advanced date range filtering ([`DateRangeFilter.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/ui/DateRangeFilter.tsx))
  - Filter by Invoice Type (All, GST Invoices, Non-GST / Bill of Supply)
  - Filter by Payment Method (Cash, Card, UPI, Cheque, Credit, Split, Pending)
  - Hourly and daily sales revenue trend charts (`Recharts`)
  - View full bill details modal with item breakdown, tax split, payment breakdown
  - Thermal receipt reprinting
  - A4 invoice generation and PDF export
  - Direct WhatsApp invoice delivery
  - Edit invoice (transfers bill snapshot into active billing tab)
  - Delete invoice with automatic stock restoration, party ledger reversal, and cashier audit logging (`sales.delete`)
  - Convert Non-GST Bill of Supply into GST Tax Invoice
  - Update payment method for settled or pending invoices
- **Related Components:** `DateRangeFilter`, `Modal`, `Select`, `Input`, `Skeleton`.
- **States:** Loading skeleton, Empty search results, Processing reprint/PDF, Delete confirmation modal.
- **Status:** **Active** (VERIFIED).

#### 7. Inventory Manager
- **Route / Trigger:** Event `open-inventory-manager` (`showInventoryManager === true`).
- **Source Component:** [`src/components/inventory/InventoryManager.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/inventory/InventoryManager.tsx)
- **Parent Module:** Products & Catalog
- **Navigation Location:** Dashboard tile or Billing Header quick action.
- **Roles & Permissions:** `products.view` (create: `products.create`, edit: `products.edit`, delete: `products.delete`, stock: `products.stock_adjust`).
- **Enablement Requirements:** Feature Flag `inventory: true`.
- **Main UI Actions:**
  - Product catalog table with pagination, search, category filter, low stock filter
  - Create single product (SKU, barcode, HSN, base price, tax %, purchase price, grade, domain attributes)
  - Edit product details, update prices, override GST flag
  - Adjust physical stock quantity / piece count
  - Print single barcode label / print bulk barcode queue
  - CSV & Excel bulk inventory data upload modal ([`DataUploadModal.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/data-upload/DataUploadModal.tsx))
  - Quick supplier create modal
  - Bulk product deletion modal
  - Service item creation
- **Related Components:** `DataUploadModal`, `Modal`, `Select`, `Input`, `Skeleton`.
- **States:** Loading products, Empty catalog, Bulk importing, Barcode printing.
- **Status:** **Active** (VERIFIED).

#### 8. Cashier Settlement & Register Drawer
- **Route / Trigger:** Event `open-cashier-settlement` (`showCashierSettlement === true`).
- **Source Component:** [`src/components/cashier/CashierSettlement.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/cashier/CashierSettlement.tsx)
- **Parent Module:** Cash Register & Settlement
- **Navigation Location:** Dashboard tile or Billing Header quick action.
- **Roles & Permissions:** `cash_register.view` (settle: `cash_register.settlement`, cash in/out: `cash_register.cash_in`, `cash_register.cash_out`, close: `cash_register.close`).
- **Enablement Requirements:** Feature Flag `cash_settlement: true` (or `cash_register: true`).
- **Main UI Actions:**
  - View current register session opening balance, cash sales, cash-in, cash-out/expenses, expected cash drawer balance
  - Set opening cash balance for the day
  - Record Cash In / Deposit transaction
  - Record Cash Out / Store Expense transaction with category and notes
  - Pending Bills list: settle pending bills to Cash, Card, UPI, Bank Transfer, Cheque, Split, or Credit
  - Split payment settlement modal
  - Day-end register closing with actual physical cash count and over/short variance calculation
  - Reopen closed register (Owner/Admin only)
  - Delete register transaction (Owner/Admin only)
  - Cashier audit trail log inspection
- **Related Components:** `Modal`, `CustomDialog`, `FloatToast`, `Select`, `Skeleton`.
- **States:** Register closed state, Register open state, Pending bills empty, Shift settlement modal, Reopen confirmation modal.
- **Status:** **Active** (VERIFIED).

#### 9. Customers Directory & Loyalty
- **Route / Trigger:** Event `open-customers-page` (`showCustomersPage === true`).
- **Source Component:** [`src/components/customers/CustomersPage.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/customers/CustomersPage.tsx)
- **Parent Module:** CRM & Loyalty
- **Navigation Location:** Dashboard tile.
- **Roles & Permissions:** `customers.view` (create: `customers.create`, edit: `customers.edit`, delete: `customers.delete`).
- **Enablement Requirements:** Feature Flag `customers: true`.
- **Main UI Actions:**
  - Customer directory with search by name/phone, filtering by credit status, overdue status, pricing tier
  - Customer profile drawer: view contact info, default pricing tier, party balance, credit limit
  - Purchase History tab: list of all past bills with modal invoice inspection and receipt reprint
  - Loyalty Points tab: lifetime earned, redeemed, current point balance, transaction ledger
  - Add / Adjust loyalty points modal
  - Create new customer modal
  - Edit customer profile modal
  - Delete customer confirmation modal
  - One-click navigation to linked Party Ledger (`onOpenParty`)
- **Related Components:** `Modal`, `DateRangeFilter`, `FloatToast`, `Skeleton`.
- **States:** Loading customers, Empty customer list, Customer detail drawer active, Adjust points modal.
- **Status:** **Active** (VERIFIED).

#### 10. Party / Customer / Supplier Ledger
- **Route / Trigger:** Event `open-parties-manager` (`showPartyManager === true`).
- **Source Component:** [`src/components/party/PartyManager.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/party/PartyManager.tsx)
- **Parent Module:** Financial Accounting & Credit Ledger
- **Navigation Location:** Dashboard tile.
- **Roles & Permissions:** `customers.view` (ledger: `customers.ledger`, edit: `customers.edit`).
- **Enablement Requirements:** Feature Flag `parties: true`.
- **Main UI Actions:**
  - 4 sub-views: `list` (parties overview), `ledger` (statement), `party_form` (add/edit party), `tx_form` (post transaction)
  - Search by name, phone, filter by party type (ALL, CUSTOMER, SUPPLIER, STAFF, CUSTOM, Overdue)
  - Summary metrics: Total Receivables (from customers), Total Payables (to suppliers), Net Balance
  - Create / Edit party with Credit Limit, Credit Period Days, Overdue restriction toggle
  - Post ledger transaction (Payment In, Payment Out, Adjustment) with payment mode and reference number
  - View detailed party statement with running balance, date filter, separate GST vs. Estimate balance tracking
  - Export party ledger statement to PDF or print statement
  - Share account statement via WhatsApp message
  - Merge two duplicate parties into one (`dbMergeParties`)
  - Bulk import parties from CSV/Excel via `DataUploadModal`
- **Related Components:** `DataUploadModal`, `DateRangeFilter`, `Modal`, `Select`, `FloatToast`, `Skeleton`.
- **States:** Loading ledger, Empty party directory, Statement view active, Add transaction form active.
- **Status:** **Active** (VERIFIED).

#### 11. Purchase Bills & Supplier Invoices
- **Route / Trigger:** Event `open-purchase-bills` (`showPurchaseBillManager === true`).
- **Source Component:** [`src/components/purchase/PurchaseBillManager.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/purchase/PurchaseBillManager.tsx)
- **Parent Module:** Purchases & Inventory Inward
- **Navigation Location:** Dashboard tile.
- **Roles & Permissions:** `purchases.view` (create: `purchases.create`, edit: `purchases.edit`, delete: `purchases.delete`).
- **Enablement Requirements:** Feature Flag `purchase_bills: true`.
- **Main UI Actions:**
  - Purchase bill list with search, supplier filter, date range filter
  - Create new purchase bill: supplier selection, bill date, bill number, bill type (GST vs. Estimate)
  - Inward line items table: product selection, quantity, purchase price, GST rate, HSN code
  - Automatic inventory stock increment upon saving purchase bill
  - Automatic supplier ledger credit update upon purchase recording
  - View purchase bill details modal
  - Edit purchase bill (recalculates inventory stock and ledger adjustments)
  - Delete purchase bill with stock reduction and ledger reversal
  - Print / Export A4 purchase bill document
- **Related Components:** `DateRangeFilter`, `Modal`, `Select`, `Input`, `Skeleton`.
- **States:** Loading bills, Empty purchase list, Create bill form active, View modal active.
- **Status:** **Active** (VERIFIED).

#### 12. Quotations & Proforma Invoices
- **Route / Trigger:** Event `open-quotation-manager` (`showQuotationManager === true`).
- **Source Component:** [`src/components/quotation/QuotationManager.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/quotation/QuotationManager.tsx)
- **Parent Module:** Sales & Pre-Invoicing
- **Navigation Location:** Dashboard tile.
- **Roles & Permissions:** `quotations.view` (create: `quotations.create`, edit: `quotations.edit`, delete: `quotations.delete`).
- **Enablement Requirements:** Feature Flag `quotations: true`.
- **Main UI Actions:**
  - Quotation list with search by quote number, customer name, phone
  - Launch "New Quote" workflow in POS Billing page (`open-new-quotation`)
  - View quotation A4 preview modal
  - Print quotation or export A4 PDF
  - Convert quotation to active POS invoice
  - Edit quotation (loads quotation snapshot back into billing cart)
  - Delete quotation confirmation modal
- **Related Components:** `Modal`, `RedCrossButton`.
- **States:** Loading quotations, Empty quote list, Quotation preview modal.
- **Status:** **Active** (VERIFIED).

#### 13. Returns & Refunds Manager
- **Route / Trigger:** Event `open-returns-manager` (`showReturnManager === true`).
- **Source Component:** [`src/components/returns/ReturnManager.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/returns/ReturnManager.tsx)
- **Parent Module:** Sales & Customer Returns
- **Navigation Location:** Dashboard tile.
- **Roles & Permissions:** `sales.refund`.
- **Enablement Requirements:** Feature Flag `returns: true`.
- **Main UI Actions:**
  - Processed returns directory with search by return number, original bill number, customer
  - Launch "New Return" mode in POS Billing page (`open-return-mode`)
  - View return bill items modal
  - Thermal receipt reprinting for return voucher
  - Delete return voucher with stock reversal confirmation
- **Related Components:** `Modal`, `FloatToast`, `Skeleton`.
- **States:** Loading returns, Empty returns list, Return details modal.
- **Status:** **Active** (VERIFIED).

#### 14. Scrap Management & Trading
- **Route / Trigger:** Event `open-scrap-manager` (`showScrapManager === true`).
- **Source Component:** [`src/components/scrap/ScrapManager.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/scrap/ScrapManager.tsx)
- **Parent Module:** Scrap & Salvage Operations
- **Navigation Location:** Dashboard tile.
- **Roles & Permissions:** `scrap.view` (create: `scrap.create`, edit: `scrap.edit`, delete: `scrap.delete`).
- **Enablement Requirements:** Feature Flag `scrap: true` AND Setting `enable_scrap: true`.
- **Main UI Actions:**
  - 7 sub-views: `list` (categories/stock), `category_form` (add/edit category), `transaction` (buy scrap), `tx_form`, `selling` (liquidate scrap), `invoices` (scrap invoices list), `invoice_detail` (scrap bill inspection)
  - Buy-in scrap materials from customer or market with weight and unit rate
  - Auto-generate scrap invoice with thermal slip printing
  - Deduct scrap purchase value directly from customer's sales bill in POS
  - Scrap inventory tracking (metal, batteries, waste paper, plastic)
  - Scrap sales / liquidation to recyclers with profit/loss calculation
  - Delete scrap invoice with party ledger reversal
- **Related Components:** `DateRangeFilter`, `Modal`, `Select`, `FloatToast`, `Skeleton`.
- **States:** Loading scrap data, Category form view, Invoice detail modal, Delete confirmation.
- **Status:** **Active** (VERIFIED).

#### 15. Warranty Certificates & Claims
- **Route / Trigger:** Event `open-warranty-manager` (`showWarrantyManager === true`).
- **Source Component:** [`src/components/warranty/WarrantyManager.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/warranty/WarrantyManager.tsx)
- **Parent Module:** Customer Service & Warranties
- **Navigation Location:** Dashboard tile.
- **Roles & Permissions:** `warranties.view` (create: `warranties.create`, edit: `warranties.edit`, delete: `warranties.delete`).
- **Enablement Requirements:** Feature Flag `warranties: true`.
- **Main UI Actions:**
  - Registered product warranty directory with customer search and expiry status
  - Register new warranty certificate (customer name, phone, product name, serial number, purchase date, warranty period days, auto-calculated expiry date)
  - View warranty certificate details modal
  - Print formal warranty certificate
  - Delete warranty record
- **Related Components:** `Modal`, `FloatToast`, `Skeleton`.
- **States:** Loading warranties, Empty list, Create warranty modal, View certificate modal.
- **Status:** **Active** (VERIFIED).

#### 16. Financial Analytics & P&L Report
- **Route / Trigger:** Event `open-financial-report` (`showFinancialReport === true`).
- **Source Component:** [`src/components/reports/FinancialReport.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/reports/FinancialReport.tsx)
- **Parent Module:** Reporting & Financial Intelligence
- **Navigation Location:** Dashboard tile.
- **Roles & Permissions:** `reports.financial`.
- **Enablement Requirements:** Always available for authorized accounting roles.
- **Main UI Actions:**
  - Date preset selector: Today, Yesterday, This Week, This Month, This Quarter, Custom Range
  - High-level KPIs: Gross Sales, Discounts, Net Sales, Tax Collected, Invoices Count, COGS, Gross Profit, Gross Margin %
  - Scrap revenue, Purchase expenses, Cash-out drawer expenses, Net Profit
  - Payment method distribution chart (Cash, Card, UPI, Bank, Cheque, Credit)
  - Daily sales, profit, and tax area trend chart (`Recharts`)
  - Export financial summary to Excel / CSV
  - Print financial report
- **Related Components:** None (standalone modal dashboard).
- **States:** Loading financial metrics, Error fetching data, Chart rendering.
- **Status:** **Active** (VERIFIED).

#### 17. Stock Valuation & Inventory Audit Report
- **Route / Trigger:** Event `open-stock-report` (`showStockReport === true`).
- **Source Component:** [`src/components/stock-report/StockReport.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/stock-report/StockReport.tsx)
- **Parent Module:** Reporting & Stock Valuation
- **Navigation Location:** Dashboard tile.
- **Roles & Permissions:** `reports.view`.
- **Enablement Requirements:** Feature Flag `stock_report: true`.
- **Main UI Actions:**
  - Comprehensive stock table with product name, SKU, category, current stock, piece count, purchase price, selling rate, valuation
  - Breakdown of quantities billed under GST Tax Invoice vs. Non-GST Estimate
  - Paper Stock tracking for GST audit compliance
  - Category and low-stock filter
  - Total inventory valuation calculation at cost price and at retail price
  - Print A4 stock audit report
  - Export stock report to PDF
- **Related Components:** `Skeleton`.
- **States:** Loading stock records, Empty report, Filtered report.
- **Status:** **Active** (VERIFIED).

#### 18. Combo Offers & Product Bundles
- **Route / Trigger:** Event `open-combo-manager` (`showComboManager === true`).
- **Source Component:** [`src/components/combo/ComboManager.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/combo/ComboManager.tsx)
- **Parent Module:** Pricing & Marketing
- **Navigation Location:** Dashboard tile.
- **Roles & Permissions:** `combos.view` (manage: `combos.manage`).
- **Enablement Requirements:** Feature Flag `combo_offers: true`.
- **Main UI Actions:**
  - Active and inactive combo bundles list with search
  - Create new combo bundle: bundle name, custom barcode, special combo price, description
  - Add products to bundle with individual quantities and effective discount calculations
  - Toggle combo bundle active / inactive status
  - Edit combo bundle products and price
  - Delete combo bundle
- **Related Components:** `Modal`, `RedCrossButton`.
- **States:** Loading combos, Empty combos list, Create/Edit modal active.
- **Status:** **Active** (VERIFIED).

#### 19. Dynamic Pricing Tiers
- **Route / Trigger:** Event `open-settings-pricing-tiers` (`showSettingsPricingTiers === true`).
- **Source Component:** [`src/components/pricing-tiers/PricingTiers.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/pricing-tiers/PricingTiers.tsx)
- **Parent Module:** Pricing & Tiers
- **Navigation Location:** Dashboard tile.
- **Roles & Permissions:** `combos.view` (manage: `combos.manage`).
- **Enablement Requirements:** Feature Flag `pricing_tiers: true`.
- **Main UI Actions:**
  - Create custom pricing tiers (Retail, Wholesale, Distributor, VIP, Bulk)
  - Reorder pricing tiers with drag & drop sorting
  - Set default pricing tier for the store
  - Memoized 60FPS Product Pricing Matrix: inline grid for configuring per-tier prices across all products
  - Search products within pricing matrix
  - Delete pricing tier (with fallback to default tier)
- **Related Components:** `Skeleton`.
- **States:** Loading tiers, Empty matrix, Saving row price in progress.
- **Status:** **Active** (VERIFIED).

#### 20. Categories & Product Grades
- **Route / Trigger:** Event `open-settings-grades` (`showSettingsGrades === true`).
- **Source Component:** [`src/components/settings-grades/SettingsGrades.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/settings-grades/SettingsGrades.tsx)
- **Parent Module:** Products & Catalog Settings
- **Navigation Location:** Dashboard tile.
- **Roles & Permissions:** `products.view` (edit: `products.edit`).
- **Enablement Requirements:** Feature Flag `categories_grades: true`.
- **Main UI Actions:**
  - Category list and product grades matrix
  - Add new grade rule for a category: grade name, selling rate per unit, purchase price, offer price
  - Inline editing of grade rates
  - Rename category across all associated products
  - Delete grade or entire category (with confirmation)
- **Related Components:** `Modal`, `FloatToast`, `Skeleton`, `Badge`, `Button`.
- **States:** Loading grades, Category filter active, Add grade modal, Delete confirmation modal.
- **Status:** **Active** (VERIFIED).

#### 21. Payment Methods & Financial Accounts
- **Route / Trigger:** Event `open-payments-page` (`showPaymentsPage === true`).
- **Source Component:** [`src/components/payment-methods/PaymentMethods.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/payment-methods/PaymentMethods.tsx)
- **Parent Module:** Financial Settings & Banking
- **Navigation Location:** Dashboard tile.
- **Roles & Permissions:** `settings.view` (edit: `settings.edit`).
- **Enablement Requirements:** Feature Flag `payments: true`.
- **Main UI Actions:**
  - 3 sub-views: `list` (payment sources), `form` (add/edit source), `transactions` (source transaction ledger)
  - Configure Bank Accounts, Card POS Terminals, and UPI IDs
  - Set default payment account for store receipt QR code
  - Record manual Cash In / Cash Out deposits to bank/card accounts
  - View running balance and transaction statement for each payment source
  - Enable / Disable payment source
  - Delete payment source
- **Related Components:** `Modal`, `FloatToast`, `Skeleton`, `Input`, `Select`.
- **States:** Loading sources, Empty sources list, Add source form, Source ledger active.
- **Status:** **Active** (VERIFIED).

#### 22. Staff Administration & Access Control
- **Route / Trigger:** Event `open-staff-manager` (`showStaffManager === true`).
- **Source Component:** [`src/components/staff/StaffManager.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/staff/StaffManager.tsx)
- **Parent Module:** User & Access Management
- **Navigation Location:** Dashboard tile.
- **Roles & Permissions:** `users.view` (create: `users.create`, edit: `users.edit`, delete: `users.delete`, permissions: `users.permissions`).
- **Enablement Requirements:** Feature Flag `staff: true`.
- **Main UI Actions:**
  - 5 tab workspaces:
    1. `directory`: Staff directory, add/edit staff, designation, phone, joining date, monthly salary
    2. `salary`: Monthly salary book, salary slips, WhatsApp salary slip sharing
    3. `payments`: Record staff salary payments and advances
    4. `ledger`: Individual staff ledger statement
    5. `attendance`: Daily staff attendance tracker (Present, Absent, Half Day, Leave) — gated by `staff_attendance` flag
  - Staff login credential creation (link staff to email/password login account)
  - Set 4-digit biller security PIN (`has_pin`, used in billing verification)
  - Comprehensive Granular Permission Matrix ([`PermissionSelector.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/staff/PermissionSelector.tsx)) across 12 permission groups
  - Enable / disable staff login access
- **Related Components:** `PermissionSelector`, `Modal`, `DataUploadModal`, `FloatToast`, `Skeleton`.
- **States:** Loading staff, Staff edit modal, Permission editor active, Salary payment modal.
- **Status:** **Active** (VERIFIED).

#### 23. System Settings Suite
- **Route / Trigger:** Event `open-settings-manager` (`showSettingsManager === true`).
- **Source Component:** [`src/components/settings/SettingsManager.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/settings/SettingsManager.tsx)
- **Parent Module:** System Configuration
- **Navigation Location:** Dashboard header settings gear icon or UpdateBanner.
- **Roles & Permissions:** `settings.view` (general: `settings.edit`, business: `settings.business`, ownerOnly tabs require `OWNER` or `ADMIN`).
- **Enablement Requirements:** Always available.
- **Main UI Actions:**
  - 10 distinct configuration sections:
    1. `store`: Store Profile (Shop name, address, phone, email, GSTIN, State, invoice sequence counters)
    2. `hardware`: Devices & Hardware (Thermal printer selection, paper width [58mm/80mm], ESC/POS commands, USB Weighing scale COM port and baud rate)
    3. `whatsapp`: WhatsApp Integration via Baileys ([`WhatsAppSettings.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/whatsapp/WhatsAppSettings.tsx), QR code pairing, connection status)
    4. `products`: Products & Coding (Barcode prefix, label type [barcode/QR], bulk product onboarding sheet via [`BulkOnboardingSheet.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/settings/BulkOnboardingSheet.tsx))
    5. `printing`: Print Templates (Thermal receipt template editor, A4 invoice template editor, live preview modal via [`PaperPreviewModal.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/settings/PaperPreviewModal.tsx))
    6. `print_options`: Bill & Print Options (Auto-print on checkout, number of copies, 12h/24h time format, receipt footer terms)
    7. `terminology`: Ledger Terminology Customizer ([`LedgerTerminologySettings.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/settings/LedgerTerminologySettings.tsx))
    8. `billing_ui`: Billing Page Customizer ([`BillingUICustomizer.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/billing-ui-customizer/BillingUICustomizer.tsx), visible header action buttons, entry flow presets)
    9. `system`: App Preferences (Store timezone, light/dark theme, manual cloud sync trigger, check for app updates)
    10. `network`: Network & Sync Mode (Cloud-only, LAN-only, Hybrid mode, local host server configuration)
    11. `features`: Features & Modules management (enable/disable any of the 23 system feature flags)
- **Related Components:** `BillingUICustomizer`, `LedgerTerminologySettings`, `WhatsAppSettings`, `BulkOnboardingSheet`, `PaperPreviewModal`, `Modal`, `Input`, `Select`.
- **States:** Loading settings, Saving in-progress, QR code syncing, Test print running.
- **Status:** **Active** (VERIFIED).

#### 24. E-Commerce & FusionCart Vendor Portal
- **Route / Trigger:** Event `open-ecommerce-portal` (`showEcommercePortal === true`).
- **Source Component:** [`src/components/ecommerce/EcommercePortal.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/ecommerce/EcommercePortal.tsx)
- **Parent Module:** Omnichannel & E-Commerce Integration
- **Navigation Location:** Dashboard tile.
- **Roles & Permissions:** `products.view`.
- **Enablement Requirements:** Feature Flag `ecommerce: true` (defaults to false).
- **Main UI Actions:**
  - 5 tab workspaces:
    1. `overview`: Integration status, cloud sync health, total mapped online products, pending web orders count
    2. `registration`: FusionCart online store vendor registration form
    3. `products`: POS vs. Web product catalog mapping, publish to web, unpublish, sync stock levels
    4. `orders`: Incoming web orders list, customer shipping address, order status updates (Accepted, Packed, Shipped, Delivered, Cancelled)
    5. `settings`: FusionCart API URL, store slug, vendor auth token, webhook secrets, auto-stock sync toggle
- **Related Components:** `Skeleton`.
- **States:** Loading connection, Offline/disconnected notice, Web orders empty, Products sync in progress.
- **Status:** **Conditionally Available** (VERIFIED: feature flag `ecommerce` defaults to false, active when enabled).

#### 25. AI Business Assistant Chat
- **Route / Trigger:** Event `open-ai-assistant` (`showAiAssistant === true`).
- **Source Component:** [`src/components/ai-assistant/AiAssistant.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/ai-assistant/AiAssistant.tsx)
- **Parent Module:** Intelligence & Business Assistant
- **Navigation Location:** Dashboard tile or Billing Header quick action.
- **Roles & Permissions:** All authenticated store users (gated by internal permission checks inside engine).
- **Enablement Requirements:** Feature Flag `ai_assistant: true` AND `isAiAssistantAvailable: true`.
- **Main UI Actions:**
  - Interactive full-screen natural language chat interface
  - Full trilingual query understanding: English, Malayalam (മലയാളം), and Manglish
  - 60+ verified offline deterministic capability intents
  - Live charts rendering in chat responses (`Recharts` Bar, Area, Pie)
  - Quick action suggestion pills
  - Export chat report or insights
- **Related Components:** Recharts charting components.
- **States:** Idle chat, Query processing with thinking dots, Clarification required response, Formatted data table response.
- **Status:** **Active** (VERIFIED).

---

### C. Dedicated Print Views (Hash Routed)

#### 26. Thermal Receipt Print View
- **Route / Trigger:** URL hash `#/print-receipt?text=...` (routed in `PrintRouter.tsx` and `App.tsx`).
- **Source Component:** [`src/components/print/PrintReceiptView.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/print/PrintReceiptView.tsx)
- **Parent Module:** Hardware Print Spooler
- **Navigation Location:** Isolated Electron print window.
- **Roles & Permissions:** Hardware printer worker (called via IPC `printReceipt`).
- **Enablement Requirements:** Always active.
- **Main UI Actions:**
  - Receives raw formatted monospace receipt text from URL parameter or IPC `getReceiptText`
  - Applies store font styling, width parameters, and auto-invokes `window.print()` upon `printReady` IPC event
- **Related Components:** None (clean white canvas).
- **States:** Empty/fallback state, Document ready state.
- **Status:** **Active** (VERIFIED).

#### 27. Barcode Label Print View
- **Route / Trigger:** URL hash `#/print-barcode?barcode=...&price=...&sp=...&spType=...&name=...&quantity=...&columns=...&codeType=...`
- **Source Component:** [`src/components/print/PrintBarcodeView.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/print/PrintBarcodeView.tsx)
- **Parent Module:** Hardware Print Spooler
- **Navigation Location:** Isolated Electron print window.
- **Roles & Permissions:** Hardware printer worker (called via IPC `printBarcode`).
- **Enablement Requirements:** Always active.
- **Main UI Actions:**
  - Renders single or multi-column label sheet with barcode (Code128) or QR code
  - Displays product name, MRP, Selling Price (SP), and discount percentage
  - Auto-triggers print execution and signals Electron window closure
- **Related Components:** `react-barcode`, `qrcode`.
- **States:** Rendering label, Print initiated.
- **Status:** **Active** (VERIFIED).

#### 28. Bulk Barcode Label Print View
- **Route / Trigger:** URL hash `#/print-bulk-barcode?codeType=...`
- **Source Component:** [`src/components/print/PrintBulkBarcodeView.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/print/PrintBulkBarcodeView.tsx)
- **Parent Module:** Hardware Print Spooler
- **Navigation Location:** Isolated Electron print window.
- **Roles & Permissions:** Hardware printer worker (called via IPC `printBulkBarcodes`).
- **Enablement Requirements:** Always active.
- **Main UI Actions:**
  - Fetches bulk print queue items via IPC `getBulkPrintItems`
  - Renders paginated label sticker sheets according to printer label dimensions
  - Auto-invokes print execution
- **Related Components:** `react-barcode`, `qrcode`.
- **States:** Fetching queue items, Grid rendered, Printing.
- **Status:** **Active** (VERIFIED).

#### 29. A4 Invoice Print View
- **Route / Trigger:** URL hash `#/print-a4`
- **Source Component:** [`src/components/print/PrintA4View.tsx`](file:///c:/EMIRATES%20WEBFUSION%20WORKS/nafid/nafid-pos/src/components/print/PrintA4View.tsx)
- **Parent Module:** Hardware Print Spooler
- **Navigation Location:** Isolated Electron print window.
- **Roles & Permissions:** Hardware printer worker (called via IPC `printA4Html`).
- **Enablement Requirements:** Always active.
- **Main UI Actions:**
  - Fetches rendered A4 HTML document via IPC `getA4Html`
  - Injects full printable CSS stylesheets, margins, page breaks
  - Invokes `window.print()` and notifies Electron via `printReady`
- **Related Components:** None.
- **States:** Loading HTML, Ready.
- **Status:** **Active** (VERIFIED).

---

## 3. Global Modal Dialogs & Reusable Sub-Components

| Component Name | File Path | Usage Location | Description & Role |
| :--- | :--- | :--- | :--- |
| **BillerPinModal** | `src/components/billing/BillerPinModal.tsx` | `BillingPage.tsx` | 4-digit security PIN modal required before printing bills when `biller_pin` flag is enabled. |
| **SessionExpiredModal** | `src/components/app/SessionExpiredModal.tsx` | `App.tsx`, `OwnerDashboard.tsx` | Alerts user when cloud auth token has expired; allows offline work or re-login. |
| **UpdateBanner** | `src/components/app/UpdateBanner.tsx` | `App.tsx` | Top banner notifying when a new version of Nafid POS is available or downloaded. |
| **DataUploadModal** | `src/components/data-upload/DataUploadModal.tsx` | `InventoryManager`, `PartyManager`, `StaffManager` | CSV / Excel parser (`xlsx`, `papaparse`) for bulk importing data. |
| **PaperPreviewModal** | `src/components/settings/PaperPreviewModal.tsx` | `SettingsManager.tsx`, `BillingPage.tsx` | Interactive visual preview of 58mm / 80mm thermal receipts and A4 invoices. |
| **BillingUICustomizer** | `src/components/billing-ui-customizer/BillingUICustomizer.tsx` | `SettingsManager.tsx` (tab `billing_ui`) | Drag-and-drop / toggle visual configuration of POS billing action buttons and field flows. |
| **LedgerTerminologySettings** | `src/components/settings/LedgerTerminologySettings.tsx` | `SettingsManager.tsx` (tab `terminology`) | Customizes party ledger labels (Credit/Debit, Receivable/Payable, Party/Account). |
| **WhatsAppSettings** | `src/components/whatsapp/WhatsAppSettings.tsx` | `SettingsManager.tsx` (tab `whatsapp`) | QR code pairing interface for Baileys WhatsApp Web automation. |
| **BulkOnboardingSheet** | `src/components/settings/BulkOnboardingSheet.tsx` | `SettingsManager.tsx` (tab `products`) | Spreadsheet-like rapid product entry grid for onboarding store inventory. |
| **PermissionSelector** | `src/components/staff/PermissionSelector.tsx` | `StaffManager.tsx` | 12-group granular checkbox matrix for configuring staff access rights. |
| **BillingTabBar** | `src/components/billing/BillingTabBar.tsx` | `BillingPage.tsx` | Tab header for managing up to 10 concurrent customer carts and held bills. |
| **CustomDialog** | `src/components/ui/CustomDialog.tsx` | Multiple pages | Standard confirmation and alert dialog with variants (danger, warning, success, info). |
| **DateRangeFilter** | `src/components/ui/DateRangeFilter.tsx` | `SalesHistory`, `PartyManager`, `CashierSettlement`, `PurchaseBillManager` | Multi-preset and custom calendar date filter. |
| **FloatToast** | `src/components/ui/FloatToast.tsx` | Multiple pages | Floating auto-dismissing toast notification for operational feedback. |
| **RedCrossButton** | `src/components/ui/RedCrossButton.tsx` | Multiple pages | Unified close button component for overlays and modals. |

---

## 4. Feature Enablement & Route Dependency Matrix

| Page / Component | Feature Flag Key | Default State | Settings Pre-requisite | Permission Required |
| :--- | :--- | :--- | :--- | :--- |
| **BillingPage** | `billing` | Enabled (`true`) | None | `sales.create` |
| **SalesHistory** | `sales_history` | Enabled (`true`) | None | `sales.view` |
| **InventoryManager** | `inventory` | Enabled (`true`) | None | `products.view` |
| **CashierSettlement** | `cash_settlement` | Enabled (`true`) | None | `cash_register.view` |
| **CustomersPage** | `customers` | Enabled (`true`) | None | `customers.view` |
| **PartyManager** | `parties` | Enabled (`true`) | None | `customers.view` |
| **PurchaseBillManager** | `purchase_bills` | Enabled (`true`) | None | `purchases.view` |
| **QuotationManager** | `quotations` | Enabled (`true`) | None | `quotations.view` |
| **ReturnManager** | `returns` | Enabled (`true`) | None | `sales.refund` |
| **ScrapManager** | `scrap` | Enabled (`true`) | `enable_scrap: true` | `scrap.view` |
| **WarrantyManager** | `warranties` | Enabled (`true`) | None | `warranties.view` |
| **FinancialReport** | Core | Always active | None | `reports.financial` |
| **StockReport** | `stock_report` | Enabled (`true`) | None | `reports.view` |
| **ComboManager** | `combo_offers` | Enabled (`true`) | None | `combos.view` |
| **PricingTiers** | `pricing_tiers` | Enabled (`true`) | None | `combos.view` |
| **SettingsGrades** | `categories_grades` | Enabled (`true`) | None | `products.view` |
| **PaymentMethods** | `payments` | Enabled (`true`) | None | `settings.view` |
| **StaffManager** | `staff` | Enabled (`true`) | None | `users.view` |
| **Staff Attendance Tab** | `staff_attendance` | Disabled (`false`) | None | `users.view` |
| **SettingsManager** | Core | Always active | None | `settings.view` |
| **EcommercePortal** | `ecommerce` | Disabled (`false`) | FusionCart backend | `products.view` |
| **AiAssistant** | `ai_assistant` | Enabled (`true`) | `isAiAssistantAvailable` | Authenticated Store User |
| **SuperDashboard** | Core Multi-tenant | Always active | None | `role === 'SUPER_ADMIN'` |
| **Print Views** | Core Hardware | Always active | None | System / Hardware Window |
