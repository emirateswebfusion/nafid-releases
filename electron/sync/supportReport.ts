import { calculateEffectiveCloudAccess } from './cloudAccess.js';
import { app } from 'electron';
import { getDb } from '../db/localDb.js';
import { getAuthConfig } from './syncConfig.js';
import * as sql from '../db/statements/sync/accountMetadata.js';
import { accountIssues } from '../db/statements/sync/supportReport.js';
import { syncState } from './syncState.js';
let lastAttempt = 0;
let inFlight = false;
/** Bounded operational snapshots never carry party names, money, credentials, raw logs or arbitrary error text. */
export async function reportSyncSupport(): Promise<void> {
  if (inFlight || Date.now() - lastAttempt < 60_000) return;
  const auth = getAuthConfig();
  const base = (process.env.VENDORA_CLOUD_API || process.env.NAFID_CLOUD_API || process.env.VITE_CLOUD_API || '').replace(/\/$/, '');
  if (!auth || !base || auth.tenant_id === 'SYSTEM') return;
  inFlight = true; lastAttempt = Date.now();
  try {
    const db = getDb(), tenant = auth.tenant_id;
    if (!calculateEffectiveCloudAccess(tenant).isCloudAllowed) return;
    const origin = sql.read(db).get('origin') as { value: string } | undefined;
    if (!origin?.value) return;
    const issues = (accountIssues(db).all(tenant, tenant) as Record<string, unknown>[]).map(row => ({
      entity: row.entity, entity_id: row.entity_id, sync_status: row.sync_status, row_version: row.row_version,
      base: row.base, updated_at: row.updated_at,
      code: !row.reason ? (row.sync_status === 'FAILED' ? 'UPLOAD_FAILED' : 'WAITING_UPLOAD')
        : !row.base || /baseline|base revision|unverifiable/i.test(String(row.reason)) ? 'BASE_REQUIRED'
        : /deleted|unavailable/i.test(String(row.reason)) ? 'PARENT_UNAVAILABLE' : 'CLOUD_REVISION_CONFLICT',
    }));
    const report = { terminal_id: origin.value, version: app.getVersion(), platform: process.platform,
      observed_at: new Date().toISOString(), route: syncState.currentActiveRoute,
      pending: (sql.pendingAccounts(db).get(tenant, tenant) as { n: number }).n,
      conflicts: (sql.activeAccountConflicts(db).get(tenant, tenant) as { n: number }).n,
      downloads: (sql.countConflicts(db).get(`account_pull_pending:${tenant}:%`) as { n: number }).n, issues };
    const response = await fetch(`${base}/support/sync-reports`, { method: 'POST',
      headers: { Authorization: `Bearer ${auth.jwt_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(report), signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) console.warn('[SyncSupport] Report not accepted:', response.status);
  } catch { console.warn('[SyncSupport] Report unavailable; business sync unchanged.'); }
  finally { inFlight = false; }
}
