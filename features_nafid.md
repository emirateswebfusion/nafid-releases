# Nafid POS - Features

Nafid is a comprehensive Point of Sale (POS) system built with React, Electron, and TypeScript. Designed for retail businesses with advanced inventory, billing, and management capabilities.

---

## Core Billing & Sales

### Billing
- **Multi-tab billing interface** - Handle multiple sales simultaneously
- **Real-time cart calculations** - Automatic tax, discount, and total computation
- **Multiple invoice types** - Tax Invoice, Bill of Supply, Export Invoice
- **GST compliant** - CGST, SGST, IGST support with HSN codes
- **Flexible discount options** - Fixed amount, percentage, or per-item discounts
- **Return/Refund mode** - Process returns with original invoice linking
- **Quotation mode** - Create quotations convertible to invoices
- **Scrap mode** - Handle scrap/salvage sales with deductions
- **Split payments** - Accept multiple payment methods per transaction
- **Biller PIN verification** - Optional 4-digit PIN for print accountability
- **Sales staff attribution** - Track sales by customer handler/staff member
- **Staff credit billing** - Record staff purchases directly in staff ledger

### Payment Methods
- **Cash** - With automatic change calculation
- **Card** - Credit/Debit card payments
- **UPI** - QR code and UPI ID payments with configurable providers
- **Cheque** - Post-dated cheque tracking
- **Credit/Account** - Customer ledger/pending payments
- **Split payments** - Combine multiple methods in one transaction
- **Custom payment methods** - Configurable via settings

---

## Inventory Management

### Products
- **Product master** - Name, SKU, barcode, HSN code, unit, category, grade
- **Multi-unit support** - PCS, KG, MTR, LTR, BOX, etc. with conversion
- **Pricing tiers** - Retail, Wholesale, Dealer, Custom tiers with per-tier pricing
- **MRP tracking** - Separate MRP field with tier-based selling prices
- **Purchase price tracking** - Cost price for margin calculations
- **Stock levels** - Real-time stock with low-stock alerts
- **Batch/Expiry tracking** - Optional batch numbers and expiry dates
- **Product images** - Visual identification in billing
- **Bulk import/export** - Excel/CSV support for product catalog

### Categories & Grades
- **Hierarchical categories** - Organize products in category tree
- **Grade rules** - Define quality grades with pricing rules
- **Automatic grade assignment** - Based on purchase price or rules
- **Category-wise reporting** - Sales and stock by category

### Combo Offers
- **Bundle products** - Create product combinations at special prices
- **Flexible combo pricing** - Fixed price or percentage discount
- **Auto-apply in billing** - Suggest combos when eligible items added

---

## Stock Management

### Stock Report
- **Real-time stock view** - Current quantities across all products
- **Low stock alerts** - Configurable threshold notifications
- **Stock valuation** - Current inventory value at cost/selling price
- **A4 print/export** - Professional stock reports with PDF export
- **Category-wise breakdown** - Stock grouped by categories

### Purchase Bills
- **GST purchase entry** - Record supplier invoices with tax breakdown
- **Auto-stock update** - Increase stock on purchase bill save
- **Supplier management** - Track supplier balances and payments
- **Purchase return** - Handle returned goods to suppliers
- **Payment tracking** - Pending/paid status for supplier bills

---

## Customer & Party Management

### Customers
- **Customer master** - Name, phone, email, GSTIN, address, state
- **Loyalty points** - Earn/redeem points on purchases
- **Credit limits** - Set and enforce customer credit limits
- **Purchase history** - Complete transaction history per customer
- **Outstanding balances** - Track receivables with aging reports
- **Bulk SMS/WhatsApp** - Send bills, offers, reminders

### Ledger/Parties
- **Party master** - Suppliers, customers, and general parties
- **Credit/Debit tracking** - Running balances with transaction history
- **Payment receipts** - Record payments against outstanding
- **Account statements** - Generate party-wise ledger statements
- **Opening balances** - Set initial balances for migration

---

## E-Commerce (FusionCart Integration)

