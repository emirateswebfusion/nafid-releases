import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAN_PULL_TABLES, LAN_PUSH_TABLES } from '../../electron/sync/lanTables';
import { RESTAURANT_SYNCED_TABLES } from '../../electron/db/migrations/016-restaurant';

const entitiesDir = path.resolve(__dirname, '../../electron/sync/entities');
/** Every /api/sync/<table> path the terminal sync code uses (pull and push), as table names. */
const usedByTerminals = new Set([
  ...readdirSync(entitiesDir).flatMap((f) =>
    [...readFileSync(path.join(entitiesDir, f), 'utf8').matchAll(/'\/api\/sync\/([a-z_-]+)'/g)].map((m) => m[1].replace(/-/g, '_')),
  ),
  // entities/restaurantSync.ts builds `/api/sync/<table>` for each restaurant table.
  ...RESTAURANT_SYNCED_TABLES,
]);

describe('LAN host table rules', () => {
  it('accepts pushes only for tables terminals actually send', () => {
    expect([...LAN_PUSH_TABLES].sort()).toEqual([...usedByTerminals].sort());
  });

  it('never accepts staff accounts, salaries or sync metadata over the LAN', () => {
    for (const t of ['users', 'staff', 'staff_salaries', 'staff_transactions', 'staff_ledger', 'staff_attendance', 'sync_meta']) {
      expect(LAN_PUSH_TABLES.has(t)).toBe(false);
      expect(LAN_PULL_TABLES.has(t)).toBe(true);
    }
  });

  it('only pushes tables that can also be pulled', () => {
    for (const t of LAN_PUSH_TABLES) expect(LAN_PULL_TABLES.has(t)).toBe(true);
  });
});
