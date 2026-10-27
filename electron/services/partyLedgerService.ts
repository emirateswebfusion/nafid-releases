import crypto from 'node:crypto';
import { recalcStaffLedgerBalances } from './staffService.js';
import { CustomerIdentityService } from '../db/customerIdentity.js';
import { deterministicUUID } from '../utils/ids.js';
import { localTimestamp } from './storeTime.js';
import * as partyLedgerSql from '../db/statements/partyLedger.js';
import type Database from 'better-sqlite3';
import type { Db } from '../db/statements/types.js';
import type { CreditLedgerInvoice, PartyLedgerBalanceRow, PartyLedgerRow, ReturnRow, SettingRow, SplitDetails, StaffRow, StaffTransactionRow } from './typesA.js';

// Recompute a party's GST / Estimate / total balances from its ledger entries
export function recalcPartyBalances(db: Db, partyId: string) {
  try {
    // 1. Deduplicate entries by reference_number, description, credit_amount, and debit_amount
    const refDups = partyLedgerSql.findPartyLedgerByPartyId(db).all(partyId) as PartyLedgerRow[];

    for (const d of refDups) {
      const rows = partyLedgerSql.findPartyLedgerByPartyIdAndReferenceNumber(db).all(partyId, d.reference_number, d.description, d.credit_amount, d.debit_amount) as PartyLedgerRow[];

      for (let i = 1; i < rows.length; i++) {
        partyLedgerSql.updatePartyLedgerIsDeleted(db).run(rows[i].ledger_id);
      }
    }

    // 2. Deduplicate exact match entries (same description, credit_amount, debit_amount, transaction_date)
    const exactDups = partyLedgerSql.findPartyLedgerByPartyId2(db).all(partyId) as PartyLedgerRow[];

    for (const d of exactDups) {
      const rows = partyLedgerSql.findPartyLedgerByPartyIdAndDescription(db).all(partyId, d.description, d.credit_amount, d.debit_amount, d.transaction_date) as PartyLedgerRow[];

      for (let i = 1; i < rows.length; i++) {
        partyLedgerSql.updatePartyLedgerIsDeleted(db).run(rows[i].ledger_id);
      }
    }

    // 3. Re-sequence running_balance for all remaining active entries
    const activeEntries = partyLedgerSql.findPartyLedgerByPartyId3(db).all(partyId) as PartyLedgerRow[];

    let running = 0;
    for (const row of activeEntries) {
      running += (Number(row.credit_amount) || 0) - (Number(row.debit_amount) || 0);
      running = Math.round(running * 100) / 100;
      partyLedgerSql.updatePartyLedgerRunningBalance(db).run(running, row.ledger_id);
    }
  } catch (err) {
    console.error('[recalcPartyBalances] Deduplication error:', err);
  }

  const rows = partyLedgerSql.findPartyLedgerByPartyId4(db).get(partyId) as PartyLedgerBalanceRow;
  const gst = Math.round((parseFloat(rows.gst as string) || 0) * 100) / 100;
  const estimate = Math.round((parseFloat(rows.estimate as string) || 0) * 100) / 100;
  const total = Math.round((gst + estimate) * 100) / 100;
  const latest = partyLedgerSql.findOnePartyLedgerByPartyId(db).get(partyId) as PartyLedgerRow | undefined;
  partyLedgerSql.updatePartyByPartyId(db)
    .run(total, gst, estimate, latest ? latest.transaction_date : null, partyId);
  return total;
}

export function reconcileAllPartyBalances(db: Db, tenantId?: string) {
  try {
    const tenantClause = tenantId ? 'WHERE parties.tenant_id = ? AND' : 'WHERE';
    const params = tenantId ? [tenantId] : [];
    partyLedgerSql.recalcAllPartyBalances(db, tenantClause).run(...params);
  } catch (err) {
    console.error('[reconcileAllPartyBalances] Error:', err);
  }
}


