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
