import type { Migration } from './runner.js';

export const SYNCED_TABLES = [
  'cash_drawer',
  'cash_transactions',
  'cash_categories',
  'cashier_audit_log',
  'payment_sources',
  'payment_source_transactions',
  'product_grades',
  'pricing_tiers',
  'product_pricing',
  'products',
  'combo_offers',
  'combo_items',
  'parties',
  'party_ledger',
  'customers',
  'loyalty_transactions',
  'invoices',
  'invoice_items',
  'quotations',
  'quotation_items',
  'warranties',
  'settings',
  'scrap_categories',
  'scrap_transactions',
  'purchase_bills',
  'purchase_bill_items',
  'returns',
  'return_items',
] as const;

/** Adds schema for the sync outbox rollout without changing the current sync behavior. */
export const m002SyncOutbox: Migration = {
  version: 2,
  name: 'sync-outbox',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_outbox (
        op_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        op TEXT NOT NULL,
        row_version INTEGER NOT NULL,
        payload TEXT,
        origin TEXT NOT NULL,
        created_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        sent_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending ON sync_outbox(tenant_id, sent_at, created_at);
    `);

    const hasColumn = (table: (typeof SYNCED_TABLES)[number], column: string): boolean => {
      const columns = db.prepare('PRAGMA table_info(' + table + ')').all() as { name: string }[];
      return columns.some((item) => item.name === column);
    };

    for (const table of SYNCED_TABLES) {
      if (!hasColumn(table, 'row_version')) {
        db.exec('ALTER TABLE ' + table + ' ADD COLUMN row_version INTEGER NOT NULL DEFAULT 0');
      }
      if (!hasColumn(table, 'origin')) {
        db.exec('ALTER TABLE ' + table + ' ADD COLUMN origin TEXT');
      }
    }
  },
};
