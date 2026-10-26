import crypto from 'node:crypto';
import { toIsoTimestamp } from '../utils/timestamps.js';
import * as lanUpsertSql from '../db/statements/sync/lanUpsert.js';
import { withSyncApplyGuard } from '../db/statements/outbox.js';

/** LAN host data merge: table metadata (cached per table) and the row upsert used by the LAN push endpoints. */
function parseCleanDate(dStr: unknown): string {
  if (!dStr) {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  const str = String(dStr).trim();

  // 1. Match YYYY-MM-DD or YYYY/MM/DD at start
  const yyyymmdd = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (yyyymmdd) {
    return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;
  }

  // 2. Match DD-MM-YYYY or DD/MM/YYYY at start
  const ddmmyyyy = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }

  let isoStr = str;
  if (!isoStr.includes('Z') && !isoStr.includes('+') && !/-\d{2}:\d{2}$/.test(isoStr)) {
    if (isoStr.includes(' ')) isoStr = isoStr.replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(isoStr)) isoStr += 'Z';
  }

  const d = new Date(isoStr);
  if (!isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  return str.slice(0, 10);
}

function extractItemId(item: Record<string, unknown>): string | null {
  if (!item || typeof item !== 'object') return null;
  if (item.item_id) return String(item.item_id);
  if (item.transaction_id) return String(item.transaction_id);
  if (item.audit_id) return String(item.audit_id);
  if (item.invoice_id) return String(item.invoice_id);
  if (item.party_id) return String(item.party_id);
  if (item.product_id) return String(item.product_id);
  if (item.user_id) return String(item.user_id);
  if (item.drawer_id) return String(item.drawer_id);
  if (item.category_id) return String(item.category_id);
  if (item.customer_id) return String(item.customer_id);
  if (item.source_id) return String(item.source_id);
  if (item.purchase_bill_id) return String(item.purchase_bill_id);
  if (item.return_id) return String(item.return_id);
  if (item.quotation_id) return String(item.quotation_id);
  if (item.warranty_id) return String(item.warranty_id);
  if (item.combo_id) return String(item.combo_id);
  if (item.grade_id) return String(item.grade_id);
  if (item.tier_id || item.pricing_tier_id) return String(item.tier_id || item.pricing_tier_id);
  if (item.pricing_id || item.product_pricing_id) return String(item.pricing_id || item.product_pricing_id);
  if (item.ledger_id) return String(item.ledger_id);
  if (item.scrap_category_id) return String(item.scrap_category_id);
  if (item.key) return String(item.key);
  if (item.id) return String(item.id);

  for (const k of Object.keys(item)) {
    if (k.endsWith('_id') && item[k] != null) {
      return String(item[k]);
    }
  }
  return null;
}

const columnCache = new Map<string, { allCols: string[]; pkCols: string[]; updateCols: string[] }>();

export function getTableMeta(db: import('better-sqlite3').Database, tableName: string) {
  if (columnCache.has(tableName)) return columnCache.get(tableName)!;
  try {
    const columns = db.pragma(`table_info(${tableName})`) as { name: string; pk: number }[];
    if (!columns || columns.length === 0) return null;

    const allCols = columns.map(c => (c as { name: string }).name);
    let pkCols = columns.filter(c => c.pk > 0).map(c => (c as { name: string }).name);

    if (pkCols.length === 0) {
      for (const col of allCols) {
        if (col === 'id' || col === 'key' || col.endsWith('_id')) {
          pkCols = [col];
          break;
        }
      }
    }

    const updateCols = allCols.filter(c => !pkCols.includes(c));
    const meta = { allCols, pkCols, updateCols };
    columnCache.set(tableName, meta);
    return meta;
  } catch {
    return null;
  }
}

