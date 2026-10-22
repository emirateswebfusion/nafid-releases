import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { db } from './localDb.js';

/** Customer/party identity: resolution, upsert, startup backfill and de-duplication (data repair used by initDb and services). */

function deterministicUUID(seed: string): string {
  const hash = crypto.createHash('sha1').update(seed).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * CustomerIdentityService - Single authoritative source for customer/party identity resolution
 * Replaces all scattered matching logic across the codebase
 */
export class CustomerIdentityService {
  /**
   * Find or create a customer and their corresponding party record atomically
   * Uses deterministic IDs based on stable business keys (phone or name+tenant)
   */
  static findOrCreateCustomerAndParty(
    db: Database.Database,
    tenantId: string,
    rawData: {
      customer_id?: string | null;
      name?: string | null;
      phone?: string | null;
      address?: string | null;
      gstin?: string | null;
      notes?: string | null;
      pricing_tier_id?: string | null;
      credit_limit?: number | string;
      credit_period_enabled?: boolean | number;
      credit_period_days?: number | string;
      credit_period_basis?: string;
      restrict_on_credit_expiry?: boolean | number | string;
    }
  ): { customer_id: string; party_id: string; isNew: boolean } | null {
    if (!db || !tenantId) return null;

    const name = (rawData.name || '').trim().replace(/\s+/g, ' ');
    const phone = (rawData.phone || '').trim() || null;
    const address = (rawData.address || '').trim() || null;
    const gstin = (rawData.gstin || '').trim().toUpperCase() || null;
    const notes = (rawData.notes || '').trim() || null;
    const pricingTierId = rawData.pricing_tier_id || null;
    const creditLimit = rawData.credit_limit !== undefined && rawData.credit_limit !== null
      ? Math.max(0, Number(rawData.credit_limit) || 0)
      : null;
    const creditPeriodEnabled = rawData.credit_period_enabled !== undefined && rawData.credit_period_enabled !== null
      ? (rawData.credit_period_enabled ? 1 : 0)
      : null;
    const creditPeriodDays = rawData.credit_period_days !== undefined && rawData.credit_period_days !== null
      ? Math.max(1, parseInt(String(rawData.credit_period_days || 30), 10) || 30)
      : null;
    const creditPeriodBasis = rawData.credit_period_basis || null;
    const restrictOnCreditExpiry = rawData.restrict_on_credit_expiry !== undefined && rawData.restrict_on_credit_expiry !== null
      ? (String(rawData.restrict_on_credit_expiry) === 'false' || String(rawData.restrict_on_credit_expiry) === '0' ? 0 : 1)
      : null;

    if (!name && !phone && !rawData.customer_id) return null;

    const phoneClean = (phone || '').replace(/\D/g, '');
    const displayName = name || phone || 'Customer';
    const now = new Date().toISOString();

    try {
      // ========== LOOKUP PHASE ==========
      // Look up existingCustomer and existingParty INDEPENDENTLY
      // Priority: 1) customer_id  2) Exact name + phone  3) Phone match (last 10 digits)  4) Case-insensitive name
      
      let existingCustomer: any = null;
      let existingParty: any = null;

      // 0. Try direct customer_id / party_id match first if provided
      if (rawData.customer_id) {
        existingCustomer = db.prepare(`
          SELECT * FROM customers 
          WHERE tenant_id = ? AND customer_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          LIMIT 1
        `).get(tenantId, rawData.customer_id);

        existingParty = db.prepare(`
          SELECT * FROM parties 
          WHERE tenant_id = ? AND party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          LIMIT 1
        `).get(tenantId, rawData.customer_id);
      }

      // 1. Try exact name + phone match
      if (name && phone) {
        if (!existingCustomer) {
          existingCustomer = db.prepare(`
            SELECT * FROM customers 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND phone = ?
            LIMIT 1
          `).get(tenantId, name, phone);
        }

        if (!existingParty) {
          existingParty = db.prepare(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (party_type = 'CUSTOMER' OR party_type IS NULL)
              AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND phone = ?
            ORDER BY created_at ASC
            LIMIT 1
          `).get(tenantId, name, phone);
        }
      }

      // 2. Try phone match (cleaned, last 10 digits)
      if (phoneClean.length >= 7) {
        const last10 = phoneClean.slice(-10);
        if (!existingCustomer) {
          existingCustomer = db.prepare(`
            SELECT * FROM customers 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '') LIKE ?
            LIMIT 1
          `).get(tenantId, `%${last10}`);
        }
        if (!existingParty) {
          existingParty = db.prepare(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (party_type = 'CUSTOMER' OR party_type IS NULL)
              AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '') LIKE ?
            ORDER BY created_at ASC
            LIMIT 1
          `).get(tenantId, `%${last10}`);
        }
      }

      // 3. Try case-insensitive name match
      if (name) {
        if (!existingCustomer) {
          existingCustomer = db.prepare(`
            SELECT * FROM customers 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND LOWER(TRIM(name)) = LOWER(TRIM(?))
            ORDER BY 
              CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END,
              created_at ASC
            LIMIT 1
          `).get(tenantId, name);
        }
        if (!existingParty) {
          existingParty = db.prepare(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (party_type = 'CUSTOMER' OR party_type IS NULL)
              AND LOWER(TRIM(name)) = LOWER(TRIM(?))
            ORDER BY 
              CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END,
              created_at ASC
            LIMIT 1
          `).get(tenantId, name);
        }
      }

      // 4. Cross-check: If customer found but party not found, search party by customer's phone or name
      if (existingCustomer && !existingParty) {
        const cPhone = (existingCustomer.phone || '').trim();
        const cClean = cPhone.replace(/\D/g, '');
        const cName = (existingCustomer.name || '').trim();
        if (cClean.length >= 7) {
          existingParty = db.prepare(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (party_type = 'CUSTOMER' OR party_type IS NULL)
              AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '') LIKE ?
            ORDER BY created_at ASC
            LIMIT 1
          `).get(tenantId, `%${cClean.slice(-10)}`);
        }
        if (!existingParty && cName) {
          existingParty = db.prepare(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (party_type = 'CUSTOMER' OR party_type IS NULL)
              AND LOWER(TRIM(name)) = LOWER(TRIM(?))
            ORDER BY created_at ASC
            LIMIT 1
          `).get(tenantId, cName);
        }
      }

      // 5. Fallback check for parties matching idx_parties_tenant_name_phone_customer
      if (!existingParty && displayName) {
        existingParty = db.prepare(`
          SELECT * FROM parties 
          WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
            AND (party_type = 'CUSTOMER' OR party_type IS NULL)
            AND name = ? AND (phone = ? OR (phone IS NULL AND ? IS NULL))
          LIMIT 1
        `).get(tenantId, displayName, phone, phone);
      }

      const isNew = !existingCustomer && !existingParty;
      let finalCustomerId = existingCustomer?.customer_id;
      let finalPartyId = existingParty?.party_id;

      // ========== PROCESS CUSTOMER ==========
      if (existingCustomer) {
        try {
          const custHasRealName = existingCustomer.name && !['customer', 'walk-in', 'walk in', 'default'].includes(existingCustomer.name.trim().toLowerCase());
          const finalCustName = custHasRealName ? existingCustomer.name : (displayName || existingCustomer.name);
          const finalCustPhone = (existingCustomer.phone && existingCustomer.phone.trim() !== '') ? existingCustomer.phone : (phone || null);
          const finalCustAddress = (existingCustomer.address && existingCustomer.address.trim() !== '') ? existingCustomer.address : (address || null);
          const finalCustGstin = (existingCustomer.gstin && existingCustomer.gstin.trim() !== '') ? existingCustomer.gstin : (gstin || null);
          const finalCustNotes = (existingCustomer.notes && existingCustomer.notes.trim() !== '') ? existingCustomer.notes : (notes || null);

          db.prepare(`
            UPDATE customers
            SET name = ?, phone = ?, address = ?,
                gstin = ?, notes = ?,
                is_deleted = 0,
                last_purchase_date = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = ?
          `).run(
            finalCustName, finalCustPhone, finalCustAddress, finalCustGstin, finalCustNotes,
            now, existingCustomer.customer_id
          );
        } catch (_) {
          try {
            db.prepare(`
              UPDATE customers
              SET last_purchase_date = ?, is_deleted = 0, updated_at = CURRENT_TIMESTAMP
              WHERE customer_id = ?
            `).run(now, existingCustomer.customer_id);
          } catch {}
        }
      } else {
        const customerSeedKey = phoneClean.length >= 7
          ? `cust:${tenantId}:${phoneClean.slice(-10)}`
          : `cust:${tenantId}:${name.toLowerCase()}:${Date.now()}`;
        finalCustomerId = deterministicUUID(customerSeedKey);

        try {
          db.prepare(`
            INSERT INTO customers (
              customer_id, tenant_id, name, phone, address, gstin, notes, pricing_tier_id,
              credit_limit, credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry,
              total_points_earned, total_points_redeemed, current_points_balance, last_purchase_date,
              is_deleted, sync_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 0, 'PENDING', ?, ?)
          `).run(
            finalCustomerId, tenantId, displayName, phone, address, gstin, notes, pricingTierId,
            creditLimit ?? 0, creditPeriodEnabled ?? 0, creditPeriodDays ?? 30, creditPeriodBasis ?? 'BILL_BASED', restrictOnCreditExpiry ?? 0,
            now, now, now
          );
        } catch (insertCustErr: any) {
          const fallbackCust: any = db.prepare(`
            SELECT customer_id FROM customers 
            WHERE tenant_id = ? AND (
              customer_id = ? 
              OR (phone IS NOT NULL AND phone = ?)
              OR (? != '' AND phone IS NOT NULL AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '') LIKE ?)
              OR (name IS NOT NULL AND LOWER(TRIM(name)) = LOWER(TRIM(?)))
            ) LIMIT 1
          `).get(tenantId, finalCustomerId, phone, phoneClean.length >= 7 ? `%${phoneClean.slice(-10)}` : '', phoneClean.length >= 7 ? `%${phoneClean.slice(-10)}` : '', name);
          if (fallbackCust) {
            finalCustomerId = fallbackCust.customer_id;
            try {
              db.prepare('UPDATE customers SET is_deleted = 0, updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?').run(finalCustomerId);
            } catch {}
          }
        }
      }

      // ========== PROCESS PARTY ==========
      if (existingParty) {
        try {
          const partyHasRealName = existingParty.name && !['customer', 'walk-in', 'walk in', 'default'].includes(existingParty.name.trim().toLowerCase());
          const finalPartyName = partyHasRealName ? existingParty.name : (displayName || existingParty.name);
          const finalPartyPhone = (existingParty.phone && existingParty.phone.trim() !== '') ? existingParty.phone : (phone || null);
          const finalPartyAddress = (existingParty.address && existingParty.address.trim() !== '') ? existingParty.address : (address || null);
          const finalPartyGstin = (existingParty.gstin && existingParty.gstin.trim() !== '') ? existingParty.gstin : (gstin || null);
          const finalPartyNotes = (existingParty.notes && existingParty.notes.trim() !== '') ? existingParty.notes : (notes || null);

          const wasDeleted = existingParty.is_deleted === 1;
          const phoneChanged = !existingParty.phone && finalPartyPhone;
          const addrChanged = !existingParty.address && finalPartyAddress;
          const gstinChanged = !existingParty.gstin && finalPartyGstin;
          const nameChanged = !partyHasRealName && finalPartyName !== existingParty.name;

          if (wasDeleted || phoneChanged || addrChanged || gstinChanged || nameChanged) {
            db.prepare(`
              UPDATE parties
              SET name = ?, phone = ?, address = ?, gstin = ?, notes = ?,
                  is_deleted = 0,
                  sync_status = CASE WHEN sync_status = 'SYNCED' THEN 'PENDING' ELSE sync_status END,
                  updated_at = CURRENT_TIMESTAMP
              WHERE party_id = ?
            `).run(
              finalPartyName, finalPartyPhone, finalPartyAddress, finalPartyGstin, finalPartyNotes,
              existingParty.party_id
            );
          }
        } catch (_) {
          try {
            db.prepare('UPDATE parties SET is_deleted = 0 WHERE party_id = ?').run(existingParty.party_id);
          } catch {}
        }
      } else {
        const partySeedKey = phoneClean.length >= 7
          ? `party:${tenantId}:${phoneClean.slice(-10)}`
          : `party:${tenantId}:${name.toLowerCase()}:${Date.now()}`;
        finalPartyId = deterministicUUID(partySeedKey);

        try {
          db.prepare(`
            INSERT INTO parties (
              party_id, tenant_id, name, phone, address, gstin, notes,
              balance, gst_balance, estimate_balance, balance_type, party_type,
              pricing_tier_id, credit_limit,
              credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry,
              is_deleted, sync_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'RECEIVABLE', 'CUSTOMER', ?, ?, ?, ?, ?, ?, 0, 'PENDING', ?, ?)
          `).run(
            finalPartyId, tenantId, displayName, phone, address, gstin, notes,
            pricingTierId, creditLimit ?? 0, creditPeriodEnabled ?? 0, creditPeriodDays ?? 30, creditPeriodBasis ?? 'BILL_BASED', restrictOnCreditExpiry ?? 0,
            now, now
          );
        } catch (insertPartyErr: any) {
          const fallbackParty: any = db.prepare(`
            SELECT party_id FROM parties 
            WHERE tenant_id = ? AND (
              party_id = ? 
              OR (LOWER(TRIM(name)) = LOWER(TRIM(?)) AND (phone = ? OR (phone IS NULL AND ? IS NULL)))
              OR (? != '' AND phone IS NOT NULL AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '') LIKE ?)
              OR (LOWER(TRIM(name)) = LOWER(TRIM(?)))
            )
            ORDER BY 
              CASE WHEN is_deleted = 0 THEN 0 ELSE 1 END,
              created_at ASC
            LIMIT 1
          `).get(tenantId, finalPartyId, displayName, phone, phone, phoneClean.length >= 7 ? `%${phoneClean.slice(-10)}` : '', phoneClean.length >= 7 ? `%${phoneClean.slice(-10)}` : '', name);

          if (fallbackParty) {
            finalPartyId = fallbackParty.party_id;
            try {
              db.prepare('UPDATE parties SET is_deleted = 0, updated_at = CURRENT_TIMESTAMP WHERE party_id = ?').run(finalPartyId);
            } catch {}
          } else {
            console.warn('[CustomerIdentityService] Could not insert party and fallback lookup failed:', insertPartyErr.message);
            throw insertPartyErr;
          }
        }
      }

      return {
        customer_id: finalCustomerId!,
        party_id: finalPartyId!,
        isNew
      };
    } catch (err: any) {
      console.error('[CustomerIdentityService] Error:', err.message);
      return null;
    }
  }

  /**
   * Find existing customer by various criteria (read-only)
   */
  static findCustomer(
    db: Database.Database,
    tenantId: string,
    criteria: { name?: string; phone?: string; customer_id?: string }
  ): any | null {
    if (!db || !tenantId) return null;
    const { name, phone, customer_id } = criteria;

    if (customer_id) {
      return db.prepare('SELECT * FROM customers WHERE customer_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)')
        .get(customer_id, tenantId);
    }

    const phoneClean = (phone || '').replace(/\D/g, '');
    
    // 1. Phone match
    if (phoneClean.length >= 7) {
      const last10 = phoneClean.slice(-10);
      const found = db.prepare(`
        SELECT * FROM customers 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?
        LIMIT 1
      `).get(tenantId, `%${last10}`);
      if (found) return found;
    }

    // 2. Exact name + phone
    if (name && phone) {
      const found = db.prepare(`
        SELECT * FROM customers 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND name = ? AND phone = ?
        LIMIT 1
      `).get(tenantId, name.trim().replace(/\s+/g, ' '), phone.trim());
      if (found) return found;
    }

    // 3. Exact name
    if (name) {
      const found = db.prepare(`
        SELECT * FROM customers 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND LOWER(TRIM(name)) = LOWER(?)
        ORDER BY CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1
      `).get(tenantId, name.trim().replace(/\s+/g, ' '));
      if (found) return found;
    }

    return null;
  }

  /**
   * Find existing party by various criteria (read-only)
   */
  static findParty(
    db: Database.Database,
    tenantId: string,
    criteria: { name?: string; phone?: string; party_id?: string; party_type?: string }
  ): any | null {
    if (!db || !tenantId) return null;
    const { name, phone, party_id, party_type = 'CUSTOMER' } = criteria;

    if (party_id) {
      return db.prepare('SELECT * FROM parties WHERE party_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)')
        .get(party_id, tenantId);
    }

    const phoneClean = (phone || '').replace(/\D/g, '');
    
    // 1. Phone match
    if (phoneClean.length >= 7) {
      const last10 = phoneClean.slice(-10);
      const found = db.prepare(`
        SELECT * FROM parties 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND party_type = ? AND REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?
        LIMIT 1
      `).get(tenantId, party_type, `%${last10}`);
      if (found) return found;
    }

    // 2. Exact name + phone
    if (name && phone) {
      const found = db.prepare(`
        SELECT * FROM parties 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND party_type = ? AND name = ? AND phone = ?
        LIMIT 1
      `).get(tenantId, party_type, name.trim().replace(/\s+/g, ' '), phone.trim());
      if (found) return found;
    }

    // 3. Exact name
    if (name) {
      const found = db.prepare(`
        SELECT * FROM parties 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND party_type = ? AND LOWER(TRIM(name)) = LOWER(?)
        ORDER BY CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1
      `).get(tenantId, party_type, name.trim().replace(/\s+/g, ' '));
      if (found) return found;
    }

    return null;
  }
}

export function upsertCustomerRecord(
  db: Database.Database,
  tenantId: string,
  rawName?: string | null,
  rawPhone?: string | null,
  rawAddress?: string | null
): string | null {
  // Delegate to the new unified CustomerIdentityService for consistency
  const result = CustomerIdentityService.findOrCreateCustomerAndParty(db, tenantId, {
    name: rawName,
    phone: rawPhone,
    address: rawAddress
  });
  return result?.customer_id || null;
}

function recalcPartyBalanceLocal(d: Database.Database, partyId: string) {
  try {
    const rows: any = d.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN balance_type = 'GST' THEN credit_amount - debit_amount ELSE 0 END), 0) AS gst,
        COALESCE(SUM(CASE WHEN balance_type = 'ESTIMATE' THEN credit_amount - debit_amount ELSE 0 END), 0) AS estimate,
        COALESCE(SUM(credit_amount - debit_amount), 0) AS total
      FROM party_ledger WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
    `).get(partyId);
    const gst = Math.round((parseFloat(rows?.gst) || 0) * 100) / 100;
    const estimate = Math.round((parseFloat(rows?.estimate) || 0) * 100) / 100;
    const total = Math.round((gst + estimate) * 100) / 100;
    const latest: any = d.prepare(`
      SELECT transaction_date FROM party_ledger 
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) 
      ORDER BY transaction_date DESC LIMIT 1
    `).get(partyId);
    d.prepare(`
      UPDATE parties 
      SET balance = ?, gst_balance = ?, estimate_balance = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
      WHERE party_id = ?
    `).run(total, gst, estimate, latest ? latest.transaction_date : null, partyId);
    return total;
  } catch (err: any) {
    console.error('[recalcPartyBalanceLocal error]:', err.message);
    return 0;
  }
}

export function autoDeduplicateCustomersAndParties(targetDb?: Database.Database): { merged_customers: number; merged_parties: number } {
  const d = targetDb || db;
  if (!d) return { merged_customers: 0, merged_parties: 0 };

  let mergedCustomers = 0;
  let mergedParties = 0;

  try {
    // 1. DEDUPLICATE CUSTOMERS
    const custTenants = d.prepare('SELECT DISTINCT tenant_id FROM customers').all().map((r: any) => r.tenant_id);
    for (const tenantId of custTenants) {
      const custs = d.prepare(`
        SELECT customer_id, tenant_id, name, phone, address, total_points_earned, total_points_redeemed, current_points_balance, created_at
        FROM customers 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
      `).all(tenantId) as any[];

      const n = custs.length;
      if (n <= 1) continue;

      const parent = Array.from({ length: n }, (_, i) => i);
      function find(i: number): number {
        if (parent[i] === i) return i;
        parent[i] = find(parent[i]);
        return parent[i];
      }
      function union(i: number, j: number) {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) parent[rootI] = rootJ;
      }

      const phoneMap = new Map<string, number>();
      const nameMap = new Map<string, number>();

      for (let i = 0; i < n; i++) {
        const c = custs[i];
        const normName = (c.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const cleanPhone = (c.phone || '').replace(/\D/g, '');
        const last10 = cleanPhone.length >= 7 ? cleanPhone.slice(-10) : null;

        // Phone match alone does not merge; different people can share numbers
        // Only exact normalized names merge duplicates
        if (normName && normName.length >= 2 && last10 && !last10.startsWith('0000')) {
          const comboKey = normName + ":" + last10;
          if (phoneMap.has(comboKey)) union(i, phoneMap.get(comboKey)!);
          else phoneMap.set(comboKey, i);
        }

        if (normName && normName.length >= 2) {
          if (nameMap.has(normName)) {
            union(i, nameMap.get(normName)!);
          } else {
            nameMap.set(normName, i);
          }
        }
      }

      const clusters = new Map<number, any[]>();
      for (let i = 0; i < n; i++) {
        const root = find(i);
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root)!.push(custs[i]);
      }

      for (const [_, list] of clusters) {
        if (list.length <= 1) continue;

        // Sort: prefer record with a valid phone, then older created_at
        list.sort((a: any, b: any) => {
          const aClean = (a.phone || '').replace(/\D/g, '');
          const bClean = (b.phone || '').replace(/\D/g, '');
          const aHasValidPhone = aClean.length >= 7 && !aClean.startsWith('0000') ? 1 : 0;
          const bHasValidPhone = bClean.length >= 7 && !bClean.startsWith('0000') ? 1 : 0;
          if (aHasValidPhone !== bHasValidPhone) return bHasValidPhone - aHasValidPhone;
          const timeA = new Date(a.created_at || 0).getTime();
          const timeB = new Date(b.created_at || 0).getTime();
          return timeA - timeB;
        });

        const primary = list[0];
        const duplicates = list.slice(1);

        let totEarned = primary.total_points_earned || 0;
        let totRedeemed = primary.total_points_redeemed || 0;
        let bestAddr = primary.address;
        let bestPhone = primary.phone;
        mergedCustomers += duplicates.length;

        for (const dup of duplicates) {
          totEarned += dup.total_points_earned || 0;
          totRedeemed += dup.total_points_redeemed || 0;
          if (!bestAddr && dup.address) bestAddr = dup.address;
          if (!bestPhone && dup.phone) bestPhone = dup.phone;

          d.prepare('UPDATE invoices SET customer_id = ? WHERE customer_id = ?').run(primary.customer_id, dup.customer_id);
          d.prepare('UPDATE loyalty_transactions SET customer_id = ? WHERE customer_id = ?').run(primary.customer_id, dup.customer_id);
          d.prepare("UPDATE customers SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?").run(dup.customer_id);
        }

        const bal = totEarned - totRedeemed;
        d.prepare(`
          UPDATE customers 
          SET address = COALESCE(?, address),
              phone = COALESCE(?, phone),
              total_points_earned = ?,
              total_points_redeemed = ?,
              current_points_balance = ?,
              sync_status = 'PENDING',
              updated_at = CURRENT_TIMESTAMP
          WHERE customer_id = ?
        `).run(bestAddr, bestPhone, totEarned, totRedeemed, bal, primary.customer_id);
      }
    }

    // 2. DEDUPLICATE PARTIES (same party_type and phone/name)
    const partyTenants = d.prepare('SELECT DISTINCT tenant_id FROM parties').all().map((r: any) => r.tenant_id);
    for (const tenantId of partyTenants) {
      const parties = d.prepare(`
        SELECT party_id, tenant_id, name, phone, address, gstin, balance, gst_balance, estimate_balance, balance_type, party_type, credit_limit, notes, created_at
        FROM parties 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
      `).all(tenantId) as any[];

      const n = parties.length;
      if (n <= 1) continue;

      const parent = Array.from({ length: n }, (_, i) => i);
      function find(i: number): number {
        if (parent[i] === i) return i;
        parent[i] = find(parent[i]);
        return parent[i];
      }
      function union(i: number, j: number) {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) parent[rootI] = rootJ;
      }

      const phoneMap = new Map<string, number>();
      const nameMap = new Map<string, number>();

      for (let i = 0; i < n; i++) {
        const p = parties[i];
        const pType = (p.party_type || 'CUSTOMER').toUpperCase();
        const normName = (p.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const cleanPhone = (p.phone || '').replace(/\D/g, '');
        const last10 = cleanPhone.length >= 7 ? cleanPhone.slice(-10) : null;

        // Phone match alone does not merge; different people can share numbers
        // Only exact same party_type + normalized name merge duplicates
        if (normName && normName.length >= 3 && last10 && !last10.startsWith('0000')) {
          const comboKey = pType + ":" + normName + ":" + last10;
          if (phoneMap.has(comboKey)) union(i, phoneMap.get(comboKey)!);
          else phoneMap.set(comboKey, i);
        }
        // end combo phone key

        if (normName && normName.length >= 3) {
          const nameKey = `${pType}:${normName}`;
          if (nameMap.has(nameKey)) {
            union(i, nameMap.get(nameKey)!);
          } else {
            nameMap.set(nameKey, i);
          }
        }
      }

      const clusters = new Map<number, any[]>();
      for (let i = 0; i < n; i++) {
        const root = find(i);
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root)!.push(parties[i]);
      }

      for (const [_, list] of clusters) {
        if (list.length <= 1) continue;

        // Prefer party with non-zero balance / ledger entries, then older created_at
        list.sort((a: any, b: any) => {
          const balA = Math.abs(a.balance || 0);
          const balB = Math.abs(b.balance || 0);
          if (balA !== balB) return balB - balA;
          const timeA = new Date(a.created_at || 0).getTime();
          const timeB = new Date(b.created_at || 0).getTime();
          return timeA - timeB;
        });

        const primary = list[0];
        const duplicates = list.slice(1);

        let bestPhone = primary.phone;
        let bestAddr = primary.address;
        let bestGstin = primary.gstin;
        mergedParties += duplicates.length;

        for (const dup of duplicates) {
          if (!bestPhone && dup.phone) bestPhone = dup.phone;
          if (!bestAddr && dup.address) bestAddr = dup.address;
          if (!bestGstin && dup.gstin) bestGstin = dup.gstin;

          d.prepare("UPDATE party_ledger SET party_id = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?").run(primary.party_id, dup.party_id);
          try {
            d.prepare('UPDATE purchase_bills SET supplier_id = ? WHERE supplier_id = ?').run(primary.party_id, dup.party_id);
          } catch {}
          d.prepare("UPDATE parties SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?").run(dup.party_id);
        }

        d.prepare(`
          UPDATE parties 
          SET phone = COALESCE(?, phone),
              address = COALESCE(?, address),
              gstin = COALESCE(?, gstin),
              sync_status = 'PENDING',
              updated_at = CURRENT_TIMESTAMP
          WHERE party_id = ?
        `).run(bestPhone, bestAddr, bestGstin, primary.party_id);

        recalcPartyBalanceLocal(d, primary.party_id);
      }
    }
    console.log('[DB Auto-Deduplication] Completed clean deduplication of customers and parties.');

    // Create partial unique indexes after deduplication to prevent future duplicates
    try {
      d.exec(`DROP INDEX IF EXISTS idx_customers_tenant_name_no_phone;`);
      d.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_name_no_phone 
        ON customers(tenant_id, name) 
        WHERE (phone IS NULL OR phone = '') AND (is_deleted IS NULL OR is_deleted = 0);
      `);
      d.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_parties_tenant_name_phone_customer 
        ON parties(tenant_id, name, phone) 
        WHERE party_type = 'CUSTOMER' AND (is_deleted IS NULL OR is_deleted = 0);
      `);
      console.log('[DB Auto-Deduplication] Partial unique indexes created/verified.');
    } catch (idxErr: any) {
      console.warn('[DB Auto-Deduplication] Could not create partial unique indexes:', idxErr.message);
    }

    return { merged_customers: mergedCustomers, merged_parties: mergedParties };
  } catch (err: any) {
    console.error('[DB Auto-Deduplication Error]:', err.message);
    return { merged_customers: 0, merged_parties: 0 };
  }
}

