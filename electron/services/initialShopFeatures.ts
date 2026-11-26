import { getDb } from '../db/localDb.js';
import { insertInitialShopSetting } from '../db/statements/settings.js';
import { withSyncApplyGuard } from '../db/statements/outbox.js';

/** Cloud bootstrap fills missing settings only; a terminal's unsent choices always survive login. */
export function cacheInitialShopFeatures(tenantId: string, profile: unknown): void {
  if (!profile || typeof profile !== 'object') return;
  const data = profile as Record<string, unknown>;
  const flags = data.feature_flags;
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return;
  const entries = Object.entries(flags);
  if (entries.length > 100 || entries.some(([key, value]) => !/^[a-z][a-z0-9_]{0,63}$/.test(key) || typeof value !== 'boolean')) return;
  const updatedAt = typeof data.updated_at === 'string' && Number.isFinite(Date.parse(data.updated_at))
    ? new Date(data.updated_at).toISOString() : '1970-01-01T00:00:00.000Z';
  const db = getDb();
  db.transaction(() => withSyncApplyGuard(db, () => {
    const insert = insertInitialShopSetting(db);
    insert.run(tenantId, 'feature_flags', JSON.stringify(flags), updatedAt);
    if (typeof data.business_category === 'string') insert.run(tenantId, 'business_category', JSON.stringify(data.business_category), updatedAt);
  }))();
}
