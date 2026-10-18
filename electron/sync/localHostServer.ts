import http from 'node:http';
import crypto from 'node:crypto';
import { BrowserWindow } from 'electron';
import { getDb } from '../db/localDb.js';

function localTimestamp(d: Date | string | number = new Date()): string {
  const dateObj = d instanceof Date ? d : new Date(d);
  return isNaN(dateObj.getTime()) ? new Date().toISOString() : dateObj.toISOString();
}

function toNormalizedUtc(str: string | null | undefined): string | null {
  if (!str) return null;
  const clean = String(str).trim();
  if (!clean) return null;
  try {
    const d = new Date(clean.includes('Z') || clean.includes('+') ? clean : clean.replace(' ', 'T') + 'Z');
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    }
  } catch {}
  return clean.slice(0, 19).replace('T', ' ');
}

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

let server: http.Server | null = null;
let currentPort: number = 3888;

const ALLOWED_TABLES = new Set([
  'users', 'product_grades', 'products', 'invoices', 'invoice_items',
  'parties', 'party_ledger', 'settings', 'scrap_categories', 'scrap_transactions',
  'quotations', 'quotation_items', 'warranties', 'purchase_bills', 'cash_drawer',
  'cash_transactions', 'cashier_audit_log', 'cash_categories', 'purchase_bill_items',
  'returns', 'return_items', 'customers', 'loyalty_transactions', 'payment_sources',
  'payment_source_transactions', 'pricing_tiers', 'product_pricing', 'combo_offers',
  'combo_items', 'staff', 'staff_salaries', 'staff_transactions', 'staff_ledger', 'staff_attendance', 'sync_meta'
]);

function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    req.setEncoding('utf-8');
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: any) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Cache-Control',
    'Access-Control-Allow-Private-Network': 'true',
  });
  res.end(JSON.stringify(payload));
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

