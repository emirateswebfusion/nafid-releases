import type { Db } from '../types.js';

/** SQL used by electron/sync/entities/partiesSync.ts. Each factory prepares its statement on the given connection. */

export const insertUsers = (db: Db) => db.prepare(`
      INSERT INTO users (user_id, tenant_id, name, email, role, restricted_page, permissions, login_enabled, created_at)
      VALUES (@user_id, @tenant_id, @name, @email, @role, @restricted_page, @permissions, @login_enabled, @created_at)
      ON CONFLICT(user_id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        role = excluded.role,
        restricted_page = excluded.restricted_page,
        permissions = excluded.permissions,
        login_enabled = excluded.login_enabled
    `);
export const selectParties = (db: Db) => db.prepare(`SELECT * FROM parties WHERE sync_status = 'PENDING' AND tenant_id = ?`);
export const updateParties = (db: Db) => db.prepare(`UPDATE parties SET sync_status = 'SYNCED' WHERE party_id = ? AND tenant_id = ?`);
export const insertParties = (db: Db) => db.prepare(`
    INSERT INTO parties (
      party_id, tenant_id, name, phone, address, gstin, balance, gst_balance, estimate_balance, balance_type, party_type, custom_category, notes, last_transaction_date, pricing_tier_id, credit_limit, credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry, whatsapp_alerts_enabled, is_deleted,
      sync_status, created_at, updated_at
    ) VALUES (
      @party_id, @tenant_id, @name, @phone, @address, @gstin, @balance, @gst_balance, @estimate_balance, @balance_type, @party_type, @custom_category, @notes, @last_transaction_date, @pricing_tier_id, @credit_limit, @credit_period_enabled, @credit_period_days, @credit_period_basis, @restrict_on_credit_expiry, @whatsapp_alerts_enabled, @is_deleted,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(party_id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      address = excluded.address,
      gstin = excluded.gstin,
      balance = CASE
        WHEN EXISTS (SELECT 1 FROM party_ledger pl WHERE pl.party_id = parties.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0))
        THEN (SELECT ROUND(SUM(credit_amount) - SUM(debit_amount), 2) FROM party_ledger pl WHERE pl.party_id = parties.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0))
        ELSE excluded.balance
      END,
      gst_balance = CASE
        WHEN EXISTS (SELECT 1 FROM party_ledger pl WHERE pl.party_id = parties.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0))
        THEN (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'GST' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2) FROM party_ledger pl WHERE pl.party_id = parties.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0))
        ELSE excluded.gst_balance
      END,
      estimate_balance = CASE
        WHEN EXISTS (SELECT 1 FROM party_ledger pl WHERE pl.party_id = parties.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0))
        THEN (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'ESTIMATE' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2) FROM party_ledger pl WHERE pl.party_id = parties.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0))
        ELSE excluded.estimate_balance
      END,
      balance_type = excluded.balance_type,
      party_type = excluded.party_type,
      custom_category = excluded.custom_category,
      notes = excluded.notes,
      last_transaction_date = COALESCE(excluded.last_transaction_date, parties.last_transaction_date),
      pricing_tier_id = excluded.pricing_tier_id,
      credit_limit = excluded.credit_limit,
      credit_period_enabled = excluded.credit_period_enabled,
      credit_period_days = excluded.credit_period_days,
      credit_period_basis = excluded.credit_period_basis,
      restrict_on_credit_expiry = excluded.restrict_on_credit_expiry,
      whatsapp_alerts_enabled = excluded.whatsapp_alerts_enabled,
      is_deleted = excluded.is_deleted,
      created_at = COALESCE(parties.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE parties.sync_status != 'PENDING'
  `);
export const selectParties2 = (db: Db) => db.prepare(`
    SELECT party_id FROM parties
    WHERE tenant_id = ? AND party_id != ? AND party_type = 'CUSTOMER'
      AND name = ? AND (phone = ? OR (phone IS NULL AND ? IS NULL))
      AND (is_deleted IS NULL OR is_deleted = 0)
    LIMIT 1
  `);
