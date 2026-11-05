import { isDuplicateScrapCash } from './duplicateScrapCash.js';
import type { CashTransactionRow } from './typesA.js';
import { getStoreTimezoneSetting, localDate, parseCleanDate, storeWallClockToUtc } from './storeTime.js';
import { getCashRegisterPreferences } from './cashRegisterPreferences.js';
import { toEpochMs } from '../utils/timestamps.js';
import * as cashDrawerSql from '../db/statements/cashDrawer.js';
import type { Db } from '../db/statements/types.js';

/**
 * Drawer sessions: which bills and cash entries belong to a drawer, and when a drawer closes itself.
 *
 * Timestamps are stored in UTC; the store timezone setting only decides business dates and wall-clock times.
 * A drawer's session runs from the close of the previous drawer (or the start of its business date in the store
 * timezone when there is none) up to its own close; an open drawer's session has no end. So a shop that bills past
 * midnight keeps those bills in the drawer that is still open, and every bill belongs to exactly one drawer.
 *
 * Drawers closed before this model was installed (`cash_drawer_session_since`, set on first use) are frozen: their
 * stored totals are history and are never recomputed.
 */

export const AUTO_CLOSE_KEY = 'cash_drawer_auto_close';
export const AUTO_CLOSE_TIME_KEY = 'cash_drawer_auto_close_time';
export const DEFAULT_AUTO_CLOSE_TIME = '23:30';
/** Minutes past the due time after which the main process closes an open drawer itself (nobody answered the prompt,
 * or the app was not running at the auto close time). */
export const AUTO_CLOSE_BACKSTOP_MINUTES = 15;

const SESSION_SINCE_KEY = 'cash_drawer_session_since';
const SNOOZE_KEY = 'cash_drawer_auto_close_snooze';

export interface DrawerWindow {
  /** Exclusive lower bound (UTC ISO). */
  from: string;
  /** Inclusive upper bound (UTC ISO); null while the drawer is open. */
  to: string | null;
}

export interface AutoCloseConfig {
  enabled: boolean;
  /** HH:MM in the store timezone; a time before 12:00 means after midnight (the next calendar day). */
  time: string;
}

/** The cash_drawer columns these rules read. */
export interface DrawerRow {
  drawer_id: string;
  business_date: string;
  status?: string;
  closed_at?: string | null;
  opening_balance?: number | null;
}

