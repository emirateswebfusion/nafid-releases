import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

let db: Database.Database;

export function initDb() {
  const dbPath = path.join(app.getPath('userData'), 'vendora.db');
  
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Create tables with full schema matching cloud sync expectations
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        role TEXT DEFAULT 'CASHIER',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
        product_id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT NOT NULL,
        sku_barcode TEXT,
        item_code TEXT,
        category TEXT,
        hsn_sac_code TEXT,
        purchase_price REAL DEFAULT 0,
        base_price REAL NOT NULL,
        is_gst_applicable INTEGER DEFAULT 1,
        tax_rate_percent REAL DEFAULT 0,
        uom TEXT DEFAULT 'Pcs',
        brand_manufacturer TEXT,
        current_stock REAL DEFAULT 0,
        reorder_level REAL DEFAULT 0,
        domain_attributes TEXT DEFAULT '{}',
        discount_percent REAL,
        discount_flat REAL,
        offer_price REAL,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, name, brand_manufacturer),
        UNIQUE(tenant_id, sku_barcode)
    );

    CREATE TABLE IF NOT EXISTS invoices (
        invoice_id TEXT PRIMARY KEY,
        tenant_id TEXT,
        invoice_number TEXT,
        invoice_type TEXT DEFAULT 'tax_invoice',
        customer_name TEXT,
        customer_phone TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        tax_total REAL NOT NULL DEFAULT 0,
        discount_total REAL DEFAULT 0,
        grand_total REAL NOT NULL DEFAULT 0,
        payment_method TEXT DEFAULT 'CASH',
        user_id TEXT,
        sync_status TEXT DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, invoice_number)
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
        item_id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        tenant_id TEXT,
        product_id TEXT NOT NULL,
        name TEXT,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        tax_amount REAL DEFAULT 0,
        total REAL NOT NULL,
        FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id),
        FOREIGN KEY (product_id) REFERENCES products(product_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
        tenant_id TEXT DEFAULT 'global',
        key TEXT NOT NULL,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, key)
    );
  `);

  // Migration: Add missing columns if they don't exist (Idempotent)
  const schemaMap: any = {
    products: [
        'tenant_id', 'hsn_sac_code', 'is_gst_applicable', 'uom', 'brand_manufacturer', 
        'reorder_level', 'domain_attributes', 'is_deleted', 'sync_status', 'item_code',
        'discount_percent', 'discount_flat', 'offer_price', 'created_at'
    ],
    invoices: [
        'tenant_id', 'invoice_number', 'invoice_type', 'subtotal', 'tax_total', 
        'discount_total', 'grand_total', 'payment_method', 'user_id', 'sync_status'
    ],
    invoice_items: [
        'item_id', 'invoice_id', 'tenant_id', 'product_id', 'name', 'quantity', 'unit_price', 'tax_amount', 'total'
    ],
    users: [
        'user_id', 'tenant_id', 'name', 'email', 'role', 'created_at'
    ]
  };

  for (const table in schemaMap) {
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    const existingCols = info.map((c: any) => c.name);

    for (const col of schemaMap[table]) {
      if (!existingCols.includes(col)) {
        console.log(`[DB Migration] Adding missing column ${col} to ${table} table...`);
        // We use TEXT or REAL depending on column name suffix or type
        let type = 'TEXT';
        if (['discount_percent', 'discount_flat', 'offer_price'].includes(col)) {
          type = 'REAL';
        } else if (col.includes('price') || col.includes('total') || col.includes('amount') || col.includes('tax') || col.includes('stock') || col.includes('level')) {
          type = 'REAL DEFAULT 0';
        } else if (col === 'created_at' || col === 'updated_at') {
          type = 'DATETIME'; // SQLite does not allow CURRENT_TIMESTAMP in ALTER TABLE ADD COLUMN
        }
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      }
    }
  }
  
  // Cleanup/Migration for legacy columns (if any existed before restoration)
  try {
     // If user had total_amount instead of grand_total
     const invInfo = db.prepare(`PRAGMA table_info(invoices)`).all();
     if (invInfo.some((c: any) => c.name === 'total_amount') && invInfo.some((c: any) => c.name === 'grand_total')) {
        db.exec("UPDATE invoices SET grand_total = total_amount WHERE grand_total = 0 AND total_amount > 0");
     }
  } catch (e) {}

  // Ensure unique indexes for existing installations
  try {
    db.exec("DROP INDEX IF EXISTS idx_uq_product_name_tenant");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_product_name_brand_tenant ON products(tenant_id, name, brand_manufacturer)");
  } catch (e: any) {
    console.warn('[DB Migration] Could not create unique index for name/brand. Duplicate data might exist.', e.message);
  }

  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_product_barcode_tenant ON products(tenant_id, sku_barcode)");
  } catch (e: any) {
    console.warn('[DB Migration] Could not create unique index for barcode. Duplicate data might exist.', e.message);
  }

  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_invoice_number_tenant ON invoices(tenant_id, invoice_number)");
  } catch (e: any) {
    console.warn('[DB Migration] Could not create unique index for invoice number. Duplicate data might exist.', e.message);
  }

  // Fix inline constraint for products table by recreating it if needed
  try {
    const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'").get() as any;
    if (tableSql && (!/UNIQUE\s*\([^)]*brand_manufacturer[^)]*\)/i.test(tableSql.sql) || !/UNIQUE\s*\([^)]*sku_barcode[^)]*\)/i.test(tableSql.sql))) {
      console.log('[DB Migration] Recreating products table to fix inline UNIQUE constraint...');
      db.exec('PRAGMA foreign_keys=off;');
      
      const migrateTable = db.transaction(() => {
        db.exec('ALTER TABLE products RENAME TO products_old;');
        db.exec(`
          CREATE TABLE products (
              product_id TEXT PRIMARY KEY,
              tenant_id TEXT,
              name TEXT NOT NULL,
              sku_barcode TEXT,
              item_code TEXT,
              category TEXT,
              hsn_sac_code TEXT,
              purchase_price REAL DEFAULT 0,
              base_price REAL NOT NULL,
              is_gst_applicable INTEGER DEFAULT 1,
              tax_rate_percent REAL DEFAULT 0,
              uom TEXT DEFAULT 'Pcs',
              brand_manufacturer TEXT,
              current_stock REAL DEFAULT 0,
              reorder_level REAL DEFAULT 0,
              domain_attributes TEXT DEFAULT '{}',
              discount_percent REAL,
              discount_flat REAL,
              offer_price REAL,
              is_deleted INTEGER DEFAULT 0,
              sync_status TEXT DEFAULT 'SYNCED',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(tenant_id, name, brand_manufacturer),
              UNIQUE(tenant_id, sku_barcode)
          );
        `);
        const columnsInfo = db.prepare("PRAGMA table_info(products_old)").all();
        const columnNames = columnsInfo.map((c: any) => c.name).join(', ');
        db.exec(`INSERT INTO products (${columnNames}) SELECT ${columnNames} FROM products_old;`);
        db.exec('DROP TABLE products_old;');
      });
      
      migrateTable();
      db.exec('PRAGMA foreign_keys=on;');
      console.log('[DB Migration] Products table recreated successfully.');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to recreate products table for constraint update:', e.message);
  }

  // Migrate settings table to include tenant_id if it's missing
  try {
    const settingsInfo = db.prepare(`PRAGMA table_info(settings)`).all();
    if (!settingsInfo.some((c: any) => c.name === 'tenant_id')) {
      console.log('[DB Migration] Upgrading settings table to support tenant_id...');
      db.exec(`
        CREATE TABLE settings_new (
            tenant_id TEXT DEFAULT 'global',
            key TEXT NOT NULL,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (tenant_id, key)
        );
        INSERT INTO settings_new (key, value, updated_at) SELECT key, value, updated_at FROM settings;
        DROP TABLE settings;
        ALTER TABLE settings_new RENAME TO settings;
      `);
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to migrate settings table', e.message);
  }

  // Ensure defaults for is_deleted are set for legacy data
  db.exec("UPDATE products SET is_deleted = 0 WHERE is_deleted IS NULL");

  // Backfill created_at and updated_at for existing rows
  db.exec("UPDATE products SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL");
  db.exec("UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL");

  // Initialize hardware defaults if empty
  const hasPrinter = db.prepare("SELECT 1 FROM settings WHERE key = 'printer_config'").get();
  if (!hasPrinter) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      'printer_config', 
      JSON.stringify({ type: 'network', ip: '192.168.1.100', port: 9100 })
    );
  }
  
  const hasScale = db.prepare("SELECT 1 FROM settings WHERE key = 'scale_config'").get();
  if (!hasScale) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      'scale_config', 
      JSON.stringify({ path: 'COM3', baudRate: 9600 })
    );
  }
}

export function getDb() {
  if (!db) initDb();
  return db;
}
