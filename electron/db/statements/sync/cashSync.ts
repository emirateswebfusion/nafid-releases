import type { Db } from '../types.js';

/** SQL used by electron/sync/entities/cashSync.ts. Each factory prepares its statement on the given connection. */

export const selectCashDrawer = (db: Db) => db.prepare(`SELECT * FROM cash_drawer WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
export const updateCashDrawer = (db: Db) => db.prepare(`UPDATE cash_drawer SET sync_status = 'SYNCED' WHERE drawer_id = ?`);
export const selectCashTransactions = (db: Db) => db.prepare(`SELECT * FROM cash_transactions WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
export const updateCashTransactions = (db: Db) => db.prepare(`UPDATE cash_transactions SET sync_status = 'SYNCED' WHERE transaction_id = ?`);
export const selectCashCategories = (db: Db) => db.prepare(`SELECT * FROM cash_categories WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
export const updateCashCategories = (db: Db) => db.prepare(`UPDATE cash_categories SET sync_status = 'SYNCED' WHERE category_id = ?`);
export const selectCashierAuditLog = (db: Db) => db.prepare(`SELECT * FROM cashier_audit_log WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
export const updateCashierAuditLog = (db: Db) => db.prepare(`UPDATE cashier_audit_log SET sync_status = 'SYNCED' WHERE audit_id = ?`);
export const updateCashDrawer2 = (db: Db) => db.prepare(`
      UPDATE cash_drawer 
      SET cash_sales = ?, cash_in = ?, cash_out = ?, current_cash = ?, expected_closing = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE drawer_id = ?
    `);
export const selectCashDrawer2 = (db: Db) => db.prepare(`
    SELECT drawer_id, status, opening_balance, cash_sales, cash_in, cash_out, current_cash, expected_closing, sync_status 
    FROM cash_drawer 
    WHERE drawer_id = ? 
       OR ((tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
           AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ? OR substr(business_date, 1, 10) = ?)) 
    ORDER BY (CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) DESC, created_at DESC LIMIT 1
  `);
export const updateCashTransactions2 = (db: Db) => db.prepare(`UPDATE cash_transactions SET drawer_id = ? WHERE drawer_id = ? AND tenant_id = ?`);
export const updateCashierAuditLog2 = (db: Db) => db.prepare(`UPDATE cashier_audit_log SET drawer_id = ? WHERE drawer_id = ? AND tenant_id = ?`);
export const updateCashDrawer3 = (db: Db) => db.prepare(`
    UPDATE cash_drawer SET
      drawer_id = @drawer_id,
      opening_balance = @opening_balance, cash_sales = @cash_sales, cash_in = @cash_in, cash_out = @cash_out,
      current_cash = @current_cash, expected_closing = @expected_closing, actual_cash = @actual_cash,
      cash_short = @cash_short, cash_excess = @cash_excess, closing_remarks = @closing_remarks,
      status = @status, opened_by = COALESCE(opened_by, @opened_by), closed_by = @closed_by,
      opened_at = COALESCE(opened_at, @opened_at), closed_at = @closed_at,
      sync_status = 'SYNCED', updated_at = @updated_at
    WHERE drawer_id = @target_id
  `);
export const insertCashDrawer = (db: Db) => db.prepare(`
    INSERT INTO cash_drawer (
      drawer_id, tenant_id, business_date, opening_balance, cash_sales, cash_in, cash_out,
      current_cash, expected_closing, actual_cash, cash_short, cash_excess, closing_remarks,
      status, opened_by, closed_by, opened_at, closed_at, sync_status, created_at, updated_at
    ) VALUES (
      @drawer_id, @tenant_id, @business_date, @opening_balance, @cash_sales, @cash_in, @cash_out,
      @current_cash, @expected_closing, @actual_cash, @cash_short, @cash_excess, @closing_remarks,
      @status, @opened_by, @closed_by, @opened_at, @closed_at, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(drawer_id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      business_date = excluded.business_date,
      opening_balance = excluded.opening_balance,
      cash_sales = MAX(cash_drawer.cash_sales, excluded.cash_sales),
      cash_in = excluded.cash_in,
      cash_out = excluded.cash_out,
      current_cash = MAX(cash_drawer.current_cash, excluded.current_cash),
      expected_closing = MAX(cash_drawer.expected_closing, excluded.expected_closing),
      actual_cash = excluded.actual_cash,
      cash_short = excluded.cash_short,
      cash_excess = excluded.cash_excess,
      closing_remarks = excluded.closing_remarks,
      status = excluded.status,
      opened_by = COALESCE(cash_drawer.opened_by, excluded.opened_by),
      closed_by = excluded.closed_by,
      opened_at = COALESCE(cash_drawer.opened_at, excluded.opened_at),
      closed_at = excluded.closed_at,
      sync_status = CASE WHEN cash_drawer.sync_status = 'PENDING' THEN 'PENDING' ELSE 'SYNCED' END,
      updated_at = excluded.updated_at
    WHERE cash_drawer.sync_status NOT IN ('PENDING', 'FAILED')
  `);
export const selectCashDrawer3 = (db: Db) => db.prepare(`SELECT * FROM cash_drawer WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND status = 'OPEN'`);
export const insertCashTransactions = (db: Db) => db.prepare(`
    INSERT INTO cash_transactions (
      transaction_id, tenant_id, drawer_id, type, amount, category, notes, reference_number,
      entered_by, entered_by_name, transaction_date, sync_status, created_at, updated_at
    ) VALUES (
      @transaction_id, @tenant_id, @drawer_id, @type, @amount, @category, @notes, @reference_number,
      @entered_by, @entered_by_name, @transaction_date, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(transaction_id) DO UPDATE SET
      drawer_id = excluded.drawer_id,
      type = excluded.type,
      amount = excluded.amount,
      category = excluded.category,
      notes = excluded.notes,
      reference_number = excluded.reference_number,
      entered_by = excluded.entered_by,
      entered_by_name = excluded.entered_by_name,
      transaction_date = excluded.transaction_date,
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE cash_transactions.sync_status NOT IN ('PENDING', 'FAILED')
  `);
export const selectCashDrawer4 = (db: Db) => db.prepare(`SELECT drawer_id FROM cash_drawer WHERE drawer_id = ? OR (tenant_id = ? AND (business_date = ? OR date(business_date) = ? OR business_date LIKE ?)) LIMIT 1`);
export const insertCashierAuditLog = (db: Db) => db.prepare(`
    INSERT INTO cashier_audit_log (
      audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, performed_at, sync_status, created_at
    ) VALUES (
      @audit_id, @tenant_id, @drawer_id, @action, @details, @performed_by, @performed_by_name, @performed_at, 'SYNCED', @created_at
    )
    ON CONFLICT(audit_id) DO UPDATE SET
      drawer_id = excluded.drawer_id,
      action = excluded.action,
      details = excluded.details,
      performed_by = excluded.performed_by,
      performed_by_name = excluded.performed_by_name,
      performed_at = excluded.performed_at,
      sync_status = 'SYNCED'
    WHERE cashier_audit_log.sync_status NOT IN ('PENDING', 'FAILED')
  `);
export const insertCashCategories = (db: Db) => db.prepare(`
    INSERT INTO cash_categories (
      category_id, tenant_id, name, type, sort_order, is_default, sync_status, created_at
    ) VALUES (
      @category_id, @tenant_id, @name, @type, @sort_order, @is_default, 'SYNCED', @created_at
    )
    ON CONFLICT(category_id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      sort_order = excluded.sort_order,
      is_default = excluded.is_default,
      sync_status = 'SYNCED'
    WHERE cash_categories.sync_status NOT IN ('PENDING', 'FAILED')
  `);
export const selectPaymentSources = (db: Db) => db.prepare(`SELECT * FROM payment_sources WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
export const updatePaymentSources = (db: Db) => db.prepare(`UPDATE payment_sources SET sync_status = 'SYNCED' WHERE source_id = ?`);
export const selectPaymentSourceTransactions = (db: Db) => db.prepare(`SELECT * FROM payment_source_transactions WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
export const updatePaymentSourceTransactions = (db: Db) => db.prepare(`UPDATE payment_source_transactions SET sync_status = 'SYNCED' WHERE transaction_id = ?`);
export const insertPaymentSources = (db: Db) => db.prepare(`
    INSERT INTO payment_sources (
      source_id, tenant_id, name, type, bank_name, account_number, holder_name, upi_id,
      opening_balance, current_balance, is_default, is_enabled, sort_order, is_deleted,
      sync_status, created_at, updated_at
    ) VALUES (
      @source_id, @tenant_id, @name, @type, @bank_name, @account_number, @holder_name, @upi_id,
      @opening_balance, @current_balance, @is_default, @is_enabled, @sort_order, @is_deleted,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(source_id) DO UPDATE SET
      name = excluded.name, type = excluded.type,
      bank_name = excluded.bank_name, account_number = excluded.account_number,
      holder_name = excluded.holder_name, upi_id = excluded.upi_id,
      opening_balance = excluded.opening_balance, current_balance = excluded.current_balance,
      is_default = excluded.is_default, is_enabled = excluded.is_enabled,
      sort_order = excluded.sort_order, is_deleted = excluded.is_deleted,
      updated_at = excluded.updated_at, sync_status = 'SYNCED'
    WHERE payment_sources.sync_status NOT IN ('PENDING', 'FAILED')
  `);
export const insertPaymentSourceTransactions = (db: Db) => db.prepare(`
    INSERT INTO payment_source_transactions (
      transaction_id, tenant_id, source_id, type, amount, category, notes, reference_number,
      transaction_date, running_balance, entered_by, entered_by_name, sync_status, created_at, updated_at
    ) VALUES (
      @transaction_id, @tenant_id, @source_id, @type, @amount, @category, @notes, @reference_number,
      @transaction_date, @running_balance, @entered_by, @entered_by_name, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(transaction_id) DO UPDATE SET
      type = excluded.type, amount = excluded.amount, category = excluded.category,
      notes = excluded.notes, reference_number = excluded.reference_number,
      transaction_date = excluded.transaction_date, running_balance = excluded.running_balance,
      entered_by = excluded.entered_by, entered_by_name = excluded.entered_by_name,
      updated_at = excluded.updated_at, sync_status = 'SYNCED'
    WHERE payment_source_transactions.sync_status NOT IN ('PENDING', 'FAILED')
  `);
