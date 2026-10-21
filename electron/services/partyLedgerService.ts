import crypto from 'node:crypto';
import { getDb, CustomerIdentityService, recalcStaffLedgerBalances } from '../db/localDb.js';
import { deterministicUUID, localTimestamp } from '../ipc/common.js';

// Recompute a party's GST / Estimate / total balances from its ledger entries
export function recalcPartyBalances(db: any, partyId: string) {
  try {
    // 1. Deduplicate entries by reference_number, description, credit_amount, and debit_amount
    const refDups = db.prepare(`
      SELECT reference_number, description, credit_amount, debit_amount, COUNT(*) as cnt 
      FROM party_ledger 
      WHERE party_id = ? 
        AND reference_number IS NOT NULL 
        AND TRIM(reference_number) <> '' 
        AND (is_deleted IS NULL OR is_deleted = 0)
      GROUP BY reference_number, description, credit_amount, debit_amount 
      HAVING cnt > 1
    `).all(partyId) as any[];

    for (const d of refDups) {
      const rows = db.prepare(`
        SELECT ledger_id FROM party_ledger
        WHERE party_id = ? 
          AND reference_number = ? 
          AND description = ?
          AND credit_amount = ?
          AND debit_amount = ?
          AND (is_deleted IS NULL OR is_deleted = 0)
        ORDER BY created_at ASC, rowid ASC
      `).all(partyId, d.reference_number, d.description, d.credit_amount, d.debit_amount) as any[];

      for (let i = 1; i < rows.length; i++) {
        db.prepare(`
          UPDATE party_ledger 
          SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
          WHERE ledger_id = ?
        `).run(rows[i].ledger_id);
      }
    }

    // 2. Deduplicate exact match entries (same description, credit_amount, debit_amount, transaction_date)
    const exactDups = db.prepare(`
      SELECT description, credit_amount, debit_amount, transaction_date, COUNT(*) as cnt
      FROM party_ledger
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
      GROUP BY description, credit_amount, debit_amount, transaction_date
      HAVING cnt > 1
    `).all(partyId) as any[];

    for (const d of exactDups) {
      const rows = db.prepare(`
        SELECT ledger_id FROM party_ledger
        WHERE party_id = ? 
          AND description = ? 
          AND credit_amount = ? 
          AND debit_amount = ? 
          AND transaction_date = ? 
          AND (is_deleted IS NULL OR is_deleted = 0)
        ORDER BY created_at ASC, rowid ASC
      `).all(partyId, d.description, d.credit_amount, d.debit_amount, d.transaction_date) as any[];

      for (let i = 1; i < rows.length; i++) {
        db.prepare(`
          UPDATE party_ledger 
          SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
          WHERE ledger_id = ?
        `).run(rows[i].ledger_id);
      }
    }

    // 3. Re-sequence running_balance for all remaining active entries
    const activeEntries = db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY transaction_date ASC, created_at ASC
    `).all(partyId) as any[];

    let running = 0;
    for (const row of activeEntries) {
      running += (Number(row.credit_amount) || 0) - (Number(row.debit_amount) || 0);
      running = Math.round(running * 100) / 100;
      db.prepare(`UPDATE party_ledger SET running_balance = ? WHERE ledger_id = ?`).run(running, row.ledger_id);
    }
  } catch (err) {
    console.error('[recalcPartyBalances] Deduplication error:', err);
  }

  const rows = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN balance_type = 'GST' THEN credit_amount - debit_amount ELSE 0 END), 0) AS gst,
            COALESCE(SUM(CASE WHEN balance_type = 'ESTIMATE' THEN credit_amount - debit_amount ELSE 0 END), 0) AS estimate,
            COALESCE(SUM(credit_amount - debit_amount), 0) AS total
     FROM party_ledger WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)`
  ).get(partyId) as any;
  const gst = Math.round((parseFloat(rows.gst) || 0) * 100) / 100;
  const estimate = Math.round((parseFloat(rows.estimate) || 0) * 100) / 100;
  const total = Math.round((gst + estimate) * 100) / 100;
  const latest = db.prepare(`SELECT transaction_date FROM party_ledger WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY transaction_date DESC LIMIT 1`).get(partyId) as any;
  db.prepare(`UPDATE parties SET balance = ?, gst_balance = ?, estimate_balance = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`)
    .run(total, gst, estimate, latest ? latest.transaction_date : null, partyId);
  return total;
}

export function reconcileAllPartyBalances(db: any, tenantId?: string) {
  try {
    const tenantClause = tenantId ? 'WHERE parties.tenant_id = ? AND' : 'WHERE';
    const params = tenantId ? [tenantId] : [];
    db.prepare(`
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
      ${tenantClause} parties.party_id IN (SELECT DISTINCT party_id FROM party_ledger pl WHERE pl.is_deleted IS NULL OR pl.is_deleted = 0)
    `).run(...params);
  } catch (err: any) {
    console.error('[reconcileAllPartyBalances] Error:', err);
  }
}


