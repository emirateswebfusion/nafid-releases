import { api, bindBridge } from './client';
import type { PartiesRow } from './dbRows';

/** 0/1 columns that screens also hold as booleans before saving. */
type PartyFlag = 'credit_period_enabled' | 'restrict_on_credit_expiry' | 'whatsapp_alerts_enabled';

/** A party as `db:getParties` returns it: the stored row plus ledger-derived balances (never null: COALESCE(…, 0))
 * and the date of its latest ledger entry. */
export interface Party extends Omit<PartiesRow, PartyFlag> {
  credit_period_enabled: number | boolean | null;
  restrict_on_credit_expiry: number | boolean | null;
  whatsapp_alerts_enabled: number | boolean | null;
  current_balance: number;
  current_gst_balance: number;
  current_estimate_balance: number;
  last_transaction_date: string | null;
}

export async function listParties(tenantId: string, includeDeleted = false): Promise<Party[]> {
  return (await api().dbGetParties(tenantId, includeDeleted)) as Party[];
}

/** Parties (suppliers/customers ledger accounts) and party ledger. Channel catalog — the only way UI code reaches these IPC channels. */
export const partiesApi = bindBridge({
  getParties: 'dbGetParties',
  addParty: 'dbAddParty',
  bulkImportParties: 'dbBulkImportParties',
  updateParty: 'dbUpdateParty',
  deleteParty: 'dbDeleteParty',
  restoreParty: 'dbRestoreParty',
  mergeParties: 'dbMergeParties',
  adjustPartyBalance: 'dbAdjustPartyBalance',
  getPartyLedger: 'dbGetPartyLedger',
  addPartyLedgerEntry: 'dbAddPartyLedgerEntry',
  updatePartyLedgerEntry: 'dbUpdatePartyLedgerEntry',
  deletePartyLedgerEntry: 'dbDeletePartyLedgerEntry',
  restorePartyLedgerEntry: 'dbRestorePartyLedgerEntry',
});