export function syncInvoiceCreditLedger(
  db: Database.Database,
  invoice: CreditLedgerInvoice,
  isDelete = false
) {
  if (invoice.counts_in_revenue === 0) return; // not real money: nothing was posted, so nothing to post or reverse
  try {
    const tenantId = invoice.tenant_id || 'global';
    const invoiceNumber = (invoice.invoice_number || '').trim();
    if (!invoiceNumber) return;

    // ── 1. DELETION HANDLING (MUST BE EVALUATED FIRST) ──────────────────────
    if (isDelete) {
      console.log(`[syncInvoiceCreditLedger] Soft-deleting ledger entries for invoice: ${invoiceNumber}`);
      const toDelete = partyLedgerSql.findPartyLedgerByReferenceNumber(db).all(invoiceNumber, `${invoiceNumber}-PAY`, `${invoiceNumber}%`, `%${invoiceNumber}%`) as PartyLedgerRow[];

      if (toDelete.length > 0) {
        const affectedParties = new Set<string>();
        for (const row of toDelete) {
          affectedParties.add(row.party_id);
          partyLedgerSql.updatePartyLedgerIsDeleted(db).run(row.ledger_id);
        }

        for (const pId of affectedParties) {
          // Re-sequence running_balance for this party
          const allEntries = partyLedgerSql.findPartyLedgerByPartyId3(db).all(pId as string) as PartyLedgerRow[];

          let running = 0;
          for (const row of allEntries) {
            running += parseFloat(row.credit_amount as unknown as string) - parseFloat(row.debit_amount as unknown as string);
            partyLedgerSql.updatePartyLedgerRunningBalanceAlt(db).run(running, row.ledger_id);
          }

          recalcPartyBalances(db, pId);
        }
        console.log(`[syncInvoiceCreditLedger] Soft-deleted ${toDelete.length} entries for ${invoiceNumber}.`);
      }

      // Also clean up any staff ledger entries for this invoice
      const staffTxToDelete = partyLedgerSql.findStaffTransactionsByReferenceNumberAndType(db).all(invoiceNumber) as StaffTransactionRow[];

      if (staffTxToDelete.length > 0) {
        for (const stx of staffTxToDelete) {
          partyLedgerSql.deleteStaffLedgerByTransactionId(db).run(stx.transaction_id);
          partyLedgerSql.deleteStaffTransactionByTransactionId(db).run(stx.transaction_id);
          recalcStaffLedgerBalances(db, tenantId, stx.staff_id);
        }
        console.log(`[syncInvoiceCreditLedger] Deleted staff purchase ledger entries for invoice: ${invoiceNumber}`);
      }

      return;
    }

    // ── 2. FIND ALL EXISTING ENTRIES FOR THIS INVOICE ───────────────────────
    // Query without strict tenantId to catch any previous entries created under different tenant tags
    const existingEntries = partyLedgerSql.findPartyLedgerByReferenceNumber2(db).all(invoiceNumber, `${invoiceNumber}-PAY`, `${invoiceNumber}-%`, `%${invoiceNumber}%`) as PartyLedgerRow[];

    // ── 3. PARSE PAYMENT METHODS & SPLIT DETAILS ────────────────────────────
    let splitObj: SplitDetails | null = null;
    if (invoice.split_details && invoice.split_details !== 'null') {
      try {
        splitObj = typeof invoice.split_details === 'string'
          ? JSON.parse(invoice.split_details)
          : invoice.split_details;
      } catch { /* ignore */ }
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
      const sfRow = partyLedgerSql.findOneSettingByKey(db).get(tenantId) as SettingRow | undefined;
      if (sfRow?.value) {
        const parsed: unknown = typeof sfRow.value === 'string' ? JSON.parse(sfRow.value) : sfRow.value;
        isStaffCreditBillingEnabled = Boolean((parsed as Record<string, unknown>)?.staff_credit_billing);
      }
    } catch { /* ignore */ }

    let targetStaff: StaffRow | null | undefined = null;
    const isExplicitStaff = Boolean(invoice.is_staff || invoice.isStaffCustomer);
    const staffIdParam = invoice.staff_id || (isExplicitStaff ? invoice.customer_id : null);

    if (staffIdParam) {
      targetStaff = partyLedgerSql.findStaffByStaffId(db).get(staffIdParam) as StaffRow | undefined;
    } else if (invoice.customer_id && (isExplicitStaff || isStaffCreditBillingEnabled)) {
      targetStaff = partyLedgerSql.findStaffByStaffId(db).get(invoice.customer_id) as StaffRow | undefined;
    }

    if (!targetStaff && (isExplicitStaff || isStaffCreditBillingEnabled) && invoice.customer_phone) {
      const cleanPh = (invoice.customer_phone || '').replace(/\D/g, '');
      if (cleanPh.length >= 7) {
        targetStaff = partyLedgerSql.findOneStaffByPhone(db).get(invoice.customer_phone.trim(), `%${cleanPh.slice(-10)}`) as StaffRow | undefined;
      }
    }

    if (targetStaff) {
      console.log(`[syncInvoiceCreditLedger] Invoice ${invoiceNumber} is for staff "${targetStaff.name}" (${targetStaff.staff_id}). Processing in Staff Ledger.`);

      // Clean up any accidental entries in party_ledger
      if (existingEntries.length > 0) {
        const affectedParties = new Set<string>();
        for (const entry of existingEntries) {
          affectedParties.add(entry.party_id);
          partyLedgerSql.updatePartyLedgerIsDeleted(db).run(entry.ledger_id);
        }
        for (const pId of affectedParties) recalcPartyBalances(db, pId);
      }

      const creditDue = isSplit ? splitCredit : (isPureCredit ? Math.max(0, invoiceGrandTotal - invoiceReceivedAmount) : 0);
      const txDate = invoice.created_at || localTimestamp();
      const nowTimestamp = localTimestamp();

      if (creditDue > 0) {
        const desc = `Staff Purchase - Bill #${invoiceNumber} (Total ₹${invoiceGrandTotal.toFixed(2)})`;
        const existingStaffTx = partyLedgerSql.findOneStaffTransactionByReferenceNumberAndType(db).get(invoiceNumber) as StaffTransactionRow | undefined;

        if (existingStaffTx) {
          partyLedgerSql.updateStaffTransactionByTransactionId(db).run(targetStaff.staff_id, creditDue, desc, txDate, existingStaffTx.transaction_id);

          partyLedgerSql.updateStaffLedgerByTransactionId(db).run(targetStaff.staff_id, creditDue, desc, txDate, existingStaffTx.transaction_id);
        } else {
          const txId = crypto.randomUUID();
          const ledgerId = crypto.randomUUID();
          partyLedgerSql.insertStaffTransaction(db).run(
            txId, tenantId, targetStaff.staff_id, creditDue, invoiceNumber, desc,
            invoice.user_id || null, invoice.user_name || null, txDate, nowTimestamp, nowTimestamp
          );

          partyLedgerSql.insertStaffLedger(db).run(
            ledgerId, tenantId, targetStaff.staff_id, txId, txDate, desc,
            creditDue, invoice.user_id || null, nowTimestamp
          );
        }
        recalcStaffLedgerBalances(db, tenantId, targetStaff.staff_id);
      } else {
        const staffTxToRemove = partyLedgerSql.findStaffTransactionsByReferenceNumberAndTypeStaffPurchase(db).all(invoiceNumber) as StaffTransactionRow[];
        for (const stx of staffTxToRemove) {
          partyLedgerSql.deleteStaffLedgerByTransactionId(db).run(stx.transaction_id);
          partyLedgerSql.deleteStaffTransactionByTransactionId(db).run(stx.transaction_id);
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
          partyLedgerSql.updatePartyLedgerIsDeleted(db).run(entry.ledger_id);
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
        partyLedgerSql.updatePartyLedgerIsDeleted(db).run(entry.ledger_id);
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
        const showSetting = partyLedgerSql.findSettingsByKey(db).get(tenantId, 'show_fully_paid_cash_in_ledger') as { value: string } | undefined;
        showFullyPaidCash = showSetting ? JSON.parse(showSetting.value) : false;
      }

      if (!showFullyPaidCash) {
        // Soft delete all existing entries for this invoice for this party
        const targetEntries = existingEntries.filter(e => e.party_id === targetPartyId);
        if (targetEntries.length > 0) {
          for (const entry of targetEntries) {
            partyLedgerSql.updatePartyLedgerIsDeleted(db).run(entry.ledger_id);
          }
          // Re-sequence and update balance
          const allEntries = partyLedgerSql.findPartyLedgerByPartyId3(db).all(targetPartyId) as PartyLedgerRow[];

          let running = 0;
          for (const row of allEntries) {
            running += parseFloat(row.credit_amount as unknown as string) - parseFloat(row.debit_amount as unknown as string);
            partyLedgerSql.updatePartyLedgerRunningBalanceAlt(db).run(running, row.ledger_id);
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
      partyLedgerSql.updatePartyLedgerIsDeleted(db).run(entry.ledger_id);
    }

    // A. Construct Sale Description and Breakdown
    const breakdownParts: string[] = [];
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
    partyLedgerSql.upsertPartyLedger(db).run(
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
      partyLedgerSql.upsertPartyLedger2(db).run(
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
    const allEntries = partyLedgerSql.findPartyLedgerByPartyId3(db).all(targetPartyId) as PartyLedgerRow[];

    let running = 0;
    for (const row of allEntries) {
      running += parseFloat(row.credit_amount as unknown as string) - parseFloat(row.debit_amount as unknown as string);
      partyLedgerSql.updatePartyLedgerRunningBalanceAlt(db).run(running, row.ledger_id);
    }

    recalcPartyBalances(db, targetPartyId);
  } catch (err) {
    console.error(`[syncInvoiceCreditLedger] Failed for invoice ${invoice.invoice_number || invoice.invoice_id || '?'} (tenant ${invoice.tenant_id || 'global'}):`, err);
  }
}


export function syncReturnLedger(
  db: Database.Database,
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
    const existingEntry = partyLedgerSql.findOnePartyLedgerByReferenceNumber(db).get(tenantId, referenceNumber) as PartyLedgerRow | undefined;

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
      partyLedgerSql.updatePartyLedgerByLedgerId(db).run(
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
      partyLedgerSql.upsertPartyLedger3(db).run(
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
    const allEntries = partyLedgerSql.findPartyLedgerByPartyId3(db).all(party.party_id) as PartyLedgerRow[];

    let running = 0;
    for (const row of allEntries) {
      running += parseFloat(row.credit_amount as unknown as string) - parseFloat(row.debit_amount as unknown as string);
      partyLedgerSql.updatePartyLedgerRunningBalanceAlt(db).run(running, row.ledger_id);
    }

    recalcPartyBalances(db, party.party_id);
  } catch (err) {
    console.error('[syncReturnLedger] Error:', err);
  }
}


let backfillLastRun = 0;

export function resetBackfillThrottle() {
  backfillLastRun = 0;
}

export function backfillCreditInvoices(db: Database.Database) {
  // Use a 30-second cooldown instead of a one-time flag so that credit invoices
  // created AFTER app launch are picked up the next time Parties/Ledger is opened.
  const now = Date.now();
  if (now - backfillLastRun < 30000) return;
  backfillLastRun = now;
  try {
    const unlinkedCreditInvoices = partyLedgerSql.findInvoicesByReferenceNumber(db).all() as CreditLedgerInvoice[];

    if (unlinkedCreditInvoices.length > 0) {
      console.log(`[DB] Backfilling ${unlinkedCreditInvoices.length} credit invoices into party ledger...`);
      for (const inv of unlinkedCreditInvoices) {
        syncInvoiceCreditLedger(db, inv);
      }
      console.log(`[DB] Credit invoices backfill completed.`);
    }

    // Backfill any returns against credit invoices (or store credit returns) that are missing from party_ledger
    try {
      const unlinkedReturns = partyLedgerSql.findReturnsByReferenceNumber(db).all() as ReturnRow[];

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
            customer_name: (ret.customer_name || '').trim() || ret.orig_customer_name || null,
            customer_phone: (ret.customer_phone || '').trim() || ret.orig_customer_phone || null,
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
      const staleEntries = partyLedgerSql.findPartyLedger(db).all() as PartyLedgerRow[];

      if (staleEntries.length > 0) {
        console.log(`[DB] Cleaning up ${staleEntries.length} stale ledger entries for soft-deleted invoices...`);
        const affectedParties = new Set<string>();
        for (const row of staleEntries) {
          affectedParties.add(row.party_id);
          partyLedgerSql.updatePartyLedgerIsDeleted(db).run(row.ledger_id);
        }
        for (const pId of affectedParties) {
          recalcPartyBalances(db, pId);
        }
      }
    } catch (e) {
      console.error('[DB] Failed to clean stale deleted invoice ledger entries in backfill:', e);
    }
  } catch (err) {
    console.error('[DB] Failed to backfill credit invoices:', err);
  }
}

