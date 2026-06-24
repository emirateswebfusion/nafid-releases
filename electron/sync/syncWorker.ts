import fs from 'fs';
import path from 'path';
import { app, BrowserWindow } from 'electron';
import { getDb } from '../db/localDb.js';

const BATCH_SIZE = 100;
const FETCH_TIMEOUT_MS = 120000;
let syncInProgress = false;

function toSqliteDate(iso: string | null | undefined): string {
  if (!iso) return new Date().toISOString().replace('T', ' ').replace('Z', '');
  return iso.replace('T', ' ').replace('Z', '');
}

function notifyRenderer() {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('sync:data-updated');
  }
}

const SYNC_INTERVAL_MINS = parseInt(process.env.VENDORA_SYNC_INTERVAL_MINUTES || '1');
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
  runSyncCycle().catch(err => console.error('[SyncWorker] Initial startup sync error:', err.message));
  setInterval(runSyncCycle, SYNC_INTERVAL_MS);
}

export async function runInitialSync() {
  console.log('[SyncWorker] Running explicit initial sync...');
  await runSyncCycle();
  return { success: true };
}

async function runSyncCycle() {
  if (syncInProgress) {
    console.log('[SyncWorker] Sync already in progress, skipping...');
    return;
  }
  syncInProgress = true;

  try {
    try {
      const res = await fetch('https://clients3.google.com/generate_204', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (!res.ok && res.status !== 204) {
        console.log('[SyncWorker] Offline. Skipping sync cycle.');
        return;
      }
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

    const { jwt_token, tenant_id } = config;
    let dataUpdated = false;

    try {
      await syncGrades(jwt_token, tenant_id);
      await syncProducts(jwt_token, tenant_id);
      await syncInvoices(jwt_token, tenant_id);
      await syncSettings(jwt_token, tenant_id);
      await syncParties(jwt_token, tenant_id);

      if (await pullGrades(jwt_token, tenant_id)) dataUpdated = true;
      if (await pullProducts(jwt_token, tenant_id)) dataUpdated = true;
      if (await pullInvoices(jwt_token, tenant_id)) dataUpdated = true;
      if (await pullUsers(jwt_token, tenant_id)) dataUpdated = true;
      if (await pullSettings(jwt_token, tenant_id)) dataUpdated = true;
      if (await pullParties(jwt_token, tenant_id)) dataUpdated = true;
    } catch (err: any) {
      console.error('[SyncWorker] Sync cycle error:', err.message);
    }

    if (dataUpdated) {
      notifyRenderer();
    }
  } finally {
    syncInProgress = false;
  }
}

// ── Batch push helper ───────────────────────────────────────────────────────────
async function pushBatch<T>(
  url: string,
  token: string,
  batch: T[],
  bodyKey: string,
  label: string,
): Promise<string[]> {
  if (batch.length === 0) return [];

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ [bodyKey]: batch }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[SyncWorker] ${label} batch failed: HTTP ${response.status}`);
      return [];
    }

    const result: any = await response.json();
    if (result.synced?.length > 0) {
      console.log(`[SyncWorker] ${label}: ${result.synced_count} synced, ${result.failed_count} failed.`);
    } else if (result.failed?.length > 0) {
      console.log(`[SyncWorker] ${label}: 0 synced, ${result.failed_count} failed. First error: ${result.failed[0].error}`);
    } else {
      console.warn(`[SyncWorker] ${label}: 0 synced, 0 failed — unexpected response shape. Body: ${JSON.stringify(result).slice(0, 500)}`);
    }
    return result.synced || [];
  } catch (err: any) {
    console.error(`[SyncWorker] ${label} batch error: ${err.message}`);
    return [];
  }
}

// ── Product Grades Sync (Edge → Cloud) ───────────────────────────────────────────
async function syncGrades(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM product_grades WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} product grades to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE product_grades SET sync_status = 'SYNCED' WHERE grade_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      `${getCloudApiBase()}/api/sync/product_grades`,
      token,
      batch,
      'product_grades',
      `Grades batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Product Sync (Edge → Cloud) ──────────────────────────────────────────────
async function syncProducts(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM products WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} products to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE products SET sync_status = 'SYNCED' WHERE product_id = ? AND tenant_id = ?`);

  let totalSynced = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const products = batch.map((p: any) => ({
      ...p,
      is_deleted: !!p.is_deleted,
      domain_attributes: (() => { try { return JSON.parse(p.domain_attributes || '{}'); } catch { return {}; } })(),
    }));

    const synced = await pushBatch(
      `${getCloudApiBase()}/api/sync/products`,
      token,
      products,
      'products',
      `Products batch ${Math.floor(i / BATCH_SIZE) + 1} (${i + 1}-${Math.min(i + BATCH_SIZE, pending.length)})`,
    );
    if (synced.length > 0) {
      totalSynced += synced.length;
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
  console.log(`[SyncWorker] Pushed ${totalSynced} products to cloud.`);
}

// ── Invoice Sync (Edge → Cloud) ──────────────────────────────────────────────
async function syncInvoices(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM invoices WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} invoices to cloud in batches of ${BATCH_SIZE}...`);

  const getItems = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ? AND tenant_id = ?`);
  const updateStmt = db.prepare(`UPDATE invoices SET sync_status = 'SYNCED' WHERE invoice_id = ? AND tenant_id = ?`);

  let totalSynced = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const invoicesWithItems = batch.map((inv: any) => ({
      ...inv,
      items: getItems.all(inv.invoice_id, tenantId),
    }));

    const synced = await pushBatch(
      `${getCloudApiBase()}/api/sync/invoices`,
      token,
      invoicesWithItems,
      'invoices',
      `Invoices batch ${Math.floor(i / BATCH_SIZE) + 1} (${i + 1}-${Math.min(i + BATCH_SIZE, pending.length)})`,
    );
    if (synced.length > 0) {
      totalSynced += synced.length;
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
  console.log(`[SyncWorker] Pushed ${totalSynced} invoices to cloud.`);
}

// ── Settings Sync (Edge → Cloud) ─────────────────────────────────────────────
async function syncSettings(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM settings WHERE sync_status = 'PENDING' AND tenant_id = ? AND key IN ('price_coding', 'barcode_printer_config', 'receipt_printer_config')`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} settings to cloud...`);

  const synced = await pushBatch(
    `${getCloudApiBase()}/api/sync/settings`,
    token,
    pending,
    'settings',
    'Settings',
  );
  if (synced.length > 0) {
    const updateStmt = db.prepare(`UPDATE settings SET sync_status = 'SYNCED' WHERE key = ? AND tenant_id = ?`);
    const tx = db.transaction((keys: string[]) => { for (const key of keys) updateStmt.run(key, tenantId); });
    tx(synced);
  }
}

// ── Reconcile helper ────────────────────────────────────────────────────────────
function reconcilePending(
  db: any,
  table: string,
  idColumn: string,
  cloudRows: any[],
): number {
  if (cloudRows.length === 0) return 0;

  const updateStmt = db.prepare(
    `UPDATE ${table} SET sync_status = 'SYNCED' WHERE sync_status = 'PENDING' AND ${idColumn} = ? AND updated_at = ?`,
  );

  let count = 0;
  for (const row of cloudRows) {
    const result = updateStmt.run(row[idColumn], toSqliteDate(row.updated_at));
    if (result.changes > 0) count++;
  }
  return count;
}

// ── Pull Product Grades (Cloud → Edge) ─────────────────────────────────────────────
async function pullGrades(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  try {
    const response = await fetch(`${getCloudApiBase()}/api/sync/product_grades`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Pull grades failed: HTTP ${response.status}`);
      return false;
    }

    const cloudGrades: any[] = await response.json();
    if (!Array.isArray(cloudGrades) || cloudGrades.length === 0) return false;

    const upsert = db.prepare(`
      INSERT INTO product_grades (
        grade_id, tenant_id, category, grade_name, rate, is_deleted,
        sync_status, created_at, updated_at
      ) VALUES (
        @grade_id, @tenant_id, @category, @grade_name, @rate, @is_deleted,
        'SYNCED', @created_at, @updated_at
      )
      ON CONFLICT(grade_id) DO UPDATE SET
        category = excluded.category,
        grade_name = excluded.grade_name,
        rate = excluded.rate,
        is_deleted = excluded.is_deleted,
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
            is_deleted: g.is_deleted ? 1 : 0,
            created_at: toSqliteDate(g.created_at),
            updated_at: toSqliteDate(g.updated_at),
          });
        } catch (e: any) {
           console.error('[SyncWorker] Error pulling grade:', e.message);
        }
      }
    });

    tx(cloudGrades);

    const reconciled = reconcilePending(db, 'product_grades', 'grade_id', cloudGrades);
    console.log(`[SyncWorker] Pulled ${cloudGrades.length} grades from cloud.${reconciled > 0 ? ` Reconciled ${reconciled}.` : ''}`);
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Pull grades failed:', err.message);
    return false;
  }
}

// ── Pull Products (Cloud → Edge) ─────────────────────────────────────────────
async function pullProducts(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  try {
    const response = await fetch(`${getCloudApiBase()}/api/products`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Pull products failed: HTTP ${response.status}`);
      return false;
    }

    const cloudProducts: any[] = await response.json();
    if (!Array.isArray(cloudProducts) || cloudProducts.length === 0) return false;

    const upsert = db.prepare(`
      INSERT INTO products (
        product_id, tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
        purchase_price, base_price, is_gst_applicable, tax_rate_percent,
        uom, brand_manufacturer, current_stock, reorder_level, is_deleted, domain_attributes,
        discount_percent, discount_flat, offer_price,
        billing_type, grade_id, pricing_mode, average_weight_per_piece, weight_override_allowed,
        print_status, sync_status, created_at, updated_at
      ) VALUES (
        @product_id, @tenant_id, @name, @sku_barcode, @item_code, @category, @hsn_sac_code,
        @purchase_price, @base_price, @is_gst_applicable, @tax_rate_percent,
        @uom, @brand_manufacturer, @current_stock, @reorder_level, @is_deleted, @domain_attributes,
        @discount_percent, @discount_flat, @offer_price,
        @billing_type, @grade_id, @pricing_mode, @average_weight_per_piece, @weight_override_allowed,
        @print_status, 'SYNCED', @created_at, @updated_at
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
        print_status = COALESCE(excluded.print_status, products.print_status),
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
              print_status: currentP.print_status ?? null,
              created_at: toSqliteDate(currentP.created_at),
              updated_at: toSqliteDate(currentP.updated_at),
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

    const reconciled = reconcilePending(db, 'products', 'product_id', cloudProducts);
    console.log(`[SyncWorker] Pulled ${cloudProducts.length} products from cloud.${reconciled > 0 ? ` Reconciled ${reconciled} PENDING.` : ''}`);

    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Pull products failed:', err.message);
    return false;
  }
}

// ── Pull Invoices (Cloud → Edge) ─────────────────────────────────────────────
async function pullInvoices(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  try {
    const response = await fetch(`${getCloudApiBase()}/api/sync/invoices`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Pull invoices failed: HTTP ${response.status}`);
      return false;
    }

    const cloudInvoices: any[] = await response.json();
    if (!Array.isArray(cloudInvoices) || cloudInvoices.length === 0) return false;

    const upsertInv = db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, invoice_number, invoice_type,
        customer_name, customer_phone, subtotal, tax_total,
        discount_total, discount_type, discount_value, grand_total, payment_method,
        received_amount, balance_amount, user_id, sync_status, created_at
      ) VALUES (
        @invoice_id, @tenant_id, @invoice_number, @invoice_type,
        @customer_name, @customer_phone, @subtotal, @tax_total,
        @discount_total, @discount_type, @discount_value, @grand_total, @payment_method,
        @received_amount, @balance_amount, @user_id, 'SYNCED', @created_at
      )
      ON CONFLICT(invoice_id) DO UPDATE SET
        payment_method = EXCLUDED.payment_method,
        received_amount = EXCLUDED.received_amount,
        balance_amount = EXCLUDED.balance_amount,
        user_id = EXCLUDED.user_id,
        discount_total = EXCLUDED.discount_total,
        discount_type = EXCLUDED.discount_type,
        discount_value = EXCLUDED.discount_value,
        grand_total = EXCLUDED.grand_total,
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
              discount_type: currentInv.discount_type || 'FIXED',
              discount_value: currentInv.discount_value ?? 0,
              grand_total: currentInv.grand_total,
              payment_method: currentInv.payment_method || 'CASH',
              received_amount: currentInv.received_amount ?? 0,
              balance_amount: currentInv.balance_amount ?? 0,
              user_id: currentInv.user_id || null,
              created_at: toSqliteDate(currentInv.created_at),
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
    const reconciled = reconcilePending(db, 'invoices', 'invoice_id', cloudInvoices);
    console.log(`[SyncWorker] Pulled ${cloudInvoices.length} invoices from cloud.${reconciled > 0 ? ` Reconciled ${reconciled} PENDING.` : ''}`);
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Pull invoices failed:', err.message);
    return false;
  }
}

