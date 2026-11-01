import { BrowserWindow } from 'electron';
import { getDb } from '../db/localDb.js';
import { LAN_KEY_HEADER, getLanPairingKey } from '../services/lanPairing.js';
import { syncState } from './syncState.js';
import { calculateEffectiveCloudAccess } from './cloudAccess.js';
import { CURSOR_REPLAY_SECONDS, FETCH_TIMEOUT_MS, PULL_MAX_PAGES, PULL_MAX_RETRIES, PULL_PAGE_SIZE, getAuthConfig, toSqliteDate } from './syncConfig.js';
import { notifyOnlineStatus } from './syncProgress.js';
import * as syncTransportSql from '../db/statements/sync/syncTransport.js';
import { withSyncApplyGuard } from '../db/statements/outbox.js';

/** Outbox bookkeeping columns (migration 002). They stay local until the pusher switches to the outbox
 * (docs/architecture/07-sync-outbox-design.md, rollout step 4), so push bodies keep their pre-outbox shape. */
const LOCAL_ONLY_SYNC_KEYS = new Set(['row_version', 'origin']);

/** JSON body of a sync push, without the local-only outbox columns (at any depth: items travel inside parents). */
export function syncPushBody(body: Record<string, unknown>): string {
  return JSON.stringify(body, (key, value) => (LOCAL_ONLY_SYNC_KEYS.has(key) ? undefined : value));
}

/** Sync transport: LAN / cloud endpoints and connectivity, fetch with fallback, batched push with outbox reconciliation, pull cursors and paginated pulls. */
export interface SyncEndpoints {
  primaryUrl: string;
  fallbackUrl?: string;
  primaryRoute: 'LAN' | 'CLOUD';
  fallbackRoute?: 'CLOUD';
  disabled?: boolean;
  isLanPrimary?: boolean;
}

