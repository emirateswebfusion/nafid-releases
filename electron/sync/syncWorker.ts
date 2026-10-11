import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, safeStorage, type WebContents } from 'electron';
import { getDb } from '../db/localDb.js';

function localTimestamp(d: Date | string | number = new Date()): string {
  const dateObj = d instanceof Date ? d : new Date(d);
  return isNaN(dateObj.getTime()) ? new Date().toISOString() : dateObj.toISOString();
}
function localDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function parseCleanDate(dStr: any): string {
  if (!dStr) return localDate();
  const str = String(dStr).trim();

  // 1. Match YYYY-MM-DD or YYYY/MM/DD at start
  const yyyymmdd = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (yyyymmdd) {
    return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;
  }

  // 2. Match DD-MM-YYYY or DD/MM/YYYY at start
  const ddmmyyyy = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }

  let formatted = str;
  if (formatted.includes(' ')) formatted = formatted.replace(' ', 'T');

  const d = new Date(formatted);
  if (!isNaN(d.getTime())) return localDate(d);
  return str.slice(0, 10);
}

const getConfigPath = () => path.join(app.getPath('userData'), 'config.json');
const getEncryptedPath = () => path.join(app.getPath('userData'), 'auth.enc');

function decrypt(data: Buffer): string | null {
  if (!safeStorage.isEncryptionAvailable()) return data.toString('utf-8');
  try {
    return safeStorage.decryptString(data);
  } catch {
    return null;
  }
}

function readAuthPayload(): any {
  const encPath = getEncryptedPath();
  if (fs.existsSync(encPath)) {
    const raw = fs.readFileSync(encPath);
    const decrypted = decrypt(raw);
    if (decrypted) return JSON.parse(decrypted);
  }
  const p = getConfigPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

const BATCH_SIZE = 20;
const FETCH_TIMEOUT_MS = 300000;
const PULL_PAGE_SIZE = 500;
const PULL_CONCURRENCY = 4;
const PULL_MAX_RETRIES = 3;
const PULL_MAX_PAGES = 50;
const CURSOR_REPLAY_SECONDS = 5;
let syncInProgress = false;
let syncPromise: Promise<void> | null = null;

const isGstApplicableProduct = (gstFlag: unknown, hsnCode: unknown): boolean => {
  const hasHsnCode = String(hsnCode ?? '').trim() !== '';
  const isExplicitlyGst = gstFlag === undefined || gstFlag === null || gstFlag === true || gstFlag === 'true' || Number(gstFlag) === 1;
  return hasHsnCode || isExplicitlyGst;
};
let currentSyncProgress: { percent: number; label: string; recordsSynced: number; totalRecords: number } | null = null;
let isSyncActive = false;

export function setSyncActive(active: boolean) {
  isSyncActive = active;
  console.log(`[SyncWorker] Sync active state changed to: ${active}`);
}

function getTotalPendingRecords(db: any, tenantId: string): number {
  const tables = ['products', 'invoices', 'product_grades', 'pricing_tiers', 'product_pricing', 'parties', 'party_ledger', 'scrap_categories', 'scrap_transactions', 'purchase_bills', 'purchase_bill_items', 'cash_drawer', 'cash_transactions', 'cashier_audit_log', 'cash_categories', 'returns', 'return_items', 'combo_offers', 'quotations', 'quotation_items', 'staff', 'staff_salaries', 'staff_transactions', 'staff_ledger', 'staff_attendance'];
  const unionQueries = tables.map(t => `SELECT COUNT(*) as cnt FROM ${t} WHERE sync_status = 'PENDING' AND tenant_id = ?`).join(' UNION ALL ');
  const rows = db.prepare(unionQueries).all(...tables.map(() => tenantId)) as { cnt: number }[];
  return rows.reduce((sum, r) => sum + r.cnt, 0);
}

export interface CloudScheduleWindow {
  id: string;
  startTime: string; // "HH:MM" e.g. "09:00"
  endTime: string;   // "HH:MM" e.g. "17:00"
  daysOfWeek?: number[]; // [0..6] (0 = Sunday) or undefined/empty = all days
  enabled: boolean;
}

export interface CloudAccessConfig {
  cloud_access_enabled: boolean;
  cloud_schedule_enabled: boolean;
  cloud_schedules: CloudScheduleWindow[];
  cloud_manual_override: 'AUTO' | 'FORCE_ON' | 'FORCE_OFF';
}

export interface EffectiveCloudState {
  isCloudAllowed: boolean;
  stateName: 'LOCAL_ONLY' | 'LOCAL_PLUS_CLOUD' | 'LOCAL_WITH_PENDING_CLOUD_QUEUE';
  activeReason: string;
  pendingCount: number;
  config: CloudAccessConfig;
}

export function getCloudAccessConfig(tenantId?: string): CloudAccessConfig {
  try {
    const db = getDb();
    const tid = tenantId || getAuthConfig()?.tenant_id || 'global';
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'cloud_access_config' AND (tenant_id = ? OR tenant_id = 'global') LIMIT 1`).get(tid) as { value: string } | undefined;
    if (row?.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      return {
        cloud_access_enabled: parsed.cloud_access_enabled !== false,
        cloud_schedule_enabled: !!parsed.cloud_schedule_enabled,
        cloud_schedules: Array.isArray(parsed.cloud_schedules) ? parsed.cloud_schedules : [],
        cloud_manual_override: parsed.cloud_manual_override || 'AUTO',
      };
    }
  } catch {}
  return {
    cloud_access_enabled: true,
    cloud_schedule_enabled: false,
    cloud_schedules: [],
    cloud_manual_override: 'AUTO',
  };
}

export function updateCloudAccessConfig(configUpdate: Partial<CloudAccessConfig>, tenantId?: string): CloudAccessConfig {
  const db = getDb();
  const tid = tenantId || getAuthConfig()?.tenant_id || 'global';
  const existing = getCloudAccessConfig(tid);
  const updated: CloudAccessConfig = {
    cloud_access_enabled: configUpdate.cloud_access_enabled !== undefined ? configUpdate.cloud_access_enabled : existing.cloud_access_enabled,
    cloud_schedule_enabled: configUpdate.cloud_schedule_enabled !== undefined ? configUpdate.cloud_schedule_enabled : existing.cloud_schedule_enabled,
    cloud_schedules: Array.isArray(configUpdate.cloud_schedules) ? configUpdate.cloud_schedules.slice(0, 24) : existing.cloud_schedules,
    cloud_manual_override: configUpdate.cloud_manual_override || existing.cloud_manual_override,
  };

  try {
    db.prepare(`
      INSERT INTO settings (tenant_id, key, value, updated_at)
      VALUES (?, 'cloud_access_config', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
    `).run(tid, JSON.stringify(updated));
    console.log(`[SyncWorker] Updated cloud_access_config for tenant ${tid}:`, updated);
  } catch (err: any) {
    console.error('[SyncWorker] Error updating cloud_access_config:', err.message);
  }

  const effective = calculateEffectiveCloudAccess(tid);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('sync:cloud-state-changed', effective);
  }
  return updated;
}

let lastCloudAllowedState: boolean | null = null;

export function calculateEffectiveCloudAccess(tenantId?: string): EffectiveCloudState {
  const db = getDb();
  const tid = tenantId || getAuthConfig()?.tenant_id || 'global';
  const config = getCloudAccessConfig(tid);
  const pendingCount = tid ? getTotalPendingRecords(db, tid) : 0;

  let isCloudAllowed = true;
  let activeReason = 'Cloud access enabled by Super Admin';

  if (!config.cloud_access_enabled) {
    isCloudAllowed = false;
    activeReason = 'Cloud access disabled by Super Admin';
  } else if (config.cloud_manual_override === 'FORCE_OFF') {
    isCloudAllowed = false;
    activeReason = 'Cloud access manually overridden to OFF';
  } else if (config.cloud_manual_override === 'FORCE_ON') {
    isCloudAllowed = true;
    activeReason = 'Cloud access manually overridden to ON';
  } else if (config.cloud_schedule_enabled && config.cloud_schedules.length > 0) {
    const now = new Date();
    const currentDay = now.getDay(); // 0..6
    const pad = (n: number) => String(n).padStart(2, '0');
    const currentHHMM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    let matchedWindow: CloudScheduleWindow | null = null;

    for (const win of config.cloud_schedules) {
      if (!win.enabled) continue;
      if (win.daysOfWeek && win.daysOfWeek.length > 0 && !win.daysOfWeek.includes(currentDay)) {
        continue;
      }
      const { startTime, endTime } = win;
      if (startTime <= endTime) {
        if (currentHHMM >= startTime && currentHHMM <= endTime) {
          matchedWindow = win;
          break;
        }
      } else {
        // Midnight crossing e.g. 22:00 to 04:00
        if (currentHHMM >= startTime || currentHHMM <= endTime) {
          matchedWindow = win;
          break;
        }
      }
    }

    if (matchedWindow) {
      isCloudAllowed = true;
      activeReason = `Active schedule window (${matchedWindow.startTime} - ${matchedWindow.endTime})`;
    } else {
      isCloudAllowed = false;
      activeReason = 'Outside scheduled Cloud access windows';
    }
  }

  // Detect state transition from OFF -> ON to auto-drain queue
  if (lastCloudAllowedState === false && isCloudAllowed === true) {
    console.log('[SyncWorker] ⚡ Cloud access re-enabled (OFF -> ON transition detected). Triggering background queue drain...');
    setTimeout(() => {
      drainPendingCloudQueue().catch(() => {});
    }, 1000);
  }
  lastCloudAllowedState = isCloudAllowed;

  let stateName: 'LOCAL_ONLY' | 'LOCAL_PLUS_CLOUD' | 'LOCAL_WITH_PENDING_CLOUD_QUEUE';
  if (!isCloudAllowed) {
    stateName = pendingCount > 0 ? 'LOCAL_WITH_PENDING_CLOUD_QUEUE' : 'LOCAL_ONLY';
  } else {
    stateName = 'LOCAL_PLUS_CLOUD';
  }

  return {
    isCloudAllowed,
    stateName,
    activeReason,
    pendingCount,
    config,
  };
}

const SYNC_PHASES = [
  'Checking connection...',
  'Uploading grades...',
  'Uploading pricing tiers...',
  'Uploading product pricing...',
  'Uploading products...',
  'Uploading invoices...',
  'Uploading settings...',
  'Uploading parties...',
  'Uploading ledger entries...',
  'Uploading scrap categories...',
  'Uploading scrap transactions...',
  'Uploading purchase bills...',
  'Uploading cash drawer...',
  'Uploading cash transactions...',
  'Uploading combo offers...',
  'Uploading quotations...',
  'Updating grades...',
  'Updating pricing tiers...',
  'Updating product pricing...',
  'Updating products...',
  'Updating invoices...',
  'Updating users...',
  'Updating settings...',
  'Updating parties...',
  'Updating ledger entries...',
  'Updating scrap categories...',
  'Updating scrap transactions...',
  'Updating purchase bills...',
  'Updating cash drawer...',
  'Uploading returns...',
  'Updating returns...',
  'Updating combo offers...',
  'Updating quotations...',
];

function getWebContents(sender?: WebContents): WebContents | null {
  if (sender) return sender;
  const win = BrowserWindow.getAllWindows()[0];
  return win?.webContents ?? null;
}

function notifyProgress(phaseIndex: number, sender?: WebContents, recordsSynced?: number, totalRecords?: number) {
  if (phaseIndex >= 0 && phaseIndex < SYNC_PHASES.length) {
    const percent = Math.round(((phaseIndex + 1) / SYNC_PHASES.length) * 100);
    const db = getDb();
    const config = getAuthConfig();
    const tenantId = config?.tenant_id;
    const remaining = tenantId ? getTotalPendingRecords(db, tenantId) : 0;
    const synced = totalRecords !== undefined ? totalRecords - remaining : (recordsSynced ?? 0);
    const total = totalRecords ?? remaining + synced;
    currentSyncProgress = { percent, label: SYNC_PHASES[phaseIndex], recordsSynced: synced, totalRecords: total };
    if (sender && !sender.isDestroyed()) {
      sender.send('sync:progress', currentSyncProgress);
    }
  }
}

// Percent-driven progress used during the parallel pull phase, where per-table
// phase indices would otherwise bounce around as tables finish out of order.
function notifyPercent(percent: number, label: string, sender?: WebContents, recordsSynced?: number, totalRecords?: number) {
  currentSyncProgress = {
    percent: Math.min(100, Math.max(0, Math.round(percent))),
    label,
    recordsSynced: recordsSynced ?? 0,
    totalRecords: totalRecords ?? 0,
  };
  if (sender && !sender.isDestroyed()) {
    sender.send('sync:progress', currentSyncProgress);
  }
}

export function getSyncProgress(): { percent: number; label: string; recordsSynced: number; totalRecords: number } | null {
  return currentSyncProgress;
}

function notifyRenderer(reason?: string) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    console.log(`[SyncWorker] 🔔 Notifying renderer (sync:data-updated)${reason ? ` — reason: ${reason}` : ''}`);
    win.webContents.send('sync:data-updated');
  } else {
    console.warn('[SyncWorker] ⚠️ No BrowserWindow found — renderer notification skipped!');
  }
}

function notifyCycleComplete(sender?: WebContents) {
  if (sender && !sender.isDestroyed()) {
    sender.send('sync:cycle-complete');
  }
}

function toSqliteDate(iso: string | number | Date | null | undefined): string {
  if (!iso) return localTimestamp();
  if (iso instanceof Date) return localTimestamp(iso);
  if (typeof iso === 'number') return localTimestamp(new Date(iso));

  const str = String(iso).trim();
  if (!str) return localTimestamp();

  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch {}

  return str;
}

export function getSyncIntervalMs(): number {
  try {
    const db = getDb();
    const config = getAuthConfig();
    const tenantId = config?.tenant_id || 'global';
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'network_sync_config' AND (tenant_id = ? OR tenant_id = 'global') LIMIT 1`).get(tenantId) as { value: string } | undefined;
    if (row?.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (parsed.syncFrequency === 'HIGH') return 15000;
      if (parsed.syncFrequency === 'BALANCED') return 30000;
      if (parsed.syncFrequency === 'NORMAL') return 60000;
    }
    const pendingCount = getTotalPendingRecords(db, tenantId);
    if (pendingCount > 0) {
      return 15000;
    }
  } catch {}
  const envMins = parseFloat(process.env.VENDORA_SYNC_INTERVAL_MINUTES || '2.0');
  return Math.max(30000, Math.round(envMins * 60 * 1000));
}

let currentActiveRoute: 'LAN' | 'CLOUD' | 'NONE' = 'NONE';

function notifyOnlineStatus(online: boolean, route?: 'LAN' | 'CLOUD' | 'NONE') {
  if (route) currentActiveRoute = online ? route : 'NONE';
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('sync:online-status', online, route || (online ? currentActiveRoute : 'NONE'));
  }
}

export interface SyncEndpoints {
  primaryUrl: string;
  fallbackUrl?: string;
  primaryRoute: 'LAN' | 'CLOUD';
  fallbackRoute?: 'CLOUD';
  disabled?: boolean;
}

export interface SyncEndpoints {
  primaryUrl: string;
  fallbackUrl?: string;
  primaryRoute: 'LAN' | 'CLOUD';
  fallbackRoute?: 'CLOUD';
  disabled?: boolean;
}

