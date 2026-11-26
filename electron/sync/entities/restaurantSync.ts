import { getDb } from '../../db/localDb.js';
import { withSyncApplyGuard } from '../../db/statements/outbox.js';
import { RESTAURANT_SYNCED_TABLES } from '../../db/migrations/016-restaurant.js';
import * as sql from '../../db/statements/sync/restaurantSync.js';
import { BATCH_SIZE } from '../syncConfig.js';
import { pullPaginated, pushBatch } from '../syncTransport.js';
import { notifyPullProgress } from '../syncProgress.js';

/**
 * Restaurant mode sync (design §10): the seven restaurant tables pushed and pulled by `/api/sync/<table>`. The same paths are served by the cloud and by the LAN primary (generic table routes in
 * localHostServer.ts). Runs only for shops with the `restaurant_mode` feature flag, so retail sync is unchanged.
 */

export const restaurantEndpoint = (table: string) => `/api/sync/${table}`;

export function restaurantModeEnabled(tenantId: string): boolean {
  const row = sql.selectFeatureFlags(getDb()).get(tenantId) as { value: string } | undefined;
  if (!row?.value) return false;
  try {
    const flags: unknown = JSON.parse(row.value);
    return !!flags && typeof flags === 'object' && (flags as Record<string, unknown>).restaurant_mode === true;
  } catch {
    return false;
  }
}

function toParam(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return value;
}

/** Pushes pending rows of every restaurant table (setup tables first, then orders, lines and tickets). */
export async function pushRestaurant(token: string, tenantId: string): Promise<number> {
  const db = getDb();
  let synced = 0;
  for (const table of RESTAURANT_SYNCED_TABLES) {
    const { key } = sql.tableColumns(db, table);
    const pending = sql.selectPendingRows(db, table).all(tenantId) as Record<string, unknown>[];
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch: Record<string, unknown>[] = pending.slice(i, i + BATCH_SIZE).map(row => ({ ...row, tenant_id: tenantId }));
      const ids = new Set((await pushBatch(restaurantEndpoint(table), token, batch, table, `Restaurant ${table}`)).map(String));
      if (ids.size === 0) continue;
      const mark = sql.markPushedRowSynced(db, table, key);
      db.transaction(() => {
        for (const row of batch) if (ids.has(String(row[key]))) mark.run(row[key], row.updated_at);
      })();
      synced += ids.size;
    }
  }
  return synced;
}

/** Pulls restaurant rows changed since the per-table cursor. Returns true when any row arrived. */
export async function pullRestaurant(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();
  let changed = false;
  for (const table of RESTAURANT_SYNCED_TABLES) {
    const { statement, columns } = sql.upsertPulledRow(db, table);
    const result = await pullPaginated({
      token, tenantId, table, urlPath: restaurantEndpoint(table), label: table,
      onProgress: (fetched) => notifyPullProgress(table, fetched),
      processPage: (rows) => {
        const now = new Date().toISOString();
        withSyncApplyGuard(db, () => db.transaction(() => {
          for (const row of rows) {
            const params: Record<string, unknown> = {};
            for (const column of columns) params[column] = toParam(row[column]);
            params.tenant_id = tenantId;
            params.created_at ??= now;
            params.updated_at ??= now;
            params.is_deleted = Number(params.is_deleted) ? 1 : 0;
            try {
              statement.run(params);
            } catch (e) {
              console.error(`[SyncWorker] Error pulling ${table}:`, (e as Error).message);
              throw e;
            }
          }
        })());
        return rows.length;
      },
    });
    if (result.hasChanged && result.count > 0) changed = true;
  }
  return changed;
}

/** One restaurant sync step of the main cycle (push, then pull). */
export async function syncRestaurant(token: string, tenantId: string): Promise<boolean> {
  if (!restaurantModeEnabled(tenantId)) return false;
  await pushRestaurant(token, tenantId);
  return pullRestaurant(token, tenantId);
}
