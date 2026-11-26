import { pullAccountPages } from '../accountPull.js';
import { accountPushRows, accountPushResult, rememberAccountBase } from '../accountMetadata.js';
import { getDb } from '../../db/localDb.js';
import { syncState } from '../syncState.js';
import { BATCH_SIZE, FETCH_TIMEOUT_MS, parseIsDeleted, toSqliteDate } from '../syncConfig.js';
import { notifyPullProgress } from '../syncProgress.js';
import { cursorKey, fetchWithFallback, pullPaginated, pushBatch, setMeta, syncPushBody } from '../syncTransport.js';
import * as partiesSyncSql from '../../db/statements/sync/partiesSync.js';
import { withSyncApplyGuard } from '../../db/statements/outbox.js';
import { assertAcknowledgedIdentity } from '../pendingIdentity.js';

/** Parties sync: parties, party ledger, customers, loyalty transactions and users (push and pull). */
// ── Pull Users (Cloud → Edge) ────────────────────────────────────────────────
export let lastUsersHash = '';

export async function pullUsers(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  try {
    const { response } = await fetchWithFallback('/auth/staff', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      if (response.status === 401) {
        if (syncState.currentActiveRoute === 'CLOUD') {
          console.error('[SyncWorker] Pull users failed: HTTP 401 (token expired/unauthorized). Clearing auth and notifying user to re-login...');
        }
        return false;
      }
      console.error(`[SyncWorker] Pull users failed: HTTP ${response.status}`);
      return false;
    }

    const rawUsers = await response.json();
    const cloudUsers: Record<string, unknown>[] = Array.isArray(rawUsers) ? rawUsers : (rawUsers.users || rawUsers.data || []);
    if (!Array.isArray(cloudUsers) || cloudUsers.length === 0) return false;

    const currentHash = JSON.stringify(cloudUsers.map(u => ({
      id: u.user_id,
      name: u.name,
      role: u.role,
      page: u.restricted_page,
      permissions: u.permissions,
      login_enabled: u.login_enabled,
    })));
    const hasChanged = currentHash !== lastUsersHash;

    const upsert = partiesSyncSql.insertUsers(db);

    const tx = db.transaction((users: Record<string, unknown>[]) => {
      for (const u of users) {
        upsert.run({
          user_id: u.user_id,
          tenant_id: tenantId,
          name: u.name,
          email: u.email,
          role: u.role,
          restricted_page: u.restricted_page || null,
          permissions: JSON.stringify(Array.isArray(u.permissions) ? u.permissions : []),
          login_enabled: u.login_enabled === false ? 0 : 1,
          created_at: toSqliteDate((u.created_at as string | number | Date | null | undefined)),
        });
      }
    });

    withSyncApplyGuard(db, () => tx(cloudUsers));
    setMeta(cursorKey(tenantId, 'users'), new Date().toISOString());
    if (hasChanged) {
      lastUsersHash = currentHash;
      console.log(`[SyncWorker] Pulled ${cloudUsers.length} users from cloud.`);
    }
    return hasChanged;
  } catch (err) {
    console.error('[SyncWorker] Pull users failed:', (err as Error).message);
    return false;
  }
}

// ── Party Sync (Edge → Cloud) ────────────────────────────────────────────────
export async function syncParties(token: string, tenantId: string) {
  const db = getDb();
  const pending = partiesSyncSql.selectParties(db).all(tenantId) as Record<string, unknown>[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} parties to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = partiesSyncSql.updateParties(db);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const parties = accountPushRows(db, tenantId, 'parties', batch).map((p: Record<string, unknown>) => ({
      ...p,
      is_deleted: !!p.is_deleted,
    }));

    const synced = await pushBatch(
      '/api/sync/parties',
      token,
      parties,
      'parties',
      `Parties batch ${Math.floor(i / BATCH_SIZE) + 1}`,
      result => accountPushResult(db, tenantId, 'parties', batch, result),
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => {
        for (const id of ids) {
          const sent = batch.find(p => p.party_id === id);
          if (sent) updateStmt.run(id, tenantId, sent.updated_at, sent.party_type, sent.custom_category, sent.row_version);
        }
      });
      tx(synced);
    }
  }
}

