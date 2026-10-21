const customerCreateCache = new Map<string, number>();
import { ipcMain } from 'electron';
import crypto from 'node:crypto';
import { getDb, CustomerIdentityService, autoDeduplicateCustomersAndParties, upsertCustomerRecord } from '../db/localDb.js';
import {
  recalcPartyBalances,
  reconcileAllPartyBalances,
  backfillCreditInvoices,
  computeCustomerCreditStatusSync,
  checkCustomerOverdueSync
} from '../services/partyLedgerService.js';
import {
  safeHandler,
  validateString,
  validateNumber,
  validateOptionalString,
  validateOptionalNumber,
  validateObject,
  validateArray,
  deterministicUUID,
  localDate,
  localTimestamp,
  parseCleanDate,
  getUtcRangeForStoreDateRange,
  getStoreTimezoneSetting
} from './common.js';

export function registerPartyCustomerHandlers(): void {
ipcMain.handle('db:getParties', (event, tenantId: string, includeDeleted = false) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    backfillCreditInvoices(db);
    reconcileAllPartyBalances(db, tenantId);
    const sql = includeDeleted
      ? `SELECT p.*, 
          COALESCE(
            (SELECT ROUND(SUM(pl.credit_amount) - SUM(pl.debit_amount), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.balance,
            0
          ) AS current_balance,
          COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'GST' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.gst_balance,
            p.balance,
            0
          ) AS current_gst_balance,
          COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'ESTIMATE' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.estimate_balance,
            0
          ) AS current_estimate_balance,
          (SELECT MAX(pl.transaction_date) FROM party_ledger pl WHERE pl.party_id = p.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)) AS last_transaction_date
        FROM parties p WHERE p.tenant_id = ? ORDER BY p.is_deleted ASC, p.name COLLATE NOCASE ASC`
      : `SELECT p.*, 
          COALESCE(
            (SELECT ROUND(SUM(pl.credit_amount) - SUM(pl.debit_amount), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.balance,
            0
          ) AS current_balance,
          COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'GST' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.gst_balance,
            p.balance,
            0
          ) AS current_gst_balance,
          COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'ESTIMATE' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.estimate_balance,
            0
          ) AS current_estimate_balance,
          (SELECT MAX(pl.transaction_date) FROM party_ledger pl WHERE pl.party_id = p.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)) AS last_transaction_date
        FROM parties p WHERE p.tenant_id = ? AND p.is_deleted = 0 ORDER BY p.name COLLATE NOCASE ASC`;
    const parties = db.prepare(sql).all(tenantId) as any[];
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
  } catch (error: any) {
    console.error('[db:getParties]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:addParty', safeHandler((event, p) => {
  try {
    const db = getDb();
    const phoneClean = (p.phone || '').replace(/\D/g, '');
    const nameClean = (p.name || '').trim().toLowerCase();

    // Duplicate check: Do NOT allow creation of another party with the exact same name
    const existingSameName = db.prepare('SELECT party_id, name FROM parties WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(p.tenant_id, nameClean);
    if (existingSameName) {
      return { success: false, error: `A party named "${p.name.trim()}" already exists!` };
    }

    const creditLimit = Math.max(0, Number(p.credit_limit) || 0);
    const creditPeriodEnabled = p.credit_period_enabled ? 1 : 0;
    const creditPeriodDays = Math.max(1, parseInt(p.credit_period_days, 10) || 30);
    const creditPeriodBasis = p.credit_period_basis || 'BILL_BASED';
    const restrictOnCreditExpiry = p.restrict_on_credit_expiry !== undefined ? (p.restrict_on_credit_expiry ? 1 : 0) : 1;
    const whatsappAlertsEnabled = p.whatsapp_alerts_enabled !== undefined ? (p.whatsapp_alerts_enabled ? 1 : 0) : 1;
    const bt = p.balance_type || 'RECEIVABLE';
    const initialBalance = bt === 'RECEIVABLE'
      ? Math.abs(p.balance || 0)
      : -Math.abs(p.balance || 0);
    const partyType = p.party_type || 'CUSTOMER';
    const customCategory = p.custom_category || null;

    db.prepare(`
      INSERT INTO parties (party_id, tenant_id, name, phone, address, gstin, balance, gst_balance, estimate_balance, balance_type, party_type, custom_category, notes, pricing_tier_id, credit_limit, credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry, whatsapp_alerts_enabled, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(p.party_id, p.tenant_id, p.name, p.phone || null, p.address || null, p.gstin || null, initialBalance, initialBalance, bt, partyType, customCategory, p.notes || null, p.pricing_tier_id || null, creditLimit, creditPeriodEnabled, creditPeriodDays, creditPeriodBasis, restrictOnCreditExpiry, whatsappAlertsEnabled);

    // Create opening balance ledger entry
    if (p.balance && parseFloat(p.balance) > 0) {
      const amount = Math.abs(parseFloat(p.balance));
      const ledgerId = deterministicUUID(`party_opening:${p.party_id}`);
      db.prepare(`
        INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, created_by, created_by_name, created_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, 'GST', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        ledgerId, p.party_id, p.tenant_id,
        `Opening Balance (${bt === 'RECEIVABLE' ? 'Receivable' : 'Payable'})`,
        bt === 'RECEIVABLE' ? amount : 0,
        bt === 'PAYABLE' ? amount : 0,
        initialBalance,
        p.created_by || null,
        p.created_by_name || null
      );
      db.prepare(`UPDATE parties SET last_transaction_date = CURRENT_TIMESTAMP WHERE party_id = ?`).run(p.party_id);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[db:addParty]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:bulkImportParties', safeHandler((event, parties: any[]) => {
  try {
    const db = getDb();
    const transaction = db.transaction((partyList) => {
      const selectPhoneStmt = db.prepare('SELECT party_id, phone, name FROM parties WHERE tenant_id = ? AND is_deleted = 0');
      const insertStmt = db.prepare(`
        INSERT INTO parties (
          party_id, tenant_id, name, phone, address, gstin, balance, gst_balance, estimate_balance,
          pricing_tier_id, credit_limit, party_type, custom_category, notes, balance_type,
          is_deleted, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 0, 'PENDING', ?, ?)
      `);
      const updateStmt = db.prepare(`
        UPDATE parties 
        SET name = ?, phone = COALESCE(?, phone), address = COALESCE(?, address), gstin = COALESCE(?, gstin),
            pricing_tier_id = COALESCE(?, pricing_tier_id), credit_limit = COALESCE(?, credit_limit),
            party_type = COALESCE(?, party_type), custom_category = COALESCE(?, custom_category), notes = COALESCE(?, notes),
            is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE party_id = ?
      `);
      const insertLedgerStmt = db.prepare(`
        INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, created_by, created_by_name, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GST', ?, ?, 'PENDING', ?, ?)
      `);

      const now = new Date();
      for (const p of partyList) {
        now.setMilliseconds(now.getMilliseconds() + 1);
        const timestamp = localTimestamp(now);

        const phoneClean = (p.phone || '').replace(/\D/g, '');
        const nameClean = (p.name || '').trim().toLowerCase();

        let existing: any = null;
        if (p.tenant_id) {
          const tenantParties = selectPhoneStmt.all(p.tenant_id) as any[];
          if (phoneClean.length >= 7) {
            existing = tenantParties.find((party: any) => {
              const pDigits = (party.phone || '').replace(/\D/g, '');
              return pDigits.length >= 7 && (pDigits === phoneClean || (phoneClean.length >= 10 && pDigits.slice(-10) === phoneClean.slice(-10)));
            });
          }
          if (!existing && nameClean) {
            existing = tenantParties.find((party: any) => (party.name || '').trim().toLowerCase() === nameClean);
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
            ? Math.abs(p.balance || 0)
            : -Math.abs(p.balance || 0);
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

          if (p.balance && parseFloat(p.balance) !== 0) {
            const amount = Math.abs(parseFloat(p.balance));
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
  } catch (error: any) {
    console.error('[db:bulkImportParties]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:updateParty', safeHandler((event, p) => {
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

    let updateSql = `UPDATE parties SET name = ?, phone = ?, address = ?, gstin = ?, notes = ?`;
    const params: any[] = [p.name, p.phone || null, p.address || null, p.gstin || null, p.notes || null];

    if (hasTier) {
      updateSql += `, pricing_tier_id = ?`;
      params.push(p.pricing_tier_id || null);
    }
    if (hasCreditLimit) {
      updateSql += `, credit_limit = ?`;
      params.push(creditLimit);
    }
    if (hasCreditPeriodEnabled) {
      updateSql += `, credit_period_enabled = ?`;
      params.push(p.credit_period_enabled ? 1 : 0);
    }
    if (hasCreditPeriodDays) {
      updateSql += `, credit_period_days = ?`;
      params.push(Math.max(1, parseInt(p.credit_period_days, 10) || 30));
    }
    if (hasCreditPeriodBasis) {
      updateSql += `, credit_period_basis = ?`;
      params.push(p.credit_period_basis || 'BILL_BASED');
    }
    if (hasRestrictOnCreditExpiry) {
      updateSql += `, restrict_on_credit_expiry = ?`;
      params.push(p.restrict_on_credit_expiry ? 1 : 0);
    }
    if (hasPartyType) {
      updateSql += `, party_type = ?`;
      params.push(p.party_type || 'CUSTOMER');
    }
    if (hasCustomCategory) {
      updateSql += `, custom_category = ?`;
      params.push(p.custom_category || null);
    }
    if (hasWhatsappAlertsEnabled) {
      updateSql += `, whatsapp_alerts_enabled = ?`;
      params.push(p.whatsapp_alerts_enabled ? 1 : 0);
    }

    // Fetch existing party details before update to ensure robust matching even if name or phone changed
    const oldPartyRow: any = db.prepare('SELECT tenant_id, phone, name FROM parties WHERE party_id = ?').get(p.party_id);
    const tenantId = p.tenant_id || oldPartyRow?.tenant_id;
    const oldPhone = (oldPartyRow?.phone || '').trim();
    const oldName = (oldPartyRow?.name || '').trim();
    const newPhone = (p.phone || '').trim();
    const newName = (p.name || '').trim();

    updateSql += `, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`;
    params.push(p.party_id);

    db.prepare(updateSql).run(...params);

    // Synchronize to matching customer in customers table if exists
    try {
      let cust: any = null;
      if (newPhone) {
        cust = db.prepare('SELECT customer_id FROM customers WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(tenantId, newPhone);
      }
      if (!cust && oldPhone) {
        cust = db.prepare('SELECT customer_id FROM customers WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(tenantId, oldPhone);
      }
      if (!cust && newName) {
        cust = db.prepare('SELECT customer_id FROM customers WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(tenantId, newName.toLowerCase());
      }
      if (!cust && oldName) {
        cust = db.prepare('SELECT customer_id FROM customers WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(tenantId, oldName.toLowerCase());
      }
      if (cust) {
        db.prepare(`
          UPDATE customers 
          SET name = ?,
              phone = ?,
              address = ?,
              gstin = ?,
              notes = ?,
              credit_limit = COALESCE(?, credit_limit),
              credit_period_enabled = COALESCE(?, credit_period_enabled),
              credit_period_days = COALESCE(?, credit_period_days),
              credit_period_basis = COALESCE(?, credit_period_basis),
              restrict_on_credit_expiry = COALESCE(?, restrict_on_credit_expiry),
              pricing_tier_id = COALESCE(?, pricing_tier_id),
              sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE customer_id = ? AND tenant_id = ?
        `).run(
          p.name,
          p.phone || null,
          p.address || null,
          p.gstin !== undefined ? (p.gstin ? p.gstin.trim().toUpperCase() : null) : null,
          p.notes !== undefined ? (p.notes ? p.notes.trim() : null) : null,
          hasCreditLimit ? creditLimit : null,
          hasCreditPeriodEnabled ? (p.credit_period_enabled ? 1 : 0) : null,
          hasCreditPeriodDays ? Math.max(1, parseInt(p.credit_period_days, 10) || 30) : null,
          hasCreditPeriodBasis ? (p.credit_period_basis || 'BILL_BASED') : null,
          hasRestrictOnCreditExpiry ? (p.restrict_on_credit_expiry ? 1 : 0) : null,
          hasTier ? (p.pricing_tier_id || null) : null,
          cust.customer_id, tenantId
        );
      }
    } catch (syncErr) {
      console.warn('[db:updateParty] Customer sync skipped:', syncErr);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[db:updateParty]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:deleteParty', (event, partyId: string) => {
  try {
    const db = getDb();
    db.prepare("UPDATE parties SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?").run(partyId);
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteParty]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:restoreParty', (event, partyId: string) => {
  try {
    const db = getDb();
    db.prepare("UPDATE parties SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?").run(partyId);
    recalcPartyBalances(db, partyId);
    return { success: true };
  } catch (error: any) {
    console.error('[db:restoreParty]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:adjustPartyBalance', (event, { party_id, amount }: { party_id: string; amount: number }) => {
  try {
    const db = getDb();
    db.prepare("UPDATE parties SET balance = balance + ?, gst_balance = gst_balance + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?").run(amount, amount, party_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:adjustPartyBalance]', error);
    return { success: false, error: 'Operation failed' };
  }
});


ipcMain.handle('db:mergeParties', safeHandler((event, payload: { tenant_id: string; primary_party_id: string; secondary_party_id: string }) => {
  try {
    const db = getDb();
    const { tenant_id, primary_party_id, secondary_party_id } = payload;
    if (!tenant_id || !primary_party_id || !secondary_party_id || primary_party_id === secondary_party_id) {
      return { success: false, error: 'Invalid parameters for party merge' };
    }

    const primaryParty = db.prepare('SELECT * FROM parties WHERE party_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(primary_party_id, tenant_id) as any;
    const secondaryParty = db.prepare('SELECT * FROM parties WHERE party_id = ? AND tenant_id = ?').get(secondary_party_id, tenant_id) as any;

    if (!primaryParty || !secondaryParty) {
      return { success: false, error: 'One or both parties not found' };
    }

    const tx = db.transaction(() => {
      // 1. Move all party_ledger entries from secondary to primary
      db.prepare(`
        UPDATE party_ledger 
        SET party_id = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
        WHERE party_id = ? AND tenant_id = ?
      `).run(primary_party_id, secondary_party_id, tenant_id);

      // 2. Update primary party phone, address, and gstin if secondary has them
      const secPhone = (secondaryParty.phone || '').trim();
      const secAddr = (secondaryParty.address || '').trim();
      const secGst = (secondaryParty.gstin || '').trim();
      db.prepare(`
        UPDATE parties 
        SET phone = CASE WHEN (phone IS NULL OR phone = '') AND ? <> '' THEN ? ELSE phone END,
            address = CASE WHEN (address IS NULL OR address = '') AND ? <> '' THEN ? ELSE address END,
            gstin = CASE WHEN (gstin IS NULL OR gstin = '') AND ? <> '' THEN ? ELSE gstin END,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        WHERE party_id = ? AND tenant_id = ?
      `).run(secPhone, secPhone, secAddr, secAddr, secGst, secGst, primary_party_id, tenant_id);

      // 3. Mark secondary party as deleted
      db.prepare(`
        UPDATE parties 
        SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
        WHERE party_id = ? AND tenant_id = ?
      `).run(secondary_party_id, tenant_id);

      // 4. Recalculate primary party balance (soft-deletes duplicate reference numbers & exact matches)
      recalcPartyBalances(db, primary_party_id);
      recalcPartyBalances(db, secondary_party_id);
    });

    tx();

    import('../sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Merge sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));

    return { success: true };
  } catch (error: any) {
    console.error('[db:mergeParties]', error);
    return { success: false, error: 'Failed to merge parties' };
  }
}));


ipcMain.handle('db:getPartyLedger', (event, partyId: string, includeDeleted = false) => {
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
    try { db.exec(`ALTER TABLE party_ledger ADD COLUMN is_deleted INTEGER DEFAULT 0`); } catch {}
    // Clean up any legacy orphan purchase bill ledger entries where the purchase bill was deleted
    try {
      const orphans = db.prepare(`
        SELECT pl.ledger_id FROM party_ledger pl
        WHERE pl.party_id = ?
          AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
          AND pl.reference_number IS NOT NULL
          AND pl.description LIKE 'Purchase bill %'
          AND NOT EXISTS (
            SELECT 1 FROM purchase_bills pb WHERE pb.bill_number = pl.reference_number
          )
      `).all(partyId) as any[];
      if (orphans.length > 0) {
        for (const orphan of orphans) {
          db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?").run(orphan.ledger_id);
        }
        recalcPartyBalances(db, partyId);
      }
    } catch {}

    // Clean up any ledger entries where the invoice was deleted (is_deleted = 1)
    try {
      const deletedInvoiceEntries = db.prepare(`
        SELECT pl.ledger_id FROM party_ledger pl
        WHERE pl.party_id = ?
          AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
          AND (
            EXISTS (
              SELECT 1 FROM invoices i 
              WHERE i.is_deleted = 1 
                AND (
                  i.invoice_number = pl.reference_number 
                  OR pl.reference_number = i.invoice_number || '-PAY'
                  OR pl.reference_number LIKE i.invoice_number || '-%'
                  OR pl.description LIKE '%' || i.invoice_number || '%'
                )
            )
          )
      `).all(partyId) as any[];

      if (deletedInvoiceEntries.length > 0) {
        console.log(`[db:getPartyLedger] Cleaning up ${deletedInvoiceEntries.length} entries for deleted invoices`);
        for (const entry of deletedInvoiceEntries) {
          db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?").run(entry.ledger_id);
        }
        recalcPartyBalances(db, partyId);
      }
    } catch (e) {
      console.error('[db:getPartyLedger] Error cleaning deleted invoice ledger entries:', e);
    }
    try { recalcPartyBalances(db, partyId); } catch (e) {}
    const sql = includeDeleted
      ? `SELECT * FROM party_ledger WHERE party_id = ? ORDER BY transaction_date ASC, created_at ASC`
      : `SELECT * FROM party_ledger WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY transaction_date ASC, created_at ASC`;
    return db.prepare(sql).all(partyId);
  } catch (error: any) {
    console.error('[db:getPartyLedger]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:restorePartyLedgerEntry', (event, { ledger_id, party_id }: { ledger_id: string; party_id: string }) => {
  try {
    const db = getDb();
    db.prepare("UPDATE party_ledger SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ? AND party_id = ?").run(ledger_id, party_id);
    const entries = db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY transaction_date ASC, created_at ASC
    `).all(party_id) as any[];

    let running = 0;
    for (const row of entries) {
      running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
      db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
    }
    recalcPartyBalances(db, party_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:restorePartyLedgerEntry]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:addPartyLedgerEntry', safeHandler((event, entry) => {
  try {
    const db = getDb();
    
    // Get current party balance
    const party = db.prepare('SELECT balance FROM parties WHERE party_id = ?').get(entry.party_id) as any;
    if (!party) return { success: false, error: 'Party not found' };

    const currentBalance = parseFloat(party.balance) || 0;
    const parsedAmount = Math.abs(parseFloat(entry.amount));
    const creditAmount = entry.transaction_type === 'CREDIT' ? parsedAmount : 0;
    const debitAmount = entry.transaction_type === 'DEBIT' ? parsedAmount : 0;
    const balanceType = entry.balance_type === 'ESTIMATE' ? 'ESTIMATE' : 'GST';
    const paymentMethod = entry.payment_method || null;
    const newBalance = currentBalance + creditAmount - debitAmount;

    db.prepare(`
      INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, payment_method, reference_number, created_by, created_by_name, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
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
  } catch (error: any) {
    console.error('[db:addPartyLedgerEntry]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:updatePartyLedgerEntry', (event, entry) => {
  try {
    const db = getDb();

    const existing = db.prepare('SELECT * FROM party_ledger WHERE ledger_id = ? AND party_id = ?').get(entry.ledger_id, entry.party_id) as any;
    if (!existing) return { success: false, error: 'Ledger entry not found' };

    const parsedAmount = entry.amount !== undefined ? Math.abs(parseFloat(entry.amount)) : (existing.credit_amount || existing.debit_amount || 0);
    const txType = entry.transaction_type || (existing.credit_amount > 0 ? 'CREDIT' : 'DEBIT');
    const creditAmount = txType === 'CREDIT' ? parsedAmount : 0;
    const debitAmount = txType === 'DEBIT' ? parsedAmount : 0;

    db.prepare(`
      UPDATE party_ledger SET 
        transaction_date = ?, description = ?, credit_amount = ?, debit_amount = ?,
        balance_type = ?, payment_method = ?,
        reference_number = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE ledger_id = ? AND party_id = ?
    `).run(
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
    const entries = db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY transaction_date ASC, created_at ASC
    `).all(entry.party_id) as any[];

    let running = 0;
    for (const row of entries) {
      running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
      db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
    }

    recalcPartyBalances(db, entry.party_id);

    return { success: true };
  } catch (error: any) {
    console.error('[db:updatePartyLedgerEntry]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:deletePartyLedgerEntry', (event, { ledger_id, party_id }: { ledger_id: string; party_id: string }) => {
  try {
    const db = getDb();
    
    db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ? AND party_id = ?").run(ledger_id, party_id);

    // Recalculate running balance
    const entries = db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY transaction_date ASC, created_at ASC
    `).all(party_id) as any[];

    let running = 0;
    for (const row of entries) {
      running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
      db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
    }

    recalcPartyBalances(db, party_id);

    import('../sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Sync after delete error:', e));
    }).catch(() => {});

    return { success: true };
  } catch (error: any) {
    console.error('[db:deletePartyLedgerEntry]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// ── Helper: Compute customer credit status & FIFO allocations ──

// â”€â”€ Customer / Loyalty Points IPC Handlers â”€â”€

ipcMain.handle('db:getCustomers', (event, { tenant_id, active, credit, pricing_tier_id, search, overdue }: { tenant_id: string; active?: boolean; credit?: boolean; pricing_tier_id?: string; search?: string; overdue?: boolean }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];

    // Single LEFT JOIN to best-matching party (CUSTOMER-type preferred, highest absolute balance)
    // resolves all 6 party fields in one pass instead of 6 correlated subqueries
    let query = `
      SELECT c.*,
             COALESCE(c.credit_limit,          p.credit_limit,          0)            AS credit_limit,
             COALESCE(c.credit_period_enabled, p.credit_period_enabled, 0)            AS credit_period_enabled,
             COALESCE(c.credit_period_days,    p.credit_period_days,    30)           AS credit_period_days,
             COALESCE(c.credit_period_basis,   p.credit_period_basis,   'BILL_BASED') AS credit_period_basis,
             COALESCE(c.restrict_on_credit_expiry, p.restrict_on_credit_expiry, 1)   AS restrict_on_credit_expiry,
             COALESCE(
               (SELECT ROUND(SUM(pl.credit_amount) - SUM(pl.debit_amount), 2)
                FROM party_ledger pl
                WHERE pl.party_id = p.party_id
                  AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
               p.balance,
               0
             )                                                                        AS party_balance,
             p.gstin                                                                  AS gstin,
             p.notes                                                                  AS notes,
             COALESCE(c.pricing_tier_id, p.pricing_tier_id)                          AS resolved_pricing_tier_id,
             pt.name                                                                  AS pricing_tier_name
      FROM customers c
      LEFT JOIN parties p ON p.tenant_id = c.tenant_id
        AND (p.is_deleted IS NULL OR p.is_deleted = 0)
        AND p.party_id = (
          SELECT p2.party_id FROM parties p2
          WHERE p2.tenant_id = c.tenant_id
            AND (p2.is_deleted IS NULL OR p2.is_deleted = 0)
            AND (
              (c.phone IS NOT NULL AND TRIM(c.phone) <> '' AND p2.phone IS NOT NULL AND TRIM(p2.phone) <> '' AND p2.phone = c.phone)
              OR (LOWER(TRIM(p2.name)) = LOWER(TRIM(c.name)))
            )
          ORDER BY CASE WHEN p2.party_type = 'CUSTOMER' THEN 0 ELSE 1 END,
                   ABS(COALESCE(p2.balance, 0)) DESC
          LIMIT 1
        )
      LEFT JOIN pricing_tiers pt ON pt.pricing_tier_id = COALESCE(c.pricing_tier_id, p.pricing_tier_id)
      WHERE c.tenant_id = ? AND (c.is_deleted IS NULL OR c.is_deleted = 0)
    `;
    const params: any[] = [tenant_id];

    if (search) {
      query += ` AND (c.name LIKE ? OR c.phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (active) {
      query += ` AND c.last_purchase_date IS NOT NULL AND c.last_purchase_date >= datetime('now', '-90 days')`;
    }

    if (credit === true) {
      query += ` AND p.balance > 0`;
    } else if (credit === false) {
      query += ` AND (p.balance <= 0 OR p.balance IS NULL)`;
    }

    if (pricing_tier_id) {
      query += ` AND COALESCE(c.pricing_tier_id, p.pricing_tier_id) = ?`;
      params.push(pricing_tier_id);
    }

    query += ` ORDER BY c.name COLLATE NOCASE ASC`;

    const rows = db.prepare(query).all(...params) as any[];

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
});

ipcMain.handle('db:checkCustomerCreditStatus', (event, { tenant_id, customer_id, customer_name, customer_phone }: { tenant_id: string; customer_id?: string; customer_name?: string; customer_phone?: string }) => {
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
});

ipcMain.handle('db:createCustomer', (event, c: any) => {
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
    const existingSameName = db.prepare('SELECT customer_id FROM customers WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(c.tenant_id, nameClean);
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

    db.prepare(`
      INSERT INTO customers (
        customer_id, tenant_id, name, phone, address, gstin, notes, pricing_tier_id,
        credit_limit, credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry,
        sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      customerId, c.tenant_id, c.name, c.phone || null, c.address || null, cleanGstin, cleanNotes, c.pricing_tier_id || null,
      creditLimit, creditPeriodEnabled, creditPeriodDays, creditPeriodBasis, restrictOnCreditExpiry
    );

    // Also sync to parties table as CUSTOMER party
    let matchedParty: any = null;
    const cleanPhone = (c.phone || '').trim();
    const cleanName = (c.name || '').trim();
    if (cleanPhone) {
      matchedParty = db.prepare('SELECT party_id FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(c.tenant_id, cleanPhone);
    }
    if (!matchedParty && cleanName) {
      matchedParty = db.prepare('SELECT party_id FROM parties WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(c.tenant_id, cleanName.toLowerCase());
    }

    if (matchedParty) {
      db.prepare(`
        UPDATE parties 
        SET name = ?, phone = COALESCE(?, phone), address = COALESCE(?, address),
            gstin = COALESCE(?, gstin), notes = COALESCE(?, notes),
            credit_limit = ?, credit_period_enabled = ?, credit_period_days = ?, credit_period_basis = ?, restrict_on_credit_expiry = ?,
            pricing_tier_id = COALESCE(?, pricing_tier_id),
            sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE party_id = ?
      `).run(
        c.name, c.phone || null, c.address || null,
        cleanGstin, cleanNotes,
        creditLimit, creditPeriodEnabled, creditPeriodDays, creditPeriodBasis, restrictOnCreditExpiry,
        c.pricing_tier_id || null, matchedParty.party_id
      );
    } else {
      const partyId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO parties (
          party_id, tenant_id, name, phone, address, gstin, notes, balance, gst_balance, estimate_balance,
          balance_type, party_type, pricing_tier_id, credit_limit,
          credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry,
          is_deleted, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'RECEIVABLE', 'CUSTOMER', ?, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
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
});

ipcMain.handle('db:deduplicateCustomers', (event, tenant_id?: string) => {
  try {
    const db = getDb();
    const result = autoDeduplicateCustomersAndParties(db);
    return { success: true, ...result };
  } catch (error: any) {
    console.error('[db:deduplicateCustomers]', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:findCustomers', (event, { tenant_id, name, phone }: { tenant_id: string; name?: string; phone?: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    let query = `SELECT * FROM customers WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)`;
    const params: any[] = [tenant_id];
    if (name && phone) {
      const cleanName = name.trim().replace(/\s+/g, ' ');
      query += ` AND (name LIKE ? OR phone LIKE ?)`;
      params.push(`%${cleanName}%`, `%${phone.trim()}%`);
    } else if (name) {
      const cleanName = name.trim().replace(/\s+/g, ' ');
      query += ` AND (name LIKE ? OR phone LIKE ?)`;
      params.push(`%${cleanName}%`, `%${cleanName}%`);
    } else if (phone) {
      query += ` AND phone LIKE ?`;
      params.push(`%${phone.trim()}%`);
    }
    query += ` ORDER BY name COLLATE NOCASE ASC LIMIT 25`;
    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:findCustomers]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:deleteCustomer', (event, { customer_id, tenant_id }: { customer_id: string; tenant_id: string }) => {
  try {
    const db = getDb();
    if (!customer_id || !tenant_id) return { success: false, error: 'Customer ID and Tenant ID are required' };

    return db.transaction(() => {
      // 1. Fetch customer details
      const customer = db.prepare(`SELECT * FROM customers WHERE customer_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)`).get(customer_id, tenant_id) as any;
      if (!customer) return { success: false, error: 'Customer not found' };

      // 2. Mark customer as deleted
      db.prepare(`UPDATE customers SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ? AND tenant_id = ?`).run(customer_id, tenant_id);

      // 3. Find matching party by phone or name
      let matchedParties: any[] = [];
      const cleanPhone = (customer.phone || '').trim();
      const cleanName = (customer.name || '').trim();

      if (cleanPhone) {
        matchedParties = db.prepare(`SELECT party_id, name FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)`).all(tenant_id, cleanPhone);
      }
      if (matchedParties.length === 0 && cleanName) {
        matchedParties = db.prepare(`SELECT party_id, name FROM parties WHERE tenant_id = ? AND name = ? COLLATE NOCASE AND (is_deleted IS NULL OR is_deleted = 0)`).all(tenant_id, cleanName);
      }

      // 4. Soft-delete matched parties and their party_ledger entries
      for (const party of matchedParties) {
        db.prepare(`UPDATE parties SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ? AND tenant_id = ?`).run(party.party_id, tenant_id);
        db.prepare(`UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ? AND tenant_id = ?`).run(party.party_id, tenant_id);
      }

      return { success: true, deleted_party_count: matchedParties.length };
    })();
  } catch (error: any) {
    console.error('[db:deleteCustomer]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateCustomer', (event, c: any) => {
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
    const oldCustomerRow: any = db.prepare('SELECT tenant_id, phone, name FROM customers WHERE customer_id = ? AND tenant_id = ?').get(c.customer_id, c.tenant_id);
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
      matchedParty = db.prepare('SELECT party_id FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(c.tenant_id, newPhone);
    }
    if (!matchedParty && oldPhone) {
      matchedParty = db.prepare('SELECT party_id FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(c.tenant_id, oldPhone);
    }
    if (!matchedParty && newName) {
      matchedParty = db.prepare('SELECT party_id FROM parties WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(c.tenant_id, newName.toLowerCase());
    }
    if (!matchedParty && oldName) {
      matchedParty = db.prepare('SELECT party_id FROM parties WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(c.tenant_id, oldName.toLowerCase());
    }

    if (matchedParty) {
      db.prepare(`
        UPDATE parties 
        SET name = ?, phone = ?, address = ?,
            gstin = ?, notes = ?,
            credit_limit = COALESCE(?, credit_limit),
            credit_period_enabled = COALESCE(?, credit_period_enabled),
            credit_period_days = COALESCE(?, credit_period_days),
            credit_period_basis = COALESCE(?, credit_period_basis),
            restrict_on_credit_expiry = COALESCE(?, restrict_on_credit_expiry),
            pricing_tier_id = COALESCE(?, pricing_tier_id),
            sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE party_id = ?
      `).run(
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
});

ipcMain.handle('db:getCustomerInvoices', (event, { customer_id, tenant_id, phone, name }: { customer_id: string; tenant_id: string; phone?: string; name?: string }) => {
  try {
    const db = getDb();
    if (!customer_id && !phone && !name) return [];
    const effectiveTenantId = tenant_id || 'global';

    // 1. Resolve customer record
    let cust: any = null;
    if (customer_id) {
      cust = db.prepare('SELECT * FROM customers WHERE customer_id = ? AND tenant_id = ?').get(customer_id, effectiveTenantId);
    }
    const cleanArgPhone = (phone || '').replace(/\D/g, '');
    if (!cust && cleanArgPhone.length >= 7) {
      cust = db.prepare(`SELECT * FROM customers WHERE tenant_id = ? AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?)`).get(effectiveTenantId, phone, `%${cleanArgPhone.slice(-10)}`);
    }
    if (!cust && name) {
      cust = db.prepare('SELECT * FROM customers WHERE tenant_id = ? AND (LOWER(TRIM(name)) = LOWER(?) OR LOWER(REPLACE(TRIM(name), "  ", " ")) = LOWER(REPLACE(TRIM(?), "  ", " ")))').get(effectiveTenantId, name.trim(), name.trim());
    }

    // 2. Resolve associated party
    const searchPhone = (cust?.phone || phone || '').trim();
    const searchName = (cust?.name || name || '').trim();
    const phoneClean = searchPhone.replace(/\D/g, '');
    const phoneLast10 = phoneClean.length >= 7 ? phoneClean.slice(-10) : '';

    let party: any = null;
    if (customer_id) {
      party = db.prepare('SELECT * FROM parties WHERE party_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(customer_id, effectiveTenantId);
    }
    if (!party && phoneLast10) {
      party = db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0) AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?) LIMIT 1`).get(effectiveTenantId, searchPhone, `%${phoneLast10}`);
    }
    if (!party && searchName) {
      party = db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0) AND (LOWER(TRIM(name)) = LOWER(?) OR LOWER(REPLACE(TRIM(name), "  ", " ")) = LOWER(REPLACE(TRIM(?), "  ", " "))) LIMIT 1`).get(effectiveTenantId, searchName, searchName);
    }

    // If customer wasn't found in customers table, but party was, try finding customer via party
    if (!cust && party) {
      const pClean = (party.phone || '').replace(/\D/g, '');
      if (pClean.length >= 7) {
        cust = db.prepare(`SELECT * FROM customers WHERE tenant_id = ? AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?)`).get(effectiveTenantId, party.phone, `%${pClean.slice(-10)}`);
      }
      if (!cust && party.name) {
        cust = db.prepare('SELECT * FROM customers WHERE tenant_id = ? AND (LOWER(TRIM(name)) = LOWER(?) OR LOWER(REPLACE(TRIM(name), "  ", " ")) = LOWER(REPLACE(TRIM(?), "  ", " ")))').get(effectiveTenantId, party.name.trim(), party.name.trim());
      }
    }

    const targetCustomerId = cust?.customer_id || customer_id;
    const targetPartyId = party?.party_id || '';
    const nameNorm = searchName ? searchName.toLowerCase().replace(/\s+/g, ' ') : '';

    // 3. Self-healing: link any unlinked invoices belonging to this customer
    if (targetCustomerId) {
      if (phoneLast10) {
        db.prepare(`
          UPDATE invoices
          SET customer_id = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE (customer_id IS NULL OR customer_id = '')
            AND tenant_id = ?
            AND customer_phone IS NOT NULL AND customer_phone != ''
            AND REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '-', ''), '+', '') LIKE ?
        `).run(targetCustomerId, effectiveTenantId, `%${phoneLast10}`);
      }
      if (nameNorm) {
        db.prepare(`
          UPDATE invoices
          SET customer_id = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE (customer_id IS NULL OR customer_id = '')
            AND tenant_id = ?
            AND customer_name IS NOT NULL
            AND LOWER(REPLACE(TRIM(customer_name), '  ', ' ')) = ?
            AND (customer_phone IS NULL OR customer_phone = '' OR (? != '' AND REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '-', ''), '+', '') LIKE ?))
        `).run(targetCustomerId, effectiveTenantId, nameNorm, phoneLast10, `%${phoneLast10}`);
      }
    }

    // 4. Query all matching invoices
    const rawInvoices = db.prepare(`
      SELECT *
      FROM invoices
      WHERE tenant_id = ?
        AND (
          (? != '' AND customer_id = ?)
          OR (? != '' AND customer_id = ?)
          OR (? != '' AND customer_phone IS NOT NULL AND customer_phone != '' AND REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '-', ''), '+', '') LIKE ?)
          OR (? != '' AND customer_name IS NOT NULL AND LOWER(REPLACE(TRIM(customer_name), '  ', ' ')) = ? AND (customer_phone IS NULL OR customer_phone = '' OR ? = ''))
        )
        AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (is_held IS NULL OR is_held = 0)
        AND (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY created_at DESC
    `).all(
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
});


ipcMain.handle('db:getCustomerLoyaltyTransactions', (event, { customer_id, tenant_id }: { customer_id: string; tenant_id: string }) => {
  try {
    const db = getDb();
    if (!customer_id) return [];
    const tid = tenant_id || 'global';
    return db.prepare(`
      SELECT lt.*, i.invoice_number
      FROM loyalty_transactions lt
      LEFT JOIN invoices i ON lt.invoice_id = i.invoice_id
      WHERE lt.customer_id = ? AND (lt.tenant_id = ? OR lt.tenant_id = 'global' OR ? = 'global')
      ORDER BY lt.created_at DESC
    `).all(customer_id, tid, tid);
  } catch (error: any) {
    console.error('[db:getCustomerLoyaltyTransactions]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:adjustCustomerLoyaltyPoints', safeHandler((event, payload: {
  customer_id: string;
  tenant_id: string;
  points: number;
  reason?: string;
  user_name?: string;
}) => {
  const db = getDb();
  const tid = payload.tenant_id || 'global';
  const cust: any = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(payload.customer_id);
  if (!cust) return { success: false, error: 'Customer not found' };

  const currentBal = Number(cust.current_points_balance) || 0;
  const delta = Number(payload.points) || 0;
  if (delta === 0) return { success: false, error: 'Points amount cannot be zero' };
  if (currentBal + delta < 0) return { success: false, error: 'Customer does not have enough points balance to deduct' };

  const newBal = currentBal + delta;
  const txId = crypto.randomUUID();
  const now = localTimestamp();

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO loyalty_transactions (
        transaction_id, tenant_id, customer_id, invoice_id,
        transaction_type, points, points_balance_before, points_balance_after,
        reference_number, description, created_by, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, 'ADJUSTED', ?, ?, ?, NULL, ?, ?, 'PENDING', ?, ?)
    `).run(
      txId, tid, payload.customer_id,
      Math.abs(delta), currentBal, newBal,
      payload.reason || (delta > 0 ? `Manual adjustment (+${delta} pts)` : `Manual adjustment (${delta} pts)`),
      payload.user_name || 'admin',
      now, now
    );

    db.prepare(`
      UPDATE customers SET
        total_points_earned = total_points_earned + ?,
        total_points_redeemed = total_points_redeemed + ?,
        current_points_balance = ?,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
      WHERE customer_id = ?
    `).run(
      delta > 0 ? delta : 0,
      delta < 0 ? Math.abs(delta) : 0,
      newBal,
      payload.customer_id
    );
  });

  transaction();
  return { success: true, new_balance: newBal, transaction_id: txId };
}));

ipcMain.handle('db:recalculateCustomerLoyaltyPoints', safeHandler((event, payload: { tenant_id: string }) => {
  const db = getDb();
  const tid = payload.tenant_id || 'global';
  const lCfgRow: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'loyalty_config'").get(tid)
    || db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = 'loyalty_config'").get();
  let lCfg: any = null;
  if (lCfgRow?.value) {
    try {
      lCfg = typeof lCfgRow.value === 'string' ? JSON.parse(lCfgRow.value) : lCfgRow.value;
    } catch {}
  }
  const earningRate = Math.max(1, Number(lCfg?.earningRate) || 100);
  const awardOnPending = Boolean(lCfg?.awardPointsOnPending);
  const paymentFilter = awardOnPending ? "AND (payment_method IS NULL OR UPPER(payment_method) NOT IN ('HOLD'))" : "AND (payment_method IS NULL OR UPPER(payment_method) NOT IN ('PENDING', 'HOLD'))";

  const custs: any[] = db.prepare(`SELECT customer_id, phone, name FROM customers WHERE (tenant_id = ? OR tenant_id = 'global' OR ? = 'global') AND (is_deleted IS NULL OR is_deleted = 0)`).all(tid, tid);
  let updatedCount = 0;

  const transaction = db.transaction(() => {
    for (const c of custs) {
      const invRow: any = db.prepare(`
        SELECT 
          COALESCE(SUM(points_earned), 0) as totEarned,
          COALESCE(SUM(points_redeemed), 0) as totRedeemed,
          MAX(created_at) as lastPurchase
        FROM invoices
        WHERE (customer_id = ? OR (customer_phone IS NOT NULL AND customer_phone = ? AND customer_phone != ''))
          AND (is_deleted IS NULL OR is_deleted = 0)
          ${paymentFilter}
      `).get(c.customer_id, c.phone || '');

      let earned = Number(invRow?.totEarned) || 0;
      const redeemed = Number(invRow?.totRedeemed) || 0;

      // If invoices did not have points_earned stored previously, compute from sales total
      if (earned === 0 && redeemed === 0) {
        const salesRow: any = db.prepare(`
          SELECT COALESCE(SUM(grand_total), 0) as totSales, MAX(created_at) as lastPurchase
          FROM invoices
          WHERE (customer_id = ? OR (customer_phone IS NOT NULL AND customer_phone = ? AND customer_phone != ''))
            AND (is_deleted IS NULL OR is_deleted = 0)
            ${paymentFilter}
        `).get(c.customer_id, c.phone || '');
        const totSales = Number(salesRow?.totSales) || 0;
        if (totSales > 0) {
          earned = Math.floor(totSales / earningRate);
        }
      }

      const bal = Math.max(0, earned - redeemed);
      db.prepare(`
        UPDATE customers SET
          total_points_earned = ?,
          total_points_redeemed = ?,
          current_points_balance = ?,
          last_purchase_date = COALESCE(?, last_purchase_date),
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
        WHERE customer_id = ?
      `).run(earned, redeemed, bal, invRow?.lastPurchase || null, c.customer_id);
      updatedCount++;
    }
  });

  transaction();
  return { success: true, updatedCount };
}));

// â”€â”€ Staff Management Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

}
