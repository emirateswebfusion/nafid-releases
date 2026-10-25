import { getDb } from '../../db/localDb.js';
import { syncState } from '../syncState.js';
import { BATCH_SIZE, FETCH_TIMEOUT_MS, parseIsDeleted, toSqliteDate } from '../syncConfig.js';
import { notifyPullProgress } from '../syncProgress.js';
import { clearAuthAndNotify, fetchWithFallback, pullPaginated, pushBatch, reconcilePending } from '../syncTransport.js';

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
          await clearAuthAndNotify();
        }
        return false;
      }
      console.error(`[SyncWorker] Pull users failed: HTTP ${response.status}`);
      return false;
    }

    const rawUsers = await response.json();
    const cloudUsers: any[] = Array.isArray(rawUsers) ? rawUsers : (rawUsers.users || rawUsers.data || []);
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

    const upsert = db.prepare(`
      INSERT INTO users (user_id, tenant_id, name, email, role, restricted_page, permissions, login_enabled, created_at)
      VALUES (@user_id, @tenant_id, @name, @email, @role, @restricted_page, @permissions, @login_enabled, @created_at)
      ON CONFLICT(user_id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        role = excluded.role,
        restricted_page = excluded.restricted_page,
        permissions = excluded.permissions,
        login_enabled = excluded.login_enabled
    `);

    const tx = db.transaction((users: any[]) => {
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
          created_at: toSqliteDate(u.created_at),
        });
      }
    });

    tx(cloudUsers);
    if (hasChanged) {
      lastUsersHash = currentHash;
      console.log(`[SyncWorker] Pulled ${cloudUsers.length} users from cloud.`);
    }
    return hasChanged;
  } catch (err: any) {
    console.error('[SyncWorker] Pull users failed:', err.message);
    return false;
  }
}

