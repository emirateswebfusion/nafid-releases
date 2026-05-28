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
  - Show cashier names directly in the sales history view.
  - Overall polish on Owner Dashboard, Sales History, Staff Manager, and Modal UI.

## Bug Fixes
- Fixed a bug with product soft deletion not syncing properly.
- Resolved backspace and scroll wheel issues in numeric input fields.
- Fixed Typescript errors related to new database columns and label dimensions.