export async function pushCustomers(token: string, tenantId: string): Promise<boolean> {
  try {
    const pending = partiesSyncSql.selectCustomers3(getDb()).all(tenantId) as Record<string, unknown>[];
    if (!Array.isArray(pending) || pending.length === 0) return true;
    const { response } = await fetchWithFallback('/api/sync/customers', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: syncPushBody({ customers: pending }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      if (response.status === 401) {
        if (syncState.currentActiveRoute === 'CLOUD') {
          console.error('[SyncWorker] Push customers failed: HTTP 401 (token expired/unauthorized). Clearing auth and notifying user to re-login...');
        }
      }
      return false;
    }
    const result = await response.json();
    if (Array.isArray(result.synced) && result.synced.length > 0) {
      const markSynced = partiesSyncSql.updateCustomers2(getDb());
      const tx = getDb().transaction((ids: string[]) => { for (const id of ids) {
        const sent = pending.find(row => row.customer_id === id);
        if (sent) markSynced.run(id, tenantId, sent.row_version, sent.updated_at);
      } });
      tx(result.synced);
    }
    if (Array.isArray(result.failed) && result.failed.length > 0) {
      const markFailed = partiesSyncSql.updateCustomers3(getDb());
      const tx = getDb().transaction((items: Record<string, unknown>[]) => { for (const f of items) {
        const sent = pending.find(row => row.customer_id === f.customer_id);
        if (sent) markFailed.run(sent.customer_id, tenantId, sent.row_version, sent.updated_at);
      } });
      tx(result.failed);
    }
    return true;
  } catch (err) {
    console.error('[SyncWorker] Push customers failed:', (err as Error).message);
    return false;
  }
}

// ── Pull Parties (Cloud → Edge) ─────────────────────────────────────────────
export async function pullParties(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsertParty = partiesSyncSql.insertParties(db);

  const result = await pullAccountPages({
    token,
    tenantId,
    table: 'parties',
    urlPath: '/api/sync/parties',
    label: 'parties',
    onProgress: (fetched) => notifyPullProgress('parties', fetched),
    processPage: (rows) => {
      const tx = db.transaction((parties: Record<string, unknown>[]) => {
        for (const p of parties) {
          try {
            const phoneVal = typeof p.phone === 'string' ? p.phone.trim() || null : null;
            const tId = p.tenant_id || tenantId;
            if (tId !== tenantId) throw new Error('Foreign tenant party');
            const applied = upsertParty.run({
              row_version: Number(p.row_version) || 0, origin: p.origin ?? null,
              party_id: p.party_id,
              tenant_id: tId,
              name: p.name,
              phone: phoneVal,
              address: p.address || null,
              gstin: p.gstin || null,
              balance: p.balance ?? 0,
              gst_balance: p.gst_balance ?? p.balance ?? 0,
              estimate_balance: p.estimate_balance ?? 0,
              balance_type: p.balance_type || 'RECEIVABLE',
              party_type: p.party_type || 'CUSTOMER',
              custom_category: p.custom_category || null,
              notes: p.notes || null,
              last_transaction_date: p.last_transaction_date ? toSqliteDate((p.last_transaction_date as string | number | Date | null | undefined)) : null,
              pricing_tier_id: p.pricing_tier_id || null,
              credit_limit: Number(p.credit_limit) || 0,
              credit_period_enabled: p.credit_period_enabled ? 1 : 0,
              credit_period_days: Math.max(1, parseInt((p.credit_period_days as string), 10) || 30),
              credit_period_basis: p.credit_period_basis || 'BILL_BASED',
              restrict_on_credit_expiry: p.restrict_on_credit_expiry !== false && (p.restrict_on_credit_expiry as unknown) !== 0 ? 1 : 0,
              whatsapp_alerts_enabled: p.whatsapp_alerts_enabled !== 0 && p.whatsapp_alerts_enabled !== false ? 1 : 0,
              is_deleted: parseIsDeleted(p.is_deleted),
              created_at: toSqliteDate((p.created_at as string | number | Date | null | undefined)),
              updated_at: toSqliteDate((p.updated_at as string | number | Date | null | undefined)),
            });
            if (applied.changes > 0) rememberAccountBase(db, tenantId, 'parties', p);
          } catch (e) {
            console.error('[SyncWorker] Error pulling party:', (e as Error).message);
            throw e;
          }
        }
      });
      tx(rows);
      return 0; // Pulling a copy is never an acknowledgement of a local edit.
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} parties from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull parties failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Party Ledger Sync (Edge → Cloud) ──────────────────────────────────────────
export async function syncPartyLedger(token: string, tenantId: string) {
  const db = getDb();
  const pendingEntries = partiesSyncSql.selectPartyLedger(db).all(tenantId) as Record<string, unknown>[];
  if (pendingEntries.length === 0) return;

  console.log(`[SyncWorker] Pushing ${pendingEntries.length} party ledger entries to cloud...`);
  const updateStmt = partiesSyncSql.updatePartyLedger2(db);

  for (let i = 0; i < pendingEntries.length; i += BATCH_SIZE) {
    const batch = pendingEntries.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/party-ledger',
      token,
      accountPushRows(db, tenantId, 'party_ledger', batch),
      'entries',
      `Party Ledger batch ${Math.floor(i / BATCH_SIZE) + 1}`,
      result => accountPushResult(db, tenantId, 'party_ledger', batch, result),
    );
    if (synced.length > 0) {
      const acknowledged = new Set(synced);
      const tx = db.transaction(() => {
        for (const row of batch) {
          if (acknowledged.has(row.ledger_id as string)) {
            updateStmt.run(row.ledger_id, tenantId, row.row_version, row.updated_at);
          }
        }
      });
      tx();
    }
  }
}

export async function pushLoyaltyTransactions(token: string, tenantId: string): Promise<boolean> {
  try {
    const db = getDb();
    const pending = partiesSyncSql.selectLoyaltyTransactions(db).all(tenantId) as Record<string, unknown>[];
    if (!Array.isArray(pending) || pending.length === 0) return true;
    const { response } = await fetchWithFallback('/api/sync/loyalty-transactions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: syncPushBody({ loyalty_transactions: pending }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      if (response.status === 401) {
        if (syncState.currentActiveRoute === 'CLOUD') {
          console.error('[SyncWorker] Push loyalty transactions failed: HTTP 401 (token expired/unauthorized). Clearing auth and notifying user to re-login...');
        }
      }
      return false;
    }
    const result = await response.json();
    if (Array.isArray(result.synced) && result.synced.length > 0) {
      const markSynced = partiesSyncSql.updateLoyaltyTransactions(db);
      const tx = db.transaction((ids: string[]) => { for (const id of ids) {
        const sent = pending.find(row => row.transaction_id === id);
        if (sent) markSynced.run(id, tenantId, sent.row_version, sent.updated_at);
      } });
      tx(result.synced);
    }
    if (Array.isArray(result.failed) && result.failed.length > 0) {
      const markFailed = partiesSyncSql.updateLoyaltyTransactions2(db);
      const tx = db.transaction((items: Record<string, unknown>[]) => { for (const item of items) {
        const sent = pending.find(row => row.transaction_id === item.transaction_id);
        if (sent) markFailed.run(sent.transaction_id, tenantId, sent.row_version, sent.updated_at);
      } });
      tx(result.failed);
    }
    return true;
  } catch (err) {
    console.error('[SyncWorker] Push loyalty transactions failed:', (err as Error).message);
    return false;
  }
}

// ── Pull Party Ledger (Cloud → Edge) ─────────────────────────────────────────
export async function pullPartyLedger(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = partiesSyncSql.insertPartyLedger(db);
  const existingParty = partiesSyncSql.selectLedgerParty(db);
  const recalculate = partiesSyncSql.updateParties3(db);

  const result = await pullAccountPages({
    token,
    tenantId,
    table: 'party_ledger',
    urlPath: '/api/sync/party-ledger',
    label: 'ledger entries',
    onProgress: (fetched) => notifyPullProgress('ledger entries', fetched),
    processPage: (rows) => {
      const tx = db.transaction((entries: Record<string, unknown>[]) => {
        const affected = new Set<string>();
        for (const e of entries) {
          const previous = existingParty.get(e.ledger_id, tenantId) as { party_id: string } | undefined;
          const applied = upsert.run({
            row_version: Number(e.row_version) || 0, origin: e.origin ?? null,
            ledger_id: e.ledger_id,
            party_id: e.party_id,
            tenant_id: tenantId,
            transaction_date: toSqliteDate((e.transaction_date as string | number | Date | null | undefined)),
            description: e.description,
            credit_amount: e.credit_amount ?? 0,
            debit_amount: e.debit_amount ?? 0,
            running_balance: e.running_balance ?? 0,
            balance_type: e.balance_type === 'ESTIMATE' ? 'ESTIMATE' : 'GST',
            payment_method: e.payment_method || null,
            reference_number: e.reference_number || null,
            created_by: e.created_by || null,
            created_by_name: e.created_by_name || null,
            is_deleted: parseIsDeleted(e.is_deleted),
            created_at: toSqliteDate((e.created_at as string | number | Date | null | undefined)),
            updated_at: toSqliteDate((e.updated_at as string | number | Date | null | undefined)),
          });
          if (applied.changes > 0) {
            rememberAccountBase(db, tenantId, 'party_ledger', e);
            if (previous) affected.add(previous.party_id);
            affected.add(e.party_id as string);
          }
        }
        for (const partyId of affected) recalculate.run(tenantId, partyId);
      });
      tx(rows);
      // Only an upload acknowledgement may clear a pending local ledger edit.
      return 0;
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} ledger entries from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull party ledger failed.');
  }
  return result.hasChanged && result.count > 0;
}

export async function pullCustomers(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  // Upsert customer by primary key (customer_id)
  const upsertCustomer = partiesSyncSql.insertCustomers(db);

  const findCustomerByPhone = partiesSyncSql.selectCustomers(db);

  const findCustomerByNameNoPhone = partiesSyncSql.selectCustomers2(db);

  const reassignInvoices = partiesSyncSql.reassignCustomerInvoices(db);
  const reassignLoyalty = partiesSyncSql.reassignCustomerLoyalty(db);
  const softDeleteCust = partiesSyncSql.softDeleteCustomer(db);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'customers',
    urlPath: '/api/sync/customers',
    label: 'customers',
    onProgress: (fetched) => notifyPullProgress('customers', fetched),
    processPage: (rows) => {
      const tx = db.transaction((rows: Record<string, unknown>[]) => {
        for (const r of rows) {
          try {
            const hasPhone = r.phone && (r.phone as string).trim() !== '';
            const phoneVal = hasPhone ? (r.phone as string).trim() : null;
            const tId = r.tenant_id || tenantId;

            // Check if another local customer already has this phone or name (without phone)
            let existingLocalCust: Record<string, unknown> | null | undefined = null;
            if (phoneVal) {
              existingLocalCust = (findCustomerByPhone.get(tId, phoneVal) as Record<string, unknown> | null | undefined);
            } else if (r.name) {
              existingLocalCust = (findCustomerByNameNoPhone.get(tId, r.name) as Record<string, unknown> | null | undefined);
            }

            const rowParams = {
              customer_id: r.customer_id,
              tenant_id: tId,
              name: r.name,
              phone: phoneVal,
              address: r.address || null,
              pricing_tier_id: r.pricing_tier_id || null,
              total_points_earned: r.total_points_earned ?? 0,
              total_points_redeemed: r.total_points_redeemed ?? 0,
              current_points_balance: r.current_points_balance ?? 0,
              last_purchase_date: toSqliteDate((r.last_purchase_date as string | number | Date | null | undefined)),
              is_deleted: r.is_deleted ? 1 : 0,
              // Older servers do not send it: null keeps the local profile (COALESCE in the upsert).
              einvoice_profile: typeof r.einvoice_profile === 'string' ? r.einvoice_profile : null,
              created_at: toSqliteDate((r.created_at as string | number | Date | null | undefined)),
              updated_at: toSqliteDate((r.updated_at as string | number | Date | null | undefined)),
            };

            if (existingLocalCust && existingLocalCust.customer_id !== r.customer_id) {
              assertAcknowledgedIdentity(existingLocalCust.customer_id, r.customer_id, existingLocalCust.sync_status);
              // Reassign child records to incoming canonical cloud customer_id and soft-delete duplicate
              reassignInvoices.run(r.customer_id, existingLocalCust.customer_id, tId);
              reassignLoyalty.run(r.customer_id, existingLocalCust.customer_id, tId);
              softDeleteCust.run(existingLocalCust.customer_id, tId);
            }
            upsertCustomer.run(rowParams);
          } catch (e) {
            console.error('[SyncWorker] Error pulling customer:', (e as Error).message);
            throw e;
          }
        }
      });
      tx(rows);
      return 0; // Downloads cannot acknowledge an unconfirmed local upload.
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} customers.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull customers failed.');
  }
  return result.hasChanged && result.count > 0;
}

export async function pullLoyaltyTransactions(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = partiesSyncSql.insertLoyaltyTransactions(db);
  const ensureCust = partiesSyncSql.ensureStubCustomer(db);
  const checkInv = partiesSyncSql.checkInvoiceExists(db);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'loyalty_transactions',
    urlPath: '/api/sync/loyalty-transactions',
    label: 'loyalty transactions',
    tsColumn: 'created_at',
    onProgress: (fetched) => notifyPullProgress('loyalty transactions', fetched),
    processPage: (rows) => {
      const tx = db.transaction((rows: Record<string, unknown>[]) => {
        for (const r of rows) {
          try {
            const tId = (r.tenant_id as string) || tenantId;
            const cId = r.customer_id as string;
            ensureCust.run(cId, tId);
            let invId = (r.invoice_id as string) || null;
            if (invId && !checkInv.get(invId)) {
              invId = null;
            }
            upsert.run({
              transaction_id: r.transaction_id, tenant_id: tId,
              customer_id: cId, invoice_id: invId,
              transaction_type: r.transaction_type, points: r.points,
              points_balance_before: r.points_balance_before ?? 0,
              points_balance_after: r.points_balance_after ?? 0,
              reference_number: r.reference_number || null, description: r.description || null,
              created_by: r.created_by || null, created_at: toSqliteDate((r.created_at as string | number | Date | null | undefined)),
            });
          } catch (e) {
            console.error('[SyncWorker] Error pulling loyalty transaction:', (e as Error).message);
            throw e;
          }
        }
      });
      tx(rows);
      return 0; // Downloads cannot acknowledge an unconfirmed local upload.
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} loyalty transactions.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull loyalty transactions failed.');
  }
  return result.hasChanged && result.count > 0;
}
