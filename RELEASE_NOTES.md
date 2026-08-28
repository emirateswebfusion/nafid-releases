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
