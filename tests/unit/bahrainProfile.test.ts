import { DatabaseSync } from 'node:sqlite';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SELECTABLE_STORE_COUNTRIES, STORE_PROFILES, getCurrencyDecimals, getDefaultTaxRate, getSampleBarcode, getStoreProfile,
  isUaeStore, isValidTaxRegistration, isVatStore, localizeTaxText, normalizeStoreCountry, setStoreCountry, setStoreVatInclusive,
} from '../../src/utils/localization/storeProfile';
import { buildCheckoutLines, buildQuotationLines, resolveSupplyType } from '../../src/utils/pricing/checkoutLines';
import type { CartItem } from '../../src/store/cartStore';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import {
  formatStoreMoney, getStoreCountrySetting, isVatCountry, parseStoreCountry, saveStoreCountry, storeCountryTimezone,
  storeMoneyDecimals, storeMoneyProfile,
} from '../../electron/services/storeCountryService';
import { profileInvoicePrefix } from '../../electron/utils/invoiceNumberPrefix';

afterEach(() => { setStoreCountry('IN'); setStoreVatInclusive(false); });

function ean13CheckDigit(first12: string): number {
  const sum = [...first12].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

describe('Bahrain shop profile (renderer)', () => {
  it('reads BH from plain and serialized settings and keeps India for anything unknown', () => {
    expect(normalizeStoreCountry('BH')).toBe('BH');
    expect(normalizeStoreCountry('"BH"')).toBe('BH');
    for (const value of [null, undefined, 'bad', 'bh', 'SA', {}, 'IN']) expect(normalizeStoreCountry(value)).toBe('IN');
  });

  it('describes BHD with three decimals, 10% VAT, Bahrain time and the GS1 608 prefix', () => {
    setStoreCountry('BH');
    expect(getStoreProfile()).toMatchObject({ currency: 'BHD', currencyPrefix: 'BHD ', locale: 'en-BH', timezone: 'Asia/Bahrain', taxName: 'VAT', phonePrefix: '+973' });
    expect(getCurrencyDecimals()).toBe(3);
    expect(getDefaultTaxRate()).toBe(10);
    const barcode = getSampleBarcode();
    expect(barcode).toMatch(/^608\d{10}$/);
    expect(Number(barcode[12])).toBe(ean13CheckDigit(barcode.slice(0, 12)));
  });

  it('is a VAT shop without being a UAE shop', () => {
    setStoreCountry('BH');
    expect(isVatStore()).toBe(true);
    expect(isUaeStore()).toBe(false);
    expect(localizeTaxText('GST Invoice with GSTIN')).toBe('VAT Invoice with VAT No.');
    expect(isValidTaxRegistration('200000000000002')).toBe(true);
    expect(isValidTaxRegistration('32ABCDE1234F1Z5')).toBe(false);
    expect(isValidTaxRegistration('')).toBe(true);
  });

  it('calculates one VAT amount with no Indian tax components', () => {
    setStoreCountry('BH'); setStoreVatInclusive(true);
    const item = { product_id: 'p', name: 'Goods', quantity: 2, base_price: 110, tax_rate_percent: 10 } as CartItem;
    expect(resolveSupplyType('GST', 'Manama', 'Riffa')).toBe('INTRA');
    const [line] = buildCheckoutLines([item], { invoiceType: 'GST', supplyType: 'INTRA', bosTaxRatePercent: 0, bosTaxInclusive: false, pcsSnapshot: {}, newId: () => 'id' });
    expect(line).toMatchObject({ unit_price: 100, total: 200, tax_amount: 20, cgst_amount: 0, sgst_amount: 0, igst_amount: 0 });
    expect(buildQuotationLines([item], { isGstQuotation: true, isInterState: true })[0]).toMatchObject({ taxable_amount: 200, cgst_amount: 0, sgst_amount: 0, igst_amount: 0 });
  });

  it('can be chosen in Settings now that Bahrain support is complete', () => {
    expect(SELECTABLE_STORE_COUNTRIES).toEqual(['IN', 'AE', 'BH']);
  });
});

describe('existing countries are unchanged by the Bahrain profile', () => {
  it('India stays GST with two decimals and no default tax', () => {
    expect(isVatStore()).toBe(false);
    expect(isUaeStore()).toBe(false);
    expect(getCurrencyDecimals()).toBe(2);
    expect(getDefaultTaxRate()).toBe(0);
    expect(localizeTaxText('GST Invoice with GSTIN')).toBe('GST Invoice with GSTIN');
    expect(isValidTaxRegistration('32ABCDE1234F1Z5')).toBe(true);
    expect(isValidTaxRegistration('32ABCDE1234F1Z')).toBe(false);
    expect(STORE_PROFILES.IN).toMatchObject({ currency: 'INR', currencyPrefix: '₹', locale: 'en-IN', timezone: 'Asia/Kolkata', registrationName: 'GSTIN' });
  });

  it('UAE stays VAT at 5% with two decimals and TRN wording', () => {
    setStoreCountry('AE');
    expect(isVatStore()).toBe(true);
    expect(isUaeStore()).toBe(true);
    expect(getCurrencyDecimals()).toBe(2);
    expect(getDefaultTaxRate()).toBe(5);
    expect(localizeTaxText('GST Invoice with GSTIN')).toBe('VAT Invoice with TRN');
    expect(STORE_PROFILES.AE).toMatchObject({ currency: 'AED', currencyPrefix: 'AED ', locale: 'en-AE', timezone: 'Asia/Dubai' });
  });
});

describe('Bahrain shop profile (main process)', () => {
  it('mirrors the renderer profile', () => {
    expect(parseStoreCountry('BH')).toBe('BH');
    expect(parseStoreCountry('"BH"')).toBe('BH');
    for (const value of [null, undefined, 'bad', 'SA', {}]) expect(parseStoreCountry(value)).toBe('IN');
    expect([isVatCountry('IN'), isVatCountry('AE'), isVatCountry('BH')]).toEqual([false, true, true]);
    expect([storeCountryTimezone('IN'), storeCountryTimezone('AE'), storeCountryTimezone('BH')]).toEqual(['Asia/Kolkata', 'Asia/Dubai', 'Asia/Bahrain']);
    for (const country of ['IN', 'AE', 'BH'] as const) {
      const profile = STORE_PROFILES[country];
      expect(storeMoneyProfile(country)).toEqual({ prefix: profile.currencyPrefix, locale: profile.locale });
      expect(storeMoneyDecimals(country)).toBe(profile.currencyDecimals);
      expect(storeCountryTimezone(country)).toBe(profile.timezone);
      expect(isVatCountry(country)).toBe(profile.taxRegime === 'VAT');
    }
  });

  it('formats BHD with three decimals and leaves INR and AED at two', () => {
    expect(formatStoreMoney(1234.5, 'BH')).toBe('BHD 1,234.500');
    expect(formatStoreMoney(-0.005, 'BH')).toBe('-BHD 0.005');
    expect(formatStoreMoney(1234567.5, 'IN')).toBe('₹12,34,567.50');
    expect(formatStoreMoney(1234567.5, 'AE')).toBe('AED 1,234,567.50');
  });

  it('uses the VAT- tax-series prefix in Bahrain and keeps custom prefixes', () => {
    expect(profileInvoicePrefix('BH', 'gst_invoice_counter_config', 'GST-')).toBe('VAT-');
    expect(profileInvoicePrefix('BH', 'gst_invoice_counter_config', 'TAX-')).toBe('TAX-');
    expect(profileInvoicePrefix('BH', 'invoice_counter_config', 'GST-')).toBe('GST-');
    expect(profileInvoicePrefix('AE', 'gst_invoice_counter_config', 'GST-')).toBe('VAT-');
    expect(profileInvoicePrefix('IN', 'gst_invoice_counter_config', 'GST-')).toBe('GST-');
  });

  it('saves and reads BH store country for a clean shop', () => {
    const raw = new DatabaseSync(':memory:');
    const db = Object.assign(raw, { transaction: (fn: () => unknown) => fn }) as unknown as Pick<Database, 'prepare' | 'transaction'>;
    createCoreTables(db);
    expect(saveStoreCountry(db, 'shop', 'BH').success).toBe(true);
    expect(getStoreCountrySetting(db, 'shop')).toBe('BH');
    expect(getStoreCountrySetting(db, 'other')).toBe('IN');
    raw.close();
  });
});
