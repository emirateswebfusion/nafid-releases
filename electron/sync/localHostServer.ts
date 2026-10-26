import http from 'node:http';
import { BrowserWindow } from 'electron';
import { getDb } from '../db/localDb.js';
import { toIsoTimestamp } from '../utils/timestamps.js';
import { LAN_KEY_HEADER, ensureLanPairingKey, isValidLanKey } from '../services/lanPairing.js';
import { getTableMeta, upsertTableRows } from './lanUpsert.js';
import * as localHostServerSql from '../db/statements/sync/localHostServer.js';

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
  } catch { /* ignore */ }
  return clean.slice(0, 19).replace('T', ' ');
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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Cache-Control, X-Nafid-Lan-Key',
  'Access-Control-Allow-Private-Network': 'true',
};

function sendJson(res: http.ServerResponse, statusCode: number, payload: any) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  res.end(JSON.stringify(payload));
}

export function startLocalHostServer(port: number = 3888) {
  if (server) {
    if (currentPort === port) return;
    stopLocalHostServer();
  }

  currentPort = port;
  ensureLanPairingKey();
  server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
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

      // ── Pairing key: every other endpoint requires the shop's LAN key ─────
      if (!isValidLanKey(req.headers[LAN_KEY_HEADER])) {
        return sendJson(res, 401, { error: 'LAN pairing key missing or invalid. Enter the key shown on the primary terminal (Settings → Network).' });
      }

      const db = getDb();

      // ── Users / Staff Endpoint ──────────────────────────────────────────
      if (pathname === '/auth/staff' || pathname === '/api/sync/users') {
        if (req.method === 'GET') {
          const rows = localHostServerSql.selectUsers(db).all();
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
        const row: any = localHostServerSql.selectSettings(db).get(terminalCounterKey);
        
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
          const globalRow: any = localHostServerSql.selectSettings(db).get(configKey);
          if (globalRow && globalRow.value) {
            try {
              const gParsed = JSON.parse(globalRow.value);
              if (!gParsed.prefix || gParsed.prefix === prefix) {
                counter = typeof gParsed.counter === 'number' && gParsed.counter > 0 ? gParsed.counter : 1;
              }
            } catch { /* ignore */ }
          }
        }

        const checkStmt = localHostServerSql.selectInvoices(db);
        let candidate = `${prefix}${String(counter).padStart(3, '0')}`;

        while (checkStmt.get(candidate)) {
          counter++;
          candidate = `${prefix}${String(counter).padStart(3, '0')}`;
        }

        const nextConfig = { prefix, counter: counter + 1 };
        localHostServerSql.insertSettings(db).run(terminalCounterKey, JSON.stringify(nextConfig));

        return sendJson(res, 200, { invoiceNumber: candidate });
      }

      if (pathname === '/api/returns/next-number' && req.method === 'GET') {
        const reqPrefix = url.searchParams.get('prefix');
        const confRow: any = localHostServerSql.selectSettings(db).get('return_counter');
        let prefix = 'RTN-';
        let counter = 1;
        if (reqPrefix) {
          prefix = reqPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'RTN-';
        } else if (confRow && confRow.value) {
          try {
            const cfg = JSON.parse(confRow.value);
            prefix = cfg.prefix && /[A-Z0-9]/i.test(cfg.prefix) ? cfg.prefix : 'RTN-';
            counter = typeof cfg.counter === 'number' ? cfg.counter : 1;
          } catch { /* ignore */ }
        }
        const checkReturnStmt = localHostServerSql.selectReturns(db);
        let candidate = `${prefix}${String(counter).padStart(3, '0')}`;
        while (checkReturnStmt.get(candidate)) {
          counter++;
          candidate = `${prefix}${String(counter).padStart(3, '0')}`;
        }
        const nextConfig = { prefix, counter: counter + 1 };
        localHostServerSql.insertSettings2(db).run(JSON.stringify(nextConfig));

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
            const row: any = localHostServerSql.selectMaxTimestamp(db, tsCol, t).get();
            if (row && row.max_ts) {
              const rowTs = String(row.max_ts).trim();
              if (!maxUpdatedAt || rowTs > maxUpdatedAt) {
                maxUpdatedAt = rowTs;
              }
            }
          } catch { /* ignore */ }
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
                  inv.items = localHostServerSql.selectInvoiceItems(db).all(inv.invoice_id);
                }
              } else if (tName === 'purchase_bills') {
                for (const bill of rows) {
                  bill.items = localHostServerSql.selectPurchaseBillItems(db).all(bill.purchase_bill_id);
                }
              } else if (tName === 'returns') {
                for (const ret of rows) {
                  ret.items = localHostServerSql.selectReturnItems(db).all(ret.return_id);
                }
              } else if (tName === 'quotations') {
                for (const qu of rows) {
                  qu.items = localHostServerSql.selectQuotationItems(db).all(qu.quotation_id);
                }
              }
            }
            return rows;
          } catch (err) {
            console.error(`[LocalHostServer] Delta-pull error for ${tName}:`, (err as Error).message);
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
            } catch { /* ignore */ }
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
                inv.items = localHostServerSql.selectInvoiceItems(db).all(inv.invoice_id);
              }
            } else if (tableName === 'purchase_bills') {
              for (const bill of rows) {
                bill.items = localHostServerSql.selectPurchaseBillItems(db).all(bill.purchase_bill_id);
              }
            } else if (tableName === 'returns') {
              for (const ret of rows) {
                ret.items = localHostServerSql.selectReturnItems(db).all(ret.return_id);
              }
            } else if (tableName === 'quotations') {
              for (const q of rows) {
                q.items = localHostServerSql.selectQuotationItems(db).all(q.quotation_id);
              }
            }

            return sendJson(res, 200, { [endpointName]: rows, [tableName]: rows, data: rows });
          } catch (err) {
            console.error(`[LocalHostServer] Error querying ${tableName} (${endpointName}):`, (err as Error).message);
            return sendJson(res, 200, { [endpointName]: [], [tableName]: [], data: [] });
          }
        }
      }

      return sendJson(res, 200, { status: 'ok', synced: [], synced_count: 0, failed_count: 0 });
    } catch (err) {
      console.error('[LocalHostServer] Request error:', (err as Error).message);
      return sendJson(res, 500, { error: (err as Error).message });
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[LocalHostServer] [${toIsoTimestamp()}] [Local LAN Host] Server active and listening on http://0.0.0.0:${port}`);
  });

  server.on('error', (err: any) => {
    console.error(`[LocalHostServer] [${toIsoTimestamp()}] [Local LAN Host] Server error:`, err.message);
    if (server) {
      try { server.close(); } catch { /* ignore */ }
      server = null;
    }
  });
}

export function stopLocalHostServer() {
  if (server) {
    server.close();
    server = null;
    console.log(`[LocalHostServer] [${toIsoTimestamp()}] [Local LAN Host] Server stopped.`);
  }
}
