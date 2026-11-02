import { recalcPartyBalances } from './partyLedgerService.js';
import { deterministicUUID } from '../utils/ids.js';
import { getDb } from '../db/localDb.js';
import * as partiesSql from '../db/statements/parties.js';
import * as partyLedgerSql from '../db/statements/partyLedger.js';
import type { Db } from '../db/statements/types.js';

/**
 * A party's opening balance: one ledger row with a fixed id, so posting it again can never add to it.
 * Signed amount: positive = the party owes the shop (credit row), negative = the shop owes the party (debit row).
 * Reference and method mark it as carried forward: it moves no cash drawer or payment account.
 */
export const OPENING_REFERENCE = 'OPENING-BALANCE';
export const OPENING_METHOD = 'OPENING';

const money = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const nameKey = (name: unknown) => String(name ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function postOpeningBalance(db: Db, entry: {
  party_id: string; tenant_id: string; party_type?: string | null; signed_amount: number;
  transaction_date: string; created_by?: string | null; created_by_name?: string | null;
}) {
  const signed = money(entry.signed_amount);
  if (signed === 0) return;
  const isSupplier = (entry.party_type || 'CUSTOMER').toUpperCase() === 'SUPPLIER';
  const label = signed > 0 ? 'Receivable' : isSupplier ? 'Payable' : 'Advance';
  partyLedgerSql.upsertPartyLedgerEntry(db).run({
    ledger_id: deterministicUUID(`party_opening:${entry.party_id}`),
    party_id: entry.party_id, tenant_id: entry.tenant_id, transaction_date: entry.transaction_date,
    description: `Opening Balance (${label})`,
    credit_amount: signed > 0 ? signed : 0, debit_amount: signed < 0 ? -signed : 0, balance_type: 'GST',
    payment_method: OPENING_METHOD, reference_number: OPENING_REFERENCE,
    created_by: entry.created_by || null, created_by_name: entry.created_by_name || null,
  });
  recalcPartyBalances(db, entry.party_id);
}

export type OpeningImportStatus = 'post' | 'unchanged' | 'skip' | 'unmatched' | 'ambiguous' | 'conflict' | 'invalid';

export interface OpeningImportInput {
  tenant_id: string;
  party_type: 'CUSTOMER' | 'SUPPLIER';
  as_of: string;
  apply: boolean;
  rows: Array<{ name: string; amount: number }>;
  created_by?: string | null;
  created_by_name?: string | null;
}

const BLOCKING: OpeningImportStatus[] = ['unmatched', 'ambiguous', 'conflict', 'invalid'];

/**
 * IPC `db:importOpeningBalances`. Sets the opening balance of existing parties from a file, all rows or none.
 * Matches on the whole name only, never on phone, and a name that is not unique blocks the import. For suppliers a
 * positive file amount is what the shop owes them. `apply: false` only reports what would happen.
 */
export function importOpeningBalances(input: OpeningImportInput) {
  try {
    const db = getDb();
    const asOf = new Date(input?.as_of);
    if (!input?.tenant_id || !Array.isArray(input.rows) || Number.isNaN(asOf.getTime())) {
      return { success: false, error: 'A shop, rows and a valid as-of date are required' };
    }
    const partyType = input.party_type === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER';
    const parties = partiesSql.listOpeningBalanceParties(db).all(input.tenant_id, partyType) as Array<{ party_id: string; name: string }>;
    const partiesByName = new Map<string, string[]>();
    for (const p of parties) partiesByName.set(nameKey(p.name), [...(partiesByName.get(nameKey(p.name)) || []), p.party_id]);
    const rowsPerName = new Map<string, number>();
    for (const r of input.rows) rowsPerName.set(nameKey(r.name), (rowsPerName.get(nameKey(r.name)) || 0) + 1);

    const results = input.rows.map((row) => {
      const name = String(row.name ?? '').trim();
      const amount = money(row.amount);
      const key = nameKey(name);
      const report = (status: OpeningImportStatus, reason?: string, party_id?: string) => ({ name, amount, status, reason, party_id });
      if (!key || !Number.isFinite(Number(row.amount))) return report('invalid', 'Name or amount is not valid');
      if ((rowsPerName.get(key) || 0) > 1) return report('ambiguous', 'This name appears more than once in the file');
      const matches = partiesByName.get(key) || [];
      if (matches.length === 0) return report('unmatched', 'No party with this name');
      if (matches.length > 1) return report('ambiguous', 'More than one party has this name');
      const partyId = matches[0];
      const signed = partyType === 'SUPPLIER' ? -amount : amount;
      const existing = money((partiesSql.sumOpeningEntries(db).get(partyId) as { total: number | null }).total);
      if (existing === signed) return report(signed === 0 ? 'skip' : 'unchanged', undefined, partyId);
      if (existing !== 0) return report('conflict', `Already has opening balance ${partyType === 'SUPPLIER' ? -existing : existing}`, partyId);
      return report('post', undefined, partyId);
    });

    const blocked = results.filter((r) => BLOCKING.includes(r.status));
    const toPost = results.filter((r) => r.status === 'post');
    const total = money(input.rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0));
    const applied = input.apply && blocked.length === 0;
    if (applied) {
      db.transaction(() => {
        for (const r of toPost) {
          postOpeningBalance(db, {
            party_id: r.party_id!, tenant_id: input.tenant_id, party_type: partyType,
            signed_amount: partyType === 'SUPPLIER' ? -r.amount : r.amount, transaction_date: asOf.toISOString(),
            created_by: input.created_by, created_by_name: input.created_by_name,
          });
        }
      })();
    }
    return { success: true, applied, posted: applied ? toPost.length : 0, blocked: blocked.length, total, results };
  } catch (error) {
    console.error('[db:importOpeningBalances]', error);
    return { success: false, error: (error as Error).message || 'Operation failed' };
  }
}
