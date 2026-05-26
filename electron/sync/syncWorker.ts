import fs from 'fs';
import path from 'path';
import { app, BrowserWindow } from 'electron';
import { getDb } from '../db/localDb.js';

function notifyRenderer() {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('sync:data-updated');
  }
}

const SYNC_INTERVAL_MINS = parseInt(process.env.VENDORA_SYNC_INTERVAL_MINUTES || '1'); // Default 1 minute
const SYNC_INTERVAL_MS = SYNC_INTERVAL_MINS * 60 * 1000;
const CLOUD_API_BASE = process.env.VENDORA_CLOUD_API || 'http://localhost:3001';

function getAuthConfig(): { jwt_token: string; tenant_id: string } | null {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (!fs.existsSync(configPath)) return null;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.jwt_token ? config : null;
  } catch {
    return null;
  }
}

export function initSyncWorker() {
  console.log('[SyncWorker] Initializing background sync worker...');
  setInterval(runSyncCycle, SYNC_INTERVAL_MS);
}

// ── Manual Sync Trigger ──────────────────────────────────────────────────────
export async function runInitialSync() {
  console.log('[SyncWorker] Running explicit initial sync...');
  await runSyncCycle();
  return { success: true };
}

// ── Main sync cycle ──────────────────────────────────────────────────────────
async function runSyncCycle() {
  // Quick connectivity check
  try {
    const res = await fetch('https://clients3.google.com/generate_204', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (!res.ok && res.status !== 204) return;
  } catch {
    console.log('[SyncWorker] Offline. Skipping sync cycle.');
    return;
  }

  console.log('[SyncWorker] Online. Running sync...');

  const config = getAuthConfig();
  if (!config) {
    console.warn('[SyncWorker] No JWT token found. Please log in to enable cloud sync.');
    return;
  }

  // Run syncs sequentially:
  // 1. Push local changes up (products first so stock/notifications are current)
  // 2. Pull latest data down from cloud (ensures new devices get caught up)
  try {
    await syncProducts(config.jwt_token);
    await syncInvoices(config.jwt_token);
    await pullProducts(config.jwt_token);
    await pullInvoices(config.jwt_token);
    await pullUsers(config.jwt_token);
  } catch (err: any) {
    console.error('[SyncWorker] Sync cycle error:', err.message);
  }
}

// ── Product Sync (Edge → Cloud) ──────────────────────────────────────────────
// Pushes all products with sync_status = 'PENDING' to the cloud.
// This includes stock changes from checkouts, new products, and edits.
// The cloud endpoint triggers low-stock notifications if current_stock <= reorder_level.
async function syncProducts(token: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM products WHERE sync_status = 'PENDING'`).all() as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} products to cloud...`);

  try {
    // Parse domain_attributes back to JSON objects for the cloud
    const products = pending.map((p: any) => ({
      ...p,
      is_deleted: !!p.is_deleted,
      domain_attributes: (() => { try { return JSON.parse(p.domain_attributes || '{}'); } catch { return {}; } })(),
    }));

    const response = await fetch(`${CLOUD_API_BASE}/api/sync/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ products }),
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Product sync failed: HTTP ${response.status}`);
      return;
    }

    const result: any = await response.json();
    console.log(`[SyncWorker] Product sync: ${result.synced_count} synced, ${result.failed_count} failed.`);

    if (result.synced?.length > 0) {
      const updateStmt = db.prepare(`UPDATE products SET sync_status = 'SYNCED' WHERE product_id = ?`);
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id); });
      tx(result.synced);
    }
  } catch (err: any) {
    console.error('[SyncWorker] Product sync fetch failed:', err.message);
  }
}

// ── Invoice Sync (Edge → Cloud) ──────────────────────────────────────────────
// Pushes invoices with sync_status = 'PENDING' along with their line items.
async function syncInvoices(token: string) {
  const db = getDb();
  const pendingInvoices = db.prepare(`SELECT * FROM invoices WHERE sync_status = 'PENDING'`).all() as any[];

  if (pendingInvoices.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pendingInvoices.length} invoices to cloud...`);

  // Attach line items to each invoice
  const getItems = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ?`);
  const invoicesWithItems = pendingInvoices.map((inv: any) => ({
    ...inv,
    items: getItems.all(inv.invoice_id),
  }));

  try {
    const response = await fetch(`${CLOUD_API_BASE}/api/sync/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ invoices: invoicesWithItems }),
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Invoice sync failed: HTTP ${response.status}`);
      return;
    }

    const result: any = await response.json();
    console.log(`[SyncWorker] Invoice sync: ${result.synced_count} synced, ${result.failed_count} failed.`);

    if (result.synced?.length > 0) {
      const updateStmt = db.prepare(`UPDATE invoices SET sync_status = 'SYNCED' WHERE invoice_id = ?`);
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id); });
      tx(result.synced);
    }
  } catch (err: any) {
    console.error('[SyncWorker] Invoice sync fetch failed:', err.message);
  }
}

