import { getStoreCountrySetting, roundStoreMoney, storeMoneyMinorUnit } from './storeCountryService.js';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/statements/types.js';
import type { PartyLedgerRow, PaymentSourceRow } from './typesA.js';
import * as sql from '../db/statements/paymentSources.js';

/** Reconcile one manual ledger receipt/payment, inside the caller's database transaction. */
export function syncLedgerPaymentAccount(db: Db, ledgerId: string, partyId: string) {
  const row = sql.findManualLedgerPayment(db).get(ledgerId, partyId) as PartyLedgerRow | undefined;
  if (!row?.tenant_id) return;
  const country = getStoreCountrySetting(db, row.tenant_id);
  const amount = row.is_deleted ? 0 : roundStoreMoney(Number(row.debit_amount || 0) - Number(row.credit_amount || 0), country);
  syncAccountPayment(db, row.tenant_id, ledgerId, 'Party Ledger', row.payment_method || '', amount,
    row.description || 'Ledger payment', row.created_by, row.created_by_name);
}

/** A money refund is an account outflow; cancelling the return reverses just that outflow. */
export function syncReturnPaymentAccount(db: Db, row: {
  tenant_id: string; return_id: string; refund_method?: string | null; grand_total: number;
  return_number?: string; user_id?: string | null;
}, cancelled = false) {
  const country = getStoreCountrySetting(db, row.tenant_id);
  syncAccountPayment(db, row.tenant_id, row.return_id, 'Return Refund', row.refund_method || '',
    cancelled ? 0 : -Math.max(0, roundStoreMoney(row.grand_total, country)), `Return ${row.return_number || row.return_id}`,
    row.user_id, null);
}

/** Only salary/advance payouts move money; accruals, bonuses and deductions are ledger adjustments. */
export function syncStaffPaymentAccount(db: Db, row: {
  tenant_id: string; transaction_id: string; type: string; amount: number; payment_method: string;
  payment_source_id?: string; staff_name: string; user_id?: string; user_name?: string;
}) {
  if (row.type !== 'ADVANCE' && row.type !== 'SALARY_PAYMENT') return;
  const country = getStoreCountrySetting(db, row.tenant_id);
  syncAccountPayment(db, row.tenant_id, row.transaction_id, 'Staff Payout', row.payment_method,
    -Math.max(0, roundStoreMoney(row.amount, country)), `Staff ${row.staff_name}: ${row.type}`, row.user_id, row.user_name,
    row.payment_source_id);
}

/** Reconcile the supplier payout for a purchase and reverse it when the bill is deleted. */
export function syncPurchasePaymentAccount(db: Db, row: {
  purchase_bill_id: string; tenant_id: string; payment_type?: string; total_amount: number; bill_number: string;
}, cancelled = false) {
  const country = getStoreCountrySetting(db, row.tenant_id);
  syncAccountPayment(db, row.tenant_id, row.purchase_bill_id, 'Purchase Payment', row.payment_type || '',
    cancelled ? 0 : -Math.max(0, roundStoreMoney(row.total_amount, country)), `Purchase ${row.bill_number}`);
}

function syncAccountPayment(db: Db, tenant: string, reference: string, category: string, method: string,
  amount: number, description: string, userId?: string | null, userName?: string | null, preferredSource?: string) {
  const country = getStoreCountrySetting(db, tenant);
  const posted = sql.sumDocumentAccountPostings(db).all(tenant, category, reference) as Array<{ source_id: string; net: number }>;
  const type = method.toUpperCase() === 'BANK_TRANSFER' ? 'BANK' : method.toUpperCase();
  let target: (PaymentSourceRow & { is_enabled?: number | boolean | null; is_deleted?: number | boolean | null }) | undefined;
  if (['UPI', 'CARD', 'BANK'].includes(type) && amount !== 0) {
    if (preferredSource) {
      target = sql.findPaymentSourcesBySourceId(db).get(preferredSource, tenant) as PaymentSourceRow | undefined;
      if (!target || target.type !== type || !target.is_enabled || target.is_deleted) throw new Error('Payment account is unavailable');
    }
    // Keep the account originally used even if the default later changes.
    for (const entry of target ? [] : posted) {
      const source = sql.findPaymentSourcesBySourceId(db).get(entry.source_id, tenant) as PaymentSourceRow | undefined;
      if (source?.type === type && Math.abs(entry.net) >= storeMoneyMinorUnit(country)) { target = source; break; }
    }
    target ||= sql.findEnabledLedgerAccount(db).get(tenant, type) as PaymentSourceRow | undefined;
  }
  const ids = new Set(posted.map(p => p.source_id));
  if (target) ids.add(target.source_id);
  for (const sourceId of ids) {
    const delta = roundStoreMoney((sourceId === target?.source_id ? amount : 0) - Number(posted.find(p => p.source_id === sourceId)?.net || 0), country);
    if (Math.abs(delta) < storeMoneyMinorUnit(country)) continue;
    const source = sql.findPaymentSourcesBySourceId(db).get(sourceId, tenant) as PaymentSourceRow | undefined;
    if (!source) throw new Error('Payment account is unavailable');
    const balance = roundStoreMoney(Number(source.current_balance || 0) + delta, country);
    sql.insertPaymentSourceTransaction2(db).run(randomUUID(), tenant, sourceId, delta > 0 ? 'CASH_IN' : 'CASH_OUT',
      Math.abs(delta), category, description, reference, null, balance, userId || 'system', userName || null);
    sql.updatePaymentSourceCurrentBalance(db).run(balance, sourceId, tenant);
  }
}
