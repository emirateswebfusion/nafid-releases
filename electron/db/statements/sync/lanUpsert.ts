import { mergeCountersSql, counterDeltaSql } from '../stockCounters.js';
import type { Db } from '../types.js';

/** SQL used by electron/sync/lanUpsert.ts. Each factory prepares its statement on the given connection. */

export const selectInvoices = (db: Db) => db.prepare(`SELECT invoice_id FROM invoices WHERE invoice_id = ?`);
export const selectInvoiceStockState = (db: Db) => db.prepare('SELECT invoice_id, is_deleted, stock_applied FROM invoices WHERE invoice_id = ?');
export const selectReturns = (db: Db) => db.prepare(`SELECT return_id FROM returns WHERE return_id = ?`);
export const selectPurchaseBills = (db: Db) => db.prepare(`SELECT purchase_bill_id FROM purchase_bills WHERE purchase_bill_id = ?`);
export const selectCashDrawer = (db: Db) => db.prepare(`
          SELECT drawer_id FROM cash_drawer
          WHERE drawer_id = ? OR ((tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ?))
          LIMIT 1
        `);
export const selectCashDrawer2 = (db: Db) => db.prepare(`
          SELECT drawer_id, status, opening_balance, cash_sales, cash_in, cash_out, current_cash, sync_status FROM cash_drawer
          WHERE drawer_id = ? OR ((tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ?))
          ORDER BY (CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) DESC, created_at DESC LIMIT 1
        `);
export const updateCashDrawer = (db: Db) => db.prepare(`
            UPDATE cash_drawer SET
              opening_balance = ?, cash_sales = ?, cash_in = ?, cash_out = ?,
              current_cash = ?, expected_closing = ?, actual_cash = ?,
              cash_short = ?, cash_excess = ?, closing_remarks = ?,
              status = ?, opened_by = COALESCE(opened_by, ?), closed_by = ?,
              opened_at = COALESCE(opened_at, ?), closed_at = ?,
              sync_status = 'SYNCED', updated_at = CURRENT_TIMESTAMP
            WHERE drawer_id = ?
          `);
