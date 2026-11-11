import { moneyDecimalsSql } from './moneyPrecision.js';
import type { Db } from './types.js';

/** SQL statements used by services/partyLedgerService.ts. Each factory prepares its statement on the given connection. */

/**
 * SQL condition: ledger row `pl` was posted by bill number `inv` itself: its sale entry (reference = the bill number,
 * "Credit Sale …" / "Cash Sale …") or a payment taken at checkout (reference = bill number + -PAY/-CASH/-UPI/…).
 * Exact references only: a LIKE on the number also matched bill 10 for bill 1, and payments or returns that merely
 * mention the bill in their description. Callers add the tenant condition.
 */
export const invoiceOwnedEntry = (inv: string) => `(
  (pl.reference_number = ${inv} AND (pl.description LIKE 'Credit Sale %' OR pl.description LIKE 'Cash Sale %'))
  OR pl.reference_number IN (${inv} || '-PAY', ${inv} || '-CASH', ${inv} || '-UPI', ${inv} || '-CARD', ${inv} || '-BANK', ${inv} || '-CHEQUE')
)`;

/** Active ledger rows a bill posted itself (see `invoiceOwnedEntry`). Params: tenant_id, invoice_number. */
export const findInvoiceLedgerEntries = (db: Db) => db.prepare(`
      SELECT pl.* FROM party_ledger pl
      WHERE pl.tenant_id = @tenant AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
        AND ${invoiceOwnedEntry('@inv')}
    `);

/**
 * Other bills that hold this number, or held it before a sync collision renamed them `<number>-C…`. Their ledger rows
 * can carry the same reference, so the ids decide whose row is whose. Params: tenant, inv, id.
 */
export const findInvoicesSharingNumber = (db: Db) => db.prepare(`
      SELECT invoice_id FROM invoices
      WHERE tenant_id = @tenant AND invoice_id <> @id
        AND (invoice_number = @inv OR SUBSTR(invoice_number, 1, LENGTH(@inv) + 2) = @inv || '-C')
    `);

/** Return-credit uses posted when a bill consumed an ADJUST_BILL return (reference `<return>-ADJ-<bill>`). */
export const findReturnCreditUses = (db: Db, deleted: boolean) => db.prepare(`
      SELECT * FROM party_ledger
      WHERE tenant_id = @tenant AND COALESCE(is_deleted, 0) = ${deleted ? 1 : 0}
        AND SUBSTR(reference_number, -LENGTH('-ADJ-' || @inv)) = '-ADJ-' || @inv
    `);

export const updateReturnAdjustedAmount = (db: Db) => db.prepare(`
      UPDATE returns SET adjusted_amount = MAX(0, ROUND(COALESCE(adjusted_amount, 0) + ?, ${moneyDecimalsSql('returns.tenant_id')})), sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND return_number = ?
    `);

export const restorePartyLedgerEntry = (db: Db) => db.prepare(`
      UPDATE party_ledger SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?
    `);

/** Insert or rewrite one ledger row by id (both sides written, so a row can change side). */
export const upsertPartyLedgerEntry = (db: Db) => db.prepare(`
      INSERT INTO party_ledger (
        ledger_id, party_id, tenant_id, transaction_date, description,
        credit_amount, debit_amount, running_balance, balance_type,
        payment_method, reference_number, created_by, created_by_name,
        is_deleted, sync_status, created_at, updated_at
      )
      VALUES (@ledger_id, @party_id, @tenant_id, @transaction_date, @description, @credit_amount, @debit_amount, 0, @balance_type,
        @payment_method, @reference_number, @created_by, @created_by_name, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(ledger_id) DO UPDATE SET
        party_id = excluded.party_id,
        credit_amount = excluded.credit_amount,
        debit_amount = excluded.debit_amount,
        description = excluded.description,
        transaction_date = excluded.transaction_date,
        balance_type = excluded.balance_type,
        payment_method = excluded.payment_method,
        reference_number = excluded.reference_number,
        is_deleted = 0,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
    `);

