import type { Migration } from './runner.js';
import crypto from 'node:crypto';

/**
 * Migration 23: Reconcile customer loyalty points across historical invoices.
 * Older versions (< v2.2.0) inserted duplicate EARNED transactions when editing or settling bills.
 * This migration audits all historical customer invoices, captures any missing baselines,
 * balances duplicate EARNED rows with ADJUSTED adjustments, and synchronizes
 * customers.current_points_balance and total_points_earned across all tenants.
 */
export const m023ReconcileCustomerLoyaltyPoints: Migration = {
  version: 23,
  name: 'reconcile-customer-loyalty-points',
  up: db => {
    const hasLoyalty = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'loyalty_transactions'").get();
    const hasInvoices = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invoices'").get();
    const hasCustomers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'customers'").get();
    if (!hasLoyalty || !hasInvoices || !hasCustomers) return;

    const getInvoices = db.prepare(`
      SELECT invoice_id, tenant_id, customer_id, invoice_number, grand_total,
             COALESCE(points_earned, 0) AS points_earned,
             COALESCE(points_redeemed, 0) AS points_redeemed,
             COALESCE(is_deleted, 0) AS is_deleted
      FROM invoices
      WHERE customer_id IS NOT NULL AND converted_from_invoice_id IS NULL
    `);

    const getCustomer = db.prepare('SELECT current_points_balance FROM customers WHERE customer_id = ? AND tenant_id = ?');
    const getReturnsTotal = db.prepare(`
      SELECT COALESCE(SUM(grand_total), 0) AS total
      FROM returns
      WHERE (invoice_id = ? OR invoice_id IN (SELECT invoice_id FROM invoices WHERE converted_from_invoice_id = ?))
        AND tenant_id = ?
    `);

    const getApplied = db.prepare(`
      SELECT COUNT(*) AS count,
        COALESCE(SUM(CASE WHEN transaction_type != 'REDEEMED' THEN points_balance_after - points_balance_before ELSE 0 END), 0) AS earned,
        COALESCE(SUM(CASE WHEN transaction_type = 'REDEEMED' THEN points_balance_before - points_balance_after ELSE 0 END), 0) AS redeemed
      FROM loyalty_transactions
      WHERE invoice_id = ? AND customer_id = ? AND tenant_id = ?
    `);

    const insertTx = db.prepare(`
      INSERT INTO loyalty_transactions
        (transaction_id, tenant_id, customer_id, invoice_id, transaction_type, points, points_balance_before, points_balance_after, reference_number, description, created_by, created_at, updated_at, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'system', ?, ?, 'PENDING')
    `);

    const updateCustomer = db.prepare(`
      UPDATE customers
      SET total_points_earned = total_points_earned + ?,
          total_points_redeemed = total_points_redeemed + ?,
          current_points_balance = ?,
          updated_at = ?,
          sync_status = 'PENDING'
      WHERE customer_id = ? AND tenant_id = ?
    `);

    const updateInvoice = db.prepare(`
      UPDATE invoices
      SET previous_points_balance = ? - points_earned + points_redeemed,
          remaining_points_balance = ?,
          updated_at = ?,
          sync_status = 'PENDING'
      WHERE invoice_id = ?
    `);

    const invoices = getInvoices.all() as {
      invoice_id: string;
      tenant_id: string;
      customer_id: string;
      invoice_number: string;
      grand_total: number;
      points_earned: number;
      points_redeemed: number;
      is_deleted: number;
    }[];

    const now = new Date().toISOString();

    for (const inv of invoices) {
      const cust = getCustomer.get(inv.customer_id, inv.tenant_id) as { current_points_balance: number } | undefined;
      if (!cust) continue;

      let applied = getApplied.get(inv.invoice_id, inv.customer_id, inv.tenant_id) as { count: number; earned: number; redeemed: number };

      if (!applied.count && (inv.points_earned || inv.points_redeemed)) {
        let baseBalance = (Number(cust.current_points_balance) || 0) - (Number(inv.points_earned) || 0) + (Number(inv.points_redeemed) || 0);
        for (const [type, delta] of [['EARNED', Number(inv.points_earned) || 0], ['REDEEMED', -(Number(inv.points_redeemed) || 0)]] as const) {
          if (!delta && type !== 'EARNED') continue;
          insertTx.run(crypto.randomUUID(), inv.tenant_id, inv.customer_id, inv.invoice_id, type, Math.abs(delta), baseBalance, baseBalance + delta, inv.invoice_number, 'Recorded historical invoice contribution', now, now);
          baseBalance += delta;
        }
        applied = getApplied.get(inv.invoice_id, inv.customer_id, inv.tenant_id) as { count: number; earned: number; redeemed: number };
      }

      const returned = getReturnsTotal.get(inv.invoice_id, inv.invoice_id, inv.tenant_id) as { total: number };
      const ratio = inv.grand_total > 0 ? Math.max(0, 1 - Number(returned.total) / inv.grand_total) : 1;
      const expectedEarned = inv.is_deleted ? 0 : Math.floor((Number(inv.points_earned) || 0) * ratio + 1e-9);
      const expectedRedeemed = inv.is_deleted ? 0 : Number(inv.points_redeemed) || 0;

      const diffEarned = expectedEarned - (applied.count ? applied.earned : Number(inv.points_earned) || 0);
      const diffRedeemed = expectedRedeemed - (applied.count ? applied.redeemed : Number(inv.points_redeemed) || 0);

      const currentCust = getCustomer.get(inv.customer_id, inv.tenant_id) as { current_points_balance: number };
      let balance = Number(currentCust?.current_points_balance) || 0;

      if (!diffEarned && !diffRedeemed) {
        updateInvoice.run(balance, balance, now, inv.invoice_id);
        continue;
      }

      for (const [type, delta] of [['ADJUSTED', diffEarned], ['REDEEMED', -diffRedeemed]] as const) {
        if (!delta) continue;
        insertTx.run(
          crypto.randomUUID(),
          inv.tenant_id,
          inv.customer_id,
          inv.invoice_id,
          type,
          Math.abs(delta),
          balance,
          balance + delta,
          inv.invoice_number,
          `Invoice points reconciliation (${delta > 0 ? '+' : ''}${delta})`,
          now,
          now
        );
        balance += delta;
      }

      updateCustomer.run(diffEarned, diffRedeemed, balance, now, inv.customer_id, inv.tenant_id);
      updateInvoice.run(balance, balance, now, inv.invoice_id);
    }
  },
};
