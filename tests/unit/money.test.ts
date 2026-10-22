import { describe, expect, it } from 'vitest';
import { formatAmount, formatCurrency } from '../../src/utils/money';

describe('formatCurrency', () => {
  it('groups digits the Indian way with two decimals', () => {
    expect(formatCurrency(1234567.5)).toBe('₹12,34,567.50');
  });
  it('puts the sign before the symbol', () => {
    expect(formatCurrency(-50)).toBe('-₹50.00');
  });
  it('treats null, undefined, NaN and junk strings as zero', () => {
    for (const v of [null, undefined, NaN, 'abc']) expect(formatCurrency(v)).toBe('₹0.00');
    expect(formatCurrency('12.345')).toBe('₹12.35');
  });
  it('supports plain (ungrouped) and whole-rupee output', () => {
    expect(formatCurrency(1234.5, { grouping: false })).toBe('₹1234.50');
    expect(formatCurrency(1234.4, { decimals: 0 })).toBe('₹1,234');
  });
  it('never prints a negative zero', () => {
    expect(formatCurrency(-0.001)).toBe('₹0.00');
  });
});

describe('formatAmount', () => {
  it('omits the symbol', () => {
    expect(formatAmount(98765.4)).toBe('98,765.40');
  });
});
