import { getDb } from '../db/localDb.js';
import * as storeTimeSql from '../db/statements/storeTime.js';

/** Store-timezone aware clock helpers. Business dates are always computed in the store timezone. */
export function getStoreTimezoneSetting(db: any, tenantId?: string): string {
  try {
    if (!db || !tenantId) return 'Asia/Kolkata';
    const row = storeTimeSql.findOneSettingByKey(db).get(tenantId) as any;
    if (row?.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (typeof parsed === 'string' && parsed) return parsed;
      if (parsed?.timezone) return parsed.timezone;
    }
  } catch { /* ignore */ }
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

/** The UTC instant of a store wall-clock time (`dateStr` YYYY-MM-DD, h:m:s in `tz`). */
export function storeWallClockToUtc(dateStr: string, h: number, m: number, sec: number, tz: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const baseUtc = new Date(Date.UTC(y, mo - 1, d, h, m, sec));
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });

    const getParts = (dt: Date) => {
      const parts = formatter.formatToParts(dt);
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
}

/** Helper to compute start and end UTC bounds for business date range in store timezone */
export function getUtcRangeForStoreDateRange(fromDate?: string, toDate?: string, tenantId: string = 'global'): { startUtc: string; endUtc: string } {
  try {
    const db = getDb();
    const tz = getStoreTimezoneSetting(db, tenantId);
    const today = localDate(new Date(), tenantId);

    const startDay = fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) ? fromDate : today;
    const endDay = toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate) ? toDate : startDay;

    const parseWallClock = (dateStr: string, isEnd: boolean): Date =>
      storeWallClockToUtc(dateStr, isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, tz);

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
