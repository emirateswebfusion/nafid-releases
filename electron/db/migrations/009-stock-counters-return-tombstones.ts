import type { Migration } from './runner.js';
import { buildOutboxTriggerStatements } from '../statements/outbox.js';
import { SYNCED_TABLES } from './002-sync-outbox.js';

export const m009StockCountersReturnTombstones: Migration = {
  version: 9, name: 'stock-counters-return-tombstones',
  up: db => {
    db.exec("ALTER TABLE products ADD COLUMN stock_counters TEXT DEFAULT '{}'");
    db.exec('ALTER TABLE returns ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0');
    // A separate installation identity survives login/tenant changes; never derive it from a user id.
    db.exec("INSERT OR IGNORE INTO sync_meta(key,value) VALUES('stock_origin', lower(hex(randomblob(16))))");
    db.exec(`CREATE TRIGGER stock_counter_local_update AFTER UPDATE OF current_stock ON products
      WHEN NOT EXISTS (SELECT 1 FROM sync_apply_guard) AND NEW.current_stock IS NOT OLD.current_stock
      BEGIN
        UPDATE products SET stock_counters = json_set(COALESCE(OLD.stock_counters, '{}'),
          '$."' || (SELECT value FROM sync_meta WHERE key = 'stock_origin') ||
            CASE WHEN NEW.current_stock > OLD.current_stock THEN ':a"' ELSE ':r"' END,
          COALESCE(json_extract(COALESCE(OLD.stock_counters, '{}'),
            '$."' || (SELECT value FROM sync_meta WHERE key = 'stock_origin') ||
              CASE WHEN NEW.current_stock > OLD.current_stock THEN ':a"' ELSE ':r"' END), 0)
            + ABS(COALESCE(NEW.current_stock, 0) - COALESCE(OLD.current_stock, 0)))
          WHERE product_id = NEW.product_id;
      END`);
    for (const statement of buildOutboxTriggerStatements(db, SYNCED_TABLES)) db.exec(statement);
  },
};
