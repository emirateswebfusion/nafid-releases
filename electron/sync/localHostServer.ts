import http from 'node:http';
import { BrowserWindow } from 'electron';
import { getDb } from '../db/localDb.js';

function localTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

      stmt.run(paramObj);
      if (itemId) syncedIds.push(itemId);

      if (tableName === 'invoices' && Array.isArray(rawRow.items)) {
        for (const line of rawRow.items) {
          if (!line.invoice_id) line.invoice_id = rawRow.invoice_id;
          if (!line.tenant_id) line.tenant_id = rawRow.tenant_id || 'global';
        }
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
        const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', terminalCounterKey);
        
        let counter = 1;
        if (row) {
          try {
            const parsed = JSON.parse(row.value);
            counter = typeof parsed.counter === 'number' && parsed.counter > 0 ? parsed.counter : 1;
          } catch {
            counter = 1;
          }
        } else {
          // Fallback to global configKey counter if no terminal-specific counter exists yet
          const configKey = series === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : series === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : series === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';
          const globalRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', configKey);
          if (globalRow) {
            try {
              const gParsed = JSON.parse(globalRow.value);
              // Only adopt global counter if prefix matches
              if (!gParsed.prefix || gParsed.prefix === prefix) {
                counter = typeof gParsed.counter === 'number' && gParsed.counter > 0 ? gParsed.counter : 1;
              }
            } catch {}
          }
        }

        const checkStmt = db.prepare('SELECT 1 FROM invoices WHERE tenant_id = ? AND invoice_number = ? LIMIT 1');
        let candidate = `${prefix}${String(counter).padStart(3, '0')}`;

        while (checkStmt.get('global', candidate)) {
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
        const confRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'return_counter');
        let prefix = 'RTN-';
        let counter = 1;
        if (reqPrefix) {
          prefix = reqPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'RTN-';
        } else if (confRow) {
          try {
            const cfg = JSON.parse(confRow.value);
            prefix = cfg.prefix && /[A-Z0-9]/i.test(cfg.prefix) ? cfg.prefix : 'RTN-';
            counter = typeof cfg.counter === 'number' ? cfg.counter : 1;
          } catch {}
        }
        const usedRows: any[] = db.prepare('SELECT return_number FROM returns WHERE return_number LIKE ?').all(`${prefix}%`);
        let maxUsed = 0;
        for (const r of usedRows) {
          const usedNum = parseInt(String(r.return_number).slice(prefix.length), 10);
          if (!isNaN(usedNum) && usedNum > maxUsed) maxUsed = usedNum;
        }
        const nextCounter = Math.max(counter, maxUsed + 1);
        const returnNumber = `${prefix}${String(nextCounter).padStart(3, '0')}`;
        db.prepare(`
          INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
          VALUES ('global', 'return_counter', ?, 'LOCAL', CURRENT_TIMESTAMP)
          ON CONFLICT(tenant_id, key) DO UPDATE SET
            value = EXCLUDED.value,
            sync_status = 'LOCAL',
            updated_at = CURRENT_TIMESTAMP
        `).run(JSON.stringify({ prefix, counter: nextCounter + 1 }));

        return sendJson(res, 200, { returnNumber });
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

          let sinceCandidates: string[] = [];
          if (rawSince) {
            const set = new Set<string>();
            const clean = rawSince.trim();
            set.add(clean);
            set.add(clean.replace('T', ' ').replace('Z', '').split('.')[0]);
            set.add(clean.replace(' ', 'T').split('.')[0]);

            try {
              const d = new Date(clean.includes('Z') || clean.includes('+') ? clean : clean.replace(' ', 'T') + 'Z');
              if (!isNaN(d.getTime())) {
                const pad = (n: number) => String(n).padStart(2, '0');
                // UTC Space format (matches SQLite CURRENT_TIMESTAMP: "YYYY-MM-DD HH:MM:SS")
                const utcSpace = `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
                set.add(utcSpace);
                set.add(d.toISOString());
                set.add(d.toISOString().slice(0, 19).replace('T', ' '));

                // Local Space format
                const localSpace = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                set.add(localSpace);
              }
            } catch {}

            sinceCandidates = Array.from(set).filter(Boolean);
          }

          const buildSinceCond = (colName: string): string => {
            if (sinceCandidates.length === 0) return '';
            const clauses = sinceCandidates.map(() => `${colName} > ?`);
            params.push(...sinceCandidates);
            return `(${clauses.join(' OR ')})`;
          };

          if (tableName === 'invoices') {
            query += ` WHERE invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD')`;
            if (sinceCandidates.length > 0) {
              const uCond = buildSinceCond('updated_at');
              const cCond = buildSinceCond('created_at');
              query += ` AND (${uCond} OR ${cCond})`;
            }
          } else if (tableName === 'products') {
            if (sinceCandidates.length > 0 && meta?.allCols.includes('updated_at')) {
              query += ` WHERE ${buildSinceCond('updated_at')}`;
            }
          } else if (tableName === 'settings') {
            const excludedKeys = [
              'terminal_code', 'invoice_counter_config', 'gst_b2b_invoice_counter_config', 'gst_b2c_invoice_counter_config',
              'gst_invoice_counter_config', 'return_counter', 'scrap_invoice_counter', 'quotation_counter',
              'barcode_printer_config', 'receipt_printer_config', 'a4_printer_config', 'scale_config', 'printer_config', 'network_sync_config',
              'auto_print_barcode', 'print_format', 'label_code_type', 'label_show_shop_name'
            ];
            const placeholders = excludedKeys.map(() => '?').join(',');
            query += ` WHERE key NOT IN (${placeholders})`;
            params.push(...excludedKeys);
            if (sinceCandidates.length > 0 && meta?.allCols.includes('updated_at')) {
              query += ` AND ${buildSinceCond('updated_at')}`;
            }
          } else if (sinceCandidates.length > 0 && meta) {
            const hasUpdated = meta.allCols.includes('updated_at');
            const hasCreated = meta.allCols.includes('created_at');
            if (hasUpdated && hasCreated) {
              const uCond = buildSinceCond('updated_at');
              const cCond = buildSinceCond('created_at');
              query += ` WHERE (${uCond} OR ${cCond})`;
            } else if (hasUpdated) {
              query += ` WHERE ${buildSinceCond('updated_at')}`;
            } else if (hasCreated) {
              query += ` WHERE ${buildSinceCond('created_at')}`;
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
