import crypto from 'node:crypto';
import { recalcStaffLedgerBalances } from './staffService.js';
import { CustomerIdentityService } from '../db/customerIdentity.js';
import { deterministicUUID } from '../utils/ids.js';
import { localTimestamp } from './storeTime.js';
import { getStoreCountrySetting, roundStoreMoney, storeMoneyFixed, storeMoneyProfile, StoreCountry } from './storeCountryService.js';
import * as partiesSql from '../db/statements/parties.js';
import * as partyLedgerSql from '../db/statements/partyLedger.js';
import type Database from 'better-sqlite3';
import type { Db } from '../db/statements/types.js';
import type { CreditLedgerInvoice, PartyLedgerBalanceRow, PartyLedgerRow, ReturnRow, SettingRow, SplitDetails, StaffRow, StaffTransactionRow } from './typesA.js';

/**
 * Party (customer / supplier) credit ledger. The ledger rows are the only source of a party's balance:
 * balance = Σ credit_amount − Σ debit_amount over its active rows (positive = the party owes the shop).
 *
 * A bill posts its own rows with deterministic ids and exact references (`<bill>` for the sale, `<bill>-PAY|-CASH|…`
 * for payments taken at checkout); re-posting a bill first retires exactly those rows, so edits, payment changes and
 * customer changes replace the bill's adjustment instead of adding to it. Rows of other bills, manual payments and
 * returns are never touched by a bill.
 */

/** Rounding at the shop currency's precision. Every rule below takes the shop country: never round a Bahrain bill to two decimals. */
const moneyFor = (country: StoreCountry) => (n: unknown) => roundStoreMoney(Number(n) || 0, country);

