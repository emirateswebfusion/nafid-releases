import { getStoreCountrySetting, roundStoreMoney, storeMoneyMinorUnit } from './storeCountryService.js';
import type { Db } from '../db/statements/types.js';
import * as sql from '../db/statements/loyalty.js';
import { localTimestamp } from './storeTime.js';
import crypto from 'node:crypto';

import { calculateLoyaltyPoints } from '../utils/loyalty.js';

type Config = { includeTax?: boolean; enabled?: boolean; earningRate?: number; redemptionRate?: number; awardPointsOnPending?: boolean };
export function loyaltyEnabled(config: unknown, flags: unknown): boolean {
  const c = config as Config | null;
  const f = flags as { loyalty?: boolean } | null;
  return c?.enabled !== false && f?.loyalty !== false && (c?.enabled === true || f?.loyalty === true);
}
export function readLoyaltyConfig(db: Db, tenant: string): Config {
  const read = (key: string): unknown => {
    const row = sql.settings(db).get(tenant, key, tenant) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  };
  const config = read('loyalty_config') as Config | null;
  return { ...config, enabled: loyaltyEnabled(config, read('feature_flags')) };
}

/** Reconcile an invoice's contribution, including returns, without rebuilding unrelated/manual balances.
 * A spent award can become a negative balance on reversal: clamping would manufacture free points.
 * Run inside the calling use-case's transaction. Conversion copies never own points. */
export function captureInvoicePoints(db: Db, id: string) {
  const inv = sql.invoice(db).get(id) as { tenant_id: string; customer_id: string; invoice_number: string; points_earned: number; points_redeemed: number; converted_from_invoice_id: string } | undefined;
  if (!inv?.customer_id || inv.converted_from_invoice_id) return;
  const existing = sql.applied(db).get(id, inv.customer_id, inv.tenant_id) as { count: number };
  if (existing.count) return;
  const cust = sql.customer(db).get(inv.customer_id, inv.tenant_id) as { current_points_balance: number } | undefined;
  if (!cust) return;
  // Preserve an old invoice's already-applied contribution before recording its first reversal.
  let balance = (Number(cust.current_points_balance) || 0) - (Number(inv.points_earned) || 0) + (Number(inv.points_redeemed) || 0);
  const now = localTimestamp();
  for (const [type, delta] of [['EARNED', Number(inv.points_earned) || 0], ['REDEEMED', -(Number(inv.points_redeemed) || 0)]] as const) {
    if (!delta && type !== 'EARNED') continue;
    sql.insertAdjustment(db).run(crypto.randomUUID(), inv.tenant_id, inv.customer_id, id, type, Math.abs(delta), balance, balance + delta, inv.invoice_number, 'Recorded historical invoice contribution', now, now);
    balance += delta;
  }
}

export function refreshInvoiceEarnings(db: Db, id: string) {
  const inv = sql.invoice(db).get(id) as { tenant_id: string; payment_method: string; grand_total: number; tax_total: number; counts_in_revenue: number; converted_from_invoice_id: string } | undefined;
  if (!inv || inv.converted_from_invoice_id) return;
  const config = readLoyaltyConfig(db, inv.tenant_id);
  if (!config.enabled) {
    reconcileInvoicePoints(db, id);
    return;
  }
  captureInvoicePoints(db, id);
  const pm = (inv.payment_method || 'PENDING').toUpperCase();
  const earn = inv.counts_in_revenue === 1 && pm !== 'HOLD' && (pm !== 'PENDING' || config.awardPointsOnPending);
  const points = earn ? calculateLoyaltyPoints(inv.grand_total, inv.tax_total, config) : 0;
  sql.updateEarned(db).run(points, id);
  reconcileInvoicePoints(db, id);
}

