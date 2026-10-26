import type { Db } from './types.js';

/** SQL statements used by services/partiesService.ts. Each factory prepares its statement on the given connection. */

export const findParties = (db: Db) => db.prepare('SELECT party_id, name FROM parties WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)');

export const insertParty = (db: Db) => db.prepare(`
      INSERT INTO parties (party_id, tenant_id, name, phone, address, gstin, balance, gst_balance, estimate_balance, balance_type, party_type, custom_category, notes, pricing_tier_id, credit_limit, credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry, whatsapp_alerts_enabled, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

export const insertPartyLedger = (db: Db) => db.prepare(`
        INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, created_by, created_by_name, created_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, 'GST', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

export const updatePartyLastTransactionDate = (db: Db) => db.prepare(`UPDATE parties SET last_transaction_date = CURRENT_TIMESTAMP WHERE party_id = ?`);

export const findPartiesPartyIdAndPhone = (db: Db) => db.prepare('SELECT party_id, phone, name FROM parties WHERE tenant_id = ? AND is_deleted = 0');

export const insertParty2 = (db: Db) => db.prepare(`
        INSERT INTO parties (
          party_id, tenant_id, name, phone, address, gstin, balance, gst_balance, estimate_balance,
          pricing_tier_id, credit_limit, party_type, custom_category, notes, balance_type,
          is_deleted, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 0, 'PENDING', ?, ?)
      `);

export const updatePartyByPartyId = (db: Db) => db.prepare(`
        UPDATE parties 
        SET name = ?, phone = COALESCE(?, phone), address = COALESCE(?, address), gstin = COALESCE(?, gstin),
            pricing_tier_id = COALESCE(?, pricing_tier_id), credit_limit = COALESCE(?, credit_limit),
            party_type = COALESCE(?, party_type), custom_category = COALESCE(?, custom_category), notes = COALESCE(?, notes),
            is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE party_id = ?
      `);

export const insertPartyLedger2 = (db: Db) => db.prepare(`
        INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, created_by, created_by_name, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GST', ?, ?, 'PENDING', ?, ?)
      `);

export const findPartiesByPartyId = (db: Db) => db.prepare('SELECT tenant_id, phone, name FROM parties WHERE party_id = ?');

export const findCustomersByPhone = (db: Db) => db.prepare('SELECT customer_id FROM customers WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)');

export const findCustomers = (db: Db) => db.prepare('SELECT customer_id FROM customers WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)');

export const updateCustomerByCustomerId = (db: Db) => db.prepare(`
          UPDATE customers 
          SET name = ?,
              phone = ?,
              address = ?,
              gstin = ?,
              notes = ?,
              credit_limit = COALESCE(?, credit_limit),
              credit_period_enabled = COALESCE(?, credit_period_enabled),
              credit_period_days = COALESCE(?, credit_period_days),
              credit_period_basis = COALESCE(?, credit_period_basis),
              restrict_on_credit_expiry = COALESCE(?, restrict_on_credit_expiry),
              pricing_tier_id = COALESCE(?, pricing_tier_id),
              sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE customer_id = ? AND tenant_id = ?
        `);

export const updatePartyIsDeleted = (db: Db) => db.prepare("UPDATE parties SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?");

export const updatePartyIsDeletedAlt = (db: Db) => db.prepare("UPDATE parties SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?");

export const updatePartyBalanceAndGstBalance = (db: Db) => db.prepare("UPDATE parties SET balance = balance + ?, gst_balance = gst_balance + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?");

export const findPartiesByPartyId2 = (db: Db) => db.prepare('SELECT * FROM parties WHERE party_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)');

export const findPartiesByPartyId3 = (db: Db) => db.prepare('SELECT * FROM parties WHERE party_id = ? AND tenant_id = ?');

export const updatePartyLedgerPartyId = (db: Db) => db.prepare(`
        UPDATE party_ledger 
        SET party_id = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
        WHERE party_id = ? AND tenant_id = ?
      `);

export const updatePartyByPartyId2 = (db: Db) => db.prepare(`
        UPDATE parties 
        SET phone = CASE WHEN (phone IS NULL OR phone = '') AND ? <> '' THEN ? ELSE phone END,
            address = CASE WHEN (address IS NULL OR address = '') AND ? <> '' THEN ? ELSE address END,
            gstin = CASE WHEN (gstin IS NULL OR gstin = '') AND ? <> '' THEN ? ELSE gstin END,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        WHERE party_id = ? AND tenant_id = ?
      `);

export const updatePartyIsDeleted2 = (db: Db) => db.prepare(`
        UPDATE parties 
        SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
        WHERE party_id = ? AND tenant_id = ?
      `);

export const findPartyLedgerByPartyIdAndBillNumber = (db: Db) => db.prepare(`
        SELECT pl.ledger_id FROM party_ledger pl
        WHERE pl.party_id = ?
          AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
          AND pl.reference_number IS NOT NULL
          AND pl.description LIKE 'Purchase bill %'
          AND NOT EXISTS (
            SELECT 1 FROM purchase_bills pb WHERE pb.bill_number = pl.reference_number
          )
      `);

export const updatePartyLedgerIsDeleted = (db: Db) => db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?");

export const findPartyLedgerByPartyIdAndInvoiceNumber = (db: Db) => db.prepare(`
        SELECT pl.ledger_id FROM party_ledger pl
        WHERE pl.party_id = ?
          AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
          AND (
            EXISTS (
              SELECT 1 FROM invoices i 
              WHERE i.is_deleted = 1 
                AND (
                  i.invoice_number = pl.reference_number 
                  OR pl.reference_number = i.invoice_number || '-PAY'
                  OR pl.reference_number LIKE i.invoice_number || '-%'
                  OR pl.description LIKE '%' || i.invoice_number || '%'
                )
            )
          )
      `);

export const updatePartyLedgerIsDeletedAlt = (db: Db) => db.prepare("UPDATE party_ledger SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ? AND party_id = ?");

export const findPartyLedgerByPartyId = (db: Db) => db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY transaction_date ASC, created_at ASC
    `);

export const updatePartyLedgerRunningBalance = (db: Db) => db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`);

