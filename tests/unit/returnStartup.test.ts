import { describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
describe('discounted return startup repair', () => {
  it.each([1.1, 1.17])('retains GST and precision and skips an already repaired total (%s)', grandTotal => {
    const writes: unknown[][] = [];
    const db = {
      exec: vi.fn(), transaction: (fn: () => void) => fn,
      prepare: (sql: string) => ({
        all: () => sql.includes('ret_grand_total')
          ? [{ return_id: 'r', ret_grand_total: grandTotal, inv_subtotal: 1.1, inv_discount: 0.11 }]
          : sql.includes('ri.return_item_id')
            ? [{ return_item_id: 'ri', quantity: 22, unit_price: 0.05, total: 1.1, invoice_unit_price: 0.05, tax_amount: 0.18 }]
            : [],
        get: () => undefined,
        run: (...args: unknown[]) => { if (sql.startsWith('UPDATE returns SET subtotal')) writes.push(args); return { changes: 0 }; },
      }),
    };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      runColumnMigrations(db as unknown as Database.Database);
      expect(writes).toEqual(grandTotal === 1.17 ? [] : [[0.99, 1.17, 'r']]);
    } finally { vi.restoreAllMocks(); }
  });
});
