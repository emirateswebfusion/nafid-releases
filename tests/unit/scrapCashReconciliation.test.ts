import { describe, it, expect } from 'vitest';
import { salesHistoryDb } from './fixtures/salesHistoryDb';
import { m015DedupeScrapCashTransactions } from '../../electron/db/migrations/015-dedupe-scrap-cash-transactions';
import { m016PurgeDuplicateScrapCashTransactions } from '../../electron/db/migrations/016-purge-duplicate-scrap-cash-transactions';
import { getRegisterCashEntries } from '../../electron/services/cashDrawerSession';

describe('Scrap cash deduplication and runtime filtering', () => {
  it('m015 cleans up duplicate per-item SCRAP_PURCHASE cash transactions while preserving consolidated Scrap Purchase and reconciles drawer', () => {
    const { db } = salesHistoryDb();

    // Setup an open cash drawer with initial balances
    db.exec(`
      INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, status, opening_balance, cash_sales, cash_in, cash_out, current_cash, expected_closing)
      VALUES ('d1', 't1', '2026-11-04', 'OPEN', 1000, 0, 0, 1197.4, -197.4, -197.4);
    `);

    // Simulate the bug: 1 consolidated Scrap Purchase + 2 per-item SCRAP_PURCHASE for M8-SCR-001 + 1 standalone
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

    // Check that the cash_drawer row itself was immediately reconciled
    const drawer = db.prepare('SELECT cash_out, current_cash, expected_closing FROM cash_drawer WHERE drawer_id = ?').get('d1') as {
      cash_out: number;
      current_cash: number;
      expected_closing: number;
    };

    expect(drawer.cash_out).toBe(650);
    expect(drawer.current_cash).toBe(350);
    expect(drawer.expected_closing).toBe(350);
  });

  it('m016 purges duplicate per-item SCRAP_PURCHASE cash transactions unconditionally even if m015 was skipped', () => {
    const { db } = salesHistoryDb();

    db.exec(`
      INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, status, opening_balance, cash_sales, cash_in, cash_out, current_cash, expected_closing)
      VALUES ('d2', 't1', '2026-11-04', 'OPEN', 1000, 0, 0, 1097.4, -97.4, -97.4);

      INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by)
      VALUES ('tx-con-2', 't1', 'd2', 'CASH_OUT', 550, 'Scrap Purchase', 'Scrap purchase M8DG-SCR-001', 'Haroon');

      INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by)
      VALUES ('tx-it-1', 't1', 'd2', 'CASH_OUT', 35.2, 'SCRAP_PURCHASE', 'Scrap purchase M8DG-SCR-001', 'system');

      INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by)
      VALUES ('tx-it-2', 't1', 'd2', 'CASH_OUT', 512.2, 'SCRAP_PURCHASE', 'Scrap purchase M8DG-SCR-001', 'system');
    `);

    m016PurgeDuplicateScrapCashTransactions.up(db);

    const remaining = (db.prepare('SELECT transaction_id, category, amount FROM cash_transactions WHERE drawer_id = ?').all('d2') as Array<{ transaction_id: string; category: string; amount: number }>);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].transaction_id).toBe('tx-con-2');

    const drawer = db.prepare('SELECT cash_out, current_cash FROM cash_drawer WHERE drawer_id = ?').get('d2') as {
      cash_out: number;
      current_cash: number;
    };
    expect(drawer.cash_out).toBe(550);
    expect(drawer.current_cash).toBe(450);
  });

  it('getRegisterCashEntries at runtime filters out per-item system SCRAP_PURCHASE entries even before migration or purge runs', () => {
    const { db } = salesHistoryDb();

    db.exec(`
      INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, status, opening_balance, cash_sales, cash_in, cash_out, current_cash, expected_closing)
      VALUES ('d3', 't1', '2026-11-04', 'OPEN', 1000, 0, 0, 1097.4, -97.4, -97.4);

      INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, transaction_date)
      VALUES ('tx-c3', 't1', 'd3', 'CASH_OUT', 550, 'Scrap Purchase', 'Scrap purchase M8-SCR-001', 'Haroon', '2026-11-04 10:25:00');

      INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, transaction_date)
      VALUES ('tx-i3a', 't1', 'd3', 'CASH_OUT', 35.2, 'SCRAP_PURCHASE', 'Scrap purchase M8-SCR-001', 'system', '2026-11-04 10:25:00');

      INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, transaction_date)
      VALUES ('tx-i3b', 't1', 'd3', 'CASH_OUT', 512.2, 'SCRAP_PURCHASE', 'Scrap purchase M8-SCR-001', 'system', '2026-11-04 10:25:00');
    `);

    const drawerRow = { drawer_id: 'd3', business_date: '2026-11-04', status: 'OPEN' };
    const entries = getRegisterCashEntries(db, 't1', drawerRow);

    const categories = entries.map(e => e.category);
    expect(categories).toContain('Scrap Purchase');
    expect(categories).not.toContain('SCRAP_PURCHASE');
    expect(entries.filter(e => e.type === 'CASH_OUT')).toHaveLength(1);
    expect(entries[0].amount).toBe(550);
  });
});
