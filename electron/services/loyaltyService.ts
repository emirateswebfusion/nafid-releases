import type { Db } from '../db/statements/types.js';
import * as sql from '../db/statements/loyalty.js';
import { localTimestamp } from './storeTime.js';
import crypto from 'node:crypto';

type Config = { enabled?: boolean; earningRate?: number; redemptionRate?: number; awardPointsOnPending?: boolean };
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
  const inv = sql.invoice(db).get(id) as { tenant_id: string; payment_method: string; grand_total: number; converted_from_invoice_id: string } | undefined;
  if (!inv || inv.converted_from_invoice_id) return;
  const config = readLoyaltyConfig(db, inv.tenant_id);
  if (!config.enabled) return;
  const pm = (inv.payment_method || 'PENDING').toUpperCase();
  const earn = pm !== 'HOLD' && (pm !== 'PENDING' || config.awardPointsOnPending);
  const points = earn ? Math.floor(Math.max(0, inv.grand_total) / Math.max(1, Number(config.earningRate) || 100)) : 0;
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
  if (!diffEarned && !diffRedeemed) return;
  const now = localTimestamp();
  let balance = Number(cust.current_points_balance) || 0;
  for (const [type, delta] of [['ADJUSTED', diffEarned], ['REDEEMED', -diffRedeemed]] as const) {
    if (!delta) continue;
    sql.insertAdjustment(db).run(crypto.randomUUID(), inv.tenant_id, inv.customer_id, id, type, Math.abs(delta), balance, balance + delta, inv.invoice_number, `Invoice points reconciliation (${delta > 0 ? '+' : ''}${delta})`, now, now);
    balance += delta;
  }
  sql.updateCustomer(db).run(diffEarned, diffRedeemed, balance, now, inv.customer_id, inv.tenant_id);
  sql.updateBalance(db).run(balance, now, id);
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
    const expected = Math.round(redeemed * Math.max(0.01, Number(config.redemptionRate) || 1) * 100) / 100;
    if (Math.abs(value - expected) > 0.001) throw new Error('Points discount changed; refresh the bill');
  }
}