export function getSyncEndpoints(): SyncEndpoints {
  // Cloud API URL — set VENDORA_CLOUD_API in .env (required; no hardcoded fallback)
  const defaultCloud = (process.env.VENDORA_CLOUD_API || process.env.NAFID_CLOUD_API || process.env.VITE_CLOUD_API || '').replace(/\/$/, '');
  try {
    const db = getDb();
    const config = getAuthConfig();
    const tenantId = config?.tenant_id || 'global';
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'network_sync_config' AND (tenant_id = ? OR tenant_id = 'global') LIMIT 1`).get(tenantId) as { value: string } | undefined;
    if (row?.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (parsed.syncMode === 'LAN' && parsed.lanRole === 'PRIMARY') {
        const port = Number(parsed.lanPort) || 3888;
        return {
          primaryUrl: `http://127.0.0.1:${port}`,
          primaryRoute: 'LAN',
        };
      }
      if (parsed.syncMode === 'HYBRID' && parsed.lanRole === 'PRIMARY') {
        return {
          primaryUrl: defaultCloud,
          primaryRoute: 'CLOUD',
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
  } catch {}

  if (endpoints.fallbackUrl && effective.isCloudAllowed) {
    try {
      const res = await fetch(endpoints.fallbackUrl + '/health', { method: 'GET', signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        notifyOnlineStatus(true, endpoints.fallbackRoute);
        return { ok: true, route: endpoints.fallbackRoute };
      }
    } catch {}
  }

  // Fallback check for local LAN Master running locally on PC 1 (LAN sync ALWAYS available regardless of cloud status)
  try {
    const db = getDb();
    const config = getAuthConfig();
    const tenantId = config?.tenant_id || 'global';
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'network_sync_config' AND (tenant_id = ? OR tenant_id = 'global') LIMIT 1`).get(tenantId) as { value: string } | undefined;
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
  } catch {}

  notifyOnlineStatus(false, 'NONE');
  return { ok: false };
}

function getCloudApiBase() {
  return getSyncEndpoints().primaryUrl;
}

export function getSyncTargetLabel(): string {
  return currentActiveRoute === 'LAN' ? 'Local Wi-Fi Host (LAN)' : 'Cloud API';
}

export function getSyncPrefix(): string {
  if (currentActiveRoute === 'LAN') return '[SyncWorker - LAN]';
  if (currentActiveRoute === 'CLOUD') return '[SyncWorker - CLOUD]';
  return '[SyncWorker]';
}

function getRouteTag(): string {
  if (currentActiveRoute === 'LAN') return `[Local LAN Sync - ${localTimestamp()}]`;
  if (currentActiveRoute === 'CLOUD') return `[Cloud API Sync - ${localTimestamp()}]`;
  return `[Local Sync - ${localTimestamp()}]`;
}

async function fetchWithFallback(
  urlPath: string,
  options: RequestInit & { signal?: any } = {}
): Promise<{ response: Response; activeUrl: string; activeRoute: 'LAN' | 'CLOUD' }> {
  const endpoints = getSyncEndpoints();

  // Primary request attempt
  try {
    const primaryFullUrl = urlPath.startsWith('http') ? urlPath : `${endpoints.primaryUrl}${urlPath}`;
    const res = await fetch(primaryFullUrl, options);
    currentActiveRoute = endpoints.primaryRoute;
    return { response: res, activeUrl: endpoints.primaryUrl, activeRoute: endpoints.primaryRoute };
  } catch (primaryErr: any) {
    const isNetworkError = primaryErr.name === 'TimeoutError' || 
                           primaryErr.message?.includes('timeout') || 
                           primaryErr.message?.includes('aborted') || 
                           primaryErr.message?.includes('fetch failed') || 
                           primaryErr.message?.includes('ENOTFOUND') || 
                           primaryErr.message?.includes('ECONNREFUSED') ||
                           primaryErr.message?.includes('EHOSTUNREACH');

    if (endpoints.fallbackUrl && isNetworkError) {
      console.warn(`[SyncWorker] Primary endpoint (${endpoints.primaryUrl}) unreachable (${primaryErr.message}). Retrying on Cloud API Fallback (${endpoints.fallbackUrl})...`);
      try {
        let fallbackFullUrl = urlPath;
        if (!urlPath.startsWith('http')) {
          fallbackFullUrl = `${endpoints.fallbackUrl}${urlPath}`;
        } else if (urlPath.startsWith(endpoints.primaryUrl)) {
          fallbackFullUrl = urlPath.replace(endpoints.primaryUrl, endpoints.fallbackUrl);
        }
        const res = await fetch(fallbackFullUrl, options);
        currentActiveRoute = endpoints.fallbackRoute!;
        notifyOnlineStatus(true, 'CLOUD');
        return { response: res, activeUrl: endpoints.fallbackUrl, activeRoute: endpoints.fallbackRoute! };
      } catch (fallbackErr: any) {
        currentActiveRoute = 'NONE';
        notifyOnlineStatus(false);
        throw fallbackErr;
      }
    }

    currentActiveRoute = 'NONE';
    notifyOnlineStatus(false);
    throw primaryErr;
  }
}

function parseIsDeleted(val: any): number {
  if (val === true || val === 1 || val === '1' || val === 'true') return 1;
  return 0;
}

function getAuthConfig(): { jwt_token: string; tenant_id: string } | null {
  try {
    const payload = readAuthPayload();
    if (!payload) return null;
    const { jwt_token, tenant_id, ...rest } = payload;
    return jwt_token && tenant_id ? { jwt_token, tenant_id } : null;
  } catch {
    return null;
  }
}

function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return true;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    return payload.exp ? payload.exp * 1000 < Date.now() : false;
  } catch {
    return true;
  }
}

async function clearAuthAndNotify() {
  isSyncActive = false;
  if (syncCycleTimerId) {
    clearTimeout(syncCycleTimerId);
    syncCycleTimerId = null;
  }
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    console.warn('[SyncWorker] ⚠️ Auth token expired or unauthorized. Pausing cloud sync loop and notifying UI (local POS remains active).');
    win.webContents.send('auth:token-expired');
  }
}

import { startLocalHostServer } from './localHostServer.js';

const FAST_INVOICE_PULL_MS = 3000;
let fastInvoicePullTimerId: NodeJS.Timeout | null = null;
let fastInvoicePullInProgress = false;
let consecutiveFastPullFailures = 0;
let activePageContext: string | null = null;
let syncCycleTimerId: NodeJS.Timeout | null = null;

function getFastPullIntervalMs(): number {
  if (consecutiveFastPullFailures <= 0) return FAST_INVOICE_PULL_MS;
  if (consecutiveFastPullFailures === 1) return 6000;
  if (consecutiveFastPullFailures === 2) return 12000;
  if (consecutiveFastPullFailures === 3) return 30000;
  return 60000;
}

async function triggerFastLightweightBillPull() {
  if (!isSyncActive || activePageContext !== 'cash_settlement' || fastInvoicePullInProgress || syncInProgress) {
    return;
  }
  const effective = calculateEffectiveCloudAccess();
  if (!effective.isCloudAllowed) return;

  const config = getAuthConfig();
  if (config && !isJwtExpired(config.jwt_token)) {
    fastInvoicePullInProgress = true;
    try {
      const res = await pullLightweightPendingBills(config.jwt_token, config.tenant_id);
      if (res.success) {
        consecutiveFastPullFailures = 0;
        if (res.updated) {
          notifyRenderer('fast-invoice-pull-changed');
        }
      } else {
        consecutiveFastPullFailures++;
      }
    } catch {
      consecutiveFastPullFailures++;
    } finally {
      fastInvoicePullInProgress = false;
    }
  }
}

function scheduleNextFastLightweightPull() {
  if (fastInvoicePullTimerId) {
    clearTimeout(fastInvoicePullTimerId);
    fastInvoicePullTimerId = null;
  }
  if (activePageContext !== 'cash_settlement' || !isSyncActive) {
    return;
  }
  const delay = getFastPullIntervalMs();
  fastInvoicePullTimerId = setTimeout(async () => {
    try {
      await triggerFastLightweightBillPull();
    } finally {
      if (activePageContext === 'cash_settlement' && isSyncActive) {
        scheduleNextFastLightweightPull();
      }
    }
  }, delay);
}

export function setPageContext(page: string | null, active: boolean) {
  if (active) {
    activePageContext = page;
  } else if (activePageContext === page) {
    activePageContext = null;
  }
  console.log(`[SyncWorker] Active page context changed to: ${activePageContext || 'none'}`);

  if (activePageContext === 'cash_settlement') {
    if (!fastInvoicePullTimerId) {
      console.log('[SyncWorker] 🟢 Entering Cash Settlement screen — Starting lightweight bill poll timer (3s)');
      consecutiveFastPullFailures = 0;
      triggerFastLightweightBillPull().finally(() => {
        scheduleNextFastLightweightPull();
      });
    }
  } else {
    if (fastInvoicePullTimerId) {
      console.log('[SyncWorker] 🔴 Leaving Cash Settlement screen — Destroying lightweight bill poll timer');
      clearTimeout(fastInvoicePullTimerId);
      fastInvoicePullTimerId = null;
    }
  }
}

function scheduleNextSyncCycle() {
  if (syncCycleTimerId) {
    clearTimeout(syncCycleTimerId);
  }
  const intervalMs = getSyncIntervalMs();
  syncCycleTimerId = setTimeout(async () => {
    if (isSyncActive) {
      try {
        await runSyncCycle();
      } catch (err: any) {
        console.error('[SyncWorker] Background sync error:', err.message);
      }
    }
    scheduleNextSyncCycle();
  }, intervalMs);
}

export function reloadSyncConfig() {
  for (const k in tableContentHashes) {
    delete tableContentHashes[k];
  }
  scheduleNextSyncCycle();
  setTimeout(() => {
    runSyncCycle().catch((e: any) => console.error('[SyncWorker] Immediate sync on reloadSyncConfig error:', e.message));
  }, 500);
}

let isWorkerInitialized = false;

export function initSyncWorker() {
  if (isWorkerInitialized) {
    console.log('[SyncWorker] Background sync worker already initialized. Skipping duplicate initialization.');
    return;
  }
  isWorkerInitialized = true;
  console.log('[SyncWorker] ========= Initializing background sync worker... =========');
  const initialAuth = getAuthConfig();
  if (initialAuth && !isJwtExpired(initialAuth.jwt_token)) {
    isSyncActive = true;
    const tenantId = initialAuth.tenant_id;
    console.log(`[SyncWorker] ✅ Valid auth detected on startup. tenant_id=${tenantId}. Background sync ACTIVATED.`);
    // Immediately run a full sync in background to populate data on secondary terminals
    setTimeout(async () => {
      try {
        console.log('[SyncWorker] 🚀 Running immediate startup sync to populate data...');
        await runSyncCycle();
        notifyRenderer('startup-immediate-sync');
      } catch (e: any) {
        console.error('[SyncWorker] Startup immediate sync error:', e.message);
      }
    }, 3000); // Wait 3s for window to fully load before triggering
  } else if (initialAuth) {
    console.warn('[SyncWorker] ⚠️ Auth payload found but JWT is EXPIRED. Sync NOT activated. User must re-login.');
  } else {
    console.warn('[SyncWorker] ⚠️ No auth payload found on disk. Sync NOT activated (user not logged in).');
  }
  try {
    const db = getDb();
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'network_sync_config' LIMIT 1`).get() as { value: string } | undefined;
    if (row?.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if ((parsed.syncMode === 'LAN' || parsed.syncMode === 'HYBRID') && parsed.lanRole === 'PRIMARY') {
        startLocalHostServer(Number(parsed.lanPort) || 3888);
      }
    }
  } catch (err: any) {
    console.error('[SyncWorker] Failed to check local server startup config:', err.message);
  }

  // 1. Dynamic background sync cycle (configured heartbeat rate)
  scheduleNextSyncCycle();
}

function isCashSettlementFeatureEnabled(): boolean {
  try {
    const db = getDb();
    const config = getAuthConfig();
    const tenantId = config?.tenant_id || 'global';
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'enable_cashier_settlement' AND (tenant_id = ? OR tenant_id = 'global') LIMIT 1`).get(tenantId) as { value: string } | undefined;
    if (row?.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      return parsed !== false && parsed !== 'false' && parsed !== 0;
    }
  } catch {}
  return true;
}

export async function drainPendingCloudQueue(sender?: WebContents): Promise<{ success: boolean; drainedCount: number; message: string }> {
  const effective = calculateEffectiveCloudAccess();
  if (!effective.isCloudAllowed) {
    console.log(`[SyncWorker] Cannot drain pending queue: ${effective.activeReason}`);
    return { success: false, drainedCount: 0, message: effective.activeReason };
  }

  console.log(`[SyncWorker] 🚀 Starting controlled queue drain (${effective.pendingCount} pending records)...`);
  const initialPending = effective.pendingCount;
  await runSyncCycle(sender);
  const remaining = effective.config ? getTotalPendingRecords(getDb(), getAuthConfig()?.tenant_id || 'global') : 0;
  const drainedCount = Math.max(0, initialPending - remaining);
  console.log(`[SyncWorker] ✅ Queue drain completed. Drained ${drainedCount} records, ${remaining} remaining.`);
  return { success: true, drainedCount, message: `Successfully drained ${drainedCount} records.` };
}

let fastQuotationPullInProgress = false;
const FAST_QUOTATION_PULL_MS = 30000;

let urgentInvoiceSyncInProgress = false;
let lastUrgentInvoiceSyncTime = 0;

export async function triggerUrgentInvoiceSync(): Promise<void> {
  const now = Date.now();
  if (urgentInvoiceSyncInProgress || now - lastUrgentInvoiceSyncTime < 1500) {
    console.log('[SyncWorker] Urgent invoice sync already in progress or recently executed, skipping duplicate...');
    return;
  }
  lastUrgentInvoiceSyncTime = now;
  const config = getAuthConfig();
  if (!config) return;
  const { jwt_token, tenant_id } = config;
  if (isJwtExpired(jwt_token)) return;

  const conn = await checkSyncConnectivity();
  if (!conn.ok) {
    return;
  }

  urgentInvoiceSyncInProgress = true;
  try {
    console.log('[SyncWorker] Express priority invoice push/pull running...');
    await syncInvoices(jwt_token, tenant_id);
    const updated = await pullInvoices(jwt_token, tenant_id);
    notifyRenderer();
    if (updated) {
      console.log('[SyncWorker] Express priority invoice sync completed: renderer notified.');
    }
  } catch (err: any) {
    console.error('[SyncWorker] Express invoice sync error:', err.message);
  } finally {
    urgentInvoiceSyncInProgress = false;
  }
}

let urgentQuotationSyncInProgress = false;

export async function triggerUrgentQuotationSync(): Promise<void> {
  if (urgentQuotationSyncInProgress) {
    console.log('[SyncWorker] Urgent quotation sync already in progress, skipping...');
    return;
  }
  const config = getAuthConfig();
  if (!config) return;
  const { jwt_token, tenant_id } = config;
  if (isJwtExpired(jwt_token)) return;

  const conn = await checkSyncConnectivity();
  if (!conn.ok) {
    return;
  }

  urgentQuotationSyncInProgress = true;
  try {
    console.log('[SyncWorker] Express priority quotation push/pull running...');
    await syncQuotations(jwt_token, tenant_id);
    const updated = await pullQuotations(jwt_token, tenant_id);
    notifyRenderer();
    if (updated) {
      console.log('[SyncWorker] Express priority quotation sync completed: renderer notified.');
    }
  } catch (err: any) {
    console.error('[SyncWorker] Express quotation sync error:', err.message);
  } finally {
    urgentQuotationSyncInProgress = false;
  }
}

let fastCashPullInProgress = false;
const FAST_CASH_PULL_MS = 15000;

let urgentCashSyncInProgress = false;
let lastUrgentCashSyncTime = 0;

export async function triggerUrgentCashSync(): Promise<void> {
  const now = Date.now();
  if (urgentCashSyncInProgress || now - lastUrgentCashSyncTime < 1500) {
    console.log('[SyncWorker] Urgent cash sync already in progress or recently executed, skipping duplicate...');
    return;
  }
  lastUrgentCashSyncTime = now;
  const config = getAuthConfig();
  if (!config) return;
  const { jwt_token, tenant_id } = config;
  if (isJwtExpired(jwt_token)) return;

  const conn = await checkSyncConnectivity();
  if (!conn.ok) {
    return;
  }

  urgentCashSyncInProgress = true;
  try {
    console.log('[SyncWorker] Express priority cash push/pull running...');
    await syncCashDrawer(jwt_token, tenant_id);
    await syncCashTransactions(jwt_token, tenant_id);
    await syncCashierAuditLog(jwt_token, tenant_id);
    await syncCashCategories(jwt_token, tenant_id);
    await syncPaymentSources(jwt_token, tenant_id);
    await syncPaymentSourceTransactions(jwt_token, tenant_id);

    await pullCashDrawer(jwt_token, tenant_id);
    await pullCashTransactions(jwt_token, tenant_id);
    await pullCashierAuditLog(jwt_token, tenant_id);
    await pullCashCategories(jwt_token, tenant_id);
    await pullPaymentSources(jwt_token, tenant_id);
    await pullPaymentSourceTransactions(jwt_token, tenant_id);

    notifyRenderer();
    console.log('[SyncWorker] Express priority cash sync completed: renderer notified.');
  } catch (err: any) {
    console.error('[SyncWorker] Express cash sync error:', err.message);
  } finally {
    urgentCashSyncInProgress = false;
  }
}

export async function runInitialSync(sender?: WebContents) {
  console.log('[SyncWorker] Running explicit initial sync...');
  isSyncActive = true;
  const config = getAuthConfig();
  if (config?.tenant_id) {
    try {
      getDb().prepare(`DELETE FROM sync_meta WHERE key = ?`).run(cursorKey(config.tenant_id, 'cash_drawer'));
    } catch {}
  }
  triggerUrgentInvoiceSync().catch(() => {});
  triggerUrgentCashSync().catch(() => {});
  triggerUrgentQuotationSync().catch(() => {});
  await runSyncCycle(sender);
  return { success: true };
}

export async function forceResyncInvoices(sender?: WebContents) {
  console.log('[SyncWorker] Forcing full invoice and return re-sync...');
  const config = getAuthConfig();
  if (config?.tenant_id) {
    const db = getDb();
    db.prepare(`DELETE FROM sync_meta WHERE key IN (?, ?)`).run(
      cursorKey(config.tenant_id, 'invoices'),
      cursorKey(config.tenant_id, 'returns')
    );
  }
  return runInitialSync(sender);
}

async function checkCloudStatus(token: string, tenantId: string, sinceTimestamp: string | null): Promise<{ success: boolean; hasChanges: boolean; maxUpdatedAt?: string | null }> {
  try {
    const urlPath = sinceTimestamp ? `/api/sync/check-status?since=${encodeURIComponent(sinceTimestamp)}` : '/api/sync/check-status';
    const { response } = await fetchWithFallback(urlPath, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { success: false, hasChanges: true };
    const res = await response.json();
    if (!res.success) return { success: false, hasChanges: true };
    return { success: true, hasChanges: res.hasChanges !== false, maxUpdatedAt: res.maxUpdatedAt };
  } catch {
    return { success: false, hasChanges: true };
  }
}

async function pullLightweightPendingBills(token: string, tenantId: string): Promise<{ success: boolean; updated: boolean }> {
  const db = getDb();
  const cursorTs = getMeta(cursorKey(tenantId, 'pending_bills_lightweight_ts')) || null;
  const cursorId = getMeta(cursorKey(tenantId, 'pending_bills_lightweight_id')) || null;
  
  let urlPath = '/api/sync/pending-bills-lightweight';
  if (cursorTs) {
    urlPath += `?since=${encodeURIComponent(cursorTs)}`;
    if (cursorId) {
      urlPath += `&last_id=${encodeURIComponent(cursorId)}`;
    }
  }

  try {
    const { response } = await fetchWithFallback(urlPath, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) return { success: false, updated: false };
    const res = await response.json();
    if (!res.success || !Array.isArray(res.bills)) return { success: false, updated: false };
    if (res.bills.length === 0) return { success: true, updated: false };

    let hasInsertedNew = false;
    let lastTs = cursorTs;
    let lastId = cursorId;

    const upsertLightweightInv = db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, invoice_number, customer_name, grand_total, payment_method, user_id, sync_status, created_at, updated_at
      ) VALUES (
        @invoice_id, @tenant_id, @invoice_number, @customer_name, @grand_total, @payment_method, @user_id, 'SYNCED', @created_at, @updated_at
      )
      ON CONFLICT(invoice_id) DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        grand_total = EXCLUDED.grand_total,
        payment_method = EXCLUDED.payment_method,
        updated_at = EXCLUDED.updated_at
      WHERE invoices.sync_status != 'PENDING'
    `);

    const tx = db.transaction((bills: any[]) => {
      for (const b of bills) {
        if (!b.invoice_id) continue;
        upsertLightweightInv.run({
          invoice_id: b.invoice_id,
          tenant_id: tenantId,
          invoice_number: b.invoice_number,
          customer_name: b.customer_name || null,
          grand_total: Number(b.grand_total) || 0,
          payment_method: b.payment_method || 'PENDING',
          user_id: b.user_id || null,
          created_at: toSqliteDate(b.created_at),
          updated_at: toSqliteDate(b.updated_at || b.created_at),
        });
        hasInsertedNew = true;
        if (b.created_at) {
          lastTs = new Date(b.created_at).toISOString();
          lastId = b.invoice_id;
        }
      }
    });

    tx(res.bills);
    if (lastTs && lastId) {
      setMeta(cursorKey(tenantId, 'pending_bills_lightweight_ts'), lastTs);
      setMeta(cursorKey(tenantId, 'pending_bills_lightweight_id'), lastId);
    }
    return { success: true, updated: hasInsertedNew };
  } catch {
    return { success: false, updated: false };
  }
}

