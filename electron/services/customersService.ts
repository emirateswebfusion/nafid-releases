import { getDb } from '../db/localDb.js';
import { autoDeduplicateCustomersAndParties } from '../db/customerDedupe.js';
import { checkCustomerOverdueSync, computeCustomerCreditStatusSync } from './customerCreditService.js';
import crypto from 'node:crypto';
import { localTimestamp } from './storeTime.js';
import * as customersSql from '../db/statements/customers.js';
/** customers use-cases for the main process (called by electron/ipc handlers). */

const customerCreateCache = new Map<string, number>();

/** IPC `db:getCustomers` */
export function getCustomers({ tenant_id, active, credit, pricing_tier_id, search, overdue }: { tenant_id: string; active?: boolean; credit?: boolean; pricing_tier_id?: string; search?: string; overdue?: boolean }) {
  try {
    const db = getDb();
    if (!tenant_id) return [];

    // Single LEFT JOIN to best-matching party (CUSTOMER-type preferred, highest absolute balance)
    // resolves all 6 party fields in one pass instead of 6 correlated subqueries
    const { statement, params } = customersSql.getCustomersStatement(db, { tenant_id, search, active, credit, pricing_tier_id });

    const rows = statement.all(...params) as any[];

    for (const row of rows) {
      const bal = Number(row.party_balance || 0);
      const periodEnabled = Boolean(row.credit_period_enabled);
      if (bal > 0 && periodEnabled) {
        const overdueStatus = checkCustomerOverdueSync(db, tenant_id, row.customer_id, row.phone, row.name);
        row.has_overdue = overdueStatus.isOverdue;
        row.overdue_bills_count = overdueStatus.overdueCount;
        row.overdue_amount = overdueStatus.overdueAmount;
        row.oldest_overdue_days = overdueStatus.oldestOverdueDays;
      } else {
        row.has_overdue = false;
        row.overdue_bills_count = 0;
        row.overdue_amount = 0;
        row.oldest_overdue_days = 0;
      }
    }

    if (overdue === true || String(overdue) === 'true') {
      return rows.filter((r: any) => r.has_overdue);
    }

    return rows;
  } catch (error: any) {
    console.error('[db:getCustomers]', error);
    return [];
  }
}

/** IPC `db:checkCustomerCreditStatus` */
export function checkCustomerCreditStatus({ tenant_id, customer_id, customer_name, customer_phone }: { tenant_id: string; customer_id?: string; customer_name?: string; customer_phone?: string }) {
  try {
    const db = getDb();
    const status = checkCustomerOverdueSync(db, tenant_id, customer_id, customer_phone, customer_name);
    return {
      allowed: !(status.creditPeriodEnabled && status.restrictOnExpiry && status.isOverdue),
      ...status
    };
  } catch (error: any) {
    console.error('[db:checkCustomerCreditStatus]', error);
    return { allowed: true, isOverdue: false, error: error.message };
  }
}

