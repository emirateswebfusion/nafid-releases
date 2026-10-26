/** Scrap screen display helpers: amount and stock formatting, dates, day grouping, avatar colour and initials. */
import { formatCurrency as formatMoney } from '../../utils/money';
import { getStoreTimezone } from '../../utils/timezoneHelper';
import { parseUTCDate } from '../../utils/receiptGenerator';

export const formatCurrency = (amount: number | undefined | null) =>
  amount == null || isNaN(amount) ? '-' : formatMoney(amount);

export const formatStock = (stock: number | string | undefined | null) => {
  if (stock == null || stock === '') return '0';
  const n = Number(stock);
  if (isNaN(n)) return '0';
  return parseFloat(n.toFixed(3)).toString();
};

export { formatDateTime } from '../../utils/dateDisplay';

export const formatGroupDate = (dateStr?: string | null) => {
  if (!dateStr) return '-';
  const tz = getStoreTimezone();
  const d = parseUTCDate(dateStr);
  if (isNaN(d.getTime())) return '-';
  const dd = d.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit' });
  const mm = d.toLocaleDateString('en-IN', { timeZone: tz, month: '2-digit' });
  const yyyy = d.toLocaleDateString('en-IN', { timeZone: tz, year: 'numeric' });
  const dayName = d.toLocaleDateString('en-IN', { timeZone: tz, weekday: 'long' });
  return `${dd}/${mm}/${yyyy} ${dayName}`;
};

export const nameToHue = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
};

export const getInitials = (name: string) =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
