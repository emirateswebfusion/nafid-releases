import { describe, expect, it } from 'vitest';
import { generateReceiptText, type ReceiptData, DEFAULT_BILL_SETTINGS } from '../../src/utils/print/receiptGenerator';
import { formatWhatsAppBillMessage } from '../../src/utils/print/whatsappBillHelper';

describe('Thermal bill and WhatsApp tax breakup', () => {
  it('correctly calculates and displays CGST and SGST when total tax is present even if cgst/sgst fields were not pre-split', () => {
    const data: ReceiptData = {
      shopName: 'Test Shop',
      invoiceNumber: 'PCHN-006',
      date: '05/11/2026, 01:39:04 PM',
      items: [
        {
          name: '[COMBO] Offer Day',
          quantity: 1,
          unit_price: 350,
          total: 350,
        },
      ],
      subtotal: 333.33,
      tax: 16.67,
      grandTotal: 350,
      invoiceType: 'BILL_OF_SUPPLY',
      billSettings: { ...DEFAULT_BILL_SETTINGS, showBosTaxBreakup: true },
    };

    // Boxed style receipt
    const boxedText = generateReceiptText(data, 8, undefined, 'boxed');
    expect(boxedText).toContain('CGST');
    expect(boxedText).toContain('SGST');
    // Total is 16.67 -> split into 8.34 and 8.33
    expect(boxedText).toContain('8.34');
    expect(boxedText).toContain('8.33');
    expect(boxedText).not.toContain('0.00    │   0.00    │  16.67');

    // Standard/Classic style receipt
    const standardText = generateReceiptText(data, 8, undefined, 'standard');
    expect(standardText).toContain('TAX BREAKUP');
    expect(standardText).toContain('8.34');
    expect(standardText).toContain('8.33');

    // WhatsApp bill message
    const msg = formatWhatsAppBillMessage({
      shopName: data.shopName,
      invoiceNumber: data.invoiceNumber,
      date: data.date,
      grandTotal: data.grandTotal,
      subtotal: data.subtotal,
      tax: data.tax,
      items: [
        {
          name: '[COMBO] Offer Day',
          quantity: 1,
          unit_price: 350,
          total: 350,
        },
      ],
    });
    expect(msg).toContain('CGST:');
    expect(msg).toContain('SGST:');
    expect(msg).toContain('8.34');
    expect(msg).toContain('8.33');
  });
});
