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

    CREATE TABLE IF NOT EXISTS product_grades (
        grade_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        category TEXT NOT NULL,
        grade_name TEXT NOT NULL,
        rate REAL NOT NULL DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, category, grade_name)
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
        billing_type TEXT DEFAULT 'PIECE',
        grade_id TEXT,
        pricing_mode TEXT DEFAULT 'FIXED_PRICE',
        average_weight_per_piece REAL,
        weight_override_allowed INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        print_status TEXT DEFAULT 'PENDING',
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
        customer_gstin TEXT,
        customer_state TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        tax_total REAL NOT NULL DEFAULT 0,
        discount_total REAL DEFAULT 0,
        discount_type TEXT DEFAULT 'FIXED',
        discount_value REAL DEFAULT 0,
        grand_total REAL NOT NULL DEFAULT 0,
        payment_method TEXT DEFAULT 'CASH',
        received_amount REAL DEFAULT 0,
        balance_amount REAL DEFAULT 0,
        user_id TEXT,
        sync_status TEXT DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
        tax_amount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        sync_status TEXT DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id),
        FOREIGN KEY (product_id) REFERENCES products(product_id)
    );

    CREATE TABLE IF NOT EXISTS parties (
        party_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        balance REAL NOT NULL DEFAULT 0,
        notes TEXT,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
        tenant_id TEXT DEFAULT 'global',
        key TEXT NOT NULL,
        value TEXT,
        sync_status TEXT DEFAULT 'SYNCED',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, key)
    );

    CREATE TABLE IF NOT EXISTS scrap_categories (
        scrap_category_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, name)
    );

    CREATE TABLE IF NOT EXISTS scrap_items (
        scrap_item_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        scrap_category_id TEXT,
        purchase_price REAL DEFAULT 0,
        selling_price REAL DEFAULT 0,
        current_stock REAL DEFAULT 0,
        unit TEXT DEFAULT 'Kgs',
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, name)
    );

    CREATE TABLE IF NOT EXISTS scrap_transactions (
        transaction_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('PURCHASE', 'SALE')),
        scrap_item_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        rate REAL NOT NULL,
        total_amount REAL NOT NULL,
        party_name TEXT,
        notes TEXT,
        transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quotations (
        quotation_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        quotation_number TEXT NOT NULL,
        customer_name TEXT,
        customer_phone TEXT,
        customer_address TEXT,
        terms_conditions TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        tax_total REAL NOT NULL DEFAULT 0,
        grand_total REAL NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE',
        converted_to_invoice INTEGER DEFAULT 0,
        invoice_id TEXT,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, quotation_number)
    );

    CREATE TABLE IF NOT EXISTS quotation_items (
        item_id TEXT PRIMARY KEY,
        quotation_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        product_id TEXT,
        name TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        weight REAL,
        rate REAL NOT NULL DEFAULT 0,
        amount REAL NOT NULL DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quotation_id) REFERENCES quotations(quotation_id)
    );

    CREATE TABLE IF NOT EXISTS warranties (
        warranty_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        invoice_id TEXT,
        invoice_item_id TEXT,
        customer_name TEXT NOT NULL,
        customer_phone TEXT,
        product_name TEXT NOT NULL,
        product_details TEXT,
        purchase_date TEXT NOT NULL,
        warranty_period_days INTEGER NOT NULL,
        expiry_date TEXT NOT NULL,
        notes TEXT,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: Add missing columns if they don't exist (Idempotent)
  const schemaMap: any = {
    product_grades: [
        'tenant_id', 'category', 'grade_name', 'rate', 'is_deleted', 'sync_status', 'created_at', 'updated_at'
    ],
    products: [
        'tenant_id', 'hsn_sac_code', 'is_gst_applicable', 'uom', 'brand_manufacturer', 
        'reorder_level', 'domain_attributes', 'is_deleted', 'sync_status', 'item_code',
        'discount_percent', 'discount_flat', 'offer_price', 'created_at',
        'billing_type', 'grade_id', 'pricing_mode', 'average_weight_per_piece', 'weight_override_allowed',
        'print_status'
    ],
    invoices: [
        'tenant_id', 'invoice_number', 'invoice_type', 'subtotal', 'tax_total', 
        'discount_total', 'discount_type', 'discount_value', 'grand_total', 'payment_method', 'user_id', 'sync_status',
        'customer_gstin', 'customer_state', 'received_amount', 'balance_amount', 'updated_at'
    ],
    invoice_items: [
        'item_id', 'invoice_id', 'tenant_id', 'product_id', 'name', 'quantity', 'unit_price', 'tax_amount', 'total'
    ],
    users: [
        'user_id', 'tenant_id', 'name', 'email', 'role', 'created_at'
    ],
    settings: [
        'tenant_id', 'key', 'value', 'sync_status', 'updated_at'
    ],
    parties: [
        'party_id', 'tenant_id', 'name', 'phone', 'balance', 'notes', 'is_deleted', 'sync_status', 'created_at', 'updated_at'
    ],
    scrap_categories: [
        'scrap_category_id', 'tenant_id', 'name', 'is_deleted', 'sync_status', 'created_at', 'updated_at'
    ],
    scrap_items: [
        'scrap_item_id', 'tenant_id', 'name', 'scrap_category_id', 'purchase_price', 'selling_price', 'current_stock', 'unit', 'is_deleted', 'sync_status', 'created_at', 'updated_at'
    ],
    scrap_transactions: [
        'transaction_id', 'tenant_id', 'type', 'scrap_item_id', 'quantity', 'rate', 'total_amount', 'party_name', 'notes', 'transaction_date', 'sync_status', 'created_at'
    ],
    quotations: [
        'quotation_id', 'tenant_id', 'quotation_number', 'customer_name', 'customer_phone', 'customer_address', 'terms_conditions', 'subtotal', 'tax_total', 'grand_total', 'status', 'converted_to_invoice', 'invoice_id', 'sync_status', 'created_at', 'updated_at'
    ],
    quotation_items: [
        'item_id', 'quotation_id', 'tenant_id', 'product_id', 'name', 'quantity', 'weight', 'rate', 'amount', 'sync_status', 'created_at'
    ],
    warranties: [
        'warranty_id', 'tenant_id', 'invoice_id', 'invoice_item_id', 'customer_name', 'customer_phone', 'product_name', 'product_details', 'purchase_date', 'warranty_period_days', 'expiry_date', 'notes', 'sync_status', 'created_at', 'updated_at'
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
        if (col === 'weight_override_allowed') {
          type = 'INTEGER DEFAULT 0';
        } else if (col === 'print_status') {
          type = "TEXT DEFAULT 'PENDING'";
        } else if (['discount_percent', 'discount_flat', 'offer_price', 'average_weight_per_piece', 'rate'].includes(col)) {
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

  // Sanitize empty string sku_barcodes to NULL before applying unique constraints
  // SQLite treats multiple NULLs as distinct, but multiple empty strings as duplicates
  try {
    db.exec("UPDATE products SET sku_barcode = NULL WHERE trim(sku_barcode) = ''");
  } catch (e: any) {
    console.warn('[DB Migration] Failed to sanitize empty sku_barcodes:', e.message);
  }

  // Deduplicate actual sku_barcode conflicts before applying unique constraints
  try {
    db.exec(`
      UPDATE products 
      SET sku_barcode = sku_barcode || '-dup-' || substr(product_id, 1, 4),
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      WHERE product_id NOT IN (
          SELECT MIN(product_id)
          FROM products
          WHERE sku_barcode IS NOT NULL
          GROUP BY tenant_id, sku_barcode
      ) AND sku_barcode IS NOT NULL
    `);
  } catch (e: any) {
    console.warn('[DB Migration] Failed to deduplicate sku_barcodes:', e.message);
  }

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
        db.exec(`
          CREATE TABLE products_new (
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
              billing_type TEXT DEFAULT 'PIECE',
              grade_id TEXT,
              pricing_mode TEXT DEFAULT 'FIXED_PRICE',
              average_weight_per_piece REAL,
              weight_override_allowed INTEGER DEFAULT 0,
              sync_status TEXT DEFAULT 'SYNCED',
              print_status TEXT DEFAULT 'PENDING',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(tenant_id, name, brand_manufacturer),
              UNIQUE(tenant_id, sku_barcode)
          );
        `);
        const columnsInfo = db.prepare("PRAGMA table_info(products)").all();
        const columnNames = columnsInfo.map((c: any) => c.name).join(', ');
        db.exec(`INSERT INTO products_new (${columnNames}) SELECT ${columnNames} FROM products;`);
        db.exec('DROP TABLE products;');
        db.exec('ALTER TABLE products_new RENAME TO products;');
      });
      
      migrateTable();
      db.exec('PRAGMA foreign_keys=on;');
      console.log('[DB Migration] Products table recreated successfully.');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to recreate products table for constraint update:', e.message);
  }

  // Repair corrupted invoice_items foreign key pointing to products_old
  try {
    const invItemsInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='invoice_items'").get() as any;
    if (invItemsInfo && invItemsInfo.sql.includes('products_old')) {
      console.log('[DB Migration] Repairing corrupted invoice_items foreign key...');
      db.exec('PRAGMA foreign_keys=off;');
      const repairTable = db.transaction(() => {
         db.exec(`
          CREATE TABLE invoice_items_new (
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
         `);
         const cols = db.prepare("PRAGMA table_info(invoice_items)").all().map((c: any) => c.name).join(', ');
         db.exec(`INSERT INTO invoice_items_new (${cols}) SELECT ${cols} FROM invoice_items;`);
         db.exec('DROP TABLE invoice_items;');
         db.exec('ALTER TABLE invoice_items_new RENAME TO invoice_items;');
      });
      repairTable();
      db.exec('PRAGMA foreign_keys=on;');
      console.log('[DB Migration] invoice_items repaired successfully.');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to repair invoice_items table:', e.message);
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
            sync_status TEXT DEFAULT 'SYNCED',
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

  // Fix inconsistent ISO date strings in all tables
  const dateFixQueries = [
    "UPDATE products SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE products SET updated_at = REPLACE(REPLACE(updated_at, 'T', ' '), 'Z', '') WHERE updated_at LIKE '%T%Z'",
    "UPDATE invoices SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE users SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE settings SET updated_at = REPLACE(REPLACE(updated_at, 'T', ' '), 'Z', '') WHERE updated_at LIKE '%T%Z'",
    "UPDATE product_grades SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE product_grades SET updated_at = REPLACE(REPLACE(updated_at, 'T', ' '), 'Z', '') WHERE updated_at LIKE '%T%Z'",
    "UPDATE parties SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE parties SET updated_at = REPLACE(REPLACE(updated_at, 'T', ' '), 'Z', '') WHERE updated_at LIKE '%T%Z'",
  ];
  for (const q of dateFixQueries) {
    try { db.exec(q); } catch (e: any) { console.warn('[DB] Date fix query failed:', e.message); }
  }

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
