import { afterEach, describe, expect, it } from 'vitest';
import { formatAmount, formatCurrency, parseAmount } from '../../src/utils/pricing/money';
import { setStoreCountry } from '../../src/utils/localization/storeProfile';

describe('formatCurrency', () => {
  it('groups digits the Indian way with two decimals', () => {
    expect(formatCurrency(1234567.5)).toBe('₹12,34,567.50');
  });

  it('puts the sign before the symbol', () => {
    expect(formatCurrency(-50)).toBe('-₹50.00');
  });

  it('treats null, undefined, NaN, Infinity, and junk strings as zero', () => {
    for (const v of [null, undefined, NaN, Infinity, -Infinity, 'abc']) {
      expect(formatCurrency(v)).toBe('₹0.00');
    }
    expect(formatCurrency('12.345')).toBe('₹12.35');
  });

  it('supports plain (ungrouped) and whole-rupee output', () => {
    expect(formatCurrency(1234.5, { grouping: false })).toBe('₹1234.50');
    expect(formatCurrency(1234.4, { decimals: 0 })).toBe('₹1,234');
  });

  it('handles rounding boundaries at .005 and .004', () => {
    expect(formatCurrency(12.005)).toBe('₹12.01');
    expect(formatCurrency(12.004)).toBe('₹12.00');
    expect(formatCurrency(12.005, { grouping: false })).toBe('₹12.01');
  });

  it('formats very large values with correct Indian lakh/crore commas', () => {
    expect(formatCurrency(100000000)).toBe('₹10,00,00,000.00');
    expect(formatCurrency(99999999.99)).toBe('₹9,99,99,999.99');
  });

  it('supports custom decimal precision', () => {
    expect(formatCurrency(10.1234, { decimals: 3 })).toBe('₹10.123');
    expect(formatCurrency(10.1236, { decimals: 3 })).toBe('₹10.124');
  });

  it('never prints a negative zero', () => {
    expect(formatCurrency(-0.001)).toBe('₹0.00');
    expect(formatCurrency(-0.00001, { grouping: false })).toBe('₹0.00');
  });
});

describe('parseAmount (TB-2: comma-grouped prices)', () => {
  it('reads digit-grouping commas instead of collapsing to 0 or 1', () => {
    expect(parseAmount('1,250')).toBe(1250);
    expect(parseAmount('12,34,567.50')).toBe(1234567.5);
    expect(parseAmount('1,234,567.5')).toBe(1234567.5);
    expect(parseAmount(' 1250 ')).toBe(1250);
    expect(parseAmount('₹1,250')).toBe(1250);
    expect(parseAmount('AED 1,250.75')).toBe(1250.75);
    expect(parseAmount('.5')).toBe(0.5);
    expect(parseAmount('-50')).toBe(-50);
    expect(parseAmount(1250)).toBe(1250);
  });

  it('returns null for empty or non-numeric input', () => {
    for (const v of ['', '   ', 'abc', '1.2.3', '12a', '-', '.', null, undefined, NaN, Infinity, {}]) {
      expect(parseAmount(v)).toBeNull();
    }
  });

  it('lets formatCurrency show a comma-grouped amount instead of ₹0.00', () => {
    expect(formatCurrency('1,250')).toBe('₹1,250.00');
  });
});

describe('formatAmount', () => {
  it('omits the symbol and applies Indian grouping', () => {
    expect(formatAmount(98765.4)).toBe('98,765.40');
  });

  it('supports custom decimals', () => {
    expect(formatAmount(98765.456, 3)).toBe('98,765.456');
    expect(formatAmount(98765.456, 0)).toBe('98,765');
  });
});

describe('UAE (AED) shop', () => {
  afterEach(() => setStoreCountry('IN'));

  it('prefixes AED and groups digits in thousands', () => {
    setStoreCountry('AE');
    expect(formatCurrency(1234.5)).toBe('AED 1,234.50');
    expect(formatCurrency(1234567.5)).toBe('AED 1,234,567.50');
    expect(formatCurrency(100000000)).toBe('AED 100,000,000.00');
  });

  it('puts the sign before AED and never prints ₹ or a negative zero', () => {
    setStoreCountry('AE');
    expect(formatCurrency(-50)).toBe('-AED 50.00');
    expect(formatCurrency(-0.001)).toBe('AED 0.00');
    expect(formatCurrency(null)).toBe('AED 0.00');
    expect(formatCurrency(1234.4, { decimals: 0 })).toBe('AED 1,234');
    expect(formatCurrency(1234.5, { grouping: false })).toBe('AED 1234.50');
  });

  it('formats symbol-less amounts with en-AE grouping', () => {
    setStoreCountry('AE');
    expect(formatAmount(1234567.4)).toBe('1,234,567.40');
  });

  it('returns to Indian output when the shop is India', () => {
    setStoreCountry('AE');
    setStoreCountry('IN');
    expect(formatCurrency(1234567.5)).toBe('₹12,34,567.50');
  });
});