function readSetting(db: Db, tenantId: string, key: string): unknown {
  const row = cashDrawerSql.findDrawerSetting(db).get(tenantId, key, tenantId) as { value?: unknown } | undefined;
  if (!row || row.value === null || row.value === undefined) return undefined;
  if (typeof row.value !== 'string') return row.value;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function writeLocalSetting(db: Db, tenantId: string, key: string, value: unknown) {
  cashDrawerSql.upsertLocalDrawerSetting(db).run(tenantId, key, JSON.stringify(value));
}

export function getAutoCloseConfig(db: Db, tenantId: string): AutoCloseConfig {
  const enabledRaw = readSetting(db, tenantId, AUTO_CLOSE_KEY);
  const enabled = enabledRaw === true || enabledRaw === 1 || String(enabledRaw).trim().toLowerCase() === 'true';
  const timeRaw = readSetting(db, tenantId, AUTO_CLOSE_TIME_KEY);
  const time = typeof timeRaw === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(timeRaw.trim()) ? timeRaw.trim() : DEFAULT_AUTO_CLOSE_TIME;
  return { enabled, time };
}

/** When this terminal started using drawer sessions. The first call installs them (see
 * closeDrawersLeftOpenBeforeSessions), so call it before reading a drawer that may be closed by that. */
export function getSessionSinceMs(db: Db, tenantId: string): number {
  const stored = toEpochMs(readSetting(db, tenantId, SESSION_SINCE_KEY));
  if (stored !== null) return stored;
  // Whole seconds: closed_at (CURRENT_TIMESTAMP) has no milliseconds, so a drawer closed in this second still counts.
  const now = Math.floor(Date.now() / 1000) * 1000;
  writeLocalSetting(db, tenantId, SESSION_SINCE_KEY, new Date(now).toISOString());
  closeDrawersLeftOpenBeforeSessions(db, tenantId, now);
  return now;
}

/**
 * The previous version closed a drawer from an earlier day on its next start. A drawer still open from an earlier day
 * when sessions are installed is closed the same way, at the end of its own business day, so it does not take in the
 * bills made since; closed before the cut-over, it is then frozen like the rest of the history.
 */
function closeDrawersLeftOpenBeforeSessions(db: Db, tenantId: string, sinceMs: number) {
  const tz = getStoreTimezoneSetting(db, tenantId);
  for (const d of findOpenDrawersBeforeDate(db, tenantId, localDate(new Date(sinceMs), tenantId))) {
    const date = parseCleanDate(d.business_date, tz);
    const closedMs = Math.min(storeWallClockToUtc(date, 23, 59, 59, tz).getTime(), sinceMs - 1000);
    const closedAt = new Date(closedMs).toISOString();
    const t = computeDrawerTotals(db, tenantId, { ...d, status: 'CLOSED', closed_at: closedAt });
    cashDrawerSql.closeDrawerAutomatically(db).run(
      t.cash_sales, t.cash_in, t.cash_out, t.expected, t.expected, t.expected, closedAt, 'Auto-closed past shift on date transition', null, d.drawer_id,
    );
  }
}

/** A drawer closed before sessions were installed keeps the totals it was closed with. */
export function isFrozenDrawer(db: Db, tenantId: string, drawer: DrawerRow): boolean {
  if (drawer.status !== 'CLOSED') return false;
  const closedMs = toEpochMs(drawer.closed_at);
  return closedMs === null || closedMs < getSessionSinceMs(db, tenantId);
}

export function getDrawerWindow(db: Db, tenantId: string, drawer: DrawerRow): DrawerWindow {
  const sinceMs = getSessionSinceMs(db, tenantId); // first: installing sessions closes drawers left open earlier
  const tz = getStoreTimezoneSetting(db, tenantId);
  const date = parseCleanDate(drawer.business_date, tz);
  const dayStartMs = storeWallClockToUtc(date, 0, 0, 0, tz).getTime();
  const prev = cashDrawerSql.findPreviousDrawerClosedAt(db).get(tenantId, drawer.drawer_id, date) as { closed_at?: string | null } | undefined;
  const prevMs = toEpochMs(prev?.closed_at);
  // A previous drawer closed before sessions existed counted its bills by date; start this one at its own date then.
  const fromMs = prevMs !== null && prevMs >= sinceMs ? prevMs : dayStartMs;
  const toMs = drawer.status === 'CLOSED' ? toEpochMs(drawer.closed_at) : null;
  return { from: new Date(fromMs).toISOString(), to: toMs === null ? null : new Date(toMs).toISOString() };
}

function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** When an open drawer is due to close automatically (UTC ms), including a snooze the cashier asked for. */
export function getAutoCloseDueMs(db: Db, tenantId: string, drawer: DrawerRow, config: AutoCloseConfig): number {
  const tz = getStoreTimezoneSetting(db, tenantId);
  const date = parseCleanDate(drawer.business_date, tz);
  const [h, m] = config.time.split(':').map(Number);
  const dueMs = storeWallClockToUtc(h < 12 ? nextDate(date) : date, h, m, 0, tz).getTime();
  const snooze = readSetting(db, tenantId, SNOOZE_KEY) as { drawer_id?: string; until?: string } | undefined;
  const untilMs = snooze && snooze.drawer_id === drawer.drawer_id ? toEpochMs(snooze.until) : null;
  return untilMs !== null && untilMs > dueMs ? untilMs : dueMs;
}

/** Postpone the auto close of a drawer by `minutes` from now (1–240). */
export function snoozeDrawerAutoClose(db: Db, tenantId: string, drawerId: string, minutes: number) {
  const mins = Math.min(240, Math.max(1, Math.round(Number(minutes) || 0)));
  writeLocalSetting(db, tenantId, SNOOZE_KEY, { drawer_id: drawerId, until: new Date(Date.now() + mins * 60_000).toISOString() });
}

/** Open drawers, oldest business date first. */
export function findOpenDrawers(db: Db, tenantId: string): DrawerRow[] {
  return cashDrawerSql.findOpenDrawersBefore(db).all(tenantId, '9999-12-31') as DrawerRow[];
}

/** Open drawers from a business date before `date` (a forgotten drawer that must be closed first). */
export function findOpenDrawersBeforeDate(db: Db, tenantId: string, date: string): DrawerRow[] {
  return cashDrawerSql.findOpenDrawersBefore(db).all(tenantId, date) as DrawerRow[];
}

interface CashRegisterEntry extends CashTransactionRow {
  transaction_date: string | null; entered_by: string | null; entered_by_name: string | null;
  created_at: string | null; updated_at: string | null; reference_number: string | null;
  sync_status: string | null; row_version: number; origin: string | null;
  source?: 'ledger' | 'return';
}

interface RegisterCashEntry extends CashRegisterEntry {
  ledger_id?: string; ledger_date?: string; credit_amount?: number; debit_amount?: number;
  ledger_method?: string; ledger_deleted?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface DrawerTotals {
  cash_sales: number;
  cash_in: number;
  cash_out: number;
  expected: number;
}

/** Cash sales, cash in / out and expected cash of a drawer's session. */
export function getRegisterCashEntries(db: Db, tenantId: string, drawer: DrawerRow): CashRegisterEntry[] {
  const w = getDrawerWindow(db, tenantId, drawer);
  const prefs = getCashRegisterPreferences(db, tenantId);
  const rows = cashDrawerSql.listRegisterCashTransactions(db).all(tenantId, drawer.drawer_id, w.from, w.to, w.to) as RegisterCashEntry[];
  const entries: CashRegisterEntry[] = [];
  const tz = getStoreTimezoneSetting(db, tenantId);
  const businessDate = parseCleanDate(drawer.business_date, tz);
  for (const row of rows) {
    if (row.category === 'RETURN_REFUND' || (row.category === 'SCRAP_SALE' && !prefs.includeScrapSales)) continue;
    if (isDuplicateScrapCash(row)) continue;
    const linkedLedger = row.category?.startsWith('PARTY_LEDGER:');
    const ledgerEntry = linkedLedger || row.category === 'Party Payment' || row.category === 'Party Receipt';
    let amount = Number(row.amount) || 0;
    let type = row.type;
    if (ledgerEntry) {
      if (prefs.ledgerMode === 'off') continue;
      if (linkedLedger) {
        if (!row.ledger_id || row.ledger_deleted || row.ledger_method?.toUpperCase() !== 'CASH') continue;
        amount = Math.abs(Number(row.credit_amount) - Number(row.debit_amount));
        type = Number(row.credit_amount) > Number(row.debit_amount) ? 'CASH_OUT' : 'CASH_IN';
      }
      if (prefs.ledgerMode === 'today') {
        const timestamp = toEpochMs(row.ledger_date || row.transaction_date);
        if (timestamp === null || new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(timestamp)) !== businessDate) continue;
      }
    }
    entries.push({
      transaction_id: row.transaction_id, tenant_id: row.tenant_id, drawer_id: row.drawer_id, type, amount,
      category: linkedLedger ? (type === 'CASH_IN' ? 'Party Receipt' : 'Party Payment') : row.category,
      notes: row.notes, reference_number: row.reference_number, entered_by: row.entered_by,
      entered_by_name: row.entered_by_name, transaction_date: row.transaction_date,
      sync_status: row.sync_status, created_at: row.created_at, updated_at: row.updated_at,
      row_version: row.row_version, origin: row.origin, source: linkedLedger ? 'ledger' : undefined,
    });
  }
  if (prefs.deductReturns) {
    const refunds = cashDrawerSql.listRegisterCashReturns(db).all(tenantId, w.from, w.to, w.to) as Array<{
      return_id: string; return_number: string; tenant_id: string; grand_total: number; created_at: string; user_id: string | null;
    }>;
    for (const refund of refunds) entries.push({
      transaction_id: `return:${refund.return_id}`, tenant_id: refund.tenant_id, drawer_id: drawer.drawer_id,
      type: 'CASH_OUT', amount: Math.max(0, Number(refund.grand_total) || 0), category: 'RETURN_REFUND',
      notes: `Return refund for ${refund.return_number}`, entered_by: refund.user_id, entered_by_name: null,
      transaction_date: refund.created_at, created_at: refund.created_at, updated_at: refund.created_at, reference_number: refund.return_number, sync_status: null, row_version: 0, origin: null, source: 'return',
    });
  }
  return entries.sort((a, b) => {
    const left = a.transaction_date || '';
    const right = b.transaction_date || '';
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

/** Cash Register, settlement and closing all use this same cash feed and sales window. */
export function computeDrawerTotals(db: Db, tenantId: string, drawer: DrawerRow): DrawerTotals {
  const w = getDrawerWindow(db, tenantId, drawer);
  const salesRow = cashDrawerSql.sumCashSalesInWindow(db).get(tenantId, w.from, w.to, w.to) as { total_cash_sales?: number } | undefined;
  const entries = getRegisterCashEntries(db, tenantId, drawer);
  const cashSales = round2(Number(salesRow?.total_cash_sales || 0));
  const cashIn = round2(entries.filter(row => row.type === 'CASH_IN').reduce((sum, row) => sum + Number(row.amount), 0));
  const cashOut = round2(entries.filter(row => row.type === 'CASH_OUT').reduce((sum, row) => sum + Number(row.amount), 0));
  const opening = round2(Number(drawer.opening_balance || 0));
  return { cash_sales: cashSales, cash_in: cashIn, cash_out: cashOut, expected: round2(opening + cashSales + cashIn - cashOut) };
}
