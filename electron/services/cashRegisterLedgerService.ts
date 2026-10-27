import type { Db } from '../db/statements/types.js';
import { insertLinkedLedgerCashEntry } from '../db/statements/cashDrawer.js';
import { deterministicUUID } from '../utils/ids.js';

/** Called inside the same transaction as a manual cash ledger create. */
export function recordLedgerCashEntry(db: Db, tenantId: string, ledgerId: string) {
  insertLinkedLedgerCashEntry(db).run(deterministicUUID(`ledger_cash:${tenantId}:${ledgerId}`), tenantId, ledgerId);
}