/** IPC `db:createCustomer` */
export function createCustomer(c: any) {
  try {
    const db = getDb();
    if (!c.name || !c.tenant_id) return { success: false, error: 'Customer name and Tenant ID are required' };
    
    // Deduplication cache: block duplicate create requests within 2-second window
    const cacheKey = `createCust:${c.tenant_id}:${c.name.trim().toLowerCase()}:${(c.phone || '').trim()}`;
    const now = Date.now();
    const cached = customerCreateCache.get(cacheKey);
    if (cached && (now - cached < 2000)) {
      console.warn(`[db:createCustomer] Duplicate create request blocked within 2s window. Returning existing.`);
      return { success: false, error: 'Duplicate request blocked. Please wait.' };
    }

    const nameClean = (c.name || '').trim().toLowerCase();
    const existingSameName = customersSql.findCustomers(db).get(c.tenant_id, nameClean);
    if (existingSameName) {
      return { success: false, error: `A customer named "${c.name.trim()}" already exists!` };
    }

    const customerId = c.customer_id || crypto.randomUUID();
    const creditLimit = Math.max(0, Number(c.credit_limit) || 0);
    const creditPeriodEnabled = c.credit_period_enabled ? 1 : 0;
    const creditPeriodDays = Math.max(1, parseInt(c.credit_period_days, 10) || 30);
    const creditPeriodBasis = c.credit_period_basis || 'BILL_BASED';
    const restrictOnCreditExpiry = c.restrict_on_credit_expiry !== undefined ? (c.restrict_on_credit_expiry ? 1 : 0) : 1;

    const cleanGstin = (c.gstin || '').trim().toUpperCase() || null;
    const cleanNotes = (c.notes || '').trim() || null;

    customersSql.insertCustomer(db).run(
      customerId, c.tenant_id, c.name, c.phone || null, c.address || null, cleanGstin, cleanNotes, c.pricing_tier_id || null,
      creditLimit, creditPeriodEnabled, creditPeriodDays, creditPeriodBasis, restrictOnCreditExpiry
    );

    // Also sync to parties table as CUSTOMER party
    let matchedParty: any = null;
    const cleanPhone = (c.phone || '').trim();
    const cleanName = (c.name || '').trim();
    if (cleanPhone) {
      matchedParty = customersSql.findPartiesByPhone(db).get(c.tenant_id, cleanPhone);
    }
    if (!matchedParty && cleanName) {
      matchedParty = customersSql.findParties(db).get(c.tenant_id, cleanName.toLowerCase());
    }

    if (matchedParty) {
      customersSql.updatePartyByPartyId(db).run(
        c.name, c.phone || null, c.address || null,
        cleanGstin, cleanNotes,
        creditLimit, creditPeriodEnabled, creditPeriodDays, creditPeriodBasis, restrictOnCreditExpiry,
        c.pricing_tier_id || null, matchedParty.party_id
      );
    } else {
      const partyId = crypto.randomUUID();
      customersSql.insertParty(db).run(
        partyId, c.tenant_id, c.name, c.phone || null, c.address || null, cleanGstin, cleanNotes,
        c.pricing_tier_id || null, creditLimit, creditPeriodEnabled, creditPeriodDays, creditPeriodBasis, restrictOnCreditExpiry
      );
    }

    // Record successful creation in cache
    customerCreateCache.set(cacheKey, now);
    // Cleanup old cache entries
    if (customerCreateCache.size > 100) {
      for (const [k, v] of customerCreateCache.entries()) {
        if (now - v > 30000) customerCreateCache.delete(k);
      }
    }

    return { success: true, customer_id: customerId };
  } catch (error: any) {
    console.error('[db:createCustomer]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:deduplicateCustomers` */
export function deduplicateCustomers(tenant_id?: string) {
  try {
    const db = getDb();
    const result = autoDeduplicateCustomersAndParties(db);
    return { success: true, ...result };
  } catch (error: any) {
    console.error('[db:deduplicateCustomers]', error);
    return { success: false, error: error.message };
  }
}

/** IPC `db:findCustomers` */
export function findCustomers({ tenant_id, name, phone }: { tenant_id: string; name?: string; phone?: string }) {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    const { statement, params } = customersSql.findCustomersStatement(db, { tenant_id, name, phone });
    return statement.all(...params);
  } catch (error: any) {
    console.error('[db:findCustomers]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:deleteCustomer` */
export function deleteCustomer({ customer_id, tenant_id }: { customer_id: string; tenant_id: string }) {
  try {
    const db = getDb();
    if (!customer_id || !tenant_id) return { success: false, error: 'Customer ID and Tenant ID are required' };

    return db.transaction(() => {
      // 1. Fetch customer details
      const customer = customersSql.findCustomersByCustomerId(db).get(customer_id, tenant_id) as any;
      if (!customer) return { success: false, error: 'Customer not found' };

      // 2. Mark customer as deleted
      customersSql.updateCustomerIsDeleted(db).run(customer_id, tenant_id);

      // 3. Find matching party by phone or name
      let matchedParties: any[] = [];
      const cleanPhone = (customer.phone || '').trim();
      const cleanName = (customer.name || '').trim();

      if (cleanPhone) {
        matchedParties = customersSql.findPartiesByPhonePartyIdAndName(db).all(tenant_id, cleanPhone);
      }
      if (matchedParties.length === 0 && cleanName) {
        matchedParties = customersSql.findPartiesByName(db).all(tenant_id, cleanName);
      }

      // 4. Soft-delete matched parties and their party_ledger entries
      for (const party of matchedParties) {
        customersSql.updatePartyIsDeleted(db).run(party.party_id, tenant_id);
        customersSql.updatePartyLedgerIsDeleted(db).run(party.party_id, tenant_id);
      }

      return { success: true, deleted_party_count: matchedParties.length };
    })();
  } catch (error: any) {
    console.error('[db:deleteCustomer]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:updateCustomer` */
export function updateCustomer(c: any) {
  try {
    const db = getDb();
    if (!c.customer_id || !c.tenant_id) return { success: false, error: 'Customer ID and Tenant ID are required' };

    const hasCreditLimit = c.credit_limit !== undefined;
    const hasCreditPeriodEnabled = c.credit_period_enabled !== undefined;
    const hasCreditPeriodDays = c.credit_period_days !== undefined;
    const hasCreditPeriodBasis = c.credit_period_basis !== undefined;
    const hasRestrictOnCreditExpiry = c.restrict_on_credit_expiry !== undefined;

    const creditLimit = hasCreditLimit ? Math.max(0, Number(c.credit_limit) || 0) : 0;
    const creditPeriodEnabled = hasCreditPeriodEnabled ? (c.credit_period_enabled ? 1 : 0) : 0;
    const creditPeriodDays = hasCreditPeriodDays ? Math.max(1, parseInt(c.credit_period_days, 10) || 30) : 30;
    const creditPeriodBasis = c.credit_period_basis || 'BILL_BASED';
    const restrictOnCreditExpiry = hasRestrictOnCreditExpiry ? (c.restrict_on_credit_expiry ? 1 : 0) : 1;

    let updateSql = `
      UPDATE customers
      SET name = ?, phone = ?, address = ?,
          pricing_tier_id = ?
    `;
    const params: any[] = [c.name, c.phone || null, c.address || null, c.pricing_tier_id || null];

    if (c.gstin !== undefined) {
      updateSql += `, gstin = ?`;
      params.push(c.gstin ? c.gstin.trim().toUpperCase() : null);
    }
    if (c.notes !== undefined) {
      updateSql += `, notes = ?`;
      params.push(c.notes ? c.notes.trim() : null);
    }
    if (hasCreditLimit) {
      updateSql += `, credit_limit = ?`;
      params.push(creditLimit);
    }
    if (hasCreditPeriodEnabled) {
      updateSql += `, credit_period_enabled = ?`;
      params.push(creditPeriodEnabled);
    }
    if (hasCreditPeriodDays) {
      updateSql += `, credit_period_days = ?`;
      params.push(creditPeriodDays);
    }
    if (hasCreditPeriodBasis) {
      updateSql += `, credit_period_basis = ?`;
      params.push(creditPeriodBasis);
    }
    if (hasRestrictOnCreditExpiry) {
      updateSql += `, restrict_on_credit_expiry = ?`;
      params.push(restrictOnCreditExpiry);
    }

    // Fetch existing customer details before update to ensure robust matching even if name or phone changed
    const oldCustomerRow: any = customersSql.findCustomersByCustomerIdTenantIdAndPhone(db).get(c.customer_id, c.tenant_id);
    const oldPhone = (oldCustomerRow?.phone || '').trim();
    const oldName = (oldCustomerRow?.name || '').trim();
    const newPhone = (c.phone || '').trim();
    const newName = (c.name || '').trim();

    updateSql += `, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ? AND tenant_id = ?`;
    params.push(c.customer_id, c.tenant_id);

    db.prepare(updateSql).run(...params);

    // Sync to matching party in parties
    let matchedParty: any = null;
    if (newPhone) {
      matchedParty = customersSql.findPartiesByPhone(db).get(c.tenant_id, newPhone);
    }
    if (!matchedParty && oldPhone) {
      matchedParty = customersSql.findPartiesByPhone(db).get(c.tenant_id, oldPhone);
    }
    if (!matchedParty && newName) {
      matchedParty = customersSql.findParties(db).get(c.tenant_id, newName.toLowerCase());
    }
    if (!matchedParty && oldName) {
      matchedParty = customersSql.findParties(db).get(c.tenant_id, oldName.toLowerCase());
    }

    if (matchedParty) {
      customersSql.updatePartyByPartyId2(db).run(
        c.name,
        c.phone || null,
        c.address || null,
        c.gstin !== undefined ? (c.gstin ? c.gstin.trim().toUpperCase() : null) : null,
        c.notes !== undefined ? (c.notes ? c.notes.trim() : null) : null,
        hasCreditLimit ? creditLimit : null,
        hasCreditPeriodEnabled ? creditPeriodEnabled : null,
        hasCreditPeriodDays ? creditPeriodDays : null,
        hasCreditPeriodBasis ? creditPeriodBasis : null,
        hasRestrictOnCreditExpiry ? restrictOnCreditExpiry : null,
        c.pricing_tier_id || null,
        matchedParty.party_id
      );
    }

    return { success: true };
  } catch (error: any) {
    console.error('[db:updateCustomer]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}

/** IPC `db:getCustomerInvoices` */
export function getCustomerInvoices({ customer_id, tenant_id, phone, name }: { customer_id: string; tenant_id: string; phone?: string; name?: string }) {
  try {
    const db = getDb();
    if (!customer_id && !phone && !name) return [];
    const effectiveTenantId = tenant_id || 'global';

    // 1. Resolve customer record
    let cust: any = null;
    if (customer_id) {
      cust = customersSql.findCustomersByCustomerId2(db).get(customer_id, effectiveTenantId);
    }
    const cleanArgPhone = (phone || '').replace(/\D/g, '');
    if (!cust && cleanArgPhone.length >= 7) {
      cust = customersSql.findCustomersByPhone(db).get(effectiveTenantId, phone, `%${cleanArgPhone.slice(-10)}`);
    }
    if (!cust && name) {
      cust = customersSql.findCustomerByName(db).get(effectiveTenantId, name.trim(), name.trim());
    }

    // 2. Resolve associated party
    const searchPhone = (cust?.phone || phone || '').trim();
    const searchName = (cust?.name || name || '').trim();
    const phoneClean = searchPhone.replace(/\D/g, '');
    const phoneLast10 = phoneClean.length >= 7 ? phoneClean.slice(-10) : '';

    let party: any = null;
    if (customer_id) {
      party = customersSql.findPartiesByPartyId(db).get(customer_id, effectiveTenantId);
    }
    if (!party && phoneLast10) {
      party = customersSql.findOnePartyByPhone(db).get(effectiveTenantId, searchPhone, `%${phoneLast10}`);
    }
    if (!party && searchName) {
      party = customersSql.findPartyByName(db).get(effectiveTenantId, searchName, searchName);
    }

    // If customer wasn't found in customers table, but party was, try finding customer via party
    if (!cust && party) {
      const pClean = (party.phone || '').replace(/\D/g, '');
      if (pClean.length >= 7) {
        cust = customersSql.findCustomersByPhone(db).get(effectiveTenantId, party.phone, `%${pClean.slice(-10)}`);
      }
      if (!cust && party.name) {
        cust = customersSql.findCustomerByName(db).get(effectiveTenantId, party.name.trim(), party.name.trim());
      }
    }

    const targetCustomerId = cust?.customer_id || customer_id;
    const targetPartyId = party?.party_id || '';
    const nameNorm = searchName ? searchName.toLowerCase().replace(/\s+/g, ' ') : '';

    // 3. Self-healing: link any unlinked invoices belonging to this customer
    if (targetCustomerId) {
      if (phoneLast10) {
        customersSql.updateInvoiceCustomerId(db).run(targetCustomerId, effectiveTenantId, `%${phoneLast10}`);
      }
      if (nameNorm) {
        customersSql.updateInvoiceCustomerId2(db).run(targetCustomerId, effectiveTenantId, nameNorm, phoneLast10, `%${phoneLast10}`);
      }
    }

    // 4. Query all matching invoices
    const rawInvoices = customersSql.findInvoicesByCustomerId(db).all(
      effectiveTenantId,
      targetCustomerId || '', targetCustomerId || '',
      targetPartyId || '', targetPartyId || '',
      phoneLast10 ? `%${phoneLast10}` : '', phoneLast10 ? `%${phoneLast10}` : '',
      nameNorm || '', nameNorm || '', phoneLast10 || ''
    ) as any[];

    return computeCustomerCreditStatusSync(db, effectiveTenantId, targetCustomerId, rawInvoices);
  } catch (error: any) {
    console.error('[db:getCustomerInvoices]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:getCustomerLoyaltyTransactions` */
export function getCustomerLoyaltyTransactions({ customer_id, tenant_id }: { customer_id: string; tenant_id: string }) {
  try {
    const db = getDb();
    if (!customer_id) return [];
    const tid = tenant_id || 'global';
    return customersSql.findLoyaltyTransactionsByCustomerId(db).all(customer_id, tid, tid);
  } catch (error: any) {
    console.error('[db:getCustomerLoyaltyTransactions]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:adjustCustomerLoyaltyPoints` */
export function adjustCustomerLoyaltyPoints(payload: {
  customer_id: string;
  tenant_id: string;
  points: number;
  reason?: string;
  user_name?: string;
}) {
  const db = getDb();
  const tid = payload.tenant_id || 'global';
  const cust: any = customersSql.findCustomersByCustomerId3(db).get(payload.customer_id);
  if (!cust) return { success: false, error: 'Customer not found' };

  const currentBal = Number(cust.current_points_balance) || 0;
  const delta = Number(payload.points) || 0;
  if (delta === 0) return { success: false, error: 'Points amount cannot be zero' };
  if (currentBal + delta < 0) return { success: false, error: 'Customer does not have enough points balance to deduct' };

  const newBal = currentBal + delta;
  const txId = crypto.randomUUID();
  const now = localTimestamp();

  const transaction = db.transaction(() => {
    customersSql.insertLoyaltyTransaction(db).run(
      txId, tid, payload.customer_id,
      Math.abs(delta), currentBal, newBal,
      payload.reason || (delta > 0 ? `Manual adjustment (+${delta} pts)` : `Manual adjustment (${delta} pts)`),
      payload.user_name || 'admin',
      now, now
    );

    customersSql.updateCustomerByCustomerId(db).run(
      delta > 0 ? delta : 0,
      delta < 0 ? Math.abs(delta) : 0,
      newBal,
      payload.customer_id
    );
  });

  transaction();
  return { success: true, new_balance: newBal, transaction_id: txId };
}

/** IPC `db:recalculateCustomerLoyaltyPoints` */
export function recalculateCustomerLoyaltyPoints(payload: { tenant_id: string }) {
  const db = getDb();
  const tid = payload.tenant_id || 'global';
  const lCfgRow: any = customersSql.findSettingsByKey(db).get(tid)
    || customersSql.findSettingsByKeyLoyaltyConfig(db).get();
  let lCfg: any = null;
  if (lCfgRow?.value) {
    try {
      lCfg = typeof lCfgRow.value === 'string' ? JSON.parse(lCfgRow.value) : lCfgRow.value;
    } catch {}
  }
  const earningRate = Math.max(1, Number(lCfg?.earningRate) || 100);
  const awardOnPending = Boolean(lCfg?.awardPointsOnPending);
  const paymentFilter = awardOnPending ? "AND (payment_method IS NULL OR UPPER(payment_method) NOT IN ('HOLD'))" : "AND (payment_method IS NULL OR UPPER(payment_method) NOT IN ('PENDING', 'HOLD'))";

  const custs: any[] = customersSql.findCustomersCustomerIdAndPhone(db).all(tid, tid);
  let updatedCount = 0;

  const transaction = db.transaction(() => {
    for (const c of custs) {
      const invRow: any = customersSql.sumLoyaltyPointsForCustomer(db, paymentFilter).get(c.customer_id, c.phone || '');

      let earned = Number(invRow?.totEarned) || 0;
      const redeemed = Number(invRow?.totRedeemed) || 0;

      // If invoices did not have points_earned stored previously, compute from sales total
      if (earned === 0 && redeemed === 0) {
        const salesRow: any = customersSql.sumSalesForCustomer(db, paymentFilter).get(c.customer_id, c.phone || '');
        const totSales = Number(salesRow?.totSales) || 0;
        if (totSales > 0) {
          earned = Math.floor(totSales / earningRate);
        }
      }

      const bal = Math.max(0, earned - redeemed);
      customersSql.updateCustomerByCustomerId2(db).run(earned, redeemed, bal, invRow?.lastPurchase || null, c.customer_id);
      updatedCount++;
    }
  });

  transaction();
  return { success: true, updatedCount };
}