async function unifiedDeltaPull(token: string, tenantId: string): Promise<{ success: boolean; dataUpdated: boolean }> {
  const tables = [
    'product_grades', 'pricing_tiers', 'product_pricing', 'products', 'settings',
    'parties', 'party_ledger', 'customers', 'loyalty_transactions', 'scrap_categories',
    'scrap_transactions', 'purchase_bills', 'cash_drawer', 'cash_transactions',
    'cashier_audit_log', 'cash_categories', 'returns', 'payment_sources',
    'payment_source_transactions', 'combo_offers', 'quotations', 'invoices', 'users'
  ];

  const sinceMap: Record<string, string | null> = {};
  for (const t of tables) {
    sinceMap[t] = replaySince(getMeta(cursorKey(tenantId, t)));
  }

  try {
    const { response } = await fetchWithFallback('/api/sync/delta-pull', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ since: sinceMap }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return { success: false, dataUpdated: false };
    const result = await response.json();
    if (!result.success || !result.data) return { success: false, dataUpdated: false };

    const data = result.data;
    let anyHasRows = false;
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key]) && data[key].length > 0) {
        anyHasRows = true;
        break;
      }
    }

    if (!anyHasRows) {
      return { success: true, dataUpdated: false };
    }

    let dataUpdated = false;
    if (data.product_grades?.length) if (await pullGrades(token, tenantId)) dataUpdated = true;
    if (data.pricing_tiers?.length) if (await pullPricingTiers(token, tenantId)) dataUpdated = true;
    if (data.product_pricing?.length) if (await pullProductPricing(token, tenantId)) dataUpdated = true;
    if (data.products?.length) if (await pullProducts(token, tenantId)) dataUpdated = true;
    if (data.settings?.length) if (await pullSettings(token, tenantId)) dataUpdated = true;
    if (data.parties?.length) if (await pullParties(token, tenantId)) dataUpdated = true;
    if (data.party_ledger?.length) if (await pullPartyLedger(token, tenantId)) dataUpdated = true;
    if (data.customers?.length) if (await pullCustomers(token, tenantId)) dataUpdated = true;
    if (data.loyalty_transactions?.length) if (await pullLoyaltyTransactions(token, tenantId)) dataUpdated = true;
    if (data.scrap_categories?.length) if (await pullScrapCategories(token, tenantId)) dataUpdated = true;
    if (data.scrap_transactions?.length) if (await pullScrapTransactions(token, tenantId)) dataUpdated = true;
    if (data.purchase_bills?.length) if (await pullPurchaseBills(token, tenantId)) dataUpdated = true;
    if (data.cash_drawer?.length) if (await pullCashDrawer(token, tenantId)) dataUpdated = true;
    if (data.cash_transactions?.length) if (await pullCashTransactions(token, tenantId)) dataUpdated = true;
    if (data.cashier_audit_log?.length) if (await pullCashierAuditLog(token, tenantId)) dataUpdated = true;
    if (data.cash_categories?.length) if (await pullCashCategories(token, tenantId)) dataUpdated = true;
    if (data.returns?.length) if (await pullReturns(token, tenantId)) dataUpdated = true;
    if (data.payment_sources?.length) if (await pullPaymentSources(token, tenantId)) dataUpdated = true;
    if (data.payment_source_transactions?.length) if (await pullPaymentSourceTransactions(token, tenantId)) dataUpdated = true;
    if (data.combo_offers?.length) if (await pullComboOffers(token, tenantId)) dataUpdated = true;
    if (data.quotations?.length) if (await pullQuotations(token, tenantId)) dataUpdated = true;
    if (data.invoices?.length) if (await pullInvoices(token, tenantId)) dataUpdated = true;
    if (data.users?.length) if (await pullUsers(token, tenantId)) dataUpdated = true;

    return { success: true, dataUpdated };
  } catch (err: any) {
    console.warn('[SyncWorker] Unified delta pull error, falling back to standard pull:', err.message);
    return { success: false, dataUpdated: false };
  }
}

async function runSyncCycle(sender?: WebContents): Promise<void> {
  if (syncInProgress) {
    return syncPromise ?? Promise.resolve();
  }

  syncInProgress = true;
  currentSyncProgress = null;

  syncPromise = (async () => {
    try {
      notifyProgress(0, sender);
      const endpoints = getSyncEndpoints();
      const effective = calculateEffectiveCloudAccess();

      if (endpoints.primaryRoute === 'CLOUD' && !effective.isCloudAllowed) {
        console.log(`[SyncWorker] Cloud sync access is disabled (${effective.activeReason}). Skipping Cloud sync cycle. Local DB operation continues. (State: ${effective.stateName})`);
        notifyCycleComplete(sender);
        return;
      }

      let healthOk = false;
      let activeRoute: 'LAN' | 'CLOUD' = endpoints.primaryRoute;

      if (endpoints.primaryRoute === 'CLOUD') {
        // In Cloud Mode (Vercel), skip recurring /health pings to eliminate serverless function wakeups
        healthOk = true;
        activeRoute = 'CLOUD';
      } else {
        try {
          const res = await fetch(endpoints.primaryUrl + '/health', { method: 'GET', signal: AbortSignal.timeout(3000) });
          if (res.ok) {
            healthOk = true;
            activeRoute = endpoints.primaryRoute;
          }
        } catch {
          // Primary LAN server unreachable
        }

        if (!healthOk && endpoints.fallbackUrl && effective.isCloudAllowed) {
          try {
            console.log(`[SyncWorker] LAN Primary Master (${endpoints.primaryUrl}) unreachable. Falling back to Cloud API (${endpoints.fallbackUrl})...`);
            const res = await fetch(endpoints.fallbackUrl + '/health', { method: 'GET', signal: AbortSignal.timeout(5000) });
            if (res.ok) {
              healthOk = true;
              activeRoute = endpoints.fallbackRoute!;
            }
          } catch {
            // Fallback Cloud API also unreachable
          }
        }
      }

      if (!healthOk) {
        notifyOnlineStatus(false);
        return;
      }

      notifyOnlineStatus(true, activeRoute);

        if (endpoints.primaryRoute === 'LAN' && endpoints.primaryUrl.includes('127.0.0.1')) {
          console.log('[SyncWorker] Primary Master in LAN mode active. Local SQLite database is master for LAN terminals.');
          notifyCycleComplete(sender);
          return;
        }

      const config = getAuthConfig();
      if (!config) {
        console.warn('[SyncWorker] No JWT token found. Please log in to enable cloud sync.');
        return;
      }

      const { jwt_token, tenant_id } = config;

      if (isJwtExpired(jwt_token)) {
        console.warn('[SyncWorker] JWT token has expired. Clearing auth...');
        await clearAuthAndNotify();
        return;
      }
      let dataUpdated = false;
      const db = getDb();

      // One-time auto-heal: reset pull cursors so invalid local-time/truncated cursors are wiped and fresh exact-precision cursors take over
      const healingKey = `utc_cursor_fix_v7:${tenant_id}`;
      if (!getMeta(healingKey)) {
        try {
          db.prepare(`DELETE FROM sync_meta WHERE key LIKE ?`).run(`pull_cursor:${tenant_id}:%`);
          setMeta(healingKey, 'true');
          console.log('[SyncWorker] One-time reset of all pull cursors applied to migrate to ISO UTC cursors.');
        } catch (e: any) {
          console.error('[SyncWorker] Error performing one-time cursor reset:', e.message);
        }
      }

      // One-time auto-heal: reset parties pull cursor so all terminals pull latest party types (e.g. suppliers)
      const partyHealingKey = `party_type_cursor_heal_v2:${tenant_id}`;
      if (!getMeta(partyHealingKey)) {
        try {
          db.prepare(`DELETE FROM sync_meta WHERE key = ?`).run(`pull_cursor:${tenant_id}:parties`);
          db.prepare(`UPDATE parties SET sync_status = 'SYNCED' WHERE sync_status = 'PENDING' AND tenant_id = ?`).run(tenant_id);
          setMeta(partyHealingKey, 'true');
          console.log('[SyncWorker] One-time reset of parties cursor applied to re-sync all latest party types.');
        } catch (e: any) {
          console.error('[SyncWorker] Error performing party cursor reset:', e.message);
        }
      }

      const totalRecords = getTotalPendingRecords(db, tenant_id);

      try {
        notifyProgress(1, sender, 0, totalRecords); await syncGrades(jwt_token, tenant_id);
        notifyProgress(1.1, sender, undefined, totalRecords); await syncPricingTiers(jwt_token, tenant_id);
        notifyProgress(1.2, sender, undefined, totalRecords); await syncProductPricing(jwt_token, tenant_id);
        notifyProgress(2, sender, undefined, totalRecords); await syncProducts(jwt_token, tenant_id);
        notifyProgress(3, sender, undefined, totalRecords); await syncInvoices(jwt_token, tenant_id);
        notifyProgress(4, sender, undefined, totalRecords); await syncSettings(jwt_token, tenant_id);
        notifyProgress(5, sender, undefined, totalRecords); await syncParties(jwt_token, tenant_id);
        notifyProgress(5.1, sender, undefined, totalRecords); await pushCustomers(jwt_token, tenant_id);
        notifyProgress(5.2, sender, undefined, totalRecords); await pushLoyaltyTransactions(jwt_token, tenant_id);
        notifyProgress(6, sender, undefined, totalRecords); await syncPartyLedger(jwt_token, tenant_id);
        notifyProgress(7, sender, undefined, totalRecords); await syncScrapCategories(jwt_token, tenant_id);
        notifyProgress(8, sender, undefined, totalRecords); await syncScrapTransactions(jwt_token, tenant_id);
        notifyProgress(9, sender, undefined, totalRecords); await syncPurchaseBills(jwt_token, tenant_id);
        notifyProgress(10, sender, undefined, totalRecords); await syncCashDrawer(jwt_token, tenant_id);
        notifyProgress(11, sender, undefined, totalRecords); await syncCashTransactions(jwt_token, tenant_id);
        notifyProgress(11.1, sender, undefined, totalRecords); await syncCashierAuditLog(jwt_token, tenant_id);
        notifyProgress(12, sender, undefined, totalRecords); await syncCashCategories(jwt_token, tenant_id);
        notifyProgress(12.1, sender, undefined, totalRecords); await syncReturns(jwt_token, tenant_id);
        notifyProgress(12.2, sender, undefined, totalRecords); await syncPaymentSources(jwt_token, tenant_id);
        notifyProgress(12.3, sender, undefined, totalRecords); await syncPaymentSourceTransactions(jwt_token, tenant_id);
        notifyProgress(12.4, sender, undefined, totalRecords); await syncComboOffers(jwt_token, tenant_id);
        // Pre-check if cloud has any new changes before running pull requests
        const syncCheckTables = [
          'product_grades', 'pricing_tiers', 'product_pricing', 'products', 'settings',
          'parties', 'party_ledger', 'customers', 'loyalty_transactions', 'scrap_categories',
          'scrap_transactions', 'purchase_bills', 'cash_drawer', 'cash_transactions',
          'cashier_audit_log', 'cash_categories', 'returns', 'payment_sources',
          'payment_source_transactions', 'combo_offers', 'quotations', 'invoices', 'users'
        ];
        let latestPulledTs: string | null = null;
        for (const t of syncCheckTables) {
          const ts = getMeta(cursorKey(tenant_id, t));
          if (ts) {
            if (!latestPulledTs || new Date(ts).getTime() > new Date(latestPulledTs).getTime()) {
              latestPulledTs = ts;
            }
          }
        }
        if (latestPulledTs) {
          const statusCheck = await checkCloudStatus(jwt_token, tenant_id, latestPulledTs);
          if (statusCheck.success && !statusCheck.hasChanges) {
            console.log(`[SyncWorker] ⚡ Cloud check-status: 0 changes detected since ${latestPulledTs}. Skipping pull phase.`);
            notifyPercent(100, 'Sync completed', sender);
            notifyCycleComplete(sender);
            return;
          }
        }

        // Try unified delta pull first (1 request for all datasets)
        const deltaRes = await unifiedDeltaPull(jwt_token, tenant_id);
        if (deltaRes.success) {
          if (deltaRes.dataUpdated) dataUpdated = true;
          notifyPercent(100, 'Sync completed', sender);
        } else {
          // Fallback to legacy parallel pull if unified delta-pull endpoint is unavailable
          const pullTasks: { run: () => Promise<boolean> }[] = [
            { run: () => pullGrades(jwt_token, tenant_id) },
            { run: () => pullPricingTiers(jwt_token, tenant_id) },
            { run: () => pullProductPricing(jwt_token, tenant_id) },
            { run: () => pullProducts(jwt_token, tenant_id) },
            { run: () => pullInvoices(jwt_token, tenant_id) },
            { run: () => pullUsers(jwt_token, tenant_id) },
            { run: () => pullSettings(jwt_token, tenant_id) },
            { run: () => pullParties(jwt_token, tenant_id) },
            { run: () => pullPartyLedger(jwt_token, tenant_id) },
            { run: () => pullCustomers(jwt_token, tenant_id) },
            { run: () => pullLoyaltyTransactions(jwt_token, tenant_id) },
            { run: () => pullScrapCategories(jwt_token, tenant_id) },
            { run: () => pullScrapTransactions(jwt_token, tenant_id) },
            { run: () => pullPurchaseBills(jwt_token, tenant_id) },
            { run: () => pullCashDrawer(jwt_token, tenant_id) },
            { run: () => pullCashTransactions(jwt_token, tenant_id) },
            { run: () => pullCashierAuditLog(jwt_token, tenant_id) },
            { run: () => pullCashCategories(jwt_token, tenant_id) },
            { run: () => pullReturns(jwt_token, tenant_id) },
            { run: () => pullPaymentSources(jwt_token, tenant_id) },
            { run: () => pullPaymentSourceTransactions(jwt_token, tenant_id) },
            { run: () => pullComboOffers(jwt_token, tenant_id) },
            { run: () => pullQuotations(jwt_token, tenant_id) },
          ];

          pullProgressCtx = { done: 0, total: pullTasks.length };
          for (let i = 0; i < pullTasks.length; i += PULL_CONCURRENCY) {
            const batch = pullTasks.slice(i, i + PULL_CONCURRENCY);
            const results = await Promise.all(batch.map(async (t) => {
              const ok = await t.run();
              pullProgressCtx!.done++;
              notifyPercent(38 + 55 * (pullProgressCtx!.done / pullProgressCtx!.total),
                `Downloaded ${pullProgressCtx!.done}/${pullProgressCtx!.total} datasets`, sender);
              return ok;
            }));
            if (results.some(Boolean)) dataUpdated = true;
          }
        }
      } catch (err: any) {
        console.error('[SyncWorker] Sync cycle error:', err.message);
      } finally {
        pullProgressCtx = null;
      }

      if (dataUpdated) {
        notifyRenderer('sync-cycle-completed-with-changes');
      }
      notifyCycleComplete(sender);
    } finally {
      syncInProgress = false;
      syncPromise = null;
    }
  })();

  return syncPromise;
}

// ── Batch push helper with retries ───────────────────────────────────────────────
async function pushBatch<T>(
  url: string,
  token: string,
  batch: T[],
  bodyKey: string,
  label: string,
): Promise<string[]> {
  if (batch.length === 0) return [];

  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { response } = await fetchWithFallback(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ [bodyKey]: batch }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.error(`[SyncWorker] ${label} failed: HTTP 401 (token expired). Clearing auth...`);
          await clearAuthAndNotify();
          return [];
        }
        let errDetail = '';
        try {
          errDetail = await response.text();
        } catch {}
        console.error(`${getSyncPrefix()} ${label} batch failed: HTTP ${response.status}${errDetail ? ` — ${errDetail.slice(0, 300)}` : ''}`);
        return [];
      }

      const result: any = await response.json();
      if (result.synced?.length > 0) {
        console.log(`${getSyncPrefix()} ${label}: ${result.synced_count ?? result.synced.length} synced, ${result.failed_count ?? 0} failed.`);
      } else if (result.failed?.length > 0) {
        console.log(`${getSyncPrefix()} ${label}: 0 synced, ${result.failed_count ?? result.failed.length} failed. First error: ${result.failed[0].error}`);
      }
      return result.synced || [];
    } catch (err: any) {
      const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('aborted');
      const isNetworkError = err.message?.includes('fetch failed') || err.message?.includes('ENOTFOUND') || err.message?.includes('ECONNREFUSED');

      if (attempt < MAX_RETRIES && (isTimeout || isNetworkError)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[SyncWorker] ${label} attempt ${attempt}/${MAX_RETRIES} failed (${err.message}). Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      console.error(`[SyncWorker] ${label} batch error after ${attempt} attempt(s): ${err.message}`);
      return [];
    }
  }

  return [];
}

// ── Product Grades Sync (Edge → Cloud) ───────────────────────────────────────────
async function syncGrades(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM product_grades WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} product grades to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE product_grades SET sync_status = 'SYNCED' WHERE grade_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/product_grades',
      token,
      batch,
      'product_grades',
      `Grades batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Pricing Tiers Sync (Edge → Cloud) ────────────────────────────────────────
async function syncPricingTiers(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM pricing_tiers WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} pricing tiers to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE pricing_tiers SET sync_status = 'SYNCED' WHERE pricing_tier_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const tiers = batch.map((t: any) => ({
      ...t,
      is_active: !!t.is_active,
      is_default: !!t.is_default,
      is_deleted: !!t.is_deleted,
    }));

    const synced = await pushBatch(
      '/api/sync/pricing_tiers',
      token,
      tiers,
      'pricing_tiers',
      `Pricing tiers batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Product Pricing Sync (Edge → Cloud) ──────────────────────────────────────
