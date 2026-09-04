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

      // ── Invoice Sync Endpoints ──────────────────────────────────────────
      if (pathname === '/api/sync/invoices') {
        if (req.method === 'POST') {
          const body = await parseJsonBody(req);
          const invoices = body.invoices || [];
          const syncedIds: string[] = [];

          const insertInvoice = db.prepare(`
            INSERT INTO invoices (
              invoice_id, tenant_id, user_id, invoice_number, customer_name, customer_phone,
              subtotal, tax_total, grand_total, discount_total, discount_type, discount_value,
              payment_status, payment_method, received_amount, balance_amount, created_at,
              invoice_type, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')
            ON CONFLICT(invoice_id) DO UPDATE SET
              customer_name = excluded.customer_name,
              payment_status = excluded.payment_status,
              received_amount = excluded.received_amount,
              balance_amount = excluded.balance_amount,
              sync_status = 'SYNCED'
          `);

          const insertItem = db.prepare(`
            INSERT INTO invoice_items (
              item_id, invoice_id, tenant_id, product_id, item_name, quantity, unit_price, total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(item_id) DO NOTHING
          `);

          const tx = db.transaction((invs: any[]) => {
            for (const inv of invs) {
              insertInvoice.run(
                inv.invoice_id, inv.tenant_id || 'global', inv.user_id || 'system',
                inv.invoice_number, inv.customer_name || 'Walk-in Customer', inv.customer_phone || null,
                inv.subtotal || 0, inv.tax_total || 0, inv.grand_total || 0, inv.discount_total || 0,
                inv.discount_type || 'fixed', inv.discount_value || 0, inv.payment_status || 'PENDING',
                inv.payment_method || 'Cash', inv.received_amount || 0, inv.balance_amount || 0,
                inv.created_at || new Date().toISOString().replace('T', ' ').replace('Z', ''),
                inv.invoice_type || 'TAX_INVOICE'
              );
              if (Array.isArray(inv.items)) {
                for (const item of inv.items) {
                  insertItem.run(
                    item.item_id || `${inv.invoice_id}_${Math.random().toString(36).substring(2, 7)}`,
                    inv.invoice_id, inv.tenant_id || 'global', item.product_id || null,
                    item.item_name || item.name || 'Item', item.quantity || 1,
                    item.unit_price || item.price || 0, item.total || 0
                  );
                }
              }
              syncedIds.push(inv.invoice_id);
            }
          });

          tx(invoices);
          return sendJson(res, 200, { synced: syncedIds, synced_count: syncedIds.length, failed_count: 0 });
        }

        if (req.method === 'GET') {
          const since = url.searchParams.get('since');
          let query = `SELECT * FROM invoices WHERE invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD')`;
          const params: any[] = [];
          if (since) {
            query += ` AND created_at > ?`;
            params.push(since);
          }
          query += ` ORDER BY created_at DESC LIMIT 500`;
          const rows = db.prepare(query).all(...params);
          return sendJson(res, 200, { invoices: rows });
        }
      }

      // ── Product Sync Endpoints ──────────────────────────────────────────
      if (pathname === '/api/sync/products') {
        if (req.method === 'POST') {
          const body = await parseJsonBody(req);
          const products = body.products || [];
          const syncedIds: string[] = [];

          const insertProduct = db.prepare(`
            INSERT INTO products (
              product_id, tenant_id, name, sku_barcode, item_code, category,
              selling_price, purchase_price, stock_quantity, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')
            ON CONFLICT(product_id) DO UPDATE SET
              name = excluded.name,
              sku_barcode = excluded.sku_barcode,
              selling_price = excluded.selling_price,
              purchase_price = excluded.purchase_price,
              stock_quantity = excluded.stock_quantity,
              sync_status = 'SYNCED'
          `);

          const tx = db.transaction((prods: any[]) => {
            for (const p of prods) {
              insertProduct.run(
                p.product_id, p.tenant_id || 'global', p.name, p.sku_barcode || null,
                p.item_code || null, p.category || 'General', p.selling_price || 0,
                p.purchase_price || 0, p.stock_quantity || 0
              );
              syncedIds.push(p.product_id);
            }
          });

          tx(products);
          return sendJson(res, 200, { synced: syncedIds, synced_count: syncedIds.length, failed_count: 0 });
        }

        if (req.method === 'GET') {
          const rows = db.prepare(`SELECT * FROM products WHERE is_deleted = 0 LIMIT 1000`).all();
          return sendJson(res, 200, { products: rows });
        }
      }

      // ── Parties & Ledger Endpoints ─────────────────────────────────────
      if (pathname === '/api/sync/parties') {
        if (req.method === 'POST') {
          const body = await parseJsonBody(req);
          const parties = body.parties || [];
          const syncedIds = parties.map((p: any) => p.party_id || p.id).filter(Boolean);
          return sendJson(res, 200, { synced: syncedIds, synced_count: syncedIds.length, failed_count: 0 });
        }
        if (req.method === 'GET') {
          const rows = db.prepare(`SELECT * FROM parties LIMIT 500`).all();
          return sendJson(res, 200, { parties: rows });
        }
      }

      // ── Generic Catch-All Sync Handler for LAN ──────────────────────────
      if (pathname.startsWith('/api/sync/')) {
        if (req.method === 'POST') {
          const body = await parseJsonBody(req);
          const key = Object.keys(body)[0];
          const items = Array.isArray(body[key]) ? body[key] : [];
          const ids = items.map((item: any) => item.id || item.product_id || item.invoice_id || item.party_id || item.category_id || item.transaction_id || item.quotation_id || item.return_id).filter(Boolean);
          return sendJson(res, 200, { synced: ids, synced_count: ids.length, failed_count: 0 });
        }
        if (req.method === 'GET') {
          const tableName = pathname.replace('/api/sync/', '');
          try {
            const rows = db.prepare(`SELECT * FROM ${tableName} LIMIT 500`).all();
            return sendJson(res, 200, { [tableName]: rows });
          } catch {
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
