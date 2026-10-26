import type { CloudAccessUpdate } from './typesB.js';
import { getDb } from '../db/localDb.js';
import * as syncSql from '../db/statements/sync.js';
import { LAN_KEY_HEADER, getLanPairingKey, normalizeLanKey } from './lanPairing.js';
/** sync use-cases for the main process (called by electron/ipc handlers). */

/** IPC `db:debugSyncState` */
export function debugSyncState(tenant_id: string) {
  try {
    const db = getDb();
    const tables = ['products', 'invoices', 'cash_transactions', 'cash_drawer', 'cashier_audit_log'];
    const counts: Record<string, unknown> = {};
    for (const t of tables) {
      try {
        const row = syncSql.countSyncStatusForTable(db, t).get(tenant_id) as Record<string, number>;
        counts[t] = row;
      } catch (e) { counts[t] = { error: (e as Error).message }; }
    }
    const cursors = syncSql.findSyncMeta(db).all(`pull_cursor:${tenant_id}:%`) as Record<string, unknown>[];
    const isSyncActive = syncSql.findSyncMetaByKey(db).get(`cash_drawer_conflict_fix_v2:${tenant_id}`) as unknown;
    console.log('[db:debugSyncState] Table counts:', JSON.stringify(counts, null, 2));
    console.log('[db:debugSyncState] Pull cursors:', JSON.stringify(cursors, null, 2));
    return { counts, cursors, healingFlagSet: !!isSyncActive };
  } catch (e) {
    console.error('[db:debugSyncState] Error:', (e as Error).message);
    return { error: (e as Error).message };
  }
}