### Online Store Management
- **Vendor registration** - Register as FusionCart vendor from POS
- **Store configuration** - Store name, slug, description, contact details
- **Connection testing** - Verify FusionCart API connectivity with latency
- **Real-time sync status** - Monitor last sync time and status

### Product Synchronization
- **Product mapping** - Link POS products to FusionCart products
- **Online enable/disable** - Control which products appear online
- **Override fields** - Custom online title, description, price per product
- **Sync status tracking** - SYNCED, PENDING, FAILED, UNSYNCED states
- **Bulk operations** - Enable/disable/sync multiple products at once
- **Filters & search** - By online status, category, stock level, keyword

### Order Management
- **Order dashboard** - View FusionCart orders in POS
- **Order details** - Customer info, items, payment status, addresses
- **Status filtering** - Filter by order status (pending, confirmed, shipped, etc.)
- **Real-time refresh** - Pull latest orders from FusionCart

### Settings
- **FusionCart URL** - Configure API endpoint (default: localhost:5050/api)
- **Store credentials** - Store ID, vendor ID auto-populated on approval
- **Registration workflow** - NOT_REQUESTED → PENDING → APPROVED → ACTIVE
- **Error handling** - Rejection reasons, connection error states

---

## Sales History & Reports

### Sales History
- **Complete transaction log** - Searchable, filterable invoice list
- **Advanced filters** - Date range, customer, payment mode, staff, invoice type
- **Invoice actions** - View, print, edit, cancel, duplicate, WhatsApp share
- **Bulk operations** - Export selected invoices to Excel
- **Return tracking** - Linked return invoices visible in history

### Financial Reports
- **Daily/Monthly/Yearly sales** - Summary with tax breakdown
- **GST reports** - GSTR-1, GSTR-3B ready data
- **Payment mode analysis** - Cash, Card, UPI, Credit splits
- **Staff performance** - Sales by biller/sales staff
- **Hourly sales trends** - Peak hours identification
- **Profit/Loss estimates** - Based on purchase vs selling price

### Stock Reports
- **Current stock valuation** - At cost and selling price
- **Stock movement** - Inward/Outward register
- **Slow/Non-moving items** - Identify dead stock
- **Reorder suggestions** - Based on minimum stock levels

---

## Staff Management

### Staff Directory
- **Employee profiles** - Name, phone, role, join date, salary
- **Role-based access** - Admin, Manager, Biller, Accountant, Staff
- **Permission system** - Granular feature-level permissions

### Salary & Advances
- **Salary book** - Monthly salary processing with components
- **Advance tracking** - Staff loans/advances with repayment schedule
- **Attendance** - Optional daily attendance with leave tracking
- **Staff ledger** - Complete financial transactions per staff

---

## Warranty Management

- **Warranty certificates** - Generate printed warranty cards
- **Product serial tracking** - Link warranties to specific units
- **Warranty claims** - Register and track service claims
- **Expiry alerts** - Upcoming warranty expirations
- **Print templates** - Customizable warranty card formats

---

## Quotation Management

- **Create quotations** - Professional quote documents
- **Validity periods** - Auto-expiry with status tracking
- **Convert to invoice** - One-click conversion preserving details
- **Quotation history** - Track all quotes with status (Pending, Accepted, Expired)
- **Email/WhatsApp sharing** - Direct sharing from app

---

## Return & Scrap Management

### Returns
- **Return mode billing** - Process returns with original invoice reference
- **Refund methods** - Cash refund, bill adjustment, credit note
- **Return reasons** - Categorize returns for analysis
- **Stock restoration** - Auto-restock returned items (configurable)
- **Return reports** - Return rate, reasons, trends

### Scrap Management
- **Scrap invoices** - Separate invoice series for scrap sales
- **Scrap deduction** - Deduct scrap weight/value from main invoice
- **Scrap categories** - Organize scrap by type
- **Scrap reports** - Track scrap revenue and quantities

---

## Hardware Integration

### Weighing Scale
- **Serial/USB scales** - Support for common weighing scale models
- **Live weight display** - Real-time weight in billing
- **Auto-capture** - Stable weight auto-entry
- **Multiple scale support** - Configure multiple scales

