import type { Migration } from './runner.js';

/** Lookup indexes for returns (by invoice, items by return / invoice line). Moved from initDb, where they were
 * re-created on every start. */
export const m001ReturnsIndexes: Migration = {
  version: 1,
  name: 'returns-indexes',
  up: (db) => {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_returns_invoice_id ON returns(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id);
      CREATE INDEX IF NOT EXISTS idx_return_items_invoice_item_id ON return_items(invoice_item_id);
    `);
  },
};