export function syncInvoiceCreditLedger(
  db: any,
  invoice: {
    invoice_id?: string;
    tenant_id?: string;
    invoice_number?: string;
    invoice_type?: string;
    grand_total?: number;
    payment_method?: string;
    received_amount?: number;
    balance_amount?: number;
    customer_id?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_address?: string | null;
    customer_gstin?: string | null;
    user_id?: string;
    user_name?: string;
    split_details?: any;
    created_at?: string;
    is_staff?: boolean;
    staff_id?: string | null;
  },
  isDelete = false
) {
  try {
    const tenantId = invoice.tenant_id || 'global';
    const invoiceNumber = (invoice.invoice_number || '').trim();
    if (!invoiceNumber) return;

    // ── 1. DELETION HANDLING (MUST BE EVALUATED FIRST) ──────────────────────
    if (isDelete) {
      console.log(`[syncInvoiceCreditLedger] Soft-deleting ledger entries for invoice: ${invoiceNumber}`);
      const toDelete = db.prepare(`
        SELECT ledger_id, party_id FROM party_ledger
        WHERE (
          reference_number = ? 
          OR reference_number = ? 
          OR reference_number LIKE ? 
          OR description LIKE ?
        )
        AND (is_deleted IS NULL OR is_deleted = 0)
      `).all(invoiceNumber, `${invoiceNumber}-PAY`, `${invoiceNumber}%`, `%${invoiceNumber}%`) as any[];

      if (toDelete.length > 0) {
        const affectedParties = new Set<string>();
        for (const row of toDelete) {
          affectedParties.add(row.party_id);
          db.prepare(`
            UPDATE party_ledger 
            SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
            WHERE ledger_id = ?
          `).run(row.ledger_id);
        }

        for (const pId of affectedParties) {
          // Re-sequence running_balance for this party
          const allEntries = db.prepare(`
            SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
            WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
            ORDER BY transaction_date ASC, created_at ASC
          `).all(pId) as any[];

          let running = 0;
          for (const row of allEntries) {
            running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
            db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
          }

          recalcPartyBalances(db, pId);
        }
        console.log(`[syncInvoiceCreditLedger] Soft-deleted ${toDelete.length} entries for ${invoiceNumber}.`);
      }

      // Also clean up any staff ledger entries for this invoice
      const staffTxToDelete = db.prepare(`
        SELECT transaction_id, staff_id FROM staff_transactions
        WHERE reference_number = ? AND type = 'STAFF_PURCHASE'
      `).all(invoiceNumber) as any[];

      if (staffTxToDelete.length > 0) {
        for (const stx of staffTxToDelete) {
          db.prepare(`DELETE FROM staff_ledger WHERE transaction_id = ?`).run(stx.transaction_id);
          db.prepare(`DELETE FROM staff_transactions WHERE transaction_id = ?`).run(stx.transaction_id);
          recalcStaffLedgerBalances(db, tenantId, stx.staff_id);
        }
        console.log(`[syncInvoiceCreditLedger] Deleted staff purchase ledger entries for invoice: ${invoiceNumber}`);
      }

      return;
    }

    // ── 2. FIND ALL EXISTING ENTRIES FOR THIS INVOICE ───────────────────────
    // Query without strict tenantId to catch any previous entries created under different tenant tags
    const existingEntries = db.prepare(`
      SELECT * FROM party_ledger 
      WHERE (
        reference_number = ? 
        OR reference_number = ? 
        OR reference_number LIKE ?
        OR description LIKE ?
      )
      AND (is_deleted IS NULL OR is_deleted = 0)
    `).all(invoiceNumber, `${invoiceNumber}-PAY`, `${invoiceNumber}-%`, `%${invoiceNumber}%`) as any[];

    // ── 3. PARSE PAYMENT METHODS & SPLIT DETAILS ────────────────────────────
    let splitObj: any = null;
    if ((invoice as any).split_details && (invoice as any).split_details !== 'null') {
      try {
        splitObj = typeof (invoice as any).split_details === 'string'
          ? JSON.parse((invoice as any).split_details)
          : (invoice as any).split_details;
      } catch {}
    }

    const paymentMethodUpper = (invoice.payment_method || '').toUpperCase();
    const splitCredit = Math.max(0, Number(splitObj?.credit) || 0);
    const splitCash = Math.max(0, Number(splitObj?.cash) || 0);
    const splitUpi = Math.max(0, Number(splitObj?.upi) || 0);
    const splitCard = Math.max(0, Number(splitObj?.card) || 0);
    const splitBank = Math.max(0, Number(splitObj?.bank_transfer || splitObj?.bank) || 0);
    const splitCheque = Math.max(0, Number(splitObj?.cheque) || 0);

    const isSplit = paymentMethodUpper === 'SPLIT';
    const isSplitCredit = isSplit && splitCredit > 0;
    const isPureCredit = paymentMethodUpper === 'CREDIT';
    const isCredit = isPureCredit || isSplitCredit;

    const invoiceGrandTotal = Math.max(0, Number(invoice.grand_total) || 0);
    const invoiceReceivedAmount = Math.max(0, Number(invoice.received_amount) || 0);

    // ── 3B. CHECK IF THIS INVOICE IS FOR A STAFF MEMBER ─────────────────────
    let isStaffCreditBillingEnabled = false;
    try {
      const sfRow = db.prepare(`SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'feature_flags' LIMIT 1`).get(tenantId) as any;
      if (sfRow?.value) {
        const parsed = typeof sfRow.value === 'string' ? JSON.parse(sfRow.value) : sfRow.value;
        isStaffCreditBillingEnabled = Boolean(parsed?.staff_credit_billing);
      }
    } catch {}

    let targetStaff: any = null;
    const isExplicitStaff = Boolean(invoice.is_staff || (invoice as any).isStaffCustomer);
    const staffIdParam = invoice.staff_id || (isExplicitStaff ? invoice.customer_id : null);

    if (staffIdParam) {
      targetStaff = db.prepare(`SELECT staff_id, name, phone, staff_code FROM staff WHERE staff_id = ? AND is_deleted = 0`).get(staffIdParam);
    } else if (invoice.customer_id && (isExplicitStaff || isStaffCreditBillingEnabled)) {
      targetStaff = db.prepare(`SELECT staff_id, name, phone, staff_code FROM staff WHERE staff_id = ? AND is_deleted = 0`).get(invoice.customer_id);
    }

    if (!targetStaff && (isExplicitStaff || isStaffCreditBillingEnabled) && invoice.customer_phone) {
      const cleanPh = (invoice.customer_phone || '').replace(/\D/g, '');
      if (cleanPh.length >= 7) {
        targetStaff = db.prepare(`SELECT staff_id, name, phone, staff_code FROM staff WHERE is_deleted = 0 AND (phone = ? OR REPLACE(phone, ' ', '') LIKE ?) LIMIT 1`).get(invoice.customer_phone.trim(), `%${cleanPh.slice(-10)}`);
      }
    }

    if (targetStaff) {
      console.log(`[syncInvoiceCreditLedger] Invoice ${invoiceNumber} is for staff "${targetStaff.name}" (${targetStaff.staff_id}). Processing in Staff Ledger.`);

      // Clean up any accidental entries in party_ledger
      if (existingEntries.length > 0) {
        const affectedParties = new Set<string>();
        for (const entry of existingEntries) {
          affectedParties.add(entry.party_id);
          db.prepare(`UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(entry.ledger_id);
        }
        for (const pId of affectedParties) recalcPartyBalances(db, pId);
      }

      const creditDue = isSplit ? splitCredit : (isPureCredit ? Math.max(0, invoiceGrandTotal - invoiceReceivedAmount) : 0);
      const txDate = invoice.created_at || localTimestamp();
      const nowTimestamp = localTimestamp();

      if (creditDue > 0) {
        const desc = `Staff Purchase - Bill #${invoiceNumber} (Total ₹${invoiceGrandTotal.toFixed(2)})`;
        const existingStaffTx: any = db.prepare(`
          SELECT transaction_id FROM staff_transactions 
          WHERE reference_number = ? AND type = 'STAFF_PURCHASE' LIMIT 1
        `).get(invoiceNumber);

        if (existingStaffTx) {
          db.prepare(`
            UPDATE staff_transactions 
            SET staff_id = ?, amount = ?, notes = ?, transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
            WHERE transaction_id = ?
          `).run(targetStaff.staff_id, creditDue, desc, txDate, existingStaffTx.transaction_id);

          db.prepare(`
            UPDATE staff_ledger
            SET staff_id = ?, credit_amount = ?, debit_amount = 0, description = ?, transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
            WHERE transaction_id = ?
          `).run(targetStaff.staff_id, creditDue, desc, txDate, existingStaffTx.transaction_id);
        } else {
          const txId = crypto.randomUUID();
          const ledgerId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO staff_transactions (
              transaction_id, tenant_id, staff_id, type, amount, payment_method,
              reference_number, notes, created_by, created_by_name, transaction_date,
              sync_status, created_at, updated_at
            ) VALUES (?, ?, ?, 'STAFF_PURCHASE', ?, 'CREDIT', ?, ?, ?, ?, ?, 'PENDING', ?, ?)
          `).run(
            txId, tenantId, targetStaff.staff_id, creditDue, invoiceNumber, desc,
            invoice.user_id || null, invoice.user_name || null, txDate, nowTimestamp, nowTimestamp
          );

          db.prepare(`
            INSERT INTO staff_ledger (
              ledger_id, tenant_id, staff_id, transaction_id, transaction_date,
              description, debit_amount, credit_amount, running_balance,
              reference_type, created_by, sync_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, 'STAFF_PURCHASE', ?, 'PENDING', ?)
          `).run(
            ledgerId, tenantId, targetStaff.staff_id, txId, txDate, desc,
            creditDue, invoice.user_id || null, nowTimestamp
          );
        }
        recalcStaffLedgerBalances(db, tenantId, targetStaff.staff_id);
      } else {
        const staffTxToRemove: any[] = db.prepare(`
          SELECT transaction_id FROM staff_transactions 
          WHERE reference_number = ? AND type = 'STAFF_PURCHASE'
        `).all(invoiceNumber);
        for (const stx of staffTxToRemove) {
          db.prepare(`DELETE FROM staff_ledger WHERE transaction_id = ?`).run(stx.transaction_id);
          db.prepare(`DELETE FROM staff_transactions WHERE transaction_id = ?`).run(stx.transaction_id);
        }
        if (staffTxToRemove.length > 0) {
          recalcStaffLedgerBalances(db, tenantId, targetStaff.staff_id);
        }
      }
      return;
    }

    // ── 4. RESOLVE CUSTOMER & PARTY IDENTITY ────────────────────────────────
    const custName = (invoice.customer_name || '').trim();
    const custPhone = (invoice.customer_phone || '').trim();
    const custAddress = (invoice.customer_address || '').trim() || null;
    const custGstin = (invoice.customer_gstin || '').trim() || null;
    const custId = invoice.customer_id || null;

    if (!custName && !custPhone && !custId) {
      // If customer identity is missing, soft delete any existing entries for this bill
      if (existingEntries.length > 0) {
        const affectedPartyIds = new Set<string>();
        for (const entry of existingEntries) {
          affectedPartyIds.add(entry.party_id);
          db.prepare(`UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(entry.ledger_id);
        }
        for (const pId of affectedPartyIds) recalcPartyBalances(db, pId);
      }
      return;
    }

    const identityResult = CustomerIdentityService.findOrCreateCustomerAndParty(db, tenantId, {
      customer_id: custId,
      name: custName,
      phone: custPhone,
      address: custAddress,
      gstin: custGstin,
    });

    if (!identityResult) {
      console.error('[syncInvoiceCreditLedger] Failed to resolve customer/party identity');
      return;
    }

    const targetPartyId = identityResult.party_id;

    // Party changed? Clean up entries from previous party
    const oldPartyIds = new Set<string>();
    for (const entry of existingEntries) {
      if (entry.party_id !== targetPartyId) {
        oldPartyIds.add(entry.party_id);
        db.prepare(`
          UPDATE party_ledger 
          SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
          WHERE ledger_id = ?
        `).run(entry.ledger_id);
      }
    }
    for (const opId of oldPartyIds) {
      recalcPartyBalances(db, opId);
    }

    // ── 5. HANDLE NON-CREDIT INVOICES (CASH, UPI, CARD, ETC.) ───────────────
    if (!isCredit) {
      // Check if show_fully_paid_cash_in_ledger is enabled for cash
      const isCash = paymentMethodUpper === 'CASH';
      const isFullyPaidCash = isCash && invoiceGrandTotal > 0 && invoiceReceivedAmount >= invoiceGrandTotal - 0.01;

      let showFullyPaidCash = false;
      if (isFullyPaidCash) {
        const showSetting = db.prepare(`SELECT value FROM settings WHERE tenant_id = ? AND key = ?`).get(tenantId, 'show_fully_paid_cash_in_ledger');
        showFullyPaidCash = showSetting ? JSON.parse(showSetting.value) : false;
      }

      if (!showFullyPaidCash) {
        // Soft delete all existing entries for this invoice for this party
        const targetEntries = existingEntries.filter(e => e.party_id === targetPartyId);
        if (targetEntries.length > 0) {
          for (const entry of targetEntries) {
            db.prepare(`
              UPDATE party_ledger 
              SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
              WHERE ledger_id = ?
            `).run(entry.ledger_id);
          }
          // Re-sequence and update balance
          const allEntries = db.prepare(`
            SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
            WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
            ORDER BY transaction_date ASC, created_at ASC
          `).all(targetPartyId) as any[];

          let running = 0;
          for (const row of allEntries) {
            running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
            db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
          }
          recalcPartyBalances(db, targetPartyId);
        }
        return;
      }
    }

    // ── 6. SYNC CREDIT / SPLIT-CREDIT / CASH-IN-LEDGER ENTRIES ─────────────
    const balanceType: 'GST' | 'ESTIMATE' = (invoice.invoice_type === 'ESTIMATE') ? 'ESTIMATE' : 'GST';
    const txDate = invoice.created_at || localTimestamp();

    // Mark ALL existing active entries for this invoice for this party as deleted first
    // so we can cleanly recreate the exact updated set of sale and payment entries
    const existingForParty = existingEntries.filter(e => e.party_id === targetPartyId);
    for (const entry of existingForParty) {
      db.prepare(`UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(entry.ledger_id);
    }

    // A. Construct Sale Description and Breakdown
    let breakdownParts: string[] = [];
    if (isSplit) {
      if (splitCash > 0) breakdownParts.push(`Cash ₹${splitCash}`);
      if (splitUpi > 0) breakdownParts.push(`UPI ₹${splitUpi}`);
      if (splitCard > 0) breakdownParts.push(`Card ₹${splitCard}`);
      if (splitBank > 0) breakdownParts.push(`Bank ₹${splitBank}`);
      if (splitCheque > 0) breakdownParts.push(`Cheque ₹${splitCheque}`);
      if (splitCredit > 0) breakdownParts.push(`Credit ₹${splitCredit}`);
    } else if (isPureCredit) {
      const creditPortion = Math.max(0, invoiceGrandTotal - invoiceReceivedAmount);
      if (invoiceReceivedAmount > 0) breakdownParts.push(`Paid ₹${invoiceReceivedAmount}`);
      breakdownParts.push(`Credit ₹${creditPortion}`);
    } else if (paymentMethodUpper === 'CASH') {
      breakdownParts.push(`Cash ₹${invoiceGrandTotal}`);
    }

    const breakdownText = breakdownParts.length > 0 ? ` (${breakdownParts.join(', ')})` : '';
    const salePrefix = isCredit ? 'Credit Sale' : 'Cash Sale';
    const saleDescription = `${salePrefix} ${invoiceNumber} - Total ₹${invoiceGrandTotal.toFixed(2)}${breakdownText} - ${custName || 'Customer'}`;

    // 1. Sale Entry (Credit Amount = total invoice amount)
    const saleLedgerId = deterministicUUID(`credit_sale:${tenantId}:${invoiceNumber}`);
    db.prepare(`
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
    `).run(
      saleLedgerId,
      targetPartyId,
      tenantId,
      txDate,
      saleDescription,
      invoiceGrandTotal,
      balanceType,
      isCredit ? 'CREDIT' : paymentMethodUpper,
      invoiceNumber,
      invoice.user_id || 'system',
      invoice.user_name || 'System'
    );

    // 2. Immediate Payments received at checkout (Debit Amount = payment amounts)
    const upsertPaymentEntry = (type: string, amount: number, refSuffix: string, method: string) => {
      if (amount <= 0) return;
      const payLedgerId = deterministicUUID(`credit_pay_${refSuffix.toLowerCase()}:${tenantId}:${invoiceNumber}`);
      const payRef = `${invoiceNumber}-${refSuffix}`;
      const payDesc = `Payment received (${type}) for ${invoiceNumber}`;
      db.prepare(`
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
      `).run(
        payLedgerId,
        targetPartyId,
        tenantId,
        txDate,
        payDesc,
        amount,
        balanceType,
        method,
        payRef,
        invoice.user_id || 'system',
        invoice.user_name || 'System'
      );
    };

    if (isSplit) {
      upsertPaymentEntry('Cash', splitCash, 'CASH', 'CASH');
      upsertPaymentEntry('UPI', splitUpi, 'UPI', 'UPI');
      upsertPaymentEntry('Card', splitCard, 'CARD', 'CARD');
      upsertPaymentEntry('Bank', splitBank, 'BANK', 'BANK_TRANSFER');
      upsertPaymentEntry('Cheque', splitCheque, 'CHEQUE', 'CHEQUE');
    } else if (isPureCredit && invoiceReceivedAmount > 0) {
      upsertPaymentEntry('Cash', invoiceReceivedAmount, 'PAY', 'CASH');
    } else if (paymentMethodUpper === 'CASH' && invoiceGrandTotal > 0) {
      upsertPaymentEntry('Cash', invoiceGrandTotal, 'PAY', 'CASH');
    }

    // 3. Re-sequence running_balance for the party
    const allEntries = db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY transaction_date ASC, created_at ASC
    `).all(targetPartyId) as any[];

    let running = 0;
    for (const row of allEntries) {
      running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
      db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
    }

    recalcPartyBalances(db, targetPartyId);
  } catch (err: any) {
    console.error(`[syncInvoiceCreditLedger] Failed for invoice ${invoice.invoice_number || invoice.invoice_id || '?'} (tenant ${invoice.tenant_id || 'global'}):`, err);
  }
}



export function syncReturnLedger(
  db: any,
  params: {
    tenant_id: string;
    return_number: string;
    return_id?: string;
    invoice_id?: string | null;
    invoice_number?: string | null;
    customer_id?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_address?: string | null;
    customer_gstin?: string | null;
    grand_total: number;
    refund_method: string; // 'CREDIT' | 'CASH' | 'ADJUST_BILL' | 'STORE_CREDIT' | 'CARD' | 'UPI' | etc.
    adjusted_invoice_number?: string | null;
    amount?: number; // For ADJUST_BILL, the amount being adjusted
    user_id?: string;
    user_name?: string;
    created_at?: string;
  }
) {
  try {
    const tenantId = params.tenant_id || 'global';
    const returnNumber = params.return_number;
    if (!returnNumber) return;

    const custName = (params.customer_name || '').trim();
    const custPhone = (params.customer_phone || '').trim();
    const custAddress = (params.customer_address || '').trim() || null;
    const custGstin = (params.customer_gstin || '').trim() || null;

    if (!custName && !custPhone && !params.customer_id) return;

    // Use the unified CustomerIdentityService for consistent party resolution
    const identityResult = CustomerIdentityService.findOrCreateCustomerAndParty(db, tenantId, {
      customer_id: params.customer_id || undefined,
      name: custName,
      phone: custPhone,
      address: custAddress,
      gstin: custGstin,
    });

    if (!identityResult) {
      console.error('[syncReturnLedger] Failed to resolve customer/party identity');
      return;
    }

    const party = { party_id: identityResult.party_id, name: custName || custPhone };

    // Determine the reference number for the ledger entry
    const referenceNumber = params.adjusted_invoice_number
      ? `${returnNumber}-ADJ-${params.adjusted_invoice_number}`
      : returnNumber;

    // Check for existing entry
    const existingEntry = db.prepare(`
      SELECT * FROM party_ledger WHERE tenant_id = ? AND reference_number = ? LIMIT 1
    `).get(tenantId, referenceNumber) as any;

    const refundMethod = (params.refund_method || '').toUpperCase();
    const isCashRefund = refundMethod === 'CASH';
    const isAdjustBill = refundMethod === 'ADJUST_BILL';
    const isCreditRefund = refundMethod === 'CREDIT' || refundMethod === 'STORE_CREDIT';
    const isOtherRefund = ['CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE'].includes(refundMethod);
    const adjustmentAmount = Math.max(0, Number(params.amount ?? params.grand_total) || 0);

    if (adjustmentAmount <= 0) return;

    const balanceType = 'GST'; // Returns typically affect GST balance
    const txDate = params.created_at || localTimestamp();
    const refText = params.invoice_number ? ` (Ref: ${params.invoice_number})` : '';
    let description = `Return ${returnNumber}${refText} - ${custName || party.name || 'Customer'}`;
    if (isCashRefund) {
      description = `Return refund (Cash) ${returnNumber}${refText} - ${custName || party.name || 'Customer'}`;
    } else if (isAdjustBill) {
      description = params.adjusted_invoice_number
        ? `Return credit adjusted ${returnNumber} → ${params.adjusted_invoice_number}${refText} - ${custName || party.name || 'Customer'}`
        : `Sales Return ${returnNumber}${refText} - ${custName || party.name || 'Customer'}`;
    } else if (isCreditRefund) {
      description = `Sales Return ${returnNumber}${refText} - ${custName || party.name || 'Customer'}`;
    } else if (isOtherRefund) {
      description = `Return refund (${refundMethod}) ${returnNumber}${refText} - ${custName || party.name || 'Customer'}`;
    }

    const debitAmount = adjustmentAmount;

    if (existingEntry) {
      // Update existing entry
      db.prepare(`
        UPDATE party_ledger SET
          credit_amount = 0, debit_amount = ?, description = ?, transaction_date = ?,
          balance_type = ?, payment_method = ?, is_deleted = 0,
          sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE ledger_id = ?
      `).run(
        debitAmount,
        description,
        txDate,
        balanceType,
        refundMethod,
        existingEntry.ledger_id
      );
    } else {
      // Create new entry with deterministic UUID
      const ledgerId = deterministicUUID(`return:${tenantId}:${referenceNumber}`);
      db.prepare(`
        INSERT INTO party_ledger (
          ledger_id, party_id, tenant_id, transaction_date, description,
          credit_amount, debit_amount, running_balance, balance_type,
          payment_method, reference_number, created_by, created_by_name,
          is_deleted, sync_status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(ledger_id) DO UPDATE SET
          credit_amount = 0,
          debit_amount = excluded.debit_amount,
          description = excluded.description,
          transaction_date = excluded.transaction_date,
          balance_type = excluded.balance_type,
          payment_method = excluded.payment_method,
          is_deleted = 0,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      `).run(
        ledgerId,
        party.party_id,
        tenantId,
        txDate,
        description,
        debitAmount,
        balanceType,
        refundMethod,
        referenceNumber,
        params.user_id || 'system',
        params.user_name || 'System'
      );
    }

    // Re-sequence running_balance for the party
    const allEntries = db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY transaction_date ASC, created_at ASC
    `).all(party.party_id) as any[];

    let running = 0;
    for (const row of allEntries) {
      running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
      db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
    }

    recalcPartyBalances(db, party.party_id);
  } catch (err: any) {
    console.error('[syncReturnLedger] Error:', err);
  }
}



let backfillLastRun = 0;

export function resetBackfillThrottle() {
  backfillLastRun = 0;
}

export function backfillCreditInvoices(db: any) {
  // Use a 30-second cooldown instead of a one-time flag so that credit invoices
  // created AFTER app launch are picked up the next time Parties/Ledger is opened.
  const now = Date.now();
  if (now - backfillLastRun < 30000) return;
  backfillLastRun = now;
  try {
    const unlinkedCreditInvoices = db.prepare(`
      SELECT i.* FROM invoices i
      WHERE (
        UPPER(i.payment_method) = 'CREDIT'
        OR (UPPER(i.payment_method) = 'SPLIT' AND i.split_details LIKE '%"credit":%' AND i.split_details NOT LIKE '%"credit":0%')
      )
        AND (i.is_deleted IS NULL OR i.is_deleted = 0)
        AND NOT EXISTS (
          SELECT 1 FROM party_ledger pl
          WHERE pl.reference_number = i.invoice_number
            AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
        )
    `).all() as any[];

    if (unlinkedCreditInvoices.length > 0) {
      console.log(`[DB] Backfilling ${unlinkedCreditInvoices.length} credit invoices into party ledger...`);
      for (const inv of unlinkedCreditInvoices) {
        syncInvoiceCreditLedger(db, inv);
      }
      console.log(`[DB] Credit invoices backfill completed.`);
    }

    // Backfill any returns against credit invoices (or store credit returns) that are missing from party_ledger
    try {
      const unlinkedReturns = db.prepare(`
        SELECT r.*, i.invoice_number as orig_invoice_number, i.payment_method as orig_payment_method, i.split_details as orig_split_details, i.customer_id as orig_customer_id, i.customer_name as orig_customer_name, i.customer_phone as orig_customer_phone, i.customer_address as orig_customer_address, i.customer_gstin as orig_customer_gstin
        FROM returns r
        LEFT JOIN invoices i ON i.invoice_id = r.invoice_id
        WHERE (
          UPPER(COALESCE(i.payment_method, '')) = 'CREDIT'
          OR (UPPER(COALESCE(i.payment_method, '')) = 'SPLIT' AND i.split_details LIKE '%"credit":%' AND i.split_details NOT LIKE '%"credit":0%')
          OR UPPER(COALESCE(r.refund_method, '')) IN ('CREDIT', 'STORE_CREDIT', 'ADJUST_BILL')
        )
          AND (i.is_deleted IS NULL OR i.is_deleted = 0)
          AND NOT EXISTS (
            SELECT 1 FROM party_ledger pl
            WHERE pl.reference_number = r.return_number
              AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
          )
      `).all() as any[];

      if (unlinkedReturns.length > 0) {
        console.log(`[DB] Backfilling ${unlinkedReturns.length} returns into party ledger...`);
        for (const ret of unlinkedReturns) {
          syncReturnLedger(db, {
            tenant_id: ret.tenant_id || 'global',
            return_number: ret.return_number,
            return_id: ret.return_id,
            invoice_id: ret.invoice_id || null,
            invoice_number: ret.orig_invoice_number || null,
            customer_id: ret.orig_customer_id || null,
            customer_name: ret.customer_name || ret.orig_customer_name || null,
            customer_phone: ret.customer_phone || ret.orig_customer_phone || null,
            customer_address: ret.customer_address || ret.orig_customer_address || null,
            customer_gstin: ret.orig_customer_gstin || null,
            grand_total: Number(ret.grand_total) || 0,
            refund_method: ret.refund_method || 'CREDIT',
            amount: Number(ret.grand_total) || 0,
            user_id: ret.user_id,
            created_at: ret.created_at,
          });
        }
        console.log(`[DB] Returns backfill completed.`);
      }
    } catch (e) {
      console.error('[DB] Failed to backfill credit returns:', e);
    }

    // Clean up any lingering active ledger entries belonging to soft-deleted invoices
    try {
      const staleEntries = db.prepare(`
        SELECT pl.ledger_id, pl.party_id FROM party_ledger pl
        JOIN invoices i ON (
          i.invoice_number = pl.reference_number 
          OR pl.reference_number = i.invoice_number || '-PAY'
          OR pl.reference_number LIKE i.invoice_number || '-%'
          OR pl.description LIKE '%' || i.invoice_number || '%'
        )
        WHERE i.is_deleted = 1 AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
      `).all() as any[];

      if (staleEntries.length > 0) {
        console.log(`[DB] Cleaning up ${staleEntries.length} stale ledger entries for soft-deleted invoices...`);
        const affectedParties = new Set<string>();
        for (const row of staleEntries) {
          affectedParties.add(row.party_id);
          db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?").run(row.ledger_id);
        }
        for (const pId of affectedParties) {
          recalcPartyBalances(db, pId);
        }
      }
    } catch (e) {
      console.error('[DB] Failed to clean stale deleted invoice ledger entries in backfill:', e);
    }
  } catch (err: any) {
    console.error('[DB] Failed to backfill credit invoices:', err);
  }
}



export function computeCustomerCreditStatusSync(db: any, tenantId: string, customerId: string, invoices: any[]) {
  // 1. Fetch customer credit configuration
  const customer: any = db.prepare(`
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
  `).get(customerId, tenantId) || {};

  const partyBalance = Number(customer.party_balance ?? 0);
  const creditPeriodEnabled = Boolean(customer.credit_period_enabled ?? customer.party_credit_period_enabled ?? false);
  const creditPeriodDays = Number(customer.credit_period_days ?? customer.party_credit_period_days ?? 30) || 30;
  const now = new Date();

  // If party balance is <= 0, customer owes nothing (all settled)
  const isSettled = partyBalance <= 0;

  // 2. Fetch all debits (payments) from party_ledger if a party exists
  let ledgerDebits: any[] = [];
  if (customer.party_id) {
    ledgerDebits = db.prepare(`
      SELECT ledger_id, debit_amount, reference_number, transaction_date 
      FROM party_ledger 
      WHERE party_id = ? AND tenant_id = ? AND debit_amount > 0 AND (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY transaction_date ASC, created_at ASC
    `).all(customer.party_id, tenantId) as any[];
  }

  // Map explicit payments by invoice reference
  const explicitPayments = new Map<string, number>();
  let totalExplicitDebits = 0;
  let totalDebits = 0;

  for (const d of ledgerDebits) {
    const amt = Number(d.debit_amount) || 0;
    totalDebits += amt;
    const ref = (d.reference_number || '').trim();
    if (ref) {
      const cleanRef = ref.replace(/-PAY$/i, '');
      explicitPayments.set(cleanRef, (explicitPayments.get(cleanRef) || 0) + amt);
      totalExplicitDebits += amt;
    }
  }

  let unallocatedPool = Math.max(0, totalDebits - totalExplicitDebits);

  // 3. Sort credit bills oldest to newest for FIFO allocation
  const creditInvoices = invoices.filter((inv: any) => {
    const pm = (inv.payment_method || '').toUpperCase();
    let splitCredit = 0;
    if (inv.split_details) {
      try {
        const s = typeof inv.split_details === 'string' ? JSON.parse(inv.split_details) : inv.split_details;
        splitCredit = Number(s?.credit) || 0;
      } catch {}
    }
    return pm === 'CREDIT' || splitCredit > 0 || (Number(inv.balance_amount) > 0 && pm !== 'CASH');
  }).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const billAllocations = new Map<string, { outstanding: number; dueDate: Date | null; isOverdue: boolean; overdueDays: number; remainingDays: number; status: string }>();

  for (const inv of creditInvoices) {
    const invNum = (inv.invoice_number || '').trim();
    const pm = (inv.payment_method || '').toUpperCase();
    let splitCredit = 0;
    if (inv.split_details) {
      try {
        const s = typeof inv.split_details === 'string' ? JSON.parse(inv.split_details) : inv.split_details;
        splitCredit = Number(s?.credit) || 0;
      } catch {}
    }

    const billCreditTotal = pm === 'SPLIT' && splitCredit > 0
      ? splitCredit
      : Math.max(0, Number(inv.grand_total) - (Number(inv.received_amount) || 0));

    if (isSettled) {
      billAllocations.set(inv.invoice_id, {
        outstanding: 0,
        dueDate: inv.due_date ? new Date(inv.due_date) : null,
        isOverdue: false,
        overdueDays: 0,
        remainingDays: 0,
        status: 'PAID'
      });
      continue;
    }

    const directPay = explicitPayments.get(invNum) || 0;
    let rem = Math.max(0, billCreditTotal - directPay);

    if (rem > 0 && unallocatedPool > 0) {
      const take = Math.min(rem, unallocatedPool);
      rem -= take;
      unallocatedPool -= take;
    }

    // Determine due date
    let dueDate: Date | null = null;
    if (inv.due_date) {
      dueDate = new Date(inv.due_date);
    } else if (creditPeriodEnabled && creditPeriodDays > 0 && inv.created_at) {
      dueDate = new Date(new Date(inv.created_at).getTime() + creditPeriodDays * 24 * 60 * 60 * 1000);
    }

    let isOverdue = false;
    let overdueDays = 0;
    let remainingDays = 0;
    let status = 'PAID';

    if (rem > 0.005) {
      if (dueDate) {
        const diffMs = dueDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
        if (diffDays < 0) {
          isOverdue = true;
          overdueDays = Math.abs(diffDays);
          status = 'OVERDUE';
        } else {
          remainingDays = diffDays;
          status = diffDays <= 3 ? 'DUE_SOON' : 'ACTIVE';
        }
      } else {
        status = 'ACTIVE';
      }
    } else {
      rem = 0;
      status = 'PAID';
    }

    billAllocations.set(inv.invoice_id, {
      outstanding: Math.round(rem * 100) / 100,
      dueDate,
      isOverdue,
      overdueDays,
      remainingDays,
      status
    });
  }

  return invoices.map((inv: any) => {
    const alloc = billAllocations.get(inv.invoice_id);
    if (alloc) {
      return {
        ...inv,
        is_credit_bill: true,
        due_date: alloc.dueDate ? alloc.dueDate.toISOString() : null,
        outstanding_amount: alloc.outstanding,
        is_overdue: alloc.isOverdue,
        overdue_days: alloc.overdueDays,
        remaining_days: alloc.remainingDays,
        credit_status: alloc.status
      };
    }
    return {
      ...inv,
      is_credit_bill: false,
      outstanding_amount: 0,
      is_overdue: false,
      overdue_days: 0,
      remaining_days: 0,
      credit_status: 'NON_CREDIT'
    };
  });
}

export function checkCustomerOverdueSync(db: any, tenantId: string, customerId?: string, custPhone?: string, custName?: string) {
  let cust: any = null;
  if (customerId) {
    cust = db.prepare('SELECT * FROM customers WHERE customer_id = ? AND tenant_id = ?').get(customerId, tenantId);
  }
  if (!cust && custPhone) {
    const cleanDigits = custPhone.replace(/\D/g, '');
    if (cleanDigits.length >= 7) {
      cust = db.prepare(`SELECT * FROM customers WHERE tenant_id = ? AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?)`).get(tenantId, custPhone, `%${cleanDigits.slice(-10)}`);
    } else {
      cust = db.prepare('SELECT * FROM customers WHERE tenant_id = ? AND phone = ?').get(tenantId, custPhone);
    }
  }
  if (!cust && custName) {
    cust = db.prepare('SELECT * FROM customers WHERE tenant_id = ? AND LOWER(TRIM(name)) = ?').get(tenantId, custName.trim().toLowerCase());
  }

  let party: any = null;
  if (custPhone) {
    const cleanDigits = custPhone.replace(/\D/g, '');
    if (cleanDigits.length >= 7) {
      party = db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0) AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?) LIMIT 1`).get(tenantId, custPhone, `%${cleanDigits.slice(-10)}`);
    } else {
      party = db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0) LIMIT 1`).get(tenantId, custPhone);
    }
  }
  if (!party && custName) {
    party = db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0) LIMIT 1`).get(tenantId, custName.trim().toLowerCase());
  }

  const periodEnabled = Boolean(cust?.credit_period_enabled ?? party?.credit_period_enabled ?? false);
  const restrictOnExpiry = (cust?.restrict_on_credit_expiry ?? party?.restrict_on_credit_expiry) !== 0 && (cust?.restrict_on_credit_expiry ?? party?.restrict_on_credit_expiry) !== false;
  const creditPeriodDays = Number(cust?.credit_period_days ?? party?.credit_period_days ?? 30) || 30;
  const partyBal = Number(party?.balance ?? cust?.party_balance ?? 0);

  if (!periodEnabled || partyBal <= 0) {
    return {
      isOverdue: false,
      overdueCount: 0,
      overdueAmount: 0,
      oldestOverdueDays: 0,
      restrictOnExpiry,
      creditPeriodEnabled: periodEnabled,
      creditPeriodDays,
      customerName: cust?.name || party?.name || custName || 'Customer'
    };
  }

  const cId = cust?.customer_id || '';
  const pId = party?.party_id || '';
  if (!cId && !pId) {
    return {
      isOverdue: false,
      overdueCount: 0,
      overdueAmount: 0,
      oldestOverdueDays: 0,
      restrictOnExpiry,
      creditPeriodEnabled: periodEnabled,
      creditPeriodDays,
      customerName: cust?.name || party?.name || custName || 'Customer'
    };
  }

  const cleanPh = (cust?.phone || party?.phone || custPhone || '').replace(/\D/g, '');
  const last10Ph = cleanPh.length >= 7 ? cleanPh.slice(-10) : '';
  const cleanNm = (cust?.name || party?.name || custName || '').trim().toLowerCase();

  const invs = db.prepare(`
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
  `).all(
    tenantId,
    cId, cId,
    pId, pId,
    last10Ph ? `%${last10Ph}` : '', last10Ph ? `%${last10Ph}` : '',
    cleanNm, cleanNm, last10Ph
  ) as any[];

  const enriched = computeCustomerCreditStatusSync(db, tenantId, cId || pId, invs);
  const overdues = enriched.filter((i: any) => i.is_overdue);

  return {
    isOverdue: overdues.length > 0,
    overdueCount: overdues.length,
    overdueAmount: overdues.reduce((acc: number, curr: any) => acc + (Number(curr.outstanding_amount) || 0), 0),
    oldestOverdueDays: overdues.length > 0 ? Math.max(...overdues.map((o: any) => o.overdue_days || 0)) : 0,
    restrictOnExpiry,
    creditPeriodEnabled: periodEnabled,
    creditPeriodDays,
    customerName: cust?.name || party?.name || custName || 'Customer'
  };
}

const recentCheckoutsCache = new Map<string, { timestamp: number; result: any }>();

