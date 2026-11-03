import { getStoreLocale } from '../../utils/localization/storeProfile';
import { getStoreTimezone, toStoreWallClock } from '../../utils/time/timezoneHelper';
import { parseUTCDate } from '../../utils/print/receiptGenerator';

export const formatDate = (d: string) => {
  if (!d) return '—';
  const tz = getStoreTimezone();
  return parseUTCDate(d).toLocaleDateString(getStoreLocale(), { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
};

export { formatDateTime } from '../../utils/time/dateDisplay';

/** A stored instant as a datetime-local value on the shop's wall clock (store timezone, not the PC's). */
export const toLocalInputValue = (iso: string): string => {
  const d = parseUTCDate(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 16);
  const w = toStoreWallClock(d);
  return `${w.date}T${w.time}`;
};

export const nameToHue = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
};

export const getInitials = (name: string) =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
