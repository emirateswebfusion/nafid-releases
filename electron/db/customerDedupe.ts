import Database from 'better-sqlite3';
import { db } from './localDb.js';
import { upsertCustomerRecord } from './customerIdentity.js';

/** Customer profile repair/backfill. Financial party IDs are never merged automatically. */
export function autoDeduplicateCustomersAndParties(targetDb?: Database.Database): { merged_customers: number; merged_parties: number; error?: string } {
  const d = targetDb || db;
  if (!d) return { merged_customers: 0, merged_parties: 0 };

  let mergedCustomers = 0;
  const mergedParties = 0;

  try {
    return d.transaction(() => {
    // 1. DEDUPLICATE CUSTOMERS
    const custTenants = d.prepare('SELECT DISTINCT tenant_id FROM customers').all().map((r: unknown) => (r as { tenant_id: string }).tenant_id);
    for (const tenantId of custTenants) {
      const custs = d.prepare(`
        SELECT customer_id, tenant_id, name, phone, address, total_points_earned, total_points_redeemed, current_points_balance, created_at
        FROM customers 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
      `).all(tenantId) as Record<string, unknown>[];

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
        const normName = (((c as { name: string }).name as string) || ('' as string)).trim().toLowerCase().replace(/\s+/g, ' ');
        const cleanPhone = ((c.phone as string) || ('' as string)).replace(/\D/g, '');
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

      const clusters = new Map<number, Record<string, unknown>[]>();
      for (let i = 0; i < n; i++) {
        const root = find(i);
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root)!.push(custs[i]);
      }

      for (const [_, list] of clusters) {
        if (list.length <= 1) continue;

        // Sort: prefer record with a valid phone, then older created_at
        list.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
          const aClean = ((a.phone as string) || ('' as string)).replace(/\D/g, '');
          const bClean = ((b.phone as string) || ('' as string)).replace(/\D/g, '');
          const aHasValidPhone = aClean.length >= 7 && !aClean.startsWith('0000') ? 1 : 0;
          const bHasValidPhone = bClean.length >= 7 && !bClean.startsWith('0000') ? 1 : 0;
          if (aHasValidPhone !== bHasValidPhone) return bHasValidPhone - aHasValidPhone;
          const timeA = new Date((a.created_at as string | number) || (0 as string | number)).getTime();
          const timeB = new Date((b.created_at as string | number) || (0 as string | number)).getTime();
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
          (totEarned as number) += (dup.total_points_earned as number) || (0 as number);
          (totRedeemed as number) += (dup.total_points_redeemed as number) || (0 as number);
          if (!bestAddr && dup.address) bestAddr = dup.address;
          if (!bestPhone && dup.phone) bestPhone = dup.phone;

          d.prepare('UPDATE invoices SET customer_id = ? WHERE customer_id = ?').run(primary.customer_id, dup.customer_id);
          d.prepare('UPDATE loyalty_transactions SET customer_id = ? WHERE customer_id = ?').run(primary.customer_id, dup.customer_id);
          d.prepare("UPDATE customers SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?").run(dup.customer_id);
        }

        const bal = (totEarned as number) - (totRedeemed as number);
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

    // Party IDs are financial identities. Account merging is an explicit user operation.
    console.log('[DB Auto-Deduplication] Completed clean deduplication of customers and parties.');

    // Create partial unique indexes after deduplication to prevent future duplicates
    try {
      d.exec(`DROP INDEX IF EXISTS idx_customers_tenant_name_no_phone;`);
      d.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_name_no_phone 
        ON customers(tenant_id, name) 
        WHERE (phone IS NULL OR phone = '') AND (is_deleted IS NULL OR is_deleted = 0);
      `);
      console.log('[DB Auto-Deduplication] Partial unique indexes created/verified.');
    } catch (idxErr) {
      console.warn('[DB Auto-Deduplication] Could not create partial unique indexes:', (idxErr as Error).message);
    }

    return { merged_customers: mergedCustomers, merged_parties: mergedParties };
    })();
  } catch (err) {
    console.error('[DB Auto-Deduplication Error]:', (err as Error).message);
    return { merged_customers: 0, merged_parties: 0, error: 'Duplicate cleanup failed; no accounts were changed' };
  }
}

export function backfillCustomersFromInvoices(db: Database.Database) {
  try {
    console.log('[DB Migration] Running customer backfill from past transactions...');

    // Clean up legacy empty strings in phone and address to NULL so UNIQUE(tenant_id, phone) constraint is respected
    db.exec(`UPDATE customers SET phone = NULL WHERE phone IS NOT NULL AND TRIM(phone) = ''`);
    db.exec(`UPDATE customers SET address = NULL WHERE address IS NOT NULL AND TRIM(address) = ''`);

    const invoiceCustomers = db.prepare(`
      SELECT tenant_id, customer_name, customer_phone, customer_address, MAX(created_at) AS last_purchase_at
      FROM invoices
      WHERE (customer_name IS NOT NULL AND TRIM(customer_name) != '')
         OR (customer_phone IS NOT NULL AND TRIM(customer_phone) != '')
      GROUP BY tenant_id, COALESCE(NULLIF(TRIM(customer_phone), ''), TRIM(customer_name))
    `).all() as Record<string, unknown>[];

    for (const c of invoiceCustomers) {
      upsertCustomerRecord(db, (c.tenant_id as string) || ('global' as string), (c.customer_name as string | null | undefined), (c.customer_phone as string | null | undefined), (c.customer_address as string | null | undefined), { history: true, purchaseAt: c.last_purchase_at as string | null | undefined });
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

    // last_purchase_date = the customer's latest linked invoice (written only where it differs, so a restart changes
    // nothing). Customers without linked invoices keep their value.
    db.exec(`
      UPDATE customers
      SET last_purchase_date = (
            SELECT strftime('%Y-%m-%dT%H:%M:%fZ', MAX(datetime(i.created_at))) FROM invoices i
            WHERE i.customer_id = customers.customer_id AND (i.is_deleted IS NULL OR i.is_deleted = 0)),
          updated_at = CURRENT_TIMESTAMP
      WHERE EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = customers.customer_id AND (i.is_deleted IS NULL OR i.is_deleted = 0))
        AND datetime(last_purchase_date) IS NOT (
            SELECT MAX(datetime(i.created_at)) FROM invoices i
            WHERE i.customer_id = customers.customer_id AND (i.is_deleted IS NULL OR i.is_deleted = 0))
    `);

    const scrapCustomers = db.prepare(`
      SELECT tenant_id, party_name as customer_name, customer_phone, customer_address
      FROM scrap_transactions
      WHERE (party_name IS NOT NULL AND TRIM(party_name) != '')
         OR (customer_phone IS NOT NULL AND TRIM(customer_phone) != '')
      GROUP BY tenant_id, COALESCE(NULLIF(TRIM(customer_phone), ''), TRIM(party_name))
    `).all() as Record<string, unknown>[];

    for (const c of scrapCustomers) {
      upsertCustomerRecord(db, (c.tenant_id as string) || ('global' as string), (c.customer_name as string | null | undefined), (c.customer_phone as string | null | undefined), (c.customer_address as string | null | undefined), { history: true });
    }

    const returnCustomers = db.prepare(`
      SELECT tenant_id, customer_name, customer_phone
      FROM returns
      WHERE (customer_name IS NOT NULL AND TRIM(customer_name) != '')
         OR (customer_phone IS NOT NULL AND TRIM(customer_phone) != '')
      GROUP BY tenant_id, COALESCE(NULLIF(TRIM(customer_phone), ''), TRIM(customer_name))
    `).all() as Record<string, unknown>[];

    for (const c of returnCustomers) {
      upsertCustomerRecord(db, (c.tenant_id as string) || ('global' as string), (c.customer_name as string | null | undefined), (c.customer_phone as string | null | undefined), null, { history: true });
    }

    console.log('[DB Migration] Customer backfill complete.');
  } catch (err) {
    console.error('[DB Migration] Failed customer backfill:', (err as Error).message);
  }
}
