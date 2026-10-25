import type Database from 'better-sqlite3';
import { toIsoTimestamp } from '../utils/timestamps.js';

/** One-off repairs of legacy data and constraints (empty barcodes, duplicate rows, table rebuilds, date normalisation, scrap item migration). Part of initDb, run in order. */
export function runLegacyRepairs(db: Database.Database) {
  // Cleanup/Migration for legacy columns (if any existed before restoration)
  try {
     // Normalize pricing_tiers is_default column values to INTEGER 0 / 1
     db.exec("UPDATE pricing_tiers SET is_default = 0 WHERE is_default = '0' OR is_default IS NULL OR is_default = 'false'");
     db.exec("UPDATE pricing_tiers SET is_default = 1 WHERE is_default = '1' OR is_default = 'true' OR is_default = true");

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

  // Self-healing migration for paper purchase price and paper MRP
  try {
    const stalePaperProducts = db.prepare(`
      SELECT pbi.product_id, pbi.purchase_price, pbi.selling_price, p.domain_attributes
      FROM purchase_bill_items pbi
      JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
      JOIN products p ON pbi.product_id = p.product_id
      WHERE (pb.bill_type = 'GST' OR pbi.skip_stock_update = 1)
      ORDER BY pbi.rowid ASC
    `).all() as any[];
    for (const row of stalePaperProducts) {
      let da: Record<string, any> = {};
      try { da = JSON.parse(row.domain_attributes || '{}'); } catch {}
      let changed = false;
      if (row.purchase_price > 0 && !da.gst_purchase_price) {
        da.gst_purchase_price = row.purchase_price;
        da.paper_purchase_price = row.purchase_price;
        changed = true;
      }
      if (row.selling_price > 0 && !da.paper_mrp) {
        da.paper_mrp = row.selling_price;
        da.paper_base_price = row.selling_price;
        changed = true;
      }
      if (changed) {
        db.prepare(`UPDATE products SET domain_attributes = ? WHERE product_id = ?`).run(JSON.stringify(da), row.product_id);
      }
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to sync paper domain attributes:', e.message);
  }

  // Repair historical incomplete quotations that have non-zero total but 0 items due to legacy sync
  try {
    const repairedCount = db.prepare(`
      UPDATE quotations
      SET sync_status = 'PENDING'
      WHERE (subtotal > 0 OR grand_total > 0)
        AND (status IS NULL OR status != 'DELETED')
        AND quotation_id NOT IN (SELECT DISTINCT quotation_id FROM quotation_items WHERE quotation_id IS NOT NULL);
    `).run().changes;
    if (repairedCount > 0) {
      console.log(`[DB Migration] Flagged ${repairedCount} incomplete historical quotations for item re-sync.`);
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to flag incomplete quotations for re-sync:', e.message);
  }

  // Deduplicate historical quotation_items, keeping only the latest revision batch per quotation
  try {
    const dedupedCount = db.prepare(`
      DELETE FROM quotation_items
      WHERE created_at != (
        SELECT MAX(qi2.created_at)
        FROM quotation_items qi2
        WHERE qi2.quotation_id = quotation_items.quotation_id
      )
    `).run().changes;
    if (dedupedCount > 0) {
      console.log(`[DB Migration] Cleaned up ${dedupedCount} stale/duplicate quotation items.`);
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to deduplicate quotation items:', e.message);
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

  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_parties_tenant_name_phone_customer 
      ON parties(tenant_id, name, phone) 
      WHERE party_type = 'CUSTOMER' AND (is_deleted IS NULL OR is_deleted = 0);
    `);
  } catch (e: any) {
    console.warn('[DB Migration] Could not create unique index for parties:', e.message);
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
        deleted_at DATETIME,
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

  // Fix NOT NULL constraint for product_grades.offer_price by recreating it if needed
  try {
    const info = db.prepare("PRAGMA table_info(product_grades)").all() as any[];
    const offerPriceCol = info.find(c => c.name === 'offer_price');
    if (offerPriceCol && offerPriceCol.notnull === 1) {
      console.log('[DB Migration] Recreating product_grades table to allow NULL for offer_price...');
      db.exec('PRAGMA foreign_keys=off;');
      
      const migrateGradesTable = db.transaction(() => {
        db.exec(`
          CREATE TABLE product_grades_new (
              grade_id TEXT PRIMARY KEY,
              tenant_id TEXT NOT NULL,
              category TEXT NOT NULL,
              grade_name TEXT NOT NULL,
              rate REAL NOT NULL DEFAULT 0,
              purchase_price REAL NOT NULL DEFAULT 0,
              offer_price REAL,
              is_deleted INTEGER DEFAULT 0,
        deleted_at DATETIME,
              sync_status TEXT DEFAULT 'SYNCED',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(tenant_id, category, grade_name)
          );
        `);
        const columnsInfo = db.prepare("PRAGMA table_info(product_grades)").all();
        const columnNames = columnsInfo.map((c: any) => c.name).join(', ');
        db.exec(`INSERT INTO product_grades_new (${columnNames}) SELECT ${columnNames} FROM product_grades;`);
        db.exec('DROP TABLE product_grades;');
        db.exec('ALTER TABLE product_grades_new RENAME TO product_grades;');
      });
      
      migrateGradesTable();
      db.exec('PRAGMA foreign_keys=on;');
      console.log('[DB Migration] Product_grades table recreated successfully.');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to recreate product_grades table:', e.message);
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

  // HSN/SAC-coded products belong to the GST list, including zero-rated items.
  try {
    const promoted = db.prepare(`
      UPDATE products
      SET is_gst_applicable = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE COALESCE(is_deleted, 0) = 0
        AND COALESCE(is_gst_applicable, 0) <> 1
        AND TRIM(COALESCE(hsn_sac_code, '')) <> ''
    `).run().changes;
    if (promoted > 0) {
      console.log(`[DB Migration] Marked ${promoted} HSN/SAC-coded products as GST-applicable.`);
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to classify HSN/SAC-coded products:', e.message);
  }

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
    "UPDATE pricing_tiers SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE pricing_tiers SET updated_at = REPLACE(REPLACE(updated_at, 'T', ' '), 'Z', '') WHERE updated_at LIKE '%T%Z'",
    "UPDATE product_pricing SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE product_pricing SET updated_at = REPLACE(REPLACE(updated_at, 'T', ' '), 'Z', '') WHERE updated_at LIKE '%T%Z'",
    "UPDATE party_ledger SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE party_ledger SET updated_at = REPLACE(REPLACE(updated_at, 'T', ' '), 'Z', '') WHERE updated_at LIKE '%T%Z'",
  ];
  for (const q of dateFixQueries) {
    try { db.exec(q); } catch (e: any) { console.warn('[DB] Date fix query failed:', e.message); }
  }

  // Clean up any corrupted settings that contain operation failure error objects
  try {
    db.exec("DELETE FROM settings WHERE value = '{\"error\":\"Operation failed\"}'");
  } catch (e: any) {
    console.warn('[DB Migration] Settings cleanup failed:', e.message);
  }

  // Migrate legacy scrap_items data into scrap_categories (categories ARE items now)
  try {
    const hasScrapItems = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scrap_items'").get();
    if (hasScrapItems) {
      const legacyItems: any[] = db.prepare(
        "SELECT si.*, sc.name as cat_name FROM scrap_items si LEFT JOIN scrap_categories sc ON si.scrap_category_id = sc.scrap_category_id WHERE si.is_deleted = 0"
      ).all();
      for (const item of legacyItems) {
        if (item.scrap_category_id && item.cat_name) {
          // Item has a category: add its stock to the category
          db.prepare(`UPDATE scrap_categories SET current_stock = COALESCE(current_stock,0) + ?, purchase_price = MAX(COALESCE(purchase_price,0), ?), selling_price = MAX(COALESCE(selling_price,0), ?), sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`).run(
            item.current_stock || 0, item.purchase_price || 0, item.selling_price || 0, item.scrap_category_id
          );
        } else {
          // Item without a category: create a new category with this item's data
          const existing = db.prepare("SELECT scrap_category_id FROM scrap_categories WHERE tenant_id = ? AND name = ?").get(item.tenant_id, item.name);
          if (!existing) {
            db.prepare(`
              INSERT INTO scrap_categories (scrap_category_id, tenant_id, name, purchase_price, selling_price, current_stock, unit, is_deleted, sync_status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', ?, ?)
            `).run(item.scrap_item_id, item.tenant_id, item.name, item.purchase_price || 0, item.selling_price || 0, item.current_stock || 0, item.unit || 'Kgs', item.created_at || toIsoTimestamp(), item.updated_at || toIsoTimestamp());
          }
        }
      }
      // Migrate scrap_transactions to reference scrap_categories
      const legacyTxs: any[] = db.prepare(
        `SELECT st.*, si.scrap_category_id as si_cat_id FROM scrap_transactions st LEFT JOIN scrap_items si ON st.scrap_item_id = si.scrap_item_id`
      ).all();
      for (const tx of legacyTxs) {
        const catId = tx.si_cat_id || tx.scrap_category_id;
        if (catId && !tx.scrap_category_id) {
          db.prepare("UPDATE scrap_transactions SET scrap_category_id = ? WHERE transaction_id = ?").run(catId, tx.transaction_id);
        }
      }
      // Drop the scrap_items table
      db.exec("DROP TABLE IF EXISTS scrap_items");
      console.log('[DB Migration] Legacy scrap_items data migrated to scrap_categories');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Scrap items migration skipped:', e.message);
  }

  // Drop legacy scrap_item_id / scarp_item_id columns from scrap_transactions
  // Recreate the table to ensure the column is fully removed (more reliable than ALTER DROP COLUMN)
  try {
    const scrapTxCols = db.prepare(`PRAGMA table_info(scrap_transactions)`).all().map((c: any) => c.name);
    const hasLegacyCol = scrapTxCols.includes('scrap_item_id') || scrapTxCols.includes('scarp_item_id');
    if (hasLegacyCol) {
      console.log('[DB Migration] Recreating scrap_transactions to remove legacy columns...');
      db.exec('PRAGMA foreign_keys=off;');
      const migrateScrapTx = db.transaction(() => {
        db.exec(`
          CREATE TABLE scrap_transactions_new (
            transaction_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('PURCHASE', 'SALE')),
            scrap_category_id TEXT NOT NULL,
            quantity REAL NOT NULL,
            rate REAL NOT NULL,
            total_amount REAL NOT NULL,
            party_name TEXT,
            customer_phone TEXT,
            customer_address TEXT,
            notes TEXT,
            transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            sync_status TEXT DEFAULT 'SYNCED',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            scrap_invoice_number TEXT
          );
        `);
        const cols = db.prepare("PRAGMA table_info(scrap_transactions)").all()
          .map((c: any) => c.name)
          .filter((n: string) => !['scrap_item_id', 'scarp_item_id'].includes(n))
          .join(', ');
        db.exec(`INSERT INTO scrap_transactions_new (${cols}) SELECT ${cols} FROM scrap_transactions;`);
        db.exec('DROP TABLE scrap_transactions;');
        db.exec('ALTER TABLE scrap_transactions_new RENAME TO scrap_transactions;');
      });
      migrateScrapTx();
      db.exec('PRAGMA foreign_keys=on;');
      console.log('[DB Migration] scrap_transactions recreated successfully.');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to recreate scrap_transactions table:', e.message);
  }

  // Migration: Add payment_status/scrap_invoice_number column to scrap_transactions
  try {
    const scrapTxCols = db.prepare(`PRAGMA table_info(scrap_transactions)`).all().map((c: any) => c.name);
    if (!scrapTxCols.includes('scrap_invoice_number')) {
      console.log('[DB Migration] Adding scrap_invoice_number to scrap_transactions...');
      db.exec("ALTER TABLE scrap_transactions ADD COLUMN scrap_invoice_number TEXT");
    }
    if (!scrapTxCols.includes('payment_status')) {
      console.log('[DB Migration] Adding payment_status to scrap_transactions...');
      db.exec("ALTER TABLE scrap_transactions ADD COLUMN payment_status TEXT DEFAULT 'CASH'");
    }
    if (!scrapTxCols.includes('customer_phone')) {
      console.log('[DB Migration] Adding customer_phone to scrap_transactions...');
      db.exec("ALTER TABLE scrap_transactions ADD COLUMN customer_phone TEXT");
    }
    if (!scrapTxCols.includes('customer_address')) {
      console.log('[DB Migration] Adding customer_address to scrap_transactions...');
      db.exec("ALTER TABLE scrap_transactions ADD COLUMN customer_address TEXT");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add scrap_transactions columns:', e.message);
  }

  // Migration: Add is_deleted column to scrap_transactions
  try {
    const scrapTxCols = db.prepare(`PRAGMA table_info(scrap_transactions)`).all().map((c: any) => c.name);
    if (!scrapTxCols.includes('is_deleted')) {
      console.log('[DB Migration] Adding is_deleted to scrap_transactions...');
      db.exec("ALTER TABLE scrap_transactions ADD COLUMN is_deleted INTEGER DEFAULT 0");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add is_deleted to scrap_transactions:', e.message);
  }
}
