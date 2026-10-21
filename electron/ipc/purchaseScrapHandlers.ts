import { ipcMain } from 'electron';
import crypto from 'node:crypto';
import { getDb, CustomerIdentityService, upsertCustomerRecord } from '../db/localDb.js';
import { recalcPartyBalances } from '../services/partyLedgerService.js';
import { getOrInitTerminalCode } from '../services/invoiceNumberService.js';
import { getOpenCashDrawer } from '../services/cashDrawerService.js';
import { buildProductSearchConditions } from './productHandlers.js';
import {
  safeHandler,
  validateString,
  validateNumber,
  validateOptionalString,
  validateOptionalNumber,
  validateObject,
  validateArray,
  resolveGstApplicability,
  deterministicUUID,
  localDate,
  localTimestamp,
  parseCleanDate,
  getUtcRangeForStoreDateRange,
  getStoreTimezoneSetting
} from './common.js';

export function registerPurchaseScrapHandlers(): void {
// â”€â”€ Scrap Categories IPC (categories ARE items, with price/stock/unit) â”€â”€
ipcMain.handle('db:getScrapCategories', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare('SELECT * FROM scrap_categories WHERE tenant_id = ? AND is_deleted = 0 ORDER BY name COLLATE NOCASE ASC').all(tenantId);
  } catch (error: any) {
    console.error('[db:getScrapCategories]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:addScrapCategory', (event, cat) => {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO scrap_categories (scrap_category_id, tenant_id, name, purchase_price, selling_price, current_stock, unit, is_deleted, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'PENDING')
    `).run(cat.scrap_category_id, cat.tenant_id, cat.name, cat.purchase_price || 0, cat.selling_price || 0, cat.current_stock || 0, cat.unit || 'Kgs');
    return { success: true };
  } catch (error: any) {
    console.error('[db:addScrapCategory]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateScrapCategory', (event, cat) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE scrap_categories SET name = ?, purchase_price = ?, selling_price = ?, current_stock = ?, unit = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE scrap_category_id = ?
    `).run(cat.name, cat.purchase_price || 0, cat.selling_price || 0, cat.current_stock || 0, cat.unit || 'Kgs', cat.scrap_category_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:updateScrapCategory]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:deleteScrapCategory', (event, scrapCategoryId: string) => {
  try {
    const db = getDb();
    db.prepare(`UPDATE scrap_categories SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`).run(scrapCategoryId);
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteScrapCategory]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:deduplicateScrapCategories', () => {
  try {
    const db = getDb();
    const dupes: any[] = db.prepare(`
      SELECT scrap_category_id, COUNT(*) as cnt, MIN(rowid) as keep_rowid
      FROM scrap_categories
      GROUP BY scrap_category_id
      HAVING COUNT(*) > 1
    `).all();
    let removed = 0;
    for (const d of dupes) {
      const result = db.prepare(`DELETE FROM scrap_categories WHERE scrap_category_id = ? AND rowid != ?`).run(d.scrap_category_id, d.keep_rowid);
      removed += result.changes;
    }
    return { removed };
  } catch (error: any) {
    console.error('[db:deduplicateScrapCategories]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:addScrapTransaction', safeHandler((event, t) => {
  try {
    const db = getDb();
    const qtyNum = Number(t.quantity) || 0;
    const delta = t.type === 'PURCHASE' ? qtyNum : -qtyNum;
    const paymentStatus = t.payment_status || 'CASH';
    const result = db.transaction(() => {
      if (t.party_name || t.customer_phone) {
        upsertCustomerRecord(db, t.tenant_id || 'global', t.party_name, t.customer_phone, t.customer_address);
      }
      db.prepare(`
        INSERT INTO scrap_transactions (transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, payment_status, sync_status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
      `).run(t.transaction_id, t.tenant_id, t.type, t.scrap_category_id, qtyNum, t.rate, t.total_amount, t.party_name || null, t.customer_phone || null, t.customer_address || null, t.notes || null, t.scrap_invoice_number || null, paymentStatus);
      db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`).run(delta, t.scrap_category_id);

      if (t.type === 'PURCHASE' && (paymentStatus === 'CASH' || paymentStatus === 'PAID') && Number(t.total_amount) > 0) {
        const todayDate = localDate();
        const drawer = getOpenCashDrawer(db, t.tenant_id || 'global', todayDate);
        if (drawer) {
          const txnId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, sync_status)
            VALUES (?, ?, ?, 'CASH_OUT', ?, 'SCRAP_PURCHASE', ?, 'system', 'PENDING')
          `).run(
            txnId,
            t.tenant_id || 'global',
            drawer.drawer_id,
            Number(t.total_amount),
            `Scrap purchase ${t.scrap_invoice_number || ''}`.trim()
          );
          const newCashOut = Number(drawer.cash_out) + Number(t.total_amount);
          const newCurrentCash = Number(drawer.current_cash) - Number(t.total_amount);
          const newExpectedClosing = Number(drawer.opening_balance) + Number(drawer.cash_sales) + Number(drawer.cash_in) - newCashOut;
          db.prepare(`
            UPDATE cash_drawer SET cash_out = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE drawer_id = ?
          `).run(newCashOut, newCurrentCash, newExpectedClosing, drawer.drawer_id);
        }
      } else if (t.type === 'SALE' && (paymentStatus === 'CASH' || paymentStatus === 'PAID') && Number(t.total_amount) > 0) {
        const todayDate = localDate();
        const drawer = getOpenCashDrawer(db, t.tenant_id || 'global', todayDate);
        if (drawer) {
          const txnId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, sync_status)
            VALUES (?, ?, ?, 'CASH_IN', ?, 'SCRAP_SALE', ?, 'system', 'PENDING')
          `).run(
            txnId,
            t.tenant_id || 'global',
            drawer.drawer_id,
            Number(t.total_amount),
            `Scrap sale ${t.scrap_invoice_number || ''}`.trim()
          );
          const newCashSales = Number(drawer.cash_sales) + Number(t.total_amount);
          const newCurrentCash = Number(drawer.current_cash) + Number(t.total_amount);
          const newExpectedClosing = Number(drawer.opening_balance) + newCashSales + Number(drawer.cash_in) - Number(drawer.cash_out);
          db.prepare(`
            UPDATE cash_drawer SET cash_sales = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE drawer_id = ?
          `).run(newCashSales, newCurrentCash, newExpectedClosing, drawer.drawer_id);
        }
      }
      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:addScrapTransaction]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:getScrapTransactions', (event, { tenant_id, scrap_category_id }: { tenant_id: string; scrap_category_id?: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    let query = `
      SELECT st.*, sc.name as scrap_category_name, sc.unit 
      FROM scrap_transactions st 
      LEFT JOIN scrap_categories sc ON st.scrap_category_id = sc.scrap_category_id 
      WHERE st.tenant_id = ? AND (st.is_deleted IS NULL OR st.is_deleted = 0)
    `;
    const params: any[] = [tenant_id];
    if (scrap_category_id) {
      query += ' AND st.scrap_category_id = ?';
      params.push(scrap_category_id);
    }
    query += ' ORDER BY st.created_at DESC LIMIT 500';
    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:getScrapTransactions]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getScrapCategoriesBySearch', (event, { tenant_id, search }: { tenant_id: string; search: string }) => {
  try {
    const db = getDb();
    if (!tenant_id || !search) return [];
    const cleanSearch = String(search).trim();
    const cleanSearchNoSpace = cleanSearch.replace(/\s+/g, '');
    return db.prepare(`
      SELECT * FROM scrap_categories 
      WHERE tenant_id = ? AND is_deleted = 0 AND (name LIKE ? OR REPLACE(name, ' ', '') LIKE ? OR CLEAN_STR(name) LIKE ?)
      ORDER BY name COLLATE NOCASE ASC
      LIMIT 10
    `).all(tenant_id, `%${cleanSearch}%`, `%${cleanSearchNoSpace}%`, `%${cleanSearch.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')}%`);
  } catch (error: any) {
    console.error('[db:getScrapCategoriesBySearch]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getNextScrapInvoiceNumber', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);
    const configKey = 'scrap_invoice_counter';

    const result = db.transaction(() => {
      const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', configKey);
      let counter = 1;
      // Use the stored prefix as-is — do NOT override prefixes that happen to contain '-SCR-'.
      // The stored prefix is whatever the user configured in Settings.
      const defaultPrefix = `${terminalCode}-SCR-`;
      let prefix = defaultPrefix;

      if (row) {
        try {
          const parsed = JSON.parse(row.value);
          counter = (typeof parsed.counter === 'number' && parsed.counter > 0) ? parsed.counter : 1;
          // Respect user-set prefix directly — no keyword-based override.
          if (parsed.prefix && /[A-Z0-9]/i.test(parsed.prefix)) {
            prefix = parsed.prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
          }
        } catch {
          counter = 1;
        }
      }

      // ── Duplicate-safety check (mirrors normal invoice behaviour) ──────────
      // Check existing scrap_transactions for this invoice number so we never
      // reuse a number that was already printed/saved on a previous bill.
      const checkStmt = db.prepare(
        'SELECT 1 FROM scrap_transactions WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0) LIMIT 1'
      );
      let candidate = `${prefix}${String(counter).padStart(3, '0')}`;
      while (checkStmt.get(tenant_id || 'global', candidate)) {
        counter++;
        candidate = `${prefix}${String(counter).padStart(3, '0')}`;
      }

      // Persist the next counter value so subsequent calls start from counter+1.
      const nextConfig = { prefix, counter: counter + 1 };
      db.prepare(`
        INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
        VALUES ('global', ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, key) DO UPDATE SET
          value = EXCLUDED.value,
          sync_status = 'LOCAL',
          updated_at = CURRENT_TIMESTAMP
      `).run(configKey, JSON.stringify(nextConfig));

      return { success: true, invoiceNumber: candidate, counter };
    })();

    return result;
  } catch (error: any) {
    console.error('[db:getNextScrapInvoiceNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:peekNextScrapInvoiceNumber', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);
    const defaultPrefix = `${terminalCode}-SCR-`;

    const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'scrap_invoice_counter');
    let counter = 1;
    let prefix = defaultPrefix;

    if (row) {
      try {
        const config = JSON.parse(row.value);
        counter = (typeof config.counter === 'number' && config.counter > 0) ? config.counter : 1;
        // Respect user-set prefix directly -- no keyword-based override.
        if (config.prefix && /[A-Z0-9]/i.test(config.prefix)) {
          prefix = config.prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
        }
      } catch {
        // Invalid JSON in stored value -- fall through to defaults
      }
    }

    // Duplicate-safety check (peek -- read-only, no counter increment)
    const checkStmt = db.prepare(
      'SELECT 1 FROM scrap_transactions WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0) LIMIT 1'
    );
    let candidate = `${prefix}${String(counter).padStart(3, '0')}`;
    while (checkStmt.get(tenant_id || 'global', candidate)) {
      counter++;
      candidate = `${prefix}${String(counter).padStart(3, '0')}`;
    }

    return { success: true, invoiceNumber: candidate };
  } catch (error: any) {
    console.error('[db:peekNextScrapInvoiceNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});
ipcMain.handle('db:getScrapInvoiceByNumber', (event, { tenant_id, scrap_invoice_number }: { tenant_id: string; scrap_invoice_number: string }) => {
  try {
    const db = getDb();
    if (!tenant_id || !scrap_invoice_number) return null;
    const rows: any[] = db.prepare(`
      SELECT st.*, sc.name as scrap_category_name, sc.unit
      FROM scrap_transactions st
      LEFT JOIN scrap_categories sc ON st.scrap_category_id = sc.scrap_category_id
      WHERE st.tenant_id = ? AND st.scrap_invoice_number = ? AND (st.is_deleted IS NULL OR st.is_deleted = 0)
      ORDER BY st.created_at DESC
    `).all(tenant_id, scrap_invoice_number);
    if (rows.length === 0) return null;
    const totalAmount = rows.reduce((sum, r) => sum + r.total_amount, 0);
    const paymentStatus = rows[0]?.payment_status || 'PENDING';
    return { transactions: rows, totalAmount, invoiceNumber: scrap_invoice_number, paymentStatus };
  } catch (error: any) {
    console.error('[db:getScrapInvoiceByNumber]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getScrapInvoiceList', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    const rows: any[] = db.prepare(`
      SELECT 
        st.scrap_invoice_number as invoice_number,
        COUNT(st.transaction_id) as item_count,
        SUM(st.quantity) as total_qty,
        GROUP_CONCAT(DISTINCT sc.unit) as units,
        SUM(st.total_amount) as total_amount,
        MAX(st.payment_status) as payment_status,
        MIN(st.created_at) as created_at,
        MAX(st.created_at) as updated_at,
        MAX(st.party_name) as party_name,
        MAX(st.customer_phone) as customer_phone,
        MAX(st.customer_address) as customer_address
      FROM scrap_transactions st
      LEFT JOIN scrap_categories sc ON st.scrap_category_id = sc.scrap_category_id
      WHERE st.tenant_id = ? AND st.scrap_invoice_number IS NOT NULL AND st.type = 'PURCHASE' AND (st.is_deleted IS NULL OR st.is_deleted = 0)
      GROUP BY st.scrap_invoice_number
      ORDER BY created_at DESC
      LIMIT 500
    `).all(tenant_id);
    return rows;
  } catch (error: any) {
    console.error('[db:getScrapInvoiceList]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateScrapInvoicePaymentStatus', (event, { tenant_id, scrap_invoice_number, payment_status }: { tenant_id: string; scrap_invoice_number: string; payment_status: string }) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE scrap_transactions SET payment_status = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND scrap_invoice_number = ?
    `).run(payment_status, tenant_id, scrap_invoice_number);
    return { success: true };
  } catch (error: any) {
    console.error('[db:updateScrapInvoicePaymentStatus]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateScrapInvoiceHeader', (event, { tenant_id, scrap_invoice_number, party_name, customer_phone, customer_address, payment_status }: { tenant_id: string; scrap_invoice_number: string; party_name?: string; customer_phone?: string; customer_address?: string; payment_status?: string }) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE scrap_transactions 
      SET party_name = ?, customer_phone = ?, customer_address = ?, payment_status = COALESCE(?, payment_status), sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND scrap_invoice_number = ?
    `).run(party_name ?? null, customer_phone ?? null, customer_address ?? null, payment_status ?? null, tenant_id, scrap_invoice_number);
    return { success: true };
  } catch (error: any) {
    console.error('[db:updateScrapInvoiceHeader]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateScrapInvoiceFull', (event, { tenant_id, scrap_invoice_number, party_name, customer_phone, customer_address, payment_status, items }: { tenant_id: string; scrap_invoice_number: string; party_name?: string; customer_phone?: string; customer_address?: string; payment_status?: string; items: any[] }) => {
  try {
    const db = getDb();
    const result = db.transaction(() => {
      const existingRows: any[] = db.prepare(
        'SELECT * FROM scrap_transactions WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0)'
      ).all(tenant_id, scrap_invoice_number);

      for (const row of existingRows) {
        const qtyDelta = row.type === 'SALE' ? Number(row.quantity) : -Number(row.quantity);
        db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`)
          .run(qtyDelta, row.scrap_category_id);
      }

      db.prepare(`UPDATE scrap_transactions SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND scrap_invoice_number = ?`)
        .run(tenant_id, scrap_invoice_number);

      const insertTx = db.prepare(`
        INSERT INTO scrap_transactions (
          transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, payment_status, created_at, updated_at
        ) VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      const updateStock = db.prepare(`
        UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?
      `);

      for (const item of items) {
        const txId = crypto.randomUUID();
        const catId = item.scrap_category_id || item.product_id;
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        const totalAmount = qty * rate;

        insertTx.run(
          txId,
          tenant_id,
          catId,
          qty,
          rate,
          totalAmount,
          party_name ?? null,
          customer_phone ?? null,
          customer_address ?? null,
          item.notes || 'Updated via Billing Page',
          scrap_invoice_number,
          payment_status || 'CASH'
        );

        updateStock.run(qty, catId);
      }

      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:updateScrapInvoiceFull]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateScrapTransaction', safeHandler((event, args) => {
  try {
    const db = getDb();
    const row: any = db.prepare(
      'SELECT * FROM scrap_transactions WHERE transaction_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)'
    ).get(args.transaction_id, args.tenant_id);
    if (!row) return { success: false, error: 'Transaction not found' };

    const oldCatId = row.scrap_category_id;
    const newCatId = args.scrap_category_id || oldCatId;
    const oldQty = Number(row.quantity);
    const newQty = Number(args.quantity);
    const newRate = Number(args.rate);
    const totalAmount = newQty * newRate;

    const result = db.transaction(() => {
      db.prepare(`
        UPDATE scrap_transactions 
        SET scrap_category_id = ?, quantity = ?, rate = ?, total_amount = ?, party_name = ?, notes = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE transaction_id = ? AND tenant_id = ?
      `).run(
        newCatId,
        newQty,
        newRate,
        totalAmount,
        args.party_name ?? row.party_name,
        args.notes ?? row.notes,
        args.transaction_id,
        args.tenant_id
      );

      if (oldCatId === newCatId) {
        const qtyDelta = row.type === 'SALE' ? oldQty - newQty : newQty - oldQty;
        db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`)
          .run(qtyDelta, oldCatId);
      } else {
        const revertOldDelta = row.type === 'SALE' ? oldQty : -oldQty;
        db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`)
          .run(revertOldDelta, oldCatId);

        const applyNewDelta = row.type === 'SALE' ? -newQty : newQty;
        db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`)
          .run(applyNewDelta, newCatId);
      }

      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:updateScrapTransaction]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:deleteScrapTransaction', (event, { tenant_id, transaction_id }: { tenant_id: string; transaction_id: string }) => {
  try {
    const db = getDb();
    const row: any = db.prepare('SELECT * FROM scrap_transactions WHERE transaction_id = ? AND tenant_id = ?').get(transaction_id, tenant_id);
    if (!row) return { success: false, error: 'Transaction not found' };
    const qtyDelta = row.type === 'SALE' ? Number(row.quantity) : -Number(row.quantity);
    const result = db.transaction(() => {
      db.prepare(`UPDATE scrap_transactions SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE transaction_id = ? AND tenant_id = ?`).run(transaction_id, tenant_id);
      db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`).run(qtyDelta, row.scrap_category_id);
      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:deleteScrapTransaction]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:deleteScrapInvoice', (event, { tenant_id, scrap_invoice_number }: { tenant_id: string; scrap_invoice_number: string }) => {
  try {
    const db = getDb();
    const rows: any[] = db.prepare(
      'SELECT * FROM scrap_transactions WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0)'
    ).all(tenant_id, scrap_invoice_number);
    const result = db.transaction(() => {
      for (const row of rows) {
        const qtyDelta = row.type === 'SALE' ? Number(row.quantity) : -Number(row.quantity);
        db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`)
          .run(qtyDelta, row.scrap_category_id);
      }
      db.prepare(`UPDATE scrap_transactions SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND scrap_invoice_number = ?`)
        .run(tenant_id, scrap_invoice_number);
      const ledgerEntries: any[] = db.prepare(
        'SELECT * FROM party_ledger WHERE tenant_id = ? AND reference_number = ?'
      ).all(tenant_id, scrap_invoice_number);
      for (const entry of ledgerEntries) {
        db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?").run(entry.ledger_id);
        recalcPartyBalances(db, entry.party_id);
      }
      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:deleteScrapInvoice]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// â”€â”€ Scrap CREDIT â†’ Party/Ledger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Creates/updates a party ledger entry for a CREDIT scrap invoice (idempotent
// per invoice via reference_number). Non-CREDIT status removes the entry.
ipcMain.handle('db:upsertScrapCreditLedger', safeHandler((event, { tenant_id, scrap_invoice_number, payment_status, party_name, customer_phone, customer_address, user_id, user_name }: {
  tenant_id: string;
  scrap_invoice_number: string;
  payment_status: string;
  party_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  user_id?: string;
  user_name?: string;
}) => {
  try {
    const db = getDb();
    if (!tenant_id || !scrap_invoice_number) return { success: false, error: 'tenant_id and scrap_invoice_number are required' };

    const result = db.transaction(() => {
      let existingEntry: any = db.prepare(
        'SELECT * FROM party_ledger WHERE tenant_id = ? AND reference_number = ? LIMIT 1'
      ).get(tenant_id, scrap_invoice_number);

      const removeEntry = (entry: any) => {
        db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?").run(entry.ledger_id);
        recalcPartyBalances(db, entry.party_id);
      };

      if (payment_status !== 'CREDIT') {
        if (existingEntry) removeEntry(existingEntry);
        return { success: true, party_id: null };
      }

      const name = party_name ? String(party_name).trim() : '';
      if (!name) return { success: false, error: 'Party name is required for Credit payment' };

      const totalRow: any = db.prepare(
        `SELECT COALESCE(SUM(total_amount), 0) AS total FROM scrap_transactions WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0)`
      ).get(tenant_id, scrap_invoice_number);
      const total = parseFloat(totalRow?.total) || 0;
      if (total <= 0) return { success: false, error: 'Invoice total is zero' };

      const phone = customer_phone ? String(customer_phone).trim() : '';
      const address = customer_address ? String(customer_address).trim() : null;

      let party: any = db.prepare(
        'SELECT * FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)'
      ).get(tenant_id, phone) || null;
      if (!party) {
        party = db.prepare(
          "SELECT * FROM parties WHERE tenant_id = ? AND name = ? COLLATE NOCASE AND (is_deleted IS NULL OR is_deleted = 0)"
        ).get(tenant_id, name) || null;
      }

      if (!party) {
        const partyId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO parties (party_id, tenant_id, name, phone, address, gstin, balance, gst_balance, estimate_balance, balance_type, notes, pricing_tier_id, credit_limit, is_deleted, sync_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, NULL, 0, 0, 0, 'RECEIVABLE', NULL, NULL, 0, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(partyId, tenant_id, name, phone || null, address);
        party = { party_id: partyId };
      }

      const partyBal: any = db.prepare('SELECT balance FROM parties WHERE party_id = ?').get(party.party_id);
      const currentBalance = parseFloat(partyBal?.balance) || 0;
      const newBalance = currentBalance - total;

      // Party changed â†’ move the entry to the new party
      if (existingEntry && existingEntry.party_id !== party.party_id) {
        removeEntry(existingEntry);
        existingEntry = null;
      }

      if (existingEntry) {
        // Same party â†’ update in place (keeps ledger_id stable for sync)
        db.prepare(`
          UPDATE party_ledger SET
            debit_amount = ?, credit_amount = 0, description = ?, transaction_date = CURRENT_TIMESTAMP,
            payment_method = 'CREDIT', created_by = ?, created_by_name = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE ledger_id = ?
        `).run(total, `Scrap purchase ${scrap_invoice_number} - ${name}`, user_id || null, user_name || null, existingEntry.ledger_id);
        const entries = db.prepare(`
          SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
          WHERE party_id = ? ORDER BY transaction_date ASC, created_at ASC
        `).all(party.party_id) as any[];
        let running = 0;
        for (const row of entries) {
          running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
          db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
        }
        recalcPartyBalances(db, party.party_id);
      } else {
        const ledgerId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, payment_method, reference_number, created_by, created_by_name, sync_status, created_at, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, 0, ?, ?, 'GST', 'CREDIT', ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          ledgerId,
          party.party_id,
          tenant_id,
          `Scrap purchase ${scrap_invoice_number} - ${name}`,
          total,
          newBalance,
          scrap_invoice_number,
          user_id || null,
          user_name || null
        );
        db.prepare(`UPDATE parties SET balance = ?, gst_balance = gst_balance - ?, last_transaction_date = CURRENT_TIMESTAMP, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`)
          .run(newBalance, total, party.party_id);
      }

      return { success: true, party_id: party.party_id };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:upsertScrapCreditLedger]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:getStockReport', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare(`
      SELECT p.*, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price, pg.grade_name, pg.category as grade_category
      FROM products p 
      LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id 
      WHERE p.tenant_id = ? AND p.is_deleted = 0 
      ORDER BY p.category ASC, p.name COLLATE NOCASE ASC
    `).all(tenantId);
  } catch (error: any) {
    console.error('[db:getStockReport]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getProductBillQuantities', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare(`
      SELECT 
        p.product_id,
        COALESCE(inv_summary.gst_qty, 0) as gst_qty,
        COALESCE(inv_summary.estimate_qty, 0) as estimate_qty,
        COALESCE(pb_summary.gst_purchased_qty, 0) as gst_purchased_qty
      FROM products p
      LEFT JOIN (
        SELECT 
          ii.product_id,
          SUM(CASE WHEN i.invoice_type = 'GST' THEN ii.quantity ELSE 0 END) as gst_qty,
          SUM(CASE WHEN i.invoice_type = 'BILL_OF_SUPPLY' AND i.converted_to_invoice_id IS NULL THEN ii.quantity ELSE 0 END) as estimate_qty
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.invoice_id
        WHERE ii.tenant_id = ? AND (i.is_deleted IS NULL OR i.is_deleted = 0)
        GROUP BY ii.product_id
      ) inv_summary ON p.product_id = inv_summary.product_id
      LEFT JOIN (
        SELECT 
          pbi.product_id,
          SUM(pbi.quantity) as gst_purchased_qty
        FROM purchase_bill_items pbi
        JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
        WHERE pb.tenant_id = ? AND pb.bill_type = 'GST'
        GROUP BY pbi.product_id
      ) pb_summary ON p.product_id = pb_summary.product_id
      WHERE p.tenant_id = ? AND p.is_deleted = 0
    `).all(tenantId, tenantId, tenantId);
  } catch (error: any) {
    console.error('[db:getProductBillQuantities]', error);
    return [];
  }
});

ipcMain.handle('db:getProductSuppliers', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return {};
    const rows = db.prepare(`
      SELECT DISTINCT pbi.product_id, pb.supplier_name
      FROM purchase_bill_items pbi
      JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
      WHERE pb.tenant_id = ? AND pb.supplier_name IS NOT NULL AND TRIM(pb.supplier_name) != ''
    `).all(tenantId);
    const map: Record<string, string[]> = {};
    for (const row of rows as any[]) {
      if (!map[row.product_id]) map[row.product_id] = [];
      if (!map[row.product_id].includes(row.supplier_name)) {
        map[row.product_id].push(row.supplier_name);
      }
    }
    return map;
  } catch (error: any) {
    console.error('[db:getProductSuppliers]', error);
    return {};
  }
});

// â”€â”€ Product Sales Summary (GST qty vs BoS qty sold per product) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('db:getProductSalesSummary', (event, { tenant_id, fromDate, toDate }: { tenant_id: string; fromDate?: string; toDate?: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];

    let dateClause = '';
    const params: any[] = [tenant_id];

    if (fromDate) {
      const cleanStart = parseCleanDate(fromDate);
      const cleanEnd = toDate ? parseCleanDate(toDate) : cleanStart;
      const { startUtc, endUtc } = getUtcRangeForStoreDateRange(cleanStart, cleanEnd, tenant_id);
      dateClause = ' AND (i.created_at >= ? AND i.created_at <= ?)';
      params.push(startUtc, endUtc);
    }

    return db.prepare(`
      SELECT ii.product_id,
             ii.name,
             COALESCE(SUM(CASE WHEN i.invoice_type = 'GST' THEN ii.quantity ELSE 0 END), 0) as gst_qty,
             COALESCE(SUM(CASE WHEN i.invoice_type = 'BILL_OF_SUPPLY' AND i.converted_to_invoice_id IS NULL THEN ii.quantity ELSE 0 END), 0) as bos_qty,
             COALESCE(SUM(CASE WHEN (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '') THEN ii.quantity ELSE 0 END), 0) as total_qty,
             COALESCE(SUM(CASE WHEN (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '') THEN ii.total ELSE 0 END), 0) as total_revenue
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.invoice_id
      WHERE ii.tenant_id = ? AND i.invoice_type IN ('GST', 'BILL_OF_SUPPLY') AND (i.is_deleted IS NULL OR i.is_deleted = 0)
        ${dateClause}
      GROUP BY ii.product_id, ii.name
      ORDER BY total_revenue DESC, total_qty DESC
    `).all(...params);
  } catch (error: any) {
    console.error('[db:getProductSalesSummary]', error);
    return [];
  }
});

// â”€â”€ BoS convertible check: which BoS invoices have â‰¥1 item with a GST purchase record â”€â”€
ipcMain.handle('db:getBosConvertibleInvoices', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare(`
      SELECT i.invoice_id,
             EXISTS(
               SELECT 1 FROM invoice_items ii
               LEFT JOIN products p ON ii.product_id = p.product_id
               WHERE ii.invoice_id = i.invoice_id
                 AND (
                   (p.product_id IS NOT NULL AND p.is_gst_applicable = 1)
                   OR EXISTS(
                     SELECT 1 FROM products pgst
                     WHERE pgst.tenant_id = i.tenant_id
                       AND pgst.is_deleted = 0
                       AND pgst.is_gst_applicable = 1
                       AND (
                         pgst.product_id = ii.product_id
                         OR pgst.name = REPLACE(REPLACE(REPLACE(COALESCE(p.name, ii.name), ' (GST)', ''), ' (EST)', ''), ' (Estimate)', '') || ' (GST)'
                         OR pgst.name = REPLACE(REPLACE(REPLACE(COALESCE(p.name, ii.name), ' (GST)', ''), ' (EST)', ''), ' (Estimate)', '')
                       )
                   )
                   OR EXISTS(
                     SELECT 1 FROM purchase_bill_items pbi
                     JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
                     WHERE (pbi.product_id = ii.product_id OR (p.product_id IS NOT NULL AND pbi.product_id = p.product_id))
                       AND pb.bill_type = 'GST'
                       AND pb.tenant_id = i.tenant_id
                   )
                   OR p.domain_attributes LIKE '%"gst_type":"PAPER"%'
                   OR p.domain_attributes LIKE '%"paper_mrp"%'
                   OR p.domain_attributes LIKE '%"paper_purchase_price"%'
                   OR p.domain_attributes LIKE '%"gst_purchase_price"%'
                   OR p.domain_attributes LIKE '%"paper_stock"%'
                 )
             ) AS convertible
      FROM invoices i
      WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR ? = 'global') AND i.invoice_type = 'BILL_OF_SUPPLY' AND i.converted_to_invoice_id IS NULL AND (i.is_deleted IS NULL OR i.is_deleted = 0)
    `).all(tenantId, tenantId);
  } catch (error: any) {
    console.error('[db:getBosConvertibleInvoices]', error);
    return [];
  }
});

// â”€â”€ Quotations IPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getNextOrPeekPurchaseBillNumber(
  db: any,
  tenantId: string,
  billType?: string,
  advance: boolean = false
): { success: boolean; billNumber: string; counter: number } {
  const terminalCode = getOrInitTerminalCode(db);
  const defaultPrefix = `${terminalCode}-PUR-`;
  const configKey = 'purchase_bill_counter';
  const effectiveTenant = tenantId || 'global';

  // 1. Fetch configured prefix/counter from tenant or global settings
  const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(effectiveTenant, configKey)
    || db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', configKey);

  let prefix = defaultPrefix;
  let configuredCounter: number | null = null;

  if (row && row.value) {
    try {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (typeof parsed.counter === 'number' && parsed.counter > 0) {
        configuredCounter = parsed.counter;
      }
      if (parsed.prefix && typeof parsed.prefix === 'string' && parsed.prefix.trim().length > 0) {
        const clean = parsed.prefix.trim().replace(/[^A-Z0-9_-]/gi, '').toUpperCase();
        prefix = clean.endsWith('-') ? clean : `${clean}-`;
      }
    } catch {}
  }

  // 2. If no explicit prefix was configured in settings, inspect existing purchase bills for this tenant
  const existingBills: any[] = db.prepare(
    'SELECT bill_number, bill_type FROM purchase_bills WHERE tenant_id = ?'
  ).all(effectiveTenant);

  if ((!row || prefix === defaultPrefix) && existingBills.length > 0) {
    for (const b of existingBills) {
      const match = String(b.bill_number || '').match(/^([A-Z0-9]+-PUR-)/i);
      if (match) {
        prefix = match[1].toUpperCase();
        break;
      }
    }
  }

  const isEstimate = (billType || '').toUpperCase() === 'ESTIMATE';

  // 3. Scan existing bills for the maximum used numeric counter in this series
  let maxUsed = 0;
  for (const b of existingBills) {
    const numStr = String(b.bill_number || '');
    const isEstBill = numStr.endsWith('-EST') || (b.bill_type || '').toUpperCase() === 'ESTIMATE';

    // GST series matches non-EST bills; Estimate series matches EST bills
    if (isEstimate === isEstBill) {
      const match = numStr.match(/(\d+)(?:-EST)?$/i);
      if (match) {
        const parsedNum = parseInt(match[1], 10);
        if (!isNaN(parsedNum) && parsedNum > maxUsed) {
          maxUsed = parsedNum;
        }
      }
    }
  }

  // 4. Determine starting counter:
  // Counter is strictly maxUsed + 1 if bills exist, else fallback to configuredCounter or 1.
  let counter = 1;
  if (maxUsed > 0) {
    counter = maxUsed + 1;
  } else {
    counter = configuredCounter && configuredCounter > 0 ? configuredCounter : 1;
  }

  // 5. Duplicate check against existing bills
  const checkStmt = db.prepare(
    'SELECT 1 FROM purchase_bills WHERE tenant_id = ? AND bill_number = ? LIMIT 1'
  );

  let candidate = isEstimate
    ? `${prefix}${String(counter).padStart(3, '0')}-EST`
    : `${prefix}${String(counter).padStart(3, '0')}`;

  while (checkStmt.get(effectiveTenant, candidate)) {
    counter++;
    candidate = isEstimate
      ? `${prefix}${String(counter).padStart(3, '0')}-EST`
      : `${prefix}${String(counter).padStart(3, '0')}`;
  }

  // 6. If advancing, persist next counter value
  if (advance) {
    const nextConfig = { prefix, counter: counter + 1 };
    db.prepare(`
      INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
      VALUES (?, ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, key) DO UPDATE SET
        value = EXCLUDED.value,
        sync_status = 'LOCAL',
        updated_at = CURRENT_TIMESTAMP
    `).run(effectiveTenant, configKey, JSON.stringify(nextConfig));

    if (effectiveTenant !== 'global') {
      db.prepare(`
        INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
        VALUES ('global', ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, key) DO UPDATE SET
          value = EXCLUDED.value,
          sync_status = 'LOCAL',
          updated_at = CURRENT_TIMESTAMP
      `).run(configKey, JSON.stringify(nextConfig));
    }
  }

  return { success: true, billNumber: candidate, counter };
}

ipcMain.handle('db:peekNextPurchaseBillNumber', (event, payload: { tenant_id: string; bill_type?: string }) => {
  try {
    const db = getDb();
    return getNextOrPeekPurchaseBillNumber(db, payload?.tenant_id, payload?.bill_type, false);
  } catch (error: any) {
    console.error('[db:peekNextPurchaseBillNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getNextPurchaseBillNumber', (event, payload: { tenant_id: string; bill_type?: string }) => {
  try {
    const db = getDb();
    const result = db.transaction(() => {
      return getNextOrPeekPurchaseBillNumber(db, payload?.tenant_id, payload?.bill_type, true);
    })();
    return result;
  } catch (error: any) {
    console.error('[db:getNextPurchaseBillNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:addPurchaseBill', safeHandler((event, payload: {
  purchase_bill_id: string;
  tenant_id: string;
  bill_number: string;
  supplier_id?: string;
  supplier_name: string;
  bill_date?: string;
  invoice_number?: string;
  notes?: string;
  total_amount: number;
  bill_type?: string;
  payment_type?: string;
    items: Array<{
      item_id: string;
      product_id: string;
      name: string;
      quantity: number;
      purchase_price: number;
      total_amount: number;
      selling_price?: number | null;
      offer_price?: number | null;
      is_gst_applicable?: number;
      tax_rate_percent?: number;
      hsn_sac_code?: string;
      skip_stock_update?: number;
    }>;
  }) => {
    try {
      const db = getDb();
      const billType = payload.bill_type || 'GST';
      const paymentType = payload.payment_type || 'CASH';
      const result = db.transaction(() => {
        const { items, ...bill } = payload;
        db.prepare(`
          INSERT INTO purchase_bills (purchase_bill_id, tenant_id, bill_number, supplier_id, supplier_name, bill_date, invoice_number, notes, total_amount, bill_type, payment_type, sync_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(bill.purchase_bill_id, bill.tenant_id, bill.bill_number, bill.supplier_id || null, bill.supplier_name, bill.bill_date || null, bill.invoice_number || null, bill.notes || null, bill.total_amount, billType, paymentType);

        const stmt = db.prepare(`
          INSERT INTO purchase_bill_items (item_id, purchase_bill_id, tenant_id, product_id, name, quantity, purchase_price, total_amount, selling_price, offer_price, is_gst_applicable, tax_rate_percent, hsn_sac_code, skip_stock_update, sync_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
        // Two stock statements: ESTIMATE bills update stock+price; GST bills update price only (tax documents, not inventory)
        const updateStock = db.prepare(`UPDATE products SET current_stock = current_stock + ?, purchase_price = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?`);
        const updatePurchasePriceOnly = db.prepare(`UPDATE products SET purchase_price = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?`);
        const updatePrice = db.prepare(`UPDATE products SET base_price = ? WHERE product_id = ? AND tenant_id = ?`);
        const updateOfferPrice = db.prepare(`UPDATE products SET offer_price = ? WHERE product_id = ? AND tenant_id = ?`);
        for (const item of items) {
          const isGst = billType === 'GST' ? (item.is_gst_applicable ?? 1) : 0;
          const hasEstimate = billType === 'GST' ? db.prepare(`
            SELECT 1 FROM purchase_bill_items pbi
            JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
            WHERE pb.bill_type = 'ESTIMATE' AND pbi.product_id = ? AND pb.tenant_id = ?
            LIMIT 1
          `).get(item.product_id, bill.tenant_id) : null;
          const skipStock = (billType === 'GST' && (item.skip_stock_update === 1 || Boolean(hasEstimate))) ? 1 : (item.skip_stock_update ?? 0);
          stmt.run(item.item_id, bill.purchase_bill_id, bill.tenant_id, item.product_id, item.name, item.quantity, item.purchase_price, item.total_amount, item.selling_price != null ? item.selling_price : 0, item.offer_price != null ? item.offer_price : 0, isGst, item.tax_rate_percent ?? 0, item.hsn_sac_code || null, skipStock);
          const actualPurchasePrice = billType === 'GST' && isGst === 1
            ? item.purchase_price * (1 + (item.tax_rate_percent ?? 0) / 100)
            : item.purchase_price;
          // Update stock for Estimates, and for GST bills only if they are not dummy / paper (not shared/skipped)
          if (billType === 'ESTIMATE' || (billType === 'GST' && skipStock === 0)) {
            updateStock.run(item.quantity, actualPurchasePrice, item.product_id, bill.tenant_id);
            if (item.selling_price != null) {
              updatePrice.run(item.selling_price, item.product_id, bill.tenant_id);
            }
            if (item.offer_price != null) {
              updateOfferPrice.run(item.offer_price, item.product_id, bill.tenant_id);
            }
          } else {
            // Paper GST bill: update domain_attributes with paper_purchase_price and paper_mrp
            const prodRow = db.prepare('SELECT domain_attributes FROM products WHERE product_id = ?').get(item.product_id) as any;
            if (prodRow) {
              let da: Record<string, any> = {};
              try { da = JSON.parse(prodRow.domain_attributes || '{}'); } catch {}
              da.gst_purchase_price = item.purchase_price;
              da.paper_purchase_price = item.purchase_price;
              if (item.selling_price != null) {
                da.paper_mrp = item.selling_price;
                da.paper_base_price = item.selling_price;
              }
              db.prepare(`UPDATE products SET domain_attributes = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?`).run(JSON.stringify(da), item.product_id, bill.tenant_id);
            }
          }
        }

      // If CREDIT payment and supplier is a known party, create ledger entry
      if (paymentType === 'CREDIT' && bill.supplier_id) {
        const party = db.prepare('SELECT balance, gst_balance, estimate_balance FROM parties WHERE party_id = ?').get(bill.supplier_id) as any;
        if (party) {
          const balanceType = billType === 'ESTIMATE' ? 'ESTIMATE' : 'GST';
          const ledgerId = crypto.randomUUID();
          const debitAmount = bill.total_amount;
          const balanceCol = balanceType === 'ESTIMATE' ? 'estimate_balance' : 'gst_balance';
          const currentTypeBalance = parseFloat(party[balanceCol]) || 0;
          const newTypeBalance = currentTypeBalance - debitAmount;
          const newBalance = (parseFloat(party.balance) || 0) - debitAmount;
          db.prepare(`
            INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, payment_method, reference_number, created_by, created_by_name, sync_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(ledgerId, bill.supplier_id, bill.tenant_id, bill.bill_date || localTimestamp(), `Purchase bill ${bill.bill_number} - ${bill.supplier_name}`, 0, debitAmount, newBalance, balanceType, bill.bill_number, 'system', 'System');
          db.prepare(`UPDATE parties SET balance = ?, ${balanceCol} = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`)
            .run(newBalance, newTypeBalance, bill.bill_date || localTimestamp(), bill.supplier_id);
        }
      }

      // If CASH payment, deduct cash from current cash drawer
      if (paymentType === 'CASH' && Number(bill.total_amount) > 0) {
        const todayDate = localDate();
        const drawer = getOpenCashDrawer(db, bill.tenant_id, todayDate);
        if (drawer) {
          const txnId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, sync_status)
            VALUES (?, ?, ?, 'CASH_OUT', ?, 'Purchase Bill', ?, 'system', 'PENDING')
          `).run(
            txnId,
            bill.tenant_id,
            drawer.drawer_id,
            Number(bill.total_amount),
            `Purchase bill ${bill.bill_number} - ${bill.supplier_name}`
          );
          const newCashOut = Number(drawer.cash_out) + Number(bill.total_amount);
          const newCurrentCash = Number(drawer.current_cash) - Number(bill.total_amount);
          const newExpectedClosing = Number(drawer.opening_balance) + Number(drawer.cash_sales) + Number(drawer.cash_in) - newCashOut;
          db.prepare(`
            UPDATE cash_drawer SET cash_out = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE drawer_id = ?
          `).run(newCashOut, newCurrentCash, newExpectedClosing, drawer.drawer_id);
        }
      }

      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:addPurchaseBill]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:getPurchaseBills', (event, { tenant_id, search, limit, offset }: { tenant_id: string; search?: string; limit?: number; offset?: number }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];

    let query = 'SELECT pb.*, p.phone as supplier_phone, p.gstin as supplier_gstin FROM purchase_bills pb LEFT JOIN parties p ON pb.supplier_id = p.party_id WHERE pb.tenant_id = ?';
    const params: any[] = [tenant_id];

    if (search) {
      query += ' AND (pb.bill_number LIKE ? OR pb.supplier_name LIKE ? OR pb.invoice_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY pb.created_at DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }
    if (offset) {
      query += ' OFFSET ?';
      params.push(offset);
    }

    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:getPurchaseBills]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getPurchaseBillItems', (event, purchase_bill_id: string) => {
  try {
    const db = getDb();
    return db.prepare('SELECT pbi.*, p.name as product_name, p.sku_barcode, p.item_code, p.base_price as product_base_price, p.offer_price as product_offer_price, p.current_stock as product_stock FROM purchase_bill_items pbi LEFT JOIN products p ON pbi.product_id = p.product_id WHERE pbi.purchase_bill_id = ? ORDER BY pbi.created_at ASC').all(purchase_bill_id);
  } catch (error: any) {
    console.error('[db:getPurchaseBillItems]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:updatePurchaseBill', safeHandler((event, payload: {
  purchase_bill_id: string;
  tenant_id: string;
  bill_number: string;
  supplier_id?: string;
  supplier_name: string;
  bill_date?: string;
  invoice_number?: string;
  notes?: string;
  total_amount: number;
  bill_type?: string;
  payment_type?: string;
  items: Array<{
    item_id: string;
    product_id: string;
    name: string;
    quantity: number;
    purchase_price: number;
    total_amount: number;
    selling_price?: number | null;
    offer_price?: number | null;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
    skip_stock_update?: number;
  }>;
}) => {
  try {
    const db = getDb();
    const billType = payload.bill_type || 'GST';
    const paymentType = payload.payment_type || 'CASH';
    const result = db.transaction(() => {
      const { items, ...bill } = payload;
      // Revert stock of previous items before deleting them.
      // Must query oldBill and oldItems BEFORE updating purchase_bills
      const oldBill = db.prepare('SELECT bill_number, bill_type FROM purchase_bills WHERE purchase_bill_id = ?').get(bill.purchase_bill_id) as any;
      const oldBillType = oldBill?.bill_type || 'GST';
      const oldItems = db.prepare('SELECT product_id, quantity, skip_stock_update FROM purchase_bill_items WHERE purchase_bill_id = ?').all(bill.purchase_bill_id) as any[];

      db.prepare(`
        UPDATE purchase_bills SET supplier_id = ?, supplier_name = ?, bill_date = ?, invoice_number = ?, notes = ?, total_amount = ?, bill_type = ?, payment_type = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE purchase_bill_id = ?
      `).run(bill.supplier_id || null, bill.supplier_name, bill.bill_date || null, bill.invoice_number || null, bill.notes || null, bill.total_amount, billType, paymentType, bill.purchase_bill_id);

      const decreaseStock = db.prepare(`UPDATE products SET current_stock = current_stock - ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?`);
      if (oldBillType === 'ESTIMATE') {
        for (const item of oldItems) {
          decreaseStock.run(item.quantity, item.product_id, bill.tenant_id);
        }
      } else {
        // For old GST bills, only revert stock if this item was NOT dummy (meaning no skip_stock_update and no Estimate exists for this product)
        for (const item of oldItems) {
          if (item.skip_stock_update === 1) {
            continue; // Was dummy / paper stock, never added to physical shop stock
          }
          const hasEstimate = db.prepare(`
            SELECT 1 FROM purchase_bill_items pbi
            JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
            WHERE pb.bill_type = 'ESTIMATE' AND pbi.product_id = ? AND pb.tenant_id = ?
            LIMIT 1
          `).get(item.product_id, bill.tenant_id);
          if (!hasEstimate) {
            decreaseStock.run(item.quantity, item.product_id, bill.tenant_id);
          }
        }
      }

      db.prepare('DELETE FROM purchase_bill_items WHERE purchase_bill_id = ?').run(bill.purchase_bill_id);

      const stmt = db.prepare(`
        INSERT INTO purchase_bill_items (item_id, purchase_bill_id, tenant_id, product_id, name, quantity, purchase_price, total_amount, selling_price, offer_price, is_gst_applicable, tax_rate_percent, hsn_sac_code, skip_stock_update, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      // Two stock statements: ESTIMATE bills update stock+price; GST bills update price only
      const updateStock = db.prepare(`UPDATE products SET current_stock = current_stock + ?, purchase_price = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?`);
      const updatePurchasePriceOnly = db.prepare(`UPDATE products SET purchase_price = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?`);
      const updatePrice = db.prepare(`UPDATE products SET base_price = ? WHERE product_id = ? AND tenant_id = ?`);
      const updateOfferPrice = db.prepare(`UPDATE products SET offer_price = ? WHERE product_id = ? AND tenant_id = ?`);
      for (const item of items) {
        const isGst = billType === 'GST' ? (item.is_gst_applicable ?? 1) : 0;
        const hasEstimate = billType === 'GST' ? db.prepare(`
          SELECT 1 FROM purchase_bill_items pbi
          JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
          WHERE pb.bill_type = 'ESTIMATE' AND pbi.product_id = ? AND pb.tenant_id = ?
          LIMIT 1
        `).get(item.product_id, bill.tenant_id) : null;
        const skipStock = (billType === 'GST' && (item.skip_stock_update === 1 || Boolean(hasEstimate))) ? 1 : (item.skip_stock_update ?? 0);

        stmt.run(item.item_id, bill.purchase_bill_id, bill.tenant_id, item.product_id, item.name, item.quantity, item.purchase_price, item.total_amount, item.selling_price != null ? item.selling_price : 0, item.offer_price != null ? item.offer_price : 0, isGst, item.tax_rate_percent ?? 0, item.hsn_sac_code || null, skipStock);
        const actualPurchasePrice = billType === 'GST' && isGst === 1
          ? item.purchase_price * (1 + (item.tax_rate_percent ?? 0) / 100)
          : item.purchase_price;
        // Update stock for Estimates, and for GST bills only if they are not dummy / paper (not shared/skipped)
        if (billType === 'ESTIMATE' || (billType === 'GST' && skipStock === 0)) {
          updateStock.run(item.quantity, actualPurchasePrice, item.product_id, bill.tenant_id);
          if (item.selling_price != null) {
            updatePrice.run(item.selling_price, item.product_id, bill.tenant_id);
          }
          if (item.offer_price != null) {
            updateOfferPrice.run(item.offer_price, item.product_id, bill.tenant_id);
          }
        } else {
          // Paper GST bill: update domain_attributes with paper_purchase_price and paper_mrp
          const prodRow = db.prepare('SELECT domain_attributes FROM products WHERE product_id = ?').get(item.product_id) as any;
          if (prodRow) {
            let da: Record<string, any> = {};
            try { da = JSON.parse(prodRow.domain_attributes || '{}'); } catch {}
            da.gst_purchase_price = item.purchase_price;
            da.paper_purchase_price = item.purchase_price;
            if (item.selling_price != null) {
              da.paper_mrp = item.selling_price;
              da.paper_base_price = item.selling_price;
            }
            db.prepare(`UPDATE products SET domain_attributes = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?`).run(JSON.stringify(da), item.product_id, bill.tenant_id);
          }
        }
      }

      if (paymentType === 'CREDIT' && bill.supplier_id) {
        const party = db.prepare('SELECT balance, gst_balance, estimate_balance FROM parties WHERE party_id = ?').get(bill.supplier_id) as any;
        if (party) {
          const balanceType = billType === 'ESTIMATE' ? 'ESTIMATE' : 'GST';
          const ledgerId = crypto.randomUUID();
          const debitAmount = bill.total_amount;
          const balanceCol = balanceType === 'ESTIMATE' ? 'estimate_balance' : 'gst_balance';
          const currentTypeBalance = parseFloat(party[balanceCol]) || 0;
          const newTypeBalance = currentTypeBalance - debitAmount;
          const newBalance = (parseFloat(party.balance) || 0) - debitAmount;
          db.prepare(`
            INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, payment_method, reference_number, created_by, created_by_name, sync_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(ledgerId, bill.supplier_id, bill.tenant_id, bill.bill_date || localTimestamp(), `Purchase bill ${bill.bill_number} - ${bill.supplier_name}`, 0, debitAmount, newBalance, balanceType, bill.bill_number, 'system', 'System');
          db.prepare(`UPDATE parties SET balance = ?, ${balanceCol} = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`)
            .run(newBalance, newTypeBalance, bill.bill_date || localTimestamp(), bill.supplier_id);
        }
      }

      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:updatePurchaseBill]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:deletePurchaseBill', (event, purchase_bill_id: string) => {
  try {
    const db = getDb();
    db.transaction(() => {
      const bill = db.prepare('SELECT supplier_id, bill_number, tenant_id, payment_type, total_amount FROM purchase_bills WHERE purchase_bill_id = ?').get(purchase_bill_id) as any;
      if (bill) {
        if (bill.supplier_id && bill.bill_number) {
          const ledgerEntries = db.prepare(
            'SELECT ledger_id FROM party_ledger WHERE tenant_id = ? AND party_id = ? AND reference_number = ?'
          ).all(bill.tenant_id, bill.supplier_id, bill.bill_number) as any[];
          for (const entry of ledgerEntries) {
            db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?").run(entry.ledger_id);
          }
          recalcPartyBalances(db, bill.supplier_id);
        }

        if (bill.payment_type === 'CASH' && Number(bill.total_amount) > 0) {
          const tx = db.prepare(`SELECT * FROM cash_transactions WHERE tenant_id = ? AND category = 'Purchase Bill' AND notes LIKE ?`).get(bill.tenant_id, `%${bill.bill_number}%`) as any;
          if (tx) {
            db.prepare(`DELETE FROM cash_transactions WHERE transaction_id = ?`).run(tx.transaction_id);
            const drawer = db.prepare(`SELECT * FROM cash_drawer WHERE drawer_id = ?`).get(tx.drawer_id) as any;
            if (drawer) {
              const newCashOut = Math.max(0, Number(drawer.cash_out) - Number(tx.amount));
              const newCurrentCash = Number(drawer.opening_balance) + Number(drawer.cash_sales) + Number(drawer.cash_in) - newCashOut;
              const newExpectedClosing = newCurrentCash;
              db.prepare(`UPDATE cash_drawer SET cash_out = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE drawer_id = ?`).run(newCashOut, newCurrentCash, newExpectedClosing, drawer.drawer_id);
            }
          }
        }
      }
      db.prepare('DELETE FROM purchase_bill_items WHERE purchase_bill_id = ?').run(purchase_bill_id);
      db.prepare('DELETE FROM purchase_bills WHERE purchase_bill_id = ?').run(purchase_bill_id);
    })();
    import('../sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Sync after delete error:', e));
    }).catch(() => {});
    return { success: true };
  } catch (error: any) {
    console.error('[db:deletePurchaseBill]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:productHasEstimateBills', (event, { product_id, tenant_id }: { product_id: string; tenant_id: string }) => {
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT 1 FROM purchase_bill_items pbi
      JOIN purchase_bills pb ON pb.purchase_bill_id = pbi.purchase_bill_id
      WHERE pbi.product_id = ? AND pbi.tenant_id = ? AND pb.bill_type = 'ESTIMATE'
      LIMIT 1
    `).get(product_id, tenant_id);
    return { success: true, hasEstimate: !!row };
  } catch (error: any) {
    console.error('[db:productHasEstimateBills]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getPurchaseBillProducts', (event, { tenant_id, search, limit, numericPrefixOnly = false }: { tenant_id: string; search?: string; limit?: number; numericPrefixOnly?: boolean }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];

    let query = `
      SELECT p.*, 
        COALESCE((SELECT SUM(pbi.quantity) FROM purchase_bill_items pbi JOIN purchase_bills pb ON pb.purchase_bill_id = pbi.purchase_bill_id WHERE pbi.product_id = p.product_id AND (pb.bill_type = 'GST' OR pbi.skip_stock_update = 1)), 0) as gst_purchase_quantity,
        COALESCE((SELECT pbi.purchase_price FROM purchase_bill_items pbi JOIN purchase_bills pb ON pb.purchase_bill_id = pbi.purchase_bill_id WHERE pbi.product_id = p.product_id AND (pb.bill_type = 'GST' OR pbi.skip_stock_update = 1) ORDER BY pbi.rowid DESC LIMIT 1), 0) as gst_purchase_price,
        COALESCE((SELECT pbi.selling_price FROM purchase_bill_items pbi JOIN purchase_bills pb ON pb.purchase_bill_id = pbi.purchase_bill_id WHERE pbi.product_id = p.product_id AND pbi.skip_stock_update = 1 ORDER BY pbi.rowid DESC LIMIT 1), 0) as paper_mrp
      FROM products p 
      WHERE p.tenant_id = ? AND p.is_deleted = 0
    `;
    const params: any[] = [tenant_id];

    if (search) {
      const cleanSearch = String(search).trim();
      const cleanSearchNoSpace = cleanSearch.replace(/\s+/g, '');
      if (/^\d+$/.test(cleanSearch) && numericPrefixOnly) {
        query += ' AND (p.sku_barcode LIKE ? OR p.item_code LIKE ? OR REPLACE(p.sku_barcode, \' \', \'\') LIKE ? OR REPLACE(p.item_code, \' \', \'\') LIKE ?)';
        params.push(`${cleanSearch}%`, `${cleanSearch}%`, `${cleanSearchNoSpace}%`, `${cleanSearchNoSpace}%`);
      } else {
        const cond = buildProductSearchConditions(cleanSearch, 'p.');
        query += ` AND ${cond.sql}`;
        params.push(...cond.params);
      }
    }

    const resultLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 200)));
    query += ' ORDER BY p.name COLLATE NOCASE ASC LIMIT ?';
    params.push(resultLimit);
    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:getPurchaseBillProducts]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:generateBarcode', (event, { tenant_id, item_code, strip_suffix }: { tenant_id: string; item_code?: string; strip_suffix?: string }) => {
  try {
    const db = getDb();
    const prefix = (item_code || '').trim();
    const suffix = strip_suffix || '';
    let nextNum = 1;
    if (prefix) {
      const rows = db.prepare(
        `SELECT sku_barcode FROM products WHERE tenant_id = ? AND sku_barcode LIKE ?`
      ).all(tenant_id, `${prefix}%`) as any[];
      for (const row of rows) {
        let base = row.sku_barcode.slice(prefix.length);
        // Strip known suffix (priceCode) from the end before extracting digits
        if (suffix && base.endsWith(suffix)) {
          base = base.slice(0, -suffix.length);
        }
        // Skip standard/manufacturer barcodes (length >= 8 digits) to avoid auto-increment jumps
        if (base.length >= 8) {
          continue;
        }
        const numStr = base.replace(/\D/g, '');
        if (numStr) {
          const num = parseInt(numStr, 10);
          if (num >= nextNum) nextNum = num + 1;
        }
      }
    } else {
      const rows = db.prepare(
        `SELECT sku_barcode FROM products WHERE tenant_id = ? AND sku_barcode GLOB '[0-9]*'`
      ).all(tenant_id) as any[];
      for (const row of rows) {
        let base = row.sku_barcode;
        // Strip known suffix from the end
        if (suffix && base.endsWith(suffix)) {
          base = base.slice(0, -suffix.length);
        }
        // Skip standard/manufacturer barcodes (length >= 8 digits) to avoid auto-increment jumps
        if (base.length >= 8) {
          continue;
        }
        const numStr = base.replace(/\D/g, '');
        if (numStr) {
          const num = parseInt(numStr, 10);
          if (num >= nextNum) nextNum = num + 1;
        }
      }
    }
    const digits = Math.max(3, nextNum.toString().length);
    const barcode = prefix + String(nextNum).padStart(digits, '0');
    return { success: true, barcode };
  } catch (error: any) {
    console.error('[db:generateBarcode]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// â”€â”€ Cash Drawer Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

}