// Recompute a party's running balances and its GST / Estimate / total balances from its active ledger rows
export function recalcPartyBalances(db: Db, partyId: string) {
  const party = partiesSql.findPartiesByPartyId(db).get(partyId) as { tenant_id?: string } | undefined;
  const country = party?.tenant_id ? getStoreCountrySetting(db, party.tenant_id) : 'IN';
  const round = (n: unknown) => roundStoreMoney(Number(n) || 0, country);
  const activeEntries = partyLedgerSql.findPartyLedgerByPartyId3(db).all(partyId) as PartyLedgerRow[];
  let running = 0;
  for (const row of activeEntries) {
    running = round(running + (Number(row.credit_amount) || 0) - (Number(row.debit_amount) || 0));
    partyLedgerSql.updatePartyLedgerRunningBalance(db).run(running, row.ledger_id);
  }

  const rows = partyLedgerSql.findPartyLedgerByPartyId4(db).get(partyId) as PartyLedgerBalanceRow;
  const gst = round(parseFloat(rows.gst as string));
  const estimate = round(parseFloat(rows.estimate as string));
  const total = round(gst + estimate);
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

/** Soft-delete ledger rows and recalculate every party they belonged to. */
function retireEntries(db: Db, rows: PartyLedgerRow[], keepParty?: string) {
  const parties = new Set<string>();
  for (const row of rows) {
    partyLedgerSql.updatePartyLedgerIsDeleted(db).run(row.ledger_id);
    parties.add(row.party_id);
  }
  for (const partyId of parties) if (partyId !== keepParty) recalcPartyBalances(db, partyId);
}

/**
 * A bill consumed an ADJUST_BILL return credit (`<return>-ADJ-<bill>` rows). Deleting the bill gives the credit back
 * (`release`), restoring the bill uses it again; the return's adjusted amount follows.
 */
export function setInvoiceReturnCreditUse(db: Db, tenantId: string, invoiceNumber: string, inUse: boolean) {
  const money = moneyFor(getStoreCountrySetting(db, tenantId));
  const rows = partyLedgerSql.findReturnCreditUses(db, inUse).all({ tenant: tenantId, inv: invoiceNumber }) as PartyLedgerRow[];
  const parties = new Set<string>();
  for (const row of rows) {
    if (inUse) partyLedgerSql.restorePartyLedgerEntry(db).run(row.ledger_id);
    else partyLedgerSql.updatePartyLedgerIsDeleted(db).run(row.ledger_id);
    const returnNumber = String(row.reference_number || '').slice(0, -(`-ADJ-${invoiceNumber}`).length);
    const amount = money(Number(row.credit_amount) || Number(row.debit_amount));
    if (returnNumber) partyLedgerSql.updateReturnAdjustedAmount(db).run(inUse ? amount : -amount, tenantId, returnNumber);
    parties.add(row.party_id);
  }
  for (const partyId of parties) recalcPartyBalances(db, partyId);
}

function parseSplit(raw: CreditLedgerInvoice['split_details']): SplitDetails | null {
  if (!raw || raw === 'null') return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

/** Reference suffixes of the payments a bill takes at checkout (`<bill>-PAY`, `<bill>-CASH`, …). */
export const CHECKOUT_PAYMENT_SUFFIXES = ['PAY', 'CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE'] as const;

/**
 * Ledger row ids of a bill come from its invoice id, not its number: two bills can share a number across terminals,
 * and one must not overwrite the other's row. Rows posted earlier under number-based ids are retired by reference on
 * the bill's next save.
 */
const billSaleLedgerId = (tenantId: string, billKey: string) => deterministicUUID(`credit_sale:${tenantId}:${billKey}`);
const billPaymentLedgerId = (tenantId: string, billKey: string, suffix: string) => deterministicUUID(`credit_pay_${suffix.toLowerCase()}:${tenantId}:${billKey}`);
const billLedgerIds = (tenantId: string, billKey: string) => [
  billSaleLedgerId(tenantId, billKey),
  ...CHECKOUT_PAYMENT_SUFFIXES.map((suffix) => billPaymentLedgerId(tenantId, billKey, suffix)),
];

/**
 * The credit rule of one bill: what was paid at checkout (each part, never more than the non-credit part of the
 * bill) and the credit portion the customer owes (bill total − paid). CREDIT: `received_amount` is paid in cash;
 * SPLIT: the cash/UPI/card/bank/cheque parts are paid and `credit` is owed; CASH: paid in full; anything else
 * (UPI, CARD, PENDING, …) is not on the ledger.
 */
export function invoiceCreditTerms(invoice: Pick<CreditLedgerInvoice, 'grand_total' | 'payment_method' | 'received_amount' | 'split_details'>, country: StoreCountry = 'IN') {
  const money = moneyFor(country);
  const splitObj = parseSplit(invoice.split_details);
  const method = (invoice.payment_method || '').toUpperCase();
  const total = Math.max(0, money(invoice.grand_total));
  const isSplit = method === 'SPLIT';
  const isPureCredit = method === 'CREDIT';
  const splitCredit = Math.min(total, Math.max(0, money(splitObj?.credit)));
  const isCredit = isPureCredit || (isSplit && splitCredit > 0);

  const payments: Array<{ type: string; amount: number; suffix: typeof CHECKOUT_PAYMENT_SUFFIXES[number]; method: string }> = [];
  if (isSplit) {
    let room = money(total - splitCredit);
    const parts: Array<[string, unknown, typeof CHECKOUT_PAYMENT_SUFFIXES[number], string]> = [
      ['Cash', splitObj?.cash, 'CASH', 'CASH'],
      ['UPI', splitObj?.upi, 'UPI', 'UPI'],
      ['Card', splitObj?.card, 'CARD', 'CARD'],
      ['Bank', splitObj?.bank_transfer || splitObj?.bank, 'BANK', 'BANK_TRANSFER'],
      ['Cheque', splitObj?.cheque, 'CHEQUE', 'CHEQUE'],
    ];
    for (const [type, raw, suffix, payMethod] of parts) {
      const amount = Math.min(room, Math.max(0, money(raw)));
      if (amount > 0) payments.push({ type, amount, suffix, method: payMethod });
      room = money(room - amount);
    }
  } else if (isPureCredit) {
    const received = Math.min(total, Math.max(0, money(invoice.received_amount)));
    if (received > 0) payments.push({ type: 'Cash', amount: received, suffix: 'PAY', method: 'CASH' });
  } else if (method === 'CASH' && total > 0) {
    payments.push({ type: 'Cash', amount: total, suffix: 'PAY', method: 'CASH' });
  }
  const paid = money(payments.reduce((s, p) => s + p.amount, 0));
  // Cash beyond the bill that the cashier kept on the customer's account: the one -PAY row records all the money
  // received, `paid` and the credit portion stay about the bill. Without the marker the excess was change given back.
  const onAccount = isPureCredit ? invoiceOnAccount(invoice.received_amount, total, splitObj, money) : 0;
  if (onAccount > 0) {
    if (payments[0]) payments[0].amount = money(payments[0].amount + onAccount);
    else payments.push({ type: 'Cash', amount: onAccount, suffix: 'PAY', method: 'CASH' });
  }
  return { method, total, isSplit, isPureCredit, isCredit, payments, onAccount, paid: isCredit ? paid : 0, creditPortion: isCredit ? money(total - paid) : 0 };
}

/** The `on_account` part of a credit bill: never more than what was actually received beyond the total. */
function invoiceOnAccount(received: unknown, total: number, split: SplitDetails | null | undefined, money: (n: unknown) => number) {
  return Math.min(Math.max(0, money(split?.on_account)), Math.max(0, money(money(received) - total)));
}

/**
 * The stored payment breakdown of a bill (`split_details`): cash / upi / card / bank_transfer / cheque / credit set to
 * exactly what the bill's method says, so every report and filter that reads the split agrees with the ledger, the
 * cash drawer and the payment accounts. Other keys (UPI account, old / new due) are kept.
 * CASH: cash = received when 0 < received < total (the drawer rule), else the total; UPI / CARD / CHEQUE / BANK: the
 * total in that key; CREDIT: cash = the amount received, credit = the rest; SPLIT: the parts as
 * `invoiceCreditTerms` caps them; anything else (PENDING): nothing received.
 */
export function normalizePaymentSplit(invoice: Pick<CreditLedgerInvoice, 'grand_total' | 'payment_method' | 'received_amount' | 'split_details'>, country: StoreCountry = 'IN'): SplitDetails {
  const money = moneyFor(country);
  const raw = parseSplit(invoice.split_details) || {};
  const keep = Object.fromEntries(Object.entries(raw).filter(([k]) => !['cash', 'upi', 'card', 'bank_transfer', 'bank', 'cheque', 'credit', 'on_account'].includes(k)));
  const out: SplitDetails = { ...keep, cash: 0, upi: 0, card: 0, bank_transfer: 0, cheque: 0, credit: 0 };
  const terms = invoiceCreditTerms(invoice, country);
  const total = terms.total;
  const received = Math.max(0, money(invoice.received_amount));
  switch (terms.method) {
    case 'CASH': out.cash = received > 0 && received < total ? received : total; break;
    case 'UPI': out.upi = total; break;
    case 'CARD': out.card = total; break;
    case 'CHEQUE': out.cheque = total; break;
    case 'BANK': case 'BANK_TRANSFER': out.bank_transfer = total; break;
    case 'CREDIT': {
      // The amount received is what was paid (the ledger posts it as the -PAY cash row); an old split is stale.
      const cash = Math.min(total, received);
      out.cash = cash;
      out.credit = money(total - cash);
      if (terms.onAccount > 0) out.on_account = terms.onAccount;
      break;
    }
    case 'SPLIT': {
      const keyOf: Record<string, keyof SplitDetails> = { CASH: 'cash', UPI: 'upi', CARD: 'card', BANK: 'bank_transfer', CHEQUE: 'cheque' };
      for (const p of terms.payments) out[keyOf[p.suffix]] = p.amount;
      out.credit = terms.creditPortion;
      break;
    }
    default: break;
  }
  return out;
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

    // Rows this bill posted earlier (this shop only, exact references), never the rows of another bill with this number.
    const billKey = invoice.invoice_id || invoiceNumber;
    const othersRows = new Set<string>();
    if (invoice.invoice_id) {
      const others = partyLedgerSql.findInvoicesSharingNumber(db).all({ tenant: tenantId, inv: invoiceNumber, id: invoice.invoice_id }) as Array<{ invoice_id: string }>;
      for (const other of others) for (const id of billLedgerIds(tenantId, other.invoice_id)) othersRows.add(id);
    }
    const existingEntries = (partyLedgerSql.findInvoiceLedgerEntries(db).all({ tenant: tenantId, inv: invoiceNumber }) as PartyLedgerRow[])
      .filter((row) => !othersRows.has(row.ledger_id));

    // ── 1. DELETION ─────────────────────────────────────────────────────────
    if (isDelete) {
      retireEntries(db, existingEntries);
      setInvoiceReturnCreditUse(db, tenantId, invoiceNumber, false);

      // Also clean up any staff ledger entries for this invoice
      const staffTxToDelete = partyLedgerSql.findStaffTransactionsByReferenceNumberAndType(db).all(invoiceNumber) as StaffTransactionRow[];
      for (const stx of staffTxToDelete) {
        partyLedgerSql.deleteStaffLedgerByTransactionId(db).run(stx.transaction_id);
        partyLedgerSql.deleteStaffTransactionByTransactionId(db).run(stx.transaction_id);
        recalcStaffLedgerBalances(db, tenantId, stx.staff_id);
      }
      return;
    }

    // ── 2. PAYMENT SPLIT ────────────────────────────────────────────────────
    const terms = invoiceCreditTerms(invoice, getStoreCountrySetting(db, tenantId));
    const { isPureCredit, isCredit, payments, creditPortion } = terms;
    const paymentMethodUpper = terms.method;
    const invoiceGrandTotal = terms.total;

    // ── 3. STAFF PURCHASES go to the staff ledger ───────────────────────────
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
      // A staff bill never stays in the party ledger.
      retireEntries(db, existingEntries);

      const creditDue = creditPortion;
      const txDate = invoice.created_at || localTimestamp();
      const nowTimestamp = localTimestamp();

      if (creditDue > 0) {
        const country = getStoreCountrySetting(db, tenantId);
        const cur = storeMoneyProfile(country).prefix;
        const desc = `Staff Purchase - Bill #${invoiceNumber} (Total ${cur}${storeMoneyFixed(invoiceGrandTotal, country)})`;
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
      // Walk-in bill: nothing on any party ledger.
      retireEntries(db, existingEntries);
      return;
    }

    const identityResult = CustomerIdentityService.findOrCreateCustomerAndParty(db, tenantId, {
      customer_id: custId,
      name: custName,
      phone: custPhone,
      address: custAddress,
      gstin: custGstin,
    });

    if (!identityResult) throw new Error('Could not resolve the customer account for this bill');

    const targetPartyId = identityResult.party_id;

    // ── 5. NON-CREDIT BILLS (CASH, UPI, CARD, …) are paid in full: no ledger rows ────────
    const isCash = paymentMethodUpper === 'CASH';
    let showFullyPaidCash = false;
    if (!isCredit && isCash && invoiceGrandTotal > 0) {
      const showSetting = partyLedgerSql.findSettingsByKey(db).get(tenantId, 'show_fully_paid_cash_in_ledger') as { value: string } | undefined;
      try { showFullyPaidCash = showSetting ? Boolean(JSON.parse(showSetting.value)) : false; } catch { showFullyPaidCash = false; }
    }
    if (!isCredit && !showFullyPaidCash) {
      retireEntries(db, existingEntries);
      return;
    }

    // Retire every earlier row of this bill (also on a previous customer's ledger); the current set is re-posted below
    // with the same deterministic ids, so the bill always has exactly one adjustment.
    retireEntries(db, existingEntries, targetPartyId);

    // ── 6. POST THE SALE AND THE PAYMENTS TAKEN AT CHECKOUT ─────────────────
    const balanceType: 'GST' | 'ESTIMATE' = (invoice.invoice_type === 'ESTIMATE') ? 'ESTIMATE' : 'GST';
    const txDate = invoice.created_at || localTimestamp();

    const country = getStoreCountrySetting(db, tenantId);
    const cur = storeMoneyProfile(country).prefix;
    // India and UAE keep their historical text (`Credit ₹1500`); Bahrain shows every fils (`Credit BHD 0.465`).
    const partAmount = (amount: number) => (country === 'BH' ? storeMoneyFixed(amount, country) : String(amount));
    const breakdownParts = payments.map(p => `${p.type === 'Cash' && isPureCredit ? 'Paid' : p.type} ${cur}${partAmount(p.amount)}`);
    if (isCredit) breakdownParts.push(`Credit ${cur}${partAmount(creditPortion)}`);
    const breakdownText = breakdownParts.length > 0 ? ` (${breakdownParts.join(', ')})` : '';
    const salePrefix = isCredit ? 'Credit Sale' : 'Cash Sale';
    const saleDescription = `${salePrefix} ${invoiceNumber} - Total ${cur}${storeMoneyFixed(invoiceGrandTotal, country)}${breakdownText} - ${custName || 'Customer'}`;

    // Sale entry (credit = the bill total)
    partyLedgerSql.upsertPartyLedger(db).run(
      billSaleLedgerId(tenantId, billKey),
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

    // Payment entries (debit = amount paid at checkout)
    for (const p of payments) {
      partyLedgerSql.upsertPartyLedger2(db).run(
        billPaymentLedgerId(tenantId, billKey, p.suffix),
        targetPartyId,
        tenantId,
        txDate,
        `Payment received (${p.type}) for ${invoiceNumber}`,
        p.amount,
        balanceType,
        p.method,
        `${invoiceNumber}-${p.suffix}`,
        invoice.user_id || 'system',
        invoice.user_name || 'System'
      );
    }

    recalcPartyBalances(db, targetPartyId);
  } catch (err) {
    // Callers run inside the bill's transaction: failing rolls the bill back, so it cannot exist without its ledger rows.
    console.error(`[syncInvoiceCreditLedger] Failed for invoice ${invoice.invoice_number || invoice.invoice_id || '?'} (tenant ${invoice.tenant_id || 'global'}):`, err);
    throw err;
  }
}

/** Retire every ledger row of a return (the return, its money refund and its credit uses). */
export function removeReturnLedger(db: Db, tenantId: string, returnNumber: string) {
  const rows = partyLedgerSql.findReturnLedgerEntries(db).all({ tenant: tenantId, ret: returnNumber }) as PartyLedgerRow[];
  retireEntries(db, rows);
}

/**
 * Post a return to the customer's ledger.
 * - CREDIT / STORE_CREDIT / ADJUST_BILL: the returned value is owed to the customer (debit = return total).
 * - CASH / UPI / CARD / BANK_TRANSFER / CHEQUE: the value was paid back, so the return (debit) and the refund
 *   (credit, reference `<return>-REFUND`) cancel out and the balance does not change.
 * - With `adjusted_invoice_number`: an ADJUST_BILL return credit was used on that bill, whose total is already lower
 *   by that amount, so the use is posted as a credit (reference `<return>-ADJ-<bill>`) that cancels the return credit.
 */
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

    const amount = Math.max(0, moneyFor(getStoreCountrySetting(db, params.tenant_id))(params.amount ?? params.grand_total));
    if (amount <= 0) return;

    const identityResult = CustomerIdentityService.findOrCreateCustomerAndParty(db, tenantId, {
      customer_id: params.customer_id || undefined,
      name: custName,
      phone: custPhone,
      address: custAddress,
      gstin: custGstin,
    });

    if (!identityResult) throw new Error('Could not resolve the customer account for this return');

    const partyId = identityResult.party_id;
    const who = custName || custPhone || 'Customer';
    const refundMethod = (params.refund_method || '').toUpperCase();
    const isMoneyRefund = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE'].includes(refundMethod);
    const txDate = params.created_at || localTimestamp();
    const refText = params.invoice_number ? ` (Ref: ${params.invoice_number})` : '';
    const parties = new Set<string>([partyId]);

    const post = (reference: string, credit: number, debit: number, description: string, method: string) => {
      // Keep the id of a row posted earlier under this reference (older versions used random ids).
      const earlier = partyLedgerSql.findOnePartyLedgerByReferenceNumber(db).get(tenantId, reference) as PartyLedgerRow | undefined;
      if (earlier && earlier.party_id !== partyId) parties.add(earlier.party_id);
      partyLedgerSql.upsertPartyLedgerEntry(db).run({
        ledger_id: earlier?.ledger_id || deterministicUUID(`return:${tenantId}:${reference}`),
        party_id: partyId, tenant_id: tenantId, transaction_date: txDate, description,
        credit_amount: credit, debit_amount: debit, balance_type: 'GST', payment_method: method,
        reference_number: reference, created_by: params.user_id || 'system', created_by_name: params.user_name || 'System',
      });
    };

    if (params.adjusted_invoice_number) {
      post(`${returnNumber}-ADJ-${params.adjusted_invoice_number}`, amount, 0,
        `Return credit ${returnNumber} used on ${params.adjusted_invoice_number} - ${who}`, 'ADJUST_BILL');
    } else {
      post(returnNumber, 0, amount, `Sales Return ${returnNumber}${refText} - ${who}`, refundMethod || 'CREDIT');
      if (isMoneyRefund) {
        post(`${returnNumber}-REFUND`, amount, 0, `Return refund (${refundMethod}) ${returnNumber}${refText} - ${who}`, refundMethod);
      }
    }

    for (const id of parties) recalcPartyBalances(db, id);
  } catch (err) {
    console.error('[syncReturnLedger] Error:', err);
    throw err;
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
        // One bill that cannot be posted must not stop the repair of the others (already logged).
        try { syncInvoiceCreditLedger(db, inv); } catch { /* retried on the next backfill */ }
      }
      console.log(`[DB] Credit invoices backfill completed.`);
    }

    // Backfill any returns against credit invoices (or store credit returns) that are missing from party_ledger
    try {
      const unlinkedReturns = partyLedgerSql.findReturnsByReferenceNumber(db).all() as ReturnRow[];

      if (unlinkedReturns.length > 0) {
        console.log(`[DB] Backfilling ${unlinkedReturns.length} returns into party ledger...`);
        for (const ret of unlinkedReturns) {
          const base = {
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
            user_id: ret.user_id,
            created_at: ret.created_at,
          };
          try {
            syncReturnLedger(db, { ...base, amount: Number(ret.grand_total) || 0 });
            // A return credit already used on a bill: post that use too, or the credit would count twice.
            const used = moneyFor(getStoreCountrySetting(db, base.tenant_id))(ret.adjusted_amount);
            if ((ret.refund_method || '').toUpperCase() === 'ADJUST_BILL' && used > 0 && ret.adjusted_invoice_number) {
              syncReturnLedger(db, { ...base, adjusted_invoice_number: ret.adjusted_invoice_number, amount: used });
            }
          } catch { /* already logged; retried on the next backfill */ }
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
        retireEntries(db, staleEntries);
      }
    } catch (e) {
      console.error('[DB] Failed to clean stale deleted invoice ledger entries in backfill:', e);
    }
  } catch (err) {
    console.error('[DB] Failed to backfill credit invoices:', err);
  }
}
