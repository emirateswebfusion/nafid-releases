import { expect, it } from 'vitest';
import { formatWhatsAppBillMessage } from '../../src/utils/print/whatsappBillHelper';
import { setStoreCountry } from '../../src/utils/localization/storeProfile';
const base = { shopName:'Test',invoiceNumber:'INV-1',date:'2026-11-05',items:[{name:'Steel',quantity:1,unit_price:100,total:100,hsn_sac_code:'7204',tax_rate_percent:18}],subtotal:100,discount:10,grandTotal:106.2 };
it('includes subtotal, discounts, HSN and split GST with two decimal places', () => {
  setStoreCountry('IN');
  const message = formatWhatsAppBillMessage({...base,tax:16.2,cgst:8.1,sgst:8.1});
  for (const value of ['*Subtotal:* ₹100.00','*Discount:* -₹10.00','*CGST:* ₹8.10','*SGST:* ₹8.10','HSN/SAC: 7204','GST: 18%']) expect(message).toContain(value);
});
it('uses supplied GST components even when aggregate tax is absent', () => {
  setStoreCountry('IN');
  expect(formatWhatsAppBillMessage({...base,cgst:8.1,sgst:8.1})).toContain('*CGST:* ₹8.10');
  expect(formatWhatsAppBillMessage({...base,tax:16.2,igst:16.2})).toContain('*IGST:* ₹16.20');
  expect(formatWhatsAppBillMessage(base)).toContain('*Subtotal:* ₹100.00');
});
