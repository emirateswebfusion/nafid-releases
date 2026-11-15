import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';

const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/whatsapp/shopClosingReportService', () => ({ sendShopClosingReport: vi.fn() }));
vi.mock('../../electron/sync/syncWorker', () => ({
  runInitialSync: async () => {},
  triggerUrgentCashSync: async () => {},
}));

import { addParty, addPartyLedgerEntry } from '../../electron/services/partiesService';
import { getDayTransactions, deleteTransaction } from '../../electron/services/cashierService';

let raw: DatabaseSync;
const SHOP = 'shop_1';

beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, {
    transaction: (fn: () => unknown) => () => {
      raw.exec('SAVEPOINT test_tx');
      try {
        const result = fn();
        raw.exec('RELEASE test_tx');
        return result;
      } catch (e) {
        raw.exec('ROLLBACK TO test_tx; RELEASE test_tx');
        throw e;
      }
    },
  }) as unknown as Database.Database;

  createCoreTables(state.db);
  createExtendedTables(state.db);
  ensureSchemaColumns(state.db);
  runColumnMigrations(state.db);
  raw.exec("ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1;");

  // Setup open cash drawer for today
  raw.prepare(`
    INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, status, opening_balance, sync_status)
    VALUES ('d_1', ?, '2026-11-14', 'OPEN', 1000, 'SYNCED')
  `).run(SHOP);
});

afterEach(() => raw.close());

describe('cashier party transactions and ledger integration', () => {
  it('getDayTransactions resolves PARTY_LEDGER:<id> to party name and humanized category', () => {
    // 1. Create a party
    const partyRes = addParty({
      party_id: 'p_aman',
      tenant_id: SHOP,
      name: 'Aman Shop Butterfly',
      party_type: 'SUPPLIER',
    });
    expect(partyRes.success).toBe(true);

    // 2. Add an entry via party ledger with payment_method CASH (creates linked cash transaction)
    const ledgerId = 'l_test_123';
    const ledgerRes = addPartyLedgerEntry({
      ledger_id: ledgerId,
      party_id: 'p_aman',
      tenant_id: SHOP,
      transaction_type: 'CREDIT',
      amount: 3000,
      payment_method: 'CASH',
      description: 'Cash paid to supplier',
      transaction_date: '2026-11-14T10:00:00.000Z',
    });
    expect(ledgerRes.success).toBe(true);

    // 3. Query getDayTransactions for 2026-11-14
    const txs = getDayTransactions({ tenant_id: SHOP, business_date: '2026-11-14' }) as Array<{
      category?: string;
      notes?: string;
      party_name?: string;
      amount?: number;
    }>;

    expect(Array.isArray(txs)).toBe(true);
    expect(txs.length).toBe(1);
    expect(txs[0].party_name).toBe('Aman Shop Butterfly');
    expect(txs[0].category).toBe('Party: Aman Shop Butterfly');
    expect(txs[0].notes).toContain('Aman Shop Butterfly');
    expect(txs[0].notes).toContain('Cash paid to supplier');
  });

  it('addPartyLedgerEntry with skip_cash_drawer preserves Cash mode without duplicate register row', () => {
    // Create a party
    addParty({
      party_id: 'p_stove',
      tenant_id: SHOP,
      name: 'Stove Centre',
      party_type: 'SUPPLIER',
    });

    // Count existing cash transactions
    const countBefore = (raw.prepare('SELECT COUNT(*) as c FROM cash_transactions').get() as { c: number }).c;

    // Add entry with skip_cash_drawer: true (e.g. from cash register flow)
    const ledgerId = 'l_reg_1';
    const res = addPartyLedgerEntry({
      ledger_id: ledgerId,
      party_id: 'p_stove',
      tenant_id: SHOP,
      transaction_type: 'CREDIT',
      amount: 1500,
      payment_method: 'CASH',
      reference_number: 'Cash Register',
      description: 'Cash paid (Other): test note',
      skip_cash_drawer: true,
    });
    expect(res.success).toBe(true);

    // Verify party_ledger row has payment_method CASH and reference_number
    const row = raw.prepare('SELECT payment_method, reference_number, description FROM party_ledger WHERE ledger_id = ?').get(ledgerId) as {
      payment_method: string;
      reference_number: string;
      description: string;
    };
    expect(row.payment_method).toBe('CASH');
    expect(row.reference_number).toBe('Cash Register');
    expect(row.description).toBe('Cash paid (Other): test note');

    // Verify NO duplicate cash_transactions row was created
    const countAfter = (raw.prepare('SELECT COUNT(*) as c FROM cash_transactions').get() as { c: number }).c;
    expect(countAfter).toBe(countBefore);
  });

  it('deleteTransaction soft-deletes linked party_ledger entry and recalculates balance', () => {
    addParty({
      party_id: 'p_del',
      tenant_id: SHOP,
      name: 'Delete Test Party',
      party_type: 'CUSTOMER',
    });

    const ledgerId = 'l_to_delete';
    addPartyLedgerEntry({
      ledger_id: ledgerId,
      party_id: 'p_del',
      tenant_id: SHOP,
      transaction_type: 'CREDIT',
      amount: 500,
      payment_method: 'CASH',
      description: 'Payment',
    });

    // Check party balance is 500
    const partyBefore = raw.prepare('SELECT balance FROM parties WHERE party_id = ?').get('p_del') as { balance: number };
    expect(partyBefore.balance).toBe(500);

    // Find the linked cash transaction
    const cashTx = raw.prepare("SELECT transaction_id FROM cash_transactions WHERE category = ?").get(`PARTY_LEDGER:${ledgerId}`) as { transaction_id: string };
    expect(cashTx).toBeDefined();

    // Delete the cash transaction via cashier service
    const delRes = deleteTransaction({
      tenant_id: SHOP,
      transaction_id: cashTx.transaction_id,
      user_id: 'u_admin',
    });
    expect(delRes.success).toBe(true);

    // Verify party_ledger entry is soft-deleted
    const ledgerRow = raw.prepare('SELECT is_deleted FROM party_ledger WHERE ledger_id = ?').get(ledgerId) as { is_deleted: number };
    expect(ledgerRow.is_deleted).toBe(1);

    // Verify party balance is updated back to 0
    const partyAfter = raw.prepare('SELECT balance FROM parties WHERE party_id = ?').get('p_del') as { balance: number };
    expect(partyAfter.balance).toBe(0);
  });
});