export const updateCashTransactions = (db: Db) => db.prepare(`UPDATE cash_transactions SET drawer_id = ? WHERE drawer_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
export const updateCashierAuditLog = (db: Db) => db.prepare(`UPDATE cashier_audit_log SET drawer_id = ? WHERE drawer_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
export const selectPricingTiers = (db: Db) => db.prepare(`
          SELECT pricing_tier_id FROM pricing_tiers
          WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
            AND LOWER(TRIM(name)) = LOWER(?)
          LIMIT 1
        `);
export const updatePricingTiers = (db: Db) => db.prepare(`
              UPDATE pricing_tiers SET
                name = ?,
                is_active = ?,
                sort_order = ?,
                is_default = ?,
                is_deleted = ?,
                sync_status = 'PENDING',
                updated_at = CURRENT_TIMESTAMP
              WHERE pricing_tier_id = ?
            `);
export const deleteProductPricing = (db: Db) => db.prepare(`DELETE FROM product_pricing WHERE pricing_tier_id = ? AND product_id IN (SELECT product_id FROM product_pricing WHERE pricing_tier_id = ?)`);
export const updateProductPricing = (db: Db) => db.prepare(`UPDATE product_pricing SET pricing_tier_id = ? WHERE pricing_tier_id = ?`);
export const updateParties = (db: Db) => db.prepare(`UPDATE parties SET pricing_tier_id = ? WHERE pricing_tier_id = ?`);
export const updateCustomers = (db: Db) => db.prepare(`UPDATE customers SET pricing_tier_id = ? WHERE pricing_tier_id = ?`);
export const deleteInvoiceItems = (db: Db) => db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?');
export const updateProducts = (db: Db) => db.prepare(`UPDATE products SET current_stock = current_stock - ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)`);
export const selectCashDrawer3 = (db: Db) => db.prepare(`
                SELECT drawer_id, opening_balance, cash_sales, cash_in, current_cash, expected_closing
                FROM cash_drawer
                WHERE status = 'OPEN' AND (business_date = ? OR business_date LIKE ?)
                ORDER BY created_at DESC LIMIT 1
              `);
export const updateCashDrawer2 = (db: Db) => db.prepare(`
                  UPDATE cash_drawer SET cash_sales = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
                  WHERE drawer_id = ?
                `);
export const updateProducts2 = (db: Db) => db.prepare(`UPDATE products SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)`);
export const updateScrapTransactions = (db: Db) => db.prepare(`UPDATE scrap_transactions SET payment_status = 'SETTLED', sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_invoice_number = ?`);
export const deleteQuotationItems = (db: Db) => db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?');

/** Insert-or-update rows of a table by named parameters (`@col`), keyed on its primary key (product_pricing: product + tier). */
export function upsertRows(db: Db, tableName: string, allCols: string[], pkCols: string[], updateCols: string[]) {
  let sql = `INSERT INTO ${tableName} (${allCols.join(', ')}) VALUES (${allCols.map(c => `@${c}`).join(', ')})`;
  if (tableName === 'product_pricing') {
    sql += ` ON CONFLICT(product_id, pricing_tier_id) DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`;
  } else if (tableName === 'products' && pkCols.length > 0) {
    const hasCounters = allCols.includes('stock_counters');
    const updateClauses = updateCols.map(c => {
      if (c === 'current_stock') {
        if (hasCounters) {
          return `current_stock = CASE WHEN EXCLUDED.stock_counters IS NOT NULL THEN products.current_stock + ${counterDeltaSql('products.stock_counters', 'EXCLUDED.stock_counters')} WHEN products.stock_counters IS NULL AND (products.updated_at IS NULL OR EXCLUDED.updated_at > products.updated_at) THEN EXCLUDED.current_stock ELSE products.current_stock END`;
        }
        return `current_stock = CASE WHEN products.updated_at IS NULL OR EXCLUDED.updated_at > products.updated_at THEN EXCLUDED.current_stock ELSE products.current_stock END`;
      }
      if (c === 'stock_counters' && hasCounters) {
        return `stock_counters = CASE WHEN products.stock_counters IS NULL AND EXCLUDED.stock_counters IS NULL THEN NULL ELSE ${mergeCountersSql('products.stock_counters', 'EXCLUDED.stock_counters')} END`;
      }
      if (c === 'updated_at') {
        return `updated_at = CASE WHEN products.updated_at IS NULL OR EXCLUDED.updated_at > products.updated_at THEN EXCLUDED.updated_at ELSE products.updated_at END`;
      }
      return `${c} = EXCLUDED.${c}`;
    });
    sql += ` ON CONFLICT(${pkCols.join(', ')}) DO UPDATE SET ${updateClauses.join(', ')}`;
  } else if (tableName === 'returns' && pkCols.length > 0) {
    const updateClauses = updateCols.map(c => {
      if (c === 'is_deleted') {
        return `is_deleted = CASE WHEN returns.is_deleted = 1 THEN 1 ELSE EXCLUDED.is_deleted END`;
      }
      return `${c} = EXCLUDED.${c}`;
    });
    sql += ` ON CONFLICT(${pkCols.join(', ')}) DO UPDATE SET ${updateClauses.join(', ')}`;
  } else if (tableName === 'settings' && pkCols.length > 0 && updateCols.length > 0) {
    sql += ` ON CONFLICT(${pkCols.join(', ')}) DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}
      WHERE EXCLUDED.key != 'feature_flags' OR julianday(EXCLUDED.updated_at) >= julianday(settings.updated_at)`;
  } else if ((tableName === 'party_ledger' || tableName === 'parties') && pkCols.length > 0) {
    sql += ` ON CONFLICT(${pkCols.join(', ')}) DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}
      WHERE ${tableName}.tenant_id = EXCLUDED.tenant_id
        AND (EXCLUDED.row_version > ${tableName}.row_version OR
          (EXCLUDED.row_version = ${tableName}.row_version AND COALESCE(EXCLUDED.origin, '') > COALESCE(${tableName}.origin, '')))`;
  } else if (pkCols.length > 0 && updateCols.length > 0) {
    sql += ` ON CONFLICT(${pkCols.join(', ')}) DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`;
  } else if (pkCols.length > 0) {
    sql += ` ON CONFLICT(${pkCols.join(', ')}) DO NOTHING`;
  }
  return db.prepare(sql);
}
