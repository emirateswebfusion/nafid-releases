import http from 'node:http';
import { BrowserWindow } from 'electron';
import { getDb } from '../db/localDb.js';
import { toIsoTimestamp } from '../utils/timestamps.js';
import { LAN_KEY_HEADER, ensureLanPairingKey, isValidLanKey } from '../services/lanPairing.js';
import { getTableMeta, upsertTableRows } from './lanUpsert.js';
import { LAN_PULL_TABLES, LAN_PUSH_TABLES } from './lanTables.js';
import * as localHostServerSql from '../db/statements/sync/localHostServer.js';
import { claimLocal } from '../services/restaurantOrderService.js';
import { LAN_CLAIM_PATH } from '../services/restaurantClaim.js';

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

function parseJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
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

function sendJson(res: http.ServerResponse, statusCode: number, payload: Record<string, unknown>) {
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
        const row: Record<string, unknown> = (localHostServerSql.selectSettings(db).get(terminalCounterKey) as Record<string, unknown>);
        
        let counter = 1;
        if (row && row.value) {
          try {
            const parsed = JSON.parse((row.value as string));
            counter = typeof parsed.counter === 'number' && parsed.counter > 0 ? parsed.counter : 1;
          } catch {
            counter = 1;
          }
        } else {
          // Fallback to global configKey counter if no terminal-specific counter exists yet
          const configKey = series === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : series === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : series === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';
          const globalRow: Record<string, unknown> = (localHostServerSql.selectSettings(db).get(configKey) as Record<string, unknown>);
          if (globalRow && globalRow.value) {
            try {
              const gParsed = JSON.parse((globalRow.value as string));
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
        const confRow: Record<string, unknown> = (localHostServerSql.selectSettings(db).get('return_counter') as Record<string, unknown>);
        let prefix = 'RTN-';
        let counter = 1;
        if (reqPrefix) {
          prefix = reqPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'RTN-';
        } else if (confRow && confRow.value) {
          try {
            const cfg = JSON.parse((confRow.value as string));
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
            const row: Record<string, unknown> = (localHostServerSql.selectMaxTimestamp(db, tsCol, t).get() as Record<string, unknown>);
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
        const sinceMap: Record<string, string | null> = (body.since as Record<string, string | null>) || ({} as Record<string, string | null>);
        const resultData: Record<string, Record<string, unknown>[]> = {};

        const fetchDeltaRows = (tName: string, tsCol = 'updated_at', customWhere = '', attachItems = false) => {
          const rawSince = sinceMap[tName];
          const { statement: deltaStmt, params: qParams } = localHostServerSql.deltaRowsQuery(db, tName, tsCol, customWhere, rawSince ? toNormalizedUtc(rawSince) : null);

          try {
            const rows = deltaStmt.all(...qParams);
            if (attachItems && rows.length > 0) {
              if (tName === 'invoices') {
                for (const inv of rows) {
                  (inv as Record<string, unknown>).items = localHostServerSql.selectInvoiceItems(db).all((inv as Record<string, unknown>).invoice_id);
                }
              } else if (tName === 'purchase_bills') {
                for (const bill of rows) {
                  (bill as Record<string, unknown>).items = localHostServerSql.selectPurchaseBillItems(db).all((bill as Record<string, unknown>).purchase_bill_id);
                }
              } else if (tName === 'returns') {
                for (const ret of rows) {
                  (ret as Record<string, unknown>).items = localHostServerSql.selectReturnItems(db).all((ret as Record<string, unknown>).return_id);
                }
              } else if (tName === 'quotations') {
                for (const qu of rows) {
                  (qu as Record<string, unknown>).items = localHostServerSql.selectQuotationItems(db).all((qu as Record<string, unknown>).quotation_id);
                }
              }
            }
            return rows;
          } catch (err) {
            console.error(`[LocalHostServer] Delta-pull error for ${tName}:`, (err as Error).message);
            return [];
          }
        };

        resultData.product_grades = (fetchDeltaRows('product_grades', 'updated_at') as Record<string, unknown>[]);
        resultData.pricing_tiers = (fetchDeltaRows('pricing_tiers', 'updated_at') as Record<string, unknown>[]);
        resultData.product_pricing = (fetchDeltaRows('product_pricing', 'updated_at') as Record<string, unknown>[]);
        resultData.products = (fetchDeltaRows('products', 'updated_at') as Record<string, unknown>[]);
        resultData.settings = (fetchDeltaRows('settings', 'updated_at', `key NOT IN ('terminal_code', 'invoice_counter_config', 'gst_b2b_invoice_counter_config', 'gst_b2c_invoice_counter_config', 'gst_invoice_counter_config', 'return_counter', 'scrap_invoice_counter', 'quotation_counter', 'barcode_printer_config', 'receipt_printer_config', 'a4_printer_config', 'scale_config', 'printer_config', 'network_sync_config', 'auto_print_barcode', 'print_format', 'label_code_type', 'label_show_shop_name')`) as Record<string, unknown>[]);
        resultData.parties = (fetchDeltaRows('parties', 'updated_at') as Record<string, unknown>[]);
        resultData.party_ledger = (fetchDeltaRows('party_ledger', 'updated_at') as Record<string, unknown>[]);
        resultData.customers = (fetchDeltaRows('customers', 'updated_at') as Record<string, unknown>[]);
        resultData.loyalty_transactions = (fetchDeltaRows('loyalty_transactions', 'created_at') as Record<string, unknown>[]);
        resultData.scrap_categories = (fetchDeltaRows('scrap_categories', 'updated_at') as Record<string, unknown>[]);
        resultData.scrap_transactions = (fetchDeltaRows('scrap_transactions', 'created_at') as Record<string, unknown>[]);
        resultData.purchase_bills = (fetchDeltaRows('purchase_bills', 'updated_at', '', true) as Record<string, unknown>[]);
        resultData.cash_drawer = (fetchDeltaRows('cash_drawer', 'updated_at') as Record<string, unknown>[]);
        resultData.cash_transactions = (fetchDeltaRows('cash_transactions', 'created_at') as Record<string, unknown>[]);
        resultData.cashier_audit_log = (fetchDeltaRows('cashier_audit_log', 'created_at') as Record<string, unknown>[]);
        resultData.cash_categories = (fetchDeltaRows('cash_categories', 'updated_at') as Record<string, unknown>[]);
        resultData.returns = (fetchDeltaRows('returns', 'created_at', '', true) as Record<string, unknown>[]);
        resultData.payment_sources = (fetchDeltaRows('payment_sources', 'updated_at') as Record<string, unknown>[]);
        resultData.payment_source_transactions = (fetchDeltaRows('payment_source_transactions', 'created_at') as Record<string, unknown>[]);
        resultData.combo_offers = (fetchDeltaRows('combo_offers', 'updated_at') as Record<string, unknown>[]);
        resultData.quotations = (fetchDeltaRows('quotations', 'updated_at', '', true) as Record<string, unknown>[]);
        resultData.invoices = (fetchDeltaRows('invoices', 'created_at', `invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD')`, true) as Record<string, unknown>[]);

        return sendJson(res, 200, { success: true, data: resultData });
      }

      // ── Lightweight Pending Bills for Cash Settlement ─────────────────────
      if (pathname === '/api/sync/pending-bills-lightweight' && req.method === 'GET') {
        const rawSince = url.searchParams.get('since');
        const lastId = url.searchParams.get('last_id');
        const { statement: pendingStmt, params: qParams } = localHostServerSql.pendingBillsQuery(db, rawSince ? toNormalizedUtc(rawSince) : null, lastId);
        const rows = pendingStmt.all(...qParams);
        return sendJson(res, 200, { success: true, count: rows.length, bills: rows });
      }

      // Restaurant billing claim: the primary decides which terminal bills an order (restaurant-mode-design §10).
      if (pathname === LAN_CLAIM_PATH && req.method === 'POST') {
        return sendJson(res, 200, claimLocal(await parseJsonBody(req)));
      }

      // ── Generic & Explicit Sync Endpoints for LAN ────────────────────────
      if (pathname.startsWith('/api/sync/')) {
        const endpointName = pathname.replace('/api/sync/', '');
        const tableName = endpointName.replace(/-/g, '_');

        if (!LAN_PULL_TABLES.has(tableName)) {
          return sendJson(res, 400, { error: `Invalid sync endpoint: ${endpointName}` });
        }

        if (req.method === 'POST') {
          if (!LAN_PUSH_TABLES.has(tableName)) {
            return sendJson(res, 403, { error: `${endpointName} is read-only over the LAN` });
          }
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
            items = items.filter((i: Record<string, unknown>) => !localDeviceKeys.includes((i.key as string)));
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
          const rawLimit = Number(url.searchParams.get('limit'));
          const limit = !isNaN(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 2000) : 500;
          const rawOffset = Number(url.searchParams.get('offset'));
          const offset = !isNaN(rawOffset) && rawOffset > 0 ? rawOffset : 0;
          const sinceUtc = rawSince ? toNormalizedUtc(rawSince) : null;
          const { statement: tableStmt, params } = localHostServerSql.tableRowsQuery(db, tableName, meta?.allCols, sinceUtc, limit, offset);

          try {
            const rows = tableStmt.all(...params);

            // Attach nested items for header-detail records
            if (tableName === 'invoices') {
              for (const inv of rows) {
                (inv as Record<string, unknown>).items = localHostServerSql.selectInvoiceItems(db).all((inv as Record<string, unknown>).invoice_id);
              }
            } else if (tableName === 'purchase_bills') {
              for (const bill of rows) {
                (bill as Record<string, unknown>).items = localHostServerSql.selectPurchaseBillItems(db).all((bill as Record<string, unknown>).purchase_bill_id);
              }
            } else if (tableName === 'returns') {
              for (const ret of rows) {
                (ret as Record<string, unknown>).items = localHostServerSql.selectReturnItems(db).all((ret as Record<string, unknown>).return_id);
              }
            } else if (tableName === 'quotations') {
              for (const q of rows) {
                (q as Record<string, unknown>).items = localHostServerSql.selectQuotationItems(db).all((q as Record<string, unknown>).quotation_id);
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

  server.on('error', (err: NodeJS.ErrnoException) => {
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
