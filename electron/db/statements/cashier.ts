import type { Db } from './types.js';
import { counterSalePredicate, countsInRevenue } from './revenue.js';

/** SQL statements used by services/cashierService.ts. Each factory prepares its statement on the given connection. */

export const findOneSettingByKey = (db: Db) => db.prepare("SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'auto_open_cash_drawer' ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 0 END) DESC LIMIT 1");

export const findOneSettingByKeyDefaultOpeningBalance = (db: Db) => db.prepare("SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'default_opening_balance' ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 0 END) DESC LIMIT 1");

export const findOneCashDrawerByBusinessDate = (db: Db) => db.prepare(`
          SELECT * FROM cash_drawer 
          WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
            AND (business_date = ? OR date(business_date) = ?)
          ORDER BY created_at DESC LIMIT 1
        `);

export const insertCashDrawer = (db: Db) => db.prepare(`
            INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, opening_balance, current_cash, expected_closing, status, opened_by, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, 'OPEN', 'system_auto', 'PENDING')
          `);

export const findOneCashDrawerByBusinessDateOpen = (db: Db) => db.prepare(`
      SELECT * FROM cash_drawer 
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
        AND (business_date = ? OR date(business_date) = ?)
      ORDER BY (CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) DESC, created_at DESC LIMIT 1
    `);

export const updateCashDrawerByDrawerId = (db: Db) => db.prepare(`
        UPDATE cash_drawer SET 
          opening_balance = ?, 
          current_cash = ?, 
          expected_closing = ?, 
          status = 'OPEN', 
          opened_by = ?, 
          opened_at = CURRENT_TIMESTAMP, 
          actual_cash = NULL, 
          cash_short = 0, 
          cash_excess = 0, 
          closing_remarks = NULL, 
          closed_by = NULL, 
          closed_at = NULL, 
          sync_status = 'PENDING', 
          updated_at = CURRENT_TIMESTAMP
        WHERE drawer_id = ?
      `);

export const insertCashDrawer2 = (db: Db) => db.prepare(`
        INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, opening_balance, current_cash, expected_closing, status, opened_by, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, 'PENDING')
      `);

export const updateCashTransactionDrawerId = (db: Db) => db.prepare(`
        UPDATE cash_transactions 
        SET drawer_id = ? 
        WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
          AND (julianday(transaction_date) BETWEEN julianday(?) AND julianday(?))
      `);

export const insertCashierAuditLog = (db: Db) => db.prepare(`
      INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `);

export const findInvoicesByInvoiceId = (db: Db) => db.prepare(`SELECT * FROM invoices WHERE invoice_id = ?`);

export const findInvoicesByInvoiceId2 = (db: Db) => db.prepare(`SELECT * FROM invoices WHERE invoice_id = ? AND tenant_id = ?`);

export const updateInvoiceByInvoiceId = (db: Db) => db.prepare(`
        UPDATE invoices SET 
          payment_method = ?, 
          split_details = ?, 
          received_amount = ?, 
          actual_refund_paid = ?,
          discount_total = ?, 
          discount_value = ?, 
          discount_type = ?, 
          grand_total = ?, 
          settled_at = CURRENT_TIMESTAMP,
          sync_status = 'PENDING', 
          updated_at = CURRENT_TIMESTAMP
        WHERE invoice_id = ?
      `);

export const insertCashTransaction = (db: Db) => db.prepare(`
              INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, entered_by_name, sync_status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
            `);

export const insertCashTransaction2 = (db: Db) => db.prepare(`
        INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, entered_by_name, transaction_date, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `);

export const findOneCashDrawerByBusinessDate2 = (db: Db) => db.prepare(`
        SELECT * FROM cash_drawer 
        WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
          AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ? OR substr(business_date, 1, 10) = ?)
        ORDER BY created_at DESC LIMIT 1
      `);

export const findOneCashDrawerByStatus = (db: Db) => db.prepare(`
          SELECT * FROM cash_drawer 
          WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
            AND status = 'OPEN' 
          ORDER BY business_date DESC, created_at DESC LIMIT 1
        `);

export const updateCashDrawerByDrawerIdClosed = (db: Db) => db.prepare(`
        UPDATE cash_drawer SET 
          cash_sales = ?,
          cash_in = ?, 
          cash_out = ?, 
          current_cash = ?, 
          expected_closing = ?, 
          actual_cash = ?, 
          cash_short = ?, 
          cash_excess = ?, 
          closing_remarks = ?, 
          status = 'CLOSED', 
          closed_by = ?, 
          closed_at = CURRENT_TIMESTAMP, 
          sync_status = 'PENDING', 
          updated_at = CURRENT_TIMESTAMP
        WHERE drawer_id = ?
      `);

export const findCashDrawerByDrawerId = (db: Db) => db.prepare(`SELECT * FROM cash_drawer WHERE drawer_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);

export const updateCashDrawerByDrawerIdOpen = (db: Db) => db.prepare(`
        UPDATE cash_drawer SET 
          status = 'OPEN',
          actual_cash = NULL,
          cash_short = 0,
          cash_excess = 0,
          closing_remarks = NULL,
          closed_by = NULL,
          closed_at = NULL,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
        WHERE drawer_id = ?
      `);

export const insertCashierAuditLog2 = (db: Db) => db.prepare(`
        INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
        VALUES (?, ?, ?, 'DAY_REOPENED', ?, ?, ?, 'PENDING')
      `);

export const findCashTransactionsByTransactionId = (db: Db) => db.prepare(`SELECT * FROM cash_transactions WHERE transaction_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);

