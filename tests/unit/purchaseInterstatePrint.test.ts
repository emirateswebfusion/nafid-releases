import { afterEach, expect, it } from 'vitest';
import { generatePurchaseBillHtml } from '../../src/utils/print/invoiceHtml/purchaseBillHtml';
import { setStoreCountry } from '../../src/utils/localization/storeProfile';
afterEach(() => setStoreCountry('IN'));
it('prints the saved interstate purchase as IGST and preserves the intrastate split', () => {
  setStoreCountry('IN');
  const bill = { bill_number: 'P-1', supplier_name: 'Supplier', bill_date: '2026-11-17', bill_type: 'GST', total_amount: 118 };
  const items = [{ name: 'Product', quantity: 1, purchase_price: 100, total_amount: 100, is_gst_applicable: 1, tax_rate_percent: 18 }];
  const interstate = generatePurchaseBillHtml({}, { ...bill, is_interstate: 1 }, items);
  expect(interstate).toContain('<span>IGST:</span>');
  expect(interstate).not.toContain('<span>CGST:</span>');
  expect(interstate).not.toContain('<span>SGST:</span>');
  const intrastate = generatePurchaseBillHtml({}, bill, items);
  expect(intrastate).toContain('<span>CGST:</span>');
  expect(intrastate).toContain('<span>SGST:</span>');
});
