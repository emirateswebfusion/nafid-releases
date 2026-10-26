import fs from 'fs';
import path from 'path';
import { app, safeStorage } from 'electron';
import { getDb } from '../db/localDb.js';
import { LAN_PLACEHOLDER_TOKEN } from './syncAuth.js';
import { getTotalPendingRecords } from './syncProgress.js';
import * as syncConfigSql from '../db/statements/sync/syncConfig.js';

/** Sync worker configuration: batch / pull limits, date helpers, the stored cloud login (config, encrypted auth, offline session) and the sync interval. */
export function localTimestamp(d: Date | string | number = new Date()): string {
  const dateObj = d instanceof Date ? d : new Date(d);
  return isNaN(dateObj.getTime()) ? new Date().toISOString() : dateObj.toISOString();
}

export function localDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

export function parseCleanDate(dStr: any): string {
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

export const getConfigPath = () => path.join(app.getPath('userData'), 'config.json');

export const getEncryptedPath = () => path.join(app.getPath('userData'), 'auth.enc');

export const getOfflineSessionPath = () => path.join(app.getPath('userData'), 'offline-auth.enc');

export function decrypt(data: Buffer): string | null {
  if (!safeStorage.isEncryptionAvailable()) return data.toString('utf-8');
  try {
    return safeStorage.decryptString(data);
  } catch {
    return null;
  }
}

export function readAuthPayload(): any {
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

export function readOfflineSessionSafe(): any {
  try {
    const offlinePath = getOfflineSessionPath();
    if (!fs.existsSync(offlinePath)) return null;
    const decrypted = decrypt(fs.readFileSync(offlinePath));
    if (!decrypted) return null;
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

export function getTenantIdFromDb(): string | null {
  try {
    const db = getDb();
    const row = syncConfigSql.selectUsers(db).get() as { tenant_id: string } | undefined;
    if (row?.tenant_id) return row.tenant_id;
    const invRow = syncConfigSql.selectInvoices(db).get() as { tenant_id: string } | undefined;
    if (invRow?.tenant_id) return invRow.tenant_id;
    const settRow = syncConfigSql.selectSettings(db).get() as { tenant_id: string } | undefined;
    if (settRow?.tenant_id) return settRow.tenant_id;
  } catch { /* ignore */ }
  return null;
}

export const BATCH_SIZE = 20;

export const FETCH_TIMEOUT_MS = 300000;

export const PULL_PAGE_SIZE = 500;

export const PULL_CONCURRENCY = 4;

export const PULL_MAX_RETRIES = 3;

export const PULL_MAX_PAGES = 50;

export const CURSOR_REPLAY_SECONDS = 5;

export const isGstApplicableProduct = (gstFlag: unknown, hsnCode: unknown): boolean => {
  const hasHsnCode = String(hsnCode ?? '').trim() !== '';
  const isExplicitlyGst = gstFlag === undefined || gstFlag === null || gstFlag === true || gstFlag === 'true' || Number(gstFlag) === 1;
  return hasHsnCode || isExplicitlyGst;
};

export function toSqliteDate(iso: string | number | Date | null | undefined): string {
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
  } catch { /* ignore */ }

  return str;
}

export function getSyncIntervalMs(): number {
  try {
    const db = getDb();
    const config = getAuthConfig();
    const tenantId = config?.tenant_id || 'global';
    const row = syncConfigSql.selectSettings2(db).get(tenantId) as { value: string } | undefined;
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
  } catch { /* ignore */ }
  const envMins = parseFloat(process.env.VENDORA_SYNC_INTERVAL_MINUTES || '2.0');
  return Math.max(30000, Math.round(envMins * 60 * 1000));
}

export function parseIsDeleted(val: any): number {
  if (val === true || val === 1 || val === '1' || val === 'true') return 1;
  return 0;
}

export function getAuthConfig(): { jwt_token: string; tenant_id: string } | null {
  try {
    const payload = readAuthPayload();
    if (payload?.jwt_token && payload?.tenant_id) {
      return { jwt_token: payload.jwt_token, tenant_id: payload.tenant_id };
    }
    // Fallback for offline login or LAN peer terminal:
    const offline = readOfflineSessionSafe();
    const tenantId = offline?.tenant_id || payload?.tenant_id || getTenantIdFromDb();
    if (tenantId) {
      return {
        jwt_token: payload?.jwt_token || LAN_PLACEHOLDER_TOKEN,
        tenant_id: tenantId,
      };
    }
    return null;
  } catch {
    return null;
  }
}
