import { api, bindBridge } from './client';

export interface Party {
  party_id: string;
  tenant_id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
  balance?: number | null;
  gst_balance?: number | null;
  estimate_balance?: number | null;
  balance_type?: string | null;
  pricing_tier_id?: string | null;
  credit_limit?: number | null;
  credit_period_enabled?: number | null;
  credit_period_days?: number | null;
  credit_period_basis?: string | null;
  restrict_on_credit_expiry?: number | null;
  whatsapp_alerts_enabled?: number | null;
  party_type?: string | null;
  custom_category?: string | null;
  notes?: string | null;
  last_transaction_date?: string | null;
  is_deleted?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
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
