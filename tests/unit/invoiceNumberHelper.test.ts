import { describe, expect, it } from 'vitest';
import { getNextOffsetInvoiceNumber } from '../../src/utils/invoiceNumberHelper';

describe('getNextOffsetInvoiceNumber', () => {
  it('returns the base number when it is unused', () => {
    expect(getNextOffsetInvoiceNumber('INV-001', [])).toBe('INV-001');
  });

  it('increments past the highest consecutive used number', () => {
    expect(getNextOffsetInvoiceNumber('INV-001', ['INV-001'])).toBe('INV-002');
    expect(getNextOffsetInvoiceNumber('INV-001', ['INV-001', 'INV-002', 'INV-003'])).toBe('INV-004');
  });

  it('only fills the first gap, not the highest number', () => {
    expect(getNextOffsetInvoiceNumber('INV-001', ['INV-001', 'INV-003'])).toBe('INV-002');
  });

  it('preserves prefix and zero padding', () => {
    expect(getNextOffsetInvoiceNumber('KL/2026/0009', ['KL/2026/0009'])).toBe('KL/2026/0010');
  });

  it('ignores numbers with a different prefix', () => {
    expect(getNextOffsetInvoiceNumber('INV-001', ['ABC-001', 'INV-002'])).toBe('INV-001');
  });

  it('returns the input unchanged when it has no numeric suffix', () => {
    expect(getNextOffsetInvoiceNumber('INV', ['INV-001'])).toBe('INV');
  });

  it('returns an empty string for an empty base', () => {
    expect(getNextOffsetInvoiceNumber('', ['INV-001'])).toBe('');
  });
});