export function upsertTableRows(db: import('better-sqlite3').Database, tableName: string, items: Record<string, unknown>[]): string[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const meta = getTableMeta(db, tableName);
  if (!meta) return [];

  const { allCols, pkCols, updateCols } = meta;
  const syncedIds: string[] = [];

  const stmt = lanUpsertSql.upsertRows(db, tableName, allCols, pkCols, updateCols);

  const tx = db.transaction((rows: Record<string, unknown>[]) => {
    for (const rawRow of rows) {
      if (!rawRow || typeof rawRow !== 'object') continue;

      const itemId = extractItemId(rawRow);
      const isNewInvoice = tableName === 'invoices' && itemId ? !lanUpsertSql.selectInvoices(db).get(itemId) : false;
      const isNewReturn = tableName === 'returns' && itemId ? !lanUpsertSql.selectReturns(db).get(itemId) : false;
      const isNewPurchaseBill = tableName === 'purchase_bills' && itemId ? !lanUpsertSql.selectPurchaseBills(db).get(itemId) : false;

      const paramObj: Record<string, unknown> = {};

      for (const col of allCols) {
        let val = rawRow[col];
        if (typeof val === 'boolean') {
          val = val ? 1 : 0;
        } else if (typeof val === 'object' && val !== null) {
          val = JSON.stringify(val);
        }
        if (col === 'split_details' && (val === 'null' || val === 'undefined' || val === '')) {
          val = null;
        }
        paramObj[col] = val !== undefined ? val : (col === 'row_version' ? 0 : null);
      }

      if (allCols.includes('sync_status')) {
        paramObj['sync_status'] = rawRow.sync_status || 'PENDING';
      }

      if (allCols.includes('updated_at')) {
        paramObj['updated_at'] = toIsoTimestamp();
      }

      if (tableName === 'cash_transactions' && rawRow.drawer_id) {
        const txDate = rawRow.transaction_date ? parseCleanDate(rawRow.transaction_date) : parseCleanDate(null);
        const parts = txDate.split('-');
        const altTxDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : txDate;
        const existingDrawer = lanUpsertSql.selectCashDrawer(db).get(rawRow.drawer_id, rawRow.tenant_id || 'global', txDate, altTxDate, txDate, `${txDate}%`) as Record<string, unknown>;
        if (existingDrawer && existingDrawer.drawer_id) {
          paramObj['drawer_id'] = existingDrawer.drawer_id;
        }
      }

      if (tableName === 'cash_drawer') {
        const cleanDate = parseCleanDate(rawRow.business_date);
        const parts = cleanDate.split('-');
        const altDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : cleanDate;
        const existingDrawer = lanUpsertSql.selectCashDrawer2(db).get(rawRow.drawer_id, rawRow.tenant_id || 'global', cleanDate, altDate, cleanDate, `${cleanDate}%`) as Record<string, unknown>;

        if (existingDrawer) {
          const targetDrawerId = existingDrawer.drawer_id;
          const localSales = Number(existingDrawer.cash_sales) || 0;
          const localCurrent = Number(existingDrawer.current_cash) || 0;
          let newSales = Number(rawRow.cash_sales || 0);
          let newCurrent = Number(rawRow.current_cash || 0);

          if (existingDrawer.status === 'OPEN' || existingDrawer.sync_status === 'PENDING' || localSales > newSales || localCurrent > newCurrent) {
            newSales = Math.max(newSales, localSales);
            newCurrent = Math.max(newCurrent, localCurrent);
          }

          lanUpsertSql.updateCashDrawer(db).run(
            Number(rawRow.opening_balance || 0), newSales,
            Number(rawRow.cash_in || 0), Number(rawRow.cash_out || 0),
            newCurrent, Math.max(Number(rawRow.expected_closing || 0), newCurrent),
            rawRow.actual_cash != null ? Number(rawRow.actual_cash) : null,
            Number(rawRow.cash_short || 0), Number(rawRow.cash_excess || 0),
            rawRow.closing_remarks || null, rawRow.status || 'OPEN',
            rawRow.opened_by || null, rawRow.closed_by || null,
            rawRow.opened_at || null, rawRow.closed_at || null,
            targetDrawerId
          );
          if (targetDrawerId !== rawRow.drawer_id) {
            try {
              lanUpsertSql.updateCashTransactions(db).run(targetDrawerId, rawRow.drawer_id, rawRow.tenant_id || 'global');
              lanUpsertSql.updateCashierAuditLog(db).run(targetDrawerId, rawRow.drawer_id, rawRow.tenant_id || 'global');
            } catch { /* ignore */ }
          }
          if (itemId) syncedIds.push(itemId);
          continue;
        }
      }

      if (tableName === 'pricing_tiers' && rawRow.name) {
        const cleanName = String(rawRow.name).trim();
        const existingTier = lanUpsertSql.selectPricingTiers(db).get(rawRow.tenant_id || 'global', cleanName) as Record<string, unknown>;

        if (existingTier && existingTier.pricing_tier_id !== rawRow.pricing_tier_id) {
          try {
            lanUpsertSql.updatePricingTiers(db).run(
              cleanName,
              rawRow.is_active ? 1 : 0,
              rawRow.sort_order ?? 0,
              rawRow.is_default ? 1 : 0,
              rawRow.is_deleted ? 1 : 0,
              existingTier.pricing_tier_id
            );
            try {
              lanUpsertSql.deleteProductPricing(db).run(rawRow.pricing_tier_id, existingTier.pricing_tier_id);
              lanUpsertSql.updateProductPricing(db).run(existingTier.pricing_tier_id, rawRow.pricing_tier_id);
              lanUpsertSql.updateParties(db).run(existingTier.pricing_tier_id, rawRow.pricing_tier_id);
              lanUpsertSql.updateCustomers(db).run(existingTier.pricing_tier_id, rawRow.pricing_tier_id);
            } catch { /* ignore */ }
            if (itemId) syncedIds.push(itemId);
            continue;
          } catch (e) {
            console.warn('[LocalHostServer] Error updating existing pricing tier by name:', (e as Error).message);
          }
        }
      }

      if (tableName === 'invoices') {
        let retryCount = 0;
        let success = false;
        while (retryCount < 3 && !success) {
          try {
            stmt.run(paramObj);
            if (itemId) syncedIds.push(itemId);
            success = true;
          } catch (runErr) {
            if ((runErr as Error).message?.includes('UNIQUE constraint failed: invoices.tenant_id, invoices.invoice_number') || (runErr as Error).message?.includes('UNIQUE constraint failed: invoices.invoice_number')) {
              const suffix = String(paramObj.invoice_id || Math.random().toString(36).substring(2, 6)).substring(0, 4).toUpperCase();
              paramObj.invoice_number = `${paramObj.invoice_number}-C${suffix}`;
              retryCount++;
            } else {
              console.warn(`[LocalHostServer] Error inserting row into ${tableName}:`, (runErr as Error).message);
              break;
            }
          }
        }
      } else {
        try {
          stmt.run(paramObj);
          if (itemId) syncedIds.push(itemId);
        } catch (runErr) {
          console.warn(`[LocalHostServer] Error inserting row into ${tableName}:`, (runErr as Error).message);
        }
      }

      if (tableName === 'invoices') {
        const isDeleted = rawRow.is_deleted === true || rawRow.is_deleted === 1 || rawRow.is_deleted === '1' || rawRow.is_deleted === 'true';
        const isConversionCopy = !!(rawRow.converted_from_invoice_id || rawRow.converted_from_invoice_number);

        if (Array.isArray(rawRow.items)) {
          try {
            lanUpsertSql.deleteInvoiceItems(db).run(rawRow.invoice_id);
          } catch { /* ignore */ }

          for (const line of rawRow.items) {
            if (!line.invoice_id) line.invoice_id = rawRow.invoice_id;
            if (!line.tenant_id) line.tenant_id = rawRow.tenant_id || 'global';
            if (!line.item_id) line.item_id = crypto.randomUUID();
          }
          upsertTableRows(db, 'invoice_items', rawRow.items);
        }

        if (isNewInvoice && !isDeleted && !isConversionCopy) {
          if (Array.isArray(rawRow.items)) {
            for (const line of rawRow.items) {
              if (line.product_id && Number(line.quantity) > 0 && !line.is_service_item) {
                try {
                  lanUpsertSql.updateProducts(db).run(Number(line.quantity), line.product_id);
                } catch { /* ignore */ }
              }
            }
          }

          // Adjust cash drawer for cash payment on Master PC
          const pm = ((rawRow.payment_method as string) || ('' as string)).toUpperCase();
          const grand = Math.max(0, Number(rawRow.grand_total) || 0);
          const retD = Math.max(0, Number(rawRow.return_deduction) || 0);
          const scrapD = Math.max(0, Number(rawRow.scrap_deduction) || 0);
          const netPayable = Math.max(0, grand - retD - scrapD);
          let cashAmt = 0;
          if (pm === 'CASH') {
            const rec = Number(rawRow.received_amount);
            cashAmt = rec > 0 && rec < netPayable ? rec : netPayable;
          } else if (pm === 'SPLIT' && rawRow.split_details) {
            try {
              const sd = typeof rawRow.split_details === 'string' ? JSON.parse(rawRow.split_details) : rawRow.split_details;
              cashAmt = Math.max(0, Number(sd?.cash) || 0);
            } catch { /* ignore */ }
          }

          if (cashAmt > 0) {
            try {
              const todayDate = parseCleanDate((rawRow.created_at as Record<string, unknown>) || null);
              const drawer = lanUpsertSql.selectCashDrawer3(db).get(todayDate, `${todayDate}%`) as Record<string, unknown>;
              if (drawer) {
                const newSales = Number(drawer.cash_sales || 0) + cashAmt;
                const newCurrent = Number(drawer.current_cash || 0) + cashAmt;
                const newExp = Number(drawer.expected_closing || 0) + cashAmt;
                lanUpsertSql.updateCashDrawer2(db).run(newSales, newCurrent, newExp, drawer.drawer_id);
              }
            } catch (cdErr) {
              console.warn('[LocalHostServer] Could not update cash drawer for LAN invoice:', (cdErr as Error).message);
            }
          }
        } else if (!isNewInvoice && isDeleted && Array.isArray(rawRow.items)) {
          // Restore product stock if an invoice is deleted
          for (const line of rawRow.items) {
            if (line.product_id && Number(line.quantity) > 0) {
              try {
                lanUpsertSql.updateProducts2(db).run(Number(line.quantity), line.product_id);
              } catch { /* ignore */ }
            }
          }
        }

        if (rawRow.scrap_invoice_number && Number(rawRow.scrap_deduction) > 0 && !isDeleted) {
          try {
            lanUpsertSql.updateScrapTransactions(db).run(rawRow.scrap_invoice_number);
          } catch { /* ignore */ }
        }
      } else if (tableName === 'purchase_bills' && Array.isArray(rawRow.items)) {
        for (const line of rawRow.items) {
          if (!line.purchase_bill_id) line.purchase_bill_id = rawRow.purchase_bill_id;
          if (!line.tenant_id) line.tenant_id = rawRow.tenant_id || 'global';
        }
        upsertTableRows(db, 'purchase_bill_items', rawRow.items);
        if (isNewPurchaseBill) {
          for (const line of rawRow.items) {
            if (line.product_id && Number(line.quantity) > 0) {
              try {
                lanUpsertSql.updateProducts2(db).run(Number(line.quantity), line.product_id);
              } catch { /* ignore */ }
            }
          }
        }
      } else if (tableName === 'returns' && Array.isArray(rawRow.items)) {
        for (const line of rawRow.items) {
          if (!line.return_id) line.return_id = rawRow.return_id;
          if (!line.tenant_id) line.tenant_id = rawRow.tenant_id || 'global';
        }
        upsertTableRows(db, 'return_items', rawRow.items);
        if (isNewReturn) {
          for (const line of rawRow.items) {
            if (line.product_id && Number(line.quantity) > 0) {
              try {
                lanUpsertSql.updateProducts2(db).run(Number(line.quantity), line.product_id);
              } catch { /* ignore */ }
            }
          }
        }
      } else if (tableName === 'quotations' && Array.isArray(rawRow.items)) {
        lanUpsertSql.deleteQuotationItems(db).run(rawRow.quotation_id);
        for (const line of rawRow.items) {
          if (!line.quotation_id) line.quotation_id = rawRow.quotation_id;
          if (!line.tenant_id) line.tenant_id = rawRow.tenant_id || 'global';
        }
        upsertTableRows(db, 'quotation_items', rawRow.items);
      }
    }
  });

  withSyncApplyGuard(db, () => tx(items));
  return syncedIds;
}