### Barcode Scanner
- **Keyboard wedge mode** - Works with any USB/Bluetooth scanner
- **Continuous scan detection** - Prevents duplicate scans
- **Barcode lookup** - Instant product search by barcode

### Printers
- **Thermal printers** - 58mm, 80mm receipt printing
- **A4 printers** - Full-page invoices and reports
- **Multiple printer profiles** - Different formats per printer
- **Print preview** - Preview before printing
- **Bulk barcode printing** - Print multiple labels at once

---

## Cloud & Synchronization

### Cloud Sync
- **Multi-device sync** - Real-time data across outlets
- **Conflict resolution** - Smart merge for concurrent edits
- **Offline-first** - Full functionality without internet
- **Auto-sync** - Background synchronization
- **Sync status** - Real-time sync progress indicator
- **LAN + Cloud hybrid** - Local network sync with cloud backup

### Multi-tenancy
- **Multi-shop support** - Single installation, multiple outlets
- **Tenant isolation** - Separate data per shop
- **Centralized management** - Super admin dashboard for all tenants

---

## Settings & Customization

### Billing UI Customization
- **Header button configuration** - Show/hide/reorder quick actions
- **Entry field flow** - Customize field tab order (name, qty, rate, discount)
- **Preset layouts** - Predefined flows for different business types
- **Custom fields** - Add custom input fields to billing

### Terminology
- **Custom labels** - Rename "Customer" to "Patient", "Party", "Client", etc.
- **Document names** - Invoice → Bill, Challan, Receipt, etc.
- **Role names** - Biller → Cashier, Salesperson, etc.

### General Settings
- **Shop details** - Name, address, GSTIN, logo, footer text
- **Invoice series** - Prefix, start number, reset frequency
- **Tax configuration** - GST rates, inclusive/exclusive pricing
- **Rounding rules** - Round off to nearest 0.50, 1, etc.
- **Timezone & format** - 12h/24h, date formats
- **Backup/Restore** - Local database backup and restore

---

## AI Business Assistant

- **Natural language queries** - "Show top 5 selling products this month"
- **Sales analytics** - Instant insights without reports
- **Stock alerts** - "Which items are below reorder level?"
- **Credit reports** - "Show customers with overdue > 30 days"
- **Voice commands** - Hands-free operation (planned)
- **Always available** - Enabled by default in all environments

---

## Communication & Notifications

### WhatsApp Integration
- **Bill sharing** - Send invoice/receipt via WhatsApp
- **Bulk messaging** - Promotional/reminder broadcasts
- **Template messages** - Pre-approved WhatsApp templates
- **QR code on bills** - Scan to pay/view digital copy

### Notifications
- **Low stock alerts** - In-app and push notifications
- **Sync status** - Cloud connection state
- **Payment reminders** - Outstanding collection alerts
- **System updates** - New version available banner

---

## Security & Access Control

- **Role-based permissions** - 20+ granular permissions
- **PIN protection** - Optional biller PIN for sensitive actions
- **Session management** - Auto-logout, session expiry handling
- **Audit trail** - Track critical actions (void, discount, price change)
- **Data encryption** - Local database encryption
- **Cloud auth** - Secure token-based authentication

---

## Technical Features

- **Electron desktop app** - Native Windows/macOS/Linux support
- **Auto-updates** - Silent background updates with electron-updater
- **SQLite database** - Local-first, zero-config storage
- **TypeScript** - Full type safety
- **React 19** - Modern UI with concurrent features
- **Tailwind CSS** - Utility-first styling
- **Zustand** - Lightweight state management
- **Recharts** - Dashboard visualizations
- **PWA-ready** - Can run in browser (limited hardware access)

---

## Platform Support

| Platform | Status |
|----------|--------|
| Windows 10/11 | ✅ Full support |
| macOS 12+ | ✅ Full support |
| Linux (Ubuntu/Debian) | ✅ Full support |
| Browser (PWA) | ⚠️ Limited (no hardware) |

---

## Version
Current: **v2.0.4**

---

*Last updated: 2026*