async function syncProductPricing(token: string, tenantId: string) {
  const db = getDb();
  let pending = db.prepare(`SELECT * FROM product_pricing WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;

  // Sanitize any non-UUID product_pricing_id before pushing
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const fixIdStmt = db.prepare(`UPDATE product_pricing SET product_pricing_id = ? WHERE product_id = ? AND pricing_tier_id = ? AND tenant_id = ?`);
  for (const pp of pending) {
    if (!pp.product_pricing_id || !uuidRegex.test(pp.product_pricing_id)) {
      const newUuid = crypto.randomUUID();
      fixIdStmt.run(newUuid, pp.product_id, pp.pricing_tier_id, tenantId);
      pp.product_pricing_id = newUuid;
    }
  }

  console.log(`[SyncWorker] Pushing ${pending.length} product pricing rows to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`
    UPDATE product_pricing
    SET sync_status = 'SYNCED'
    WHERE tenant_id = ? AND (product_pricing_id = ? OR (product_id = ? AND pricing_tier_id = ?))
  `);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const pricing = batch.map((pp: any) => ({
      ...pp,
      is_deleted: !!pp.is_deleted,
    }));

    const synced = await pushBatch(
      '/api/sync/product_pricing',
      token,
      pricing,
      'product_pricing',
      `Product pricing batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const syncedSet = new Set(synced);
      const tx = db.transaction((rows: any[]) => {
        for (const pp of rows) {
          if (syncedSet.has(pp.product_pricing_id) || syncedSet.has(pp.product_id)) {
            updateStmt.run(tenantId, pp.product_pricing_id, pp.product_id, pp.pricing_tier_id);
          }
        }
      });
      tx(batch);
    }
  }
}

// ── Product Sync (Edge → Cloud) ──────────────────────────────────────────────
async function syncProducts(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM products WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} products to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE products SET sync_status = 'SYNCED' WHERE product_id = ? AND tenant_id = ?`);

  let totalSynced = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const products = batch.map((p: any) => ({
      ...p,
      is_deleted: p.is_deleted === true || p.is_deleted === 1 || p.is_deleted === '1' || p.is_deleted === 'true',
      is_gst_applicable: isGstApplicableProduct(p.is_gst_applicable, p.hsn_sac_code),
      weight_override_allowed: p.weight_override_allowed === true || p.weight_override_allowed === 1 || p.weight_override_allowed === '1' || p.weight_override_allowed === 'true',
      is_service_item: p.is_service_item === true || p.is_service_item === 1 || p.is_service_item === '1' || p.is_service_item === 'true',
      domain_attributes: (() => { 
          try { 
            const parsed = JSON.parse(p.domain_attributes || '{}');
            return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
          } catch { return {}; }
        })(),
    }));

    const synced = await pushBatch(
      '/api/sync/products',
      token,
      products,
      'products',
      `Products batch ${Math.floor(i / BATCH_SIZE) + 1} (${i + 1}-${Math.min(i + BATCH_SIZE, pending.length)})`,
    );
    if (synced.length > 0) {
      totalSynced += synced.length;
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
  console.log(`[SyncWorker] Pushed ${totalSynced} products to cloud.`);
}

// ── Invoice Sync (Edge → Cloud) ──────────────────────────────────────────────
async function syncInvoices(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM invoices WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD')`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} invoices to cloud in batches of ${BATCH_SIZE}...`);

  const getItems = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
  const updateStmt = db.prepare(`UPDATE invoices SET sync_status = 'SYNCED' WHERE invoice_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);

  let totalSynced = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const invoicesWithItems = batch.map((inv: any) => ({
      ...inv,
      subtotal: Number(inv.subtotal) || 0,
      tax_total: Number(inv.tax_total) || 0,
      grand_total: Number(inv.grand_total) || 0,
      discount_total: Number(inv.discount_total) || 0,
      discount_value: Number(inv.discount_value) || 0,
      received_amount: Number(inv.received_amount) || 0,
      actual_refund_paid: Number(inv.actual_refund_paid) || 0,
      balance_amount: Number(inv.balance_amount) || 0,
      scrap_deduction: Number(inv.scrap_deduction) || 0,
      points_earned: Number(inv.points_earned) || 0,
      points_redeemed: Number(inv.points_redeemed) || 0,
      points_redeemed_discount: Number(inv.points_redeemed_discount) || 0,
      previous_points_balance: Number(inv.previous_points_balance) || 0,
      remaining_points_balance: Number(inv.remaining_points_balance) || 0,
      // GST split totals (Indian GST Act compliance)
      cgst_total: Number(inv.cgst_total) || 0,
      sgst_total: Number(inv.sgst_total) || 0,
      igst_total: Number(inv.igst_total) || 0,
      supply_type: inv.supply_type || 'INTRA',
      is_deleted: inv.is_deleted === true || inv.is_deleted === 1 || inv.is_deleted === '1' || inv.is_deleted === 'true',
      items: (getItems.all(inv.invoice_id, tenantId) as any[]).map((item: any) => ({
        ...item,
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price) || 0,
        total: Number(item.total) || 0,
        tax_amount: Number(item.tax_amount) || 0,
        // GST split per line item
        cgst_rate:   Number(item.cgst_rate)   || 0,
        sgst_rate:   Number(item.sgst_rate)   || 0,
        igst_rate:   Number(item.igst_rate)   || 0,
        cgst_amount: Number(item.cgst_amount) || 0,
        sgst_amount: Number(item.sgst_amount) || 0,
        igst_amount: Number(item.igst_amount) || 0,
        hsn_sac_code: item.hsn_sac_code || null,
        supply_type:  item.supply_type || 'INTRA',
      })),
    }));

    const synced = await pushBatch(
      '/api/sync/invoices',
      token,
      invoicesWithItems,
      'invoices',
      `Invoices batch ${Math.floor(i / BATCH_SIZE) + 1} (${i + 1}-${Math.min(i + BATCH_SIZE, pending.length)})`,
    );
    if (synced.length > 0) {
      totalSynced += synced.length;
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
  console.log(`[SyncWorker] Pushed ${totalSynced} invoices to cloud.`);
}

const LOCAL_DEVICE_SETTING_KEYS = [
  'terminal_code',
  'invoice_counter_config',
  'gst_b2b_invoice_counter_config',
  'gst_b2c_invoice_counter_config',
  'gst_invoice_counter_config',
  'return_counter',
  'scrap_invoice_counter',
  'quotation_counter',
  'barcode_printer_config',
  'receipt_printer_config',
  'a4_printer_config',
  'scale_config',
  'printer_config',
  'network_sync_config',
  'auto_print_barcode',
  'print_format',
  'label_code_type',
  'label_show_shop_name'
];

// ── Settings Sync (Edge → Cloud / LAN) ─────────────────────────────────────────────
async function syncSettings(token: string, tenantId: string) {
  const db = getDb();
  try {
    const placeholders = LOCAL_DEVICE_SETTING_KEYS.map(() => '?').join(',');
    db.prepare(`UPDATE settings SET sync_status = 'LOCAL' WHERE (tenant_id = ? OR tenant_id = 'global') AND key IN (${placeholders}) AND sync_status = 'PENDING'`).run(tenantId, ...LOCAL_DEVICE_SETTING_KEYS);
  } catch (e) {}

  const pending = (db.prepare(`SELECT * FROM settings WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global')`).all(tenantId) as any[])
    .filter((row: any) => !LOCAL_DEVICE_SETTING_KEYS.includes(row.key));

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} settings to ${getSyncTargetLabel()}...`);

  const synced = await pushBatch(
    '/api/sync/settings',
    token,
    pending,
    'settings',
    'Settings',
  );
  if (synced.length > 0) {
    const updateStmt = db.prepare(`UPDATE settings SET sync_status = 'SYNCED' WHERE key = ? AND (tenant_id = ? OR tenant_id = 'global')`);
    const tx = db.transaction((keys: string[]) => { for (const key of keys) updateStmt.run(key, tenantId); });
    tx(synced);
  }
}

// ── Reconcile helper ────────────────────────────────────────────────────────────
function reconcilePending(
  db: any,
  table: string,
  idColumn: string,
  cloudRows: any[],
  tsColumn: string = 'updated_at'
): number {
  if (cloudRows.length === 0) return 0;

  let updateStmt: any;
  try {
    updateStmt = db.prepare(
      `UPDATE ${table} SET sync_status = 'SYNCED' WHERE sync_status = 'PENDING' AND ${idColumn} = ? AND (${tsColumn} = ? OR ${tsColumn} IS NULL)`
    );
  } catch {
    updateStmt = db.prepare(
      `UPDATE ${table} SET sync_status = 'SYNCED' WHERE sync_status = 'PENDING' AND ${idColumn} = ?`
    );
  }

  let count = 0;
  for (const row of cloudRows) {
    try {
      const tsVal = row[tsColumn] || row.updated_at || row.created_at;
      const result = updateStmt.run(row[idColumn], toSqliteDate(tsVal));
      if (result.changes > 0) count++;
    } catch {
      try {
        const fallbackStmt = db.prepare(`UPDATE ${table} SET sync_status = 'SYNCED' WHERE sync_status = 'PENDING' AND ${idColumn} = ?`);
        const result = fallbackStmt.run(row[idColumn]);
        if (result.changes > 0) count++;
      } catch {}
    }
  }
  return count;
}

// ── Sync metadata (per-tenant pull cursors) ─────────────────────────────────────
const cursorKey = (tenantId: string, table: string) => `pull_cursor:${tenantId}:${table}`;

function getMeta(key: string): string | null {
  try {
    const row = getDb().prepare(`SELECT value FROM sync_meta WHERE key = ?`).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function setMeta(key: string, value: string) {
  try {
    getDb().prepare(
      `INSERT INTO sync_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, value);
  } catch (err: any) {
    console.error('[SyncWorker] Failed to persist sync meta:', err.message);
  }
}

// Walk the cursor back a few seconds so rows written in the same instant as the
// cursor (or with identical timestamps) are re-fetched and reconciled idempotently.
function replaySince(cursor: string | null): string | null {
  if (!cursor) return null;
  const str = cursor.trim();
  try {
    const d = new Date(str.includes('Z') || str.includes('+') ? str : str.replace(' ', 'T') + 'Z');
    if (!isNaN(d.getTime())) {
      const rewound = new Date(d.getTime() - CURSOR_REPLAY_SECONDS * 1000);
      return rewound.toISOString();
    }
  } catch {}
  return str;
}

// Shared progress context for the parallel pull phase (set by runSyncCycle).
let pullProgressCtx: { done: number; total: number } | null = null;

// Cache of per-table content hashes to prevent duplicate log spam when fetched data is unchanged
const tableContentHashes: Record<string, string> = {};

