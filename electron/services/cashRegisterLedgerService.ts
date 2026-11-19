import type { Db } from '../db/statements/types.js';
import { ensureLedgerCashDrawer, insertLinkedLedgerCashEntry, ledgerCashOrigin } from '../db/statements/cashDrawer.js';
import { getCashRegisterPreferences } from './cashRegisterPreferences.js';
import { deterministicUUID } from '../utils/ids.js';
import { localDate } from './storeTime.js';
import { randomUUID } from 'node:crypto';

/** Cash Register owns direction; both feeds use current ledger amount and effective date. */
export function ledgerCashMovement(cash: { type?: string | null; transaction_date?: string | null }, ledger: {
  credit_amount?: number | null; debit_amount?: number | null; reference_number?: string | null;
  transaction_date?: string | null;
}) {
  const type = ledger.reference_number === 'Cash Register' ? (cash.type === 'CASH_IN' ? 'CASH_IN' : 'CASH_OUT')
    : Number(ledger.credit_amount) > Number(ledger.debit_amount) ? 'CASH_OUT' : 'CASH_IN';
  return { type, amount: Math.abs(Number(ledger.credit_amount || 0) - Number(ledger.debit_amount || 0)),
    transaction_date: ledger.transaction_date || cash.transaction_date || null };
}

/** Called inside the same transaction as a manual cash ledger create. */
export function recordLedgerCashEntry(db: Db, tenantId: string, ledgerId: string) {
  const tid = tenantId || 'global';
  const prefs = getCashRegisterPreferences(db, tid);
  const origin = ledgerCashOrigin(db).get(tid, ledgerId) as { reference_number: string | null } | undefined;
  if (prefs.ledgerMode === 'off' && origin?.reference_number !== 'Cash Register') {
    return;
  }
  ensureLedgerCashDrawer(db).run(randomUUID(), tid, localDate(new Date(), tid), tid, ledgerId, tid);
  insertLinkedLedgerCashEntry(db).run(deterministicUUID(`ledger_cash:${tid}:${ledgerId}`), tid, ledgerId);
}
