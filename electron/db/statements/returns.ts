import type { Db } from './types.js';

/** SQL statements used by services/returnsService.ts. Each factory prepares its statement on the given connection. */

export const insertReturn = (db: Db) => db.prepare(`
      INSERT INTO returns (
        return_id, invoice_id, tenant_id, user_id, return_number,
        customer_name, customer_phone, customer_address,
        subtotal, tax_total, grand_total, reason,
        refund_method, adjusted_invoice_number, adjusted_amount,
        sync_status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `);

export const insertReturnItem = (db: Db) => db.prepare(`
      INSERT INTO return_items (return_item_id, return_id, tenant_id, invoice_item_id, product_id, name, quantity, unit_price, tax_amount, total, sync_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
    `);

export const updateProductCurrentStock = (db: Db) => db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?');

export const findInvoicesByInvoiceId = (db: Db) => db.prepare('SELECT * FROM invoices WHERE invoice_id = ?');

export const updateInvoiceBalanceAmount = (db: Db) => db.prepare("UPDATE invoices SET balance_amount = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?");

export const findCashTransactionsByDrawerIdAndCategory = (db: Db) => db.prepare(`SELECT transaction_id FROM cash_transactions WHERE drawer_id = ? AND category = 'RETURN_REFUND' AND notes LIKE ?`);

export const insertCashTransaction = (db: Db) => db.prepare(`
            INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, sync_status)
            VALUES (?, ?, ?, 'CASH_OUT', ?, 'RETURN_REFUND', ?, ?, 'PENDING')
          `);


export const findReturnItemsByReturnIdAndInvoiceId = (db: Db) => db.prepare(`
    SELECT invoice_item_id, COALESCE(SUM(quantity), 0) as returned_qty
    FROM return_items
    WHERE return_id IN (SELECT return_id FROM returns WHERE invoice_id = ?)
    GROUP BY invoice_item_id
  `);

export const findReturnsByReturnNumber = (db: Db) => db.prepare('SELECT * FROM returns WHERE tenant_id = ? AND return_number = ?');

export const findReturnsByReturnNumber2 = (db: Db) => db.prepare('SELECT * FROM returns WHERE tenant_id = ? AND (return_number = ? OR return_number = ?)');

export const findReturns = (db: Db) => db.prepare('SELECT * FROM returns WHERE tenant_id = ? AND grand_total > COALESCE(adjusted_amount, 0)');

export const findReturnsByReturnNumber3 = (db: Db) => db.prepare(`
    SELECT return_id, return_number, customer_name, customer_phone, customer_address, grand_total, refund_method, created_at, user_id
    FROM returns WHERE tenant_id = ? AND return_number = ?
  `);

export const updateReturnAdjustedAmountAndAdjustedInvoiceNumber = (db: Db) => db.prepare(`
    UPDATE returns 
    SET adjusted_amount = COALESCE(adjusted_amount, 0) + ?,
        adjusted_invoice_number = ?,
        sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = ? AND return_number = ? AND grand_total > COALESCE(adjusted_amount, 0)
  `);

export const findReturnItemsByReturnId = (db: Db) => db.prepare('SELECT ri.*, p.sku_barcode, p.item_code FROM return_items ri LEFT JOIN products p ON ri.product_id = p.product_id WHERE ri.return_id = ?');

export const findReturnsByReturnId = (db: Db) => db.prepare('SELECT * FROM returns WHERE return_id = ?');

export const findReturnItemsByReturnIdProductIdAndQuantity = (db: Db) => db.prepare('SELECT product_id, quantity FROM return_items WHERE return_id = ?');

export const updateProductCurrentStockAlt = (db: Db) => db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?');

export const findPartyLedgerByReferenceNumber = (db: Db) => db.prepare(`
        SELECT ledger_id, party_id FROM party_ledger
        WHERE reference_number = ?
           OR reference_number LIKE ? || '-%'
           OR description LIKE '%' || ? || '%'
      `);

