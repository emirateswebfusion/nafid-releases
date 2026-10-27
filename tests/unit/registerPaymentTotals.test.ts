import { describe, expect, it } from 'vitest';
import { calculateRegisterPayments } from '../../electron/utils/registerPaymentTotals';

describe('selected register payment totals', () => {
  const invoices = [
    { payment_method: 'UPI', grand_total: 100, received_amount: 100 },
    { payment_method: 'SPLIT', grand_total: 100, split_details: '{"cash":20,"upi":30,"card":50}' },
    { payment_method: 'CARD', grand_total: 80, received_amount: 50 },
    { payment_method: 'BANK_TRANSFER', grand_total: 25 },
    { payment_method: 'CHEQUE', grand_total: 35 },
  ];
  it('keeps the current display empty by default', () => expect(calculateRegisterPayments(invoices, [])).toEqual({}));
  it('shows only selected methods including their split amounts', () => {
    expect(calculateRegisterPayments(invoices, ['UPI', 'CARD'])).toEqual({ UPI: 130, CARD: 100 });
  });
  it('supports bank and cheque, including zero totals', () => {
    expect(calculateRegisterPayments(invoices, ['BANK_TRANSFER', 'CHEQUE'])).toEqual({ BANK_TRANSFER: 25, CHEQUE: 35 });
    expect(calculateRegisterPayments([], ['UPI'])).toEqual({ UPI: 0 });
  });
  it('does not count malformed splits or credit balances as receipts', () => {
    expect(calculateRegisterPayments([{ payment_method: 'SPLIT', grand_total: 100, split_details: 'bad' }, { payment_method: 'CREDIT', grand_total: 500 }], ['UPI'])).toEqual({ UPI: 0 });
  });
});
