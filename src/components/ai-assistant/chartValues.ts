import { getCurrencyPrefix, getStoreLocale } from '../../utils/localization/storeProfile';

export function isAiCurrencyMetric(metric: string): boolean {
  return /^(?:amount|sales|price|cost|revenue|balance|due|total_amount|total_revenue)$/i.test(metric);
}

/** Counts/quantities never acquire a currency prefix; compact notation follows the shop locale. */
export function formatAiChartTick(value: unknown, metric: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '–';
  const formatted = new Intl.NumberFormat(getStoreLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(number);
  return `${isAiCurrencyMetric(metric) ? getCurrencyPrefix() : ''}${formatted}`;
}