export function reconcileInvoicePoints(db: Db, id: string) {
  captureInvoicePoints(db, id);
  const inv = sql.invoice(db).get(id) as { invoice_id: string; tenant_id: string; customer_id: string; invoice_number: string; grand_total: number; points_earned: number; points_redeemed: number; is_deleted: number; converted_from_invoice_id: string } | undefined;
  if (inv?.converted_from_invoice_id) {
    reconcileInvoicePoints(db, inv.converted_from_invoice_id);
    return;
  }
  if (!inv?.customer_id) return;
  const cust = sql.customer(db).get(inv.customer_id, inv.tenant_id) as { current_points_balance: number } | undefined;
  if (!cust) return;
  const returned = sql.returnsTotal(db).get(id, id, inv.tenant_id) as { total: number };
  const ratio = inv.grand_total > 0 ? Math.max(0, 1 - Number(returned.total) / inv.grand_total) : 1;
  const earned = inv.is_deleted ? 0 : Math.floor((Number(inv.points_earned) || 0) * ratio + 1e-9);
  const redeemed = inv.is_deleted ? 0 : Number(inv.points_redeemed) || 0;
  const applied = sql.applied(db).get(id, inv.customer_id, inv.tenant_id) as { count: number; earned: number; redeemed: number };
  const diffEarned = earned - (applied.count ? applied.earned : Number(inv.points_earned) || 0);
  const diffRedeemed = redeemed - (applied.count ? applied.redeemed : Number(inv.points_redeemed) || 0);
  if (!diffEarned && !diffRedeemed) {
    const balance = Number(cust.current_points_balance) || 0;
    sql.updateBalance(db).run(balance, balance, localTimestamp(), id);
    return;
  }
  const now = localTimestamp();
  let balance = Number(cust.current_points_balance) || 0;
  for (const [type, delta] of [['ADJUSTED', diffEarned], ['REDEEMED', -diffRedeemed]] as const) {
    if (!delta) continue;
    sql.insertAdjustment(db).run(crypto.randomUUID(), inv.tenant_id, inv.customer_id, id, type, Math.abs(delta), balance, balance + delta, inv.invoice_number, `Invoice points reconciliation (${delta > 0 ? '+' : ''}${delta})`, now, now);
    balance += delta;
  }
  sql.updateCustomer(db).run(diffEarned, diffRedeemed, balance, now, inv.customer_id, inv.tenant_id);
  sql.updateBalance(db).run(balance, balance, now, id);
}

/** Validate edits against the saved customer contribution before any invoice fields are changed. */
export function validateInvoicePointsEdit(db: Db, id: string, customerId: string | null, points: number | null | undefined, discount: number | null | undefined) {
  const inv = sql.invoice(db).get(id) as { customer_id: string; tenant_id: string; points_earned: number; points_redeemed: number; points_redeemed_discount: number };
  const previous = Number(inv.points_redeemed) || 0;
  const redeemed = points == null ? previous : Number(points);
  const value = discount == null ? Number(inv.points_redeemed_discount) || 0 : Number(discount);
  const config = readLoyaltyConfig(db, inv.tenant_id);
  if (customerId !== inv.customer_id && ((Number(inv.points_earned) || 0) || previous)) {
    throw new Error('Cancel and reissue a bill with loyalty activity to change its customer');
  }
  const changed = redeemed !== previous || value !== (Number(inv.points_redeemed_discount) || 0);
  if (!config.enabled && changed) throw new Error('Enable loyalty before changing historical redemption');
  if (!Number.isSafeInteger(redeemed) || redeemed < 0 || !Number.isFinite(value) || value < 0) throw new Error('Invalid points redemption');
  if (changed) {
    const cust = customerId ? sql.customer(db).get(customerId, inv.tenant_id) as { current_points_balance: number } | undefined : undefined;
    if (redeemed > Math.max(0, (Number(cust?.current_points_balance) || 0) + previous)) throw new Error('Insufficient points balance; refresh the bill');
    const country = getStoreCountrySetting(db, inv.tenant_id);
    const expected = roundStoreMoney(redeemed * Math.max(0.01, Number(config.redemptionRate) || 1), country);
    if (Math.abs(value - expected) > storeMoneyMinorUnit(country) / 10) throw new Error('Points discount changed; refresh the bill');
  }
}

/** Recover erased customer counters only from recorded movements, never from today's earning rate.
 * A nonzero opening/manual balance is deliberately left for explicit review. */
export function repairZeroLoyaltyCounters(db: Db, tenant: string) {
  const totals = sql.ledgerTotals(db).all(tenant) as { customer_id: string; earned: number; redeemed: number; balance: number }[];
  for (const total of totals) {
    const customer = sql.customer(db).get(total.customer_id, tenant) as { total_points_earned: number; total_points_redeemed: number; current_points_balance: number } | undefined;
    if (!customer || Number(customer.total_points_earned) || Number(customer.total_points_redeemed) || Number(customer.current_points_balance)) continue;
    if (!total.earned && !total.redeemed && !total.balance) continue;
    sql.replaceTotals(db).run(total.earned, total.redeemed, total.balance, localTimestamp(), total.customer_id, tenant);
  }
}
