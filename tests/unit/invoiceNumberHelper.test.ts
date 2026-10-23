import { describe, expect, it } from 'vitest';
import { displayInvoiceNumber, getNextOffsetInvoiceNumber } from '../../src/utils/invoiceNumberHelper';

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

describe('displayInvoiceNumber', () => {
  it('prefixes GST- for GST invoices in single-series mode', () => {
    expect(displayInvoiceNumber('INV-004', 'GST', false)).toBe('GST-INV-004');
  });
  it('does not double an existing GST- prefix (was GST-GST-001)', () => {
    expect(displayInvoiceNumber('GST-001', 'GST', false)).toBe('GST-001');
    expect(displayInvoiceNumber('gst-001', 'GST', false)).toBe('gst-001');
  });
  it('leaves other types, three-series mode and empty numbers alone', () => {
    expect(displayInvoiceNumber('POS1-009', 'BILL_OF_SUPPLY', false)).toBe('POS1-009');
    expect(displayInvoiceNumber('B2B-001', 'GST', true)).toBe('B2B-001');
    expect(displayInvoiceNumber('', 'GST', false)).toBe('');
  });
});