/** Active ledger rows of one return: the return itself, its money refund and its credit uses. Params: tenant_id, return_number. */
export const findReturnLedgerEntries = (db: Db) => db.prepare(`
      SELECT * FROM party_ledger
      WHERE tenant_id = @tenant AND (is_deleted IS NULL OR is_deleted = 0)
        AND (reference_number = @ret OR reference_number = @ret || '-REFUND'
          OR SUBSTR(reference_number, 1, LENGTH(@ret || '-ADJ-')) = @ret || '-ADJ-')
    `);

export const updatePartyLedgerIsDeleted = (db: Db) => db.prepare(`
          UPDATE party_ledger
          SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE ledger_id = ?
        `);

export const findPartyLedgerByPartyId3 = (db: Db) => db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY transaction_date ASC, created_at ASC, rowid ASC
    `);

export const updatePartyLedgerRunningBalance = (db: Db) => db.prepare(`UPDATE party_ledger SET running_balance = ? WHERE ledger_id = ?`);

export const findPartyLedgerByPartyId4 = (db: Db) => db.prepare(`SELECT COALESCE(SUM(CASE WHEN balance_type = 'GST' THEN credit_amount - debit_amount ELSE 0 END), 0) AS gst,
            COALESCE(SUM(CASE WHEN balance_type = 'ESTIMATE' THEN credit_amount - debit_amount ELSE 0 END), 0) AS estimate,
            COALESCE(SUM(credit_amount - debit_amount), 0) AS total
     FROM party_ledger WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)`);

export const findOnePartyLedgerByPartyId = (db: Db) => db.prepare(`SELECT transaction_date FROM party_ledger WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY transaction_date DESC LIMIT 1`);

/**
 * Stores a party's recalculated balances. Only a real change marks the party for upload: recalculating every party at
 * startup must not queue all of them ahead of the ledger rows. Params: balance, gst, estimate, last date, party id.
 */
export const updatePartyByPartyId = (db: Db) => ({
  run: (balance: number, gst: number, estimate: number, lastDate: string | null | undefined, partyId: string) => {
    lastDate = lastDate ?? null;
    // Plain `?` only: better-sqlite3 (the app) rejects re-used numbered parameters that node:sqlite (tests) accepts.
    db.prepare(`UPDATE parties SET balance = ?, gst_balance = ?, estimate_balance = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE party_id = ? AND (ROUND(COALESCE(balance, 0), ${moneyDecimalsSql('parties.tenant_id')}) <> ? OR ROUND(COALESCE(gst_balance, 0), ${moneyDecimalsSql('parties.tenant_id')}) <> ? OR ROUND(COALESCE(estimate_balance, 0), ${moneyDecimalsSql('parties.tenant_id')}) <> ?)`)
      .run(balance, gst, estimate, lastDate, partyId, balance, gst, estimate);
    db.prepare(`UPDATE parties SET last_transaction_date = ? WHERE party_id = ? AND last_transaction_date IS NOT ?`).run(lastDate, partyId, lastDate);
  },
});

export const updatePartyLedgerRunningBalanceAlt = (db: Db) => db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`);

export const findStaffTransactionsByReferenceNumberAndType = (db: Db) => db.prepare(`
        SELECT transaction_id, staff_id FROM staff_transactions
        WHERE reference_number = ? AND type = 'STAFF_PURCHASE'
      `);

export const deleteStaffLedgerByTransactionId = (db: Db) => db.prepare(`DELETE FROM staff_ledger WHERE transaction_id = ?`);

export const deleteStaffTransactionByTransactionId = (db: Db) => db.prepare(`DELETE FROM staff_transactions WHERE transaction_id = ?`);

export const findOneSettingByKey = (db: Db) => db.prepare(`SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'feature_flags' LIMIT 1`);