// ── Party Sync (Edge → Cloud) ────────────────────────────────────────────────
export async function syncParties(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM parties WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} parties to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE parties SET sync_status = 'SYNCED' WHERE party_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const parties = batch.map((p: any) => ({
      ...p,
      is_deleted: !!p.is_deleted,
    }));

    const synced = await pushBatch(
      '/api/sync/parties',
      token,
      parties,
      'parties',
      `Parties batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

export async function pushCustomers(token: string, tenantId: string): Promise<boolean> {
  try {
    const pending = getDb().prepare(
      `SELECT * FROM customers WHERE tenant_id = ? AND sync_status IN ('PENDING', 'FAILED')`
    ).all(tenantId);
    if (!Array.isArray(pending) || pending.length === 0) return true;
    const { response } = await fetchWithFallback('/api/sync/customers', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ customers: pending }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      if (response.status === 401) {
        if (syncState.currentActiveRoute === 'CLOUD') {
          console.error('[SyncWorker] Push customers failed: HTTP 401 (token expired/unauthorized). Clearing auth and notifying user to re-login...');
          await clearAuthAndNotify();
        }
      }
      return false;
    }
    const result = await response.json();
    if (Array.isArray(result.synced) && result.synced.length > 0) {
      const markSynced = getDb().prepare(`UPDATE customers SET sync_status = 'SYNCED', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?`);
      const tx = getDb().transaction((ids: string[]) => { for (const id of ids) markSynced.run(id); });
      tx(result.synced);
    }
    if (Array.isArray(result.failed) && result.failed.length > 0) {
      const markFailed = getDb().prepare(`UPDATE customers SET sync_status = 'FAILED', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?`);
      const tx = getDb().transaction((items: any[]) => { for (const f of items) markFailed.run(f.customer_id); });
      tx(result.failed);
    }
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Push customers failed:', err.message);
    return false;
  }
}

// ── Pull Parties (Cloud → Edge) ─────────────────────────────────────────────
export async function pullParties(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsertParty = db.prepare(`
    INSERT INTO parties (
      party_id, tenant_id, name, phone, address, gstin, balance, gst_balance, estimate_balance, balance_type, party_type, custom_category, notes, last_transaction_date, pricing_tier_id, credit_limit, credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry, whatsapp_alerts_enabled, is_deleted,
      sync_status, created_at, updated_at
    ) VALUES (
      @party_id, @tenant_id, @name, @phone, @address, @gstin, @balance, @gst_balance, @estimate_balance, @balance_type, @party_type, @custom_category, @notes, @last_transaction_date, @pricing_tier_id, @credit_limit, @credit_period_enabled, @credit_period_days, @credit_period_basis, @restrict_on_credit_expiry, @whatsapp_alerts_enabled, @is_deleted,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(party_id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      address = excluded.address,
      gstin = excluded.gstin,
      balance = CASE
        WHEN EXISTS (SELECT 1 FROM party_ledger pl WHERE pl.party_id = parties.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0))
        THEN (SELECT ROUND(SUM(credit_amount) - SUM(debit_amount), 2) FROM party_ledger pl WHERE pl.party_id = parties.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0))
        ELSE excluded.balance
      END,
      gst_balance = CASE
        WHEN EXISTS (SELECT 1 FROM party_ledger pl WHERE pl.party_id = parties.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0))
        THEN (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'GST' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2) FROM party_ledger pl WHERE pl.party_id = parties.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0))
        ELSE excluded.gst_balance
      END,
      estimate_balance = CASE
        WHEN EXISTS (SELECT 1 FROM party_ledger pl WHERE pl.party_id = parties.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0))
        THEN (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'ESTIMATE' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2) FROM party_ledger pl WHERE pl.party_id = parties.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0))
        ELSE excluded.estimate_balance
      END,
      balance_type = excluded.balance_type,
      party_type = excluded.party_type,
      custom_category = excluded.custom_category,
      notes = excluded.notes,
      last_transaction_date = COALESCE(excluded.last_transaction_date, parties.last_transaction_date),
      pricing_tier_id = excluded.pricing_tier_id,
      credit_limit = excluded.credit_limit,
      credit_period_enabled = excluded.credit_period_enabled,
      credit_period_days = excluded.credit_period_days,
      credit_period_basis = excluded.credit_period_basis,
      restrict_on_credit_expiry = excluded.restrict_on_credit_expiry,
      whatsapp_alerts_enabled = excluded.whatsapp_alerts_enabled,
      is_deleted = excluded.is_deleted,
      created_at = COALESCE(parties.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE parties.sync_status != 'PENDING' OR excluded.updated_at >= parties.updated_at OR parties.updated_at IS NULL
  `);

  const findCustomerPartyDuplicate = db.prepare(`
    SELECT party_id FROM parties
    WHERE tenant_id = ? AND party_id != ? AND party_type = 'CUSTOMER'
      AND name = ? AND (phone = ? OR (phone IS NULL AND ? IS NULL))
      AND (is_deleted IS NULL OR is_deleted = 0)
    LIMIT 1
  `);

  const reassignPartyLedger = db.prepare(`
    UPDATE party_ledger SET party_id = ?, sync_status = 'SYNCED' WHERE party_id = ? AND tenant_id = ?
  `);

  const softDeleteParty = db.prepare(`
    UPDATE parties SET is_deleted = 1, sync_status = 'SYNCED' WHERE party_id = ? AND tenant_id = ?
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'parties',
    urlPath: '/api/sync/parties',
    label: 'parties',
    onProgress: (fetched) => notifyPullProgress('parties', fetched),
    processPage: (rows) => {
      const tx = db.transaction((parties: any[]) => {
        for (const p of parties) {
          try {
            const isCustomer = (p.party_type || 'CUSTOMER').toUpperCase() === 'CUSTOMER';
            const hasPhone = p.phone && p.phone.trim() !== '';
            const phoneVal = hasPhone ? p.phone.trim() : null;
            const tId = p.tenant_id || tenantId;

            if (isCustomer) {
              const dupParty: any = findCustomerPartyDuplicate.get(tId, p.party_id, p.name, phoneVal, phoneVal);
              if (dupParty) {
                // Reassign any local ledger entries to incoming canonical party_id and soft delete duplicate
                reassignPartyLedger.run(p.party_id, dupParty.party_id, tId);
                softDeleteParty.run(dupParty.party_id, tId);
              }
            }

            upsertParty.run({
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
              last_transaction_date: p.last_transaction_date ? toSqliteDate(p.last_transaction_date) : null,
              pricing_tier_id: p.pricing_tier_id || null,
              credit_limit: Number(p.credit_limit) || 0,
              credit_period_enabled: p.credit_period_enabled ? 1 : 0,
              credit_period_days: Math.max(1, parseInt(p.credit_period_days, 10) || 30),
              credit_period_basis: p.credit_period_basis || 'BILL_BASED',
              restrict_on_credit_expiry: p.restrict_on_credit_expiry !== false && (p.restrict_on_credit_expiry as any) !== 0 ? 1 : 0,
              whatsapp_alerts_enabled: p.whatsapp_alerts_enabled !== 0 && p.whatsapp_alerts_enabled !== false ? 1 : 0,
              is_deleted: parseIsDeleted(p.is_deleted),
              created_at: toSqliteDate(p.created_at),
              updated_at: toSqliteDate(p.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling party:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'parties', 'party_id', rows);
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
  const pendingEntries = db.prepare(`SELECT * FROM party_ledger WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];
  if (pendingEntries.length === 0) return;

  console.log(`[SyncWorker] Pushing ${pendingEntries.length} party ledger entries to cloud...`);
  const updateStmt = db.prepare(`UPDATE party_ledger SET sync_status = 'SYNCED' WHERE ledger_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pendingEntries.length; i += BATCH_SIZE) {
    const batch = pendingEntries.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/party-ledger',
      token,
      batch,
      'entries',
      `Party Ledger batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

export async function pushLoyaltyTransactions(token: string, tenantId: string): Promise<boolean> {
  try {
    const db = getDb();
    const pending = db.prepare(
      `SELECT * FROM loyalty_transactions WHERE tenant_id = ? AND sync_status IN ('PENDING', 'FAILED')`
    ).all(tenantId);
    if (!Array.isArray(pending) || pending.length === 0) return true;
    const { response } = await fetchWithFallback('/api/sync/loyalty-transactions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ loyalty_transactions: pending }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      if (response.status === 401) {
        if (syncState.currentActiveRoute === 'CLOUD') {
          console.error('[SyncWorker] Push loyalty transactions failed: HTTP 401 (token expired/unauthorized). Clearing auth and notifying user to re-login...');
          await clearAuthAndNotify();
        }
      }
      return false;
    }
    const result = await response.json();
    if (Array.isArray(result.synced) && result.synced.length > 0) {
      const markSynced = db.prepare("UPDATE loyalty_transactions SET sync_status = 'SYNCED' WHERE transaction_id = ?");
      const tx = db.transaction((ids: string[]) => { for (const id of ids) markSynced.run(id); });
      tx(result.synced);
    }
    if (Array.isArray(result.failed) && result.failed.length > 0) {
      const markFailed = db.prepare("UPDATE loyalty_transactions SET sync_status = 'FAILED' WHERE transaction_id = ?");
      const tx = db.transaction((items: any[]) => { for (const item of items) markFailed.run(item.transaction_id); });
      tx(result.failed);
    }
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Push loyalty transactions failed:', err.message);
    return false;
  }
}

// ── Pull Party Ledger (Cloud → Edge) ─────────────────────────────────────────
export async function pullPartyLedger(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO party_ledger (
      ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount,
      running_balance, balance_type, payment_method, reference_number, created_by, created_by_name, is_deleted, sync_status, created_at, updated_at
    ) VALUES (
      @ledger_id, @party_id, @tenant_id, @transaction_date, @description, @credit_amount, @debit_amount,
      @running_balance, @balance_type, @payment_method, @reference_number, @created_by, @created_by_name, @is_deleted, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(ledger_id) DO UPDATE SET
      transaction_date = excluded.transaction_date,
      description = excluded.description,
      credit_amount = excluded.credit_amount,
      debit_amount = excluded.debit_amount,
      running_balance = excluded.running_balance,
      balance_type = excluded.balance_type,
      payment_method = excluded.payment_method,
      reference_number = excluded.reference_number,
      created_by = excluded.created_by,
      created_by_name = excluded.created_by_name,
      is_deleted = excluded.is_deleted,
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE party_ledger.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'party_ledger',
    urlPath: '/api/sync/party-ledger',
    label: 'ledger entries',
    onProgress: (fetched) => notifyPullProgress('ledger entries', fetched),
    processPage: (rows) => {
      const tx = db.transaction((entries: any[]) => {
        for (const e of entries) {
          try {
            upsert.run({
              ledger_id: e.ledger_id,
              party_id: e.party_id,
              tenant_id: tenantId,
              transaction_date: toSqliteDate(e.transaction_date),
              description: e.description,
              credit_amount: e.credit_amount ?? 0,
              debit_amount: e.debit_amount ?? 0,
              running_balance: e.running_balance ?? 0,
              balance_type: e.balance_type === 'ESTIMATE' ? 'ESTIMATE' : 'GST',
              payment_method: e.payment_method || null,
              reference_number: e.reference_number || null,
              created_by: e.created_by || null,
              created_by_name: e.created_by_name || null,
              is_deleted: e.is_deleted ? 1 : 0,
              created_at: toSqliteDate(e.created_at),
              updated_at: toSqliteDate(e.updated_at),
            });
          } catch (err: any) {
            console.error('[SyncWorker] Error pulling ledger entry:', err.message);
          }
        }
      });
      tx(rows);
      if (rows && rows.length > 0) {
        try {
          db.prepare(`
            UPDATE parties
            SET balance = COALESCE(
                  (SELECT ROUND(SUM(credit_amount) - SUM(debit_amount), 2)
                   FROM party_ledger pl
                   WHERE pl.party_id = parties.party_id
                     AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
                  parties.balance, 0
                ),
                gst_balance = COALESCE(
                  (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'GST' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
                   FROM party_ledger pl
                   WHERE pl.party_id = parties.party_id
                     AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
                  parties.gst_balance, parties.balance, 0
                ),
                estimate_balance = COALESCE(
                  (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'ESTIMATE' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
                   FROM party_ledger pl
                   WHERE pl.party_id = parties.party_id
                     AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
                  parties.estimate_balance, 0
                ),
                last_transaction_date = COALESCE(
                  (SELECT MAX(pl.transaction_date)
                   FROM party_ledger pl
                   WHERE pl.party_id = parties.party_id
                     AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
                  parties.last_transaction_date
                )
            WHERE tenant_id = ? AND parties.party_id IN (
              SELECT DISTINCT pl.party_id FROM party_ledger pl WHERE pl.tenant_id = ? AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
            )
          `).run(tenantId, tenantId);
        } catch (recalcErr: any) {
          console.error('[SyncWorker] Recalc after pullPartyLedger error:', recalcErr.message);
        }
      }
      return reconcilePending(db, 'party_ledger', 'ledger_id', rows);
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
  const upsertCustomer = db.prepare(`
    INSERT INTO customers (
      customer_id, tenant_id, name, phone, address, pricing_tier_id,
      total_points_earned, total_points_redeemed, current_points_balance,
      last_purchase_date, is_deleted, sync_status, created_at, updated_at
    ) VALUES (
      @customer_id, @tenant_id, @name, @phone, @address, @pricing_tier_id,
      @total_points_earned, @total_points_redeemed, @current_points_balance,
      @last_purchase_date, @is_deleted, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(customer_id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      address = excluded.address,
      pricing_tier_id = excluded.pricing_tier_id,
      total_points_earned = excluded.total_points_earned,
      total_points_redeemed = excluded.total_points_redeemed,
      current_points_balance = excluded.current_points_balance,
      last_purchase_date = excluded.last_purchase_date,
      is_deleted = excluded.is_deleted,
      sync_status = 'SYNCED',
      updated_at = excluded.updated_at
    WHERE customers.sync_status != 'PENDING' OR excluded.updated_at >= customers.updated_at OR customers.updated_at IS NULL
  `);

  const findCustomerByPhone = db.prepare(`
    SELECT customer_id FROM customers 
    WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)
    LIMIT 1
  `);

  const findCustomerByNameNoPhone = db.prepare(`
    SELECT customer_id FROM customers 
    WHERE tenant_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND (phone IS NULL OR phone = '') AND (is_deleted IS NULL OR is_deleted = 0)
    LIMIT 1
  `);

  const updateCustomerById = db.prepare(`
    UPDATE customers 
    SET name = @name, phone = @phone, address = @address,
        pricing_tier_id = @pricing_tier_id,
        total_points_earned = @total_points_earned,
        total_points_redeemed = @total_points_redeemed,
        current_points_balance = @current_points_balance,
        last_purchase_date = @last_purchase_date,
        is_deleted = @is_deleted,
        sync_status = 'SYNCED',
        updated_at = @updated_at
    WHERE customer_id = @target_customer_id AND (sync_status != 'PENDING' OR @updated_at >= updated_at OR updated_at IS NULL)
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'customers',
    urlPath: '/api/sync/customers',
    label: 'customers',
    onProgress: (fetched) => notifyPullProgress('customers', fetched),
    processPage: (rows) => {
      const tx = db.transaction((rows: any[]) => {
        for (const r of rows) {
          try {
            const hasPhone = r.phone && r.phone.trim() !== '';
            const phoneVal = hasPhone ? r.phone.trim() : null;
            const tId = r.tenant_id || tenantId;

            // Check if another local customer already has this phone or name (without phone)
            let existingLocalCust: any = null;
            if (phoneVal) {
              existingLocalCust = findCustomerByPhone.get(tId, phoneVal);
            } else if (r.name) {
              existingLocalCust = findCustomerByNameNoPhone.get(tId, r.name);
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
              last_purchase_date: toSqliteDate(r.last_purchase_date),
              is_deleted: r.is_deleted ? 1 : 0,
              created_at: toSqliteDate(r.created_at),
              updated_at: toSqliteDate(r.updated_at),
            };

            if (existingLocalCust && existingLocalCust.customer_id !== r.customer_id) {
              // Update the existing local customer to prevent UNIQUE constraint violation
              updateCustomerById.run({
                ...rowParams,
                target_customer_id: existingLocalCust.customer_id,
              });
            } else {
              upsertCustomer.run(rowParams);
            }
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling customer:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'customers', 'customer_id', rows);
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

  const upsert = db.prepare(`
    INSERT INTO loyalty_transactions (transaction_id, tenant_id, customer_id, invoice_id,
      transaction_type, points, points_balance_before, points_balance_after,
      reference_number, description, created_by, sync_status, created_at)
    VALUES (@transaction_id, @tenant_id, @customer_id, @invoice_id,
      @transaction_type, @points, @points_balance_before, @points_balance_after,
      @reference_number, @description, @created_by, 'SYNCED', @created_at)
    ON CONFLICT(transaction_id) DO UPDATE SET
      transaction_type = excluded.transaction_type, points = excluded.points,
      points_balance_before = excluded.points_balance_before,
      points_balance_after = excluded.points_balance_after,
      reference_number = excluded.reference_number, description = excluded.description,
      sync_status = 'SYNCED'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'loyalty_transactions',
    urlPath: '/api/sync/loyalty-transactions',
    label: 'loyalty transactions',
    tsColumn: 'created_at',
    onProgress: (fetched) => notifyPullProgress('loyalty transactions', fetched),
    processPage: (rows) => {
      const tx = db.transaction((rows: any[]) => {
        for (const r of rows) {
          upsert.run({
            transaction_id: r.transaction_id, tenant_id: r.tenant_id || tenantId,
            customer_id: r.customer_id, invoice_id: r.invoice_id || null,
            transaction_type: r.transaction_type, points: r.points,
            points_balance_before: r.points_balance_before ?? 0,
            points_balance_after: r.points_balance_after ?? 0,
            reference_number: r.reference_number || null, description: r.description || null,
            created_by: r.created_by || null, created_at: toSqliteDate(r.created_at),
          });
        }
      });
      tx(rows);
      return reconcilePending(db, 'loyalty_transactions', 'transaction_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} loyalty transactions.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull loyalty transactions failed.');
  }
  return result.hasChanged && result.count > 0;
}