export function getSyncEndpoints(): SyncEndpoints {
  // Cloud API URL — set VENDORA_CLOUD_API in .env (required; no hardcoded fallback)
  const defaultCloud = (process.env.VENDORA_CLOUD_API || process.env.NAFID_CLOUD_API || process.env.VITE_CLOUD_API || '').replace(/\/$/, '');
  try {
    const db = getDb();
    const config = getAuthConfig();
    const tenantId = config?.tenant_id || 'global';
    const row = syncTransportSql.selectSettings(db).get(tenantId) as { value: string } | undefined;
    if (row?.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (parsed.syncMode === 'LAN' && parsed.lanRole === 'PRIMARY') {
        const port = Number(parsed.lanPort) || 3888;
        return {
          primaryUrl: `http://127.0.0.1:${port}`,
          primaryRoute: 'LAN',
          isLanPrimary: true,
        };
      }
      if (parsed.syncMode === 'HYBRID' && parsed.lanRole === 'PRIMARY') {
        return {
          primaryUrl: defaultCloud,
          primaryRoute: 'CLOUD',
          isLanPrimary: true,
        };
      }
      if ((parsed.syncMode === 'LAN' || parsed.syncMode === 'HYBRID') && parsed.lanRole === 'SECONDARY' && parsed.lanHostIp) {
        const cleanHost = String(parsed.lanHostIp).trim().replace(/^https?:\/\//i, '').replace(/:\d+$/, '').replace(/\/.*$/, '');
        const isHybrid = parsed.syncMode === 'HYBRID';
        return {
          primaryUrl: `http://${cleanHost}:${parsed.lanPort || 3888}`,
          fallbackUrl: isHybrid ? defaultCloud : undefined,
          primaryRoute: 'LAN',
          fallbackRoute: isHybrid ? 'CLOUD' : undefined,
        };
      }
    }
  } catch {
    // fallback to default cloud API
  }
  return {
    primaryUrl: defaultCloud,
    primaryRoute: 'CLOUD',
  };
}

export async function checkSyncConnectivity(): Promise<{ ok: boolean; route?: 'LAN' | 'CLOUD'; reason?: string }> {
  const endpoints = getSyncEndpoints();
  if (endpoints.disabled) {
    notifyOnlineStatus(false, 'NONE');
    return { ok: false };
  }

  const effective = calculateEffectiveCloudAccess();

  // If primary route is CLOUD but Cloud access is disabled by Super Admin / schedule
  if (endpoints.primaryRoute === 'CLOUD' && !effective.isCloudAllowed) {
    notifyOnlineStatus(false, 'NONE');
    return { ok: false, reason: effective.activeReason };
  }

  try {
    const res = await fetch(endpoints.primaryUrl + '/health', { method: 'GET', signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      notifyOnlineStatus(true, endpoints.primaryRoute);
      return { ok: true, route: endpoints.primaryRoute };
    }
  } catch { /* ignore */ }

  if (endpoints.fallbackUrl && effective.isCloudAllowed) {
    try {
      const res = await fetch(endpoints.fallbackUrl + '/health', { method: 'GET', signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        notifyOnlineStatus(true, endpoints.fallbackRoute);
        return { ok: true, route: endpoints.fallbackRoute };
      }
    } catch { /* ignore */ }
  }

  // Fallback check for local LAN Master running locally on PC 1 (LAN sync ALWAYS available regardless of cloud status)
  try {
    const db = getDb();
    const config = getAuthConfig();
    const tenantId = config?.tenant_id || 'global';
    const row = syncTransportSql.selectSettings(db).get(tenantId) as { value: string } | undefined;
    if (row?.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if ((parsed.syncMode === 'LAN' || parsed.syncMode === 'HYBRID') && parsed.lanRole === 'PRIMARY') {
        const port = Number(parsed.lanPort) || 3888;
        const res = await fetch(`http://127.0.0.1:${port}/health`, { method: 'GET', signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          notifyOnlineStatus(true, 'LAN');
          return { ok: true, route: 'LAN' };
        }
      }
    }
  } catch { /* ignore */ }

  notifyOnlineStatus(false, 'NONE');
  return { ok: false };
}

export function getSyncTargetLabel(): string {
  return syncState.currentActiveRoute === 'LAN' ? 'Local Wi-Fi Host (LAN)' : 'Cloud API';
}

export function getSyncPrefix(): string {
  if (syncState.currentActiveRoute === 'LAN') return '[SyncWorker - LAN]';
  if (syncState.currentActiveRoute === 'CLOUD') return '[SyncWorker - CLOUD]';
  return '[SyncWorker]';
}

export async function fetchWithFallback(
  urlPath: string,
  options: RequestInit & { signal?: AbortSignal | null } = {}
): Promise<{ response: Response; activeUrl: string; activeRoute: 'LAN' | 'CLOUD' }> {
  const endpoints = getSyncEndpoints();

  // Primary request attempt (LAN requests carry the shop pairing key; it is never sent to the cloud)
  try {
    const primaryFullUrl = urlPath.startsWith('http') ? urlPath : `${endpoints.primaryUrl}${urlPath}`;
    const primaryOptions = endpoints.primaryRoute === 'LAN'
      ? { ...options, headers: { ...(options.headers as Record<string, string> | undefined), [LAN_KEY_HEADER]: getLanPairingKey() } }
      : options;
    const res = await fetch(primaryFullUrl, primaryOptions);
    syncState.currentActiveRoute = endpoints.primaryRoute;
    return { response: res, activeUrl: endpoints.primaryUrl, activeRoute: endpoints.primaryRoute };
  } catch (primaryErr) {
    const isNetworkError = (primaryErr as Error).name === 'TimeoutError' || 
                           (primaryErr as Error).message?.includes('timeout') || 
                           (primaryErr as Error).message?.includes('aborted') || 
                           (primaryErr as Error).message?.includes('fetch failed') || 
                           (primaryErr as Error).message?.includes('ENOTFOUND') || 
                           (primaryErr as Error).message?.includes('ECONNREFUSED') ||
                           (primaryErr as Error).message?.includes('EHOSTUNREACH');

    if (endpoints.fallbackUrl && isNetworkError) {
      console.warn(`[SyncWorker] Primary endpoint (${endpoints.primaryUrl}) unreachable (${(primaryErr as Error).message}). Retrying on Cloud API Fallback (${endpoints.fallbackUrl})...`);
      try {
        let fallbackFullUrl = urlPath;
        if (!urlPath.startsWith('http')) {
          fallbackFullUrl = `${endpoints.fallbackUrl}${urlPath}`;
        } else if (urlPath.startsWith(endpoints.primaryUrl)) {
          fallbackFullUrl = urlPath.replace(endpoints.primaryUrl, endpoints.fallbackUrl);
        }
        const res = await fetch(fallbackFullUrl, options);
        syncState.currentActiveRoute = endpoints.fallbackRoute!;
        notifyOnlineStatus(true, 'CLOUD');
        return { response: res, activeUrl: endpoints.fallbackUrl, activeRoute: endpoints.fallbackRoute! };
      } catch (fallbackErr: unknown) {
        syncState.currentActiveRoute = 'NONE';
        notifyOnlineStatus(false);
        throw fallbackErr;
      }
    }

    syncState.currentActiveRoute = 'NONE';
    notifyOnlineStatus(false);
    throw primaryErr;
  }
}

export async function clearAuthAndNotify() {
  const endpoints = getSyncEndpoints();
  if (endpoints.primaryRoute === 'LAN') {
    console.warn('[SyncWorker] ℹ️ Local LAN mode is active. Preserving sync worker state despite cloud auth error.');
    return;
  }
  syncState.isSyncActive = false;
  if (syncState.syncCycleTimerId) {
    clearTimeout(syncState.syncCycleTimerId);
    syncState.syncCycleTimerId = null;
  }
  if (!syncState.authExpiredNotified) {
    syncState.authExpiredNotified = true;
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      console.warn('[SyncWorker] ⚠️ Auth token expired or unauthorized. Pausing cloud sync loop and notifying UI (local POS remains active).');
      win.webContents.send('auth:token-expired');
    }
  }
}

// ── Batch push helper with retries ───────────────────────────────────────────────
export async function pushBatch<T>(
  url: string,
  token: string,
  batch: T[],
  bodyKey: string,
  label: string,
): Promise<string[]> {
  if (!syncState.isSyncActive) return [];
  if (batch.length === 0) return [];

  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { response } = await fetchWithFallback(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: syncPushBody({ [bodyKey]: batch }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        if (response.status === 401) {
          if (syncState.currentActiveRoute === 'CLOUD') {
            console.error(`[SyncWorker] ${label} failed: HTTP 401 (token expired). Clearing auth...`);
            await clearAuthAndNotify();
          } else {
            console.warn(`[SyncWorker] ${label} received 401 from ${syncState.currentActiveRoute}. Skipping auth reset.`);
          }
          return [];
        }
        let errDetail = '';
        try {
          errDetail = await response.text();
        } catch { /* ignore */ }
        console.error(`${getSyncPrefix()} ${label} batch failed: HTTP ${response.status}${errDetail ? ` — ${errDetail.slice(0, 300)}` : ''}`);
        return [];
      }

      const result: { synced: string[]; failed: { error: string }[]; synced_count?: number; failed_count?: number } = await response.json();
      if (result.synced?.length > 0) {
        console.log(`${getSyncPrefix()} ${label}: ${result.synced_count ?? result.synced.length} synced, ${result.failed_count ?? 0} failed.`);
      } else if (result.failed?.length > 0) {
        console.log(`${getSyncPrefix()} ${label}: 0 synced, ${result.failed_count ?? result.failed.length} failed. First error: ${result.failed[0].error}`);
      }
      return result.synced || [];
    } catch (err) {
      const isTimeout = (err as Error).name === 'TimeoutError' || (err as Error).message?.includes('timeout') || (err as Error).message?.includes('aborted');
      const isNetworkError = (err as Error).message?.includes('fetch failed') || (err as Error).message?.includes('ENOTFOUND') || (err as Error).message?.includes('ECONNREFUSED');

      if (attempt < MAX_RETRIES && (isTimeout || isNetworkError)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[SyncWorker] ${label} attempt ${attempt}/${MAX_RETRIES} failed (${(err as Error).message}). Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      console.error(`[SyncWorker] ${label} batch error after ${attempt} attempt(s): ${(err as Error).message}`);
      return [];
    }
  }

  return [];
}

// ── Reconcile helper ────────────────────────────────────────────────────────────
export function reconcilePending(
  db: import('better-sqlite3').Database,
  table: string,
  idColumn: string,
  cloudRows: Record<string, unknown>[],
  tsColumn: string = 'updated_at'
): number {
  if (cloudRows.length === 0) return 0;

  let updateStmt: import('better-sqlite3').Statement;
  try {
    updateStmt = syncTransportSql.markSyncedIfUnchanged(db, table, idColumn, tsColumn);
  } catch {
    updateStmt = syncTransportSql.markSynced(db, table, idColumn);
  }

  let count = 0;
  for (const row of cloudRows) {
    try {
      const tsVal = row[tsColumn] || row.updated_at || row.created_at;
      const result = updateStmt.run(row[idColumn], toSqliteDate((tsVal as string | number | Date | null | undefined)));
      if (result.changes > 0) count++;
    } catch {
      try {
        const fallbackStmt = syncTransportSql.markSynced(db, table, idColumn);
        const result = fallbackStmt.run(row[idColumn]);
        if (result.changes > 0) count++;
      } catch { /* ignore */ }
    }
  }
  return count;
}

// ── Sync metadata (per-tenant pull cursors) ─────────────────────────────────────
export const cursorKey = (tenantId: string, table: string) => `pull_cursor:${tenantId}:${table}`;

export function getMeta(key: string): string | null {
  try {
    const row = syncTransportSql.selectSyncMeta(getDb()).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export function setMeta(key: string, value: string) {
  try {
    syncTransportSql.insertSyncMeta(getDb()).run(key, value);
  } catch (err) {
    console.error('[SyncWorker] Failed to persist sync meta:', (err as Error).message);
  }
}

// Walk the cursor back a few seconds so rows written in the same instant as the
// cursor (or with identical timestamps) are re-fetched and reconciled idempotently.
export function replaySince(cursor: string | null): string | null {
  if (!cursor) return null;
  const str = cursor.trim();
  try {
    const d = new Date(str.includes('Z') || str.includes('+') ? str : str.replace(' ', 'T') + 'Z');
    if (!isNaN(d.getTime())) {
      const rewound = new Date(d.getTime() - CURSOR_REPLAY_SECONDS * 1000);
      return rewound.toISOString();
    }
  } catch { /* ignore */ }
  return str;
}

// Cache of per-table content hashes to prevent duplicate log spam when fetched data is unchanged
export const tableContentHashes: Record<string, string> = {};

// ── Generic paginated + delta pull (Cloud → Edge) ───────────────────────────────
// Fetches a table in pages of `pageSize`, passing each page to `processPage`
// (which performs the table-specific upsert inside its own transaction), tracks
// the newest timestamp seen as the per-table cursor, and only requests rows
// modified after `cursor` on subsequent cycles. First sync on a
// fresh device has no cursor and therefore performs a full paginated download.
export async function pullPaginated(opts: {
  token: string;
  tenantId: string;
  table: string;
  urlPath: string;
  label: string;
  pageSize?: number;
  tsColumn?: 'updated_at' | 'created_at';
  onProgress?: (fetched: number) => void;
  processPage: (rows: Record<string, unknown>[]) => number;
}): Promise<{ count: number; reconciled: number; failed: boolean; hasChanged: boolean }> {
  if (!syncState.isSyncActive) return { count: 0, reconciled: 0, failed: true, hasChanged: false };
  const pageSize = opts.pageSize ?? PULL_PAGE_SIZE;
  const tsColumn = opts.tsColumn ?? 'updated_at';
  const since = replaySince(getMeta(cursorKey(opts.tenantId, opts.table)));
  let offset = 0;
  let count = 0;
  let reconciled = 0;
  let maxTs: string | null = null;
  let failed = false;
  let hasChanged = false;
  const fetchedRowSignatures: string[] = [];

  const fetchPage = async (offsetVal: number): Promise<Record<string, unknown>[] | null> => {
    if (!syncState.isSyncActive) return null;
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offsetVal) });
    if (since) params.set('since', since);
    for (let attempt = 1; attempt <= PULL_MAX_RETRIES; attempt++) {
      try {
        const { response } = await fetchWithFallback(`${opts.urlPath}?${params.toString()}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${opts.token}` },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) {
          if (response.status === 401) {
            if (syncState.currentActiveRoute === 'CLOUD') {
              console.error(`[SyncWorker] Pull ${opts.label} failed: HTTP 401 (token expired/unauthorized). Clearing auth and notifying user to re-login...`);
              await clearAuthAndNotify();
            } else {
              console.warn(`[SyncWorker] Pull ${opts.label} received 401 from ${syncState.currentActiveRoute}. Skipping auth reset.`);
            }
            return null;
          }
          console.error(`[SyncWorker] Pull ${opts.label} failed: HTTP ${response.status}`);
          return null;
        }
        const data = await response.json();
        const rows = Array.isArray(data)
          ? data
          : (data[opts.table] || data.data || data.items || data.rows || []);
        return Array.isArray(rows) ? rows : [];
      } catch (err) {
        const isTimeout = (err as Error).name === 'TimeoutError' || (err as Error).message?.includes('timeout') || (err as Error).message?.includes('aborted');
        const isNetwork = (err as Error).message?.includes('fetch failed') || (err as Error).message?.includes('ENOTFOUND') || (err as Error).message?.includes('ECONNREFUSED');
        if (attempt < PULL_MAX_RETRIES && (isTimeout || isNetwork)) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          console.log(`[SyncWorker] Pull ${opts.label} page ${attempt}/${PULL_MAX_RETRIES} failed (${(err as Error).message}). Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        console.error(`[SyncWorker] Pull ${opts.label} failed: ${(err as Error).message}`);
        return null;
      }
    }
    return null;
  };

  for (let page = 0; page < PULL_MAX_PAGES; page++) {
    const rows = await fetchPage(offset);
    if (rows === null) {
      failed = true;
      break;
    }
    if (rows.length === 0) break;

    reconciled += withSyncApplyGuard(getDb(), () => opts.processPage(rows));
    count += rows.length;
    for (const r of rows) {
      const ts = r?.[tsColumn] || r?.updated_at || r?.created_at;
      if (ts) {
        const rawTs = String(ts).trim();
        if (!maxTs || rawTs > maxTs) maxTs = rawTs;
      }

      // Create clean row signature (ignoring volatile server timestamps)
      const { updated_at, created_at, opened_at, ...clean } = r || {};
      fetchedRowSignatures.push(JSON.stringify(clean));
    }
    opts.onProgress?.(count);

    // A page shorter than requested is the last one. A page *longer* than
    // requested means the server ignored pagination (old server) — consume it
    // once and stop rather than looping forever over the same data.
    if (rows.length !== pageSize) break;
    offset += pageSize;
  }

  // ── DEBUG: Log pull result for every table ─────────────────────────────────
  console.log(`[SyncWorker][pull:${opts.table}] count=${count} reconciled=${reconciled} failed=${failed} since=${since || 'FULL'}`);

  if (count > 0) {
    const combinedHash = fetchedRowSignatures.join('|');
    const previousHash = tableContentHashes[opts.table];
    if (previousHash && previousHash === combinedHash && reconciled === 0) {
      console.log(`[SyncWorker][pull:${opts.table}] ℹ️ ${count} rows fetched, but content matches previous pull → no net change.`);
      hasChanged = false;
    } else {
      hasChanged = true;
      tableContentHashes[opts.table] = combinedHash;
      console.log(`[SyncWorker][pull:${opts.table}] ✅ ${count} rows fetched → marking hasChanged=true`);
    }
  } else {
    console.log(`[SyncWorker][pull:${opts.table}] ℹ️ 0 rows fetched (delta is empty or table fully up-to-date)`);
  }

  if (maxTs && count > 0 && !failed) {
    const newCursor = maxTs;
    setMeta(cursorKey(opts.tenantId, opts.table), newCursor);
    console.log(`[SyncWorker][pull:${opts.table}] Cursor updated to: ${newCursor}`);
  }
  return { count, reconciled, failed, hasChanged: (hasChanged || reconciled > 0) && !failed };
}

export interface SyncEndpoints {
  primaryUrl: string;
  fallbackUrl?: string;
  primaryRoute: 'LAN' | 'CLOUD';
  fallbackRoute?: 'CLOUD';
  disabled?: boolean;
  isLanPrimary?: boolean;
}
