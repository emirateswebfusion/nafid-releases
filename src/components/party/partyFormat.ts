import { getCurrencyDecimals, getCurrencyPrefix } from '../../utils/localization/storeProfile';

export { formatDateTime } from '../../utils/time/dateDisplay';
import { storeWallClockToUtcIso } from '../../utils/time/timezoneHelper';

// Converts a datetime-local value (e.g. "2026-08-16T23:25"), which is the shop's wall clock (store timezone, not
// the PC's), into the UTC ISO instant stored in the database. Returns undefined for empty/invalid input.
export const toUtcIso = (naive: string): string | undefined => {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(naive || '');
  return m ? storeWallClockToUtcIso(m[1], m[2] || '00:00') : undefined;
};

export function formatSignedLedgerBalance(balance: number): string {
  const sign = balance < 0 ? '−' : balance > 0 ? '+' : '';
  return `${sign}${getCurrencyPrefix()}${Math.abs(balance).toFixed(getCurrencyDecimals())}`;
}