// ── Pull Products (Cloud → Edge) ─────────────────────────────────────────────
// Fetches all products for this tenant from the Cloud API and upserts them
// into local SQLite. This ensures a new device gets the full product catalog
// and all devices stay in sync with cloud-side stock/price updates.
// Products that are locally modified (sync_status = 'PENDING') are NOT overwritten
// to avoid losing un-pushed local edits.
async function pullProducts(token: string) {
  const db = getDb();

  try {
    const response = await fetch(`${CLOUD_API_BASE}/api/products`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Pull products failed: HTTP ${response.status}`);
      return;
    }

    const cloudProducts: any[] = await response.json();
    if (!Array.isArray(cloudProducts) || cloudProducts.length === 0) return;

    // Read the auth config to get tenant_id
    const config = getAuthConfig();
    const tenantId = config?.tenant_id || '';

    const upsert = db.prepare(`
      INSERT INTO products (
        product_id, tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
        purchase_price, base_price, is_gst_applicable, tax_rate_percent,
        uom, brand_manufacturer, current_stock, reorder_level, is_deleted, domain_attributes,
        discount_percent, discount_flat, offer_price,
        sync_status
      ) VALUES (
        @product_id, @tenant_id, @name, @sku_barcode, @item_code, @category, @hsn_sac_code,
        @purchase_price, @base_price, @is_gst_applicable, @tax_rate_percent,
        @uom, @brand_manufacturer, @current_stock, @reorder_level, @is_deleted, @domain_attributes,
        @discount_percent, @discount_flat, @offer_price,
        'SYNCED'
      )
      ON CONFLICT(product_id) DO UPDATE SET
        name = excluded.name,
        sku_barcode = excluded.sku_barcode,
        item_code = excluded.item_code,
        category = excluded.category,
        hsn_sac_code = excluded.hsn_sac_code,
        purchase_price = excluded.purchase_price,
        base_price = excluded.base_price,
        is_gst_applicable = excluded.is_gst_applicable,
        tax_rate_percent = excluded.tax_rate_percent,
        uom = excluded.uom,
        brand_manufacturer = excluded.brand_manufacturer,
        current_stock = excluded.current_stock,
        reorder_level = excluded.reorder_level,
        is_deleted = excluded.is_deleted,
        domain_attributes = excluded.domain_attributes,
        discount_percent = excluded.discount_percent,
        discount_flat = excluded.discount_flat,
        offer_price = excluded.offer_price,
        sync_status = 'SYNCED'
      WHERE products.sync_status != 'PENDING'
    `);

    const tx = db.transaction((products: any[]) => {
      for (const p of products) {
        upsert.run({
          product_id: p.product_id,
          tenant_id: tenantId,
          name: p.name,
          sku_barcode: p.sku_barcode || null,
          item_code: p.item_code || null,
          category: p.category || null,
          hsn_sac_code: p.hsn_sac_code || null,
          purchase_price: p.purchase_price ?? 0,
          base_price: p.base_price,
          is_gst_applicable: 1,
          tax_rate_percent: p.tax_rate_percent ?? 0,
          uom: p.uom || 'Pcs',
          brand_manufacturer: p.brand_manufacturer || null,
          current_stock: p.current_stock ?? 0,
          reorder_level: p.reorder_level ?? 0,
          is_deleted: p.is_deleted ? 1 : 0,
          domain_attributes: p.domain_attributes ? JSON.stringify(p.domain_attributes) : '{}',
          discount_percent: p.discount_percent ?? null,
          discount_flat: p.discount_flat ?? null,
          offer_price: p.offer_price ?? null,
        });
      }
    });

    tx(cloudProducts);
    console.log(`[SyncWorker] Pulled ${cloudProducts.length} products from cloud.`);
    notifyRenderer();
  } catch (err: any) {
    console.error('[SyncWorker] Pull products failed:', err.message);
  }
}

// ── Pull Invoices (Cloud → Edge) ─────────────────────────────────────────────
// Fetches historical invoices for this tenant from the Cloud API and upserts
// them into local SQLite. This allows a new device to see the shop's history.
async function pullInvoices(token: string) {
  const db = getDb();

  try {
    const response = await fetch(`${CLOUD_API_BASE}/api/sync/invoices`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Pull invoices failed: HTTP ${response.status}`);
      return;
    }

    const cloudInvoices: any[] = await response.json();
    if (!Array.isArray(cloudInvoices) || cloudInvoices.length === 0) return;

    const upsertInv = db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, invoice_number, invoice_type,
        customer_name, customer_phone, subtotal, tax_total,
        discount_total, grand_total, user_id, sync_status, created_at
      ) VALUES (
        @invoice_id, @tenant_id, @invoice_number, @invoice_type,
        @customer_name, @customer_phone, @subtotal, @tax_total,
        @discount_total, @grand_total, @user_id, 'SYNCED', @created_at
      )
      ON CONFLICT(invoice_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        sync_status = 'SYNCED'
    `);

    const upsertItem = db.prepare(`
      INSERT INTO invoice_items (
        item_id, invoice_id, tenant_id, product_id,
        quantity, unit_price, tax_amount, total
      ) VALUES (
        @item_id, @invoice_id, @tenant_id, @product_id,
        @quantity, @unit_price, @tax_amount, @total
      )
      ON CONFLICT(item_id) DO NOTHING
    `);

    const tx = db.transaction((invoices: any[]) => {
      for (const inv of invoices) {
        upsertInv.run({
          invoice_id: inv.invoice_id,
          tenant_id: inv.tenant_id,
          invoice_number: inv.invoice_number,
          invoice_type: inv.invoice_type,
          customer_name: inv.customer_name || null,
          customer_phone: inv.customer_phone || null,
          subtotal: inv.subtotal,
          tax_total: inv.tax_total,
          discount_total: inv.discount_total ?? 0,
          grand_total: inv.grand_total,
          user_id: inv.user_id || null,
          created_at: inv.created_at,
        });

        if (Array.isArray(inv.items)) {
          for (const item of inv.items) {
            upsertItem.run({
              item_id: item.item_id,
              invoice_id: inv.invoice_id,
              tenant_id: inv.tenant_id,
              product_id: item.product_id,
              quantity: item.quantity,
              unit_price: item.unit_price,
              tax_amount: item.tax_amount,
              total: item.total,
            });
          }
        }
      }
    });

    tx(cloudInvoices);
    console.log(`[SyncWorker] Pulled ${cloudInvoices.length} invoices from cloud.`);
    notifyRenderer();
  } catch (err: any) {
    console.error('[SyncWorker] Pull invoices failed:', err.message);
  }
}

// ── Pull Users (Cloud → Edge) ────────────────────────────────────────────────
// Fetches the staff list for this tenant and updates the local 'users' table.
async function pullUsers(token: string) {
  const db = getDb();

  try {
    const response = await fetch(`${CLOUD_API_BASE}/auth/staff`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Pull users failed: HTTP ${response.status}`);
      return;
    }

    const cloudUsers: any[] = await response.json();
    if (!Array.isArray(cloudUsers) || cloudUsers.length === 0) return;

    // Get tenant_id from config
    const config = getAuthConfig();
    const tenantId = config?.tenant_id || '';

    const upsert = db.prepare(`
      INSERT INTO users (user_id, tenant_id, name, email, role, created_at)
      VALUES (@user_id, @tenant_id, @name, @email, @role, @created_at)
      ON CONFLICT(user_id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        role = excluded.role
    `);

    const tx = db.transaction((users: any[]) => {
      for (const u of users) {
        upsert.run({
          user_id: u.user_id,
          tenant_id: tenantId,
          name: u.name,
          email: u.email,
          role: u.role,
          created_at: u.created_at,
        });
      }
    });

    tx(cloudUsers);
    console.log(`[SyncWorker] Pulled ${cloudUsers.length} users from cloud.`);
  } catch (err: any) {
    console.error('[SyncWorker] Pull users failed:', err.message);
  }
}