// ── Generic paginated + delta pull (Cloud → Edge) ───────────────────────────────
// Fetches a table in pages of `pageSize`, passing each page to `processPage`
// (which performs the table-specific upsert inside its own transaction), tracks
// the newest timestamp seen as the per-table cursor, and only requests rows
// modified after `cursor` on subsequent cycles. First sync on a
// fresh device has no cursor and therefore performs a full paginated download.
async function pullPaginated(opts: {
  token: string;
  tenantId: string;
  table: string;
  urlPath: string;
  label: string;
  pageSize?: number;
  tsColumn?: 'updated_at' | 'created_at';
  onProgress?: (fetched: number) => void;
  processPage: (rows: any[]) => number;
}): Promise<{ count: number; reconciled: number; failed: boolean; hasChanged: boolean }> {
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

  const fetchPage = async (offsetVal: number): Promise<any[] | null> => {
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
            console.error(`[SyncWorker] Pull ${opts.label} failed: HTTP 401 (token expired/unauthorized). Clearing auth and notifying user to re-login...`);
            await clearAuthAndNotify();
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
      } catch (err: any) {
        const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('aborted');
        const isNetwork = err.message?.includes('fetch failed') || err.message?.includes('ENOTFOUND') || err.message?.includes('ECONNREFUSED');
        if (attempt < PULL_MAX_RETRIES && (isTimeout || isNetwork)) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          console.log(`[SyncWorker] Pull ${opts.label} page ${attempt}/${PULL_MAX_RETRIES} failed (${err.message}). Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        console.error(`[SyncWorker] Pull ${opts.label} failed: ${err.message}`);
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

    reconciled += opts.processPage(rows);
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

// Progress reporter shared by all pull wrappers during the parallel phase.
function notifyPullProgress(label: string, fetched: number) {
  if (pullProgressCtx && pullProgressCtx.total > 0) {
    const percent = 38 + 55 * ((pullProgressCtx.done + 0.5) / pullProgressCtx.total);
    notifyPercent(percent, `Downloading ${label}… ${fetched.toLocaleString()} rows`);
  }
}

// ── Pull Product Grades (Cloud → Edge) ─────────────────────────────────────────────
async function pullGrades(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO product_grades (
      grade_id, tenant_id, category, grade_name, rate, purchase_price, offer_price, is_deleted,
      sync_status, created_at, updated_at
    ) VALUES (
      @grade_id, @tenant_id, @category, @grade_name, @rate, @purchase_price, @offer_price, @is_deleted,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(grade_id) DO UPDATE SET
      category = excluded.category,
      grade_name = excluded.grade_name,
      rate = excluded.rate,
      purchase_price = excluded.purchase_price,
      offer_price = excluded.offer_price,
      is_deleted = excluded.is_deleted,
      created_at = COALESCE(product_grades.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE product_grades.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'product_grades',
    urlPath: '/api/sync/product_grades',
    label: 'grades',
    onProgress: (fetched) => notifyPullProgress('grades', fetched),
    processPage: (rows) => {
      const tx = db.transaction((grades: any[]) => {
        for (const g of grades) {
          try {
            upsert.run({
              grade_id: g.grade_id,
              tenant_id: tenantId,
              category: g.category,
              grade_name: g.grade_name,
              rate: g.rate,
              purchase_price: g.purchase_price ?? 0,
              offer_price: g.offer_price ?? null,
              is_deleted: parseIsDeleted(g.is_deleted),
              created_at: toSqliteDate(g.created_at),
              updated_at: toSqliteDate(g.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling grade:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'product_grades', 'grade_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} grades from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull grades failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Pricing Tiers (Cloud → Edge) ──────────────────────────────────────────
async function pullPricingTiers(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO pricing_tiers (
      pricing_tier_id, tenant_id, name, is_active, sort_order, is_default, is_deleted,
      sync_status, created_at, updated_at
    ) VALUES (
      @pricing_tier_id, @tenant_id, @name, @is_active, @sort_order, @is_default, @is_deleted,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(pricing_tier_id) DO UPDATE SET
      name = excluded.name,
      is_active = excluded.is_active,
      sort_order = excluded.sort_order,
      is_default = excluded.is_default,
      is_deleted = excluded.is_deleted,
      created_at = COALESCE(pricing_tiers.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE pricing_tiers.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'pricing_tiers',
    urlPath: '/api/sync/pricing_tiers',
    label: 'pricing tiers',
    onProgress: (fetched) => notifyPullProgress('pricing tiers', fetched),
    processPage: (rows) => {
      const tx = db.transaction((tiers: any[]) => {
        for (const t of tiers) {
          try {
            upsert.run({
              pricing_tier_id: t.pricing_tier_id,
              tenant_id: tenantId,
              name: t.name,
              is_active: t.is_active ? 1 : 0,
              sort_order: t.sort_order ?? 0,
              is_default: t.is_default ? 1 : 0,
              is_deleted: parseIsDeleted(t.is_deleted),
              created_at: toSqliteDate(t.created_at),
              updated_at: toSqliteDate(t.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling pricing tier:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'pricing_tiers', 'pricing_tier_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} pricing tiers from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull pricing tiers failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Product Pricing (Cloud → Edge) ────────────────────────────────────────
async function pullProductPricing(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO product_pricing (
      product_pricing_id, tenant_id, product_id, pricing_tier_id, price, is_deleted,
      sync_status, created_at, updated_at
    ) VALUES (
      @product_pricing_id, @tenant_id, @product_id, @pricing_tier_id, @price, @is_deleted,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(product_id, pricing_tier_id) DO UPDATE SET
      product_pricing_id = excluded.product_pricing_id,
      price = excluded.price,
      is_deleted = excluded.is_deleted,
      created_at = COALESCE(product_pricing.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE product_pricing.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'product_pricing',
    urlPath: '/api/sync/product_pricing',
    label: 'product pricing',
    onProgress: (fetched) => notifyPullProgress('product pricing', fetched),
    processPage: (rows) => {
      const tx = db.transaction((pricing: any[]) => {
        for (const pp of pricing) {
          try {
            upsert.run({
              product_pricing_id: pp.product_pricing_id,
              tenant_id: tenantId,
              product_id: pp.product_id,
              pricing_tier_id: pp.pricing_tier_id,
              price: pp.price ?? 0,
              is_deleted: parseIsDeleted(pp.is_deleted),
              created_at: toSqliteDate(pp.created_at),
              updated_at: toSqliteDate(pp.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling product pricing row:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'product_pricing', 'product_pricing_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} product pricing rows from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull product pricing failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Products (Cloud → Edge) ─────────────────────────────────────────────
async function pullProducts(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO products (
      product_id, tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
      purchase_price, base_price, is_gst_applicable, tax_rate_percent,
      uom, brand_manufacturer, current_stock, reorder_level, is_deleted, domain_attributes,
      discount_percent, discount_flat, offer_price,
      billing_type, grade_id, pricing_mode, average_weight_per_piece, weight_override_allowed,
      is_service_item, print_status, sync_status, created_at, updated_at
    ) VALUES (
      @product_id, @tenant_id, @name, @sku_barcode, @item_code, @category, @hsn_sac_code,
      @purchase_price, @base_price, @is_gst_applicable, @tax_rate_percent,
      @uom, @brand_manufacturer, @current_stock, @reorder_level, @is_deleted, @domain_attributes,
      @discount_percent, @discount_flat, @offer_price,
      @billing_type, @grade_id, @pricing_mode, @average_weight_per_piece, @weight_override_allowed,
      @is_service_item, @print_status, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(product_id) DO UPDATE SET
      name = excluded.name,
      sku_barcode = excluded.sku_barcode,
      item_code = excluded.item_code,
      category = excluded.category,
      hsn_sac_code = excluded.hsn_sac_code,
      purchase_price = excluded.purchase_price,
      base_price = excluded.base_price,
      is_gst_applicable = excluded.is_gst_applicable,
      tax_rate_percent = excluded.tax_rate_percent,
      uom = excluded.uom,
      brand_manufacturer = excluded.brand_manufacturer,
      current_stock = excluded.current_stock,
      reorder_level = excluded.reorder_level,
      is_deleted = excluded.is_deleted,
      domain_attributes = excluded.domain_attributes,
      discount_percent = excluded.discount_percent,
      discount_flat = excluded.discount_flat,
      offer_price = excluded.offer_price,
      billing_type = excluded.billing_type,
      grade_id = excluded.grade_id,
      pricing_mode = excluded.pricing_mode,
      average_weight_per_piece = excluded.average_weight_per_piece,
      weight_override_allowed = excluded.weight_override_allowed,
      is_service_item = excluded.is_service_item,
      print_status = COALESCE(excluded.print_status, products.print_status),
      created_at = COALESCE(products.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE products.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'products',
    urlPath: '/api/sync/products',
    label: 'products',
    onProgress: (fetched) => notifyPullProgress('products', fetched),
    processPage: (rows) => {
      const tx = db.transaction((products: any[]) => {
        for (const p of products) {
          let currentP = { ...p };
          let retryCount = 0;
          let success = false;
          while (retryCount < 2 && !success) {
            try {
              upsert.run({
                product_id: currentP.product_id,
                tenant_id: tenantId,
                name: currentP.name,
                sku_barcode: currentP.sku_barcode || null,
                item_code: currentP.item_code || null,
                category: currentP.category || null,
                hsn_sac_code: currentP.hsn_sac_code || null,
                purchase_price: currentP.purchase_price ?? 0,
                base_price: currentP.base_price,
                is_gst_applicable: isGstApplicableProduct(currentP.is_gst_applicable, currentP.hsn_sac_code) ? 1 : 0,
                tax_rate_percent: currentP.tax_rate_percent ?? 0,
                uom: currentP.uom || 'Pcs',
                brand_manufacturer: currentP.brand_manufacturer || null,
                current_stock: currentP.current_stock ?? 0,
                reorder_level: currentP.reorder_level ?? 0,
                is_deleted: parseIsDeleted(currentP.is_deleted),
                domain_attributes: currentP.domain_attributes 
                  ? (typeof currentP.domain_attributes === 'string' ? currentP.domain_attributes : JSON.stringify(currentP.domain_attributes)) 
                  : '{}',
                discount_percent: currentP.discount_percent ?? null,
                discount_flat: currentP.discount_flat ?? null,
                offer_price: currentP.offer_price ?? null,
                billing_type: currentP.billing_type || 'PIECE',
                grade_id: currentP.grade_id || null,
                pricing_mode: currentP.pricing_mode || 'FIXED_PRICE',
                average_weight_per_piece: currentP.average_weight_per_piece ?? null,
                weight_override_allowed: currentP.weight_override_allowed ? 1 : 0,
                is_service_item: currentP.is_service_item ? 1 : 0,
                print_status: currentP.print_status ?? null,
                created_at: toSqliteDate(currentP.created_at),
                updated_at: toSqliteDate(currentP.updated_at),
              });
              success = true;
            } catch (e: any) {
              if (e.message?.includes('UNIQUE constraint failed')) {
                const suffix = currentP.product_id.substring(0, 4).toUpperCase();
                if (e.message.includes('products.name')) currentP.name = `${currentP.name} (Cloud-${suffix})`;
                if (e.message.includes('products.sku_barcode')) currentP.sku_barcode = `${currentP.sku_barcode}-${suffix}`;
                if (e.message.includes('products.item_code')) currentP.item_code = `${currentP.item_code}-${suffix}`;
                retryCount++;
              } else {
                throw e;
              }
            }
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'products', 'product_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} products from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled} PENDING.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull products failed.');
  }
  return result.hasChanged && result.count > 0;
}

let lastInvoicesHash = ''; // kept for legacy compat — no longer used to gate notifications

// ── Pull Invoices (Cloud → Edge) ─────────────────────────────────────────────
async function pullInvoices(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsertInv = db.prepare(`
    INSERT INTO invoices (
      invoice_id, tenant_id, invoice_number, invoice_type,
      customer_name, customer_phone, customer_gstin, customer_state, customer_address,
      subtotal, tax_total,
      discount_total, discount_type, discount_value, grand_total, payment_method, split_details,
      received_amount, actual_refund_paid, balance_amount, user_id, sync_status, created_at,
      scrap_deduction, scrap_invoice_number,
      return_deduction, return_invoice_number,
      customer_id, points_earned, points_redeemed, points_redeemed_discount,
      previous_points_balance, remaining_points_balance,
      converted_from_invoice_id, converted_from_invoice_number,
      converted_to_invoice_id, converted_to_invoice_number,
      is_deleted,
      cgst_total, sgst_total, igst_total, supply_type,
      notes, description
    ) VALUES (
      @invoice_id, @tenant_id, @invoice_number, @invoice_type,
      @customer_name, @customer_phone, @customer_gstin, @customer_state, @customer_address,
      @subtotal, @tax_total,
      @discount_total, @discount_type, @discount_value, @grand_total, @payment_method, @split_details,
      @received_amount, @actual_refund_paid, @balance_amount, @user_id, 'SYNCED', @created_at,
      @scrap_deduction, @scrap_invoice_number,
      @return_deduction, @return_invoice_number,
      @customer_id, @points_earned, @points_redeemed, @points_redeemed_discount,
      @previous_points_balance, @remaining_points_balance,
      @converted_from_invoice_id, @converted_from_invoice_number,
      @converted_to_invoice_id, @converted_to_invoice_number,
      @is_deleted,
      @cgst_total, @sgst_total, @igst_total, @supply_type,
      @notes, @description
    )
    ON CONFLICT(invoice_id) DO UPDATE SET
      customer_name = EXCLUDED.customer_name,
      customer_phone = EXCLUDED.customer_phone,
      customer_gstin = EXCLUDED.customer_gstin,
      customer_state = EXCLUDED.customer_state,
      customer_address = EXCLUDED.customer_address,
      subtotal = EXCLUDED.subtotal,
      tax_total = EXCLUDED.tax_total,
      discount_total = EXCLUDED.discount_total,
      discount_type = EXCLUDED.discount_type,
      discount_value = EXCLUDED.discount_value,
      grand_total = EXCLUDED.grand_total,
      payment_method = EXCLUDED.payment_method,
      split_details = EXCLUDED.split_details,
      received_amount = EXCLUDED.received_amount,
      actual_refund_paid = EXCLUDED.actual_refund_paid,
      balance_amount = EXCLUDED.balance_amount,
      invoice_type = EXCLUDED.invoice_type,
      user_id = EXCLUDED.user_id,
      scrap_deduction = EXCLUDED.scrap_deduction,
      scrap_invoice_number = EXCLUDED.scrap_invoice_number,
      return_deduction = EXCLUDED.return_deduction,
      return_invoice_number = EXCLUDED.return_invoice_number,
      customer_id = EXCLUDED.customer_id,
      points_earned = EXCLUDED.points_earned,
      points_redeemed = EXCLUDED.points_redeemed,
      points_redeemed_discount = EXCLUDED.points_redeemed_discount,
      previous_points_balance = EXCLUDED.previous_points_balance,
      remaining_points_balance = EXCLUDED.remaining_points_balance,
      converted_from_invoice_id = EXCLUDED.converted_from_invoice_id,
      converted_from_invoice_number = EXCLUDED.converted_from_invoice_number,
      converted_to_invoice_id = EXCLUDED.converted_to_invoice_id,
      converted_to_invoice_number = EXCLUDED.converted_to_invoice_number,
      is_deleted = EXCLUDED.is_deleted,
      cgst_total = EXCLUDED.cgst_total,
      sgst_total = EXCLUDED.sgst_total,
      igst_total = EXCLUDED.igst_total,
      supply_type = EXCLUDED.supply_type,
      notes = EXCLUDED.notes,
      description = EXCLUDED.description,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      sync_status = 'SYNCED'
  `);

  const upsertItem = db.prepare(`
    INSERT INTO invoice_items (
      item_id, invoice_id, tenant_id, product_id,
      name, quantity, unit_price, tax_amount, total, qty_from_paper_stock, pieces_sold, billing_type, uom,
      cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, supply_type
    ) VALUES (
      @item_id, @invoice_id, @tenant_id, @product_id,
      @name, @quantity, @unit_price, @tax_amount, @total, @qty_from_paper_stock, @pieces_sold, @billing_type, @uom,
      @cgst_rate, @sgst_rate, @igst_rate, @cgst_amount, @sgst_amount, @igst_amount, @hsn_sac_code, @supply_type
    )
    ON CONFLICT(item_id) DO UPDATE SET
      name = excluded.name,
      quantity = excluded.quantity,
      unit_price = excluded.unit_price,
      tax_amount = excluded.tax_amount,
      total = excluded.total,
      qty_from_paper_stock = excluded.qty_from_paper_stock,
      pieces_sold = COALESCE(excluded.pieces_sold, invoice_items.pieces_sold),
      billing_type = COALESCE(excluded.billing_type, invoice_items.billing_type),
      uom = COALESCE(excluded.uom, invoice_items.uom),
      cgst_rate = excluded.cgst_rate,
      sgst_rate = excluded.sgst_rate,
      igst_rate = excluded.igst_rate,
      cgst_amount = excluded.cgst_amount,
      sgst_amount = excluded.sgst_amount,
      igst_amount = excluded.igst_amount,
      hsn_sac_code = excluded.hsn_sac_code,
      supply_type = excluded.supply_type
  `);

  // Items are replaced per invoice (not just upserted) so items removed from an
  // edited bill are deleted locally too — otherwise stale lines come back and
  // reappear on reprints. A locally PENDING edit that differs from the cloud is
  // never clobbered: its items are left untouched until the edit syncs.
  const deleteItems = db.prepare('DELETE FROM invoice_items WHERE invoice_id = ? AND tenant_id = ?');
  const localInvCheck = db.prepare('SELECT sync_status, updated_at, is_deleted FROM invoices WHERE invoice_id = ? AND tenant_id = ?');

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'invoices',
    urlPath: '/api/sync/invoices',
    label: 'invoices',
    onProgress: (fetched) => notifyPullProgress('invoices', fetched),
    processPage: (rows) => {
      console.log(`[SyncWorker][pull:invoices] processPage: processing ${rows.length} invoices...`);
      // DEBUG: log first few invoice IDs to confirm data is arriving
      if (rows.length > 0) {
        const sample = rows.slice(0, 3).map((r: any) => r.invoice_number || r.invoice_id).join(', ');
        console.log(`[SyncWorker][pull:invoices] Sample invoices received: ${sample}`);
      }

      const tx = db.transaction((invoices: any[]) => {
        for (const inv of invoices) {
          let currentInv = { ...inv };

          // Never touch a locally-PENDING edit that diverges from the cloud (a change that
          // hasn't synced yet). Replacing header or items here would resurrect the deleted
          // lines of an edited bill and/or revert the edit. The push path will sync it later.
          const prior = localInvCheck.get(currentInv.invoice_id, currentInv.tenant_id) as any;
          const isDirtyPending = !!prior
            && prior.sync_status === 'PENDING'
            && toSqliteDate(currentInv.updated_at) !== prior.updated_at;
          if (isDirtyPending) continue;

          let retryCount = 0;
          let success = false;
          while (retryCount < 2 && !success) {
            try {
              upsertInv.run({
                invoice_id: currentInv.invoice_id,
                tenant_id: currentInv.tenant_id,
                invoice_number: currentInv.invoice_number,
                invoice_type: currentInv.invoice_type,
                customer_name: currentInv.customer_name || null,
                customer_phone: currentInv.customer_phone || null,
                subtotal: currentInv.subtotal,
                tax_total: currentInv.tax_total,
                discount_total: currentInv.discount_total ?? 0,
                discount_type: currentInv.discount_type || 'FIXED',
                discount_value: currentInv.discount_value ?? 0,
                grand_total: currentInv.grand_total,
                payment_method: currentInv.payment_method || 'PENDING',
                split_details: currentInv.split_details && typeof currentInv.split_details === 'object' ? JSON.stringify(currentInv.split_details) : (currentInv.split_details && currentInv.split_details !== 'null' ? currentInv.split_details : null),
                received_amount: currentInv.received_amount ?? 0,
                actual_refund_paid: currentInv.actual_refund_paid ?? 0,
                balance_amount: currentInv.balance_amount ?? 0,
                user_id: currentInv.user_id || null,
                created_at: toSqliteDate(currentInv.created_at),
                customer_gstin: currentInv.customer_gstin || null,
                customer_state: currentInv.customer_state || null,
                customer_address: currentInv.customer_address || null,
                scrap_deduction: currentInv.scrap_deduction ?? 0,
                scrap_invoice_number: currentInv.scrap_invoice_number || null,
                return_deduction: currentInv.return_deduction ?? 0,
                return_invoice_number: currentInv.return_invoice_number || null,
                customer_id: currentInv.customer_id || null,
                points_earned: currentInv.points_earned ?? 0,
                points_redeemed: currentInv.points_redeemed ?? 0,
                points_redeemed_discount: currentInv.points_redeemed_discount ?? 0,
                previous_points_balance: currentInv.previous_points_balance ?? 0,
                remaining_points_balance: currentInv.remaining_points_balance ?? 0,
                converted_from_invoice_id: currentInv.converted_from_invoice_id || null,
                converted_from_invoice_number: currentInv.converted_from_invoice_number || null,
                converted_to_invoice_id: currentInv.converted_to_invoice_id || null,
                converted_to_invoice_number: currentInv.converted_to_invoice_number || null,
                is_deleted: parseIsDeleted(currentInv.is_deleted),
                cgst_total: Number(currentInv.cgst_total) || 0,
                sgst_total: Number(currentInv.sgst_total) || 0,
                igst_total: Number(currentInv.igst_total) || 0,
                supply_type: currentInv.supply_type || 'INTRA',
                notes: currentInv.notes || currentInv.description || null,
                description: currentInv.description || currentInv.notes || null,
              });

              // If this invoice is soft-deleted and was active locally before this pull, restore local product stock
              const isDeletedPull = parseIsDeleted(currentInv.is_deleted) === 1;
              if (isDeletedPull && prior && !prior.is_deleted && Array.isArray(currentInv.items)) {
                const isConversionCopy = !!(currentInv.converted_from_invoice_id || currentInv.converted_from_invoice_number);
                if (!isConversionCopy) {
                  for (const item of currentInv.items) {
                    db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?').run(Number(item.quantity) || 0, item.product_id, currentInv.tenant_id);
                  }
                }
              }

              success = true;
            } catch (e: any) {
              if (e.message?.includes('UNIQUE constraint failed: invoices.tenant_id, invoices.invoice_number')) {
                const suffix = currentInv.invoice_id.substring(0, 4).toUpperCase();
                currentInv.invoice_number = `${currentInv.invoice_number}-C${suffix}`;
                retryCount++;
              } else {
                throw e;
              }
            }
          }

          if (success && Array.isArray(currentInv.items)) {
            // Save existing pieces_sold, billing_type, and uom from local DB BEFORE deleting — server doesn't store
            // these fields so we must preserve the locally-typed values ourselves.
            const existingPiecesSold: Record<string, number | null> = {};
            const existingBillingType: Record<string, string | null> = {};
            const existingUom: Record<string, string | null> = {};
            const existingRows = db.prepare('SELECT item_id, pieces_sold, billing_type, uom FROM invoice_items WHERE invoice_id = ? AND tenant_id = ?').all(currentInv.invoice_id, currentInv.tenant_id) as any[];
            for (const row of existingRows) {
              existingPiecesSold[row.item_id] = row.pieces_sold != null ? Number(row.pieces_sold) : null;
              existingBillingType[row.item_id] = row.billing_type != null ? row.billing_type : null;
              existingUom[row.item_id] = row.uom != null ? row.uom : null;
            }

            // Replace items per invoice so lines removed from an edited bill are deleted
            // locally too — otherwise they resurrect and reappear on reprints.
            deleteItems.run(currentInv.invoice_id, currentInv.tenant_id);
            for (const item of currentInv.items) {
              // Prefer: server-returned pieces_sold → previously saved local value → null
              const preservedPcs = item.pieces_sold != null
                ? Number(item.pieces_sold)
                : (existingPiecesSold[item.item_id] ?? null);
              const preservedBillingType = item.billing_type != null
                ? item.billing_type
                : (existingBillingType[item.item_id] ?? null);
              const preservedUom = item.uom != null
                ? item.uom
                : (existingUom[item.item_id] ?? null);

              upsertItem.run({
                item_id: item.item_id,
                invoice_id: currentInv.invoice_id,
                tenant_id: currentInv.tenant_id,
                product_id: item.product_id,
                name: item.name || null,
                quantity: item.quantity,
                unit_price: item.unit_price,
                tax_amount: item.tax_amount,
                total: item.total,
                qty_from_paper_stock: item.qty_from_paper_stock ?? 0,
                pieces_sold: preservedPcs,
                billing_type: preservedBillingType,
                uom: preservedUom,
                cgst_rate: Number(item.cgst_rate) || 0,
                sgst_rate: Number(item.sgst_rate) || 0,
                igst_rate: Number(item.igst_rate) || 0,
                cgst_amount: Number(item.cgst_amount) || 0,
                sgst_amount: Number(item.sgst_amount) || 0,
                igst_amount: Number(item.igst_amount) || 0,
                hsn_sac_code: item.hsn_sac_code || null,
                supply_type: item.supply_type || 'INTRA',
              });
            }
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'invoices', 'invoice_id', rows);
    },
  });

  if (result.count > 0) {
    console.log(`[SyncWorker] ✅ Pulled ${result.count} invoices from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled} PENDING.` : ''}`);
  } else if (result.failed) {
    console.error(`[SyncWorker] ❌ Pull invoices FAILED for tenantId=${tenantId}.`);
  } else {
    console.log(`[SyncWorker] ℹ️ Pull invoices: 0 new/changed invoices (cursor up-to-date).`);
  }
  // Always signal "changed" whenever count > 0 so the UI re-queries SQLite.
  // hasContentChanged was removed — it was blocking notifications for data already in DB.
  return (result.count > 0 || result.reconciled > 0) && !result.failed;
}

// ── Pull Users (Cloud → Edge) ────────────────────────────────────────────────
let lastUsersHash = '';

async function pullUsers(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  try {
    const { response } = await fetchWithFallback('/auth/staff', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error('[SyncWorker] Pull users failed: HTTP 401 (token expired/unauthorized). Clearing auth and notifying user to re-login...');
        await clearAuthAndNotify();
        return false;
      }
      console.error(`[SyncWorker] Pull users failed: HTTP ${response.status}`);
      return false;
    }

    const rawUsers = await response.json();
    const cloudUsers: any[] = Array.isArray(rawUsers) ? rawUsers : (rawUsers.users || rawUsers.data || []);
    if (!Array.isArray(cloudUsers) || cloudUsers.length === 0) return false;

    const currentHash = JSON.stringify(cloudUsers.map(u => ({
      id: u.user_id,
      name: u.name,
      role: u.role,
      page: u.restricted_page,
      permissions: u.permissions,
      login_enabled: u.login_enabled,
    })));
    const hasChanged = currentHash !== lastUsersHash;

    const upsert = db.prepare(`
      INSERT INTO users (user_id, tenant_id, name, email, role, restricted_page, permissions, login_enabled, created_at)
      VALUES (@user_id, @tenant_id, @name, @email, @role, @restricted_page, @permissions, @login_enabled, @created_at)
      ON CONFLICT(user_id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        role = excluded.role,
        restricted_page = excluded.restricted_page,
        permissions = excluded.permissions,
        login_enabled = excluded.login_enabled
    `);

    const tx = db.transaction((users: any[]) => {
      for (const u of users) {
        upsert.run({
          user_id: u.user_id,
          tenant_id: tenantId,
          name: u.name,
          email: u.email,
          role: u.role,
          restricted_page: u.restricted_page || null,
          permissions: JSON.stringify(Array.isArray(u.permissions) ? u.permissions : []),
          login_enabled: u.login_enabled === false ? 0 : 1,
          created_at: toSqliteDate(u.created_at),
        });
      }
    });

    tx(cloudUsers);
    if (hasChanged) {
      lastUsersHash = currentHash;
      console.log(`[SyncWorker] Pulled ${cloudUsers.length} users from cloud.`);
    }
    return hasChanged;
  } catch (err: any) {
    console.error('[SyncWorker] Pull users failed:', err.message);
    return false;
  }
}

// ── Party Sync (Edge → Cloud) ────────────────────────────────────────────────
async function syncParties(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM parties WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} parties to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE parties SET sync_status = 'SYNCED' WHERE party_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const parties = batch.map((p: any) => ({
      ...p,
      is_deleted: !!p.is_deleted,
    }));

    const synced = await pushBatch(
      '/api/sync/parties',
      token,
      parties,
      'parties',
      `Parties batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

async function pushCustomers(token: string, tenantId: string): Promise<boolean> {
  try {
    const pending = getDb().prepare(
      `SELECT * FROM customers WHERE tenant_id = ? AND sync_status IN ('PENDING', 'FAILED')`
    ).all(tenantId);
    if (!Array.isArray(pending) || pending.length === 0) return true;
    const { response } = await fetchWithFallback('/api/sync/customers', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ customers: pending }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      if (response.status === 401) {
        console.error('[SyncWorker] Push customers failed: HTTP 401 (token expired/unauthorized). Clearing auth and notifying user to re-login...');
        await clearAuthAndNotify();
      }
      return false;
    }
    const result = await response.json();
    if (Array.isArray(result.synced) && result.synced.length > 0) {
      const markSynced = getDb().prepare(`UPDATE customers SET sync_status = 'SYNCED', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?`);
      const tx = getDb().transaction((ids: string[]) => { for (const id of ids) markSynced.run(id); });
      tx(result.synced);
    }
    if (Array.isArray(result.failed) && result.failed.length > 0) {
      const markFailed = getDb().prepare(`UPDATE customers SET sync_status = 'FAILED', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?`);
      const tx = getDb().transaction((items: any[]) => { for (const f of items) markFailed.run(f.customer_id); });
      tx(result.failed);
    }
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Push customers failed:', err.message);
    return false;
  }
}

// ── Pull Parties (Cloud → Edge) ─────────────────────────────────────────────
async function pullParties(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO parties (
      party_id, tenant_id, name, phone, address, gstin, balance, gst_balance, estimate_balance, balance_type, party_type, custom_category, notes, last_transaction_date, pricing_tier_id, credit_limit, is_deleted,
      sync_status, created_at, updated_at
    ) VALUES (
      @party_id, @tenant_id, @name, @phone, @address, @gstin, @balance, @gst_balance, @estimate_balance, @balance_type, @party_type, @custom_category, @notes, @last_transaction_date, @pricing_tier_id, @credit_limit, @is_deleted,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(party_id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      address = excluded.address,
      gstin = excluded.gstin,
      balance = excluded.balance,
      gst_balance = excluded.gst_balance,
      estimate_balance = excluded.estimate_balance,
      balance_type = excluded.balance_type,
      party_type = excluded.party_type,
      custom_category = excluded.custom_category,
      notes = excluded.notes,
      last_transaction_date = excluded.last_transaction_date,
      pricing_tier_id = excluded.pricing_tier_id,
      credit_limit = excluded.credit_limit,
      is_deleted = excluded.is_deleted,
      created_at = COALESCE(parties.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE parties.sync_status != 'PENDING' OR excluded.updated_at >= parties.updated_at OR parties.updated_at IS NULL
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'parties',
    urlPath: '/api/sync/parties',
    label: 'parties',
    onProgress: (fetched) => notifyPullProgress('parties', fetched),
    processPage: (rows) => {
      const tx = db.transaction((parties: any[]) => {
        for (const p of parties) {
          try {
            upsert.run({
              party_id: p.party_id,
              tenant_id: tenantId,
              name: p.name,
              phone: p.phone || null,
              address: p.address || null,
              gstin: p.gstin || null,
              balance: p.balance ?? 0,
              gst_balance: p.gst_balance ?? p.balance ?? 0,
              estimate_balance: p.estimate_balance ?? 0,
              balance_type: p.balance_type || 'RECEIVABLE',
              party_type: p.party_type || 'CUSTOMER',
              custom_category: p.custom_category || null,
              notes: p.notes || null,
              last_transaction_date: p.last_transaction_date ? toSqliteDate(p.last_transaction_date) : null,
              pricing_tier_id: p.pricing_tier_id || null,
              credit_limit: Number(p.credit_limit) || 0,
              is_deleted: parseIsDeleted(p.is_deleted),
              created_at: toSqliteDate(p.created_at),
              updated_at: toSqliteDate(p.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling party:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'parties', 'party_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} parties from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull parties failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Party Ledger Sync (Edge → Cloud) ──────────────────────────────────────────
async function syncPartyLedger(token: string, tenantId: string) {
  const db = getDb();
  const pendingEntries = db.prepare(`SELECT * FROM party_ledger WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];
  if (pendingEntries.length === 0) return;

  console.log(`[SyncWorker] Pushing ${pendingEntries.length} party ledger entries to cloud...`);
  const updateStmt = db.prepare(`UPDATE party_ledger SET sync_status = 'SYNCED' WHERE ledger_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pendingEntries.length; i += BATCH_SIZE) {
    const batch = pendingEntries.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/party-ledger',
      token,
      batch,
      'entries',
      `Party Ledger batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

async function pushLoyaltyTransactions(token: string, tenantId: string): Promise<boolean> {
  try {
    const db = getDb();
    const pending = db.prepare(
      `SELECT * FROM loyalty_transactions WHERE tenant_id = ? AND sync_status IN ('PENDING', 'FAILED')`
    ).all(tenantId);
    if (!Array.isArray(pending) || pending.length === 0) return true;
    const { response } = await fetchWithFallback('/api/sync/loyalty-transactions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ loyalty_transactions: pending }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      if (response.status === 401) {
        console.error('[SyncWorker] Push loyalty transactions failed: HTTP 401 (token expired/unauthorized). Clearing auth and notifying user to re-login...');
        await clearAuthAndNotify();
      }
      return false;
    }
    const result = await response.json();
    if (Array.isArray(result.synced) && result.synced.length > 0) {
      const markSynced = db.prepare("UPDATE loyalty_transactions SET sync_status = 'SYNCED' WHERE transaction_id = ?");
      const tx = db.transaction((ids: string[]) => { for (const id of ids) markSynced.run(id); });
      tx(result.synced);
    }
    if (Array.isArray(result.failed) && result.failed.length > 0) {
      const markFailed = db.prepare("UPDATE loyalty_transactions SET sync_status = 'FAILED' WHERE transaction_id = ?");
      const tx = db.transaction((items: any[]) => { for (const item of items) markFailed.run(item.transaction_id); });
      tx(result.failed);
    }
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Push loyalty transactions failed:', err.message);
    return false;
  }
}

