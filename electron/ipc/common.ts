import { app, BrowserWindow, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import log from 'electron-log/main';
import { getDb } from '../db/localDb.js';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null) {
  mainWindow = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

// ── GST Applicability Helper ────────────────────────────────────────────────
export const resolveGstApplicability = (gstFlag: unknown, hsnCode: unknown): number => {
  const hasHsnCode = String(hsnCode ?? '').trim() !== '';
  const isExplicitlyGst = gstFlag === undefined || gstFlag === null || gstFlag === true || gstFlag === 'true' || Number(gstFlag) === 1;
  return hasHsnCode || isExplicitlyGst ? 1 : 0;
};

// ── IPC Input Validation ────────────────────────────────────────────────────
export function validateString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid ${name}: expected non-empty string`);
  return value;
}

export function validateNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || isNaN(value)) throw new Error(`Invalid ${name}: expected number`);
  return value;
}

export function validateOptionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return validateString(value, name);
}

export function validateOptionalNumber(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return validateNumber(value, name);
}

export function validateObject<T extends Record<string, unknown>>(value: unknown, name: string): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Invalid ${name}: expected object`);
  return value as T;
}

export function validateArray<T>(value: unknown, name: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${name}: expected array`);
  return value;
}

export type IpcHandler<T, A extends unknown[]> = (event: Electron.IpcMainInvokeEvent, ...args: A) => T;

export function safeHandler<T, A extends unknown[]>(handler: IpcHandler<T, A>): IpcHandler<T, A> {
  return (event, ...args) => {
    try {
      return handler(event, ...args);
    } catch (err: any) {
      log.error(`[IPC] Validation error: ${err.message}`);
      throw err;
    }
  };
}

// ── Local Time Helpers ──────────────────────────────────────────────────────
export function getStoreTimezoneSetting(db: any, tenantId?: string): string {
  try {
    if (!db || !tenantId) return 'Asia/Kolkata';
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'store_timezone' AND (tenant_id = ? OR tenant_id = 'global') LIMIT 1`).get(tenantId) as any;
    if (row?.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (typeof parsed === 'string' && parsed) return parsed;
      if (parsed?.timezone) return parsed.timezone;
    }
  } catch {}
  return 'Asia/Kolkata';
}

/** Returns store timestamp in UTC ISO format: YYYY-MM-DDTHH:mm:ss.sssZ */
export function localTimestamp(d: Date = new Date()): string {
  return d.toISOString();
}

/** Returns store business date string in store timezone: YYYY-MM-DD */
export function localDate(d: Date = new Date(), tenantId?: string): string {
  try {
    const db = getDb();
    const tz = getStoreTimezoneSetting(db, tenantId || 'global');
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  }
}

/** Helper to compute start and end UTC bounds for business date range in store timezone */
export function getUtcRangeForStoreDateRange(fromDate?: string, toDate?: string, tenantId: string = 'global'): { startUtc: string; endUtc: string } {
  try {
    const db = getDb();
    const tz = getStoreTimezoneSetting(db, tenantId);
    const today = localDate(new Date(), tenantId);

    const startDay = fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) ? fromDate : today;
    const endDay = toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate) ? toDate : startDay;

    const parseWallClock = (dateStr: string, isEnd: boolean): Date => {
      const [y, m, d] = dateStr.split('-').map(Number);
      const targetH = isEnd ? 23 : 0;
      const targetMin = isEnd ? 59 : 0;
      const targetSec = isEnd ? 59 : 0;

      const baseUtc = new Date(Date.UTC(y, m - 1, d, targetH, targetMin, targetSec));
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false
        });

        const getParts = (d: Date) => {
          const parts = formatter.formatToParts(d);
          const map: Record<string, number> = {};
          for (const p of parts) {
            if (p.type !== 'literal') map[p.type] = Number(p.value);
          }
          return Date.UTC(map.year, map.month - 1, map.day, map.hour === 24 ? 0 : map.hour, map.minute, map.second);
        };

        const currentLocalAsUtc = getParts(baseUtc);
        const diffMs = baseUtc.getTime() - currentLocalAsUtc;
        return new Date(baseUtc.getTime() + diffMs);
      } catch {
        return baseUtc;
      }
    };

    const startUtcDate = parseWallClock(startDay, false);
    const endUtcDate = parseWallClock(endDay, true);

    return {
      startUtc: startUtcDate.toISOString(),
      endUtc: endUtcDate.toISOString()
    };
  } catch {
    const now = new Date();
    return { startUtc: now.toISOString(), endUtc: now.toISOString() };
  }
}

export function parseCleanDate(dStr: any, timeZone?: string): string {
  const activeTz = timeZone || (typeof getDb === 'function' && getDb() ? getStoreTimezoneSetting(getDb(), 'global') : 'Asia/Kolkata');
  if (!dStr) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: activeTz }).format(new Date());
    } catch {
      return localDate();
    }
  }
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

  let formatted = str.replace(/Z$/i, '');
  if (formatted.includes(' ')) formatted = formatted.replace(' ', 'T');

  const d = new Date(formatted);
  if (!isNaN(d.getTime())) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: activeTz }).format(d);
    } catch {
      return localDate(d);
    }
  }
  return str.slice(0, 10);
}

// ── Auth Token & Session Persistence Helpers ────────────────────────────────
export const getConfigPath = () => path.join(app.getPath('userData'), 'config.json');
export const getEncryptedPath = () => path.join(app.getPath('userData'), 'auth.enc');
export const getOfflineSessionPath = () => path.join(app.getPath('userData'), 'offline-auth.enc');

export const encrypt = (text: string): Buffer | null => {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[Auth] safeStorage unavailable — token will be stored in plaintext on disk');
    return Buffer.from(text);
  }
  return safeStorage.encryptString(text);
};

export const decrypt = (data: Buffer): string | null => {
  if (!safeStorage.isEncryptionAvailable()) return data.toString('utf-8');
  try {
    return safeStorage.decryptString(data);
  } catch {
    return null;
  }
};

export function readAuthPayload(): any {
  const encPath = getEncryptedPath();
  if (fs.existsSync(encPath)) {
    const raw = fs.readFileSync(encPath);
    const decrypted = decrypt(raw);
    if (decrypted) {
      try { return JSON.parse(decrypted); } catch {}
    }
  }
  const p = getConfigPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

export function clearOfflineSession() {
  const offlinePath = getOfflineSessionPath();
  if (fs.existsSync(offlinePath)) fs.unlinkSync(offlinePath);
}

export function readOfflineSession(): any {
  const offlinePath = getOfflineSessionPath();
  if (!fs.existsSync(offlinePath)) return null;
  const decrypted = decrypt(fs.readFileSync(offlinePath));
  if (!decrypted) return null;
  try {
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

export function deterministicUUID(seed: string): string {
  const hash = crypto.createHash('sha1').update(seed).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
