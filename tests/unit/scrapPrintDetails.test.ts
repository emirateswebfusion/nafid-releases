import { describe, expect, it } from 'vitest';
import { buildScrapPrintDetails } from '../../src/components/scrap/scrapPrintDetails';
import type { ScrapInvoiceTxRow } from '../../src/components/scrap/scrapTypes';

describe('buildScrapPrintDetails', () => {
  it('uses only available scrap and session details', () => {
    const transaction = {
      party_name: 'Asha Rao',
      customer_phone: '555-0142',
      customer_address: 'Market Road',
    } satisfies Pick<ScrapInvoiceTxRow, 'party_name' | 'customer_phone' | 'customer_address' | 'party_phone' | 'party_address'>;

    expect(buildScrapPrintDetails(transaction, {}, 'Cashier')).toEqual({
      billerName: 'Cashier',
      customerName: 'Asha Rao',
      customerPhone: '555-0142',
      customerAddress: 'Market Road',
    });
  });

  it('honors hidden customer and biller settings', () => {
    expect(buildScrapPrintDetails(undefined, {
      showBillerName: false,
      showCustomerName: false,
      showCustomerPhone: false,
      showCustomerAddress: false,
    }, 'Cashier')).toEqual({
      billerName: undefined,
      customerName: undefined,
      customerPhone: undefined,
      customerAddress: undefined,
    });
  });
});
