import http from 'node:http';
import { getDb } from '../db/localDb.js';

let server: http.Server | null = null;
let currentPort: number = 3888;

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
  });
  res.end(JSON.stringify(payload));
}

function extractItemId(item: any): string | null {
  if (!item || typeof item !== 'object') return null;
  if (item.key) return String(item.key);
  if (item.id) return String(item.id);
  if (item.scrap_category_id) return String(item.scrap_category_id);
  if (item.grade_id) return String(item.grade_id);
  if (item.tier_id) return String(item.tier_id);
  if (item.pricing_id) return String(item.pricing_id);
  if (item.entry_id) return String(item.entry_id);
  if (item.ledger_id) return String(item.ledger_id);
  if (item.scrap_transaction_id) return String(item.scrap_transaction_id);
  if (item.bill_id) return String(item.bill_id);
  if (item.purchase_bill_id) return String(item.purchase_bill_id);
  if (item.drawer_id) return String(item.drawer_id);
  if (item.cash_transaction_id) return String(item.cash_transaction_id);
  if (item.cash_category_id) return String(item.cash_category_id);
  if (item.customer_id) return String(item.customer_id);
  if (item.loyalty_transaction_id) return String(item.loyalty_transaction_id);
  if (item.source_id) return String(item.source_id);
  if (item.payment_source_transaction_id) return String(item.payment_source_transaction_id);
  if (item.combo_id) return String(item.combo_id);
  if (item.quotation_id) return String(item.quotation_id);
  if (item.return_id) return String(item.return_id);
  if (item.warranty_id) return String(item.warranty_id);
  for (const k of Object.keys(item)) {
    if (k.endsWith('_id') && (typeof item[k] === 'string' || typeof item[k] === 'number')) {
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
      const paramObj: Record<string, any> = {};

      for (const col of allCols) {
        let val = rawRow[col];
        if (typeof val === 'boolean') val = val ? 1 : 0;
        paramObj[col] = val !== undefined ? val : null;
      }

      if (allCols.includes('sync_status')) {
        paramObj['sync_status'] = 'SYNCED';
      }

      stmt.run(paramObj);
      if (itemId) syncedIds.push(itemId);

      if (tableName === 'invoices' && Array.isArray(rawRow.items)) {
        upsertTableRows(db, 'invoice_items', rawRow.items);
      } else if (tableName === 'purchase_bills' && Array.isArray(rawRow.items)) {
        upsertTableRows(db, 'purchase_bill_items', rawRow.items);
      } else if (tableName === 'returns' && Array.isArray(rawRow.items)) {
        upsertTableRows(db, 'return_items', rawRow.items);
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
        const tableName = pathname.replace('/api/sync/', '');

        if (req.method === 'POST') {
          const body = await parseJsonBody(req);
          const key = body[tableName] ? tableName : Object.keys(body)[0];
          const items = Array.isArray(body[key]) ? body[key] : (Array.isArray(body) ? body : []);
          const synced = upsertTableRows(db, tableName, items);
          return sendJson(res, 200, { synced, synced_count: synced.length, failed_count: 0 });
        }

        if (req.method === 'GET') {
          const since = url.searchParams.get('since');
          const meta = getTableMeta(db, tableName);
          let query = `SELECT * FROM ${tableName}`;
          const params: any[] = [];

          if (tableName === 'invoices') {
            query += ` WHERE invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD')`;
            if (since) {
              query += ` AND (updated_at > ? OR created_at > ?)`;
              params.push(since, since);
            }
          } else if (tableName === 'products') {
            query += ` WHERE is_deleted = 0`;
            if (since && meta?.allCols.includes('updated_at')) {
              query += ` AND updated_at > ?`;
              params.push(since);
            }
          } else if (since && meta) {
            if (meta.allCols.includes('updated_at')) {
              query += ` WHERE updated_at > ?`;
              params.push(since);
            } else if (meta.allCols.includes('created_at')) {
              query += ` WHERE created_at > ?`;
              params.push(since);
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

            return sendJson(res, 200, { [tableName]: rows });
          } catch (err: any) {
            console.error(`[LocalHostServer] Error querying ${tableName}:`, err.message);
            return sendJson(res, 200, { [tableName]: [] });
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
    console.log(`[LocalHostServer] Local LAN Host Server running on http://0.0.0.0:${port}`);
  });

  server.on('error', (err: any) => {
    console.error(`[LocalHostServer] Server error:`, err.message);
  });
}

export function stopLocalHostServer() {
  if (server) {
    server.close();
    server = null;
    console.log('[LocalHostServer] Local LAN Host Server stopped.');
  }
}
