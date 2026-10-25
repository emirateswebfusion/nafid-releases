import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

/** Column additions and data backfills for later releases, hardware defaults, terminal role and offer-price cleanup. Part of initDb, run in order. */
export function runColumnMigrations(db: Database.Database) {
  // Migration: Add missing columns to invoices explicitly (including split_details)
  try {
    const invCols = db.prepare(`PRAGMA table_info(invoices)`).all().map((c: any) => c.name);
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
      actual_refund_paid: 'REAL DEFAULT 0',
      notes: 'TEXT',
      description: 'TEXT',
    };

    for (const [colName, colType] of Object.entries(invoiceColsToEnsure)) {
      if (!invCols.includes(colName)) {
        console.log(`[DB Migration] Adding missing column ${colName} (${colType}) to invoices...`);
        try {
          db.exec(`ALTER TABLE invoices ADD COLUMN ${colName} ${colType}`);
        } catch (colErr: any) {
          console.warn(`[DB Migration] Failed to add column ${colName} to invoices:`, colErr.message);
        }
      }
    }

    // Normalize string '0.0' or '0' or NULL to integer 0 for clean SQLite queries across all tables
    const tablesToNormalize = ['invoices', 'products', 'parties', 'scrap_categories', 'product_grades', 'pricing_tiers', 'product_pricing'];
    for (const tbl of tablesToNormalize) {
      try {
        db.exec(`UPDATE ${tbl} SET is_deleted = 0 WHERE is_deleted = '0.0' OR is_deleted = '0' OR is_deleted = 0.0 OR is_deleted IS NULL;`);
      } catch {}
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add/normalize columns in invoices:', e.message);
  }

  // Migration: Fix non-UUID product_pricing_id in product_pricing
  try {
    const invalidRows = db.prepare(`
      SELECT product_pricing_id, product_id, pricing_tier_id, tenant_id 
      FROM product_pricing 
      WHERE product_pricing_id NOT LIKE '________-____-____-____-____________'
    `).all() as any[];
    if (Array.isArray(invalidRows) && invalidRows.length > 0) {
      const updStmt = db.prepare(`UPDATE product_pricing SET product_pricing_id = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND pricing_tier_id = ? AND tenant_id = ?`);
      for (const r of invalidRows) {
        updStmt.run(crypto.randomUUID(), r.product_id, r.pricing_tier_id, r.tenant_id);
      }
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to fix non-UUID product_pricing_id:', e.message);
  }

  // Migration: Add bill_type column to purchase_bills
  try {
    const pbCols = db.prepare(`PRAGMA table_info(purchase_bills)`).all().map((c: any) => c.name);
    if (!pbCols.includes('bill_type')) {
      console.log('[DB Migration] Adding bill_type to purchase_bills...');
      db.exec("ALTER TABLE purchase_bills ADD COLUMN bill_type TEXT DEFAULT 'GST'");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add bill_type to purchase_bills:', e.message);
  }

  // Migration: Normalize business_date in cash_drawer to pure YYYY-MM-DD
  try {
    const drawers = db.prepare(`SELECT drawer_id, business_date FROM cash_drawer WHERE business_date IS NOT NULL`).all() as any[];
    if (Array.isArray(drawers) && drawers.length > 0) {
      const upd = db.prepare(`UPDATE cash_drawer SET business_date = ? WHERE drawer_id = ?`);
      for (const d of drawers) {
        if (d.business_date) {
          const str = String(d.business_date).trim();
          let clean = str;
          if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(str)) {
            const parts = str.split(/[-/]/);
            clean = `${parts[2]}-${parts[1]}-${parts[0]}`;
          } else if (str.includes('T') || str.includes('Z') || str.includes(' ')) {
            const dt = new Date(str.includes('Z') || str.includes('+') ? str : str.replace(' ', 'T'));
            if (!isNaN(dt.getTime())) {
              const pad = (n: number) => String(n).padStart(2, '0');
              clean = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
            } else {
              clean = str.slice(0, 10);
            }
          }
          if (clean !== d.business_date && /^\d{4}-\d{2}-\d{2}$/.test(clean)) {
            upd.run(clean, d.drawer_id);
          }
        }
      }
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to normalize business_date in cash_drawer:', e.message);
  }

  // Migration: Add invoice_number column to purchase_bills
  try {
    const pbCols3 = db.prepare(`PRAGMA table_info(purchase_bills)`).all().map((c: any) => c.name);
    if (!pbCols3.includes('invoice_number')) {
      console.log('[DB Migration] Adding invoice_number to purchase_bills...');
      db.exec("ALTER TABLE purchase_bills ADD COLUMN invoice_number TEXT");
    }
    } catch (e: any) {
      console.warn('[DB Migration] Failed to add invoice_number to purchase_bills:', e.message);
    }

    // Migration: Add payment_type column to purchase_bills
    try {
      const pbCols4 = db.prepare(`PRAGMA table_info(purchase_bills)`).all().map((c: any) => c.name);
      if (!pbCols4.includes('payment_type')) {
        console.log('[DB Migration] Adding payment_type to purchase_bills...');
        db.exec("ALTER TABLE purchase_bills ADD COLUMN payment_type TEXT DEFAULT 'CASH'");
      }
    } catch (e: any) {
      console.warn('[DB Migration] Failed to add payment_type to purchase_bills:', e.message);
    }

  // Migration: Consolidate user roles to SUPER_ADMIN, ADMIN, STAFF
  db.exec("UPDATE users SET role = 'ADMIN' WHERE role IN ('OWNER', 'ADMINISTRATOR')");
  db.exec("UPDATE users SET role = 'STAFF' WHERE role IN ('BILLER', 'CASHIER')");

  // Migration: Add gst_balance & estimate_balance columns to parties
  try {
    const partyCols = db.prepare(`PRAGMA table_info(parties)`).all().map((c: any) => c.name);
    if (!partyCols.includes('gst_balance')) {
      console.log('[DB Migration] Adding gst_balance to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN gst_balance REAL NOT NULL DEFAULT 0");
    }
    if (!partyCols.includes('estimate_balance')) {
      console.log('[DB Migration] Adding estimate_balance to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN estimate_balance REAL NOT NULL DEFAULT 0");
    }
    if (!partyCols.includes('credit_limit')) {
      console.log('[DB Migration] Adding credit_limit to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0");
    }
    if (!partyCols.includes('party_type')) {
      console.log('[DB Migration] Adding party_type to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN party_type TEXT DEFAULT 'CUSTOMER'");
    }
    if (!partyCols.includes('custom_category')) {
      console.log('[DB Migration] Adding custom_category to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN custom_category TEXT");
    }
    if (!partyCols.includes('credit_period_enabled')) {
      console.log('[DB Migration] Adding credit_period_enabled to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN credit_period_enabled INTEGER DEFAULT 0");
    }
    if (!partyCols.includes('credit_period_days')) {
      console.log('[DB Migration] Adding credit_period_days to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN credit_period_days INTEGER DEFAULT 30");
    }
    if (!partyCols.includes('credit_period_basis')) {
      console.log('[DB Migration] Adding credit_period_basis to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN credit_period_basis TEXT DEFAULT 'BILL_BASED'");
    }
    if (!partyCols.includes('restrict_on_credit_expiry')) {
      console.log('[DB Migration] Adding restrict_on_credit_expiry to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN restrict_on_credit_expiry INTEGER DEFAULT 1");
    }
    if (!partyCols.includes('whatsapp_alerts_enabled')) {
      console.log('[DB Migration] Adding whatsapp_alerts_enabled to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN whatsapp_alerts_enabled INTEGER DEFAULT 1");
    }

    // Customers table credit columns migration
    const custCols = db.prepare(`PRAGMA table_info(customers)`).all().map((c: any) => c.name);
    if (!custCols.includes('credit_limit')) {
      console.log('[DB Migration] Adding credit_limit to customers...');
      db.exec("ALTER TABLE customers ADD COLUMN credit_limit REAL DEFAULT 0");
    }
    if (!custCols.includes('credit_period_enabled')) {
      console.log('[DB Migration] Adding credit_period_enabled to customers...');
      db.exec("ALTER TABLE customers ADD COLUMN credit_period_enabled INTEGER DEFAULT 0");
    }
    if (!custCols.includes('credit_period_days')) {
      console.log('[DB Migration] Adding credit_period_days to customers...');
      db.exec("ALTER TABLE customers ADD COLUMN credit_period_days INTEGER DEFAULT 30");
    }
    if (!custCols.includes('credit_period_basis')) {
      console.log('[DB Migration] Adding credit_period_basis to customers...');
      db.exec("ALTER TABLE customers ADD COLUMN credit_period_basis TEXT DEFAULT 'BILL_BASED'");
    }
    if (!custCols.includes('restrict_on_credit_expiry')) {
      console.log('[DB Migration] Adding restrict_on_credit_expiry to customers...');
      db.exec("ALTER TABLE customers ADD COLUMN restrict_on_credit_expiry INTEGER DEFAULT 1");
    }
    if (!custCols.includes('gstin')) {
      console.log('[DB Migration] Adding gstin to customers...');
      db.exec("ALTER TABLE customers ADD COLUMN gstin TEXT");
    }
    if (!custCols.includes('notes')) {
      console.log('[DB Migration] Adding notes to customers...');
      db.exec("ALTER TABLE customers ADD COLUMN notes TEXT");
    }

    // Backfill: existing balances are treated as GST balance (legacy behavior)
    db.exec("UPDATE parties SET gst_balance = balance WHERE gst_balance = 0 AND balance != 0");
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add balance/credit_limit/credit_period columns to parties/customers:', e.message);
  }

  // Migration: Add balance_type & payment_method columns to party_ledger
  try {
    const ledgerCols = db.prepare(`PRAGMA table_info(party_ledger)`).all().map((c: any) => c.name);
    if (!ledgerCols.includes('balance_type')) {
      console.log('[DB Migration] Adding balance_type to party_ledger...');
      db.exec("ALTER TABLE party_ledger ADD COLUMN balance_type TEXT DEFAULT 'GST'");
    }
    if (!ledgerCols.includes('payment_method')) {
      console.log('[DB Migration] Adding payment_method to party_ledger...');
      db.exec("ALTER TABLE party_ledger ADD COLUMN payment_method TEXT");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add columns to party_ledger:', e.message);
  }

  // Migration: Add restricted_page and password_hash columns to users
  try {
    const uCols = db.prepare(`PRAGMA table_info(users)`).all().map((c: any) => c.name);
    if (!uCols.includes('restricted_page')) {
      console.log('[DB Migration] Adding restricted_page to users...');
      db.exec("ALTER TABLE users ADD COLUMN restricted_page TEXT");
    }
    if (!uCols.includes('password_hash')) {
      console.log('[DB Migration] Adding password_hash to users...');
      db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
    }
    if (!uCols.includes('permissions')) {
      console.log('[DB Migration] Adding permissions to users...');
      db.exec("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '[]'");
    }
    if (!uCols.includes('login_enabled')) {
      console.log('[DB Migration] Adding login_enabled to users...');
      db.exec('ALTER TABLE users ADD COLUMN login_enabled INTEGER NOT NULL DEFAULT 1');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add columns to users:', e.message);
  }

  // Migration: Backfill settled_at for historical non-pending invoices where settled_at IS NULL
  try {
    const invCols = db.prepare(`PRAGMA table_info(invoices)`).all().map((c: any) => c.name);
    if (invCols.includes('settled_at')) {
      db.exec("UPDATE invoices SET settled_at = created_at WHERE payment_method NOT IN ('PENDING', 'HOLD_DRAFT') AND (settled_at IS NULL OR settled_at = '')");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to backfill settled_at:', e.message);
  }

  // Migration: Add partial-adjustment columns to returns
  try {
    const retCols = db.prepare(`PRAGMA table_info(returns)`).all().map((c: any) => c.name);
    if (!retCols.includes('adjusted_amount')) {
      console.log('[DB Migration] Adding adjusted_amount to returns...');
      db.exec("ALTER TABLE returns ADD COLUMN adjusted_amount REAL NOT NULL DEFAULT 0");
    }
    if (!retCols.includes('adjusted_invoice_number')) {
      console.log('[DB Migration] Adding adjusted_invoice_number to returns...');
      db.exec("ALTER TABLE returns ADD COLUMN adjusted_invoice_number TEXT");
    }
    if (!retCols.includes('customer_address')) {
      console.log('[DB Migration] Adding customer_address to returns...');
      db.exec("ALTER TABLE returns ADD COLUMN customer_address TEXT");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add adjustment columns to returns:', e.message);
  }

  // Migration: Recalibrate return totals for historical returns where original invoice had a discount
  try {
    const historicalReturns = db.prepare(`
      SELECT r.return_id, r.invoice_id, r.subtotal as ret_subtotal, r.grand_total as ret_grand_total,
             i.subtotal as inv_subtotal, i.discount_total as inv_discount, COALESCE(i.points_redeemed_discount, 0) as inv_points_disc
      FROM returns r
      JOIN invoices i ON r.invoice_id = i.invoice_id
      WHERE i.subtotal > 0 AND (COALESCE(i.discount_total, 0) + COALESCE(i.points_redeemed_discount, 0)) > 0
    `).all() as any[];

    if (historicalReturns.length > 0) {
      const updateReturnStmt = db.prepare(`UPDATE returns SET subtotal = ?, grand_total = ? WHERE return_id = ?`);
      const updateReturnItemStmt = db.prepare(`UPDATE return_items SET unit_price = ?, total = ? WHERE return_item_id = ?`);
      const getReturnItemsStmt = db.prepare(`SELECT return_item_id, quantity, unit_price, total FROM return_items WHERE return_id = ?`);

      db.transaction(() => {
        for (const ret of historicalReturns) {
          const invSubtotal = Number(ret.inv_subtotal) || 0;
          const invDiscount = (Number(ret.inv_discount) || 0) + (Number(ret.inv_points_disc) || 0);
          if (invSubtotal <= 0 || invDiscount <= 0) continue;
          const discountRatio = Math.min(1, Math.max(0, invDiscount / invSubtotal));

          const rItems = getReturnItemsStmt.all(ret.return_id) as any[];
          let newRetSubtotal = 0;
          for (const item of rItems) {
            const currentPrice = Number(item.unit_price) || 0;
            const currentTotal = Number(item.total) || 0;
            const effPrice = Number((currentPrice * (1 - discountRatio)).toFixed(2));
            const effTotal = Number((effPrice * Number(item.quantity)).toFixed(2));
            if (Math.abs(currentTotal - effTotal) > 0.01) {
              updateReturnItemStmt.run(effPrice, effTotal, item.return_item_id);
              newRetSubtotal += effTotal;
            } else {
              newRetSubtotal += currentTotal;
            }
          }
          if (newRetSubtotal > 0 && Math.abs(Number(ret.ret_grand_total) - newRetSubtotal) > 0.01) {
            updateReturnStmt.run(newRetSubtotal, newRetSubtotal, ret.return_id);
          }
        }
      })();
    }
  } catch (e: any) {
    console.warn('[DB Migration] Recalibrating return totals failed:', e.message);
  }

  // Migration: Add skip_stock_update to purchase_bill_items and qty_from_paper_stock to invoice_items
  try {
    const pbiCols = db.prepare(`PRAGMA table_info(purchase_bill_items)`).all().map((c: any) => c.name);
    if (!pbiCols.includes('skip_stock_update')) {
      console.log('[DB Migration] Adding skip_stock_update to purchase_bill_items...');
      db.exec("ALTER TABLE purchase_bill_items ADD COLUMN skip_stock_update INTEGER DEFAULT 0");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add skip_stock_update to purchase_bill_items:', e.message);
  }

  try {
    const iiCols = db.prepare(`PRAGMA table_info(invoice_items)`).all().map((c: any) => c.name);
    if (!iiCols.includes('qty_from_paper_stock')) {
      console.log('[DB Migration] Adding qty_from_paper_stock to invoice_items...');
      db.exec("ALTER TABLE invoice_items ADD COLUMN qty_from_paper_stock REAL DEFAULT 0");
    }
    if (!iiCols.includes('pieces_sold')) {
      console.log('[DB Migration] Adding pieces_sold to invoice_items...');
      db.exec("ALTER TABLE invoice_items ADD COLUMN pieces_sold INTEGER");
    }
    if (!iiCols.includes('billing_type')) {
      console.log('[DB Migration] Adding billing_type to invoice_items...');
      db.exec("ALTER TABLE invoice_items ADD COLUMN billing_type TEXT");
    }
    if (!iiCols.includes('uom')) {
      console.log('[DB Migration] Adding uom to invoice_items...');
      db.exec("ALTER TABLE invoice_items ADD COLUMN uom TEXT");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add columns to invoice_items:', e.message);
  }

  try {
    const wCols = db.prepare(`PRAGMA table_info(warranties)`).all().map((c: any) => c.name);
    if (!wCols.includes('bill_number')) {
      console.log('[DB Migration] Adding bill_number to warranties...');
      db.exec("ALTER TABLE warranties ADD COLUMN bill_number TEXT");
    }
    if (!wCols.includes('brand')) {
      console.log('[DB Migration] Adding brand to warranties...');
      db.exec("ALTER TABLE warranties ADD COLUMN brand TEXT");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add columns to warranties:', e.message);
  }

  // Migration: allow temp (billing-only) items — invoice_items & return_items must not
  // FK-reference products, because temp items are sold without creating a products row.
  try {
    const iiSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='invoice_items'").get() as any;
    if (iiSql && /FOREIGN KEY\s*\(\s*product_id\s*\)\s*REFERENCES\s*products/i.test(iiSql.sql)) {
      console.log('[DB Migration] Removing products FK from invoice_items (temp billing items support)...');
      db.exec('PRAGMA foreign_keys=off;');
      const migrateInvoiceItems = db.transaction(() => {
        const tableCols = db.prepare("PRAGMA table_info(invoice_items)").all() as any[];
        const colDefs = tableCols.map((c: any) => {
          let def = `"${c.name}" ${c.type}`;
          if (c.pk) def += ' PRIMARY KEY';
          if (c.notnull && !c.pk) def += ' NOT NULL';
          if (c.dflt_value !== null) def += ` DEFAULT ${c.dflt_value}`;
          return def;
        }).join(',\n              ');
        db.exec(`
          CREATE TABLE invoice_items_new (
              ${colDefs},
              FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id)
          );
        `);
        const cols = tableCols.map((c: any) => `"${c.name}"`).join(', ');
        db.exec(`INSERT INTO invoice_items_new (${cols}) SELECT ${cols} FROM invoice_items;`);
        db.exec('DROP TABLE invoice_items;');
        db.exec('ALTER TABLE invoice_items_new RENAME TO invoice_items;');
      });
      migrateInvoiceItems();
      db.exec('PRAGMA foreign_keys=on;');
      console.log('[DB Migration] invoice_items products FK removed successfully.');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to update invoice_items schema:', e.message);
  }

  try {
    const riSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='return_items'").get() as any;
    if (riSql && /FOREIGN KEY\s*\(\s*product_id\s*\)\s*REFERENCES\s*products/i.test(riSql.sql)) {
      console.log('[DB Migration] Removing products FK from return_items (temp billing items support)...');
      db.exec('PRAGMA foreign_keys=off;');
      const migrateReturnItems = db.transaction(() => {
        const tableCols = db.prepare("PRAGMA table_info(return_items)").all() as any[];
        const colDefs = tableCols.map((c: any) => {
          let def = `"${c.name}" ${c.type}`;
          if (c.pk) def += ' PRIMARY KEY';
          if (c.notnull && !c.pk) def += ' NOT NULL';
          if (c.dflt_value !== null) def += ` DEFAULT ${c.dflt_value}`;
          return def;
        }).join(',\n              ');
        db.exec(`
          CREATE TABLE return_items_new (
              ${colDefs},
              FOREIGN KEY (return_id) REFERENCES returns(return_id)
          );
        `);
        const cols = tableCols.map((c: any) => `"${c.name}"`).join(', ');
        db.exec(`INSERT INTO return_items_new (${cols}) SELECT ${cols} FROM return_items;`);
        db.exec('DROP TABLE return_items;');
        db.exec('ALTER TABLE return_items_new RENAME TO return_items;');
      });
      migrateReturnItems();
      db.exec('PRAGMA foreign_keys=on;');
      console.log('[DB Migration] return_items products FK removed successfully.');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to update return_items schema:', e.message);
  }

  // Clean up legacy dummy default printer_config ('192.168.1.100') if present so it doesn't override real printers
  try {
    db.exec("DELETE FROM settings WHERE key = 'printer_config' AND value LIKE '%192.168.1.100%'");
  } catch (e: any) {
    console.warn('[DB Migration] Dummy printer_config cleanup failed:', e.message);
  }

  // Initialize hardware defaults if empty
  const hasPrinter = db.prepare("SELECT 1 FROM settings WHERE key = 'printer_config'").get();
  if (!hasPrinter) {
    db.prepare("INSERT INTO settings (tenant_id, key, value) VALUES (?, ?, ?)").run(
      'global',
      'printer_config', 
      JSON.stringify({ type: 'none' })
    );
  }
  
  const hasScale = db.prepare("SELECT 1 FROM settings WHERE key = 'scale_config'").get();
  if (!hasScale) {
    db.prepare("INSERT INTO settings (tenant_id, key, value) VALUES (?, ?, ?)").run(
      'global',
      'scale_config', 
      JSON.stringify({ path: 'COM3', baudRate: 9600 })
    );
  }

  // Ensure Terminal Role is set to PRIMARY Master Server
  try {
    const netSyncRow = db.prepare("SELECT value FROM settings WHERE key = 'network_sync_config'").get() as { value: string } | undefined;
    if (!netSyncRow) {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
        'network_sync_config',
        JSON.stringify({ syncMode: 'HYBRID', lanRole: 'PRIMARY', lanHostIp: '', lanPort: 3888, syncFrequency: 'BALANCED' })
      );
    } else {
      const parsed = typeof netSyncRow.value === 'string' ? JSON.parse(netSyncRow.value) : netSyncRow.value;
      if (parsed && parsed.lanRole === 'SECONDARY') {
        parsed.lanRole = 'PRIMARY';
        db.prepare("UPDATE settings SET value = ? WHERE key = 'network_sync_config'").run(JSON.stringify(parsed));
        console.log('[DB Migration] Set network_sync_config terminal role to PRIMARY Master Server.');
      }
    }
  } catch (e: any) {
    console.error('[DB Migration] Error setting network_sync_config to PRIMARY:', e.message);
  }

  // Clean up legacy records with 0.0 offer_price
  try {
    db.exec(`
      UPDATE products SET offer_price = NULL WHERE offer_price = 0.0;
      UPDATE product_grades SET offer_price = NULL WHERE offer_price = 0.0;
    `);
    console.log('[DB Migration] Cleaned up legacy 0.0 offer prices to NULL.');
  } catch (e: any) {
    console.error('[DB Migration] Failed to run offer_price cleanup migration:', e.message);
  }
}