export const findStaffByStaffId = (db: Db) => db.prepare(`SELECT staff_id, name, phone, staff_code FROM staff WHERE staff_id = ? AND is_deleted = 0`);

export const findOneStaffByPhone = (db: Db) => db.prepare(`SELECT staff_id, name, phone, staff_code FROM staff WHERE is_deleted = 0 AND (phone = ? OR REPLACE(phone, ' ', '') LIKE ?) LIMIT 1`);

export const findOneStaffTransactionByReferenceNumberAndType = (db: Db) => db.prepare(`
          SELECT transaction_id FROM staff_transactions 
          WHERE reference_number = ? AND type = 'STAFF_PURCHASE' LIMIT 1
        `);

export const updateStaffTransactionByTransactionId = (db: Db) => db.prepare(`
            UPDATE staff_transactions 
            SET staff_id = ?, amount = ?, notes = ?, transaction_date = ?, sync_status = 'PENDING'
            WHERE transaction_id = ?
          `);

export const updateStaffLedgerByTransactionId = (db: Db) => db.prepare(`
            UPDATE staff_ledger
            SET staff_id = ?, credit_amount = ?, debit_amount = 0, description = ?, transaction_date = ?, sync_status = 'PENDING'
            WHERE transaction_id = ?
          `);

export const insertStaffTransaction = (db: Db) => db.prepare(`
            INSERT INTO staff_transactions (
              transaction_id, tenant_id, staff_id, type, amount, payment_method,
              reference_number, notes, created_by, created_by_name, transaction_date,
              sync_status, created_at, updated_at
            ) VALUES (?, ?, ?, 'STAFF_PURCHASE', ?, 'CREDIT', ?, ?, ?, ?, ?, 'PENDING', ?, ?)
          `);

export const insertStaffLedger = (db: Db) => db.prepare(`
            INSERT INTO staff_ledger (
              ledger_id, tenant_id, staff_id, transaction_id, transaction_date,
              description, debit_amount, credit_amount, running_balance,
              reference_type, created_by, sync_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, 'STAFF_PURCHASE', ?, 'PENDING', ?)
          `);

export const findStaffTransactionsByReferenceNumberAndTypeStaffPurchase = (db: Db) => db.prepare(`
          SELECT transaction_id FROM staff_transactions 
          WHERE reference_number = ? AND type = 'STAFF_PURCHASE'
        `);

export const findSettingsByKey = (db: Db) => db.prepare(`SELECT value FROM settings WHERE tenant_id = ? AND key = ?`);

export const upsertPartyLedger = (db: Db) => db.prepare(`
      INSERT INTO party_ledger (
        ledger_id, party_id, tenant_id, transaction_date, description,
        credit_amount, debit_amount, running_balance, balance_type,
        payment_method, reference_number, created_by, created_by_name,
        is_deleted, sync_status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(ledger_id) DO UPDATE SET
        party_id = excluded.party_id,
        tenant_id = excluded.tenant_id,
        credit_amount = excluded.credit_amount,
        debit_amount = 0,
        description = excluded.description,
        transaction_date = excluded.transaction_date,
        balance_type = excluded.balance_type,
        payment_method = excluded.payment_method,
        is_deleted = 0,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
    `);

export const upsertPartyLedger2 = (db: Db) => db.prepare(`
        INSERT INTO party_ledger (
          ledger_id, party_id, tenant_id, transaction_date, description,
          credit_amount, debit_amount, running_balance, balance_type,
          payment_method, reference_number, created_by, created_by_name,
          is_deleted, sync_status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(ledger_id) DO UPDATE SET
          party_id = excluded.party_id,
          tenant_id = excluded.tenant_id,
          credit_amount = 0,
          debit_amount = excluded.debit_amount,
          description = excluded.description,
          transaction_date = excluded.transaction_date,
          balance_type = excluded.balance_type,
          payment_method = excluded.payment_method,
          is_deleted = 0,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      `);

