import { describe, expect, it } from 'vitest';
import { generateInvoiceHtml, type InvoiceData } from '../../src/utils/print/invoiceHtmlGenerator';
import { DEFAULT_BILL_SETTINGS } from '../../src/utils/print/receiptGenerator';

const data: InvoiceData = { shopName: 'Shop', invoiceNumber: '1', date: '06/11/2026',
  items: [{ name: 'Item', quantity: 1, unit_price: 350, total: 350 }],
  subtotal: 333.33, tax: 16.67, discount: 0, grandTotal: 350,
  invoiceType: 'BILL_OF_SUPPLY', billSettings: { ...DEFAULT_BILL_SETTINGS, showBosTaxBreakup: true } };

describe('PDF dedicated tax breakup', () => {
  it.each(['standard', 'classic', 'modern', 'half-a4', 'boxed'] as const)('%s matches thermal rounding and visibility', style => {
    const html = generateInvoiceHtml(data, style);
    const section = html.slice(html.indexOf('<section aria-label="Tax Breakup"'), html.indexOf('</section>') + 10);
    expect(section).toContain('TAX BREAKUP');
    for (const value of ['333.33', '8.34', '8.33', '16.67']) expect(section).toContain(value);
    expect(generateInvoiceHtml({ ...data, tax: 0 }, style)).not.toContain('aria-label="Tax Breakup"');
    expect(generateInvoiceHtml({ ...data, billSettings: { ...data.billSettings!, showBosTaxBreakup: false } }, style)).not.toContain('aria-label="Tax Breakup"');
    const inter = generateInvoiceHtml({ ...data, igst: 16.67 }, style);
    expect(inter).toContain('IGST');
    expect(generateInvoiceHtml({ ...data, invoiceType: 'GST', billSettings: { ...data.billSettings!, showBosTaxBreakup: false } }, style)).toContain('aria-label="Tax Breakup"');
  });
});
