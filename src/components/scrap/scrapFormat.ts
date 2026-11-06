import { storeDate } from '../../utils/time/dateDisplay';
import { getStoreLocale } from '../../utils/localization/storeProfile';
/** Scrap screen display helpers: amount and stock formatting, dates, day grouping, avatar colour and initials. */
import { formatCurrency as formatMoney } from '../../utils/pricing/money';
import { getStoreTimezone } from '../../utils/time/timezoneHelper';
import { parseUTCDate } from '../../utils/print/receiptGenerator';

export const formatCurrency = (amount: number | undefined | null) =>
  amount == null || isNaN(amount) ? '-' : formatMoney(amount);

export const formatStock = (stock: number | string | undefined | null) => {
  if (stock == null || stock === '') return '0';
  const n = Number(stock);
  if (isNaN(n)) return '0';
  return parseFloat(n.toFixed(3)).toString();
};

export { formatDateTime } from '../../utils/time/dateDisplay';

export const formatGroupDate = (dateStr?: string | null) => {
  if (!dateStr) return '-';
  const tz = getStoreTimezone();
  const d = parseUTCDate(dateStr);
  if (isNaN(d.getTime())) return '-';
  const dd = storeDate(d, getStoreLocale(), { timeZone: tz, day: '2-digit' });
  const mm = storeDate(d, getStoreLocale(), { timeZone: tz, month: '2-digit' });
  const yyyy = storeDate(d, getStoreLocale(), { timeZone: tz, year: 'numeric' });
  const dayName = storeDate(d, getStoreLocale(), { timeZone: tz, weekday: 'long' });
  return `${dd}/${mm}/${yyyy} ${dayName}`;
};

export const nameToHue = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
};

export const getInitials = (name: string) =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