export const updatePartyLedger = (db: Db) => db.prepare(`
    UPDATE party_ledger SET party_id = ?, sync_status = 'SYNCED' WHERE party_id = ? AND tenant_id = ?
  `);
export const updateParties2 = (db: Db) => db.prepare(`
    UPDATE parties SET is_deleted = 1, sync_status = 'SYNCED' WHERE party_id = ? AND tenant_id = ?
  `);
export const selectPartyLedger = (db: Db) => db.prepare(`SELECT * FROM party_ledger WHERE sync_status = 'PENDING' AND tenant_id = ?`);
export const updatePartyLedger2 = (db: Db) => db.prepare(`UPDATE party_ledger SET sync_status = 'SYNCED' WHERE ledger_id = ? AND tenant_id = ?`);
export const selectLoyaltyTransactions = (db: Db) => db.prepare(`SELECT * FROM loyalty_transactions WHERE tenant_id = ? AND sync_status IN ('PENDING', 'FAILED')`);
export const updateLoyaltyTransactions = (db: Db) => db.prepare("UPDATE loyalty_transactions SET sync_status = 'SYNCED' WHERE transaction_id = ?");
export const updateLoyaltyTransactions2 = (db: Db) => db.prepare("UPDATE loyalty_transactions SET sync_status = 'FAILED' WHERE transaction_id = ?");
export const insertPartyLedger = (db: Db) => db.prepare(`
    INSERT INTO party_ledger (
      ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount,
      running_balance, balance_type, payment_method, reference_number, created_by, created_by_name, is_deleted, sync_status, created_at, updated_at
    ) VALUES (
      @ledger_id, @party_id, @tenant_id, @transaction_date, @description, @credit_amount, @debit_amount,
      @running_balance, @balance_type, @payment_method, @reference_number, @created_by, @created_by_name, @is_deleted, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(ledger_id) DO UPDATE SET
      transaction_date = excluded.transaction_date,
      description = excluded.description,
      credit_amount = excluded.credit_amount,
      debit_amount = excluded.debit_amount,
      running_balance = excluded.running_balance,
      balance_type = excluded.balance_type,
      payment_method = excluded.payment_method,
      reference_number = excluded.reference_number,
      created_by = excluded.created_by,
      created_by_name = excluded.created_by_name,
      is_deleted = excluded.is_deleted,
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE party_ledger.sync_status != 'PENDING'
  `);
export const updateParties3 = (db: Db) => db.prepare(`
            UPDATE parties
            SET balance = COALESCE(
                  (SELECT ROUND(SUM(credit_amount) - SUM(debit_amount), 2)
                   FROM party_ledger pl
                   WHERE pl.party_id = parties.party_id
                     AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
                  parties.balance, 0
                ),
                gst_balance = COALESCE(
                  (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'GST' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
                   FROM party_ledger pl
                   WHERE pl.party_id = parties.party_id
                     AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
                  parties.gst_balance, parties.balance, 0
                ),
                estimate_balance = COALESCE(
                  (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'ESTIMATE' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
                   FROM party_ledger pl
                   WHERE pl.party_id = parties.party_id
                     AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
                  parties.estimate_balance, 0
                ),
                last_transaction_date = COALESCE(
                  (SELECT MAX(pl.transaction_date)
                   FROM party_ledger pl
                   WHERE pl.party_id = parties.party_id
                     AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
                  parties.last_transaction_date
                )
            WHERE tenant_id = ? AND parties.party_id IN (
              SELECT DISTINCT pl.party_id FROM party_ledger pl WHERE pl.tenant_id = ? AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
            )
          `);
