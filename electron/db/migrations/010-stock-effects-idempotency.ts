import type { Migration } from './runner.js';

export const m010StockEffectsIdempotency: Migration = {
  version: 10, name: 'stock-effects-idempotency',
  up: db => {
    // Document-keyed, idempotent stock movements. The effect id is a deterministic
    // hash of (document, product, direction, quantity, version) so the same
    // document change on two disconnected terminals produces the same id and is
    // applied only once across sync. The per-document/product version ensures a
    // create (out), delete (in) and restore (out) of the same bill get distinct
    // ids even when direction+quantity repeat. Independent documents keep
    // distinct ids and are never collapsed.
    db.exec(`
      CREATE TABLE IF NOT EXISTS stock_effects (
        effect_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        document_type TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        direction TEXT NOT NULL,
        origin TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_stock_effects_product ON stock_effects(product_id, sync_status);
      CREATE INDEX IF NOT EXISTS idx_stock_effects_document ON stock_effects(document_id, document_type);
    `);

    // Migration 009 initialized every existing product's stock_counters to '{}',
    // including products that carried pre-upgrade PENDING stock changes. An empty
    // non-NULL counter state selects movement-based ingestion and discards the
    // incoming absolute balance, silently losing those changes. Where no counter
    // history exists there is nothing to merge by maximum, so keep the counters
    // NULL and retain the PENDING status: the timestamp fallback path preserves
    // the pending balance instead of overwriting it with a zero delta.
    db.exec(`
      UPDATE products
      SET stock_counters = NULL
      WHERE stock_counters = '{}'
        AND sync_status = 'PENDING';
    `);
  },
};
