# Nafid POS v2.2.0 Release Notes

## What's New
- **UAE Store Support**: Country-aware AED amounts, VAT/TRN wording, store timezone defaults and tax invoice numbering across billing, reports and settings.
- **Accurate UAE VAT Pricing**: Inclusive and exclusive pricing with consistent line rounding in checkout, sales details and quotations.
- **Reliable Quotations**: UAE quotation previews and printing use matching VAT totals; reopening and resaving preserves inclusive prices.
- **Correct Receipt Credits**: Scrap and return credits reduce the printed payable amount exactly once, including reprints.
- **Thermal Printing Reliability**: Receipt jobs require measured paper dimensions and report printer failures without feeding a guessed page.

**Verification limitation:** Physical printer checks on shop hardware and the final visual installer smoke test remain unverified.

**Download:** [Nafid-Setup-2.2.0.exe](https://github.com/emirateswebfusion/nafid-releases/releases/download/v2.2.0/Nafid-Setup-2.2.0.exe)

# Nafid POS v2.1.6 Release Notes

## What's New
- **Reliable Bill Date Editing**: Editing invoice dates on converted GST bills now permanently synchronizes across both documents and item rows without resetting on restart.
- **Accurate Shop Closing Timings**: Active registers clearly display as Report Time while open and Closing Time once settled, with precise UTC to store timezone conversion.
- **AM/PM Timing Badge & Scheduling Guard**: Added visual 12-hour AM/PM indicator in WhatsApp closing settings to prevent accidentally scheduling night closing reports during morning hours.
- **Streamlined Trial Registration**: New branded preview and shop detail validation for trial registrations.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v2.1.5...v2.1.6

**Download:** [Nafid-Setup-2.1.6.exe](https://github.com/emirateswebfusion/nafid-releases/releases/download/v2.1.6/Nafid-Setup-2.1.6.exe)

# Nafid POS v2.1.5 Release Notes

## What's New
- **Dynamic Release Notes & Seamless Updates**: "What's New" highlights in Settings are now discovered dynamically directly from release notes without manual updates, with a streamlined glowing update restart banner in the Owner Dashboard.
- **Accurate Thermal Receipt Totals**: Standardized thermal receipts to show a single clear Net Total after deductions, avoiding confusion from dual grand/net total lines.
- **Precision Weight & Scrap Formatting**: Quantities for scrap and weighed goods now strictly display with 3 decimal places (e.g. 1.000 kg, 0.250 kg) for accurate retail trade billing.
- **Accurate Shop Closing Scrap Accounting**: Corrected daily scrap purchase totals in WhatsApp summaries and shop closing reports by removing duplicate bill-level scrap deductions.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v2.1.4...v2.1.5

**Download:** [Nafid-Setup-2.1.5.exe](https://github.com/emirateswebfusion/nafid-releases/releases/download/v2.1.5/Nafid-Setup-2.1.5.exe)

# Nafid POS v2.1.4 Release Notes

## What's New
- **Clean Thermal Tax Receipts**: Printed receipts on 80mm thermal printers now feature a clean, uncluttered GST breakdown with clear Taxable, CGST, SGST, and total amounts tailored for retail billing.
- **Quick Product Units & Pricing**: Choose units (pieces, kg, litres) and tax-inclusive or tax-exclusive pricing directly from the Quick Product Entry table before saving.
- **Streamlined Filing-Only Mode**: Decide whether filing-only bills count towards your daily drawer collection and sales today, keeping tax filing cleanly separated from physical cash.
- **Cash Register & Drawer Controls**: Configure automatic cash drawer opening and cash register preferences directly with intuitive toggles for faster checkout and closing.
- **Accurate Bill Totals & Net Pay**: Clear distinction between Grand Total and Net Total on printouts and screens whenever discounts or roundoffs are applied.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v2.1.3...v2.1.4

**Download:** [Nafid-Setup-2.1.4.exe](https://github.com/emirateswebfusion/nafid-releases/releases/download/v2.1.4/Nafid-Setup-2.1.4.exe)

# Nafid POS v2.1.3 Release Notes

## What's New
- **Quick Product Entry**: Add multiple products at once directly from the billing screen using an interactive spreadsheet table with custom columns.
- **Converted Bills Filter**: Quickly isolate and inspect invoices converted from Counter Bills (BOS) to GST in Sales History.
- **Accurate Shop Time**: Store time and closing reports strictly match your local business day and hours.
- **Seamless Customer Points Sync**: Automatic deduplication and points reconciliation across multiple billing terminals.
- **Flexible Tax Filing Settings**: Independent controls for B2B and B2C filing-only bills in your sales views.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v2.1.2...v2.1.3

**Download:** [Nafid-Setup-2.1.3.exe](https://github.com/emirateswebfusion/nafid-releases/releases/download/v2.1.3/Nafid-Setup-2.1.3.exe)

# Nafid POS v2.1.2 Release Notes

## What's New
- **Refreshed What's New in Settings**: Updated highlights in bilingual English & Malayalam focusing exclusively on user-facing improvements with old entries cleared.
- **Simpler Settings & Search**: Find any option quickly with the sidebar search bar across newly organized single-topic settings pages.
- **Exact Credit Balances**: Customer and supplier credit balances stay accurate across bill edits, returns and cash settlements with automatic bill settlement.
- **Fast WhatsApp QR**: Immediate display of the WhatsApp QR code without stalling, with live connection status in Settings.
- **Smooth Receipt Printing**: Prevented duplicate printouts and printer hangs during fast consecutive billing.
- **Sequential GST Invoice Numbers**: Avoid skipped tax invoice numbers when converting bills of supply to GST.
- **Safe Customer Contact Edits**: Protection for edited customer phone numbers and contacts during cloud sync.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v2.1.1...v2.1.2

**Download:** [Nafid-Setup-2.1.2.exe](https://github.com/emirateswebfusion/nafid-releases/releases/download/v2.1.2/Nafid-Setup-2.1.2.exe)

# Nafid POS v2.1.1 Release Notes

## What's Changed
- **Party Credit Ledger**: Ledger entries are strictly isolated per bill; re-posting or editing bills retires only the bill's own rows, preventing balance drift and double entries.
- **Customer Credit Status**: Accurate allocation of debits and cash payments against credit invoices; FIFO allocation for unallocated payments.
- **Settings Navigation**: Settings split into single-topic pages with sidebar search for faster access.
- **WhatsApp Reliability**: Prevent session stall on version lookup; clean socket cleanup and error reporting.
- **Returns & Backfill**: Stop re-scanning walk-in returns during backfill, exact proportionate discounts preserved.
- **GST Conversion**: Reserve invoice numbers only for convertible bills.
- **Receipt Printing**: Prevent duplicate receipts and slow-driver print hangs.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v2.1.0...v2.1.1

**Download:** [Nafid-Setup-2.1.1.exe](https://github.com/emirateswebfusion/nafid-releases/releases/download/v2.1.1/Nafid-Setup-2.1.1.exe)

# Nafid POS v2.1.0 Release Notes

## What's New
- **Filing-only Bill**: A new "Filing-only" button on the Billing screen makes GST bills only for tax filing. In Settings you choose whether these bills reduce stock or count as sales. They never change your cash, customer balance or loyalty points.
- **Choose What Counts as Sales**: Leave B2B or B2C bills out of your daily sales totals. Applies to new bills only, so past totals never change.
- **Faster Sales History**: Opens in under a second even with thousands of bills, and shows Sales without GST, GST Amount and Grand Total with GST separately.
- **Safer Returns**: Return quantity starts at 0, return totals with discount and GST are exact, and cash returns are taken out of the cash register (can be changed in Settings).
- **Cash Register Your Way**: Choose which payment methods appear, and whether scrap sales and ledger cash entries are included. Converted GST bills are no longer counted twice in cash.
- **Better WhatsApp Messages**: Choose the bill format (text, A4 PDF or receipt), choose which party types get ledger messages, correct supplier purchase messages, and scrap details in the closing report.
- **Accurate Loyalty Points**: Points stay correct after returns, edits and cancellations; turning points off hides them everywhere.
- **Better Receipt Printing**: Thermal receipts print centred, and long bills print as one receipt instead of two papers. A margin adjustment is available.
- **Fixes**: Purchase bill products reach Inventory correctly, paper stock settings work, the supplier form shows only supplier fields, and payment methods from Cash Settlement appear on the Payment Methods page.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v2.0.7...v2.1.0

# Nafid POS v2.0.7 Release Notes

## What's Changed
- **Real Counter Sales (BOS Mode) & Isolated Accounting**: Added dedicated Bill of Supply filtering in Sales History to view and calculate exclusively non-tax counter transactions for accurate internal ledger audits without mixing GST tax bills.
- **GST Tax Rate Filter & Quick Reset**: Filter sales records instantaneously by individual GST tax slabs (0%, 5%, 12%, 18%, 28%) with visual indicator pills and one-click filter clear.
- **Streamlined What's New Interface in Settings**: Redesigned What's New under Appearance to show exclusively relevant, user-focused new features in bilingual English & Malayalam, removing all outdated legacy items.
- **Recycle Bin & Safe Restore**: Recover deleted invoices, items, and contacts with automatic inventory stock reconciliation.
- **Custom Billing Date & Time Picker**: Enter backdated transactions with the interactive calendar and time picker directly from the main billing screen.
- **Zero-Lag Sales History Drawer**: Instant side-drawer invoice inspection powered by predictive hover caching.
- **Advanced WhatsApp Closing Summary**: Customizable shop closing reports with toggles for cashier breakdown, expense details, scrap transactions, and party ledger collections.
- **Automated Windows Installer Deployment**: Packaged installer `Nafid-Setup-2.0.7.exe` with updated auto-update block map.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v2.0.6...v2.0.7

# Nafid POS v2.0.6 Release Notes

## What's Changed
- **Recycle Bin & Safe Recovery Added**: Introduced full-featured Recycle Bin allowing users to safely recover deleted sales invoices, inventory items, customer profiles, and ledger parties with one-click restore and automatic stock balance reconciliation.
- **Custom Billing Date & Time Picker**: Integrated a modern calendar and time selector directly on the billing screen with quick Today/Yesterday shortcuts, enabling fast, accurate entry of backdated transactions.
- **Instant Zero-Lag Sales History Bill Inspection**: Past bills open instantly with zero loading lag thanks to background hover prefetching and intelligent in-memory drawer caching.
- **Enhanced WhatsApp Closing Report Customization**: Fine-tune end-of-day business closing summaries with granular section and metric checkboxes for cashier breakdown, expense details, scrap transactions, and party ledger collections.
- **Dedicated GST Prefix Fallback & Counter Isolation**: Ensured GST invoices use dedicated sequence numbers and fallback prefixes (`GST-`, `B2B-`, `B2C-`) without conflicting with regular Bill of Supply counters.
- **Updated What's New in App Appearance**: Added bilingual highlights (Malayalam & English) directly inside Settings under Appearance.
- **Automated Windows Installer Deployment**: Packaged installer `Nafid-Setup-2.0.6.exe` with updated auto-update block map.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v2.0.5...v2.0.6

# Nafid POS v2.0.5 Release Notes

## What's Changed
- **Eliminated Database Lock & Freeze in Sales History**: Fixed critical bottleneck where `ensureInvoiceColumnsExist()` was executing on every `getDb()` query invocation, causing concurrent SQLite table scans and synchronous thread blocking when inspecting past sales. Database migrations now run strictly once during startup initialization.
- **Renderer Protection & Query Timeouts**: Hardened renderer IPC communications in `SalesHistory.tsx` with dedicated 2-3s safety timeouts and race-condition guards (`selectedInvoiceIdRef`), guaranteeing the UI never hangs indefinitely if the disk or database is busy.
- **Hardened Data Parsing**: Added recursion depth protection to `parseSplitDetails` and null-safe filtering to combo item parsing and GST tax rate checks.
- **Bill Date Inheritance on BoS-to-GST Conversion**: Preserved original Bill of Supply transaction timestamps (`created_at`) when converting to GST tax invoices, preventing converted bills from jumping to the current date.
- **Automated Windows Installer Deployment**: Packaged installer `Nafid-Setup-2.0.5.exe` with updated auto-update block map.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v2.0.4...v2.0.5

# Nafid POS v2.0.4 Release Notes

## What's Changed
- **Fixed Bill View POS Hang in Sales History**: Resolved issue where viewing bills in Sales History caused the POS to freeze or get stuck indefinitely on "Loading items…".
- **Added SQLite Performance Indexes**: Added `idx_returns_invoice_id`, `idx_return_items_return_id`, and `idx_return_items_invoice_item_id` to eliminate full table scans when checking returned quantities.
- **Optimized MRP & Combo Lookup**: Eliminated unconditional correlated subqueries for combo offers on invoice selection, now only querying combos when bills contain combo items.
- **Enhanced UI Error Handling & Null-Safety**: Replaced infinite loading spinner with explicit `itemsLoading` state and empty-state messaging, and hardened `formatCurrency`, date parsers, and unit string coercion against uncaught type errors.
- **Automated Windows Installer Deployment**: Packaged installer `Nafid-Setup-2.0.4.exe` with updated auto-update block map.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v2.0.3...v2.0.4

# Nafid POS v2.0.3 Release Notes

## What's Changed
- **What's New in App Appearance Updated**: Refreshed user-facing feature highlights and Malayalam/English translations in Settings under Appearance.
- **Bill of Supply → GST Convert Corrected**: Corrected and streamlined conversion from Non-GST Estimate / Bill of Supply to statutory GST tax invoices with accurate tax-inclusive profit margins, automatic sequential GST invoice numbers, statutory tax copy tagging, and duplicate sales prevention.
- **E-Commerce Storefront Added**: Seamless online catalog and inventory synchronization, incoming web order processing, and multi-channel stock deduction.
- **Digital Advertisements & Customer Promo Screen**: Full promo slideshow playback for secondary customer-facing displays and counter screens.
- **Digital Warranty Certificates & Brand Tracking**: Official A4 warranty certificates with dedicated Bill Number, Brand, and real-time cloud synchronization.
- **Customer Loyalty Points & Unified POS Redemption**: Award reward points (₹X = 1 Pt) on purchases, display points beside customer phone, and redeem via Alt+L shortcut with quick Max button. Includes loyalty points earning rules and toggle to award points on pending bills.
- **Dynamic POS Dashboard Card Reordering**: Interactive card customizer with drag-and-drop or position arrows, user-profile persistence, and restore defaults dialog.
- **Theme, Typography & Admin Surface Studio**: Customize brand colors, curated font stacks, and custom non-bluish base surfaces (Zinc, Warm Sand, Pitch Black OLED).
- **Automated WhatsApp Shop Closing Reports**: Automatic end-of-day business closing summaries sent to WhatsApp.
- **Automated Windows Installer Deployment**: Packaged installer `Nafid-Setup-2.0.3.exe` with updated auto-update block map.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v2.0.2...v2.0.3

# Nafid POS v2.0.2 Release Notes

## What's Changed
- **Bill of Supply → GST Convert Corrected**: Corrected and streamlined conversion from Non-GST Estimate / Bill of Supply to statutory GST tax invoices. Features accurate tax-inclusive profit margins, automated sequential GST invoice generation, statutory tax copy tagging (`⚡ GST Filed` / `📄 Tax Copy`), and prevention of revenue double-counting in accounting reports.
- **E-Commerce Storefront Added**: Seamlessly manage an integrated online store with live bi-directional catalog and inventory synchronization, instant online order notifications, fulfillment workflow tracking, and unified multi-channel stock deduction.
- **Digital Advertisements & Customer Promo Screen Added**: Complete Digital Ads Manager enabling high-impact promotional banners, seasonal discounts, and automated slideshow playback on customer-facing screens and checkout counter displays.
- **Digital Warranty Certificates & Brand Tracking**: Issue, track, and print official A4 warranty certificates with dedicated **Bill Number** and **Brand** fields alongside customer and product specifications. Features instant edge-to-cloud sync, search by bill number or brand, and clean warranty card printouts.
- **Customer Loyalty Points & Unified POS Redemption**: Award reward points on purchases with customizable earn & redeem rates. In billing, customer loyalty points balance displays alongside phone number, and points can be redeemed directly via the unified dynamic deduction panel using the **Alt+L** shortcut or tab with direct numeric input and quick `Max` redemption. Complete with points ledger history and manual balance adjustment in the Customers directory.
- **Dynamic POS Dashboard Card Reordering & Customizer**: Store owners and staff can dynamically reorganize POS dashboard module cards (Billing, Cashier Settlement, Inventory, E-Commerce, etc.) using live drag-and-drop or position arrows. Features user-profile persistence, responsive touch & mouse support, and a dedicated Restore Defaults confirmation dialog with live sequence preview.
- **Theme, Typography & Admin Surface Studio**: Complete design studio in Settings. Calibrate primary brand accent colors, curated typography font stacks (Geist, Outfit, Space Grotesk, DM Sans, Plus Jakarta Sans), and UI reading density. Store Administrators can now customize base surface colors for Light and Dark modes (including Zero-Blue Neutral Zinc, Warm Cream/Sand, Pitch Black OLED, or custom HEX) replacing default white and bluish/navy tones.
- **Automated WhatsApp Shop Closing Reports**: End-of-day business closing summaries sent automatically to WhatsApp with cash count reconciliation, multi-biller sales, credit collections, and expense totals.
- **Emergency Reset & Panic Shield**: Covert kill switch panic triggers and selective database purge safeguards with passcode protection to protect sensitive data during urgent audits.
- **Staff Data Masking & Role Privacy**: Granular financial privacy shielding wholesale purchase prices, profit margins, and revenue totals from cashier and non-admin staff across billing, stock, and sales.
- **Digital Advertisements & Promo Manager**: Create, schedule, and showcase store promotional marketing banners, seasonal discount announcements, and customer-facing screen campaigns.
- **Offline AI Assistant & Analytics**: Conversational AI running 100% locally without cloud latency for instant sales audits, customer invoice searches, and stock intelligence.
- **Dynamic Tiered Pricing & Party PDF Ledgers**: Automatically apply wholesale, retail, or custom pricing tiers at billing checkout and generate formatted PDF party ledger statements.
- **Thermal Printer Left Margin Offset & POS80 Alignment**: Added precision left-margin offset calibration and continuous roll layout fixes for 80mm thermal receipt printers (including POSPrinter POS80 and similar models) to eliminate rightward shifts and driver unprintable margin offsets without affecting other printers.
- **What's New in App Settings**: Refreshed user-facing feature highlights directly inside Settings under Appearance.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v2.0.1...v2.0.2

# Vendora v1.7.15 Release Notes

## What's Changed
- **Billing, Settlement & Sync Improvements**: Refined cashier settlement, billing flow, customer and party management, WhatsApp settings, and sync worker stability.
- **Automated Windows Installer Deployment**: Packaged installer `Nafid-Setup-1.7.15.exe` with updated auto-update block map.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.7.14...v1.7.15

# Vendora v1.7.14 Release Notes

## What's Changed
- **Billing, Sales History & Sync Updates**: Updated localDb transaction queries, billing page optimization, party manager enhancements, sales history filters, and sync worker reliability.
- **Automated Windows Installer Deployment**: Packaged installer `Nafid-Setup-1.7.14.exe` with updated auto-update block map.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.7.13...v1.7.14

# Vendora v1.7.5 Release Notes

## What's Changed
- **WhatsApp Integration & UI Enhancements**: Added WhatsApp billing helper, customizable WhatsApp settings, refined date range filters, and updated quotation generation.
- **Automated Windows Installer Deployment**: Packaged installer `Nafid-Setup-1.7.5.exe` with updated auto-update block map.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.7.4...v1.7.5

# Vendora v1.7.4 Release Notes

## What's Changed
- **Quotation & Biller Updates**: Enhanced quotation management, biller PIN modal authentication, weighing scale integration, and sync worker stability.
- **Automated Windows Installer Deployment**: Packaged installer `Nafid-Setup-1.7.4.exe` with updated auto-update block map.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.7.3...v1.7.4

# Vendora v1.7.3 Release Notes

## What's Changed
- **POS & Billing Improvements**: Updated billing page, inventory management, purchase bill manager, and settings preferences.
- **Automated Release Deployment**: Packaged installer `Nafid-Setup-1.7.3.exe` with updated auto-update block map.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.7.2...v1.7.3

# Vendora v1.7.0 Release Notes

## What's Changed
- **POS & Cart Updates**: Refactored billing page, cart pane, inventory manager, and party manager components for improved UI responsiveness and stability.
- **Automated Windows Installer Deployment**: Packaged installer `Nafid-Setup-1.7.0.exe` with updated auto-update block map.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.6.9...v1.7.0

# Vendora v1.6.8 Release Notes

## What's Changed
- **Fix Auto-Update Process Lock**: Added immediate window destruction and clean process exit during auto-update to ensure NSIS installer seamlessly updates the executable without file locking.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.6.7...v1.6.8

# Vendora v1.6.7 Release Notes

## What's Changed
- **Fix Application Startup Crash**: Rebuilt `better-sqlite3` native bindings explicitly for Electron 42.4.1 (module ABI 146).
- **Fix Missing App Logo / Icon**: Re-enabled Windows executable resource icon embedding (`rcedit`) during packaging.
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.6.6...v1.6.7

# Vendora v1.6.6 Release Notes

## What's Changed
- General system performance and POS application updates
- Automated release build and installer asset deployment
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.6.5...v1.6.6

# Vendora v1.6.5 Release Notes

## What's Changed
- POS stability and application build updates
- Automated release build and installer asset deployment
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.6.4...v1.6.5

# Vendora v1.6.4 Release Notes

## What's Changed
- General system updates and installer artifact packaging
- Automated release build and installer asset deployment
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.6.3...v1.6.4

# Vendora v1.6.3 Release Notes

## What's Changed
- System stability updates and performance enhancements
- Automated Windows installer and updater asset deployment
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.6.2...v1.6.3

# Vendora v1.6.2 Release Notes

## What's Changed
- Cashier settlement and POS transaction stability updates
- Automated release build and installer asset deployment
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.6.1...v1.6.2

# Vendora v1.5.83 Release Notes

## What's Changed
- Improved cashier settlement and billing workflows, including transaction handling and tab state
- Updated sales history amounts and financial reporting behavior
- Automated Windows installer and updater asset deployment
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.82...v1.5.83

# Vendora v1.5.82 Release Notes

## What's Changed
- Improved staff permissions and login management
- Enhanced billing, cashier settlement, sales history, tab handling, and Electron synchronization
- Automated Windows installer and updater asset deployment
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.81...v1.5.82

# Vendora v1.5.81 Release Notes

## What's Changed
- System stability and application build updates
- Automated `latest.yml`, installer executable, and blockmap release asset deployment
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.80...v1.5.81

# Vendora v1.5.80 Release Notes

## What's Changed
- Dynamic release asset publishing script integration
- Automated `latest.yml`, installer executable, and blockmap release asset deployment
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.79...v1.5.80

# Vendora v1.5.79 Release Notes

## What's Changed
- Fixed auto-updater manifest (`latest.yml`) generation and release publishing flow
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.78...v1.5.79

# Vendora v1.5.78 Release Notes

## What's Changed
- Included `latest.yml` auto-updater manifest and installer `Nafid-Setup-1.5.78.exe` in release assets
- Resolved update download failure by ensuring `latest.yml` artifact publish
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.77...v1.5.78

# Vendora v1.5.77 Release Notes

## What's Changed
- Fixed TypeScript compilation issues in `BillingPage` and `cartStore`
- Updated billing UI state management and return mode invoice search handlers
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.76...v1.5.77

# Vendora v1.5.76 Release Notes

## What's Changed
- Added `BillingUICustomizer`, `LedgerTerminologySettings`, product sorting optimizations, and updated cart store & print formats
- Refactored `BillingPage`, `SettingsPricingTiers`, `StockReport`, and Electron main process IPC routines
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.75...v1.5.76

# Vendora v1.5.75 Release Notes

## What's Changed
- Integrated `SplashScreen` component for application startup and initialization
- Enhanced `timezoneHelper`, `receiptGenerator`, `OwnerDashboard`, `BillingPage`, Electron main process IPC channels, and LAN sync routines
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.74...v1.5.75

# Vendora v1.5.74 Release Notes

## What's Changed
- Added application icons (`icon.ico`, `icon.png`) and UI components (`FloatToast`, `RedCrossButton`)
- Enhanced `PartyManager`, `CustomersPage`, `BillingPage`, `PurchaseBillManager`, `SettingsManager`, `electron-builder.config.js`, and main process IPC bridges
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.73...v1.5.74

# Vendora v1.5.73 Release Notes

## What's Changed
- Integrated `BillerPinModal` component, enhanced `StaffManager`, `PermissionSelector`, `InventoryManager`, `OwnerDashboard`, `PartyManager`, `ActionPane`, and `BillingPage`
- Updated Electron main process IPC handlers, SQLite database tables & migrations in `localDb.ts`, auth and cart state stores, and granular permission enforcement
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.72...v1.5.73

# Vendora v1.5.72 Release Notes

## What's Changed
- Updated local SQLite DB handling, main process IPC handlers, receipt generator formatting, and timezone helper routines
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.71...v1.5.72

# Vendora v1.5.71 Release Notes

## What's Changed
- Maintenance build release with updated installer packaging and release distribution configuration
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.70...v1.5.71

# Vendora v1.5.70 Release Notes

## What's Changed
- Enhanced `CustomersPage`, `QuotationManager`, `SettingsManager`, `PrintA4View`, `invoiceHtmlGenerator`, and `receiptGenerator`
- Updated local SQLite DB queries, Electron main process IPC routines, and background sync worker/server handling
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.69...v1.5.70

# Vendora v1.5.69 Release Notes

## What's Changed
- Integrated DigitalClock component and enhanced POS components (`BillingPage`, `SalesHistory`, `SettingsManager`, `SettingsPricingTiers`, `StaffManager`)
- Updated Electron main process IPC bridges, preload security definitions, tab store state handling, and local DB synchronization
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.68...v1.5.69

# Vendora v1.5.68 Release Notes

## What's Changed
- Enhanced POS components (`BillingPage`, `PartyManager`, `PurchaseBillManager`, `ScrapManager`, `WarrantyManager`, `PaymentMethods`, `ComboManager`, `StaffManager`)
- Updated Electron main process IPC bridges, LAN sync server/worker, and UI management components
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.67...v1.5.68

# Vendora v1.5.67 Release Notes

## What's Changed
- Updated Electron main process IPC handlers and window state management
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.66...v1.5.67

# Vendora v1.5.66 Release Notes

## What's Changed
- Integrated `timezoneHelper` for regional date and timestamp handling
- Updated local database schema handling, main process IPC routines, LAN sync worker/server, and settings manager UI
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.65...v1.5.66

# Vendora v1.5.65 Release Notes

## What's Changed
- Enhanced sales history, cashier settlement, local database handlers, main process IPC bridges, and print generators
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.64...v1.5.65

# Vendora v1.5.64 Release Notes

## What's Changed
- Decoupled default paper format selection from invoice template style
- Enhanced paper preview modal, thermal & receipt printing formatting, printer hardware logic, and settings manager
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.63...v1.5.64

# Vendora v1.5.63 Release Notes

## What's Changed
- Enhanced billing, cashier settlement, paper preview, settings manager, and invoice HTML generator
- Improved printer hardware integration, local database handling, and receipt generation
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.62...v1.5.63

# Vendora v1.5.62 Release Notes

## What's Changed
- Enhanced sync worker reliability, local host server endpoints, and main process IPC handlers
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.61...v1.5.62

# Vendora v1.5.61 Release Notes

## What's Changed
- Enhanced LAN sync local host server, IPC handlers, and SettingsManager sync controls
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.60...v1.5.61

# Vendora v1.5.60 Release Notes

## What's Changed
- Updated Electron main process IPC handlers and performance improvements
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.59...v1.5.60

# Vendora v1.5.59 Release Notes

## What's Changed
- Enhanced App routing, BillingPage, and OwnerDashboard components
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.58...v1.5.59

# Vendora v1.5.58 Release Notes

## What's Changed
- Maintenance release with stability improvements and bug fixes
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.57...v1.5.58

# Vendora v1.5.57 Release Notes

## What's Changed
- Enhanced `StaffManager`, `SuperDashboard`, `SettingsManager`, and reusable `Modal` UI components
- Implemented cashier settlement module with split payment and cash management support
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.56...v1.5.57

# Vendora v1.5.56 Release Notes

## What's Changed
- Enhanced `CashierSettlement` component for daily drawer reconciliation and cashier settlements
- Improved Electron main process IPC handlers for cash register transaction audits
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.55...v1.5.56

# Vendora v1.5.55 Release Notes

## What's Changed
- Added cashier management module with transaction, settlement, and printer integration support
- Enhanced daily settlement tracking, cashier audit logs, and hardware device status checks
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.54...v1.5.55

# Vendora v1.5.54 Release Notes

## What's Changed
- Enhanced printer hardware integration and thermal print paper formatting in `printer.ts`
- Optimized `localDb` SQLite query helpers and Electron main process IPC channels
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.53...v1.5.54

# Vendora v1.5.53 Release Notes

## What's Changed
- Implemented session expiry modal, sync worker architecture, and related data management utilities
- Enhanced application security, token validation, and multi-user session lifecycle handling
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.52...v1.5.53

# Vendora v1.5.52 Release Notes

## What's Changed
- Implemented local LAN sync server with automated SQLite row upserting and return management integration
- Enhanced synchronization worker routines and modular management components for POS operations
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.51...v1.5.52

# Vendora v1.5.51 Release Notes

## What's Changed
- Integrated persist-enabled Zustand cart store for tab and session state management
- Enhanced `BillingPage`, `QuotationManager`, multi-tab layout navigation, and dashboard components
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.50...v1.5.51

# Vendora v1.5.50 Release Notes

## What's Changed
- Enhanced SQLite database transaction safety in `localDb`
- Improved main process IPC event handling and background sync worker stability
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.49...v1.5.50

# Vendora v1.5.49 Release Notes

## What's Changed
- Fixed cashier cash-out handling for purchase bills, returns, scrap purchases, and checkout refunds
- Enhanced `CashRegisterPanel`, local HTTP server worker, sync worker, and Electron main process IPC handlers
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.48...v1.5.49

# Vendora v1.5.48 Release Notes

## What's Changed
- Enhanced sync worker resilience, local HTTP server connection management, and main process IPC handlers
- Updated `SettingsManager` UI components for printer & hardware settings
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.47...v1.5.48

# Vendora v1.5.47 Release Notes

## What's Changed
- Integrated A4/A5 print preview system with local sync server and HTML invoice generation
- Implemented customer management UI, receipt/invoice generation utilities, and settings manager updates
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.46...v1.5.47

# Vendora v1.5.46 Release Notes

## What's Changed
- Enhanced local HTTP sync server worker and connection handling in `syncWorker`
- Improved network resilience, local DB synchronization, and IPC error handling
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.45...v1.5.46

# Vendora v1.5.45 Release Notes

## What's Changed
- Maintenance release with performance improvements, bug fixes, and updated build configurations
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.44...v1.5.45

# Vendora v1.5.44 Release Notes

## What's Changed
- Implemented user authentication flow with login, password recovery, and state management
- Refactored Electron main process with hardware integration, local DB, and IPC communication handlers
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.43...v1.5.44

# Vendora v1.5.43 Release Notes

## What's Changed
- General system stability improvements, performance optimizations, and dependency updates
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.42...v1.5.43

# Vendora v1.5.42 Release Notes

## What's Changed
- Implemented background data sync worker with LAN/cloud fallback and configuration management dashboard components
- Enhanced owner dashboard, multi-user management, SettingsManager, and SettingsPricingTiers UI
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.41...v1.5.42

# Vendora v1.5.41 Release Notes

## What's Changed
- Enhanced thermal & ESC/POS printer hardware integration and return management workflows
- Added local sync server worker and updated UI components for quotation and sales history
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.40...v1.5.41

# Vendora v1.5.40 Release Notes

## What's Changed
- Optimized `localDb` queries, SQLite connection safety, and Electron main process IPC handlers
- Enhanced `InventoryManager`, `QuotationManager`, `BillingPage`, and A4 invoice HTML templates
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.39...v1.5.40

# Vendora v1.5.39 Release Notes

## What's Changed
- Refactored paper preview modal, invoice HTML generator, and ESC/POS print format helpers
- Enhanced Select dropdown UI component, owner dashboard stats, and background sync worker logic
- Updated Vite configuration to `.mts` extension
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.38...v1.5.39

# Vendora v1.5.38 Release Notes

## What's Changed
- Implemented quotation management system with CRUD support, invoice conversion, and A4 printing functionality
- Enhanced `BillingPage` scanner-burst protection and integrated cart and weighing scale management
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.37...v1.5.38

# Vendora v1.5.37 Release Notes

## What's Changed
- Integrated UPI account badges, UPI source details display, and GST/BOS conversion indicators in `SalesHistory`
- Improved payment collection dialog with selected UPI source account tracking
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.36...v1.5.37

# Vendora v1.5.36 Release Notes

## What's Changed
- Enhanced hardware printer ESC/POS command formatting, UPI configuration settings, and print format helpers
- Improved tab state store management and billing action pane UI integrations
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.35...v1.5.36

# Vendora v1.5.35 Release Notes

## What's Changed
- Added customizable bill settings toggles for credit balance, customer GSTIN, shop address, and instructions in receipts and A4/Half-A4 invoices
- Enhanced ESC/POS hardware print formatting and billing preview options
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.34...v1.5.35

# Vendora v1.5.34 Release Notes

## What's Changed
- Initialized Electron main process improvements and added updated application icons
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.33...v1.5.34

# Vendora v1.5.33 Release Notes

## What's Changed
- Implemented background sync worker for multi-table data synchronization and priority invoice/cash updates
- Enhanced POS operations across `BillingPage`, `QuotationManager`, and Electron main process IPC bridges
- **Full Changelog**: https://github.com/emirateswebfusion/nafid-pos/compare/v1.5.32...v1.5.33

# Vendora v1.5.32 Release Notes

## What's Changed
- Implemented background data sync worker and added comprehensive management UI components
- Enhanced local database synchronization and updated staff manager, inventory, and stock report components
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.31...v1.5.32

# Vendora v1.5.31 Release Notes

## What's Changed
- Added new `FinancialReport` module to visualize business key performance indicators, sales reports, and charts
- Enhanced and refactored staff creation, roles, and granular authorization rules in `StaffManager`
- Implemented quotation manager template revisions and versions tracking in `QuotationManager`
- Updated brand visual identities, application logs, and synchronization mechanisms
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.30...v1.5.31

# Vendora v1.5.30 Release Notes

## What's Changed
- Implemented Combo Offers push and pull synchronization workers in `syncWorker`
- Fixed and optimized cash drawer local change-tracking comparisons
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.29...v1.5.30

# Vendora v1.5.29 Release Notes

## What's Changed
- Implemented Trash2 icon instead of Recycle icon in ScrapManager skeleton loading state
- Integrated POS scrap, warranty, stock reporting, and customer management interfaces
- Refactored billing, invoice generation, cashier daily settlements, and transaction tracking modules
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.28...v1.5.29

# Vendora v1.5.28 Release Notes

## What's Changed
- Added optional Pcs input field for weight-billing items in `PurchaseBillManager`
- Implemented automatic calculation and storage of `pcs_per_kg` under product `domain_attributes` during purchase bills creation/updates
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.27...v1.5.28

# Vendora v1.5.27 Release Notes

## What's Changed
- Added Support for Credit/Ledger payment method split under SPLIT payments console
- Integrated multi-tab billing systems, SQLite db schemas, cashier audit logs, and deep linking IPC bridges
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.26...v1.5.27

# Vendora v1.5.26 Release Notes

## What's Changed
- Integrated real-time cash drawer adjustments for deleted and modified invoices in CashierSettlement
- Allowed change-payment action for non-pending bills from SalesHistory for administrator roles
- Fixed discount total fallback parsing on invoice loads and removed duplicate Settings cards
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.25...v1.5.26

# Vendora v1.5.25 Release Notes

## What's Changed
- Optimized CashierSettlement daily totals and cash drawer reports
- Refactored invoice and receipt generator utilities with proper typography support
- Enhanced grade configuration settings, sorting filters, and preview modals
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.24...v1.5.25

# Vendora v1.5.24 Release Notes

## What's Changed
- Implemented a custom confirmation delete modal in `InventoryManager` instead of the browser native dialog
- Enhanced loading skeletons and background fetch stability in `SettingsPricingTiers`
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.23...v1.5.24

# Vendora v1.5.23 Release Notes

## What's Changed
- Implemented party and ledger management UI with pricing tier integration
- Added party and ledger CRUD capabilities and transaction tracking modules
- Preloaded categories and grades in BillingPage for instant form options and optimized SettingsPricingTiers loading overlays
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.22...v1.5.23

# Vendora v1.5.22 Release Notes

## What's Changed
- Implemented BillingPage scanner-burst protection and real-time scale integration
- Added checkout invoice number auto-refresh and panel layout optimizations
- Integrated cashier settlement daily cash reconciliation modules
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.21...v1.5.22

# Vendora v1.5.21 Release Notes

## What's Changed
- Implemented automatic background downloading on application startup
- Configured GitHub authorization headers to autoUpdater for private repository downloads
- Fixed soft-delete string parsing and real-time sales history synchronization
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.17...v1.5.21

# Vendora v1.5.17 Release Notes

## What's Changed
- Implemented Electron main process entry point, database schema migrations, and sync worker enhancements
- Added cashier settlement event handlers and invoice reconciliation updates
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.16...v1.5.17

# Vendora v1.5.16 Release Notes

## What's Changed
- Implemented CashierSettlement, PartyManager, SettingsPricingTiers components, and POS main modules
- Added support for SQLite background sync worker and transaction reconciliation
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.15...v1.5.16

# Vendora v1.5.15 Release Notes

## What's Changed
- Implemented CashierSettlement updates for managing pending invoices and daily cash reconciliation
- Improved main process IPC handlers and barcode management modules
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.14...v1.5.15

# Vendora v1.5.14 Release Notes

## What's Changed
- Implemented product and inventory tracking (InventoryManager), bulk barcode label configuration, and POS cart checkout features
- Configured local Electron database synchronization, cashier reconciliation, and SQLite database migration schema
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.13...v1.5.14

# Vendora v1.5.13 Release Notes

## What's Changed
- Implemented PrintReceiptView component for rendering dynamic POS receipt layout with QR and barcode support
- Integrated print receipt template, inventory administration, purchase tracking, and stock report enhancements
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.12...v1.5.13

# Vendora v1.5.12 Release Notes

## What's Changed
- Implemented multi-tab billing system, inventory management, and purchase billing modules
- Configured local SQLite database schemas, preload security validation, and Electron sync worker architecture
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.11...v1.5.12

# Vendora v1.5.11 Release Notes

## What's Changed
- Implemented real-time scale integration and cart/billing updates
- Improved printer hardware integration, SQLite local database persistence, and sales history updates
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.10...v1.5.11

# Vendora v1.5.10 Release Notes

## What's Changed
- Implemented barcode/label printing, pricing tiers (SettingsPricingTiers), tenant management dashboard, and database synchronization enhancements
- Added support for QR and Code128 barcode generation
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.9...v1.5.10

# Vendora v1.5.9 Release Notes

## What's Changed
- Implemented POS billing, inventory management, return manager, and stock reporting features
- Fixed icon missing import compile errors and configured tsconfig for development parameter flexibility
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.8...v1.5.9

# Vendora v1.5.8 Release Notes

## What's Changed
- Implemented POS billing system components, receipt rendering, and print template updates
- Added PurchaseBillManager round-off calculations and tax rate adjustments
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.7...v1.5.8

# Vendora v1.5.7 Release Notes

## What's Changed
- Implemented receipt generation, printing service, and sales history updates
- Corrected cash register settlement logic
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.6...v1.5.7

# Vendora v1.5.6 Release Notes

## What's Changed
- Implemented PurchaseBillManager component for viewing and managing purchase bills
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.5...v1.5.6

# Vendora v1.5.5 Release Notes

## What's Changed
- Release build and packaging updates
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.4...v1.5.5

# Vendora v1.5.4 Release Notes

## What's Changed
- [Release notes to be filled with this release's changes]
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.3...v1.5.4

# Vendora v1.5.3 Release Notes

## What's Changed
- Release build and packaging updates
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.2...v1.5.3

# Vendora v1.5.2 Release Notes

## What's Changed
- Implemented core billing interface with cart management, payment processing, and multi-series invoicing
- Added PurchaseBillManager and BillingPage components with electron main process integration
- Implemented ScrapManager component for scrap inventory management
- Added background cloud synchronization worker and core POS utilities
- Implemented inventory management, staff management, and system settings components
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.5.1...v1.5.2

# Vendora v1.4.3 Release Notes

## What's Changed
- Added customer phone and address fields to scrap transactions
- Enhanced button styles and accessibility across components
- Added invoice type filtering and display in sales history
- Implemented Bill of Supply → GST conversion with profit % configuration
- Added loyalty program features with customer management
- Enabled auto-update checks on startup and hourly
- **Full Changelog**: https://github.com/emirateswebfusion/vendora-pos/compare/v1.4.2...v1.4.3

# Vendora v1.4.2 Release Notes

## What's Changed
- Full commit log: https://github.com/emirateswebfusion/vendora-pos/compare/v1.4.1...v1.4.2

# Vendora v1.3.1 Release Notes

## New Features & Enhancements
- **Inventory Management**:
  - Implemented auto-increment logic for new product barcodes to skip alphabetic prefixes, generating purely numeric barcodes.
- **Settings**:
  - Added "Purchase Price Coding" feature for Owners to map price digits to specific alphabets.

## Bug Fixes
- Fixed TypeScript declaration errors and unused imports in SettingsManager.tsx.

# Vendora v1.3.0 Release Notes

## New Features & Enhancements
- **Barcode & Label Printing**: 
  - Added multi-column barcode label printing with dimension settings.
  - New option to print labels without prices while retaining the product name.
  - Distinguish between "SP" (Special Price) and "OFF" label prefixes based on discount type.
  - Auto-generate barcode logic with the new `item_code` field.
  - Added an inline print modal for easier label printing from the inventory view.
- **Inventory Management**: 
  - Migrated discount and offer attributes to native database columns for better querying and sync.
  - Implemented `db:adjustStock` IPC handler for robust stock adjustments.
  - UI refinements including cleaner labels and streamlined layouts.
- **Data Sync & Security**: 
  - Enforced strict `tenant_id` filtering across server and edge apps to prevent cross-tenant data leaks.
- **User Interface**: 
  - Introduced Skeleton loading states (`Skeleton.tsx`) for smoother data fetching experiences.
  - Added a restart button in settings for easier app reloading.
  - Show biller names directly in the sales history view.
  - Overall polish on Owner Dashboard, Sales History, Staff Manager, and Modal UI.

## Bug Fixes
- Fixed a bug with product soft deletion not syncing properly.
- Resolved backspace and scroll wheel issues in numeric input fields.
- Fixed Typescript errors related to new database columns and label dimensions.
