import Database from 'better-sqlite3';
import crypto from 'node:crypto';
type IdentityRow = Record<string, unknown> & { customer_id: string; party_id: string; phone: string; name: string; last_purchase_date: string | null };
import { toEpochMs } from '../utils/timestamps.js';

/** Customer/party identity: resolution and upsert. De-duplication and the startup backfill live in customerDedupe.ts. */

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
    },
    /**
     * `history`: called by the startup backfill from past documents, not for a purchase happening now. An existing
     * customer row is written only when a field changes and its `last_purchase_date` is left alone; a new customer gets
     * `purchaseAt` (its latest invoice time) instead of now.
     */
    opts?: { history?: boolean; purchaseAt?: string | null }
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
    const history = !!opts?.history;
    const purchaseMs = toEpochMs(opts?.purchaseAt);
    const purchaseIso = purchaseMs === null ? null : new Date(purchaseMs).toISOString();

    try {
      // ========== LOOKUP PHASE ==========
      // Look up existingCustomer and existingParty INDEPENDENTLY
      // Priority: 1) customer_id  2) Exact name + phone  3) Phone match (last 10 digits)  4) Case-insensitive name
      
      let existingCustomer: IdentityRow | null | undefined = null;
      let existingParty: IdentityRow | null | undefined = null;

      // 0. Try direct customer_id / party_id match first if provided
      if (rawData.customer_id) {
        const candidateCust = db.prepare<unknown[], IdentityRow>(`
          SELECT * FROM customers 
          WHERE tenant_id = ? AND customer_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          LIMIT 1
        `).get(tenantId, rawData.customer_id);

        const candidateParty = db.prepare<unknown[], IdentityRow>(`
          SELECT * FROM parties 
          WHERE tenant_id = ? AND party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          LIMIT 1
        `).get(tenantId, rawData.customer_id);

        const candPhone = String(candidateCust?.phone || candidateParty?.phone || '').replace(/\D/g, '');
        const candLast10 = candPhone.length >= 7 ? candPhone.slice(-10) : candPhone;
        const inputLast10 = phoneClean.length >= 7 ? phoneClean.slice(-10) : phoneClean;
        const phoneContradicts = Boolean(candLast10 && inputLast10 && candLast10 !== inputLast10);

        if (!phoneContradicts) {
          existingCustomer = candidateCust;
          existingParty = candidateParty;
        }
      }

      // 1. Try exact name + phone match
      if (name && phone) {
        if (!existingCustomer) {
          existingCustomer = db.prepare<unknown[], IdentityRow>(`
            SELECT * FROM customers 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND phone = ?
            LIMIT 1
          `).get(tenantId, name, phone);
        }

        if (!existingParty) {
          existingParty = db.prepare<unknown[], IdentityRow>(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (party_type LIKE '%CUSTOMER%' OR party_type IS NULL)
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
          existingCustomer = db.prepare<unknown[], IdentityRow>(`
            SELECT * FROM customers 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?
            LIMIT 1
          `).get(tenantId, `%${last10}`);
        }
        if (!existingParty) {
          existingParty = db.prepare<unknown[], IdentityRow>(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (party_type LIKE '%CUSTOMER%' OR party_type IS NULL)
              AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?
            ORDER BY created_at ASC
            LIMIT 1
          `).get(tenantId, `%${last10}`);
        }
      }

      // 3. Try case-insensitive name match
      if (name) {
        if (!existingCustomer) {
          const custQuery = phoneClean.length >= 7
            ? `SELECT * FROM customers 
               WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
                 AND LOWER(TRIM(name)) = LOWER(TRIM(?))
                 AND (phone IS NULL OR TRIM(phone) = '')
               ORDER BY created_at ASC LIMIT 1`
            : `SELECT * FROM customers 
               WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
                 AND LOWER(TRIM(name)) = LOWER(TRIM(?))
               ORDER BY CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END, created_at ASC LIMIT 1`;
          existingCustomer = db.prepare<unknown[], IdentityRow>(custQuery).get(tenantId, name);
        }
        if (!existingParty) {
          const partyQuery = phoneClean.length >= 7
            ? `SELECT * FROM parties 
               WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
                 AND (party_type LIKE '%CUSTOMER%' OR party_type IS NULL)
                 AND LOWER(TRIM(name)) = LOWER(TRIM(?))
                 AND (phone IS NULL OR TRIM(phone) = '')
               ORDER BY created_at ASC LIMIT 1`
            : `SELECT * FROM parties 
               WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
                 AND (party_type LIKE '%CUSTOMER%' OR party_type IS NULL)
                 AND LOWER(TRIM(name)) = LOWER(TRIM(?))
               ORDER BY CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END, created_at ASC LIMIT 1`;
          existingParty = db.prepare<unknown[], IdentityRow>(partyQuery).get(tenantId, name);
        }
      }

      // 4. Cross-check: If customer found but party not found, search party by customer's phone or name
      if (existingCustomer && !existingParty) {
        const cPhone = ((existingCustomer.phone as string) || ('' as string)).trim();
        const cClean = cPhone.replace(/\D/g, '');
        const cName = ((existingCustomer.name as string) || ('' as string)).trim();
        if (cClean.length >= 7) {
          existingParty = db.prepare<unknown[], IdentityRow>(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (party_type LIKE '%CUSTOMER%' OR party_type IS NULL)
              AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?
            ORDER BY created_at ASC
            LIMIT 1
          `).get(tenantId, `%${cClean.slice(-10)}`);
        }
        if (!existingParty && cName) {
          existingParty = db.prepare<unknown[], IdentityRow>(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (party_type LIKE '%CUSTOMER%' OR party_type IS NULL)
              AND LOWER(TRIM(name)) = LOWER(TRIM(?))
              -- A typed phone that differs from the party's means another person with the same name.
              AND (? = 0 OR phone IS NULL OR TRIM(phone) = '')
            ORDER BY created_at ASC
            LIMIT 1
          `).get(tenantId, cName, phoneClean.length >= 7 ? 1 : 0);
        }
      }

      // 5. Fallback check for parties matching idx_parties_tenant_name_phone_customer
      if (!existingParty && displayName) {
        existingParty = db.prepare<unknown[], IdentityRow>(`
          SELECT * FROM parties 
          WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
            AND (party_type LIKE '%CUSTOMER%' OR party_type IS NULL)
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
          const custHasRealName = existingCustomer.name && !['customer', 'walk-in', 'walk in', 'default'].includes((existingCustomer.name as string).trim().toLowerCase());
          const finalCustName = custHasRealName ? existingCustomer.name : (displayName || existingCustomer.name);
          const finalCustPhone = (existingCustomer.phone && (existingCustomer.phone as string).trim() !== '') ? existingCustomer.phone : (phone || null);
          const finalCustAddress = (existingCustomer.address && (existingCustomer.address as string).trim() !== '') ? existingCustomer.address : (address || null);
          const finalCustGstin = (existingCustomer.gstin && (existingCustomer.gstin as string).trim() !== '') ? existingCustomer.gstin : (gstin || null);
          const finalCustNotes = (existingCustomer.notes && (existingCustomer.notes as string).trim() !== '') ? existingCustomer.notes : (notes || null);

          let lastPurchase: string | null = now;
          let unchanged = false;
          if (history) {
            // History never moves last_purchase_date here: backfillCustomersFromInvoices sets it once from the latest
            // linked invoice, after all customers are resolved.
            lastPurchase = existingCustomer.last_purchase_date ?? null;
            unchanged = finalCustName === existingCustomer.name && finalCustPhone === existingCustomer.phone
              && finalCustAddress === existingCustomer.address && finalCustGstin === existingCustomer.gstin
              && finalCustNotes === existingCustomer.notes;
          }
          if (!unchanged) {
            db.prepare<unknown[], IdentityRow>(`
              UPDATE customers
              SET name = ?, phone = ?, address = ?,
                  gstin = ?, notes = ?,
                  is_deleted = 0,
                  last_purchase_date = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE customer_id = ?
            `).run(
              finalCustName, finalCustPhone, finalCustAddress, finalCustGstin, finalCustNotes,
              lastPurchase, existingCustomer.customer_id
            );
          }
        } catch (_) {
          if (!history) {
            try {
              db.prepare<unknown[], IdentityRow>(`
                UPDATE customers
                SET last_purchase_date = ?, is_deleted = 0, updated_at = CURRENT_TIMESTAMP
                WHERE customer_id = ?
              `).run(now, existingCustomer.customer_id);
            } catch { /* ignore */ }
          }
        }
      } else {
        const customerSeedKey = phoneClean.length >= 7
          ? `cust:${tenantId}:${phoneClean.slice(-10)}`
          : `cust:${tenantId}:${name.toLowerCase()}:${Date.now()}`;
        finalCustomerId = deterministicUUID(customerSeedKey);

        try {
          db.prepare<unknown[], IdentityRow>(`
            INSERT INTO customers (
              customer_id, tenant_id, name, phone, address, gstin, notes, pricing_tier_id,
              credit_limit, credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry,
              total_points_earned, total_points_redeemed, current_points_balance, last_purchase_date,
              is_deleted, sync_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 0, 'PENDING', ?, ?)
          `).run(
            finalCustomerId, tenantId, displayName, phone, address, gstin, notes, pricingTierId,
            creditLimit ?? 0, creditPeriodEnabled ?? 0, creditPeriodDays ?? 30, creditPeriodBasis ?? 'BILL_BASED', restrictOnCreditExpiry ?? 0,
            history ? purchaseIso : now, now, now
          );
        } catch {
          const fallbackCust: IdentityRow = (db.prepare<unknown[], IdentityRow>(`
            SELECT customer_id FROM customers 
            WHERE tenant_id = ? AND (
              customer_id = ? 
              OR (phone IS NOT NULL AND phone = ?)
              OR (? != '' AND phone IS NOT NULL AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?)
              OR (name IS NOT NULL AND LOWER(TRIM(name)) = LOWER(TRIM(?)))
            ) LIMIT 1
          `).get(tenantId, finalCustomerId, phone, phoneClean.length >= 7 ? `%${phoneClean.slice(-10)}` : '', phoneClean.length >= 7 ? `%${phoneClean.slice(-10)}` : '', name) as IdentityRow);
          if (fallbackCust) {
            finalCustomerId = fallbackCust.customer_id;
            try {
              db.prepare<unknown[], IdentityRow>('UPDATE customers SET is_deleted = 0, updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?').run(finalCustomerId);
            } catch { /* ignore */ }
          }
        }
      }

      // ========== PROCESS PARTY ==========
      if (existingParty) {
        try {
          const partyHasRealName = existingParty.name && !['customer', 'walk-in', 'walk in', 'default'].includes((existingParty.name as string).trim().toLowerCase());
          const finalPartyName = partyHasRealName ? existingParty.name : (displayName || existingParty.name);
          const finalPartyPhone = (existingParty.phone && (existingParty.phone as string).trim() !== '') ? existingParty.phone : (phone || null);
          const finalPartyAddress = (existingParty.address && (existingParty.address as string).trim() !== '') ? existingParty.address : (address || null);
          const finalPartyGstin = (existingParty.gstin && (existingParty.gstin as string).trim() !== '') ? existingParty.gstin : (gstin || null);
          const finalPartyNotes = (existingParty.notes && (existingParty.notes as string).trim() !== '') ? existingParty.notes : (notes || null);

          const wasDeleted = existingParty.is_deleted === 1;
          const phoneChanged = !existingParty.phone && finalPartyPhone;
          const addrChanged = !existingParty.address && finalPartyAddress;
          const gstinChanged = !existingParty.gstin && finalPartyGstin;
          const nameChanged = !partyHasRealName && finalPartyName !== existingParty.name;

          if (wasDeleted || phoneChanged || addrChanged || gstinChanged || nameChanged) {
            db.prepare<unknown[], IdentityRow>(`
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
            db.prepare<unknown[], IdentityRow>('UPDATE parties SET is_deleted = 0 WHERE party_id = ?').run(existingParty.party_id);
          } catch { /* ignore */ }
        }
      } else {
        const partySeedKey = phoneClean.length >= 7
          ? `party:${tenantId}:${phoneClean.slice(-10)}`
          : `party:${tenantId}:${name.toLowerCase()}:${Date.now()}`;
        finalPartyId = deterministicUUID(partySeedKey);

        try {
          db.prepare<unknown[], IdentityRow>(`
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
        } catch (insertPartyErr) {
          const fallbackParty: IdentityRow = (db.prepare<unknown[], IdentityRow>(`
            SELECT party_id FROM parties 
            WHERE tenant_id = ? AND (
              party_id = ? 
              OR (LOWER(TRIM(name)) = LOWER(TRIM(?)) AND (phone = ? OR (phone IS NULL AND ? IS NULL)))
              OR (? != '' AND phone IS NOT NULL AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?)
              OR (LOWER(TRIM(name)) = LOWER(TRIM(?)))
            )
            ORDER BY 
              CASE WHEN is_deleted = 0 THEN 0 ELSE 1 END,
              created_at ASC
            LIMIT 1
          `).get(tenantId, finalPartyId, displayName, phone, phone, phoneClean.length >= 7 ? `%${phoneClean.slice(-10)}` : '', phoneClean.length >= 7 ? `%${phoneClean.slice(-10)}` : '', name) as IdentityRow);

          if (fallbackParty) {
            finalPartyId = fallbackParty.party_id;
            try {
              db.prepare<unknown[], IdentityRow>('UPDATE parties SET is_deleted = 0, updated_at = CURRENT_TIMESTAMP WHERE party_id = ?').run(finalPartyId);
            } catch { /* ignore */ }
          } else {
            console.warn('[CustomerIdentityService] Could not insert party and fallback lookup failed:', (insertPartyErr as Error).message);
            throw insertPartyErr;
          }
        }
      }

      return {
        customer_id: finalCustomerId!,
        party_id: finalPartyId!,
        isNew
      };
    } catch (err) {
      console.error('[CustomerIdentityService] Error:', (err as Error).message);
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
  ): IdentityRow | null | undefined {
    if (!db || !tenantId) return null;
    const { name, phone, customer_id } = criteria;

    if (customer_id) {
      return db.prepare<unknown[], IdentityRow>('SELECT * FROM customers WHERE customer_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)')
        .get(customer_id, tenantId);
    }

    const phoneClean = (phone || '').replace(/\D/g, '');
    
    // 1. Phone match
    if (phoneClean.length >= 7) {
      const last10 = phoneClean.slice(-10);
      const found = db.prepare<unknown[], IdentityRow>(`
        SELECT * FROM customers 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?
        LIMIT 1
      `).get(tenantId, `%${last10}`);
      if (found) return found;
    }

    // 2. Exact name + phone
    if (name && phone) {
      const found = db.prepare<unknown[], IdentityRow>(`
        SELECT * FROM customers 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND name = ? AND phone = ?
        LIMIT 1
      `).get(tenantId, name.trim().replace(/\s+/g, ' '), phone.trim());
      if (found) return found;
    }

    // 3. Exact name
    if (name) {
      const found = db.prepare<unknown[], IdentityRow>(`
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
  ): IdentityRow | null | undefined {
    if (!db || !tenantId) return null;
    const { name, phone, party_id, party_type = 'CUSTOMER' } = criteria;

    if (party_id) {
      return db.prepare<unknown[], IdentityRow>('SELECT * FROM parties WHERE party_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)')
        .get(party_id, tenantId);
    }

    const phoneClean = (phone || '').replace(/\D/g, '');
    
    // 1. Phone match
    if (phoneClean.length >= 7) {
      const last10 = phoneClean.slice(-10);
      const found = db.prepare<unknown[], IdentityRow>(`
        SELECT * FROM parties 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND party_type = ? AND REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?
        LIMIT 1
      `).get(tenantId, party_type, `%${last10}`);
      if (found) return found;
    }

    // 2. Exact name + phone
    if (name && phone) {
      const found = db.prepare<unknown[], IdentityRow>(`
        SELECT * FROM parties 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND party_type = ? AND name = ? AND phone = ?
        LIMIT 1
      `).get(tenantId, party_type, name.trim().replace(/\s+/g, ' '), phone.trim());
      if (found) return found;
    }

    // 3. Exact name
    if (name) {
      const found = db.prepare<unknown[], IdentityRow>(`
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
  rawAddress?: string | null,
  opts?: { history?: boolean; purchaseAt?: string | null; customer_id?: string | null; gstin?: string | null }
): string | null {
  // Delegate to the new unified CustomerIdentityService for consistency
  const result = CustomerIdentityService.findOrCreateCustomerAndParty(db, tenantId, {
    customer_id: opts?.customer_id,
    name: rawName,
    phone: rawPhone,
    address: rawAddress,
    gstin: opts?.gstin,
  }, opts);
  return result?.customer_id || null;
}
