import type { PartyLedgerRow, PartyRow, ScrapCategoryInput, ScrapCategoryRow, ScrapInvoiceItemInput, ScrapInvoiceListRow, ScrapTotalRow, ScrapTransactionInput, ScrapTransactionRow, ScrapTransactionUpdateInput, SettingRow } from './typesA.js';
import { getDb } from '../db/localDb.js';
import { upsertCustomerRecord } from '../db/customerIdentity.js';
import { localDate } from './storeTime.js';
import { getOpenCashDrawer, reconcileCashDrawer } from './cashDrawerService.js';
import crypto from 'node:crypto';
import { getOrInitTerminalCode } from './invoiceNumberService.js';
import { recalcPartyBalances } from './partyLedgerService.js';
import * as scrapSql from '../db/statements/scrap.js';
/** scrap use-cases for the main process (called by electron/ipc handlers). */

/** IPC `db:getScrapCategories` */
export function getScrapCategories(tenantId: string) {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return scrapSql.findScrapCategories(db).all(tenantId);
  } catch (error) {
    console.error('[db:getScrapCategories]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:addScrapCategory` */
export function addScrapCategory(cat: ScrapCategoryInput) {
  try {
    const db = getDb();
    scrapSql.insertScrapCategory(db).run(cat.scrap_category_id, cat.tenant_id, cat.name, cat.purchase_price || 0, cat.selling_price || 0, cat.current_stock || 0, cat.unit || 'Kgs');
    return { success: true };
  } catch (error) {
    console.error('[db:addScrapCategory]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:updateScrapCategory` */
export function updateScrapCategory(cat: ScrapCategoryInput) {
  try {
    const db = getDb();
    scrapSql.updateScrapCategoryByScrapCategoryId(db).run(cat.name, cat.purchase_price || 0, cat.selling_price || 0, cat.current_stock || 0, cat.unit || 'Kgs', cat.scrap_category_id);
    return { success: true };
  } catch (error) {
    console.error('[db:updateScrapCategory]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:deleteScrapCategory` */
export function deleteScrapCategory(scrapCategoryId: string) {
  try {
    const db = getDb();
    scrapSql.updateScrapCategoryIsDeleted(db).run(scrapCategoryId);
    return { success: true };
  } catch (error) {
    console.error('[db:deleteScrapCategory]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:deduplicateScrapCategories` */
export function deduplicateScrapCategories() {
  try {
    const db = getDb();
    const dupes = scrapSql.findScrapCategories2(db).all() as ScrapCategoryRow[];
    let removed = 0;
    for (const d of dupes) {
      const result = scrapSql.deleteScrapCategoryByScrapCategoryId(db).run(d.scrap_category_id, d.keep_rowid);
      removed += result.changes;
    }
    return { removed };
  } catch (error) {
    console.error('[db:deduplicateScrapCategories]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:addScrapTransaction` */
export function addScrapTransaction(t: ScrapTransactionInput) {
  try {
    const db = getDb();
    const qtyNum = Number(t.quantity) || 0;
    const delta = t.type === 'PURCHASE' ? qtyNum : -qtyNum;
    const paymentStatus = t.payment_status || 'CASH';
    const result = db.transaction(() => {
      if (t.party_name || t.customer_phone) {
        upsertCustomerRecord(db, t.tenant_id || 'global', t.party_name, t.customer_phone, t.customer_address);
      }
      scrapSql.insertScrapTransaction(db).run(t.transaction_id, t.tenant_id, t.type, t.scrap_category_id, qtyNum, t.rate, t.total_amount, t.party_name || null, t.customer_phone || null, t.customer_address || null, t.notes || null, t.scrap_invoice_number || null, paymentStatus);
      scrapSql.updateScrapCategoryCurrentStock(db).run(delta, t.scrap_category_id);

      if (t.type === 'PURCHASE' && (paymentStatus === 'CASH' || paymentStatus === 'PAID') && Number(t.total_amount) > 0) {
        const todayDate = localDate(new Date(), t.tenant_id || 'global');
        const drawer = getOpenCashDrawer(db, t.tenant_id || 'global', todayDate);
        if (drawer) {
          const txnId = crypto.randomUUID();
          scrapSql.insertCashTransaction(db).run(
            txnId,
            t.tenant_id || 'global',
            drawer.drawer_id,
            Number(t.total_amount),
            `Scrap purchase ${t.scrap_invoice_number || ''}`.trim()
          );
          reconcileCashDrawer(db, t.tenant_id || 'global', drawer);
        }
      } else if (t.type === 'SALE' && (paymentStatus === 'CASH' || paymentStatus === 'PAID') && Number(t.total_amount) > 0) {
        const todayDate = localDate(new Date(), t.tenant_id || 'global');
        const drawer = getOpenCashDrawer(db, t.tenant_id || 'global', todayDate);
        if (drawer) {
          const txnId = crypto.randomUUID();
          scrapSql.insertCashTransaction2(db).run(
            txnId,
            t.tenant_id || 'global',
            drawer.drawer_id,
            Number(t.total_amount),
            `Scrap sale ${t.scrap_invoice_number || ''}`.trim()
          );
          reconcileCashDrawer(db, t.tenant_id || 'global', drawer);
        }
      }
      return { success: true };
    })();
    return result;
  } catch (error) {
    console.error('[db:addScrapTransaction]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:getScrapTransactions` */
export function getScrapTransactions({ tenant_id, scrap_category_id }: { tenant_id: string; scrap_category_id?: string }) {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    const { statement, params } = scrapSql.getScrapTransactionsStatement(db, { tenant_id, scrap_category_id });
    return statement.all(...params);
  } catch (error) {
    console.error('[db:getScrapTransactions]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:getScrapCategoriesBySearch` */
export function getScrapCategoriesBySearch({ tenant_id, search }: { tenant_id: string; search: string }) {
  try {
    const db = getDb();
    if (!tenant_id || !search) return [];
    const cleanSearch = String(search).trim();
    const cleanSearchNoSpace = cleanSearch.replace(/\s+/g, '');
    return scrapSql.findScrapCategories3(db).all(tenant_id, `%${cleanSearch}%`, `%${cleanSearchNoSpace}%`, `%${cleanSearch.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')}%`);
  } catch (error) {
    console.error('[db:getScrapCategoriesBySearch]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:getNextScrapInvoiceNumber` */
export function getNextScrapInvoiceNumber({ tenant_id }: { tenant_id: string }) {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);
    const configKey = 'scrap_invoice_counter';

    const result = db.transaction(() => {
      const row = scrapSql.findSettingsByKey(db).get('global', configKey) as SettingRow | undefined;
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
      const checkStmt = scrapSql.findOneScrapTransactionByScrapInvoiceNumber(db);
      let candidate = `${prefix}${String(counter).padStart(3, '0')}`;
      while (checkStmt.get(tenant_id || 'global', candidate)) {
        counter++;
        candidate = `${prefix}${String(counter).padStart(3, '0')}`;
      }

      // Persist the next counter value so subsequent calls start from counter+1.
      const nextConfig = { prefix, counter: counter + 1 };
      scrapSql.upsertSetting(db).run(configKey, JSON.stringify(nextConfig));

      return { success: true, invoiceNumber: candidate, counter };
    })();

    return result;
  } catch (error) {
    console.error('[db:getNextScrapInvoiceNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:peekNextScrapInvoiceNumber` */
export function peekNextScrapInvoiceNumber({ tenant_id }: { tenant_id: string }) {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);
    const defaultPrefix = `${terminalCode}-SCR-`;

    const row = scrapSql.findSettingsByKey(db).get('global', 'scrap_invoice_counter') as SettingRow | undefined;
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
    const checkStmt = scrapSql.findOneScrapTransactionByScrapInvoiceNumber(db);
    let candidate = `${prefix}${String(counter).padStart(3, '0')}`;
    while (checkStmt.get(tenant_id || 'global', candidate)) {
      counter++;
      candidate = `${prefix}${String(counter).padStart(3, '0')}`;
    }

    return { success: true, invoiceNumber: candidate };
  } catch (error) {
    console.error('[db:peekNextScrapInvoiceNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:getScrapInvoiceByNumber` */
export function getScrapInvoiceByNumber({ tenant_id, scrap_invoice_number }: { tenant_id: string; scrap_invoice_number: string }) {
  try {
    const db = getDb();
    if (!tenant_id || !scrap_invoice_number) return null;
    const rows = scrapSql.findScrapTransactionsByScrapInvoiceNumber(db).all(tenant_id, scrap_invoice_number) as ScrapTransactionRow[];
    if (rows.length === 0) return null;
    const totalAmount = rows.reduce((sum, r) => sum + r.total_amount, 0);
    const paymentStatus = rows[0]?.payment_status || 'PENDING';
    return { transactions: rows, totalAmount, invoiceNumber: scrap_invoice_number, paymentStatus };
  } catch (error) {
    console.error('[db:getScrapInvoiceByNumber]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:getScrapInvoiceList` */
export function getScrapInvoiceList({ tenant_id }: { tenant_id: string }) {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    const rows = scrapSql.findScrapTransactionsByScrap_AndType(db).all(tenant_id) as ScrapInvoiceListRow[];
    return rows;
  } catch (error) {
    console.error('[db:getScrapInvoiceList]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:updateScrapInvoicePaymentStatus` */
export function updateScrapInvoicePaymentStatus({ tenant_id, scrap_invoice_number, payment_status }: { tenant_id: string; scrap_invoice_number: string; payment_status: string }) {
  try {
    const db = getDb();
    scrapSql.updateScrapTransactionPaymentStatus(db).run(payment_status, tenant_id, scrap_invoice_number);
    return { success: true };
  } catch (error) {
    console.error('[db:updateScrapInvoicePaymentStatus]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:updateScrapInvoiceHeader` */
export function updateScrapInvoiceHeader({ tenant_id, scrap_invoice_number, party_name, customer_phone, customer_address, payment_status }: { tenant_id: string; scrap_invoice_number: string; party_name?: string; customer_phone?: string; customer_address?: string; payment_status?: string }) {
  try {
    const db = getDb();
    scrapSql.updateScrapTransactionByScrapInvoiceNumber(db).run(party_name ?? null, customer_phone ?? null, customer_address ?? null, payment_status ?? null, tenant_id, scrap_invoice_number);
    return { success: true };
  } catch (error) {
    console.error('[db:updateScrapInvoiceHeader]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:updateScrapInvoiceFull` */
export function updateScrapInvoiceFull({ tenant_id, scrap_invoice_number, party_name, customer_phone, customer_address, payment_status, items }: { tenant_id: string; scrap_invoice_number: string; party_name?: string; customer_phone?: string; customer_address?: string; payment_status?: string; items: ScrapInvoiceItemInput[] }) {
  try {
    const db = getDb();
    const result = db.transaction(() => {
      const existingRows = scrapSql.findScrapTransactionsByScrapInvoiceNumber2(db).all(tenant_id, scrap_invoice_number) as ScrapTransactionRow[];

      for (const row of existingRows) {
        const qtyDelta = row.type === 'SALE' ? Number(row.quantity) : -Number(row.quantity);
        scrapSql.updateScrapCategoryCurrentStock(db)
          .run(qtyDelta, row.scrap_category_id);
      }

      scrapSql.updateScrapTransactionIsDeleted(db)
        .run(tenant_id, scrap_invoice_number);

      const insertTx = scrapSql.insertScrapTransaction2(db);

      const updateStock = scrapSql.updateScrapCategoryCurrentStock(db);

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
  } catch (error) {
    console.error('[db:updateScrapInvoiceFull]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:updateScrapTransaction` */
export function updateScrapTransaction(args: ScrapTransactionUpdateInput) {
  try {
    const db = getDb();
    const row = scrapSql.findScrapTransactionsByTransactionId(db).get(args.transaction_id, args.tenant_id) as ScrapTransactionRow | undefined;
    if (!row) return { success: false, error: 'Transaction not found' };

    const oldCatId = row.scrap_category_id;
    const newCatId = args.scrap_category_id || oldCatId;
    const oldQty = Number(row.quantity);
    const newQty = Number(args.quantity);
    const newRate = Number(args.rate);
    const totalAmount = newQty * newRate;

    const result = db.transaction(() => {
      scrapSql.updateScrapTransactionByTransactionId(db).run(
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
        scrapSql.updateScrapCategoryCurrentStock(db)
          .run(qtyDelta, oldCatId);
      } else {
        const revertOldDelta = row.type === 'SALE' ? oldQty : -oldQty;
        scrapSql.updateScrapCategoryCurrentStock(db)
          .run(revertOldDelta, oldCatId);

        const applyNewDelta = row.type === 'SALE' ? -newQty : newQty;
        scrapSql.updateScrapCategoryCurrentStock(db)
          .run(applyNewDelta, newCatId);
      }

      return { success: true };
    })();
    return result;
  } catch (error) {
    console.error('[db:updateScrapTransaction]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:deleteScrapTransaction` */
export function deleteScrapTransaction({ tenant_id, transaction_id }: { tenant_id: string; transaction_id: string }) {
  try {
    const db = getDb();
    const row = scrapSql.findScrapTransactionsByTransactionId2(db).get(transaction_id, tenant_id) as ScrapTransactionRow | undefined;
    if (!row) return { success: false, error: 'Transaction not found' };
    const qtyDelta = row.type === 'SALE' ? Number(row.quantity) : -Number(row.quantity);
    const result = db.transaction(() => {
      scrapSql.updateScrapTransactionIsDeletedAlt(db).run(transaction_id, tenant_id);
      scrapSql.updateScrapCategoryCurrentStock(db).run(qtyDelta, row.scrap_category_id);
      return { success: true };
    })();
    return result;
  } catch (error) {
    console.error('[db:deleteScrapTransaction]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:deleteScrapInvoice` */
export function deleteScrapInvoice({ tenant_id, scrap_invoice_number }: { tenant_id: string; scrap_invoice_number: string }) {
  try {
    const db = getDb();
    const rows = scrapSql.findScrapTransactionsByScrapInvoiceNumber2(db).all(tenant_id, scrap_invoice_number) as ScrapTransactionRow[];
    const result = db.transaction(() => {
      for (const row of rows) {
        const qtyDelta = row.type === 'SALE' ? Number(row.quantity) : -Number(row.quantity);
        scrapSql.updateScrapCategoryCurrentStock(db)
          .run(qtyDelta, row.scrap_category_id);
      }
      scrapSql.updateScrapTransactionIsDeleted(db)
        .run(tenant_id, scrap_invoice_number);
      const ledgerEntries = scrapSql.findPartyLedgerByReferenceNumber(db).all(tenant_id, scrap_invoice_number) as PartyLedgerRow[];
      for (const entry of ledgerEntries) {
        scrapSql.updatePartyLedgerIsDeleted(db).run(entry.ledger_id);
        recalcPartyBalances(db, entry.party_id as string);
      }
      return { success: true };
    })();
    return result;
  } catch (error) {
    console.error('[db:deleteScrapInvoice]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:upsertScrapCreditLedger` */
export function upsertScrapCreditLedger({ tenant_id, scrap_invoice_number, payment_status, party_name, customer_phone, customer_address, user_id, user_name }: {
  tenant_id: string;
  scrap_invoice_number: string;
  payment_status: string;
  party_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  user_id?: string;
  user_name?: string;
}) {
  try {
    const db = getDb();
    if (!tenant_id || !scrap_invoice_number) return { success: false, error: 'tenant_id and scrap_invoice_number are required' };

    const result = db.transaction(() => {
      let existingEntry = scrapSql.findOnePartyLedgerByReferenceNumber(db).get(tenant_id, scrap_invoice_number) as PartyLedgerRow | null | undefined;

      const removeEntry = (entry: PartyLedgerRow) => {
        scrapSql.updatePartyLedgerIsDeleted(db).run(entry.ledger_id);
        recalcPartyBalances(db, entry.party_id as string);
      };

      if (payment_status !== 'CREDIT') {
        if (existingEntry) removeEntry(existingEntry);
        return { success: true, party_id: null };
      }

      const name = party_name ? String(party_name).trim() : '';
      if (!name) return { success: false, error: 'Party name is required for Credit payment' };

      const totalRow = scrapSql.findScrapTransactionsByScrapInvoiceNumberCOALESCESUMtotalAmountAndTotal(db).get(tenant_id, scrap_invoice_number) as ScrapTotalRow | undefined;
      const total = parseFloat(totalRow?.total as string) || 0;
      if (total <= 0) return { success: false, error: 'Invoice total is zero' };

      const phone = customer_phone ? String(customer_phone).trim() : '';
      const address = customer_address ? String(customer_address).trim() : null;

      let party: PartyRow | null = scrapSql.findPartiesByPhone(db).get(tenant_id, phone) as PartyRow | undefined || null;
      if (!party) {
        party = scrapSql.findPartiesByName(db).get(tenant_id, name) as PartyRow | undefined || null;
      }

      if (!party) {
        const partyId = crypto.randomUUID();
        scrapSql.insertParty(db).run(partyId, tenant_id, name, phone || null, address);
        party = { party_id: partyId };
      }

      const partyBal = scrapSql.findPartiesByPartyId(db).get(party.party_id) as PartyRow | undefined;
      const currentBalance = parseFloat(partyBal?.balance as string) || 0;
      const newBalance = currentBalance - total;

      // Party changed → move the entry to the new party
      if (existingEntry && existingEntry.party_id !== party.party_id) {
        removeEntry(existingEntry);
        existingEntry = null;
      }

      if (existingEntry) {
        // Same party → update in place (keeps ledger_id stable for sync)
        scrapSql.updatePartyLedgerByLedgerId(db).run(total, `Scrap purchase ${scrap_invoice_number} - ${name}`, user_id || null, user_name || null, existingEntry.ledger_id);
        const entries = scrapSql.findPartyLedgerByPartyId(db).all(party.party_id) as PartyLedgerRow[];
        let running = 0;
        for (const row of entries) {
          running += parseFloat(row.credit_amount as unknown as string) - parseFloat(row.debit_amount as unknown as string);
          scrapSql.updatePartyLedgerRunningBalance(db).run(running, row.ledger_id);
        }
        recalcPartyBalances(db, party.party_id);
      } else {
        const ledgerId = crypto.randomUUID();
        scrapSql.insertPartyLedger(db).run(
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
        scrapSql.updatePartyByPartyId(db)
          .run(newBalance, total, party.party_id);
      }

      return { success: true, party_id: party.party_id };
    })();
    return result;
  } catch (error) {
    console.error('[db:upsertScrapCreditLedger]', error);
    return { success: false, error: 'Operation failed' };
  }
}
