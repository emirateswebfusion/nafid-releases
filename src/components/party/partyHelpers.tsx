import React from 'react';
import { Wallet, Building2, Smartphone, CreditCard, Receipt, MoreHorizontal } from 'lucide-react';
import { getStoreTimezone } from '../../utils/timezoneHelper';
import { parseUTCDate } from '../../utils/receiptGenerator';
import { getAppTimeFormat } from '../../utils/receiptGenerator';

export const formatDate = (d: string) => {
  if (!d) return '—';
  const tz = getStoreTimezone();
  return parseUTCDate(d).toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateTime = (d: string) => {
  if (!d) return '—';
  const tz = getStoreTimezone();
  return parseUTCDate(d).toLocaleString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: getAppTimeFormat() !== '24h' });
};

export const toUtcIso = (naive: string): string | undefined => {
  if (!naive) return undefined;
  const d = new Date(naive);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
};

export const toLocalInputValue = (iso: string): string => {
  const d = parseUTCDate(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const nameToHue = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
};

export const getInitials = (name: string) =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

export const PaymentMethodIcon = ({ method }: { method: string }) => {
  const map: Record<string, React.JSX.Element> = {
    CASH: <Wallet className="w-3.5 h-3.5" />,
    BANK_TRANSFER: <Building2 className="w-3.5 h-3.5" />,
    UPI: <Smartphone className="w-3.5 h-3.5" />,
    CARD: <CreditCard className="w-3.5 h-3.5" />,
    CHEQUE: <Receipt className="w-3.5 h-3.5" />,
    OTHER: <MoreHorizontal className="w-3.5 h-3.5" />,
  };
  return map[method] ?? <MoreHorizontal className="w-3.5 h-3.5" />;
};