export const deleteCashTransactionByTransactionId = (db: Db) => db.prepare(`DELETE FROM cash_transactions WHERE transaction_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);

export const findCashDrawerByDrawerId2 = (db: Db) => db.prepare(`SELECT * FROM cash_drawer WHERE drawer_id = ?`);

export const insertCashierAuditLog3 = (db: Db) => db.prepare(`
        INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
        VALUES (?, ?, ?, 'TRANSACTION_DELETED', ?, ?, ?, 'PENDING')
      `);

export const findCashDrawerByBusinessDate = (db: Db) => db.prepare(`SELECT drawer_id FROM cash_drawer WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ?)`);


export const findCashTransactions = (db: Db) => db.prepare(`SELECT * FROM cash_transactions WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (julianday(transaction_date) BETWEEN julianday(?) AND julianday(?)) ORDER BY transaction_date DESC`);

export const findInvoices = (db: Db) => db.prepare(`
      SELECT cd.*,
        u1.name as opened_by_name,
        u2.name as closed_by_name
      FROM cash_drawer cd
      LEFT JOIN users u1 ON cd.opened_by = u1.user_id
      LEFT JOIN users u2 ON cd.closed_by = u2.user_id
      WHERE (cd.tenant_id = ? OR cd.tenant_id = 'global' OR cd.tenant_id = 'unset' OR cd.tenant_id IS NULL)
      ORDER BY cd.business_date DESC
      LIMIT ? OFFSET ?
    `);

export const findInvoices2 = (db: Db) => db.prepare(`
      SELECT i.*, u.name as biller_name
      FROM invoices i
      LEFT JOIN users u ON i.user_id = u.user_id
      WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) 
        AND ${counterSalePredicate('i')} AND ${countsInRevenue('i')} AND i.payment_method NOT IN ('PENDING', 'HOLD_DRAFT')
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (i.is_held IS NULL OR i.is_held = 0)
        AND (
          julianday(COALESCE(i.settled_at, i.created_at)) BETWEEN julianday(?) AND julianday(?)
        )
        AND (i.is_deleted IS NULL OR i.is_deleted = 0)
      ORDER BY COALESCE(i.settled_at, i.updated_at, i.created_at) DESC
    `);

export const findCashTransactions2 = (db: Db) => db.prepare(`SELECT * FROM cash_transactions WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND julianday(transaction_date) BETWEEN julianday(?) AND julianday(?) ORDER BY transaction_date DESC`);

export const findCashierAuditLog = (db: Db) => db.prepare(`SELECT * FROM cashier_audit_log WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) ORDER BY performed_at DESC LIMIT ? OFFSET ?`);

export const insertCashCategory = (db: Db) => db.prepare(`
      INSERT INTO cash_categories (category_id, tenant_id, name, type, sort_order, is_default, sync_status)
      VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM cash_categories WHERE tenant_id = ? AND type = ?), 0, 'PENDING')
    `);

export const findCashCategoriesByCategoryId = (db: Db) => db.prepare(`SELECT * FROM cash_categories WHERE category_id = ? AND tenant_id = ?`);

export const deleteCashCategoryByCategoryId = (db: Db) => db.prepare(`DELETE FROM cash_categories WHERE category_id = ? AND tenant_id = ?`);

export const findPartyNameByLedgerId = (db: Db) => db.prepare(`SELECT p.name AS party_name FROM party_ledger l JOIN parties p ON l.party_id = p.party_id WHERE l.ledger_id = ?`);

/** Dynamic SQL: `placeholders` must be built from trusted values (placeholders/column lists), never user input. */
export const listCashTransactionsForDrawersOrDate = (db: Db, placeholders: string | number) => db.prepare(`SELECT * FROM cash_transactions WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (drawer_id IN (${placeholders}) OR julianday(transaction_date) BETWEEN julianday(?) AND julianday(?)) ORDER BY transaction_date DESC`);

/** Builds and prepares the dynamic query of `getPendingInvoices` (filters appended in code; user values are bound). */
export function getPendingInvoicesStatement(db: Db, args: { tenant_id: string; search: string | undefined }) {
  const { tenant_id, search } = args;
  let query = `
    SELECT i.*, u.name as biller_name 
    FROM invoices i 
    LEFT JOIN users u ON i.user_id = u.user_id 
    WHERE i.tenant_id = ? 
      AND ${counterSalePredicate('i')} AND ${countsInRevenue('i')}
      AND i.payment_method = 'PENDING' 
      AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
      AND (i.is_held IS NULL OR i.is_held = 0)
      AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
  `;
  const params: unknown[] = [tenant_id];
  if (search) {
    query += ` AND (i.invoice_number LIKE ? OR i.customer_name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  query += ` ORDER BY i.created_at DESC LIMIT 1000`;
  return { statement: db.prepare(query), params };
}

/** Builds and prepares the dynamic query of `getCategories` (filters appended in code; user values are bound). */
export function getCategoriesStatement(db: Db, args: { tenant_id: string; type: "CASH_IN" | "CASH_OUT" | undefined }) {
  const { tenant_id, type } = args;
  let query = `SELECT * FROM cash_categories WHERE tenant_id = ?`;
  const params: unknown[] = [tenant_id];
  if (type) { query += ` AND type = ?`; params.push(type); }
  query += ` ORDER BY sort_order ASC, name ASC`;
  return { statement: db.prepare(query), params };
}