export const findOnePartyLedgerByReferenceNumber = (db: Db) => db.prepare(`
      SELECT * FROM party_ledger WHERE tenant_id = ? AND reference_number = ? ORDER BY COALESCE(is_deleted, 0) ASC LIMIT 1
    `);

/** SQL condition: a SPLIT payment of invoice `i` with a credit part above zero. */
const splitCredit = `(UPPER(i.payment_method) = 'SPLIT' AND json_valid(i.split_details) AND CAST(json_extract(i.split_details, '$.credit') AS REAL) > 0)`;

export const findInvoicesByReferenceNumber = (db: Db) => db.prepare(`
      SELECT i.* FROM invoices i
      WHERE (UPPER(i.payment_method) = 'CREDIT' OR ${splitCredit})
        AND (i.is_deleted IS NULL OR i.is_deleted = 0)
        AND NOT EXISTS (
          SELECT 1 FROM party_ledger pl
          WHERE pl.tenant_id = i.tenant_id
            AND ${invoiceOwnedEntry('i.invoice_number')}
            -- Retired rows count too: they mean another terminal cancelled the bill and its own copy has not arrived yet.
            -- Posting them again here would bring a cancelled bill back onto the customer, and upload it.
        )
    `);

export const findReturnsByReferenceNumber = (db: Db) => db.prepare(`
        SELECT r.*, i.invoice_number as orig_invoice_number, i.payment_method as orig_payment_method, i.split_details as orig_split_details, i.customer_id as orig_customer_id, i.customer_name as orig_customer_name, i.customer_phone as orig_customer_phone, i.customer_address as orig_customer_address, i.customer_gstin as orig_customer_gstin
        FROM returns r
        LEFT JOIN invoices i ON i.invoice_id = r.invoice_id
        WHERE (
          UPPER(COALESCE(i.payment_method, '')) = 'CREDIT'
          OR ${splitCredit}
          OR UPPER(COALESCE(r.refund_method, '')) IN ('CREDIT', 'STORE_CREDIT', 'ADJUST_BILL')
        )
          AND (i.is_deleted IS NULL OR i.is_deleted = 0)
          -- Walk-in returns have no party to post to; syncReturnLedger skips them, so selecting them re-scans them forever.
          AND (
            TRIM(COALESCE(r.customer_name, '')) <> '' OR TRIM(COALESCE(i.customer_name, '')) <> ''
            OR TRIM(COALESCE(r.customer_phone, '')) <> '' OR TRIM(COALESCE(i.customer_phone, '')) <> ''
            OR COALESCE(i.customer_id, '') <> ''
          )
          AND NOT EXISTS (
            SELECT 1 FROM party_ledger pl
            WHERE pl.tenant_id = r.tenant_id
              AND pl.reference_number = r.return_number
              AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
          )
      `);

/** Active rows posted by bills that are now deleted (same shop, exact bill references). */
export const findPartyLedger = (db: Db) => db.prepare(`
        SELECT pl.ledger_id, pl.party_id FROM party_ledger pl
        JOIN invoices i ON i.tenant_id = pl.tenant_id AND ${invoiceOwnedEntry('i.invoice_number')}
        WHERE i.is_deleted = 1 AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
          AND NOT EXISTS (
            SELECT 1 FROM invoices live WHERE live.tenant_id = i.tenant_id AND live.invoice_number = i.invoice_number
              AND (live.is_deleted IS NULL OR live.is_deleted = 0)
          )
      `);