export function backfillCustomersFromInvoices(db: Database.Database) {
  try {
    console.log('[DB Migration] Running customer backfill from past transactions...');

    // Clean up legacy empty strings in phone and address to NULL so UNIQUE(tenant_id, phone) constraint is respected
    db.exec(`UPDATE customers SET phone = NULL WHERE phone IS NOT NULL AND TRIM(phone) = ''`);
    db.exec(`UPDATE customers SET address = NULL WHERE address IS NOT NULL AND TRIM(address) = ''`);

    const invoiceCustomers = db.prepare(`
      SELECT tenant_id, customer_name, customer_phone, customer_address
      FROM invoices
      WHERE (customer_name IS NOT NULL AND TRIM(customer_name) != '')
         OR (customer_phone IS NOT NULL AND TRIM(customer_phone) != '')
      GROUP BY tenant_id, COALESCE(NULLIF(TRIM(customer_phone), ''), TRIM(customer_name))
    `).all() as any[];

    for (const c of invoiceCustomers) {
      upsertCustomerRecord(db, c.tenant_id || 'global', c.customer_name, c.customer_phone, c.customer_address);
    }

    db.exec(`
      UPDATE invoices
      SET customer_id = (
        SELECT customer_id FROM customers c
        WHERE c.tenant_id = invoices.tenant_id
          AND (c.is_deleted IS NULL OR c.is_deleted = 0)
          AND (
            (invoices.customer_phone IS NOT NULL AND TRIM(invoices.customer_phone) != '' AND c.phone IS NOT NULL AND c.phone != '' AND
             REPLACE(REPLACE(REPLACE(c.phone, ' ', ''), '-', ''), '+', '') LIKE '%' || SUBSTR(REPLACE(REPLACE(REPLACE(invoices.customer_phone, ' ', ''), '-', ''), '+', ''), -10))
            OR (LOWER(REPLACE(TRIM(c.name), '  ', ' ')) = LOWER(REPLACE(TRIM(invoices.customer_name), '  ', ' ')))
          )
        LIMIT 1
      )
      WHERE customer_id IS NULL
        AND (
          (customer_name IS NOT NULL AND TRIM(customer_name) != '')
          OR (customer_phone IS NOT NULL AND TRIM(customer_phone) != '')
        );
    `);

    const scrapCustomers = db.prepare(`
      SELECT tenant_id, party_name as customer_name, customer_phone, customer_address
      FROM scrap_transactions
      WHERE (party_name IS NOT NULL AND TRIM(party_name) != '')
         OR (customer_phone IS NOT NULL AND TRIM(customer_phone) != '')
      GROUP BY tenant_id, COALESCE(NULLIF(TRIM(customer_phone), ''), TRIM(party_name))
    `).all() as any[];

    for (const c of scrapCustomers) {
      upsertCustomerRecord(db, c.tenant_id || 'global', c.customer_name, c.customer_phone, c.customer_address);
    }

    const returnCustomers = db.prepare(`
      SELECT tenant_id, customer_name, customer_phone
      FROM returns
      WHERE (customer_name IS NOT NULL AND TRIM(customer_name) != '')
         OR (customer_phone IS NOT NULL AND TRIM(customer_phone) != '')
      GROUP BY tenant_id, COALESCE(NULLIF(TRIM(customer_phone), ''), TRIM(customer_name))
    `).all() as any[];

    for (const c of returnCustomers) {
      upsertCustomerRecord(db, c.tenant_id || 'global', c.customer_name, c.customer_phone, null);
    }

    console.log('[DB Migration] Customer backfill complete.');
  } catch (err: any) {
    console.error('[DB Migration] Failed customer backfill:', err.message);
  }
}