function getTableMeta(db: any, tableName: string) {
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

function upsertTableRows(db: any, tableName: string, items: any[]): string[] {
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
        paramObj['updated_at'] = localTimestamp();
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

export function startLocalHostServer(port: number = 3888) {
  if (server) {
    if (currentPort === port) return;
    stopLocalHostServer();
  }

  currentPort = port;
  server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Private-Network': 'true',
      });
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const pathname = url.pathname;

    try {
      // ── Health Endpoint ──────────────────────────────────────────────────
      if (pathname === '/health' || pathname === '/api/health') {
        return sendJson(res, 200, {
          status: 'ok',
          service: 'Vendora POS Local LAN Server',
          port,
          timestamp: new Date().toISOString(),
        });
      }

      const db = getDb();

      // ── Users / Staff Endpoint ──────────────────────────────────────────
      if (pathname === '/auth/staff' || pathname === '/api/sync/users') {
        if (req.method === 'GET') {
          const rows = db.prepare(`SELECT * FROM users`).all();
          return sendJson(res, 200, { users: rows });
        }
      }

      // ── Invoice & Return Sequence Number Endpoints for LAN ──────────────
      if (pathname === '/api/invoices/next-number' && req.method === 'GET') {
        const rawTerminalCode = url.searchParams.get('terminal_code') || 'POS1';
        const terminalCode = rawTerminalCode.trim().replace(/^["']|["']$/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'POS1';
        const series = url.searchParams.get('series') || undefined;
        const rawPrefix = url.searchParams.get('prefix');
        const prefix = rawPrefix
          ? rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20)
          : `${terminalCode}-`;

        // Key counter per terminal prefix & series to keep sequence counters isolated across computers
        const terminalCounterKey = `terminal_counter_${series || 'normal'}_${prefix}`;
        const row: any = db.prepare('SELECT value FROM settings WHERE key = ? LIMIT 1').get(terminalCounterKey);
        
        let counter = 1;
        if (row && row.value) {
          try {
            const parsed = JSON.parse(row.value);
            counter = typeof parsed.counter === 'number' && parsed.counter > 0 ? parsed.counter : 1;
          } catch {
            counter = 1;
          }
        } else {
          // Fallback to global configKey counter if no terminal-specific counter exists yet
          const configKey = series === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : series === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : series === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';
          const globalRow: any = db.prepare('SELECT value FROM settings WHERE key = ? LIMIT 1').get(configKey);
          if (globalRow && globalRow.value) {
            try {
              const gParsed = JSON.parse(globalRow.value);
              if (!gParsed.prefix || gParsed.prefix === prefix) {
                counter = typeof gParsed.counter === 'number' && gParsed.counter > 0 ? gParsed.counter : 1;
              }
            } catch {}
          }
        }

        const checkStmt = db.prepare('SELECT 1 FROM invoices WHERE invoice_number = ? LIMIT 1');
        let candidate = `${prefix}${String(counter).padStart(3, '0')}`;

        while (checkStmt.get(candidate)) {
          counter++;
          candidate = `${prefix}${String(counter).padStart(3, '0')}`;
        }

        const nextConfig = { prefix, counter: counter + 1 };
        db.prepare(`
          INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
          VALUES ('global', ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
          ON CONFLICT(tenant_id, key) DO UPDATE SET
            value = EXCLUDED.value,
            sync_status = 'LOCAL',
            updated_at = CURRENT_TIMESTAMP
        `).run(terminalCounterKey, JSON.stringify(nextConfig));

        return sendJson(res, 200, { invoiceNumber: candidate });
      }

      if (pathname === '/api/returns/next-number' && req.method === 'GET') {
        const reqPrefix = url.searchParams.get('prefix');
        const confRow: any = db.prepare('SELECT value FROM settings WHERE key = ? LIMIT 1').get('return_counter');
        let prefix = 'RTN-';
        let counter = 1;
        if (reqPrefix) {
          prefix = reqPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'RTN-';
        } else if (confRow && confRow.value) {
          try {
            const cfg = JSON.parse(confRow.value);
            prefix = cfg.prefix && /[A-Z0-9]/i.test(cfg.prefix) ? cfg.prefix : 'RTN-';
            counter = typeof cfg.counter === 'number' ? cfg.counter : 1;
          } catch {}
        }
        const checkReturnStmt = db.prepare('SELECT 1 FROM returns WHERE return_number = ? LIMIT 1');
        let candidate = `${prefix}${String(counter).padStart(3, '0')}`;
        while (checkReturnStmt.get(candidate)) {
          counter++;
          candidate = `${prefix}${String(counter).padStart(3, '0')}`;
        }
        const nextConfig = { prefix, counter: counter + 1 };
        db.prepare(`
          INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
          VALUES ('global', 'return_counter', ?, 'LOCAL', CURRENT_TIMESTAMP)
          ON CONFLICT(tenant_id, key) DO UPDATE SET
            value = EXCLUDED.value,
            sync_status = 'LOCAL',
            updated_at = CURRENT_TIMESTAMP
        `).run(JSON.stringify(nextConfig));

        return sendJson(res, 200, { returnNumber: candidate });
      }

      // ── Ultra-Fast Sync Status Check for LAN ──────────────────────────────
      if (pathname === '/api/sync/check-status' && req.method === 'GET') {
        const rawSince = url.searchParams.get('since');
        const checkTables = [
          'product_grades', 'pricing_tiers', 'product_pricing', 'products',
          'parties', 'party_ledger', 'customers', 'loyalty_transactions', 'scrap_categories',
          'scrap_transactions', 'purchase_bills', 'cash_drawer', 'cash_transactions',
          'cashier_audit_log', 'cash_categories', 'returns', 'payment_sources',
          'payment_source_transactions', 'combo_offers', 'quotations', 'invoices', 'users'
        ];

        let maxUpdatedAt: string | null = null;
        for (const t of checkTables) {
          try {
            const meta = getTableMeta(db, t);
            if (!meta) continue;
            const tsCol = meta.allCols.includes('updated_at') ? 'updated_at' : (meta.allCols.includes('created_at') ? 'created_at' : null);
            if (!tsCol) continue;
            const row: any = db.prepare(`SELECT MAX(${tsCol}) as max_ts FROM ${t}`).get();
            if (row && row.max_ts) {
              const rowTs = String(row.max_ts).trim();
              if (!maxUpdatedAt || rowTs > maxUpdatedAt) {
                maxUpdatedAt = rowTs;
              }
            }
          } catch {}
        }

        let hasChanges = true;
        if (rawSince && maxUpdatedAt) {
          const sinceUtc = toNormalizedUtc(rawSince);
          const maxUtc = toNormalizedUtc(maxUpdatedAt);
          if (sinceUtc && maxUtc) {
            hasChanges = maxUtc > sinceUtc;
          }
        }

        return sendJson(res, 200, {
          success: true,
          hasChanges,
          maxUpdatedAt: maxUpdatedAt ? new Date(maxUpdatedAt).toISOString() : new Date().toISOString(),
          since: rawSince
        });
      }

      // ── Unified Delta Pull for LAN (1 Request for All Tables) ─────────────
      if (pathname === '/api/sync/delta-pull' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const sinceMap: Record<string, string | null> = body.since || {};
        const resultData: Record<string, any[]> = {};

        const fetchDeltaRows = (tName: string, tsCol = 'updated_at', customWhere = '', attachItems = false) => {
          const rawSince = sinceMap[tName];
          let q = `SELECT * FROM ${tName}`;
          const whereParts: string[] = [];
          const qParams: any[] = [];

          if (customWhere) {
            whereParts.push(customWhere);
          }

          if (rawSince) {
            const cleanUtc = toNormalizedUtc(rawSince);
            if (cleanUtc) {
              whereParts.push(`replace(substr(${tsCol}, 1, 19), 'T', ' ') > ?`);
              qParams.push(cleanUtc);
            }
          }

          if (whereParts.length > 0) {
            q += ` WHERE ${whereParts.join(' AND ')}`;
          }

          q += ` ORDER BY ${tsCol} DESC LIMIT 2000`;

          try {
            const rows = db.prepare(q).all(...qParams) as any[];
            if (attachItems && rows.length > 0) {
              if (tName === 'invoices') {
                for (const inv of rows) {
                  inv.items = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ?`).all(inv.invoice_id);
                }
              } else if (tName === 'purchase_bills') {
                for (const bill of rows) {
                  bill.items = db.prepare(`SELECT * FROM purchase_bill_items WHERE purchase_bill_id = ?`).all(bill.purchase_bill_id);
                }
              } else if (tName === 'returns') {
                for (const ret of rows) {
                  ret.items = db.prepare(`SELECT * FROM return_items WHERE return_id = ?`).all(ret.return_id);
                }
              } else if (tName === 'quotations') {
                for (const qu of rows) {
                  qu.items = db.prepare(`SELECT * FROM quotation_items WHERE quotation_id = ?`).all(qu.quotation_id);
                }
              }
            }
            return rows;
          } catch (err: any) {
            console.error(`[LocalHostServer] Delta-pull error for ${tName}:`, err.message);
            return [];
          }
        };

        resultData.product_grades = fetchDeltaRows('product_grades', 'updated_at');
        resultData.pricing_tiers = fetchDeltaRows('pricing_tiers', 'updated_at');
        resultData.product_pricing = fetchDeltaRows('product_pricing', 'updated_at');
        resultData.products = fetchDeltaRows('products', 'updated_at');
        resultData.settings = fetchDeltaRows('settings', 'updated_at', `key NOT IN ('terminal_code', 'invoice_counter_config', 'gst_b2b_invoice_counter_config', 'gst_b2c_invoice_counter_config', 'gst_invoice_counter_config', 'return_counter', 'scrap_invoice_counter', 'quotation_counter', 'barcode_printer_config', 'receipt_printer_config', 'a4_printer_config', 'scale_config', 'printer_config', 'network_sync_config', 'auto_print_barcode', 'print_format', 'label_code_type', 'label_show_shop_name')`);
        resultData.parties = fetchDeltaRows('parties', 'updated_at');
        resultData.party_ledger = fetchDeltaRows('party_ledger', 'created_at');
        resultData.customers = fetchDeltaRows('customers', 'updated_at');
        resultData.loyalty_transactions = fetchDeltaRows('loyalty_transactions', 'created_at');
        resultData.scrap_categories = fetchDeltaRows('scrap_categories', 'updated_at');
        resultData.scrap_transactions = fetchDeltaRows('scrap_transactions', 'created_at');
        resultData.purchase_bills = fetchDeltaRows('purchase_bills', 'updated_at', '', true);
        resultData.cash_drawer = fetchDeltaRows('cash_drawer', 'updated_at');
        resultData.cash_transactions = fetchDeltaRows('cash_transactions', 'created_at');
        resultData.cashier_audit_log = fetchDeltaRows('cashier_audit_log', 'created_at');
        resultData.cash_categories = fetchDeltaRows('cash_categories', 'updated_at');
        resultData.returns = fetchDeltaRows('returns', 'created_at', '', true);
        resultData.payment_sources = fetchDeltaRows('payment_sources', 'updated_at');
        resultData.payment_source_transactions = fetchDeltaRows('payment_source_transactions', 'created_at');
        resultData.combo_offers = fetchDeltaRows('combo_offers', 'updated_at');
        resultData.quotations = fetchDeltaRows('quotations', 'updated_at', '', true);
        resultData.invoices = fetchDeltaRows('invoices', 'created_at', `invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD')`, true);

        return sendJson(res, 200, { success: true, data: resultData });
      }

      // ── Lightweight Pending Bills for Cash Settlement ─────────────────────
      if (pathname === '/api/sync/pending-bills-lightweight' && req.method === 'GET') {
        const rawSince = url.searchParams.get('since');
        const lastId = url.searchParams.get('last_id');
        let q = `
          SELECT invoice_id, tenant_id, invoice_number, customer_name, grand_total, payment_method, user_id, created_at, updated_at
          FROM invoices
          WHERE payment_method = 'PENDING'
            AND (is_deleted IS NULL OR is_deleted = 0)
        `;
        const qParams: any[] = [];
        if (rawSince) {
          const sinceUtc = toNormalizedUtc(rawSince);
          if (sinceUtc) {
            if (lastId) {
              q += ` AND (replace(substr(created_at, 1, 19), 'T', ' ') > ? OR (replace(substr(created_at, 1, 19), 'T', ' ') = ? AND invoice_id > ?))`;
              qParams.push(sinceUtc, sinceUtc, lastId);
            } else {
              q += ` AND (replace(substr(created_at, 1, 19), 'T', ' ') > ?)`;
              qParams.push(sinceUtc);
            }
          }
        }
        q += ` ORDER BY created_at ASC, invoice_id ASC LIMIT 50`;
        const rows = db.prepare(q).all(...qParams) as any[];
        return sendJson(res, 200, { success: true, count: rows.length, bills: rows });
      }

      // ── Generic & Explicit Sync Endpoints for LAN ────────────────────────
      if (pathname.startsWith('/api/sync/')) {
        const endpointName = pathname.replace('/api/sync/', '');
        const tableName = endpointName.replace(/-/g, '_');

        if (!ALLOWED_TABLES.has(tableName)) {
          return sendJson(res, 400, { error: `Invalid sync endpoint: ${endpointName}` });
        }

        if (req.method === 'POST') {
          const body = await parseJsonBody(req);
          const key = body[endpointName] ? endpointName : (body[tableName] ? tableName : Object.keys(body)[0]);
          let items = Array.isArray(body[key]) ? body[key] : (Array.isArray(body) ? body : []);
          if (tableName === 'settings') {
            const localDeviceKeys = [
              'terminal_code', 'invoice_counter_config', 'gst_b2b_invoice_counter_config', 'gst_b2c_invoice_counter_config',
              'gst_invoice_counter_config', 'return_counter', 'scrap_invoice_counter', 'quotation_counter',
              'barcode_printer_config', 'receipt_printer_config', 'a4_printer_config', 'scale_config', 'printer_config', 'network_sync_config',
              'auto_print_barcode', 'print_format', 'label_code_type', 'label_show_shop_name'
            ];
            items = items.filter((i: any) => !localDeviceKeys.includes(i.key));
          }
          const synced = upsertTableRows(db, tableName, items);
          if (synced && synced.length > 0) {
            try {
              const win = BrowserWindow.getAllWindows()[0];
              if (win && !win.isDestroyed()) {
                win.webContents.send('sync:data-updated');
              }
            } catch {}
          }
          return sendJson(res, 200, { synced, synced_count: synced.length, failed_count: 0 });
        }

        if (req.method === 'GET') {
          const rawSince = url.searchParams.get('since');
          const meta = getTableMeta(db, tableName);
          let query = `SELECT * FROM ${tableName}`;
          const params: any[] = [];
          const whereClauses: string[] = [];

          if (tableName === 'invoices') {
            whereClauses.push(`invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD')`);
          } else if (tableName === 'settings') {
            const excludedKeys = [
              'terminal_code', 'invoice_counter_config', 'gst_b2b_invoice_counter_config', 'gst_b2c_invoice_counter_config',
              'gst_invoice_counter_config', 'return_counter', 'scrap_invoice_counter', 'quotation_counter',
              'barcode_printer_config', 'receipt_printer_config', 'a4_printer_config', 'scale_config', 'printer_config', 'network_sync_config',
              'auto_print_barcode', 'print_format', 'label_code_type', 'label_show_shop_name'
            ];
            const placeholders = excludedKeys.map(() => '?').join(',');
            whereClauses.push(`key NOT IN (${placeholders})`);
            params.push(...excludedKeys);
          }

          if (rawSince && meta) {
            const cleanUtc = toNormalizedUtc(rawSince);
            if (cleanUtc) {
              const hasUpdated = meta.allCols.includes('updated_at');
              const hasCreated = meta.allCols.includes('created_at');
              if (hasUpdated && hasCreated) {
                whereClauses.push(`(replace(substr(updated_at, 1, 19), 'T', ' ') > ? OR replace(substr(created_at, 1, 19), 'T', ' ') > ?)`);
                params.push(cleanUtc, cleanUtc);
              } else if (hasUpdated) {
                whereClauses.push(`replace(substr(updated_at, 1, 19), 'T', ' ') > ?`);
                params.push(cleanUtc);
              } else if (hasCreated) {
                whereClauses.push(`replace(substr(created_at, 1, 19), 'T', ' ') > ?`);
                params.push(cleanUtc);
              }
            }
          }

          if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
          }

          const orderCol = meta?.allCols.includes('created_at') ? 'created_at' : (meta?.allCols.includes('updated_at') ? 'updated_at' : null);
          if (orderCol) {
            query += ` ORDER BY ${orderCol} DESC`;
          }
          const rawLimit = Number(url.searchParams.get('limit'));
          const limit = !isNaN(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 2000) : 500;
          const rawOffset = Number(url.searchParams.get('offset'));
          const offset = !isNaN(rawOffset) && rawOffset > 0 ? rawOffset : 0;
          query += ` LIMIT ${limit} OFFSET ${offset}`;

          try {
            const rows = db.prepare(query).all(...params) as any[];

            // Attach nested items for header-detail records
            if (tableName === 'invoices') {
              for (const inv of rows) {
                inv.items = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ?`).all(inv.invoice_id);
              }
            } else if (tableName === 'purchase_bills') {
              for (const bill of rows) {
                bill.items = db.prepare(`SELECT * FROM purchase_bill_items WHERE purchase_bill_id = ?`).all(bill.purchase_bill_id);
              }
            } else if (tableName === 'returns') {
              for (const ret of rows) {
                ret.items = db.prepare(`SELECT * FROM return_items WHERE return_id = ?`).all(ret.return_id);
              }
            } else if (tableName === 'quotations') {
              for (const q of rows) {
                q.items = db.prepare(`SELECT * FROM quotation_items WHERE quotation_id = ?`).all(q.quotation_id);
              }
            }

            return sendJson(res, 200, { [endpointName]: rows, [tableName]: rows, data: rows });
          } catch (err: any) {
            console.error(`[LocalHostServer] Error querying ${tableName} (${endpointName}):`, err.message);
            return sendJson(res, 200, { [endpointName]: [], [tableName]: [], data: [] });
          }
        }
      }

      return sendJson(res, 200, { status: 'ok', synced: [], synced_count: 0, failed_count: 0 });
    } catch (err: any) {
      console.error('[LocalHostServer] Request error:', err.message);
      return sendJson(res, 500, { error: err.message });
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[LocalHostServer] [${localTimestamp()}] [Local LAN Host] Server active and listening on http://0.0.0.0:${port}`);
  });

  server.on('error', (err: any) => {
    console.error(`[LocalHostServer] [${localTimestamp()}] [Local LAN Host] Server error:`, err.message);
    if (server) {
      try { server.close(); } catch {}
      server = null;
    }
  });
}

export function stopLocalHostServer() {
  if (server) {
    server.close();
    server = null;
    console.log(`[LocalHostServer] [${localTimestamp()}] [Local LAN Host] Server stopped.`);
  }
}
