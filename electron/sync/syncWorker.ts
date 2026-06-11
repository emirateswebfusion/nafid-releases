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

function getCloudApiBase() {
  return process.env.VENDORA_CLOUD_API || 'http://localhost:3001';
}

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
  // Run initial sync cycle immediately on app startup
  runSyncCycle().catch(err => console.error('[SyncWorker] Initial startup sync error:', err.message));
  
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
    await syncGrades(config.jwt_token, config.tenant_id);
    await syncProducts(config.jwt_token, config.tenant_id);
    await syncInvoices(config.jwt_token, config.tenant_id);
    await pullGrades(config.jwt_token);
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
async function syncProducts(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM products WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} products to cloud...`);

  try {
    // Parse domain_attributes back to JSON objects for the cloud
    const products = pending.map((p: any) => ({
      ...p,
      is_deleted: !!p.is_deleted,
      domain_attributes: (() => { try { return JSON.parse(p.domain_attributes || '{}'); } catch { return {}; } })(),
    }));

    const response = await fetch(`${getCloudApiBase()}/api/sync/products`, {
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
      const updateStmt = db.prepare(`UPDATE products SET sync_status = 'SYNCED' WHERE product_id = ? AND tenant_id = ?`);
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(result.synced);
    }
  } catch (err: any) {
    console.error('[SyncWorker] Product sync fetch failed:', err.message);
  }
}

// ── Product Grades Sync (Edge → Cloud) ───────────────────────────────────────────
async function syncGrades(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM product_grades WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} product grades to cloud...`);

  try {
    const response = await fetch(`${getCloudApiBase()}/api/sync/product_grades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ product_grades: pending }),
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Grade sync failed: HTTP ${response.status}`);
      return;
    }

    const result: any = await response.json();
    console.log(`[SyncWorker] Grade sync: ${result.synced_count} synced, ${result.failed_count} failed.`);

    if (result.synced?.length > 0) {
      const updateStmt = db.prepare(`UPDATE product_grades SET sync_status = 'SYNCED' WHERE grade_id = ? AND tenant_id = ?`);
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(result.synced);
    }
  } catch (err: any) {
    console.error('[SyncWorker] Grade sync fetch failed:', err.message);
  }
}