export const findOneCustomerByPhoneAndCustomerId = (db: Db) => db.prepare(`
    SELECT c.*, 
           p.party_id, p.balance as party_balance, p.credit_limit as party_credit_limit,
           p.credit_period_enabled as party_credit_period_enabled,
           p.credit_period_days as party_credit_period_days,
           p.credit_period_basis as party_credit_period_basis,
           p.restrict_on_credit_expiry as party_restrict_on_credit_expiry
    FROM customers c
    LEFT JOIN parties p ON p.tenant_id = c.tenant_id AND (p.is_deleted IS NULL OR p.is_deleted = 0)
      AND ((c.phone IS NOT NULL AND TRIM(c.phone) <> '' AND p.phone = c.phone) OR (LOWER(TRIM(p.name)) = LOWER(TRIM(c.name))))
    WHERE c.customer_id = ? AND c.tenant_id = ?
    ORDER BY CASE WHEN p.party_type = 'CUSTOMER' THEN 0 ELSE 1 END LIMIT 1
  `);

export const findPartyLedgerByPartyId5 = (db: Db) => db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount, reference_number, description, transaction_date
      FROM party_ledger
      WHERE party_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY transaction_date ASC, created_at ASC
    `);

export const findCustomersByCustomerId = (db: Db) => db.prepare('SELECT * FROM customers WHERE customer_id = ? AND tenant_id = ?');

export const findCustomersByPhone = (db: Db) => db.prepare(`SELECT * FROM customers WHERE tenant_id = ? AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?)`);

export const findCustomersByPhone2 = (db: Db) => db.prepare('SELECT * FROM customers WHERE tenant_id = ? AND phone = ?');

export const findCustomers = (db: Db) => db.prepare('SELECT * FROM customers WHERE tenant_id = ? AND LOWER(TRIM(name)) = ?');

export const findOnePartyByPhone = (db: Db) => db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0) AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?) LIMIT 1`);

export const findOnePartyByPhone2 = (db: Db) => db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0) LIMIT 1`);

export const findOneParty = (db: Db) => db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0) LIMIT 1`);

export const findInvoicesByCustomerId = (db: Db) => db.prepare(`
    SELECT invoice_id, invoice_number, grand_total, received_amount, balance_amount, payment_method, split_details, due_date, created_at
    FROM invoices
    WHERE tenant_id = ?
      AND (
        (? != '' AND customer_id = ?)
        OR (? != '' AND customer_id = ?)
        OR (? != '' AND customer_phone IS NOT NULL AND customer_phone != '' AND REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '-', ''), '+', '') LIKE ?)
        OR (? != '' AND customer_name IS NOT NULL AND LOWER(REPLACE(TRIM(customer_name), '  ', ' ')) = ? AND (customer_phone IS NULL OR customer_phone = '' OR ? = ''))
      )
      AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
      AND (is_held IS NULL OR is_held = 0)
      AND (is_deleted IS NULL OR is_deleted = 0)
    ORDER BY created_at DESC
  `);

/** Dynamic SQL: `tenantClause` must be built from trusted values (placeholders/column lists), never user input. */
export const recalcAllPartyBalances = (db: Db, tenantClause: string | number) => db.prepare(`
      UPDATE parties
      SET balance = COALESCE(
            (SELECT ROUND(SUM(credit_amount) - SUM(debit_amount), ${moneyDecimalsSql('parties.tenant_id')})
             FROM party_ledger pl
             WHERE pl.party_id = parties.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            0
          ),
          gst_balance = COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'GST' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), ${moneyDecimalsSql('parties.tenant_id')})
             FROM party_ledger pl
             WHERE pl.party_id = parties.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            0
          ),
          estimate_balance = COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'ESTIMATE' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), ${moneyDecimalsSql('parties.tenant_id')})
             FROM party_ledger pl
             WHERE pl.party_id = parties.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            0
          ),
          last_transaction_date = COALESCE(
            (SELECT MAX(pl.transaction_date)
             FROM party_ledger pl
             WHERE pl.party_id = parties.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            parties.last_transaction_date
          )
      -- Every party with ledger rows, also when all of them are deleted (its balance is then zero, not the stale stored value).
      ${tenantClause} parties.party_id IN (SELECT DISTINCT party_id FROM party_ledger pl)
    `);
