import type { CustomerRow, PartyInput, PartyLedgerEntryInput, PartyLedgerRow, PartyRow } from './typesA.js';
import { getDb } from '../db/localDb.js';
import { backfillCreditInvoices, reconcileAllPartyBalances, recalcPartyBalances } from './partyLedgerService.js';
import { deterministicUUID } from '../utils/ids.js';
import { localTimestamp } from './storeTime.js';
import * as partiesSql from '../db/statements/parties.js';
/** parties use-cases for the main process (called by electron/ipc handlers). */

/** IPC `db:getParties` */
export function getParties(tenantId: string, includeDeleted: unknown = false) {
  try {
    const db = getDb();
    if (!tenantId) return [];
    backfillCreditInvoices(db);
    reconcileAllPartyBalances(db, tenantId);
    const parties = partiesSql.listPartiesWithBalances(db, Boolean(includeDeleted)).all(tenantId) as PartyRow[];
    for (const p of parties) {
      if (p.current_balance !== undefined && p.current_balance !== null) {
        p.balance = Number(p.current_balance);
      }
      if (p.current_gst_balance !== undefined && p.current_gst_balance !== null) {
        p.gst_balance = Number(p.current_gst_balance);
      }
      if (p.current_estimate_balance !== undefined && p.current_estimate_balance !== null) {
        p.estimate_balance = Number(p.current_estimate_balance);
      }
    }
    return parties;
  } catch (error) {
    console.error('[db:getParties]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:addParty` */
export function addParty(p: PartyInput) {
  try {
    const db = getDb();
    const nameClean = (p.name || '').trim().toLowerCase();

    // Duplicate check: Do NOT allow creation of another party with the exact same name
    const existingSameName = partiesSql.findParties(db).get(p.tenant_id, nameClean);
    if (existingSameName) {
      return { success: false, error: `A party named "${p.name.trim()}" already exists!` };
    }

    const creditLimit = Math.max(0, Number(p.credit_limit) || 0);
    const creditPeriodEnabled = p.credit_period_enabled ? 1 : 0;
    const creditPeriodDays = Math.max(1, parseInt(p.credit_period_days as string, 10) || 30);
    const creditPeriodBasis = p.credit_period_basis || 'BILL_BASED';
    const restrictOnCreditExpiry = p.restrict_on_credit_expiry !== undefined ? (p.restrict_on_credit_expiry ? 1 : 0) : 1;
    const whatsappAlertsEnabled = p.whatsapp_alerts_enabled !== undefined ? (p.whatsapp_alerts_enabled ? 1 : 0) : 1;
    const bt = p.balance_type || 'RECEIVABLE';
    const initialBalance = bt === 'RECEIVABLE'
      ? Math.abs((p.balance as number) || 0)
      : -Math.abs((p.balance as number) || 0);
    const partyType = p.party_type || 'CUSTOMER';
    const customCategory = p.custom_category || null;

    partiesSql.insertParty(db).run(p.party_id, p.tenant_id, p.name, p.phone || null, p.address || null, p.gstin || null, initialBalance, initialBalance, bt, partyType, customCategory, p.notes || null, p.pricing_tier_id || null, creditLimit, creditPeriodEnabled, creditPeriodDays, creditPeriodBasis, restrictOnCreditExpiry, whatsappAlertsEnabled);

    // Create opening balance ledger entry
    if (p.balance && parseFloat(p.balance as unknown as string) > 0) {
      const amount = Math.abs(parseFloat(p.balance as unknown as string));
      const ledgerId = deterministicUUID(`party_opening:${p.party_id}`);
      partiesSql.insertPartyLedger(db).run(
        ledgerId, p.party_id, p.tenant_id,
        `Opening Balance (${bt === 'RECEIVABLE' ? 'Receivable' : 'Payable'})`,
        bt === 'RECEIVABLE' ? amount : 0,
        bt === 'PAYABLE' ? amount : 0,
        initialBalance,
        p.created_by || null,
        p.created_by_name || null
      );
      partiesSql.updatePartyLastTransactionDate(db).run(p.party_id);
    }

    return { success: true };
  } catch (error) {
    console.error('[db:addParty]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:bulkImportParties` */
export function bulkImportParties(parties: PartyInput[]) {
  try {
    const db = getDb();
    const transaction = db.transaction((partyList) => {
      const selectPhoneStmt = partiesSql.findPartiesPartyIdAndPhone(db);
      const insertStmt = partiesSql.insertParty2(db);
      const updateStmt = partiesSql.updatePartyByPartyId(db);
      const insertLedgerStmt = partiesSql.insertPartyLedger2(db);

      const now = new Date();
      for (const p of partyList) {
        now.setMilliseconds(now.getMilliseconds() + 1);
        const timestamp = localTimestamp(now);

        const phoneClean = (p.phone || '').replace(/\D/g, '');
        const nameClean = (p.name || '').trim().toLowerCase();

        let existing: PartyRow | null | undefined = null;
        if (p.tenant_id) {
          const tenantParties = selectPhoneStmt.all(p.tenant_id) as PartyRow[];
          if (phoneClean.length >= 7) {
            existing = tenantParties.find((party: PartyRow) => {
              const pDigits = (party.phone || '').replace(/\D/g, '');
              return pDigits.length >= 7 && (pDigits === phoneClean || (phoneClean.length >= 10 && pDigits.slice(-10) === phoneClean.slice(-10)));
            });
          }
          if (!existing && nameClean) {
            existing = tenantParties.find((party: PartyRow) => (party.name || '').trim().toLowerCase() === nameClean);
          }
        }

        if (existing) {
          updateStmt.run(
            p.name,
            p.phone || null,
            p.address || null,
            p.gstin || null,
            p.pricing_tier_id || null,
            p.credit_limit || 0,
            p.party_type || 'SUPPLIER',
            p.custom_category || null,
            p.notes || null,
            existing.party_id
          );
        } else {
          const bt = p.balance_type || (p.party_type === 'SUPPLIER' ? 'PAYABLE' : 'RECEIVABLE');
          const initialBalance = bt === 'RECEIVABLE'
            ? Math.abs((p.balance as number) || 0)
            : -Math.abs((p.balance as number) || 0);
          const creditLimit = Math.max(0, Number(p.credit_limit) || 0);
          const partyType = p.party_type || 'SUPPLIER';

          insertStmt.run(
            p.party_id,
            p.tenant_id,
            p.name,
            p.phone || null,
            p.address || null,
            p.gstin || null,
            initialBalance,
            initialBalance,
            p.pricing_tier_id || null,
            creditLimit,
            partyType,
            p.custom_category || null,
            p.notes || null,
            bt,
            timestamp,
            timestamp
          );

          if (p.balance && parseFloat(p.balance as unknown as string) !== 0) {
            const amount = Math.abs(parseFloat(p.balance as unknown as string));
            const ledgerId = deterministicUUID(`party_opening:${p.party_id}`);
            insertLedgerStmt.run(
              ledgerId, p.party_id, p.tenant_id, timestamp,
              `Opening Balance (${bt === 'RECEIVABLE' ? 'Receivable' : 'Payable'})`,
              bt === 'RECEIVABLE' ? amount : 0,
              bt === 'PAYABLE' ? amount : 0,
              initialBalance,
              p.created_by || null,
              p.created_by_name || null,
              timestamp,
              timestamp
            );
          }
        }
      }
    });
    transaction(parties);
    return { success: true };
  } catch (error) {
    console.error('[db:bulkImportParties]', error);
    return { success: false, error: (error as Error).message || 'Operation failed' };
  }
}

/** IPC `db:updateParty` */
export function updateParty(p: Partial<PartyInput> & { party_id: string }) {
  try {
    const db = getDb();
    const hasTier = p.pricing_tier_id !== undefined;
    const hasCreditLimit = p.credit_limit !== undefined;
    const hasPartyType = p.party_type !== undefined;
    const hasCustomCategory = p.custom_category !== undefined;
    const creditLimit = hasCreditLimit ? Math.max(0, Number(p.credit_limit) || 0) : 0;
    const hasCreditPeriodEnabled = p.credit_period_enabled !== undefined;
    const hasCreditPeriodDays = p.credit_period_days !== undefined;
    const hasCreditPeriodBasis = p.credit_period_basis !== undefined;
    const hasRestrictOnCreditExpiry = p.restrict_on_credit_expiry !== undefined;
    const hasWhatsappAlertsEnabled = p.whatsapp_alerts_enabled !== undefined;

    const columns: partiesSql.PartyProfileColumn[] = [];
    const params: unknown[] = [p.name, p.phone || null, p.address || null, p.gstin || null, p.notes || null];

    if (hasTier) {
      columns.push('pricing_tier_id');
      params.push(p.pricing_tier_id || null);
    }
    if (hasCreditLimit) {
      columns.push('credit_limit');
      params.push(creditLimit);
    }
    if (hasCreditPeriodEnabled) {
      columns.push('credit_period_enabled');
      params.push(p.credit_period_enabled ? 1 : 0);
    }
    if (hasCreditPeriodDays) {
      columns.push('credit_period_days');
      params.push(Math.max(1, parseInt(p.credit_period_days as string, 10) || 30));
    }
    if (hasCreditPeriodBasis) {
      columns.push('credit_period_basis');
      params.push(p.credit_period_basis || 'BILL_BASED');
    }
    if (hasRestrictOnCreditExpiry) {
      columns.push('restrict_on_credit_expiry');
      params.push(p.restrict_on_credit_expiry ? 1 : 0);
    }
    if (hasPartyType) {
      columns.push('party_type');
      params.push(p.party_type || 'CUSTOMER');
    }
    if (hasCustomCategory) {
      columns.push('custom_category');
      params.push(p.custom_category || null);
    }
    if (hasWhatsappAlertsEnabled) {
      columns.push('whatsapp_alerts_enabled');
      params.push(p.whatsapp_alerts_enabled ? 1 : 0);
    }

    // Fetch existing party details before update to ensure robust matching even if name or phone changed
    const oldPartyRow = partiesSql.findPartiesByPartyId(db).get(p.party_id) as PartyRow | undefined;
    const tenantId = p.tenant_id || oldPartyRow?.tenant_id;
    const oldPhone = (oldPartyRow?.phone || '').trim();
    const oldName = (oldPartyRow?.name || '').trim();
    const newPhone = (p.phone || '').trim();
    const newName = (p.name || '').trim();

    params.push(p.party_id);

    partiesSql.updatePartyProfile(db, columns).run(...params);

    // Synchronize to matching customer in customers table if exists
    try {
      let cust: CustomerRow | null | undefined = null;
      if (newPhone) {
        cust = partiesSql.findCustomersByPhone(db).get(tenantId, newPhone) as CustomerRow | undefined;
      }
      if (!cust && oldPhone) {
        cust = partiesSql.findCustomersByPhone(db).get(tenantId, oldPhone) as CustomerRow | undefined;
      }
      if (!cust && newName) {
        cust = partiesSql.findCustomers(db).get(tenantId, newName.toLowerCase()) as CustomerRow | undefined;
      }
      if (!cust && oldName) {
        cust = partiesSql.findCustomers(db).get(tenantId, oldName.toLowerCase()) as CustomerRow | undefined;
      }
      if (cust) {
        partiesSql.updateCustomerByCustomerId(db).run(
          p.name,
          p.phone || null,
          p.address || null,
          p.gstin !== undefined ? (p.gstin ? p.gstin.trim().toUpperCase() : null) : null,
          p.notes !== undefined ? (p.notes ? p.notes.trim() : null) : null,
          hasCreditLimit ? creditLimit : null,
          hasCreditPeriodEnabled ? (p.credit_period_enabled ? 1 : 0) : null,
          hasCreditPeriodDays ? Math.max(1, parseInt(p.credit_period_days as string, 10) || 30) : null,
          hasCreditPeriodBasis ? (p.credit_period_basis || 'BILL_BASED') : null,
          hasRestrictOnCreditExpiry ? (p.restrict_on_credit_expiry ? 1 : 0) : null,
          hasTier ? (p.pricing_tier_id || null) : null,
          cust.customer_id as string, tenantId as string
        );
      }
    } catch (syncErr) {
      console.warn('[db:updateParty] Customer sync skipped:', syncErr);
    }

    return { success: true };
  } catch (error) {
    console.error('[db:updateParty]', error);
    return { success: false, error: (error as Error).message || 'Operation failed' };
  }
}

/** IPC `db:deleteParty` */
export function deleteParty(partyId: string) {
  try {
    const db = getDb();
    partiesSql.updatePartyIsDeleted(db).run(partyId);
    return { success: true };
  } catch (error) {
    console.error('[db:deleteParty]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:restoreParty` */
export function restoreParty(partyId: string) {
  try {
    const db = getDb();
    partiesSql.updatePartyIsDeletedAlt(db).run(partyId);
    recalcPartyBalances(db, partyId);
    return { success: true };
  } catch (error) {
    console.error('[db:restoreParty]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:adjustPartyBalance` */
export function adjustPartyBalance({ party_id, amount }: { party_id: string; amount: number }) {
  try {
    const db = getDb();
    partiesSql.updatePartyBalanceAndGstBalance(db).run(amount, amount, party_id);
    return { success: true };
  } catch (error) {
    console.error('[db:adjustPartyBalance]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:mergeParties` */
export function mergeParties(payload: { tenant_id: string; primary_party_id: string; secondary_party_id: string }) {
  try {
    const db = getDb();
    const { tenant_id, primary_party_id, secondary_party_id } = payload;
    if (!tenant_id || !primary_party_id || !secondary_party_id || primary_party_id === secondary_party_id) {
      return { success: false, error: 'Invalid parameters for party merge' };
    }

    const primaryParty = partiesSql.findPartiesByPartyId2(db).get(primary_party_id, tenant_id) as PartyRow | undefined;
    const secondaryParty = partiesSql.findPartiesByPartyId3(db).get(secondary_party_id, tenant_id) as PartyRow | undefined;

    if (!primaryParty || !secondaryParty) {
      return { success: false, error: 'One or both parties not found' };
    }

    const tx = db.transaction(() => {
      // 1. Move all party_ledger entries from secondary to primary
      partiesSql.updatePartyLedgerPartyId(db).run(primary_party_id, secondary_party_id, tenant_id);

      // 2. Update primary party phone, address, and gstin if secondary has them
      const secPhone = (secondaryParty.phone || '').trim();
      const secAddr = (secondaryParty.address || '').trim();
      const secGst = (secondaryParty.gstin || '').trim();
      partiesSql.updatePartyByPartyId2(db).run(secPhone, secPhone, secAddr, secAddr, secGst, secGst, primary_party_id, tenant_id);

      // 3. Mark secondary party as deleted
      partiesSql.updatePartyIsDeleted2(db).run(secondary_party_id, tenant_id);

      // 4. Recalculate primary party balance (soft-deletes duplicate reference numbers & exact matches)
      recalcPartyBalances(db, primary_party_id);
      recalcPartyBalances(db, secondary_party_id);
    });

    tx();

    import('../sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Merge sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));

    return { success: true };
  } catch (error) {
    console.error('[db:mergeParties]', error);
    return { success: false, error: 'Failed to merge parties' };
  }
}

/** IPC `db:getPartyLedger` */
export function getPartyLedger(partyId: string, includeDeleted: unknown = false) {
  try {
    const db = getDb();
    backfillCreditInvoices(db);
    // Ensure the table exists (safe for first run after migration)
    db.exec(`CREATE TABLE IF NOT EXISTS party_ledger (
      ledger_id TEXT PRIMARY KEY,
      party_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      transaction_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      description TEXT NOT NULL,
      credit_amount REAL NOT NULL DEFAULT 0,
      debit_amount REAL NOT NULL DEFAULT 0,
      running_balance REAL NOT NULL,
      balance_type TEXT DEFAULT 'GST',
      payment_method TEXT,
      reference_number TEXT,
      created_by TEXT,
      created_by_name TEXT,
      is_deleted INTEGER DEFAULT 0,
      sync_status TEXT DEFAULT 'SYNCED',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    try { db.exec(`ALTER TABLE party_ledger ADD COLUMN is_deleted INTEGER DEFAULT 0`); } catch { /* ignore */ }
    // Clean up any legacy orphan purchase bill ledger entries where the purchase bill was deleted
    try {
      const orphans = partiesSql.findPartyLedgerByPartyIdAndBillNumber(db).all(partyId) as PartyLedgerRow[];
      if (orphans.length > 0) {
        for (const orphan of orphans) {
          partiesSql.updatePartyLedgerIsDeleted(db).run(orphan.ledger_id);
        }
        recalcPartyBalances(db, partyId);
      }
    } catch { /* ignore */ }

    // Clean up any ledger entries where the invoice was deleted (is_deleted = 1)
    try {
      const deletedInvoiceEntries = partiesSql.findPartyLedgerByPartyIdAndInvoiceNumber(db).all(partyId) as PartyLedgerRow[];

      if (deletedInvoiceEntries.length > 0) {
        console.log(`[db:getPartyLedger] Cleaning up ${deletedInvoiceEntries.length} entries for deleted invoices`);
        for (const entry of deletedInvoiceEntries) {
          partiesSql.updatePartyLedgerIsDeleted(db).run(entry.ledger_id);
        }
        recalcPartyBalances(db, partyId);
      }
    } catch (e) {
      console.error('[db:getPartyLedger] Error cleaning deleted invoice ledger entries:', e);
    }
    try { recalcPartyBalances(db, partyId); } catch (e) { /* ignore */ }
    return partiesSql.listPartyLedger(db, Boolean(includeDeleted)).all(partyId);
  } catch (error) {
    console.error('[db:getPartyLedger]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:restorePartyLedgerEntry` */
export function restorePartyLedgerEntry({ ledger_id, party_id }: { ledger_id: string; party_id: string }) {
  try {
    const db = getDb();
    partiesSql.updatePartyLedgerIsDeletedAlt(db).run(ledger_id, party_id);
    const entries = partiesSql.findPartyLedgerByPartyId(db).all(party_id) as PartyLedgerRow[];

    let running = 0;
    for (const row of entries) {
      running += parseFloat(row.credit_amount as unknown as string) - parseFloat(row.debit_amount as unknown as string);
      partiesSql.updatePartyLedgerRunningBalance(db).run(running, row.ledger_id);
    }
    recalcPartyBalances(db, party_id);
    return { success: true };
  } catch (error) {
    console.error('[db:restorePartyLedgerEntry]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:addPartyLedgerEntry` */
export function addPartyLedgerEntry(entry: PartyLedgerEntryInput) {
  try {
    const db = getDb();
    
    // Get current party balance
    const party = partiesSql.findPartiesByPartyIdBalance(db).get(entry.party_id) as PartyRow | undefined;
    if (!party) return { success: false, error: 'Party not found' };

    const currentBalance = parseFloat(party.balance as string) || 0;
    const parsedAmount = Math.abs(parseFloat(entry.amount as string));
    const creditAmount = entry.transaction_type === 'CREDIT' ? parsedAmount : 0;
    const debitAmount = entry.transaction_type === 'DEBIT' ? parsedAmount : 0;
    const balanceType = entry.balance_type === 'ESTIMATE' ? 'ESTIMATE' : 'GST';
    const paymentMethod = entry.payment_method || null;
    const newBalance = currentBalance + creditAmount - debitAmount;

    partiesSql.insertPartyLedger3(db).run(
      entry.ledger_id,
      entry.party_id,
      entry.tenant_id,
      entry.transaction_date || new Date().toISOString(),
      entry.description,
      creditAmount,
      debitAmount,
      newBalance,
      balanceType,
      paymentMethod,
      entry.reference_number || null,
      entry.created_by || null,
      entry.created_by_name || null
    );

    recalcPartyBalances(db, entry.party_id);

    return { success: true };
  } catch (error) {
    console.error('[db:addPartyLedgerEntry]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:updatePartyLedgerEntry` */
export function updatePartyLedgerEntry(entry: Partial<PartyLedgerEntryInput> & { ledger_id: string; party_id: string }) {
  try {
    const db = getDb();

    const existing = partiesSql.findPartyLedgerByLedgerIdAndPartyId(db).get(entry.ledger_id, entry.party_id) as PartyLedgerRow | undefined;
    if (!existing) return { success: false, error: 'Ledger entry not found' };

    const parsedAmount = entry.amount !== undefined ? Math.abs(parseFloat(entry.amount as string)) : (existing.credit_amount || existing.debit_amount || 0);
    const txType = entry.transaction_type || ((existing.credit_amount as number) > 0 ? 'CREDIT' : 'DEBIT');
    const creditAmount = txType === 'CREDIT' ? parsedAmount : 0;
    const debitAmount = txType === 'DEBIT' ? parsedAmount : 0;

    partiesSql.updatePartyLedgerByLedgerIdAndPartyId(db).run(
      entry.transaction_date || existing.transaction_date,
      entry.description || existing.description,
      creditAmount,
      debitAmount,
      entry.balance_type === 'ESTIMATE' ? 'ESTIMATE' : (existing.balance_type || 'GST'),
      entry.payment_method !== undefined ? entry.payment_method : (existing.payment_method || null),
      entry.reference_number !== undefined ? entry.reference_number : existing.reference_number,
      entry.ledger_id,
      entry.party_id
    );

    // Recalculate running balances for all entries
    const entries = partiesSql.findPartyLedgerByPartyId(db).all(entry.party_id) as PartyLedgerRow[];

    let running = 0;
    for (const row of entries) {
      running += parseFloat(row.credit_amount as unknown as string) - parseFloat(row.debit_amount as unknown as string);
      partiesSql.updatePartyLedgerRunningBalance(db).run(running, row.ledger_id);
    }

    recalcPartyBalances(db, entry.party_id);

    return { success: true };
  } catch (error) {
    console.error('[db:updatePartyLedgerEntry]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:deletePartyLedgerEntry` */
export function deletePartyLedgerEntry({ ledger_id, party_id }: { ledger_id: string; party_id: string }) {
  try {
    const db = getDb();
    
    partiesSql.updatePartyLedgerIsDeletedIsDeleted2(db).run(ledger_id, party_id);

    // Recalculate running balance
    const entries = partiesSql.findPartyLedgerByPartyId(db).all(party_id) as PartyLedgerRow[];

    let running = 0;
    for (const row of entries) {
      running += parseFloat(row.credit_amount as unknown as string) - parseFloat(row.debit_amount as unknown as string);
      partiesSql.updatePartyLedgerRunningBalance(db).run(running, row.ledger_id);
    }

    recalcPartyBalances(db, party_id);

    import('../sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Sync after delete error:', e));
    }).catch(() => {});

    return { success: true };
  } catch (error) {
    console.error('[db:deletePartyLedgerEntry]', error);
    return { success: false, error: 'Operation failed' };
  }
}
