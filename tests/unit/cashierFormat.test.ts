import { describe, expect, it } from 'vitest';
import { formatCashierCategory, formatCashierNotes } from '../../src/components/cashier/cashierFormat';

describe('formatCashierCategory', () => {
  it('formats internal CREDIT_REFUND to Credit Refund', () => {
    expect(formatCashierCategory('CREDIT_REFUND')).toBe('Credit Refund');
  });

  it('formats internal RETURN_REFUND to Return Refund', () => {
    expect(formatCashierCategory('RETURN_REFUND')).toBe('Return Refund');
  });

  it('formats PARTY_LEDGER:<id> with party name to Party: <Name>', () => {
    expect(formatCashierCategory('PARTY_LEDGER:463dbe26-8f7b-4306-a702-e974fdbf9607', 'Aman Shop Butterfly', 'CASH_OUT'))
      .toBe('Party: Aman Shop Butterfly');
  });

  it('formats PARTY_LEDGER:<id> without party name to Party Payment or Party Receipt', () => {
    expect(formatCashierCategory('PARTY_LEDGER:463dbe26-8f7b-4306-a702-e974fdbf9607', null, 'CASH_OUT'))
      .toBe('Party Payment');
    expect(formatCashierCategory('PARTY_LEDGER:463dbe26-8f7b-4306-a702-e974fdbf9607', null, 'CASH_IN'))
      .toBe('Party Receipt');
  });

  it('replaces underscores in other categories', () => {
    expect(formatCashierCategory('OTHER_EXPENSE')).toBe('OTHER EXPENSE');
  });

  it('defaults null/undefined/empty to Other', () => {
    expect(formatCashierCategory(null)).toBe('Other');
    expect(formatCashierCategory('')).toBe('Other');
  });
});

describe('formatCashierNotes', () => {
  it('includes party context for PARTY_LEDGER rows if not already present', () => {
    expect(formatCashierNotes('Invoice settlement', 'Aman Shop Butterfly', 'PARTY_LEDGER:123'))
      .toBe('Aman Shop Butterfly — Invoice settlement');
    expect(formatCashierNotes('', 'Aman Shop Butterfly', 'PARTY_LEDGER:123'))
      .toBe('Party: Aman Shop Butterfly');
  });

  it('does not duplicate party name if already in notes', () => {
    expect(formatCashierNotes('Party: Aman Shop Butterfly | bill payment', 'Aman Shop Butterfly', 'PARTY_LEDGER:123'))
      .toBe('Party: Aman Shop Butterfly | bill payment');
  });

  it('returns normal notes for standard categories', () => {
    expect(formatCashierNotes('Office tea', null, 'Refreshments')).toBe('Office tea');
    expect(formatCashierNotes(null, null, 'Refreshments')).toBeNull();
  });
});
