import Database from 'better-sqlite3';
import { db } from './localDb.js';
import { upsertCustomerRecord } from './customerIdentity.js';

/** Customer / party data repair used by initDb, main and services: merge duplicate customers and parties (recomputing
 * party balances) and backfill customers from historical invoices. */
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