// ── Pull Party Ledger (Cloud → Edge) ─────────────────────────────────────────
async function pullPartyLedger(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO party_ledger (
      ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount,
      running_balance, balance_type, payment_method, reference_number, created_by, created_by_name, is_deleted, sync_status, created_at, updated_at
    ) VALUES (
      @ledger_id, @party_id, @tenant_id, @transaction_date, @description, @credit_amount, @debit_amount,
      @running_balance, @balance_type, @payment_method, @reference_number, @created_by, @created_by_name, @is_deleted, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(ledger_id) DO UPDATE SET
      transaction_date = excluded.transaction_date,
      description = excluded.description,
      credit_amount = excluded.credit_amount,
      debit_amount = excluded.debit_amount,
      running_balance = excluded.running_balance,
      balance_type = excluded.balance_type,
      payment_method = excluded.payment_method,
      reference_number = excluded.reference_number,
      created_by = excluded.created_by,
      created_by_name = excluded.created_by_name,
      is_deleted = excluded.is_deleted,
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE party_ledger.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'party_ledger',
    urlPath: '/api/sync/party-ledger',
    label: 'ledger entries',
    onProgress: (fetched) => notifyPullProgress('ledger entries', fetched),
    processPage: (rows) => {
      const tx = db.transaction((entries: any[]) => {
        for (const e of entries) {
          try {
            upsert.run({
              ledger_id: e.ledger_id,
              party_id: e.party_id,
              tenant_id: tenantId,
              transaction_date: toSqliteDate(e.transaction_date),
              description: e.description,
              credit_amount: e.credit_amount ?? 0,
              debit_amount: e.debit_amount ?? 0,
              running_balance: e.running_balance ?? 0,
              balance_type: e.balance_type === 'ESTIMATE' ? 'ESTIMATE' : 'GST',
              payment_method: e.payment_method || null,
              reference_number: e.reference_number || null,
              created_by: e.created_by || null,
              created_by_name: e.created_by_name || null,
              is_deleted: e.is_deleted ? 1 : 0,
              created_at: toSqliteDate(e.created_at),
              updated_at: toSqliteDate(e.updated_at),
            });
          } catch (err: any) {
            console.error('[SyncWorker] Error pulling ledger entry:', err.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'party_ledger', 'ledger_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} ledger entries from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull party ledger failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Scrap Categories Sync (Edge → Cloud) ─────────────────────────────────────
async function syncScrapCategories(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM scrap_categories WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} scrap categories to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE scrap_categories SET sync_status = 'SYNCED' WHERE scrap_category_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const categories = batch.map((c: any) => ({
      ...c,
      is_deleted: !!c.is_deleted,
    }));

    const synced = await pushBatch(
      '/api/sync/scrap_categories',
      token,
      categories,
      'scrap_categories',
      `Scrap Categories batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Scrap Transactions Sync (Edge → Cloud) ──────────────────────────────────
async function syncScrapTransactions(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM scrap_transactions WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} scrap transactions to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE scrap_transactions SET sync_status = 'SYNCED' WHERE transaction_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/scrap_transactions',
      token,
      batch,
      'scrap_transactions',
      `Scrap Transactions batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Pull Scrap Categories (Cloud → Edge) ────────────────────────────────────
async function pullScrapCategories(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO scrap_categories (
      scrap_category_id, tenant_id, name, purchase_price, selling_price, current_stock, unit, is_deleted,
      sync_status, created_at, updated_at
    ) VALUES (
      @scrap_category_id, @tenant_id, @name, @purchase_price, @selling_price, @current_stock, @unit, @is_deleted,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(scrap_category_id) DO UPDATE SET
      name = excluded.name,
      purchase_price = excluded.purchase_price,
      selling_price = excluded.selling_price,
      current_stock = excluded.current_stock,
      unit = excluded.unit,
      is_deleted = excluded.is_deleted,
      created_at = COALESCE(scrap_categories.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE scrap_categories.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'scrap_categories',
    urlPath: '/api/sync/scrap_categories',
    label: 'scrap categories',
    onProgress: (fetched) => notifyPullProgress('scrap categories', fetched),
    processPage: (rows) => {
      const tx = db.transaction((categories: any[]) => {
        for (const c of categories) {
          try {
            upsert.run({
              scrap_category_id: c.scrap_category_id,
              tenant_id: tenantId,
              name: c.name,
              purchase_price: c.purchase_price ?? 0,
              selling_price: c.selling_price ?? 0,
              current_stock: c.current_stock ?? 0,
              unit: c.unit || 'Kgs',
              is_deleted: parseIsDeleted(c.is_deleted),
              created_at: toSqliteDate(c.created_at),
              updated_at: toSqliteDate(c.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling scrap category:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'scrap_categories', 'scrap_category_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} scrap categories from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull scrap categories failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Scrap Transactions (Cloud → Edge) ─────────────────────────────────
async function pullScrapTransactions(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO scrap_transactions (
      transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, payment_status, transaction_date, created_at,
      is_deleted, sync_status, updated_at
    ) VALUES (
      @transaction_id, @tenant_id, @type, @scrap_category_id, @quantity, @rate, @total_amount, @party_name, @customer_phone, @customer_address, @notes, @scrap_invoice_number, @payment_status, @transaction_date, @created_at,
      COALESCE(@is_deleted, 0), 'SYNCED', @updated_at
    )
    ON CONFLICT(transaction_id) DO UPDATE SET
      type = excluded.type,
      scrap_category_id = excluded.scrap_category_id,
      quantity = excluded.quantity,
      rate = excluded.rate,
      total_amount = excluded.total_amount,
      party_name = excluded.party_name,
      customer_phone = excluded.customer_phone,
      customer_address = excluded.customer_address,
      notes = excluded.notes,
      scrap_invoice_number = excluded.scrap_invoice_number,
      payment_status = excluded.payment_status,
      is_deleted = COALESCE(excluded.is_deleted, 0),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE scrap_transactions.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'scrap_transactions',
    urlPath: '/api/sync/scrap_transactions',
    label: 'scrap transactions',
    onProgress: (fetched) => notifyPullProgress('scrap transactions', fetched),
    processPage: (rows) => {
      const tx = db.transaction((transactions: any[]) => {
        for (const t of transactions) {
          try {
            upsert.run({
              transaction_id: t.transaction_id,
              tenant_id: tenantId,
              type: t.type,
              scrap_category_id: t.scrap_category_id,
              quantity: t.quantity,
              rate: t.rate,
              total_amount: t.total_amount ?? 0,
              party_name: t.party_name || null,
              customer_phone: t.customer_phone || null,
              customer_address: t.customer_address || null,
              notes: t.notes || null,
              scrap_invoice_number: t.scrap_invoice_number || null,
              payment_status: t.payment_status || 'CASH',
              is_deleted: parseIsDeleted(t.is_deleted),
              transaction_date: toSqliteDate(t.transaction_date),
              created_at: toSqliteDate(t.created_at),
              updated_at: toSqliteDate(t.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling scrap transaction:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'scrap_transactions', 'transaction_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} scrap transactions from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull scrap transactions failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Settings (Cloud → Edge) ─────────────────────────────────────────────
async function pullSettings(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const allowedKeys = [
    'shop_name', 'shop_phone', 'shop_address', 'shop_gstin', 'shop_state',
    'shop_email', 'shop_website', 'upi_id', 'show_upi_qr', 'show_product_offers',
    'enable_scrap', 'gst_profit_percentage', 'loyalty_config',
    'price_coding', 'three_invoice_series', 'isDomainConfirmed',
    'billing_ui_config', 'enable_party_gst_balance', 'enable_party_estimate_balance',
    'enable_real_paper_stock', 'show_paper_stock_in_gst', 'show_paper_stock_in_estimate',
    'show_zero_paper_stock', 'enable_convert_to_gst', 'show_product_gst_badge',
    'time_format', 'store_timezone', 'bank_name', 'bank_account_number',
    'bank_ifsc', 'bank_branch', 'feature_flags', 'print_format', 'label_code_type',
    'label_show_shop_name', 'auto_print_barcode', 'show_cash_register'
  ];

  const upsert = db.prepare(`
    INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
    VALUES (@tenant_id, @key, @value, 'SYNCED', @updated_at)
    ON CONFLICT(tenant_id, key) DO UPDATE SET
      value = excluded.value,
      sync_status = 'SYNCED',
      updated_at = excluded.updated_at
    WHERE settings.sync_status != 'PENDING' OR excluded.updated_at >= settings.updated_at
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'tenant_settings',
    urlPath: '/api/sync/settings',
    label: 'settings',
    onProgress: (fetched) => notifyPullProgress('settings', fetched),
    processPage: (rows) => {
      const validSettings = rows.filter((s: any) => allowedKeys.includes(s.key));
      if (validSettings.length === 0) return 0;

      const tx = db.transaction((settings: any[]) => {
        for (const s of settings) {
          let valueToSave = s.value;

          if (typeof valueToSave === 'object') {
            valueToSave = JSON.stringify(valueToSave);
          } else if (s.key === 'label_code_type' && (valueToSave === 'barcode' || valueToSave === 'qrcode')) {
            valueToSave = JSON.stringify(valueToSave);
          }

          if (typeof valueToSave !== 'string') valueToSave = String(valueToSave);

          upsert.run({
            tenant_id: s.tenant_id || tenantId,
            key: s.key,
            value: valueToSave,
            updated_at: toSqliteDate(s.updated_at)
          });
        }
      });

      tx(validSettings);
      return validSettings.length;
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} settings from cloud.`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull settings failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Sync Purchase Bills (Edge → Cloud) ───────────────────────────────────────
async function syncPurchaseBills(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM purchase_bills WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} purchase bills to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE purchase_bills SET sync_status = 'SYNCED' WHERE purchase_bill_id = ? AND tenant_id = ?`);
  const itemsUpdateStmt = db.prepare(`UPDATE purchase_bill_items SET sync_status = 'SYNCED' WHERE purchase_bill_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    // Enrich with items
    const enriched = batch.map((bill: any) => {
      const items = db.prepare(`SELECT * FROM purchase_bill_items WHERE purchase_bill_id = ? AND tenant_id = ?`).all(bill.purchase_bill_id, tenantId);
      return { ...bill, items };
    });
    const synced = await pushBatch(
      '/api/sync/purchase_bills',
      token,
      enriched,
      'purchase_bills',
      `Purchase Bills batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => {
        for (const id of ids) {
          updateStmt.run(id, tenantId);
          itemsUpdateStmt.run(id, tenantId);
        }
      });
      tx(synced);
    }
  }
}

// ── Pull Purchase Bills (Cloud → Edge) ───────────────────────────────────────
async function pullPurchaseBills(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsertBill = db.prepare(`
    INSERT INTO purchase_bills (
      purchase_bill_id, tenant_id, bill_number, supplier_id, supplier_name, bill_date, invoice_number, notes, total_amount,
      bill_type, payment_type, sync_status, created_at, updated_at
    ) VALUES (
      @purchase_bill_id, @tenant_id, @bill_number, @supplier_id, @supplier_name, @bill_date, @invoice_number, @notes, @total_amount,
      @bill_type, @payment_type, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(purchase_bill_id) DO UPDATE SET
      bill_number = excluded.bill_number,
      supplier_id = excluded.supplier_id,
      supplier_name = excluded.supplier_name,
      bill_date = excluded.bill_date,
      invoice_number = excluded.invoice_number,
      notes = excluded.notes,
      total_amount = excluded.total_amount,
      bill_type = excluded.bill_type,
      payment_type = excluded.payment_type,
      created_at = COALESCE(purchase_bills.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE purchase_bills.sync_status != 'PENDING'
  `);

  const upsertItem = db.prepare(`
    INSERT INTO purchase_bill_items (
      item_id, purchase_bill_id, tenant_id, product_id, name, quantity, purchase_price, total_amount, selling_price, offer_price,
      is_gst_applicable, tax_rate_percent, hsn_sac_code, skip_stock_update, sync_status, created_at, updated_at
    ) VALUES (
      @item_id, @purchase_bill_id, @tenant_id, @product_id, @name, @quantity, @purchase_price, @total_amount, @selling_price, @offer_price,
      @is_gst_applicable, @tax_rate_percent, @hsn_sac_code, @skip_stock_update, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(item_id) DO UPDATE SET
      product_id = excluded.product_id,
      name = excluded.name,
      quantity = excluded.quantity,
      purchase_price = excluded.purchase_price,
      total_amount = excluded.total_amount,
      selling_price = excluded.selling_price,
      offer_price = excluded.offer_price,
      is_gst_applicable = excluded.is_gst_applicable,
      tax_rate_percent = excluded.tax_rate_percent,
      hsn_sac_code = excluded.hsn_sac_code,
      skip_stock_update = excluded.skip_stock_update,
      created_at = COALESCE(purchase_bill_items.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE purchase_bill_items.sync_status != 'PENDING'
  `);

  const deleteItems = db.prepare('DELETE FROM purchase_bill_items WHERE purchase_bill_id = ? AND tenant_id = ?');
  const localBillCheck = db.prepare('SELECT sync_status, updated_at FROM purchase_bills WHERE purchase_bill_id = ? AND tenant_id = ?');

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'purchase_bills',
    urlPath: '/api/sync/purchase_bills',
    label: 'purchase bills',
    onProgress: (fetched) => notifyPullProgress('purchase bills', fetched),
    processPage: (rows) => {
      const tx = db.transaction((bills: any[]) => {
        for (const bill of bills) {
          try {
            // Never touch a locally-PENDING edit that diverges from the cloud (a change that
            // hasn't synced yet). Replacing header or items here would resurrect the deleted
            // lines of an edited bill. The push path will sync it later.
            const prior = localBillCheck.get(bill.purchase_bill_id, tenantId) as any;
            const isDirtyPending = !!prior
              && prior.sync_status === 'PENDING'
              && toSqliteDate(bill.updated_at) !== prior.updated_at;
            if (isDirtyPending) continue;

            upsertBill.run({
              purchase_bill_id: bill.purchase_bill_id,
              tenant_id: tenantId,
              bill_number: bill.bill_number,
              supplier_id: bill.supplier_id || null,
              supplier_name: bill.supplier_name,
              bill_date: bill.bill_date || null,
              invoice_number: bill.invoice_number || null,
              notes: bill.notes || null,
              total_amount: bill.total_amount ?? 0,
              bill_type: bill.bill_type || 'GST',
              payment_type: bill.payment_type || 'CASH',
              created_at: toSqliteDate(bill.created_at),
              updated_at: toSqliteDate(bill.updated_at),
            });
            if (Array.isArray(bill.items)) {
              deleteItems.run(bill.purchase_bill_id, tenantId);
              for (const item of bill.items) {
                upsertItem.run({
                  item_id: item.item_id,
                  purchase_bill_id: bill.purchase_bill_id,
                  tenant_id: tenantId,
                  product_id: item.product_id,
                  name: item.name,
                  quantity: item.quantity ?? 0,
                  purchase_price: item.purchase_price ?? 0,
                  total_amount: item.total_amount ?? 0,
                  selling_price: item.selling_price ?? 0,
                  offer_price: item.offer_price ?? null,
                  is_gst_applicable: item.is_gst_applicable === false ? 0 : 1,
                  tax_rate_percent: item.tax_rate_percent ?? 0,
                  hsn_sac_code: item.hsn_sac_code || null,
                  skip_stock_update: item.skip_stock_update ? 1 : 0,
                  created_at: toSqliteDate(item.created_at),
                  updated_at: toSqliteDate(item.updated_at),
                });
              }
            }
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling purchase bill:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'purchase_bills', 'purchase_bill_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} purchase bills from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull purchase bills failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Cash Drawer Sync (Edge → Cloud) ─────────────────────────────────────────────
async function syncCashDrawer(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM cash_drawer WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} cash drawer records to cloud...`);

  const updateStmt = db.prepare(`UPDATE cash_drawer SET sync_status = 'SYNCED' WHERE drawer_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/cash_drawer',
      token, batch, 'cash_drawer', `Cash Drawer batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id); });
      tx(synced);
    }
  }
}

// ── Cash Transactions Sync (Edge → Cloud) ───────────────────────────────────────
async function syncCashTransactions(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM cash_transactions WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} cash transactions to cloud...`);

  const updateStmt = db.prepare(`UPDATE cash_transactions SET sync_status = 'SYNCED' WHERE transaction_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/cash_transactions',
      token, batch, 'cash_transactions', `Cash Transactions batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id); });
      tx(synced);
    }
  }
}

// ── Cash Categories Sync (Edge → Cloud) ─────────────────────────────────────────
async function syncCashCategories(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM cash_categories WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} cash categories to cloud...`);

  const updateStmt = db.prepare(`UPDATE cash_categories SET sync_status = 'SYNCED' WHERE category_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/cash_categories',
      token, batch, 'cash_categories', `Cash Categories batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id); });
      tx(synced);
    }
  }
}

// ── Cashier Audit Log Sync (Edge → Cloud) ───────────────────────────────────────
async function syncCashierAuditLog(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM cashier_audit_log WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} cashier audit log records to cloud...`);

  const updateStmt = db.prepare(`UPDATE cashier_audit_log SET sync_status = 'SYNCED' WHERE audit_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/cashier_audit_log',
      token, batch, 'cashier_audit_log', `Cashier Audit Log batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id); });
      tx(synced);
    }
  }
}

let lastCashDrawerHash = '';

function reconcileCashDrawerSync(db: any, tenantId: string, drawer: any) {
  if (!drawer || !tenantId) return;
  try {
    const cleanDate = parseCleanDate(drawer.business_date);
    const parts = cleanDate.split('-');
    const altDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : cleanDate;
    const dateLike1 = `${cleanDate}%`;
    const dateLike2 = `${altDate}%`;

    const salesRow = db.prepare(`
      SELECT 
        COALESCE(SUM(
          CASE 
            WHEN UPPER(payment_method) = 'CASH' THEN (
              CASE 
                WHEN COALESCE(grand_total, 0) <= 0 THEN 0
                WHEN received_amount > 0 AND received_amount < COALESCE(grand_total, 0)
                  THEN received_amount 
                ELSE MAX(0, COALESCE(grand_total, 0))
              END
            )
            WHEN UPPER(payment_method) = 'SPLIT' AND split_details IS NOT NULL THEN (
              CASE 
                WHEN json_extract(split_details, '$.cash') IS NOT NULL 
                THEN MIN(
                  CAST(json_extract(split_details, '$.cash') AS REAL),
                  MAX(0, COALESCE(grand_total, 0))
                )
                ELSE 0 
              END
            )
            ELSE 0 
          END
        ), 0) AS total_cash_sales
      FROM invoices
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND UPPER(payment_method) IN ('CASH', 'SPLIT')
        AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (is_held IS NULL OR is_held = 0)
        AND (is_deleted IS NULL OR is_deleted = 0 OR is_deleted = '0' OR is_deleted = 0.0)
        AND (
          substr(COALESCE(settled_at, created_at), 1, 10) = ?
          OR substr(COALESCE(settled_at, created_at), 1, 10) = ?
          OR date(COALESCE(settled_at, created_at)) = ?
          OR date(COALESCE(settled_at, created_at)) = ?
          OR COALESCE(settled_at, created_at) LIKE ?
          OR COALESCE(settled_at, created_at) LIKE ?
        )
    `).get(tenantId, cleanDate, altDate, cleanDate, altDate, dateLike1, dateLike2) as any;

    const calcSales = Math.round(Number(salesRow?.total_cash_sales || 0) * 100) / 100;

    const txSums = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE 0 END), 0) AS total_in,
        COALESCE(SUM(CASE WHEN type = 'CASH_OUT' THEN amount ELSE 0 END), 0) AS total_out
      FROM cash_transactions 
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (
        drawer_id = ? 
        OR drawer_id IN (SELECT drawer_id FROM cash_drawer WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ? OR substr(business_date, 1, 10) = ?))
        OR date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ? OR substr(transaction_date, 1, 10) = ?
      )
    `).get(tenantId, drawer.drawer_id, tenantId, cleanDate, altDate, cleanDate, dateLike1, cleanDate, altDate, cleanDate, dateLike1, cleanDate, altDate) as any;

    const calcIn = Math.round(Number(txSums?.total_in || 0) * 100) / 100;
    const calcOut = Math.round(Number(txSums?.total_out || 0) * 100) / 100;

    const openingBal = Math.round(Number(drawer.opening_balance || 0) * 100) / 100;
    const expectedCash = Math.round((openingBal + calcSales + calcIn - calcOut) * 100) / 100;

    db.prepare(`
      UPDATE cash_drawer 
      SET cash_sales = ?, cash_in = ?, cash_out = ?, current_cash = ?, expected_closing = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE drawer_id = ?
    `).run(calcSales, calcIn, calcOut, expectedCash, expectedCash, drawer.drawer_id);
  } catch (e: any) {
    console.error('[SyncWorker] reconcileCashDrawerSync error:', e.message);
  }
}

// ── Pull Cash Drawer (Cloud → Edge) ─────────────────────────────────────────────
async function pullCashDrawer(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();
  let hasContentChanged = false;

  const selectExisting = db.prepare(`
    SELECT drawer_id, status, opening_balance, cash_sales, cash_in, cash_out, current_cash, expected_closing, sync_status 
    FROM cash_drawer 
    WHERE drawer_id = ? 
       OR ((tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
           AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ? OR substr(business_date, 1, 10) = ?)) 
    ORDER BY (CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) DESC, created_at DESC LIMIT 1
  `);
  const updateTxDrawerId = db.prepare(`UPDATE cash_transactions SET drawer_id = ? WHERE drawer_id = ? AND tenant_id = ?`);
  const updateAuditDrawerId = db.prepare(`UPDATE cashier_audit_log SET drawer_id = ? WHERE drawer_id = ? AND tenant_id = ?`);
  const updateMatchedDrawer = db.prepare(`
    UPDATE cash_drawer SET
      drawer_id = @drawer_id,
      opening_balance = @opening_balance, cash_sales = @cash_sales, cash_in = @cash_in, cash_out = @cash_out,
      current_cash = @current_cash, expected_closing = @expected_closing, actual_cash = @actual_cash,
      cash_short = @cash_short, cash_excess = @cash_excess, closing_remarks = @closing_remarks,
      status = @status, opened_by = COALESCE(opened_by, @opened_by), closed_by = @closed_by,
      opened_at = COALESCE(opened_at, @opened_at), closed_at = @closed_at,
      sync_status = 'SYNCED', updated_at = @updated_at
    WHERE drawer_id = @target_id
  `);
  const insertDrawer = db.prepare(`
    INSERT INTO cash_drawer (
      drawer_id, tenant_id, business_date, opening_balance, cash_sales, cash_in, cash_out,
      current_cash, expected_closing, actual_cash, cash_short, cash_excess, closing_remarks,
      status, opened_by, closed_by, opened_at, closed_at, sync_status, created_at, updated_at
    ) VALUES (
      @drawer_id, @tenant_id, @business_date, @opening_balance, @cash_sales, @cash_in, @cash_out,
      @current_cash, @expected_closing, @actual_cash, @cash_short, @cash_excess, @closing_remarks,
      @status, @opened_by, @closed_by, @opened_at, @closed_at, 'SYNCED', @created_at, @updated_at
    )
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'cash_drawer',
    urlPath: '/api/sync/cash_drawer',
    label: 'cash drawer',
    onProgress: (fetched) => notifyPullProgress('cash drawer', fetched),
    processPage: (rows) => {
      const currentHash = JSON.stringify(rows.map(r => ({
        id: r.drawer_id,
        status: r.status,
        opening: r.opening_balance,
        sales: r.cash_sales,
        in: r.cash_in,
        out: r.cash_out,
        cash: r.current_cash,
        date: r.business_date,
      })));
      if (currentHash !== lastCashDrawerHash) {
        hasContentChanged = true;
        lastCashDrawerHash = currentHash;
      }

      const tx = db.transaction((rows: any[]) => {
        for (const r of rows) {
          try {
            const cleanDate = parseCleanDate(r.business_date);
            const parts = cleanDate.split('-');
            const altDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : cleanDate;
            const dateLike1 = `${cleanDate}%`;

            const drawerData = {
              drawer_id: r.drawer_id,
              tenant_id: tenantId,
              business_date: cleanDate,
              opening_balance: r.opening_balance ?? 0,
              cash_sales: r.cash_sales ?? 0,
              cash_in: r.cash_in ?? 0,
              cash_out: r.cash_out ?? 0,
              current_cash: r.current_cash ?? 0,
              expected_closing: r.expected_closing ?? 0,
              actual_cash: r.actual_cash ?? null,
              cash_short: r.cash_short ?? 0,
              cash_excess: r.cash_excess ?? 0,
              closing_remarks: r.closing_remarks || null,
              status: r.status || 'OPEN',
              opened_by: r.opened_by || null,
              closed_by: r.closed_by || null,
              opened_at: toSqliteDate(r.opened_at),
              closed_at: toSqliteDate(r.closed_at),
              created_at: toSqliteDate(r.created_at),
              updated_at: toSqliteDate(r.updated_at),
            };

            const existing = selectExisting.get(r.drawer_id, tenantId, cleanDate, altDate, cleanDate, dateLike1, cleanDate, altDate) as any;
            if (existing) {
              const targetId = existing.drawer_id;
              // For open drawers or drawers pending push, preserve local sales & cash balance if cloud is lower
              const localSales = Number(existing.cash_sales) || 0;
              const localCurrent = Number(existing.current_cash) || 0;
              const cloudSales = Number(drawerData.cash_sales) || 0;
              const cloudCurrent = Number(drawerData.current_cash) || 0;
              
              if (existing.status === 'OPEN' || existing.sync_status === 'PENDING' || localSales > cloudSales || localCurrent > cloudCurrent) {
                const localOpening = Number(existing.opening_balance) || 0;
                const cloudOpening = Number(drawerData.opening_balance) || 0;
                drawerData.opening_balance = Math.max(cloudOpening, localOpening);
                if (drawerData.opening_balance > 0 && (existing.status !== 'CLOSED' || drawerData.status === 'OPEN')) {
                  drawerData.status = 'OPEN';
                }
                drawerData.cash_sales = Math.max(cloudSales, localSales);
                drawerData.current_cash = Math.max(cloudCurrent, drawerData.opening_balance + drawerData.cash_sales + drawerData.cash_in - drawerData.cash_out);
                drawerData.expected_closing = Math.max(Number(drawerData.expected_closing) || 0, drawerData.current_cash);
              }

              updateMatchedDrawer.run({ ...drawerData, target_id: targetId });
              if (targetId !== r.drawer_id) {
                updateTxDrawerId.run(r.drawer_id, targetId, tenantId);
                updateAuditDrawerId.run(r.drawer_id, targetId, tenantId);
              }
            } else {
              insertDrawer.run(drawerData);
            }
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling cash drawer:', e.message);
          }
        }
      });
      tx(rows);

      // Instantly reconcile all open cash drawers so cash_sales & current_cash stay accurate
      try {
        const openDrawers = db.prepare(`SELECT * FROM cash_drawer WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND status = 'OPEN'`).all(tenantId) as any[];
        for (const d of openDrawers) {
          reconcileCashDrawerSync(db, tenantId, d);
        }
      } catch (e: any) {
        console.error('[SyncWorker] Drawer reconcile error after pull:', e.message);
      }

      return reconcilePending(db, 'cash_drawer', 'drawer_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} cash drawer records from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
    notifyRenderer('cash-drawer-pulled');
  } else if (result.failed) {
    console.error('[SyncWorker] Pull cash drawer failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Cash Transactions (Cloud → Edge) ───────────────────────────────────────
async function pullCashTransactions(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO cash_transactions (
      transaction_id, tenant_id, drawer_id, type, amount, category, notes, reference_number,
      entered_by, entered_by_name, transaction_date, sync_status, created_at, updated_at
    ) VALUES (
      @transaction_id, @tenant_id, @drawer_id, @type, @amount, @category, @notes, @reference_number,
      @entered_by, @entered_by_name, @transaction_date, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(transaction_id) DO UPDATE SET
      drawer_id = excluded.drawer_id,
      type = excluded.type,
      amount = excluded.amount,
      category = excluded.category,
      notes = excluded.notes,
      reference_number = excluded.reference_number,
      entered_by = excluded.entered_by,
      entered_by_name = excluded.entered_by_name,
      transaction_date = excluded.transaction_date,
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE cash_transactions.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'cash_transactions',
    urlPath: '/api/sync/cash_transactions',
    label: 'cash transactions',
    onProgress: (fetched) => notifyPullProgress('cash transactions', fetched),
    processPage: (rows) => {
      const tx = db.transaction((transactions: any[]) => {
        for (const t of transactions) {
          try {
            const txDate = parseCleanDate(t.transaction_date);
            const localDrawer = db.prepare(`SELECT drawer_id FROM cash_drawer WHERE drawer_id = ? OR (tenant_id = ? AND (business_date = ? OR date(business_date) = ? OR business_date LIKE ?)) LIMIT 1`).get(t.drawer_id, tenantId, txDate, txDate, `${txDate}%`) as any;
            const targetDrawerId = localDrawer?.drawer_id || t.drawer_id;

            upsert.run({
              transaction_id: t.transaction_id,
              tenant_id: tenantId,
              drawer_id: targetDrawerId,
              type: t.type,
              amount: t.amount ?? 0,
              category: t.category || null,
              notes: t.notes || null,
              reference_number: t.reference_number || null,
              entered_by: t.entered_by || null,
              entered_by_name: t.entered_by_name || null,
              transaction_date: toSqliteDate(t.transaction_date),
              created_at: toSqliteDate(t.created_at),
              updated_at: toSqliteDate(t.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling cash transaction:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'cash_transactions', 'transaction_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} cash transactions from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
    try {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send('sync:data-updated');
    } catch {}
  } else if (result.failed) {
    console.error('[SyncWorker] Pull cash transactions failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Cashier Audit Log (Cloud → Edge) ───────────────────────────────────────
async function pullCashierAuditLog(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO cashier_audit_log (
      audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, performed_at, sync_status, created_at
    ) VALUES (
      @audit_id, @tenant_id, @drawer_id, @action, @details, @performed_by, @performed_by_name, @performed_at, 'SYNCED', @created_at
    )
    ON CONFLICT(audit_id) DO UPDATE SET
      drawer_id = excluded.drawer_id,
      action = excluded.action,
      details = excluded.details,
      performed_by = excluded.performed_by,
      performed_by_name = excluded.performed_by_name,
      performed_at = excluded.performed_at,
      sync_status = 'SYNCED'
    WHERE cashier_audit_log.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'cashier_audit_log',
    urlPath: '/api/sync/cashier_audit_log',
    label: 'cashier audit log',
    tsColumn: 'created_at',
    onProgress: (fetched) => notifyPullProgress('cashier audit log', fetched),
    processPage: (rows) => {
      const tx = db.transaction((logs: any[]) => {
        for (const l of logs) {
          try {
            upsert.run({
              audit_id: l.audit_id,
              tenant_id: tenantId,
              drawer_id: l.drawer_id || null,
              action: l.action,
              details: l.details ? (typeof l.details === 'object' ? JSON.stringify(l.details) : l.details) : null,
              performed_by: l.performed_by || null,
              performed_by_name: l.performed_by_name || null,
              performed_at: toSqliteDate(l.performed_at),
              created_at: toSqliteDate(l.created_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling cashier audit log:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'cashier_audit_log', 'audit_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} cashier audit log entries from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull cashier audit log failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Cash Categories (Cloud → Edge) ─────────────────────────────────────────
async function pullCashCategories(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO cash_categories (
      category_id, tenant_id, name, type, sort_order, is_default, sync_status, created_at
    ) VALUES (
      @category_id, @tenant_id, @name, @type, @sort_order, @is_default, 'SYNCED', @created_at
    )
    ON CONFLICT(category_id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      sort_order = excluded.sort_order,
      is_default = excluded.is_default,
      sync_status = 'SYNCED'
    WHERE cash_categories.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'cash_categories',
    urlPath: '/api/sync/cash_categories',
    label: 'cash categories',
    onProgress: (fetched) => notifyPullProgress('cash categories', fetched),
    processPage: (rows) => {
      const tx = db.transaction((categories: any[]) => {
        for (const c of categories) {
          try {
            upsert.run({
              category_id: c.category_id,
              tenant_id: tenantId,
              name: c.name,
              type: c.type,
              sort_order: c.sort_order ?? 0,
              is_default: c.is_default ? 1 : 0,
              created_at: toSqliteDate(c.created_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling cash category:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'cash_categories', 'category_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} cash categories from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull cash categories failed.');
  }
  return result.hasChanged && result.count > 0;
}

async function pullCustomers(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO customers (customer_id, tenant_id, name, phone, address,
      total_points_earned, total_points_redeemed, current_points_balance,
      last_purchase_date, is_deleted, sync_status, created_at, updated_at)
    VALUES (@customer_id, @tenant_id, @name, @phone, @address,
      @total_points_earned, @total_points_redeemed, @current_points_balance,
      @last_purchase_date, @is_deleted, 'SYNCED', @created_at, @updated_at)
    ON CONFLICT(customer_id) DO UPDATE SET
      name = excluded.name, phone = excluded.phone, address = excluded.address,
      total_points_earned = excluded.total_points_earned,
      total_points_redeemed = excluded.total_points_redeemed,
      current_points_balance = excluded.current_points_balance,
      last_purchase_date = excluded.last_purchase_date,
      is_deleted = excluded.is_deleted,
      sync_status = 'SYNCED', updated_at = excluded.updated_at
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'customers',
    urlPath: '/api/sync/customers',
    label: 'customers',
    onProgress: (fetched) => notifyPullProgress('customers', fetched),
    processPage: (rows) => {
      const tx = db.transaction((rows: any[]) => {
        for (const r of rows) {
          upsert.run({
            customer_id: r.customer_id, tenant_id: r.tenant_id || tenantId,
            name: r.name, phone: r.phone || null, address: r.address || null,
            total_points_earned: r.total_points_earned ?? 0,
            total_points_redeemed: r.total_points_redeemed ?? 0,
            current_points_balance: r.current_points_balance ?? 0,
            last_purchase_date: toSqliteDate(r.last_purchase_date),
            is_deleted: r.is_deleted ? 1 : 0,
            created_at: toSqliteDate(r.created_at), updated_at: toSqliteDate(r.updated_at),
          });
        }
      });
      tx(rows);
      return reconcilePending(db, 'customers', 'customer_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} customers.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull customers failed.');
  }
  return result.hasChanged && result.count > 0;
}

async function pullLoyaltyTransactions(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO loyalty_transactions (transaction_id, tenant_id, customer_id, invoice_id,
      transaction_type, points, points_balance_before, points_balance_after,
      reference_number, description, created_by, sync_status, created_at)
    VALUES (@transaction_id, @tenant_id, @customer_id, @invoice_id,
      @transaction_type, @points, @points_balance_before, @points_balance_after,
      @reference_number, @description, @created_by, 'SYNCED', @created_at)
    ON CONFLICT(transaction_id) DO UPDATE SET
      transaction_type = excluded.transaction_type, points = excluded.points,
      points_balance_before = excluded.points_balance_before,
      points_balance_after = excluded.points_balance_after,
      reference_number = excluded.reference_number, description = excluded.description,
      sync_status = 'SYNCED'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'loyalty_transactions',
    urlPath: '/api/sync/loyalty-transactions',
    label: 'loyalty transactions',
    tsColumn: 'created_at',
    onProgress: (fetched) => notifyPullProgress('loyalty transactions', fetched),
    processPage: (rows) => {
      const tx = db.transaction((rows: any[]) => {
        for (const r of rows) {
          upsert.run({
            transaction_id: r.transaction_id, tenant_id: r.tenant_id || tenantId,
            customer_id: r.customer_id, invoice_id: r.invoice_id || null,
            transaction_type: r.transaction_type, points: r.points,
            points_balance_before: r.points_balance_before ?? 0,
            points_balance_after: r.points_balance_after ?? 0,
            reference_number: r.reference_number || null, description: r.description || null,
            created_by: r.created_by || null, created_at: toSqliteDate(r.created_at),
          });
        }
      });
      tx(rows);
      return reconcilePending(db, 'loyalty_transactions', 'transaction_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} loyalty transactions.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull loyalty transactions failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Sync Returns (Edge → Cloud) ──────────────────────────────────────────
async function syncReturns(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM returns WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} returns to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE returns SET sync_status = 'SYNCED' WHERE return_id = ? AND tenant_id = ?`);
  const itemsUpdateStmt = db.prepare(`UPDATE return_items SET sync_status = 'SYNCED' WHERE return_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const enriched = batch.map((r: any) => {
      const items = db.prepare(`SELECT * FROM return_items WHERE return_id = ? AND tenant_id = ?`).all(r.return_id, tenantId);
      return { ...r, items };
    });
    const synced = await pushBatch(
      '/api/sync/returns',
      token, enriched, 'returns', `Returns batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => {
        for (const id of ids) {
          updateStmt.run(id, tenantId);
          itemsUpdateStmt.run(id, tenantId);
        }
      });
      tx(synced);
    }
  }
}

// ── Pull Returns (Cloud → Edge) ──────────────────────────────────────────
async function pullReturns(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsertReturn = db.prepare(`
    INSERT INTO returns (return_id, invoice_id, tenant_id, user_id, return_number, customer_name, customer_phone, subtotal, tax_total, grand_total, reason, return_date, refund_method, adjusted_invoice_number, adjusted_amount, sync_status, created_at, updated_at)
    VALUES (@return_id, @invoice_id, @tenant_id, @user_id, @return_number, @customer_name, @customer_phone, @subtotal, @tax_total, @grand_total, @reason, @return_date, @refund_method, @adjusted_invoice_number, @adjusted_amount, 'SYNCED', @created_at, @updated_at)
    ON CONFLICT(return_id) DO UPDATE SET
      customer_name = excluded.customer_name, customer_phone = excluded.customer_phone,
      subtotal = excluded.subtotal, tax_total = excluded.tax_total, grand_total = excluded.grand_total,
      reason = excluded.reason, return_date = excluded.return_date,
      refund_method = excluded.refund_method, adjusted_invoice_number = excluded.adjusted_invoice_number,
      adjusted_amount = excluded.adjusted_amount, updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE returns.sync_status != 'PENDING'
  `);

  const upsertItem = db.prepare(`
    INSERT INTO return_items (return_item_id, return_id, tenant_id, invoice_item_id, product_id, name, quantity, unit_price, tax_amount, total, sync_status, created_at)
    VALUES (@return_item_id, @return_id, @tenant_id, @invoice_item_id, @product_id, @name, @quantity, @unit_price, @tax_amount, @total, 'SYNCED', @created_at)
    ON CONFLICT(return_item_id) DO UPDATE SET
      name = excluded.name, quantity = excluded.quantity, unit_price = excluded.unit_price,
      tax_amount = excluded.tax_amount, total = excluded.total, sync_status = 'SYNCED'
    WHERE return_items.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'returns',
    urlPath: '/api/sync/returns',
    label: 'returns',
    onProgress: (fetched) => notifyPullProgress('returns', fetched),
    processPage: (rows) => {
      const tx = db.transaction((returns: any[]) => {
        for (const r of returns) {
          try {
            upsertReturn.run({
              return_id: r.return_id, invoice_id: r.invoice_id, tenant_id: tenantId,
              user_id: r.user_id || null, return_number: r.return_number,
              customer_name: r.customer_name || null, customer_phone: r.customer_phone || null,
              subtotal: r.subtotal, tax_total: r.tax_total ?? 0, grand_total: r.grand_total,
              reason: r.reason || null, return_date: toSqliteDate(r.return_date),
              refund_method: r.refund_method || r.payment_method || null,
              adjusted_invoice_number: r.adjusted_invoice_number || null,
              adjusted_amount: Number(r.adjusted_amount) || 0,
              created_at: toSqliteDate(r.created_at), updated_at: toSqliteDate(r.updated_at),
            });
            if (Array.isArray(r.items)) {
              for (const item of r.items) {
                upsertItem.run({
                  return_item_id: item.return_item_id, return_id: r.return_id, tenant_id: tenantId,
                  invoice_item_id: item.invoice_item_id || null, product_id: item.product_id,
                  name: item.name, quantity: item.quantity, unit_price: item.unit_price,
                  tax_amount: item.tax_amount ?? 0, total: item.total,
                  created_at: toSqliteDate(item.created_at),
                });
              }
            }
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling return:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'returns', 'return_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} returns from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled} PENDING.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull returns failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Payment Sources Sync (Edge → Cloud) ─────────────────────────────────────────
async function syncPaymentSources(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM payment_sources WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} payment sources to cloud...`);

  const updateStmt = db.prepare(`UPDATE payment_sources SET sync_status = 'SYNCED' WHERE source_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/payment_sources',
      token, batch, 'payment_sources', `Payment Sources batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id); });
      tx(synced);
    }
  }
}

// ── Payment Source Transactions Sync (Edge → Cloud) ─────────────────────────────
async function syncPaymentSourceTransactions(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM payment_source_transactions WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} payment source transactions to cloud...`);

  const updateStmt = db.prepare(`UPDATE payment_source_transactions SET sync_status = 'SYNCED' WHERE transaction_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/payment_source_transactions',
      token, batch, 'payment_source_transactions', `Payment Source Transactions batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id); });
      tx(synced);
    }
  }
}

// ── Pull Payment Sources (Cloud → Edge) ─────────────────────────────────────────
async function pullPaymentSources(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO payment_sources (
      source_id, tenant_id, name, type, bank_name, account_number, holder_name, upi_id,
      opening_balance, current_balance, is_default, is_enabled, sort_order, is_deleted,
      sync_status, created_at, updated_at
    ) VALUES (
      @source_id, @tenant_id, @name, @type, @bank_name, @account_number, @holder_name, @upi_id,
      @opening_balance, @current_balance, @is_default, @is_enabled, @sort_order, @is_deleted,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(source_id) DO UPDATE SET
      name = excluded.name, type = excluded.type,
      bank_name = excluded.bank_name, account_number = excluded.account_number,
      holder_name = excluded.holder_name, upi_id = excluded.upi_id,
      opening_balance = excluded.opening_balance, current_balance = excluded.current_balance,
      is_default = excluded.is_default, is_enabled = excluded.is_enabled,
      sort_order = excluded.sort_order, is_deleted = excluded.is_deleted,
      updated_at = excluded.updated_at, sync_status = 'SYNCED'
    WHERE payment_sources.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'payment_sources',
    urlPath: '/api/sync/payment_sources',
    label: 'payment sources',
    onProgress: (fetched) => notifyPullProgress('payment sources', fetched),
    processPage: (rows) => {
      const tx = db.transaction((rows: any[]) => {
        for (const r of rows) {
          try {
            upsert.run({
              source_id: r.source_id, tenant_id: tenantId, name: r.name, type: r.type,
              bank_name: r.bank_name || null, account_number: r.account_number || null,
              holder_name: r.holder_name || null, upi_id: r.upi_id || null,
              opening_balance: r.opening_balance ?? 0, current_balance: r.current_balance ?? 0,
              is_default: r.is_default ? 1 : 0, is_enabled: r.is_enabled === false ? 0 : 1,
              sort_order: r.sort_order ?? 0, is_deleted: r.is_deleted ? 1 : 0,
              created_at: toSqliteDate(r.created_at), updated_at: toSqliteDate(r.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling payment source:', e.message);
          }
        }
      });
      tx(rows);
      return rows.length;
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} payment sources from cloud.`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull payment sources failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Payment Source Transactions (Cloud → Edge) ─────────────────────────────
async function pullPaymentSourceTransactions(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO payment_source_transactions (
      transaction_id, tenant_id, source_id, type, amount, category, notes, reference_number,
      transaction_date, running_balance, entered_by, entered_by_name, sync_status, created_at, updated_at
    ) VALUES (
      @transaction_id, @tenant_id, @source_id, @type, @amount, @category, @notes, @reference_number,
      @transaction_date, @running_balance, @entered_by, @entered_by_name, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(transaction_id) DO UPDATE SET
      type = excluded.type, amount = excluded.amount, category = excluded.category,
      notes = excluded.notes, reference_number = excluded.reference_number,
      transaction_date = excluded.transaction_date, running_balance = excluded.running_balance,
      entered_by = excluded.entered_by, entered_by_name = excluded.entered_by_name,
      updated_at = excluded.updated_at, sync_status = 'SYNCED'
    WHERE payment_source_transactions.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'payment_source_transactions',
    urlPath: '/api/sync/payment_source_transactions',
    label: 'payment source transactions',
    onProgress: (fetched) => notifyPullProgress('payment source transactions', fetched),
    processPage: (rows) => {
      const tx = db.transaction((rows: any[]) => {
        for (const r of rows) {
          try {
            upsert.run({
              transaction_id: r.transaction_id, tenant_id: tenantId, source_id: r.source_id,
              type: r.type, amount: r.amount ?? 0, category: r.category || null,
              notes: r.notes || null, reference_number: r.reference_number || null,
              transaction_date: toSqliteDate(r.transaction_date),
              running_balance: r.running_balance ?? 0,
              entered_by: r.entered_by || null, entered_by_name: r.entered_by_name || null,
              created_at: toSqliteDate(r.created_at), updated_at: toSqliteDate(r.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling payment source transaction:', e.message);
          }
        }
      });
      tx(rows);
      return rows.length;
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} payment source transactions from cloud.`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull payment source transactions failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Combo Offers Sync (Edge → Cloud) ──────────────────────────────────────────
async function syncComboOffers(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM combo_offers WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} combo offers to cloud in batches of ${BATCH_SIZE}...`);

  const getItemsStmt = db.prepare(`SELECT product_id, quantity FROM combo_items WHERE combo_id = ?`);
  const updateStmt = db.prepare(`UPDATE combo_offers SET sync_status = 'SYNCED' WHERE combo_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const combos = batch.map((c: any) => {
      const items = getItemsStmt.all(c.combo_id) as any[];
      return {
        ...c,
        is_active: !!c.is_active,
        is_deleted: !!c.is_deleted,
        items: items.map(item => ({
          product_id: item.product_id,
          quantity: Number(item.quantity) || 1,
        })),
      };
    });

    const synced = await pushBatch(
      '/api/sync/combo_offers',
      token,
      combos,
      'combo_offers',
      `Combo offers batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Pull Combo Offers (Cloud → Edge) ─────────────────────────────────────────
async function pullComboOffers(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsertCombo = db.prepare(`
    INSERT INTO combo_offers (
      combo_id, tenant_id, name, sku_barcode, combo_price,
      is_active, is_deleted, description, sync_status, created_at, updated_at
    ) VALUES (
      @combo_id, @tenant_id, @name, @sku_barcode, @combo_price,
      @is_active, @is_deleted, @description, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(combo_id) DO UPDATE SET
      name = excluded.name,
      sku_barcode = excluded.sku_barcode,
      combo_price = excluded.combo_price,
      is_active = excluded.is_active,
      is_deleted = excluded.is_deleted,
      description = excluded.description,
      created_at = COALESCE(combo_offers.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE combo_offers.sync_status != 'PENDING'
  `);

  const deleteItems = db.prepare(`DELETE FROM combo_items WHERE combo_id = ?`);
  const insertItem = db.prepare(`
    INSERT INTO combo_items (combo_item_id, combo_id, tenant_id, product_id, quantity, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'combo_offers',
    urlPath: '/api/sync/combo_offers',
    label: 'combo offers',
    onProgress: (fetched) => notifyPullProgress('combo offers', fetched),
    processPage: (rows) => {
      const tx = db.transaction((combos: any[]) => {
        for (const c of combos) {
          try {
            const cid = c.combo_id;
            upsertCombo.run({
              combo_id: cid,
              tenant_id: tenantId,
              name: c.name || '',
              sku_barcode: c.sku_barcode ? String(c.sku_barcode).trim() : null,
              combo_price: Number(c.combo_price) || 0,
              is_active: parseIsDeleted(c.is_active) ? 1 : (c.is_active === false || c.is_active === 0 ? 0 : 1),
              is_deleted: parseIsDeleted(c.is_deleted),
              description: c.description || null,
              created_at: toSqliteDate(c.created_at),
              updated_at: toSqliteDate(c.updated_at),
            });

            if (Array.isArray(c.items)) {
              deleteItems.run(cid);
              for (const item of c.items) {
                insertItem.run(
                  item.combo_item_id || crypto.randomUUID(),
                  cid,
                  tenantId,
                  item.product_id,
                  Number(item.quantity) || 1
                );
              }
            }
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling combo offer row:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'combo_offers', 'combo_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} combo offers from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull combo offers failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Quotations Sync (Edge → Cloud) ───────────────────────────────────────────────
async function syncQuotations(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM quotations WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = '' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} quotations to cloud in batches of ${BATCH_SIZE}...`);

  const getItems = db.prepare(`SELECT * FROM quotation_items WHERE quotation_id = ?`);
  const updateStmt = db.prepare(`UPDATE quotations SET sync_status = 'SYNCED', tenant_id = ? WHERE quotation_id = ?`);
  const updateItemsStmt = db.prepare(`UPDATE quotation_items SET sync_status = 'SYNCED', tenant_id = ? WHERE quotation_id = ?`);

  let totalSynced = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const quotationsWithItems = batch.map((q: any) => ({
      ...q,
      tenant_id: tenantId,
      subtotal: Number(q.subtotal) || 0,
      tax_total: Number(q.tax_total) || 0,
      grand_total: Number(q.grand_total) || 0,
      converted_to_invoice: parseIsDeleted(q.converted_to_invoice),
      items: (getItems.all(q.quotation_id) as any[]).map((item: any) => ({
        ...item,
        tenant_id: tenantId,
        quantity: Number(item.quantity) || 0,
        weight: item.weight != null ? Number(item.weight) : null,
        rate: Number(item.rate) || 0,
        amount: Number(item.amount) || 0,
      })),
    }));

    const synced = await pushBatch(
      '/api/sync/quotations',
      token,
      quotationsWithItems,
      'quotations',
      `Quotations batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      totalSynced += synced.length;
      const tx = db.transaction((ids: string[]) => {
        for (const id of ids) {
          updateStmt.run(tenantId, id);
          updateItemsStmt.run(tenantId, id);
        }
      });
      tx(synced);
    }
  }
  console.log(`[SyncWorker] Pushed ${totalSynced} quotations to cloud.`);
}

// ── Pull Quotations (Cloud → Edge) ─────────────────────────────────────────────
async function pullQuotations(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();
  let hasContentChanged = false;

  const upsertQtn = db.prepare(`
    INSERT INTO quotations (
      quotation_id, tenant_id, quotation_number, customer_name, customer_phone, customer_address,
      terms_conditions, subtotal, tax_total, grand_total, status, converted_to_invoice, invoice_id,
      sync_status, created_at, updated_at
    ) VALUES (
      @quotation_id, @tenant_id, @quotation_number, @customer_name, @customer_phone, @customer_address,
      @terms_conditions, @subtotal, @tax_total, @grand_total, @status, @converted_to_invoice, @invoice_id,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(quotation_id) DO UPDATE SET
      customer_name = EXCLUDED.customer_name,
      customer_phone = EXCLUDED.customer_phone,
      customer_address = EXCLUDED.customer_address,
      terms_conditions = EXCLUDED.terms_conditions,
      subtotal = EXCLUDED.subtotal,
      tax_total = EXCLUDED.tax_total,
      grand_total = EXCLUDED.grand_total,
      status = EXCLUDED.status,
      converted_to_invoice = EXCLUDED.converted_to_invoice,
      invoice_id = EXCLUDED.invoice_id,
      updated_at = EXCLUDED.updated_at,
      sync_status = 'SYNCED'
    WHERE quotations.sync_status != 'PENDING'
  `);

  const upsertItem = db.prepare(`
    INSERT INTO quotation_items (
      item_id, quotation_id, tenant_id, product_id, name, quantity, weight, rate, amount, sync_status, created_at
    ) VALUES (
      @item_id, @quotation_id, @tenant_id, @product_id, @name, @quantity, @weight, @rate, @amount, 'SYNCED', @created_at
    )
    ON CONFLICT(item_id) DO UPDATE SET
      name = EXCLUDED.name,
      quantity = EXCLUDED.quantity,
      weight = EXCLUDED.weight,
      rate = EXCLUDED.rate,
      amount = EXCLUDED.amount,
      sync_status = 'SYNCED'
  `);

  const deleteItems = db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?');

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'quotations',
    urlPath: '/api/sync/quotations',
    label: 'quotations',
    onProgress: (fetched) => notifyPullProgress('quotations', fetched),
    processPage: (rows) => {
      const tx = db.transaction((quotations: any[]) => {
        for (const q of quotations) {
          try {
            if (q.status === 'DELETED' || q.is_deleted) {
              db.prepare("UPDATE quotations SET status = 'DELETED', sync_status = 'SYNCED' WHERE quotation_id = ?").run(q.quotation_id);
              deleteItems.run(q.quotation_id);
              continue;
            }
            upsertQtn.run({
              quotation_id: q.quotation_id,
              tenant_id: tenantId,
              quotation_number: q.quotation_number,
              customer_name: q.customer_name || null,
              customer_phone: q.customer_phone || null,
              customer_address: q.customer_address || null,
              terms_conditions: q.terms_conditions || null,
              subtotal: Number(q.subtotal) || 0,
              tax_total: Number(q.tax_total) || 0,
              grand_total: Number(q.grand_total) || 0,
              status: q.status || 'ACTIVE',
              converted_to_invoice: parseIsDeleted(q.converted_to_invoice),
              invoice_id: q.invoice_id || null,
              created_at: toSqliteDate(q.created_at),
              updated_at: toSqliteDate(q.updated_at),
            });

            let itemsList = Array.isArray(q.items) ? q.items : (Array.isArray(q.quotation_items) ? q.quotation_items : (Array.isArray(q.quotationItems) ? q.quotationItems : null));
            if (itemsList && itemsList.length > 0) {
              if (itemsList.length > 1) {
                const timestamps: number[] = itemsList.map((i: any) => i.created_at ? new Date(i.created_at).getTime() : 0).filter(Boolean);
                const uniqueTs = Array.from(new Set<number>(timestamps));
                if (uniqueTs.length > 1) {
                  const latestTs = Math.max(...uniqueTs);
                  itemsList = itemsList.filter((i: any) => (i.created_at ? new Date(i.created_at).getTime() : 0) === latestTs);
                }
              }
              deleteItems.run(q.quotation_id);
              for (let idx = 0; idx < itemsList.length; idx++) {
                const item = itemsList[idx];
                const itemId = item.item_id || item.id || item.quotation_item_id || `${q.quotation_id}_item_${idx + 1}`;
                const itemName = item.name || item.product_name || 'Item';
                upsertItem.run({
                  item_id: String(itemId),
                  quotation_id: String(q.quotation_id),
                  tenant_id: tenantId,
                  product_id: item.product_id ? String(item.product_id) : null,
                  name: String(itemName),
                  quantity: Number(item.quantity) || 1,
                  weight: item.weight != null ? Number(item.weight) : null,
                  rate: Number(item.rate) || 0,
                  amount: Number(item.amount) || 0,
                  created_at: toSqliteDate(item.created_at || q.created_at || new Date().toISOString()),
                });
              }
            }
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling quotation:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'quotations', 'quotation_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} quotations from cloud.`);
    hasContentChanged = true;
  }
  return hasContentChanged;
}
