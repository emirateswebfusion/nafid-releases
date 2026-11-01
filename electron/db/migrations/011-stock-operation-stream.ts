import type { Migration } from './runner.js';
import { buildOutboxTriggerStatements } from '../statements/outbox.js';
import { SYNCED_TABLES } from './002-sync-outbox.js';

export const m011StockOperationStream: Migration = {
  version: 11, name: 'stock-operation-stream',
  up: db => {
    for (const table of ['invoices', 'returns', 'purchase_bills']) db.exec(`ALTER TABLE ${table} ADD COLUMN stock_revision INTEGER NOT NULL DEFAULT 0`);
    db.exec(`ALTER TABLE products ADD COLUMN stock_opening REAL;
      ALTER TABLE products ADD COLUMN stock_bootstrap TEXT;
      ALTER TABLE products ADD COLUMN stock_protocol TEXT;
      CREATE TABLE product_stock_bootstraps(tenant_id TEXT,product_id TEXT,origin TEXT,balance REAL,
        PRIMARY KEY(tenant_id,product_id,origin));
      CREATE TABLE IF NOT EXISTS sync_meta(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE IF NOT EXISTS sync_apply_guard(id INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO sync_meta(key,value) VALUES('stock_origin',lower(hex(randomblob(16))));
      UPDATE products SET stock_opening = COALESCE(current_stock,0), stock_bootstrap = CASE WHEN sync_status = 'PENDING'
        THEN json_object('origin',(SELECT value FROM sync_meta WHERE key='stock_origin'),
          'balance',COALESCE(current_stock,0),'updated_at',COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',updated_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')) ) ELSE NULL END;
      CREATE TABLE stock_operation_context(document_id TEXT,document_type TEXT);
      CREATE TABLE stock_operation_deltas(product_id TEXT PRIMARY KEY,quantity REAL NOT NULL);
      CREATE TABLE stock_operations(operation_id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,document_id TEXT NOT NULL,
        document_type TEXT NOT NULL,revision INTEGER NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL,
        origin TEXT NOT NULL,created_at TEXT NOT NULL,sync_status TEXT NOT NULL DEFAULT 'PENDING',last_error TEXT,
        UNIQUE(tenant_id,document_type,document_id,revision));
      CREATE TABLE stock_operation_heads(tenant_id TEXT,document_type TEXT,document_id TEXT,revision INTEGER NOT NULL,
        PRIMARY KEY(tenant_id,document_type,document_id));
      CREATE INDEX stock_operations_pending ON stock_operations(tenant_id,sync_status);
      CREATE TRIGGER stock_opening_insert AFTER INSERT ON products WHEN NEW.stock_opening IS NULL
      BEGIN UPDATE products SET stock_opening=COALESCE(NEW.current_stock,0) WHERE product_id=NEW.product_id; END;
      DROP TRIGGER IF EXISTS stock_counter_local_update;
      CREATE TRIGGER stock_counter_local_update AFTER UPDATE OF current_stock ON products
      WHEN NOT EXISTS(SELECT 1 FROM sync_apply_guard) AND NOT EXISTS(SELECT 1 FROM stock_operation_context)
        AND NEW.current_stock IS NOT OLD.current_stock
      BEGIN
        UPDATE products SET stock_counters=json_set(COALESCE(OLD.stock_counters,'{}'),
          '$."'||(SELECT value FROM sync_meta WHERE key='stock_origin')||CASE WHEN COALESCE(NEW.current_stock,0)>COALESCE(OLD.current_stock,0) THEN ':a"' ELSE ':r"' END,
          COALESCE(json_extract(COALESCE(OLD.stock_counters,'{}'),'$."'||(SELECT value FROM sync_meta WHERE key='stock_origin')||CASE WHEN COALESCE(NEW.current_stock,0)>COALESCE(OLD.current_stock,0) THEN ':a"' ELSE ':r"' END),0)
          +ABS(COALESCE(NEW.current_stock,0)-COALESCE(OLD.current_stock,0))) WHERE product_id=NEW.product_id;
      END;
      CREATE TRIGGER stock_operation_capture AFTER UPDATE OF current_stock ON products
      WHEN EXISTS(SELECT 1 FROM stock_operation_context) AND NEW.current_stock IS NOT OLD.current_stock
      BEGIN
        INSERT INTO stock_operation_deltas(product_id,quantity) VALUES(NEW.product_id,COALESCE(NEW.current_stock,0)-COALESCE(OLD.current_stock,0))
        ON CONFLICT(product_id) DO UPDATE SET quantity=quantity+EXCLUDED.quantity;
      END;`);
    const columns = db.prepare('PRAGMA table_info(products)').all() as { name: string }[];
    if (columns.some(c => c.name === 'row_version')) for (const sql of buildOutboxTriggerStatements(db, SYNCED_TABLES)) db.exec(sql);
  },
};