export const insertCustomers = (db: Db) => db.prepare(`
    INSERT INTO customers (
      customer_id, tenant_id, name, phone, address, pricing_tier_id,
      total_points_earned, total_points_redeemed, current_points_balance,
      last_purchase_date, is_deleted, sync_status, created_at, updated_at
    ) VALUES (
      @customer_id, @tenant_id, @name, @phone, @address, @pricing_tier_id,
      @total_points_earned, @total_points_redeemed, @current_points_balance,
      @last_purchase_date, @is_deleted, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(customer_id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      address = excluded.address,
      pricing_tier_id = excluded.pricing_tier_id,
      total_points_earned = excluded.total_points_earned,
      total_points_redeemed = excluded.total_points_redeemed,
      current_points_balance = excluded.current_points_balance,
      last_purchase_date = excluded.last_purchase_date,
      is_deleted = excluded.is_deleted,
      sync_status = 'SYNCED',
      updated_at = excluded.updated_at
    WHERE customers.sync_status != 'PENDING'
  `);
export const selectCustomers = (db: Db) => db.prepare(`
    SELECT customer_id FROM customers 
    WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)
    LIMIT 1
  `);
export const selectCustomers2 = (db: Db) => db.prepare(`
    SELECT customer_id FROM customers 
    WHERE tenant_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND (phone IS NULL OR phone = '') AND (is_deleted IS NULL OR is_deleted = 0)
    LIMIT 1
  `);
export const updateCustomers = (db: Db) => db.prepare(`
    UPDATE customers 
    SET name = @name, phone = @phone, address = @address,
        pricing_tier_id = @pricing_tier_id,
        total_points_earned = @total_points_earned,
        total_points_redeemed = @total_points_redeemed,
        current_points_balance = @current_points_balance,
        last_purchase_date = @last_purchase_date,
        is_deleted = @is_deleted,
        sync_status = 'SYNCED',
        updated_at = @updated_at
    WHERE customer_id = @target_customer_id AND sync_status != 'PENDING'
  `);
export const reassignCustomerInvoices = (db: Db) => db.prepare('UPDATE invoices SET customer_id = ? WHERE customer_id = ? AND tenant_id = ?');
export const reassignCustomerLoyalty = (db: Db) => db.prepare('UPDATE loyalty_transactions SET customer_id = ? WHERE customer_id = ? AND tenant_id = ?');
export const softDeleteCustomer = (db: Db) => db.prepare("UPDATE customers SET phone = NULL, is_deleted = 1, sync_status = 'SYNCED', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ? AND tenant_id = ?");
export const ensureStubCustomer = (db: Db) => db.prepare("INSERT OR IGNORE INTO customers (customer_id, tenant_id, name, sync_status) VALUES (?, ?, 'Unknown Customer', 'SYNCED')");
export const checkInvoiceExists = (db: Db) => db.prepare('SELECT 1 FROM invoices WHERE invoice_id = ? LIMIT 1');
export const insertLoyaltyTransactions = (db: Db) => db.prepare(`
    INSERT INTO loyalty_transactions (transaction_id, tenant_id, customer_id, invoice_id,
      transaction_type, points, points_balance_before, points_balance_after,
      reference_number, description, created_by, sync_status, created_at)
    VALUES (@transaction_id, @tenant_id, @customer_id, @invoice_id,
      @transaction_type, @points, @points_balance_before, @points_balance_after,
      @reference_number, @description, @created_by, 'SYNCED', @created_at)
    ON CONFLICT(transaction_id) DO UPDATE SET
      transaction_type = excluded.transaction_type, points = excluded.points,
      points_balance_before = excluded.points_balance_before,
      points_balance_after = excluded.points_balance_after,
      reference_number = excluded.reference_number, description = excluded.description,
      sync_status = 'SYNCED'
  `);

export const selectCustomers3 = (db: Db) => db.prepare(`SELECT * FROM customers WHERE tenant_id = ? AND sync_status IN ('PENDING', 'FAILED')`);
export const updateCustomers2 = (db: Db) => db.prepare(`UPDATE customers SET sync_status = 'SYNCED', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?`);
export const updateCustomers3 = (db: Db) => db.prepare(`UPDATE customers SET sync_status = 'FAILED', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?`);
