import type { Db } from '../db/statements/types.js';
import { ensureLedgerCashDrawer, insertLinkedLedgerCashEntry } from '../db/statements/cashDrawer.js';
import { getCashRegisterPreferences } from './cashRegisterPreferences.js';
import { deterministicUUID } from '../utils/ids.js';
import { localDate } from './storeTime.js';
import { randomUUID } from 'node:crypto';

/** Called inside the same transaction as a manual cash ledger create. */
export function recordLedgerCashEntry(db: Db, tenantId: string, ledgerId: string) {
  const tid = tenantId || 'global';
  const prefs = getCashRegisterPreferences(db, tid);
  if (prefs.ledgerMode === 'off') {
    return;
  }
  ensureLedgerCashDrawer(db).run(randomUUID(), tid, localDate(new Date(), tid), tid, ledgerId, tid);
  insertLinkedLedgerCashEntry(db).run(deterministicUUID(`ledger_cash:${tid}:${ledgerId}`), tid, ledgerId);
}
