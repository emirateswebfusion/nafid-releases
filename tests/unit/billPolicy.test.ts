import { describe, expect, it } from 'vitest';
import { resolveBillPolicy } from '../../electron/utils/billPolicy';

describe('per-bill filing policy', () => {
  it('preserves ordinary billing defaults', () => {
    expect(resolveBillPolicy('GST', '29ABCDE1234F1Z5', false, {})).toEqual({ counts_in_revenue: 1, bill_purpose: 'SALE', stock_applied: 1 });
  });
  it.each([true, false])('excludes only the selected GST category (B2B=%s)', b2b => {
    const settings = { exclude_b2b_from_revenue: b2b, exclude_b2c_from_revenue: !b2b };
    expect(resolveBillPolicy('GST', b2b ? 'GSTIN' : '', false, settings).counts_in_revenue).toBe(0);
    expect(resolveBillPolicy('GST', b2b ? '' : 'GSTIN', false, settings).counts_in_revenue).toBe(1);
    expect(resolveBillPolicy('BILL_OF_SUPPLY', '', false, settings).counts_in_revenue).toBe(1);
  });
  it.each([true, false])('filing-only captures stock/revenue choices (%s)', enabled => {
    expect(resolveBillPolicy('GST', '', true, { filing_only_mode: { enabled: true, reduceStock: enabled, countInRevenue: enabled } })).toEqual({ counts_in_revenue: enabled ? 1 : 0, bill_purpose: 'FILING_ONLY', stock_applied: enabled ? 1 : 0 });
  });
  it('refuses disabled filing mode', () => {
    expect(() => resolveBillPolicy('GST', '', true, {})).toThrow('disabled');
  });
  it('changing settings cannot mutate a captured bill', () => {
    const settings = { exclude_b2b_from_revenue: false };
    const oldBill = resolveBillPolicy('GST', 'GSTIN', false, settings);
    settings.exclude_b2b_from_revenue = true;
    expect(oldBill.counts_in_revenue).toBe(1);
    expect(resolveBillPolicy('GST', 'GSTIN', false, settings).counts_in_revenue).toBe(0);
  });
});
