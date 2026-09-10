import http from 'node:http';
import { getDb } from '../db/localDb.js';

function localTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
  'combo_items', 'sync_meta'
]);

function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Private-Network': 'true',
  });
  res.end(JSON.stringify(payload));
}

function extractItemId(item: any): string | null {
  if (!item || typeof item !== 'object') return null;
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
  if (item.item_id) return String(item.item_id);
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
  if (pkCols.length > 0 && updateCols.length > 0) {
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
        paramObj[col] = val !== undefined ? val : null;
      }

      if (allCols.includes('sync_status')) {
        paramObj['sync_status'] = rawRow.sync_status || 'PENDING';
      }

      stmt.run(paramObj);
      if (itemId) syncedIds.push(itemId);

      if (tableName === 'invoices' && Array.isArray(rawRow.items)) {
        upsertTableRows(db, 'invoice_items', rawRow.items);
        const isDeleted = rawRow.is_deleted === true || rawRow.is_deleted === 1 || rawRow.is_deleted === '1' || rawRow.is_deleted === 'true';
        const isConversionCopy = !!(rawRow.converted_from_invoice_id || rawRow.converted_from_invoice_number);

        if (isNewInvoice && !isDeleted && !isConversionCopy) {
          for (const line of rawRow.items) {
            if (line.product_id && Number(line.quantity) > 0 && !line.is_service_item) {
              try {
                db.prepare(`UPDATE products SET current_stock = current_stock - ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)`).run(Number(line.quantity), line.product_id);
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

    const url = new URL(req.url || '/', `http://localhost:${port}`);
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
              'barcode_printer_config', 'receipt_printer_config', 'a4_printer_config', 'scale_config', 'printer_config', 'network_sync_config'
            ];
            items = items.filter((i: any) => !localDeviceKeys.includes(i.key));
          }
          const synced = upsertTableRows(db, tableName, items);
          return sendJson(res, 200, { synced, synced_count: synced.length, failed_count: 0 });
        }

        if (req.method === 'GET') {
          const rawSince = url.searchParams.get('since');
          const meta = getTableMeta(db, tableName);
          let query = `SELECT * FROM ${tableName}`;
          const params: any[] = [];

          let sinceLocal: string | null = null;
          let sinceIso: string | null = null;
          if (rawSince) {
            sinceIso = rawSince;
            try {
              const d = new Date(rawSince.includes('Z') || rawSince.includes('+') ? rawSince : rawSince.replace(' ', 'T') + 'Z');
              if (!isNaN(d.getTime())) {
                const pad = (n: number) => String(n).padStart(2, '0');
                sinceLocal = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
              } else {
                sinceLocal = rawSince.replace('T', ' ').replace('Z', '').split('.')[0];
              }
            } catch {
              sinceLocal = rawSince.replace('T', ' ').replace('Z', '').split('.')[0];
            }
          }

          if (tableName === 'invoices') {
            query += ` WHERE invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD')`;
            if (sinceLocal && sinceIso) {
              query += ` AND (updated_at > ? OR updated_at > ? OR created_at > ? OR created_at > ?)`;
              params.push(sinceLocal, sinceIso, sinceLocal, sinceIso);
            }
          } else if (tableName === 'products') {
            query += ` WHERE is_deleted = 0`;
            if (sinceLocal && sinceIso && meta?.allCols.includes('updated_at')) {
              query += ` AND (updated_at > ? OR updated_at > ?)`;
              params.push(sinceLocal, sinceIso);
            }
          } else if (tableName === 'settings') {
            const excludedKeys = [
              'terminal_code', 'invoice_counter_config', 'gst_b2b_invoice_counter_config', 'gst_b2c_invoice_counter_config',
              'gst_invoice_counter_config', 'return_counter', 'scrap_invoice_counter', 'quotation_counter',
              'barcode_printer_config', 'receipt_printer_config', 'a4_printer_config', 'scale_config', 'printer_config', 'network_sync_config'
            ];
            const placeholders = excludedKeys.map(() => '?').join(',');
            query += ` WHERE key NOT IN (${placeholders})`;
            params.push(...excludedKeys);
            if (sinceLocal && sinceIso && meta?.allCols.includes('updated_at')) {
              query += ` AND (updated_at > ? OR updated_at > ?)`;
              params.push(sinceLocal, sinceIso);
            }
          } else if (sinceLocal && sinceIso && meta) {
            if (meta.allCols.includes('updated_at')) {
              query += ` WHERE (updated_at > ? OR updated_at > ?)`;
              params.push(sinceLocal, sinceIso);
            } else if (meta.allCols.includes('created_at')) {
              query += ` WHERE (created_at > ? OR created_at > ?)`;
              params.push(sinceLocal, sinceIso);
            }
          }

          const orderCol = meta?.allCols.includes('created_at') ? 'created_at' : (meta?.allCols.includes('updated_at') ? 'updated_at' : null);
          if (orderCol) {
            query += ` ORDER BY ${orderCol} DESC`;
          }
          query += ` LIMIT 500`;

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

          const orderCol = meta?.allCols.includes('created_at') ? 'created_at' : (meta?.allCols.includes('updated_at') ? 'updated_at' : null);
          if (orderCol) {
            query += ` ORDER BY ${orderCol} DESC`;
          }
          query += ` LIMIT 500`;

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
