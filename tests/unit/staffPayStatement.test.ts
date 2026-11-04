import { describe, expect, it } from 'vitest';
import { buildPayStatement, totalPayableToStaff } from '../../src/utils/pricing/staffPayStatement';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10, 0, 0).toISOString();

const rows = [
  { transaction_date: at(2026, 10, 1), reference_type: 'SALARY_ACCRUAL', debit_amount: 6500, credit_amount: 0 },
  { transaction_date: at(2026, 10, 30), reference_type: 'SALARY_PAYMENT', debit_amount: 0, credit_amount: 6000 },
  { transaction_date: at(2026, 11, 1), reference_type: 'SALARY_ACCRUAL', debit_amount: 6500, credit_amount: 0 },
  { transaction_date: at(2026, 11, 2), reference_type: 'ADVANCE', debit_amount: 0, credit_amount: 1500 },
  { transaction_date: at(2026, 11, 3), reference_type: 'STAFF_PURCHASE', debit_amount: 0, credit_amount: 260.4 },
  { transaction_date: at(2026, 11, 4), reference_type: 'BONUS', debit_amount: 300, credit_amount: 0 },
  { transaction_date: at(2026, 11, 5), reference_type: 'DEDUCTION', debit_amount: 0, credit_amount: 100 },
  { transaction_date: at(2026, 12, 1), reference_type: 'SALARY_ACCRUAL', debit_amount: 6500, credit_amount: 0 },
];

describe('staff monthly pay statement', () => {
  it('carries the earlier balance and splits the month by kind', () => {
    const s = buildPayStatement(rows, new Date(2026, 10, 15));
    expect(s).toEqual({
      carriedForward: 500,
      salaryAdded: 6500,
      extras: 300,
      advances: 1500,
      storePurchases: 260.4,
      deductions: 100,
      salaryPaid: 0,
      balance: 5439.6,
      salaryAddedThisMonth: true,
    });
  });

  it('matches the ledger balance (debits minus credits) up to the month end', () => {
    const s = buildPayStatement(rows, new Date(2026, 10, 1));
    const ledger = rows.slice(0, 7).reduce((sum, r) => sum + r.debit_amount - r.credit_amount, 0);
    expect(s.balance).toBeCloseTo(ledger, 2);
  });

  it('reports a month without a salary entry', () => {
    const s = buildPayStatement(rows.slice(0, 2), new Date(2026, 10, 10));
    expect(s.salaryAddedThisMonth).toBe(false);
    expect(s.carriedForward).toBe(500);
    expect(s.balance).toBe(500);
  });

  it('ignores rows without a valid date', () => {
    const s = buildPayStatement([{ transaction_date: null, reference_type: 'ADVANCE', credit_amount: 50 }], new Date(2026, 10, 1));
    expect(s.balance).toBe(0);
  });
});

describe('total payable to staff', () => {
  it('adds only what the shop owes', () => {
    expect(totalPayableToStaff([2400, -450, 0, null, undefined, 0.1, 0.2])).toBe(2400.3);
  });
});
