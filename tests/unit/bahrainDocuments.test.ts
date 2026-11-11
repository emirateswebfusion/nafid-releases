import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getVatLabels, uaeDocumentTitle } from '../../src/utils/print/uaeLabels';
import { generateUaeInvoiceHtml, generateUaeReceipt } from '../../src/utils/print/uaeInvoice';
import { formatWhatsAppBillMessage } from '../../src/utils/print/whatsappBillHelper';
import { setStoreCountry, getStoreCountry, type StoreCountry } from '../../src/utils/localization/storeProfile';

describe('Bahrain Documents and Labels', () => {
  let prevCountry: StoreCountry;

  beforeEach(() => {
    prevCountry = getStoreCountry();
  });

  afterEach(() => {
    setStoreCountry(prevCountry);
  });

  it('provides correct Bahrain-specific VAT labels', () => {
    const bhLabels = getVatLabels('BH');
    expect(bhLabels.trn.en).toBe('VAT Account No.');
    expect(bhLabels.trn.ar).toBe('رقم الحساب الضريبي');
    expect(bhLabels.customerTrn.en).toBe('Customer VAT Account No.');
    expect(bhLabels.currency.en).toBe('Currency: BHD (Bahraini Dinar)');
    expect(bhLabels.amountsNote.en).toBe('All amounts in BHD; rates exclude VAT');

    const uaeLabels = getVatLabels('AE');
    expect(uaeLabels.trn.en).toBe('TRN');
    expect(uaeLabels.currency.en).toBe('Currency: AED (UAE Dirham)');
  });

  it('determines Bahrain document title (Simplified vs Standard Tax Invoice)', () => {
    // Registered shop, B2C, <= 500 BHD -> Simplified Tax Invoice
    const b2cSmall = uaeDocumentTitle(
      { shopGstin: '123456789012345', isB2B: false, grandTotal: 25.500, tax: 2.318 },
      'BH'
    );
    expect(b2cSmall.en).toBe('SIMPLIFIED TAX INVOICE');
    expect(b2cSmall.ar).toBe('فاتورة ضريبية مبسطة');

    // Registered shop, B2C, > 500 BHD -> Standard Tax Invoice
    const b2cLarge = uaeDocumentTitle(
      { shopGstin: '123456789012345', isB2B: false, grandTotal: 500.001, tax: 45.455 },
      'BH'
    );
    expect(b2cLarge.en).toBe('TAX INVOICE');

    // Registered shop, B2B -> Standard Tax Invoice regardless of amount
    const b2bSmall = uaeDocumentTitle(
      { shopGstin: '123456789012345', isB2B: true, grandTotal: 10.000, tax: 0.909 },
      'BH'
    );
    expect(b2bSmall.en).toBe('TAX INVOICE');

    // UAE always prints TAX INVOICE for registered tax sales
    const uaeSale = uaeDocumentTitle(
      { shopGstin: '123456789012345', isB2B: false, grandTotal: 25.50, tax: 1.21 },
      'AE'
    );
    expect(uaeSale.en).toBe('TAX INVOICE');

    // Unregistered shop prints INVOICE
    const unregistered = uaeDocumentTitle({ shopGstin: '', grandTotal: 10 }, 'BH');
    expect(unregistered.en).toBe('INVOICE');
  });

  it('generates Bahrain invoice HTML with 3 decimals and Bahrain labels', () => {
    setStoreCountry('BH');

    const html = generateUaeInvoiceHtml({
      shopName: 'Manama Retail W.L.L.',
      shopAddress: 'Building 123, Road 456, Block 789, Manama, Bahrain',
      shopPhone: '+973 17123456',
      shopGstin: '123456789012345',
      customerName: 'Ahmed Al-Khalifa',
      invoiceNumber: 'INV-BH-001',
      invoiceType: 'GST',
      date: '2026-11-10T12:00:00Z',
      items: [
        { name: 'Specialty Coffee Beans', quantity: 2, unit_price: 4.500, total: 9.000, tax_rate_percent: 10 }
      ],
      subtotal: 9.000,
      tax: 0.900,
      discount: 0,
      grandTotal: 9.900,
    });

    expect(html).toContain('SIMPLIFIED TAX INVOICE');
    expect(html).toContain('VAT Account No.');
    expect(html).toContain('Currency: BHD (Bahraini Dinar)');
    expect(html).toContain('9.000');
    expect(html).toContain('9.900');
  });

  it('generates Bahrain thermal receipt with 3 decimals and Bahrain labels', () => {
    setStoreCountry('BH');

    const receipt = generateUaeReceipt({
      shopName: 'Manama Retail W.L.L.',
      shopAddress: 'Manama',
      shopPhone: '+973 17123456',
      shopGstin: '123456789012345',
      invoiceNumber: 'INV-BH-002',
      invoiceType: 'GST',
      date: '2026-11-10T12:00:00Z',
      items: [
        { name: 'Arabic Sweets Box', quantity: 1, unit_price: 12.350, total: 12.350 }
      ],
      subtotal: 12.350,
      tax: 1.235,
      grandTotal: 13.585,
    });

    expect(receipt).toContain('VAT Account No.: 123456789012345');
    expect(receipt).toContain('All amounts in BHD; rates exclude VAT');
    expect(receipt).toContain('12.350');
    expect(receipt).toContain('13.585');
  });

  it('formats WhatsApp bill message with 3 decimals in Bahrain mode', () => {
    setStoreCountry('BH');

    const msg = formatWhatsAppBillMessage({
      shopName: 'Manama Store',
      invoiceNumber: 'BH-003',
      date: '10/11/2026',
      customerName: 'Khalid',
      grandTotal: 15.750,
      receivedAmount: 20.000,
      balanceAmount: 0,
      items: [
        { name: 'Dates 1kg', quantity: 1, unit_price: 15.750, total: 15.750, tax_rate_percent: 10 }
      ],
      tax: 1.432,
    });

    expect(msg).toContain('15.750');
    expect(msg).toContain('20.000');
  });
});
