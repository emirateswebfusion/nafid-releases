import { describe, expect, it } from 'vitest';
import { salesHistoryDb } from './fixtures/salesHistoryDb';
import { runMigrations } from '../../electron/db/migrations/runner';
import { MIGRATIONS } from '../../electron/db/migrations';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
import { m015DedupeScrapCashTransactions } from '../../electron/db/migrations/015-dedupe-scrap-cash-transactions';
import { m016PurgeDuplicateScrapCashTransactions } from '../../electron/db/migrations/016-purge-duplicate-scrap-cash-transactions';

import { m017HistoricalCreditNotes } from '../../electron/db/migrations/017-historical-credit-notes';

describe('migration histories from release and feature branches', () => {
  for (const history of ['fresh', 'release', 'release40', 'preview', 'integrated20'] as const) {
    it(`upgrades ${history} without losing historical records or business rows`, () => {
      const { db, memory } = salesHistoryDb();
      db.exec('ALTER TABLE invoices DROP COLUMN counts_in_revenue; ALTER TABLE invoices DROP COLUMN bill_purpose; ALTER TABLE invoices DROP COLUMN stock_applied;');
      runColumnMigrations(db);
      Object.assign(db, {
        transaction: (fn: () => unknown) => () => {
          memory.exec('SAVEPOINT migration_test');
          try { const result = fn(); memory.exec('RELEASE migration_test'); return result; }
          catch (error) { memory.exec('ROLLBACK TO migration_test; RELEASE migration_test'); throw error; }
        },
        pragma: (sql: string) => memory.exec(`PRAGMA ${sql}`),
      });
      try {
        db.exec(`INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, status, opening_balance)
          VALUES ('compat-drawer', 'shop', '2026-11-04', 'OPEN', 1000);
          INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by)
          VALUES ('consolidated', 'shop', 'compat-drawer', 'CASH_OUT', 100, 'Scrap Purchase', 'Scrap purchase INV-1', 'Owner'),
            ('duplicate', 'shop', 'compat-drawer', 'CASH_OUT', 100, 'SCRAP_PURCHASE', 'Scrap purchase INV-1', 'system'),
            ('standalone', 'shop', 'compat-drawer', 'CASH_OUT', 25, 'SCRAP_PURCHASE', 'Scrap purchase', 'system');`);
        const base = MIGRATIONS.filter(m => m.version <= 14);
        if (history !== 'fresh') {
          runMigrations(db, history === 'release' || history === 'release40'
            ? [...base, m015DedupeScrapCashTransactions, m016PurgeDuplicateScrapCashTransactions, ...(history === 'release40' ? [m017HistoricalCreditNotes] : [])]
            : MIGRATIONS.filter(m => m.version <= (history === 'integrated20' ? 20 : 17)));
        }
        const before = history === 'fresh' ? [] : db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
        runMigrations(db, MIGRATIONS);
        const records = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
        expect(records.slice(0, before.length)).toEqual(before);
        expect(records).toHaveLength(22);
        const returnColumns = db.prepare('PRAGMA table_info(returns)').all() as { name: string; notnull: number }[];
        expect(returnColumns.find(column => column.name === 'invoice_id')?.notnull).toBe(0);
        for (const table of ['card_terminal_transactions', 'restaurant_orders', 'kot_tickets', 'einvoice_documents']) {
          expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).toBeDefined();
        }
        expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'sync_outbox_restaurant_orders_insert'").get()).toBeDefined();
        expect(db.prepare('SELECT transaction_id FROM cash_transactions ORDER BY transaction_id').all())
          .toEqual([{ transaction_id: 'consolidated' }, { transaction_id: 'standalone' }]);
        expect(db.prepare("SELECT cash_out, current_cash FROM cash_drawer WHERE drawer_id = 'compat-drawer'").get())
          .toEqual({ cash_out: 125, current_cash: 875 });
        expect(runMigrations(db, MIGRATIONS).applied).toEqual([]);
      } finally { memory.close(); }
    });
  }
});