export const updatePartyLedgerIsDeleted = (db: Db) => db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?");

export const deleteReturnItemByReturnId = (db: Db) => db.prepare('DELETE FROM return_items WHERE return_id = ?');

export const deleteReturnByReturnId = (db: Db) => db.prepare('DELETE FROM returns WHERE return_id = ?');

export const findSettingsByKey = (db: Db) => db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?');

export const findReturnsReturnNumber = (db: Db) => db.prepare('SELECT return_number FROM returns WHERE return_number LIKE ?');

export const upsertSetting = (db: Db) => db.prepare(`INSERT INTO settings (tenant_id, key, value, sync_status, updated_at) VALUES ('global', 'return_counter', ?, 'LOCAL', CURRENT_TIMESTAMP) ON CONFLICT(tenant_id, key) DO UPDATE SET value = EXCLUDED.value, sync_status = 'LOCAL', updated_at = CURRENT_TIMESTAMP`);

/** Builds and prepares the dynamic query of `getReturnableInvoices` (filters appended in code; user values are bound). */
export function getReturnableInvoicesStatement(db: Db, args: { tenant_id: string; role: string | undefined; user_id: string | undefined; search: string | undefined; limit: number }) {
  const { tenant_id, role, user_id, search, limit } = args;
  let query = `
    SELECT i.*, u.name as biller_name
    FROM invoices i
    LEFT JOIN users u ON i.user_id = u.user_id
    WHERE i.tenant_id = ?
      AND i.invoice_type NOT IN ('SCRAP', 'RETURN')
      AND EXISTS (
        SELECT 1 FROM invoice_items ii
        WHERE ii.invoice_id = i.invoice_id
          AND ii.quantity > COALESCE((
            SELECT SUM(ri.quantity) FROM return_items ri
            WHERE ri.invoice_item_id = ii.item_id
          ), 0)
      )
  `;
  const params: unknown[] = [tenant_id];
  if (role === 'BILLER' && user_id) {
    query += ' AND i.user_id = ?';
    params.push(user_id);
  }
  if (search) {
    query += ' AND (i.invoice_number LIKE ? OR i.customer_name LIKE ? OR i.customer_phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY i.created_at DESC, i.invoice_id ASC';
  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }
  return { statement: db.prepare(query), params };
}

/** Builds and prepares the dynamic query of `getPendingReturnInvoices` (filters appended in code; user values are bound). */
export function getPendingReturnInvoicesStatement(db: Db, args: { tenant_id: string; search: string | undefined }) {
  const { tenant_id, search } = args;
  let query = `
    SELECT * FROM returns 
    WHERE tenant_id = ? 
      AND (refund_method = 'ADJUST_BILL' OR refund_method IS NULL OR refund_method = '')
      AND grand_total > COALESCE(adjusted_amount, 0)
  `;
  const params: unknown[] = [tenant_id];
  if (search) {
    query += ' AND (return_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY created_at DESC LIMIT 50';
  return { statement: db.prepare(query), params };
}

/** Builds and prepares the dynamic query of `getReturns` (filters appended in code; user values are bound). */
export function getReturnsStatement(db: Db, args: { tenant_id: string | undefined; invoice_id: string | undefined; search: string | undefined; limit: number | undefined; offset: number | undefined }) {
  const { tenant_id, invoice_id, search, limit, offset } = args;
  let query = `SELECT r.* FROM returns r WHERE r.tenant_id = ?`;
  const params: unknown[] = [tenant_id];
  if (invoice_id) {
    query += ' AND r.invoice_id = ?';
    params.push(invoice_id);
  }
  if (search) {
    query += ' AND (r.return_number LIKE ? OR r.customer_name LIKE ? OR r.customer_phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY r.created_at DESC';
  if (limit) { query += ' LIMIT ?'; params.push(limit); }
  if (offset) { query += ' OFFSET ?'; params.push(offset); }
  return { statement: db.prepare(query), params };
}
