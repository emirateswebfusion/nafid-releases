import { describe, expect, it } from 'vitest';
import {
  displayInvoiceNumber,
  getNextOffsetInvoiceNumber,
  getNumericPart,
  matchesDocumentNumber,
} from '../../src/utils/pricing/invoiceNumberHelper';

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

  it('expands beyond padding length when count exceeds digit capacity', () => {
    expect(getNextOffsetInvoiceNumber('INV-99', ['INV-99'])).toBe('INV-100');
  });

  it('handles complex multi-slash or multi-hyphen prefixes', () => {
    const existing = ['POS/MAIN/REG-1/004', 'POS/MAIN/REG-1/005'];
    expect(getNextOffsetInvoiceNumber('POS/MAIN/REG-1/004', existing)).toBe('POS/MAIN/REG-1/006');
  });

  it('ignores numbers with a different prefix or non-numeric existing elements', () => {
    expect(
      getNextOffsetInvoiceNumber('INV-001', [
        'ABC-001',
        'INV-002',
        null as unknown as string,
        undefined as unknown as string,
        '',
        'INVALID',
      ]),
    ).toBe('INV-001');
  });

  it('returns the input unchanged when it has no numeric suffix', () => {
    expect(getNextOffsetInvoiceNumber('INV', ['INV-001'])).toBe('INV');
  });

  it('returns an empty string for an empty base', () => {
    expect(getNextOffsetInvoiceNumber('', ['INV-001'])).toBe('');
  });

  it('increments digit-only invoice numbers and preserves zero padding', () => {
    expect(getNextOffsetInvoiceNumber('001', ['001', '002'])).toBe('003');
    expect(getNextOffsetInvoiceNumber('42', ['42'])).toBe('43');
    expect(getNextOffsetInvoiceNumber('001', ['INV-001'])).toBe('001');
  });
});

describe('getNumericPart', () => {
  it('extracts and joins all digit groups', () => {
    expect(getNumericPart('SCR-0012/B7')).toBe('00127');
    expect(getNumericPart('INV/2026/042')).toBe('2026042');
  });

  it('returns empty string for inputs without digits', () => {
    expect(getNumericPart('ABC-DEF')).toBe('');
    expect(getNumericPart('')).toBe('');
  });
});

describe('matchesDocumentNumber', () => {
  it('returns true when query digits are contained in candidate digits', () => {
    expect(matchesDocumentNumber('SCR-0012', '12')).toBe(true);
    expect(matchesDocumentNumber('RET-2026-05', '260')).toBe(true);
  });

  it('returns false when query has no digits or candidate does not contain query digits', () => {
    expect(matchesDocumentNumber('SCR-0012', 'SCR')).toBe(false);
    expect(matchesDocumentNumber('SCR-0012', '')).toBe(false);
    expect(matchesDocumentNumber('SCR-0012', '99')).toBe(false);
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
