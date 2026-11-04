import { describe, it, expect } from 'vitest';
import { salesHistoryDb } from './fixtures/salesHistoryDb';
import { m015DedupeScrapCashTransactions } from '../../electron/db/migrations/015-dedupe-scrap-cash-transactions';

describe('m015DedupeScrapCashTransactions migration', () => {
  it('cleans up duplicate per-item SCRAP_PURCHASE cash transactions while preserving consolidated Scrap Purchase', () => {
    const { db } = salesHistoryDb();

    // Setup an open cash drawer
    db.exec(`
      INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, status, opening_balance, cash_sales, cash_in, cash_out, current_cash, expected_closing)
      VALUES ('d1', 't1', '2026-11-04', 'OPEN', 1000, 0, 0, 1097.4, -97.4, -97.4);
    `);

    // Simulate the bug: 1 consolidated Scrap Purchase + 2 per-item SCRAP_PURCHASE for M8-SCR-001
    db.exec(`
      INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by)
      VALUES ('tx-consolidated', 't1', 'd1', 'CASH_OUT', 550, 'Scrap Purchase', 'Scrap purchase M8-SCR-001', 'Haroon');

      INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by)
      VALUES ('tx-item-1', 't1', 'd1', 'CASH_OUT', 35.2, 'SCRAP_PURCHASE', 'Scrap purchase M8-SCR-001', 'system');

      INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by)
      VALUES ('tx-item-2', 't1', 'd1', 'CASH_OUT', 512.2, 'SCRAP_PURCHASE', 'Scrap purchase M8-SCR-001', 'system');

      -- Standalone scrap purchase without invoice number should be preserved
      INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by)
      VALUES ('tx-standalone', 't1', 'd1', 'CASH_OUT', 100, 'SCRAP_PURCHASE', 'Scrap purchase', 'system');
    `);

    // Run migration
    m015DedupeScrapCashTransactions.up(db);

    const remaining = (db.prepare('SELECT transaction_id, category, amount FROM cash_transactions ORDER BY transaction_id').all() as Array<{ transaction_id: string; category: string; amount: number }>);

    expect(remaining).toHaveLength(2);
    expect(remaining.find(r => r.transaction_id === 'tx-consolidated')).toMatchObject({
      category: 'Scrap Purchase',
      amount: 550,
    });
    expect(remaining.find(r => r.transaction_id === 'tx-standalone')).toMatchObject({
      category: 'SCRAP_PURCHASE',
      amount: 100,
    });
    expect(remaining.find(r => r.transaction_id === 'tx-item-1')).toBeUndefined();
    expect(remaining.find(r => r.transaction_id === 'tx-item-2')).toBeUndefined();
  });
});
