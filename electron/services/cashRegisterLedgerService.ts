import type { Db } from '../db/statements/types.js';
import { ensureLedgerCashDrawer, insertLinkedLedgerCashEntry } from '../db/statements/cashDrawer.js';
import { getCashRegisterPreferences } from './cashRegisterPreferences.js';
import { deterministicUUID } from '../utils/ids.js';
import { localDate } from './storeTime.js';
import { randomUUID } from 'node:crypto';

/** Called inside the same transaction as a manual cash ledger create. */
export function recordLedgerCashEntry(db: Db, tenantId: string, ledgerId: string) {
  const prefs = getCashRegisterPreferences(db, tenantId);
  if (prefs.ledgerMode !== 'off') {
    ensureLedgerCashDrawer(db).run(randomUUID(), tenantId, localDate(new Date(), tenantId), tenantId, ledgerId, tenantId);
  }
  insertLinkedLedgerCashEntry(db).run(deterministicUUID(`ledger_cash:${tenantId}:${ledgerId}`), tenantId, ledgerId);
}
