import crypto from 'node:crypto';
import { toIsoTimestamp } from '../utils/timestamps.js';

/** LAN host data merge: table metadata (cached per table) and the row upsert used by the LAN push endpoints. */
function parseCleanDate(dStr: any): string {
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

function extractItemId(item: any): string | null {
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

export function getTableMeta(db: any, tableName: string) {
  if (columnCache.has(tableName)) return columnCache.get(tableName)!;
  try {
    const columns = db.pragma(`table_info(${tableName})`) as { name: string; pk: number }[];
    if (!columns || columns.length === 0) return null;

    const allCols = columns.map(c => c.name);
    let pkCols = columns.filter(c => c.pk > 0).map(c => c.name);

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

export function upsertTableRows(db: any, tableName: string, items: any[]): string[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const meta = getTableMeta(db, tableName);
  if (!meta) return [];

  const { allCols, pkCols, updateCols } = meta;
  const syncedIds: string[] = [];

  let sql = `INSERT INTO ${tableName} (${allCols.join(', ')}) VALUES (${allCols.map(c => `@${c}`).join(', ')})`;
  if (tableName === 'product_pricing') {
    sql += ` ON CONFLICT(product_id, pricing_tier_id) DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`;
  } else if (pkCols.length > 0 && updateCols.length > 0) {
    sql += ` ON CONFLICT(${pkCols.join(', ')}) DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`;
  } else if (pkCols.length > 0) {
    sql += ` ON CONFLICT(${pkCols.join(', ')}) DO NOTHING`;
  }

  const stmt = db.prepare(sql);

  const tx = db.transaction((rows: any[]) => {
    for (const rawRow of rows) {
      if (!rawRow || typeof rawRow !== 'object') continue;

      const itemId = extractItemId(rawRow);
      const isNewInvoice = tableName === 'invoices' && itemId ? !db.prepare(`SELECT invoice_id FROM invoices WHERE invoice_id = ?`).get(itemId) : false;
      const isNewReturn = tableName === 'returns' && itemId ? !db.prepare(`SELECT return_id FROM returns WHERE return_id = ?`).get(itemId) : false;
      const isNewPurchaseBill = tableName === 'purchase_bills' && itemId ? !db.prepare(`SELECT purchase_bill_id FROM purchase_bills WHERE purchase_bill_id = ?`).get(itemId) : false;

      const paramObj: Record<string, any> = {};

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
        paramObj[col] = val !== undefined ? val : null;
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
        const existingDrawer = db.prepare(`
          SELECT drawer_id FROM cash_drawer
          WHERE drawer_id = ? OR ((tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ?))
          LIMIT 1
        `).get(rawRow.drawer_id, rawRow.tenant_id || 'global', txDate, altTxDate, txDate, `${txDate}%`) as any;
        if (existingDrawer && existingDrawer.drawer_id) {
          paramObj['drawer_id'] = existingDrawer.drawer_id;
        }
      }

      if (tableName === 'cash_drawer') {
        const cleanDate = parseCleanDate(rawRow.business_date);
        const parts = cleanDate.split('-');
        const altDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : cleanDate;
        const existingDrawer = db.prepare(`
          SELECT drawer_id, status, opening_balance, cash_sales, cash_in, cash_out, current_cash, sync_status FROM cash_drawer
          WHERE drawer_id = ? OR ((tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ?))
          ORDER BY (CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) DESC, created_at DESC LIMIT 1
        `).get(rawRow.drawer_id, rawRow.tenant_id || 'global', cleanDate, altDate, cleanDate, `${cleanDate}%`) as any;

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

          db.prepare(`
            UPDATE cash_drawer SET
              opening_balance = ?, cash_sales = ?, cash_in = ?, cash_out = ?,
              current_cash = ?, expected_closing = ?, actual_cash = ?,
              cash_short = ?, cash_excess = ?, closing_remarks = ?,
              status = ?, opened_by = COALESCE(opened_by, ?), closed_by = ?,
              opened_at = COALESCE(opened_at, ?), closed_at = ?,
              sync_status = 'SYNCED', updated_at = CURRENT_TIMESTAMP
            WHERE drawer_id = ?
          `).run(
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
              db.prepare(`UPDATE cash_transactions SET drawer_id = ? WHERE drawer_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).run(targetDrawerId, rawRow.drawer_id, rawRow.tenant_id || 'global');
              db.prepare(`UPDATE cashier_audit_log SET drawer_id = ? WHERE drawer_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).run(targetDrawerId, rawRow.drawer_id, rawRow.tenant_id || 'global');
            } catch {}
          }
          if (itemId) syncedIds.push(itemId);
          continue;
        }
      }

      if (tableName === 'pricing_tiers' && rawRow.name) {
        const cleanName = String(rawRow.name).trim();
        const existingTier = db.prepare(`
          SELECT pricing_tier_id FROM pricing_tiers
          WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
            AND LOWER(TRIM(name)) = LOWER(?)
          LIMIT 1
        `).get(rawRow.tenant_id || 'global', cleanName) as any;

        if (existingTier && existingTier.pricing_tier_id !== rawRow.pricing_tier_id) {
          try {
            db.prepare(`
              UPDATE pricing_tiers SET
                name = ?,
                is_active = ?,
                sort_order = ?,
                is_default = ?,
                is_deleted = ?,
                sync_status = 'PENDING',
                updated_at = CURRENT_TIMESTAMP
              WHERE pricing_tier_id = ?
            `).run(
              cleanName,
              rawRow.is_active ? 1 : 0,
              rawRow.sort_order ?? 0,
              rawRow.is_default ? 1 : 0,
              rawRow.is_deleted ? 1 : 0,
              existingTier.pricing_tier_id
            );
            try {
              db.prepare(`DELETE FROM product_pricing WHERE pricing_tier_id = ? AND product_id IN (SELECT product_id FROM product_pricing WHERE pricing_tier_id = ?)`).run(rawRow.pricing_tier_id, existingTier.pricing_tier_id);
              db.prepare(`UPDATE product_pricing SET pricing_tier_id = ? WHERE pricing_tier_id = ?`).run(existingTier.pricing_tier_id, rawRow.pricing_tier_id);
              db.prepare(`UPDATE parties SET pricing_tier_id = ? WHERE pricing_tier_id = ?`).run(existingTier.pricing_tier_id, rawRow.pricing_tier_id);
              db.prepare(`UPDATE customers SET pricing_tier_id = ? WHERE pricing_tier_id = ?`).run(existingTier.pricing_tier_id, rawRow.pricing_tier_id);
            } catch {}
            if (itemId) syncedIds.push(itemId);
            continue;
          } catch (e: any) {
            console.warn('[LocalHostServer] Error updating existing pricing tier by name:', e.message);
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
          } catch (runErr: any) {
            if (runErr.message?.includes('UNIQUE constraint failed: invoices.tenant_id, invoices.invoice_number') || runErr.message?.includes('UNIQUE constraint failed: invoices.invoice_number')) {
              const suffix = String(paramObj.invoice_id || Math.random().toString(36).substring(2, 6)).substring(0, 4).toUpperCase();
              paramObj.invoice_number = `${paramObj.invoice_number}-C${suffix}`;
              retryCount++;
            } else {
              console.warn(`[LocalHostServer] Error inserting row into ${tableName}:`, runErr.message);
              break;
            }
          }
        }
      } else {
        try {
          stmt.run(paramObj);
          if (itemId) syncedIds.push(itemId);
        } catch (runErr: any) {
          console.warn(`[LocalHostServer] Error inserting row into ${tableName}:`, runErr.message);
        }
      }

      if (tableName === 'invoices') {
        const isDeleted = rawRow.is_deleted === true || rawRow.is_deleted === 1 || rawRow.is_deleted === '1' || rawRow.is_deleted === 'true';
        const isConversionCopy = !!(rawRow.converted_from_invoice_id || rawRow.converted_from_invoice_number);

        if (Array.isArray(rawRow.items)) {
          try {
            db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(rawRow.invoice_id);
          } catch {}

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
                  db.prepare(`UPDATE products SET current_stock = current_stock - ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)`).run(Number(line.quantity), line.product_id);
                } catch {}
              }
            }
          }

          // Adjust cash drawer for cash payment on Master PC
          const pm = (rawRow.payment_method || '').toUpperCase();
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
            } catch {}
          }

          if (cashAmt > 0) {
            try {
              const todayDate = parseCleanDate(rawRow.created_at || null);
              const drawer = db.prepare(`
                SELECT drawer_id, opening_balance, cash_sales, cash_in, current_cash, expected_closing
                FROM cash_drawer
                WHERE status = 'OPEN' AND (business_date = ? OR business_date LIKE ?)
                ORDER BY created_at DESC LIMIT 1
              `).get(todayDate, `${todayDate}%`) as any;
              if (drawer) {
                const newSales = Number(drawer.cash_sales || 0) + cashAmt;
                const newCurrent = Number(drawer.current_cash || 0) + cashAmt;
                const newExp = Number(drawer.expected_closing || 0) + cashAmt;
                db.prepare(`
                  UPDATE cash_drawer SET cash_sales = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
                  WHERE drawer_id = ?
                `).run(newSales, newCurrent, newExp, drawer.drawer_id);
              }
            } catch (cdErr: any) {
              console.warn('[LocalHostServer] Could not update cash drawer for LAN invoice:', cdErr.message);
            }
          }
        } else if (!isNewInvoice && isDeleted && Array.isArray(rawRow.items)) {
          // Restore product stock if an invoice is deleted
          for (const line of rawRow.items) {
            if (line.product_id && Number(line.quantity) > 0) {
              try {
                db.prepare(`UPDATE products SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?`).run(Number(line.quantity), line.product_id);
              } catch {}
            }
          }
        }

        if (rawRow.scrap_invoice_number && Number(rawRow.scrap_deduction) > 0 && !isDeleted) {
          try {
            db.prepare(`UPDATE scrap_transactions SET payment_status = 'SETTLED', sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_invoice_number = ?`).run(rawRow.scrap_invoice_number);
          } catch {}
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
                db.prepare(`UPDATE products SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?`).run(Number(line.quantity), line.product_id);
              } catch {}
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
                db.prepare(`UPDATE products SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?`).run(Number(line.quantity), line.product_id);
              } catch {}
            }
          }
        }
      } else if (tableName === 'quotations' && Array.isArray(rawRow.items)) {
        db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(rawRow.quotation_id);
        for (const line of rawRow.items) {
          if (!line.quotation_id) line.quotation_id = rawRow.quotation_id;
          if (!line.tenant_id) line.tenant_id = rawRow.tenant_id || 'global';
        }
        upsertTableRows(db, 'quotation_items', rawRow.items);
      }
    }
  });

  tx(items);
  return syncedIds;
}