// ── Pull Users (Cloud → Edge) ────────────────────────────────────────────────
async function pullUsers(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  try {
    const response = await fetch(`${getCloudApiBase()}/auth/staff`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Pull users failed: HTTP ${response.status}`);
      return false;
    }

    const cloudUsers: any[] = await response.json();
    if (!Array.isArray(cloudUsers) || cloudUsers.length === 0) return false;

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
          created_at: toSqliteDate(u.created_at),
        });
      }
    });

    tx(cloudUsers);
    console.log(`[SyncWorker] Pulled ${cloudUsers.length} users from cloud.`);
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Pull users failed:', err.message);
    return false;
  }
}

// ── Party Sync (Edge → Cloud) ────────────────────────────────────────────────
async function syncParties(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM parties WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} parties to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE parties SET sync_status = 'SYNCED' WHERE party_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const parties = batch.map((p: any) => ({
      ...p,
      is_deleted: !!p.is_deleted,
    }));

    const synced = await pushBatch(
      `${getCloudApiBase()}/api/sync/parties`,
      token,
      parties,
      'parties',
      `Parties batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Pull Parties (Cloud → Edge) ─────────────────────────────────────────────
async function pullParties(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  try {
    const response = await fetch(`${getCloudApiBase()}/api/sync/parties`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Pull parties failed: HTTP ${response.status}`);
      return false;
    }

    const cloudParties: any[] = await response.json();
    if (!Array.isArray(cloudParties) || cloudParties.length === 0) return false;

    const upsert = db.prepare(`
      INSERT INTO parties (
        party_id, tenant_id, name, phone, balance, notes, is_deleted,
        sync_status, created_at, updated_at
      ) VALUES (
        @party_id, @tenant_id, @name, @phone, @balance, @notes, @is_deleted,
        'SYNCED', @created_at, @updated_at
      )
      ON CONFLICT(party_id) DO UPDATE SET
        name = excluded.name,
        phone = excluded.phone,
        balance = excluded.balance,
        notes = excluded.notes,
        is_deleted = excluded.is_deleted,
        created_at = COALESCE(parties.created_at, excluded.created_at),
        updated_at = excluded.updated_at,
        sync_status = 'SYNCED'
      WHERE parties.sync_status != 'PENDING'
    `);

    const tx = db.transaction((parties: any[]) => {
      for (const p of parties) {
        try {
          upsert.run({
            party_id: p.party_id,
            tenant_id: tenantId,
            name: p.name,
            phone: p.phone || null,
            balance: p.balance ?? 0,
            notes: p.notes || null,
            is_deleted: p.is_deleted ? 1 : 0,
            created_at: toSqliteDate(p.created_at),
            updated_at: toSqliteDate(p.updated_at),
          });
        } catch (e: any) {
          console.error('[SyncWorker] Error pulling party:', e.message);
        }
      }
    });

    tx(cloudParties);

    const reconciled = reconcilePending(db, 'parties', 'party_id', cloudParties);
    console.log(`[SyncWorker] Pulled ${cloudParties.length} parties from cloud.${reconciled > 0 ? ` Reconciled ${reconciled}.` : ''}`);
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Pull parties failed:', err.message);
    return false;
  }
}

// ── Pull Settings (Cloud → Edge) ─────────────────────────────────────────────
async function pullSettings(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();
  try {
    const response = await fetch(`${getCloudApiBase()}/api/sync/settings`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Pull settings failed: HTTP ${response.status}`);
      return false;
    }

    const cloudSettings: any[] = await response.json();
    if (!Array.isArray(cloudSettings) || cloudSettings.length === 0) return false;

    const whitelistedKeys = ['price_coding', 'barcode_printer_config', 'receipt_printer_config'];
    const validSettings = cloudSettings.filter(s => whitelistedKeys.includes(s.key));

    if (validSettings.length === 0) return false;

    const localStmt = db.prepare(`SELECT key, value FROM settings WHERE tenant_id = ? AND key = ?`);

    const upsert = db.prepare(`
      INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
      VALUES (@tenant_id, @key, @value, 'SYNCED', @updated_at)
      ON CONFLICT(tenant_id, key) DO UPDATE SET
        value = excluded.value,
        sync_status = 'SYNCED',
        updated_at = excluded.updated_at
    `);

    const tx = db.transaction((settings: any[]) => {
      for (const s of settings) {
        let valueToSave = s.value;

        if (s.key === 'barcode_printer_config' || s.key === 'receipt_printer_config') {
           const localData = localStmt.get(tenantId, s.key) as any;
           if (localData && localData.value) {
             try {
               const localObj = JSON.parse(localData.value);
               if (typeof valueToSave === 'string') {
                 const cloudObj = JSON.parse(valueToSave);
                 if (localObj.deviceName) cloudObj.deviceName = localObj.deviceName;
                 valueToSave = JSON.stringify(cloudObj);
               } else if (typeof valueToSave === 'object') {
                 if (localObj.deviceName) valueToSave.deviceName = localObj.deviceName;
                 valueToSave = JSON.stringify(valueToSave);
               }
             } catch(e) {}
           } else {
             if (typeof valueToSave === 'object') valueToSave = JSON.stringify(valueToSave);
           }
        } else {
           if (typeof valueToSave === 'object') valueToSave = JSON.stringify(valueToSave);
        }

        upsert.run({
          tenant_id: s.tenant_id || tenantId,
          key: s.key,
          value: valueToSave,
          updated_at: toSqliteDate(s.updated_at)
        });
      }
    });

    tx(validSettings);
    console.log(`[SyncWorker] Pulled ${validSettings.length} settings from cloud.`);
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Pull settings failed:', err.message);
    return false;
  }
}
