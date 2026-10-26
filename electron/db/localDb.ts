import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import { autoDeduplicateCustomersAndParties, backfillCustomersFromInvoices } from './customerDedupe.js';
import { createCoreTables } from './schemaCoreTables.js';
import { createExtendedTables } from './schemaExtendedTables.js';
import { ensureSchemaColumns } from './schemaColumns.js';
import { runLegacyRepairs } from './migrationsRepairs.js';
import { runColumnMigrations } from './migrationsColumns.js';
import { runMigrations } from './migrations/runner.js';
import { MIGRATIONS } from './migrations/index.js';

/** The open connection. Exported only for the db-layer modules (live binding); everything else calls getDb(). */
export let db: Database.Database;

export function initDb() {
  const dbPath = path.join(app.getPath('userData'), 'vendora_v2.db');
  
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Self-healing migration: if current database does not exist or is empty (0 bytes), search legacy/alternate AppData directories to restore user's database
  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) {
    try {
      const appData = app.getPath('appData');
      const candidates = [
        path.join(appData, 'nafid', 'vendora_v2.db'),
        path.join(appData, 'nafid', 'vendora.db'),
        path.join(appData, 'com.nafid', 'vendora_v2.db'),
        path.join(appData, 'vendora', 'vendora_v2.db'),
        path.join(appData, 'Vendora', 'vendora_v2.db'),
        path.join(appData, 'Nafid', 'vendora.db'),
      ];

      for (const src of candidates) {
        if (fs.existsSync(src) && fs.statSync(src).size > 0 && src !== dbPath) {
          // Validate the candidate database has minimum required schema before copying
          let isValid = false;
          try {
            const testDb = new Database(src, { readonly: true });
            const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
            const tableNames = tables.map(t => t.name);
            // Check for critical tables and columns that migrations depend on
            const hasProducts = tableNames.includes('products');
            const hasInvoices = tableNames.includes('invoices');
            const hasParties = tableNames.includes('parties');
            let hasIsDeleted = false;
            if (hasProducts) {
              const cols = testDb.prepare("PRAGMA table_info(products)").all() as { name: string }[];
              hasIsDeleted = cols.some(c => (c as { name: string }).name === 'is_deleted');
            }
            testDb.close();
            isValid = hasProducts && hasInvoices && hasParties && hasIsDeleted;
          } catch {
            isValid = false;
          }

          if (isValid) {
            console.log(`[DB Self-Healing] Found compatible legacy database at ${src}. Restoring to ${dbPath}...`);
            fs.copyFileSync(src, dbPath);
            const wal = `${src}-wal`;
            const shm = `${src}-shm`;
            if (fs.existsSync(wal)) fs.copyFileSync(wal, `${dbPath}-wal`);
            if (fs.existsSync(shm)) fs.copyFileSync(shm, `${dbPath}-shm`);
            break;
          } else {
            console.log(`[DB Self-Healing] Skipping incompatible legacy database at ${src} (missing required schema)`);
          }
        }
      }
    } catch (copyErr) {
      console.error('[DB Self-Healing] Database recovery check error:', copyErr);
    }
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');

  // Register string cleaner function for special-character insensitive searches
  try {
    db.function('CLEAN_STR', { deterministic: true }, (str: unknown) => {
      if (typeof str !== 'string' && typeof str !== 'number') return '';
      return String(str).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    });
  } catch (e) {
    console.warn('[DB] Failed to register CLEAN_STR UDF:', e);
  }

  // Create tables with full schema matching cloud sync expectations
  createCoreTables(db);
  createExtendedTables(db);
  ensureSchemaColumns(db);

  runLegacyRepairs(db);

  runColumnMigrations(db);

  // Backfill customer records from past transactions
  backfillCustomersFromInvoices(db);

  // Auto-deduplicate customer and party records to keep balances clean and prevent duplicates
  autoDeduplicateCustomersAndParties(db);

  // Ensure shop_closing_reports table exists
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_closing_reports (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'global',
        business_date TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        terminal_code TEXT,
        recipient_phone TEXT NOT NULL,
        summary_data TEXT,
        checklist_config TEXT,
        message_text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        whatsapp_message_id TEXT,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_shop_closing_reports_date ON shop_closing_reports(tenant_id, business_date, trigger_type);
    `);
  } catch (e) {
    console.error('[DB Migration] shop_closing_reports table ensure error:', (e as Error).message);
  }
  try {
    ensureInvoiceColumnsExist(db);
  } catch (e) {
    console.error('[DB Migration] ensureInvoiceColumnsExist error:', (e as Error).message);
  }

  // Versioned migrations (electron/db/migrations): run once each, after the baseline above.
  try {
    runMigrations(db, MIGRATIONS);
  } catch (e: unknown) {
    console.error('[DB Migration] Versioned migration failed (retried on next start):', e instanceof Error ? e.message : e);
  }
}

let invoiceColumnsEnsured = false;
function ensureInvoiceColumnsExist(targetDb?: Database.Database) {
  if (invoiceColumnsEnsured) return;
  const d = targetDb || db;
  if (!d) return;
  invoiceColumnsEnsured = true;
  try {
    const invCols = d.prepare(`PRAGMA table_info(invoices)`).all().map((c: unknown) => (c as { name: string }).name);
    const invoiceColsToEnsure: Record<string, string> = {
      split_details: 'TEXT',
      held_until: 'DATETIME',
      is_held: 'INTEGER DEFAULT 0',
      hold_note: 'TEXT',
      scrap_deduction: 'REAL DEFAULT 0',
      scrap_invoice_number: 'TEXT',
      return_deduction: 'REAL DEFAULT 0',
      return_invoice_number: 'TEXT',
      customer_id: 'TEXT',
      points_earned: 'REAL DEFAULT 0',
      points_redeemed: 'REAL DEFAULT 0',
      points_redeemed_discount: 'REAL DEFAULT 0',
      previous_points_balance: 'REAL DEFAULT 0',
      remaining_points_balance: 'REAL DEFAULT 0',
      converted_from_invoice_id: 'TEXT',
      converted_from_invoice_number: 'TEXT',
      converted_to_invoice_id: 'TEXT',
      converted_to_invoice_number: 'TEXT',
      is_deleted: 'INTEGER DEFAULT 0',
      // GST split (Indian GST Act compliance)
      cgst_total: 'REAL DEFAULT 0',
      sgst_total: 'REAL DEFAULT 0',
      igst_total: 'REAL DEFAULT 0',
      supply_type: "TEXT DEFAULT 'INTRA'",
      actual_refund_paid: 'REAL DEFAULT 0',
      due_date: 'DATETIME',
      deleted_at: 'DATETIME',
    };

    for (const [colName, colType] of Object.entries(invoiceColsToEnsure)) {
      if (!invCols.includes(colName)) {
        console.log(`[DB Migration] Auto-ensuring missing column ${colName} (${colType}) in invoices...`);
        try {
          d.exec(`ALTER TABLE invoices ADD COLUMN ${colName} ${colType}`);
        } catch (colErr) {
          console.warn(`[DB Migration] Failed to auto-add column ${colName} to invoices:`, (colErr as Error).message);
        }
      }
    }

    const itemCols = d.prepare(`PRAGMA table_info(invoice_items)`).all().map((c: unknown) => (c as { name: string }).name);
    const itemColsToEnsure: Record<string, string> = {
      is_deleted: 'INTEGER DEFAULT 0',
      pieces_sold: 'INTEGER',
      is_service_item: 'INTEGER DEFAULT 0',
      combo_id: 'TEXT',
      combo_details: 'TEXT',
      // GST split (Indian GST Act compliance — stored per line item for GSTR reporting)
      cgst_rate:    'REAL DEFAULT 0',
      sgst_rate:    'REAL DEFAULT 0',
      igst_rate:    'REAL DEFAULT 0',
      cgst_amount:  'REAL DEFAULT 0',
      sgst_amount:  'REAL DEFAULT 0',
      igst_amount:  'REAL DEFAULT 0',
      hsn_sac_code: 'TEXT',
      supply_type:  "TEXT DEFAULT 'INTRA'",
    };
    for (const [colName, colType] of Object.entries(itemColsToEnsure)) {
      if (!itemCols.includes(colName)) {
        console.log(`[DB Migration] Auto-ensuring missing column ${colName} (${colType}) in invoice_items...`);
        try {
          d.exec(`ALTER TABLE invoice_items ADD COLUMN ${colName} ${colType}`);
        } catch (colErr) {
          console.warn(`[DB Migration] Failed to auto-add column ${colName} to invoice_items:`, (colErr as Error).message);
        }
      }
    }

    // Migration: Fix legacy held bills that stole standard invoice numbers
    try {
      d.exec(`
        UPDATE invoices
        SET invoice_number = 'HLD-' || invoice_id
        WHERE (invoice_type IN ('HOLD', 'RECALLED_HOLD', 'EXPIRED_HOLD') OR is_held = 1)
          AND (invoice_number NOT LIKE '%HLD%' OR invoice_number IS NULL)
      `);
    } catch (e) {
      console.warn('[DB Migration] Fix legacy held invoice numbers error:', (e as Error).message);
    }

    // Migration: Sync converted GST invoices' created_at to match their source Bill of Supply's actual created_at
    try {
      d.exec(`
        UPDATE invoices
        SET created_at = (
          SELECT src.created_at
          FROM invoices src
          WHERE src.invoice_id = invoices.converted_from_invoice_id
            AND src.created_at IS NOT NULL
        )
        WHERE converted_from_invoice_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM invoices src
            WHERE src.invoice_id = invoices.converted_from_invoice_id
              AND src.created_at IS NOT NULL
              AND src.created_at != invoices.created_at
          );

        UPDATE invoice_items
        SET created_at = (
          SELECT inv.created_at
          FROM invoices inv
          WHERE inv.invoice_id = invoice_items.invoice_id
        )
        WHERE invoice_id IN (
          SELECT invoice_id FROM invoices WHERE converted_from_invoice_id IS NOT NULL
        )
          AND created_at IS NOT (SELECT inv.created_at FROM invoices inv WHERE inv.invoice_id = invoice_items.invoice_id);
      `);
    } catch (migErr) {
      console.warn('[DB Migration] Could not backfill converted invoices created_at:', (migErr as Error).message);
    }

    // Migration: Clean up erroneous paper prices on Real products in domain_attributes
    try {
      const realProds = d.prepare(`
        SELECT product_id, domain_attributes 
        FROM products 
        WHERE domain_attributes LIKE '%"gst_type":"REAL"%' 
          AND (domain_attributes LIKE '%paper_purchase_price%' OR domain_attributes LIKE '%paper_mrp%' OR domain_attributes LIKE '%gst_purchase_price%')
      `).all() as { product_id: string; domain_attributes: string }[];

      for (const prod of realProds) {
        try {
          const da = JSON.parse(prod.domain_attributes || '{}');
          if (da.gst_type === 'REAL' && (!da.paper_stock || Number(da.paper_stock) <= 0)) {
            delete da.paper_purchase_price;
            delete da.paper_mrp;
            delete da.paper_base_price;
            delete da.gst_purchase_price;
            d.prepare(`UPDATE products SET domain_attributes = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?`).run(JSON.stringify(da), prod.product_id);
          }
        } catch { /* ignore */ }
      }
    } catch (e) {
      console.warn('[DB Migration] Clean real product paper attributes error:', (e as Error).message);
    }
  } catch (e) {
    console.warn('[DB Migration] Auto-ensure columns error:', (e as Error).message);
  }
}

/** The connection if it is already open, without opening it (for callers that must not trigger initDb). */
export function getOpenDb(): Database.Database | undefined {
  return db;
}

export function getDb() {
  if (!db) {
    initDb();
  }
  return db;
}