export const findPartiesByPartyIdBalance = (db: Db) => db.prepare('SELECT balance FROM parties WHERE party_id = ?');

export const insertPartyLedger3 = (db: Db) => db.prepare(`
      INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, payment_method, reference_number, created_by, created_by_name, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

export const findPartyLedgerByLedgerIdAndPartyId = (db: Db) => db.prepare('SELECT * FROM party_ledger WHERE ledger_id = ? AND party_id = ?');

export const updatePartyLedgerByLedgerIdAndPartyId = (db: Db) => db.prepare(`
      UPDATE party_ledger SET 
        transaction_date = ?, description = ?, credit_amount = ?, debit_amount = ?,
        balance_type = ?, payment_method = ?,
        reference_number = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE ledger_id = ? AND party_id = ?
    `);

export const updatePartyLedgerIsDeletedIsDeleted2 = (db: Db) => db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ? AND party_id = ?");

/** All parties of a tenant with ledger-derived balances; deleted parties included (sorted last) when `includeDeleted`. */
export const listPartiesWithBalances = (db: Db, includeDeleted: boolean) => db.prepare(includeDeleted
      ? `SELECT p.*, 
          COALESCE(
            (SELECT ROUND(SUM(pl.credit_amount) - SUM(pl.debit_amount), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.balance,
            0
          ) AS current_balance,
          COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'GST' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.gst_balance,
            p.balance,
            0
          ) AS current_gst_balance,
          COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'ESTIMATE' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.estimate_balance,
            0
          ) AS current_estimate_balance,
          (SELECT MAX(pl.transaction_date) FROM party_ledger pl WHERE pl.party_id = p.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)) AS last_transaction_date
        FROM parties p WHERE p.tenant_id = ? ORDER BY p.is_deleted ASC, p.name COLLATE NOCASE ASC`
      : `SELECT p.*, 
          COALESCE(
            (SELECT ROUND(SUM(pl.credit_amount) - SUM(pl.debit_amount), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.balance,
            0
          ) AS current_balance,
          COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'GST' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.gst_balance,
            p.balance,
            0
          ) AS current_gst_balance,
          COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'ESTIMATE' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.estimate_balance,
            0
          ) AS current_estimate_balance,
          (SELECT MAX(pl.transaction_date) FROM party_ledger pl WHERE pl.party_id = p.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)) AS last_transaction_date
        FROM parties p WHERE p.tenant_id = ? AND p.is_deleted = 0 ORDER BY p.name COLLATE NOCASE ASC`);

/** Ledger entries of a party in transaction order; soft-deleted entries only when `includeDeleted`. */
export const listPartyLedger = (db: Db, includeDeleted: boolean) => db.prepare(includeDeleted
      ? `SELECT * FROM party_ledger WHERE party_id = ? ORDER BY transaction_date ASC, created_at ASC`
      : `SELECT * FROM party_ledger WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY transaction_date ASC, created_at ASC`);

/** Columns `updatePartyProfile` may set besides name / phone / address / gstin / notes. */
export type PartyProfileColumn = 'pricing_tier_id' | 'credit_limit' | 'credit_period_enabled' | 'credit_period_days' | 'credit_period_basis'
  | 'restrict_on_credit_expiry' | 'party_type' | 'custom_category' | 'whatsapp_alerts_enabled';

/** Update a party's profile. Params: name, phone, address, gstin, notes, one value per column in `columns`, party_id. */
export function updatePartyProfile(db: Db, columns: readonly PartyProfileColumn[]) {
  return db.prepare(`UPDATE parties SET name = ?, phone = ?, address = ?, gstin = ?, notes = ?${columns.map((c) => `, ${c} = ?`).join('')}, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`);
}
