/** Captured once at checkout. Historical bills never consult current settings. */
export interface BillPolicySettings {
  exclude_b2b_from_revenue?: unknown;
  exclude_b2c_from_revenue?: unknown;
  filing_only_mode?: { enabled?: boolean; reduceStock?: boolean; countInRevenue?: boolean };
}
export function resolveBillPolicy(invoiceType: string, gstin: string | null | undefined, filingOnly: boolean, settings: BillPolicySettings) {
  if (filingOnly) {
    if (!settings.filing_only_mode?.enabled) throw new Error('Filing-only bill mode is disabled');
    if (invoiceType !== 'GST') throw new Error('Filing-only bills require a GST invoice');
    return { counts_in_revenue: settings.filing_only_mode.countInRevenue === true ? 1 : 0,
      bill_purpose: 'FILING_ONLY' as const, stock_applied: settings.filing_only_mode.reduceStock === true ? 1 : 0 };
  }
  const excluded = invoiceType === 'GST' && (gstin?.trim() ? settings.exclude_b2b_from_revenue : settings.exclude_b2c_from_revenue) === true;
  return { counts_in_revenue: excluded ? 0 : 1, bill_purpose: 'SALE' as const, stock_applied: 1 };
}
