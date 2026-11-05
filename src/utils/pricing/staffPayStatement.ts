/**
 * Monthly pay statement of one staff member, built from their ledger rows.
 *
 * The ledger is the source of truth (electron/services/staffService.ts posts it): salary added for a month and bonuses
 * are debits (the shop owes more); advances, salary payments, deductions and store purchases are credits (the shop
 * owes less). Balance = debits − credits. Salary is a fixed monthly amount added by hand; it is not derived from
 * attendance.
 */

import { getStoreTimezone } from '../time/timezoneHelper';

export interface PayLedgerRow {
  transaction_date?: string | null;
  reference_type?: string | null;
  debit_amount?: number | null;
  credit_amount?: number | null;
}

export interface PayStatement {
  /** Balance carried in from before the month (positive: shop owes the staff member). */
  carriedForward: number;
  salaryAdded: number;
  /** Bonuses and positive balance adjustments. */
  extras: number;
  advances: number;
  storePurchases: number;
  /** Deductions and negative balance adjustments. */
  deductions: number;
  salaryPaid: number;
  /** Balance at the end of the month (positive: still to pay the staff member). */
  balance: number;
  /** True when a salary entry was added for this month. */
  salaryAddedThisMonth: boolean;
}

const cents = (value: unknown) => Math.round((Number(value) || 0) * 100);

/** Statement for the calendar month (local time) that contains `month`. */
export function buildPayStatement(rows: PayLedgerRow[], month: Date, timeZone = getStoreTimezone()): PayStatement {
  const start = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`;
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  let carried = 0;
  let salary = 0, extras = 0, advances = 0, purchases = 0, deductions = 0, paid = 0;
  let salaryAddedThisMonth = false;

  for (const row of rows) {
    const raw = String(row.transaction_date || '').trim();
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
    const instant = new Date(/[Zz]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`);
    if (!raw || isNaN(instant.getTime())) continue;
    const time = dateOnly ? raw : format.format(instant);
    if (time >= end) continue;
    const debit = cents(row.debit_amount);
    const credit = cents(row.credit_amount);
    if (time < start) {
      carried += debit - credit;
      continue;
    }
    switch (row.reference_type) {
      case 'SALARY_ACCRUAL':
        salary += debit;
        salaryAddedThisMonth = true;
        break;
      case 'ADVANCE': advances += credit; break;
      case 'STAFF_PURCHASE': purchases += credit; break;
      case 'SALARY_PAYMENT': paid += credit; break;
      default:
        // BONUS, DEDUCTION, ADJUSTMENT and anything new: debit adds, credit deducts.
        extras += debit;
        deductions += credit;
    }
  }

  const balance = carried + salary + extras - advances - purchases - deductions - paid;
  return {
    carriedForward: carried / 100,
    salaryAdded: salary / 100,
    extras: extras / 100,
    advances: advances / 100,
    storePurchases: purchases / 100,
    deductions: deductions / 100,
    salaryPaid: paid / 100,
    balance: balance / 100,
    salaryAddedThisMonth,
  };
}

/** What the shop owes all listed staff together: the sum of positive balances (staff who owe the shop count as 0). */
export function totalPayableToStaff(balances: Array<number | null | undefined>): number {
  return balances.reduce<number>((sum, value) => sum + Math.max(0, cents(value)), 0) / 100;
}
