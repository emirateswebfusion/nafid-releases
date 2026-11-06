/** ISO-8601 UTC timestamp for a Date/string/number; invalid input falls back to now. */

export function toIsoTimestamp(d: Date | string | number = new Date()): string {
  const dateObj = d instanceof Date ? d : new Date(typeof d === 'string' ? (toEpochMs(d) ?? NaN) : d);
  return isNaN(dateObj.getTime()) ? new Date().toISOString() : dateObj.toISOString();
}

/** Epoch ms of a stored timestamp: ISO (`...Z` / offset) or SQLite UTC text (`YYYY-MM-DD HH:MM:SS[.mmm]`); null if empty or
 * unparseable. */
export function toEpochMs(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const str = String(v).trim();
  const iso = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(str) ? str.replace(' ', 'T') : str.replace(' ', 'T') + 'Z';
  const ms = new Date(iso).getTime();
  return isNaN(ms) ? null : ms;
}