// ── Invoice Sync (Edge → Cloud) ──────────────────────────────────────────────
// Pushes invoices with sync_status = 'PENDING' along with their line items.
async function syncInvoices(token: string, tenantId: string) {
  const db = getDb();
  const pendingInvoices = db.prepare(`SELECT * FROM invoices WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pendingInvoices.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pendingInvoices.length} invoices to cloud...`);

  // Attach line items to each invoice
  const getItems = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ? AND tenant_id = ?`);
  const invoicesWithItems = pendingInvoices.map((inv: any) => ({
    ...inv,
    items: getItems.all(inv.invoice_id, tenantId),
  }));

  try {
    const response = await fetch(`${getCloudApiBase()}/api/sync/invoices`, {
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
      const updateStmt = db.prepare(`UPDATE invoices SET sync_status = 'SYNCED' WHERE invoice_id = ? AND tenant_id = ?`);
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(result.synced);
    }
  } catch (err: any) {
    console.error('[SyncWorker] Invoice sync fetch failed:', err.message);
  }
}

// ── Pull Product Grades (Cloud → Edge) ─────────────────────────────────────────────
async function pullGrades(token: string) {
  const db = getDb();

  try {
    const response = await fetch(`${getCloudApiBase()}/api/sync/product_grades`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Pull grades failed: HTTP ${response.status}`);
      return;
    }

    const cloudGrades: any[] = await response.json();
    if (!Array.isArray(cloudGrades) || cloudGrades.length === 0) return;

    const config = getAuthConfig();
    const tenantId = config?.tenant_id || '';

    const upsert = db.prepare(`
      INSERT INTO product_grades (
        grade_id, tenant_id, category, grade_name, rate,
        sync_status, created_at, updated_at
      ) VALUES (
        @grade_id, @tenant_id, @category, @grade_name, @rate,
        'SYNCED', @created_at, @updated_at
      )
      ON CONFLICT(grade_id) DO UPDATE SET
        category = excluded.category,
        grade_name = excluded.grade_name,
        rate = excluded.rate,
        created_at = COALESCE(product_grades.created_at, excluded.created_at),
        updated_at = excluded.updated_at,
        sync_status = 'SYNCED'
      WHERE product_grades.sync_status != 'PENDING'
    `);

    const tx = db.transaction((grades: any[]) => {
      for (const g of grades) {
        try {
          upsert.run({
            grade_id: g.grade_id,
            tenant_id: tenantId,
            category: g.category,
            grade_name: g.grade_name,
            rate: g.rate,
            created_at: g.created_at ?? new Date().toISOString(),
            updated_at: g.updated_at ?? new Date().toISOString(),
          });
        } catch (e: any) {
           console.error('[SyncWorker] Error pulling grade:', e.message);
        }
      }
    });

    tx(cloudGrades);
    console.log(`[SyncWorker] Pulled ${cloudGrades.length} grades from cloud.`);
  } catch (err: any) {
    console.error('[SyncWorker] Pull grades failed:', err.message);
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
    const response = await fetch(`${getCloudApiBase()}/api/products`, {
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
        billing_type, grade_id, pricing_mode, average_weight_per_piece, weight_override_allowed,
        sync_status, created_at, updated_at
      ) VALUES (
        @product_id, @tenant_id, @name, @sku_barcode, @item_code, @category, @hsn_sac_code,
        @purchase_price, @base_price, @is_gst_applicable, @tax_rate_percent,
        @uom, @brand_manufacturer, @current_stock, @reorder_level, @is_deleted, @domain_attributes,
        @discount_percent, @discount_flat, @offer_price,
        @billing_type, @grade_id, @pricing_mode, @average_weight_per_piece, @weight_override_allowed,
        'SYNCED', @created_at, @updated_at
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
        billing_type = excluded.billing_type,
        grade_id = excluded.grade_id,
        pricing_mode = excluded.pricing_mode,
        average_weight_per_piece = excluded.average_weight_per_piece,
        weight_override_allowed = excluded.weight_override_allowed,
        created_at = COALESCE(products.created_at, excluded.created_at),
        updated_at = excluded.updated_at,
        sync_status = 'SYNCED'
      WHERE products.sync_status != 'PENDING'
    `);

    const tx = db.transaction((products: any[]) => {
      for (const p of products) {
        let currentP = { ...p };
        let retryCount = 0;
        let success = false;
        while (retryCount < 2 && !success) {
          try {
            upsert.run({
              product_id: currentP.product_id,
              tenant_id: tenantId,
              name: currentP.name,
              sku_barcode: currentP.sku_barcode || null,
              item_code: currentP.item_code || null,
              category: currentP.category || null,
              hsn_sac_code: currentP.hsn_sac_code || null,
              purchase_price: currentP.purchase_price ?? 0,
              base_price: currentP.base_price,
              is_gst_applicable: currentP.is_gst_applicable === false ? 0 : 1,
              tax_rate_percent: currentP.tax_rate_percent ?? 0,
              uom: currentP.uom || 'Pcs',
              brand_manufacturer: currentP.brand_manufacturer || null,
              current_stock: currentP.current_stock ?? 0,
              reorder_level: currentP.reorder_level ?? 0,
              is_deleted: currentP.is_deleted ? 1 : 0,
              domain_attributes: currentP.domain_attributes ? JSON.stringify(currentP.domain_attributes) : '{}',
              discount_percent: currentP.discount_percent ?? null,
              discount_flat: currentP.discount_flat ?? null,
              offer_price: currentP.offer_price ?? null,
              billing_type: currentP.billing_type || 'PIECE',
              grade_id: currentP.grade_id || null,
              pricing_mode: currentP.pricing_mode || 'FIXED_PRICE',
              average_weight_per_piece: currentP.average_weight_per_piece ?? null,
              weight_override_allowed: currentP.weight_override_allowed ? 1 : 0,
              created_at: currentP.created_at ?? new Date().toISOString(),
              updated_at: currentP.updated_at ?? new Date().toISOString(),
            });
            success = true;
          } catch (e: any) {
            if (e.message?.includes('UNIQUE constraint failed')) {
              const suffix = currentP.product_id.substring(0, 4).toUpperCase();
              if (e.message.includes('products.name')) currentP.name = `${currentP.name} (Cloud-${suffix})`;
              if (e.message.includes('products.sku_barcode')) currentP.sku_barcode = `${currentP.sku_barcode}-${suffix}`;
              if (e.message.includes('products.item_code')) currentP.item_code = `${currentP.item_code}-${suffix}`;
              retryCount++;
            } else {
              throw e;
            }
          }
        }
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
    const response = await fetch(`${getCloudApiBase()}/api/sync/invoices`, {
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
        discount_total, grand_total, payment_method, user_id, sync_status, created_at
      ) VALUES (
        @invoice_id, @tenant_id, @invoice_number, @invoice_type,
        @customer_name, @customer_phone, @subtotal, @tax_total,
        @discount_total, @grand_total, @payment_method, @user_id, 'SYNCED', @created_at
      )
      ON CONFLICT(invoice_id) DO UPDATE SET
        payment_method = EXCLUDED.payment_method,
        user_id = EXCLUDED.user_id,
        sync_status = 'SYNCED'
    `);

    const upsertItem = db.prepare(`
      INSERT INTO invoice_items (
        item_id, invoice_id, tenant_id, product_id,
        name, quantity, unit_price, tax_amount, total
      ) VALUES (
        @item_id, @invoice_id, @tenant_id, @product_id,
        @name, @quantity, @unit_price, @tax_amount, @total
      )
      ON CONFLICT(item_id) DO UPDATE SET
        name = excluded.name,
        quantity = excluded.quantity,
        unit_price = excluded.unit_price,
        tax_amount = excluded.tax_amount,
        total = excluded.total
    `);

    const tx = db.transaction((invoices: any[]) => {
      for (const inv of invoices) {
        let currentInv = { ...inv };
        let retryCount = 0;
        let success = false;
        while (retryCount < 2 && !success) {
          try {
            upsertInv.run({
              invoice_id: currentInv.invoice_id,
              tenant_id: currentInv.tenant_id,
              invoice_number: currentInv.invoice_number,
              invoice_type: currentInv.invoice_type,
              customer_name: currentInv.customer_name || null,
              customer_phone: currentInv.customer_phone || null,
              subtotal: currentInv.subtotal,
              tax_total: currentInv.tax_total,
              discount_total: currentInv.discount_total ?? 0,
              grand_total: currentInv.grand_total,
              payment_method: currentInv.payment_method || 'CASH',
              user_id: currentInv.user_id || null,
              created_at: currentInv.created_at,
            });
            success = true;
          } catch (e: any) {
            if (e.message?.includes('UNIQUE constraint failed: invoices.tenant_id, invoices.invoice_number')) {
              const suffix = currentInv.invoice_id.substring(0, 4).toUpperCase();
              currentInv.invoice_number = `${currentInv.invoice_number}-C${suffix}`;
              retryCount++;
            } else {
              throw e;
            }
          }
        }

        if (success && Array.isArray(currentInv.items)) {
          for (const item of currentInv.items) {
            upsertItem.run({
              item_id: item.item_id,
              invoice_id: currentInv.invoice_id,
              tenant_id: currentInv.tenant_id,
              product_id: item.product_id,
              name: item.name || null,
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
    const response = await fetch(`${getCloudApiBase()}/auth/staff`, {
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
