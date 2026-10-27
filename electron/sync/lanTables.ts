/**
 * Which tables the LAN host (primary terminal) serves to paired terminals, and which it accepts from them.
 * Pulls may read every shared table; pushes are limited to the tables terminals actually send
 * (electron/sync/entities/*Sync.ts). Staff accounts, roles, salaries and sync metadata are owned by the primary and
 * can never be overwritten over the LAN. Child item rows (invoice_items, …) are written only through their parent.
 */
export const LAN_PULL_TABLES: ReadonlySet<string> = new Set([
  'users', 'product_grades', 'products', 'invoices', 'invoice_items',
  'parties', 'party_ledger', 'settings', 'scrap_categories', 'scrap_transactions',
  'quotations', 'quotation_items', 'warranties', 'purchase_bills', 'cash_drawer',
  'cash_transactions', 'cashier_audit_log', 'cash_categories', 'purchase_bill_items',
  'returns', 'return_items', 'customers', 'loyalty_transactions', 'payment_sources',
  'payment_source_transactions', 'pricing_tiers', 'product_pricing', 'combo_offers',
  'combo_items', 'staff', 'staff_salaries', 'staff_transactions', 'staff_ledger', 'staff_attendance', 'sync_meta',
]);

export const LAN_PUSH_TABLES: ReadonlySet<string> = new Set([
  'cash_categories', 'cash_drawer', 'cash_transactions', 'cashier_audit_log',
  'combo_offers', 'customers', 'invoices', 'loyalty_transactions', 'parties', 'party_ledger',
  'payment_source_transactions', 'payment_sources', 'pricing_tiers', 'product_grades', 'product_pricing', 'products',
  'purchase_bills', 'quotations', 'returns', 'scrap_categories', 'scrap_transactions', 'settings', 'warranties',
]);
