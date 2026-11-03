import type { Migration } from './runner.js';
import { buildOutboxTriggerStatements } from '../statements/outbox.js';

/** Restaurant mode tables (docs/architecture/restaurant-mode-design.md §4). Synced like other business tables. */
export const RESTAURANT_SYNCED_TABLES = [
  'dining_tables',
  'kitchen_stations',
  'modifier_groups',
  'modifiers',
  'restaurant_orders',
  'restaurant_order_lines',
  'kot_tickets',
] as const;

const SYNC_COLUMNS = `
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  is_deleted INTEGER NOT NULL DEFAULT 0,
  row_version INTEGER NOT NULL DEFAULT 0,
  origin TEXT`;

export const m015Restaurant: Migration = {
  version: 15,
  name: 'restaurant',
  up: db => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dining_tables (
        table_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        label TEXT NOT NULL,
        area TEXT,
        seats INTEGER NOT NULL DEFAULT 4,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,${SYNC_COLUMNS}
      );
      CREATE TABLE IF NOT EXISTS kitchen_stations (
        station_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        categories TEXT NOT NULL DEFAULT '[]',
        print_copies INTEGER NOT NULL DEFAULT 1,
        is_default INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,${SYNC_COLUMNS}
      );
      CREATE TABLE IF NOT EXISTS modifier_groups (
        group_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        min_select INTEGER NOT NULL DEFAULT 0,
        max_select INTEGER NOT NULL DEFAULT 1,
        categories TEXT NOT NULL DEFAULT '[]',
        product_ids TEXT NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0,${SYNC_COLUMNS}
      );
      CREATE TABLE IF NOT EXISTS modifiers (
        modifier_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        tax_rate REAL NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,${SYNC_COLUMNS}
      );
      CREATE TABLE IF NOT EXISTS restaurant_orders (
        order_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        order_no TEXT NOT NULL,
        order_type TEXT NOT NULL,
        table_id TEXT,
        covers INTEGER NOT NULL DEFAULT 0,
        waiter_user_id TEXT,
        waiter_name TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        delivery_address TEXT,
        channel TEXT NOT NULL DEFAULT 'OWN',
        channel_ref TEXT,
        delivery_fee REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'OPEN',
        billing_terminal TEXT,
        billing_since TEXT,
        invoice_id TEXT,
        invoice_number TEXT,
        parent_order_id TEXT,
        merged_into_order_id TEXT,
        note TEXT,
        cancel_reason TEXT,
        opened_by TEXT,
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        business_date TEXT NOT NULL,${SYNC_COLUMNS}
      );
      CREATE TABLE IF NOT EXISTS restaurant_order_lines (
        line_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        tax_rate REAL NOT NULL DEFAULT 0,
        modifiers TEXT NOT NULL DEFAULT '[]',
        note TEXT,
        seat INTEGER,
        station_id TEXT,
        kot_id TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        void_reason TEXT,
        voided_by TEXT,
        voided_at TEXT,
        void_kot_id TEXT,
        moved_from_line_id TEXT,
        created_by TEXT,${SYNC_COLUMNS}
      );
      CREATE TABLE IF NOT EXISTS kot_tickets (
        kot_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        kot_no TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'NEW',
        station_id TEXT,
        station_name TEXT,
        printed_at TEXT,
        print_error TEXT,
        kds_status TEXT NOT NULL DEFAULT 'NEW',
        kds_updated_at TEXT,
        created_by TEXT,
        business_date TEXT NOT NULL,${SYNC_COLUMNS}
      );
      -- Daily order / KOT counters of this terminal (operational numbers, never synced).
      CREATE TABLE IF NOT EXISTS restaurant_counters (counter_key TEXT PRIMARY KEY, value INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_restaurant_orders_status ON restaurant_orders(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_restaurant_orders_invoice ON restaurant_orders(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_restaurant_order_lines_order ON restaurant_order_lines(order_id);
      CREATE INDEX IF NOT EXISTS idx_kot_tickets_order ON kot_tickets(order_id);
      CREATE INDEX IF NOT EXISTS idx_kot_tickets_kds ON kot_tickets(tenant_id, business_date, kds_status);

      -- Forward-only rules, enforced for every writer (local, LAN ingest, cloud pull): a settled or cancelled order,
      -- a voided line and a later kitchen status are never taken back by a stale copy of the row.
      CREATE TRIGGER IF NOT EXISTS restaurant_orders_final_status BEFORE UPDATE OF status ON restaurant_orders
      WHEN OLD.status IN ('SETTLED', 'CANCELLED') AND NEW.status IS NOT OLD.status
      BEGIN SELECT RAISE(IGNORE); END;
      CREATE TRIGGER IF NOT EXISTS restaurant_order_lines_void_final BEFORE UPDATE OF status ON restaurant_order_lines
      WHEN OLD.status = 'VOIDED' AND NEW.status IS NOT 'VOIDED'
      BEGIN SELECT RAISE(IGNORE); END;
      CREATE TRIGGER IF NOT EXISTS kot_tickets_kds_forward BEFORE UPDATE OF kds_status ON kot_tickets
      WHEN (CASE NEW.kds_status WHEN 'NEW' THEN 0 WHEN 'PREPARING' THEN 1 WHEN 'READY' THEN 2 WHEN 'SERVED' THEN 3 ELSE -1 END)
         < (CASE OLD.kds_status WHEN 'NEW' THEN 0 WHEN 'PREPARING' THEN 1 WHEN 'READY' THEN 2 WHEN 'SERVED' THEN 3 ELSE -1 END)
      BEGIN SELECT RAISE(IGNORE); END;
    `);
    db.exec(`INSERT OR IGNORE INTO sync_meta(key, value) VALUES ('origin', lower(hex(randomblob(4))))`);
    for (const sql of buildOutboxTriggerStatements(db, RESTAURANT_SYNCED_TABLES)) db.exec(sql);
  },
};