/** IPC `sync:clearPending` */
export async function syncClearPending({ tenant_id, type, records }: { tenant_id: string; type: 'invoices' | 'products' | 'all'; records?: string[] }) {
  try {
    const db = getDb();
    
    if (type === 'invoices' || type === 'all') {
      if (records && records.length > 0) {
        const placeholders = records.map(() => '?').join(',');
        syncSql.markInvoicesSyncedByIds(db, placeholders).run(...records, tenant_id);
        console.log(`[Sync] Force-cleared ${records.length} stuck invoice(s) from sync queue`);
      }
    }
    
    if (type === 'products' || type === 'all') {
      if (records && records.length > 0) {
        const placeholders = records.map(() => '?').join(',');
        syncSql.markProductsSyncedByIds(db, placeholders).run(...records, tenant_id);
        console.log(`[Sync] Force-cleared ${records.length} stuck product(s) from sync queue`);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('[sync:clearPending]', error);
    return { success: false, error: (error as Error).message || 'Operation failed' };
  }
}

/** IPC `sync:getPending` */
export async function syncGetPending({ tenant_id }: { tenant_id: string }) {
  try {
    const db = getDb();
    const invoices = syncSql.findInvoices(db).all(tenant_id);
    const products = syncSql.findProducts(db).all(tenant_id);
    return { success: true, pending: { invoices, products } };
  } catch (error) {
    console.error('[sync:getPending]', error);
    return { success: false, error: (error as Error).message || 'Operation failed' };
  }
}

/** IPC `sync:getCloudAccessState` */
export async function getCloudAccessState(tenantId?: string) {
  try {
    const { calculateEffectiveCloudAccess } = await import('../sync/syncWorker.js');
    return calculateEffectiveCloudAccess(tenantId);
  } catch (err) {
    console.error('[Main] sync:getCloudAccessState error:', (err as Error).message);
    return null;
  }
}

/** IPC `sync:updateCloudAccessConfig` */
export async function updateCloudAccessConfig(payload: { config: CloudAccessUpdate; tenant_id?: string }) {
  try {
    const { updateCloudAccessConfig } = await import('../sync/syncWorker.js');
    return updateCloudAccessConfig(payload.config, payload.tenant_id);
  } catch (err) {
    console.error('[Main] sync:updateCloudAccessConfig error:', (err as Error).message);
    return null;
  }
}

/** IPC `sync:setPageContext` */
export async function setPageContext(payload: { page: string; active: boolean }) {
  try {
    const { setPageContext } = await import('../sync/syncWorker.js');
    setPageContext(payload?.page || null, !!payload?.active);
    return { success: true };
  } catch (err) {
    console.error('[Main] sync:setPageContext error:', (err as Error).message);
    return { success: false, error: (err as Error).message };
  }
}

/** IPC `sync:resetFastPollBackoff` */
export async function resetFastPollBackoff() {
  try {
    const { resetFastPollBackoff } = await import('../sync/syncWorker.js');
    resetFastPollBackoff();
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/** IPC `sync:getProgress` */
export async function getSyncProgress() {
  const { getSyncProgress } = await import('../sync/syncWorker.js');
  return getSyncProgress();
}

/** IPC `sync:testConnection` */
export async function testNetworkConnection(payload: { syncMode?: string; lanRole?: string; lanHostIp?: string; lanPort?: number; lanPairingKey?: string }) {
  const syncMode = payload?.syncMode || 'HYBRID';
  const lanRole = payload?.lanRole || 'SECONDARY';
  const rawHost = payload?.lanHostIp || '';
  const port = Number(payload?.lanPort) || 3888;
  const cleanHost = String(rawHost).trim().replace(/^https?:\/\//i, '').replace(/:\d+$/, '').replace(/\/.*$/, '');
  const defaultCloud = (process.env.VENDORA_CLOUD_API || process.env.NAFID_CLOUD_API || process.env.VITE_CLOUD_API || '').replace(/\/$/, '');

  if (syncMode === 'LAN' || syncMode === 'HYBRID') {
    if (lanRole === 'PRIMARY') {
      return {
        ok: true,
        route: 'LAN',
        message: `Wifi Sync Active — This PC is Primary Master Server (Port ${port})`
      };
    }

    const host = cleanHost || process.env.DEFAULT_LAN_IP || '';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`http://${host}:${port}/health`, { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        // The server is reachable; now prove this terminal holds the shop's pairing key.
        const key = normalizeLanKey(payload?.lanPairingKey) || getLanPairingKey();
        const authRes = await fetch(`http://${host}:${port}/api/sync/check-status`, { method: 'GET', headers: { [LAN_KEY_HEADER]: key }, signal: AbortSignal.timeout(3500) });
        if (authRes.status === 401) {
          return { ok: false, route: 'LAN', error: `Primary Master Server (${host}:${port}) rejected the pairing key. Enter the key shown on the primary terminal (Settings → Network).` };
        }
        return {
          ok: true,
          route: 'LAN',
          message: `Wifi Sync Active — Connected to Primary Master Server (${host}:${port})`
        };
      } else if (syncMode === 'HYBRID') {
        try {
          const cloudCtrl = new AbortController();
          const cloudTimeout = setTimeout(() => cloudCtrl.abort(), 3500);
          const cloudRes = await fetch(`${defaultCloud}/health`, { method: 'GET', signal: cloudCtrl.signal });
          clearTimeout(cloudTimeout);
          if (cloudRes.ok) {
            return {
              ok: true,
              route: 'CLOUD',
              fallback: true,
              message: `Cloud Sync Active (Hybrid Fallback) — LAN Master Server (${host}) returned status ${res.status}. Syncing via Cloud API.`
            };
          }
        } catch { /* ignore */ }
        return {
          ok: false,
          error: `Sync Inactive — Master Server (${host}) returned status ${res.status}`
        };
      } else {
        return {
          ok: false,
          error: `Sync Inactive — Master Server (${host}) returned status ${res.status}`
        };
      }
    } catch {
      if (syncMode === 'HYBRID') {
        try {
          const cloudCtrl = new AbortController();
          const cloudTimeout = setTimeout(() => cloudCtrl.abort(), 3500);
          const cloudRes = await fetch(`${defaultCloud}/health`, { method: 'GET', signal: cloudCtrl.signal });
          clearTimeout(cloudTimeout);
          if (cloudRes.ok) {
            return {
              ok: true,
              route: 'CLOUD',
              fallback: true,
              message: `Cloud Sync Active (Hybrid Fallback) — LAN Master Server (${host}) unreachable. Automatically syncing via Cloud API!`
            };
          }
        } catch { /* ignore */ }
      }
      return {
        ok: false,
        error: `Sync Inactive — Could not connect to Master Server at ${host}:${port}. Ensure PC 1 is on, POS is open & Windows Firewall allows Port 3888.`
      };
    }
  } else {
    try {
      const cloudCtrl = new AbortController();
      const cloudTimeout = setTimeout(() => cloudCtrl.abort(), 3500);
      const cloudRes = await fetch(`${defaultCloud}/health`, { method: 'GET', signal: cloudCtrl.signal });
      clearTimeout(cloudTimeout);
      if (cloudRes.ok) {
        return {
          ok: true,
          route: 'CLOUD',
          message: `Cloud Sync Active — Connected to Cloud API server`
        };
      }
    } catch { /* ignore */ }
    return {
      ok: false,
      error: `Sync Inactive — Cloud API server (${defaultCloud}) is unreachable.`
    };
  }
}

/** True when this terminal is configured for LAN or HYBRID peer sync (keeps the sync worker alive offline). Throws on a malformed config. */
export function isLanSyncConfigured(): boolean {
  const row = syncSql.findNetworkSyncConfig(getDb()).get() as { value: string } | undefined;
  const netConfig = row?.value ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) : null;
  return Boolean(netConfig && (netConfig.syncMode === 'LAN' || netConfig.syncMode === 'HYBRID'));
}
