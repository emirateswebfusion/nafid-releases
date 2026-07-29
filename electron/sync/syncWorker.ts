import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, safeStorage, type WebContents } from 'electron';
import { getDb } from '../db/localDb.js';

// ── Local Time Helpers ────────────────────────────────────────────────────
function localTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function localDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

const getConfigPath = () => path.join(app.getPath('userData'), 'config.json');
const getEncryptedPath = () => path.join(app.getPath('userData'), 'auth.enc');

function decrypt(data: Buffer): string | null {
  if (!safeStorage.isEncryptionAvailable()) return data.toString('utf-8');
  try {
    return safeStorage.decryptString(data);
  } catch {
    return null;
  }
}

function readAuthPayload(): any {
  const encPath = getEncryptedPath();
  if (fs.existsSync(encPath)) {
    const raw = fs.readFileSync(encPath);
    const decrypted = decrypt(raw);
    if (decrypted) return JSON.parse(decrypted);
  }
  const p = getConfigPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

const BATCH_SIZE = 20;
const FETCH_TIMEOUT_MS = 300000;
let syncInProgress = false;
let syncPromise: Promise<void> | null = null;
let currentSyncProgress: { percent: number; label: string; recordsSynced: number; totalRecords: number } | null = null;
let isSyncActive = false;

export function setSyncActive(active: boolean) {
  isSyncActive = active;
  console.log(`[SyncWorker] Sync active state changed to: ${active}`);
}

function getTotalPendingRecords(db: any, tenantId: string): number {
  const tables = ['products', 'invoices', 'product_grades', 'parties', 'party_ledger', 'scrap_categories', 'scrap_transactions', 'purchase_bills', 'purchase_bill_items', 'cash_drawer', 'cash_transactions', 'cashier_audit_log', 'cash_categories', 'returns', 'return_items'];
  const unionQueries = tables.map(t => `SELECT COUNT(*) as cnt FROM ${t} WHERE sync_status = 'PENDING' AND tenant_id = ?`).join(' UNION ALL ');
  const rows = db.prepare(unionQueries).all(...tables.map(() => tenantId)) as { cnt: number }[];
  return rows.reduce((sum, r) => sum + r.cnt, 0);
}

const SYNC_PHASES = [
  'Checking connection...',
  'Uploading grades...',
  'Uploading products...',
  'Uploading invoices...',
  'Uploading settings...',
  'Uploading parties...',
  'Uploading ledger entries...',
  'Uploading scrap categories...',
  'Uploading scrap transactions...',
  'Uploading purchase bills...',
  'Uploading cash drawer...',
  'Uploading cash transactions...',
  'Updating grades...',
  'Updating products...',
  'Updating invoices...',
  'Updating users...',
  'Updating settings...',
  'Updating parties...',
  'Updating ledger entries...',
  'Updating scrap categories...',
  'Updating scrap transactions...',
  'Updating purchase bills...',
  'Updating cash drawer...',
  'Uploading returns...',
  'Updating returns...',
];

function getWebContents(sender?: WebContents): WebContents | null {
  if (sender) return sender;
  const win = BrowserWindow.getAllWindows()[0];
  return win?.webContents ?? null;
}

function notifyProgress(phaseIndex: number, sender?: WebContents, recordsSynced?: number, totalRecords?: number) {
  if (phaseIndex >= 0 && phaseIndex < SYNC_PHASES.length) {
    const percent = Math.round(((phaseIndex + 1) / SYNC_PHASES.length) * 100);
    const db = getDb();
    const config = getAuthConfig();
    const tenantId = config?.tenant_id;
    const remaining = tenantId ? getTotalPendingRecords(db, tenantId) : 0;
    const synced = totalRecords !== undefined ? totalRecords - remaining : (recordsSynced ?? 0);
    const total = totalRecords ?? remaining + synced;
    currentSyncProgress = { percent, label: SYNC_PHASES[phaseIndex], recordsSynced: synced, totalRecords: total };
    const target = getWebContents(sender);
    if (target) target.send('sync:progress', currentSyncProgress);
  }
}

export function getSyncProgress(): { percent: number; label: string; recordsSynced: number; totalRecords: number } | null {
  return currentSyncProgress;
}

function notifyRenderer() {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('sync:data-updated');
  }
}

function notifyCycleComplete() {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('sync:cycle-complete');
  }
}

function notifyOnlineStatus(online: boolean) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('sync:online-status', online);
  }
}

function toSqliteDate(iso: string | number | null | undefined): string {
  if (!iso) return localTimestamp();
  const str = typeof iso === 'string' ? iso : String(iso);
  return str.replace('T', ' ').replace('Z', '');
}

const SYNC_INTERVAL_MINS = parseInt(process.env.VENDORA_SYNC_INTERVAL_MINUTES || '1');
const SYNC_INTERVAL_MS = SYNC_INTERVAL_MINS * 60 * 1000;

function getCloudApiBase() {
  return process.env.VENDORA_CLOUD_API || 'http://localhost:3001';
}

function getAuthConfig(): { jwt_token: string; tenant_id: string } | null {
  try {
    const payload = readAuthPayload();
    if (!payload) return null;
    const { jwt_token, tenant_id, ...rest } = payload;
    return jwt_token && tenant_id ? { jwt_token, tenant_id } : null;
  } catch {
    return null;
  }
}

function isJwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.exp ? payload.exp * 1000 < Date.now() : false;
  } catch {
    return true;
  }
}

async function clearAuthAndNotify() {
  isSyncActive = false;
  const paths = [getConfigPath(), getEncryptedPath()];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('auth:token-expired');
  }
}

export function initSyncWorker() {
  console.log('[SyncWorker] Initializing background sync worker...');
  // We do not run the sync cycle immediately here.
  // The frontend will invoke 'sync:runInitial' once it verifies authentication.
  setInterval(() => {
    if (isSyncActive) {
      runSyncCycle().catch(err => console.error('[SyncWorker] Background sync error:', err.message));
    }
  }, SYNC_INTERVAL_MS);
}

export async function runInitialSync(sender?: WebContents) {
  console.log('[SyncWorker] Running explicit initial sync...');
  isSyncActive = true;
  await runSyncCycle(sender);
  return { success: true };
}

async function runSyncCycle(sender?: WebContents): Promise<void> {
  if (syncInProgress) {
    console.log('[SyncWorker] Sync already in progress, waiting for it...');
    return syncPromise ?? Promise.resolve();
  }

  syncInProgress = true;
  currentSyncProgress = null;

  syncPromise = (async () => {
    try {
      try {
        notifyProgress(0, sender);
        const res = await fetch(getCloudApiBase() + '/health', { method: 'GET', signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
          console.log('[SyncWorker] Cloud offline. Skipping sync cycle.');
          notifyOnlineStatus(false);
          return;
        }
      } catch {
        console.log('[SyncWorker] Offline. Skipping sync cycle.');
        notifyOnlineStatus(false);
        return;
      }

      notifyOnlineStatus(true);
      console.log('[SyncWorker] Online. Running sync...');

      const config = getAuthConfig();
      if (!config) {
        console.warn('[SyncWorker] No JWT token found. Please log in to enable cloud sync.');
        return;
      }

      const { jwt_token, tenant_id } = config;

      if (isJwtExpired(jwt_token)) {
        console.warn('[SyncWorker] JWT token has expired. Clearing auth...');
        await clearAuthAndNotify();
        return;
      }
      let dataUpdated = false;
      const db = getDb();
      const totalRecords = getTotalPendingRecords(db, tenant_id);

      try {
        notifyProgress(1, sender, 0, totalRecords); await syncGrades(jwt_token, tenant_id);
        notifyProgress(2, sender, undefined, totalRecords); await syncProducts(jwt_token, tenant_id);
        notifyProgress(3, sender, undefined, totalRecords); await syncInvoices(jwt_token, tenant_id);
        notifyProgress(4, sender, undefined, totalRecords); await syncSettings(jwt_token, tenant_id);
        notifyProgress(5, sender, undefined, totalRecords); await syncParties(jwt_token, tenant_id);
        notifyProgress(5.1, sender, undefined, totalRecords); await pushCustomers(jwt_token, tenant_id);
        notifyProgress(5.2, sender, undefined, totalRecords); await pushLoyaltyTransactions(jwt_token, tenant_id);
        notifyProgress(6, sender, undefined, totalRecords); await syncPartyLedger(jwt_token, tenant_id);
        notifyProgress(7, sender, undefined, totalRecords); await syncScrapCategories(jwt_token, tenant_id);
        notifyProgress(8, sender, undefined, totalRecords); await syncScrapTransactions(jwt_token, tenant_id);
        notifyProgress(9, sender, undefined, totalRecords); await syncPurchaseBills(jwt_token, tenant_id);
        notifyProgress(10, sender, undefined, totalRecords); await syncCashDrawer(jwt_token, tenant_id);
        notifyProgress(11, sender, undefined, totalRecords); await syncCashTransactions(jwt_token, tenant_id);
        notifyProgress(12, sender, undefined, totalRecords); await syncCashCategories(jwt_token, tenant_id);
        notifyProgress(12.1, sender, undefined, totalRecords); await syncReturns(jwt_token, tenant_id);

        notifyProgress(13, sender, undefined, totalRecords); if (await pullGrades(jwt_token, tenant_id)) dataUpdated = true;
        notifyProgress(14, sender, undefined, totalRecords); if (await pullProducts(jwt_token, tenant_id)) dataUpdated = true;
        notifyProgress(15, sender, undefined, totalRecords); if (await pullInvoices(jwt_token, tenant_id)) dataUpdated = true;
        notifyProgress(16, sender, undefined, totalRecords); if (await pullUsers(jwt_token, tenant_id)) dataUpdated = true;
        notifyProgress(17, sender, undefined, totalRecords); if (await pullSettings(jwt_token, tenant_id)) dataUpdated = true;
        notifyProgress(18, sender, undefined, totalRecords); if (await pullParties(jwt_token, tenant_id)) dataUpdated = true;
        notifyProgress(19, sender, undefined, totalRecords); if (await pullPartyLedger(jwt_token, tenant_id)) dataUpdated = true;
        notifyProgress(19.1, sender, undefined, totalRecords); if (await pullCustomers(jwt_token, tenant_id)) dataUpdated = true;
        notifyProgress(19.2, sender, undefined, totalRecords); if (await pullLoyaltyTransactions(jwt_token, tenant_id)) dataUpdated = true;
        notifyProgress(20, sender, undefined, totalRecords); if (await pullScrapCategories(jwt_token, tenant_id)) dataUpdated = true;
        notifyProgress(21, sender, undefined, totalRecords); if (await pullScrapTransactions(jwt_token, tenant_id)) dataUpdated = true;
        notifyProgress(22, sender, undefined, totalRecords); if (await pullPurchaseBills(jwt_token, tenant_id)) dataUpdated = true;
        notifyProgress(23, sender, undefined, totalRecords); if (await pullCashDrawer(jwt_token, tenant_id)) dataUpdated = true;
        notifyProgress(23.1, sender, undefined, totalRecords); if (await pullReturns(jwt_token, tenant_id)) dataUpdated = true;
      } catch (err: any) {
        console.error('[SyncWorker] Sync cycle error:', err.message);
      }

      if (dataUpdated) {
        notifyRenderer();
      }
      notifyCycleComplete();
    } finally {
      syncInProgress = false;
      syncPromise = null;
    }
  })();

  return syncPromise;
}

// ── Batch push helper with retries ───────────────────────────────────────────────
async function pushBatch<T>(
  url: string,
  token: string,
  batch: T[],
  bodyKey: string,
  label: string,
): Promise<string[]> {
  if (batch.length === 0) return [];

  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ [bodyKey]: batch }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.error(`[SyncWorker] ${label} failed: HTTP 401 (token expired). Clearing auth...`);
          await clearAuthAndNotify();
          return [];
        }
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
      const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('aborted');
      const isNetworkError = err.message?.includes('fetch failed') || err.message?.includes('ENOTFOUND') || err.message?.includes('ECONNREFUSED');

      if (attempt < MAX_RETRIES && (isTimeout || isNetworkError)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[SyncWorker] ${label} attempt ${attempt}/${MAX_RETRIES} failed (${err.message}). Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      console.error(`[SyncWorker] ${label} batch error after ${attempt} attempt(s): ${err.message}`);
      return [];
    }
  }

  return [];
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
      is_deleted: p.is_deleted === true || p.is_deleted === 1 || p.is_deleted === '1' || p.is_deleted === 'true',
      is_gst_applicable: p.is_gst_applicable === true || p.is_gst_applicable === 1 || p.is_gst_applicable === '1' || p.is_gst_applicable === 'true',
      weight_override_allowed: p.weight_override_allowed === true || p.weight_override_allowed === 1 || p.weight_override_allowed === '1' || p.weight_override_allowed === 'true',
      is_service_item: p.is_service_item === true || p.is_service_item === 1 || p.is_service_item === '1' || p.is_service_item === 'true',
      domain_attributes: (() => { 
          try { 
            const parsed = JSON.parse(p.domain_attributes || '{}');
            return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
          } catch { return {}; }
        })(),
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
  const pending = db.prepare(`SELECT * FROM invoices WHERE sync_status = 'PENDING' AND tenant_id = ? AND invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD')`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} invoices to cloud in batches of ${BATCH_SIZE}...`);

  const getItems = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ? AND tenant_id = ?`);
  const updateStmt = db.prepare(`UPDATE invoices SET sync_status = 'SYNCED' WHERE invoice_id = ? AND tenant_id = ?`);

  let totalSynced = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const invoicesWithItems = batch.map((inv: any) => ({
      ...inv,
      subtotal: Number(inv.subtotal) || 0,
      tax_total: Number(inv.tax_total) || 0,
      grand_total: Number(inv.grand_total) || 0,
      discount_total: Number(inv.discount_total) || 0,
      discount_value: Number(inv.discount_value) || 0,
      received_amount: Number(inv.received_amount) || 0,
      balance_amount: Number(inv.balance_amount) || 0,
      scrap_deduction: Number(inv.scrap_deduction) || 0,
      points_earned: Number(inv.points_earned) || 0,
      points_redeemed: Number(inv.points_redeemed) || 0,
      points_redeemed_discount: Number(inv.points_redeemed_discount) || 0,
      previous_points_balance: Number(inv.previous_points_balance) || 0,
      remaining_points_balance: Number(inv.remaining_points_balance) || 0,
      items: (getItems.all(inv.invoice_id, tenantId) as any[]).map((item: any) => ({
        ...item,
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price) || 0,
        total: Number(item.total) || 0,
        tax_amount: Number(item.tax_amount) || 0,
      })),
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
  const pending = db.prepare(`SELECT * FROM settings WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

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
        is_service_item, print_status, sync_status, created_at, updated_at
      ) VALUES (
        @product_id, @tenant_id, @name, @sku_barcode, @item_code, @category, @hsn_sac_code,
        @purchase_price, @base_price, @is_gst_applicable, @tax_rate_percent,
        @uom, @brand_manufacturer, @current_stock, @reorder_level, @is_deleted, @domain_attributes,
        @discount_percent, @discount_flat, @offer_price,
        @billing_type, @grade_id, @pricing_mode, @average_weight_per_piece, @weight_override_allowed,
        @is_service_item, @print_status, 'SYNCED', @created_at, @updated_at
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
        is_service_item = excluded.is_service_item,
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
              domain_attributes: currentP.domain_attributes 
                ? (typeof currentP.domain_attributes === 'string' ? currentP.domain_attributes : JSON.stringify(currentP.domain_attributes)) 
                : '{}',
              discount_percent: currentP.discount_percent ?? null,
              discount_flat: currentP.discount_flat ?? null,
              offer_price: currentP.offer_price ?? null,
              billing_type: currentP.billing_type || 'PIECE',
              grade_id: currentP.grade_id || null,
              pricing_mode: currentP.pricing_mode || 'FIXED_PRICE',
              average_weight_per_piece: currentP.average_weight_per_piece ?? null,
              weight_override_allowed: currentP.weight_override_allowed ? 1 : 0,
              is_service_item: currentP.is_service_item ? 1 : 0,
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
        customer_name, customer_phone, customer_gstin, customer_state, customer_address,
        subtotal, tax_total,
        discount_total, discount_type, discount_value, grand_total, payment_method,
        received_amount, balance_amount, user_id, sync_status, created_at
      ) VALUES (
        @invoice_id, @tenant_id, @invoice_number, @invoice_type,
        @customer_name, @customer_phone, @customer_gstin, @customer_state, @customer_address,
        @subtotal, @tax_total,
        @discount_total, @discount_type, @discount_value, @grand_total, @payment_method,
        @received_amount, @balance_amount, @user_id, 'SYNCED', @created_at
      )
      ON CONFLICT(invoice_id) DO UPDATE SET
        customer_gstin = EXCLUDED.customer_gstin,
        customer_state = EXCLUDED.customer_state,
        customer_address = EXCLUDED.customer_address,
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
              payment_method: currentInv.payment_method || 'PENDING',
              received_amount: currentInv.received_amount ?? 0,
              balance_amount: currentInv.balance_amount ?? 0,
              user_id: currentInv.user_id || null,
              created_at: toSqliteDate(currentInv.created_at),
              customer_gstin: currentInv.customer_gstin || null,
              customer_state: currentInv.customer_state || null,
              customer_address: currentInv.customer_address || null,
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
      INSERT INTO users (user_id, tenant_id, name, email, role, restricted_page, created_at)
      VALUES (@user_id, @tenant_id, @name, @email, @role, @restricted_page, @created_at)
      ON CONFLICT(user_id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        role = excluded.role,
        restricted_page = excluded.restricted_page
    `);

    const tx = db.transaction((users: any[]) => {
      for (const u of users) {
        upsert.run({
          user_id: u.user_id,
          tenant_id: tenantId,
          name: u.name,
          email: u.email,
          role: u.role,
          restricted_page: u.restricted_page || null,
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

async function pushCustomers(token: string, tenantId: string): Promise<boolean> {
  try {
    const pending = getDb().prepare(
      `SELECT * FROM customers WHERE tenant_id = ? AND sync_status IN ('PENDING', 'FAILED')`
    ).all(tenantId);
    if (!Array.isArray(pending) || pending.length === 0) return true;
    const response = await fetch(`${getCloudApiBase()}/api/sync/customers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ customers: pending }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const result = await response.json();
    if (Array.isArray(result.synced) && result.synced.length > 0) {
      const markSynced = getDb().prepare(`UPDATE customers SET sync_status = 'SYNCED', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?`);
      const tx = getDb().transaction((ids: string[]) => { for (const id of ids) markSynced.run(id); });
      tx(result.synced);
    }
    if (Array.isArray(result.failed) && result.failed.length > 0) {
      const markFailed = getDb().prepare(`UPDATE customers SET sync_status = 'FAILED', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?`);
      const tx = getDb().transaction((items: any[]) => { for (const f of items) markFailed.run(f.customer_id); });
      tx(result.failed);
    }
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Push customers failed:', err.message);
    return false;
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
        party_id, tenant_id, name, phone, address, gstin, balance, balance_type, notes, last_transaction_date, is_deleted,
        sync_status, created_at, updated_at
      ) VALUES (
        @party_id, @tenant_id, @name, @phone, @address, @gstin, @balance, @balance_type, @notes, @last_transaction_date, @is_deleted,
        'SYNCED', @created_at, @updated_at
      )
      ON CONFLICT(party_id) DO UPDATE SET
        name = excluded.name,
        phone = excluded.phone,
        address = excluded.address,
        gstin = excluded.gstin,
        balance = excluded.balance,
        balance_type = excluded.balance_type,
        notes = excluded.notes,
        last_transaction_date = excluded.last_transaction_date,
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
            address: p.address || null,
            gstin: p.gstin || null,
            balance: p.balance ?? 0,
            balance_type: p.balance_type || 'RECEIVABLE',
            notes: p.notes || null,
            last_transaction_date: p.last_transaction_date ? toSqliteDate(p.last_transaction_date) : null,
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

// ── Party Ledger Sync (Edge → Cloud) ──────────────────────────────────────────
async function syncPartyLedger(token: string, tenantId: string) {
  const db = getDb();
  const pendingEntries = db.prepare(`SELECT * FROM party_ledger WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];
  if (pendingEntries.length === 0) return;

  console.log(`[SyncWorker] Pushing ${pendingEntries.length} party ledger entries to cloud...`);
  const updateStmt = db.prepare(`UPDATE party_ledger SET sync_status = 'SYNCED' WHERE ledger_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pendingEntries.length; i += BATCH_SIZE) {
    const batch = pendingEntries.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      `${getCloudApiBase()}/api/sync/party-ledger`,
      token,
      batch,
      'entries',
      `Party Ledger batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

async function pushLoyaltyTransactions(token: string, tenantId: string): Promise<boolean> {
  try {
    const db = getDb();
    const pending = db.prepare(
      `SELECT * FROM loyalty_transactions WHERE tenant_id = ? AND sync_status IN ('PENDING', 'FAILED')`
    ).all(tenantId);
    if (!Array.isArray(pending) || pending.length === 0) return true;
    const response = await fetch(`${getCloudApiBase()}/api/sync/loyalty-transactions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ loyalty_transactions: pending }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const result = await response.json();
    if (Array.isArray(result.synced) && result.synced.length > 0) {
      const markSynced = db.prepare("UPDATE loyalty_transactions SET sync_status = 'SYNCED' WHERE transaction_id = ?");
      const tx = db.transaction((ids: string[]) => { for (const id of ids) markSynced.run(id); });
      tx(result.synced);
    }
    if (Array.isArray(result.failed) && result.failed.length > 0) {
      const markFailed = db.prepare("UPDATE loyalty_transactions SET sync_status = 'FAILED' WHERE transaction_id = ?");
      const tx = db.transaction((items: any[]) => { for (const item of items) markFailed.run(item.transaction_id); });
      tx(result.failed);
    }
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Push loyalty transactions failed:', err.message);
    return false;
  }
}

// ── Pull Party Ledger (Cloud → Edge) ─────────────────────────────────────────
async function pullPartyLedger(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const doFetch = async (): Promise<Response> => {
    return fetch(`${getCloudApiBase()}/api/sync/party-ledger`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  };

  let response: Response;
  try {
    response = await doFetch();
  } catch (err: any) {
    console.error('[SyncWorker] Pull party ledger network error:', err.message);
    return false;
  }

  if (!response.ok) {
    if (response.status !== 404) {
      let body = '';
      try { body = await response.text(); } catch { /* ignore */ }
      console.error(`[SyncWorker] Pull party ledger failed: HTTP ${response.status} — ${body}`);
    }
    return false;
  }

  try {
    const cloudEntries: any[] = await response.json();
    if (!Array.isArray(cloudEntries) || cloudEntries.length === 0) return false;

    const upsert = db.prepare(`
      INSERT INTO party_ledger (
        ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount,
        running_balance, reference_number, created_by, created_by_name, sync_status, created_at, updated_at
      ) VALUES (
        @ledger_id, @party_id, @tenant_id, @transaction_date, @description, @credit_amount, @debit_amount,
        @running_balance, @reference_number, @created_by, @created_by_name, 'SYNCED', @created_at, @updated_at
      )
      ON CONFLICT(ledger_id) DO UPDATE SET
        transaction_date = excluded.transaction_date,
        description = excluded.description,
        credit_amount = excluded.credit_amount,
        debit_amount = excluded.debit_amount,
        running_balance = excluded.running_balance,
        reference_number = excluded.reference_number,
        created_by = excluded.created_by,
        created_by_name = excluded.created_by_name,
        updated_at = excluded.updated_at,
        sync_status = 'SYNCED'
    `);

    const tx = db.transaction((entries: any[]) => {
      for (const e of entries) {
        try {
          upsert.run({
            ledger_id: e.ledger_id,
            party_id: e.party_id,
            tenant_id: tenantId,
            transaction_date: toSqliteDate(e.transaction_date),
            description: e.description,
            credit_amount: e.credit_amount ?? 0,
            debit_amount: e.debit_amount ?? 0,
            running_balance: e.running_balance ?? 0,
            reference_number: e.reference_number || null,
            created_by: e.created_by || null,
            created_by_name: e.created_by_name || null,
            created_at: toSqliteDate(e.created_at),
            updated_at: toSqliteDate(e.updated_at),
          });
        } catch (err: any) {
          console.error('[SyncWorker] Error pulling ledger entry:', err.message);
        }
      }
    });
    tx(cloudEntries);
    const reconciled = reconcilePending(db, 'party_ledger', 'ledger_id', cloudEntries);
    console.log(`[SyncWorker] Pulled ${cloudEntries.length} ledger entries from cloud.${reconciled > 0 ? ` Reconciled ${reconciled}.` : ''}`);
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Pull party ledger failed:', err.message);
    return false;
  }
}

// ── Scrap Categories Sync (Edge → Cloud) ─────────────────────────────────────
async function syncScrapCategories(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM scrap_categories WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} scrap categories to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE scrap_categories SET sync_status = 'SYNCED' WHERE scrap_category_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const categories = batch.map((c: any) => ({
      ...c,
      is_deleted: !!c.is_deleted,
    }));

    const synced = await pushBatch(
      `${getCloudApiBase()}/api/sync/scrap_categories`,
      token,
      categories,
      'scrap_categories',
      `Scrap Categories batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Scrap Transactions Sync (Edge → Cloud) ──────────────────────────────────
async function syncScrapTransactions(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM scrap_transactions WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} scrap transactions to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE scrap_transactions SET sync_status = 'SYNCED' WHERE transaction_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      `${getCloudApiBase()}/api/sync/scrap_transactions`,
      token,
      batch,
      'scrap_transactions',
      `Scrap Transactions batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Pull Scrap Categories (Cloud → Edge) ────────────────────────────────────
async function pullScrapCategories(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  try {
    const response = await fetch(`${getCloudApiBase()}/api/sync/scrap_categories`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Pull scrap categories failed: HTTP ${response.status}`);
      return false;
    }

    const cloudCategories: any[] = await response.json();
    if (!Array.isArray(cloudCategories) || cloudCategories.length === 0) return false;

    const upsert = db.prepare(`
      INSERT INTO scrap_categories (
        scrap_category_id, tenant_id, name, purchase_price, selling_price, current_stock, unit, is_deleted,
        sync_status, created_at, updated_at
      ) VALUES (
        @scrap_category_id, @tenant_id, @name, @purchase_price, @selling_price, @current_stock, @unit, @is_deleted,
        'SYNCED', @created_at, @updated_at
      )
      ON CONFLICT(scrap_category_id) DO UPDATE SET
        name = excluded.name,
        purchase_price = excluded.purchase_price,
        selling_price = excluded.selling_price,
        unit = excluded.unit,
        is_deleted = excluded.is_deleted,
        created_at = COALESCE(scrap_categories.created_at, excluded.created_at),
        updated_at = excluded.updated_at,
        sync_status = 'SYNCED'
      WHERE scrap_categories.sync_status != 'PENDING'
    `);

    const tx = db.transaction((categories: any[]) => {
      for (const c of categories) {
        try {
          upsert.run({
            scrap_category_id: c.scrap_category_id,
            tenant_id: tenantId,
            name: c.name,
            purchase_price: c.purchase_price ?? 0,
            selling_price: c.selling_price ?? 0,
            current_stock: c.current_stock ?? 0,
            unit: c.unit || 'Kgs',
            is_deleted: c.is_deleted ? 1 : 0,
            created_at: toSqliteDate(c.created_at),
            updated_at: toSqliteDate(c.updated_at),
          });
        } catch (e: any) {
          console.error('[SyncWorker] Error pulling scrap category:', e.message);
        }
      }
    });

    tx(cloudCategories);

    const reconciled = reconcilePending(db, 'scrap_categories', 'scrap_category_id', cloudCategories);
    console.log(`[SyncWorker] Pulled ${cloudCategories.length} scrap categories from cloud.${reconciled > 0 ? ` Reconciled ${reconciled}.` : ''}`);
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Pull scrap categories failed:', err.message);
    return false;
  }
}

// ── Pull Scrap Transactions (Cloud → Edge) ─────────────────────────────────
async function pullScrapTransactions(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  try {
    const response = await fetch(`${getCloudApiBase()}/api/sync/scrap_transactions`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Pull scrap transactions failed: HTTP ${response.status}`);
      return false;
    }

    const cloudTransactions: any[] = await response.json();
    if (!Array.isArray(cloudTransactions) || cloudTransactions.length === 0) return false;

    const upsert = db.prepare(`
      INSERT INTO scrap_transactions (
        transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, transaction_date, created_at,
        is_deleted, sync_status
      ) VALUES (
        @transaction_id, @tenant_id, @type, @scrap_category_id, @quantity, @rate, @total_amount, @party_name, @customer_phone, @customer_address, @notes, @scrap_invoice_number, @transaction_date, @created_at,
        COALESCE(@is_deleted, 0), 'SYNCED'
      )
      ON CONFLICT(transaction_id) DO UPDATE SET
        type = excluded.type,
        quantity = excluded.quantity,
        rate = excluded.rate,
        total_amount = excluded.total_amount,
        party_name = excluded.party_name,
        customer_phone = excluded.customer_phone,
        customer_address = excluded.customer_address,
        notes = excluded.notes,
        scrap_invoice_number = excluded.scrap_invoice_number,
        is_deleted = COALESCE(excluded.is_deleted, 0),
        sync_status = 'SYNCED'
      WHERE scrap_transactions.sync_status != 'PENDING'
    `);

    const tx = db.transaction((transactions: any[]) => {
      for (const t of transactions) {
        try {
          upsert.run({
            transaction_id: t.transaction_id,
            tenant_id: tenantId,
            type: t.type,
            scrap_category_id: t.scrap_category_id,
            quantity: t.quantity,
            rate: t.rate,
            total_amount: t.total_amount ?? 0,
            party_name: t.party_name || null,
            customer_phone: t.customer_phone || null,
            customer_address: t.customer_address || null,
            notes: t.notes || null,
            scrap_invoice_number: t.scrap_invoice_number || null,
            is_deleted: t.is_deleted ? 1 : 0,
            transaction_date: toSqliteDate(t.transaction_date),
            created_at: toSqliteDate(t.created_at),
          });
        } catch (e: any) {
          console.error('[SyncWorker] Error pulling scrap transaction:', e.message);
        }
      }
    });

    tx(cloudTransactions);

    const reconciled = reconcilePending(db, 'scrap_transactions', 'transaction_id', cloudTransactions);
    console.log(`[SyncWorker] Pulled ${cloudTransactions.length} scrap transactions from cloud.${reconciled > 0 ? ` Reconciled ${reconciled}.` : ''}`);
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Pull scrap transactions failed:', err.message);
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

    const allowedKeys = [
      'shop_name', 'shop_phone', 'shop_address', 'shop_gstin', 'shop_state',
      'upi_id', 'show_upi_qr', 'show_product_offers',
      'enable_scrap', 'gst_profit_percentage', 'loyalty_config',
      'price_coding', 'barcode_printer_config', 'receipt_printer_config',
      'a4_printer_config', 'scale_config',
      'print_format', 'label_code_type',
      'terminal_code', 'invoice_counter_config',
      'three_invoice_series', 'gst_b2b_invoice_counter_config', 'gst_b2c_invoice_counter_config',
      'isDomainConfirmed',
    ];
    const validSettings = cloudSettings.filter(s => allowedKeys.includes(s.key));

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
                 let cloudObj: any;
                 try {
                   cloudObj = JSON.parse(valueToSave);
                 } catch {
                   // Cloud value is a plain string (e.g. "barcode") — wrap as type field
                   cloudObj = { type: valueToSave };
                 }
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

        if (typeof valueToSave !== 'string') valueToSave = String(valueToSave);

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

// ── Sync Purchase Bills (Edge → Cloud) ───────────────────────────────────────
async function syncPurchaseBills(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM purchase_bills WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} purchase bills to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE purchase_bills SET sync_status = 'SYNCED' WHERE purchase_bill_id = ? AND tenant_id = ?`);
  const itemsUpdateStmt = db.prepare(`UPDATE purchase_bill_items SET sync_status = 'SYNCED' WHERE purchase_bill_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    // Enrich with items
    const enriched = batch.map((bill: any) => {
      const items = db.prepare(`SELECT * FROM purchase_bill_items WHERE purchase_bill_id = ? AND tenant_id = ?`).all(bill.purchase_bill_id, tenantId);
      return { ...bill, items };
    });
    const synced = await pushBatch(
      `${getCloudApiBase()}/api/sync/purchase_bills`,
      token,
      enriched,
      'purchase_bills',
      `Purchase Bills batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => {
        for (const id of ids) {
          updateStmt.run(id, tenantId);
          itemsUpdateStmt.run(id, tenantId);
        }
      });
      tx(synced);
    }
  }
}

// ── Pull Purchase Bills (Cloud → Edge) ───────────────────────────────────────
async function pullPurchaseBills(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  try {
    const response = await fetch(`${getCloudApiBase()}/api/sync/purchase_bills?tenant_id=${tenantId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Pull purchase bills failed: HTTP ${response.status}`);
      return false;
    }

    const cloudBills: any[] = await response.json();
    if (!Array.isArray(cloudBills) || cloudBills.length === 0) return false;

    const upsertBill = db.prepare(`
      INSERT INTO purchase_bills (
        purchase_bill_id, tenant_id, bill_number, supplier_id, supplier_name, bill_date, invoice_number, notes, total_amount,
        bill_type, payment_type, sync_status, created_at, updated_at
      ) VALUES (
        @purchase_bill_id, @tenant_id, @bill_number, @supplier_id, @supplier_name, @bill_date, @invoice_number, @notes, @total_amount,
        @bill_type, @payment_type, 'SYNCED', @created_at, @updated_at
      )
      ON CONFLICT(purchase_bill_id) DO UPDATE SET
        bill_number = excluded.bill_number,
        supplier_id = excluded.supplier_id,
        supplier_name = excluded.supplier_name,
        bill_date = excluded.bill_date,
        invoice_number = excluded.invoice_number,
        notes = excluded.notes,
        total_amount = excluded.total_amount,
        bill_type = excluded.bill_type,
        payment_type = excluded.payment_type,
        created_at = COALESCE(purchase_bills.created_at, excluded.created_at),
        updated_at = excluded.updated_at,
        sync_status = 'SYNCED'
      WHERE purchase_bills.sync_status != 'PENDING'
    `);

    const upsertItem = db.prepare(`
      INSERT INTO purchase_bill_items (
        item_id, purchase_bill_id, tenant_id, product_id, name, quantity, purchase_price, total_amount,
        is_gst_applicable, tax_rate_percent, hsn_sac_code, sync_status, created_at, updated_at
      ) VALUES (
        @item_id, @purchase_bill_id, @tenant_id, @product_id, @name, @quantity, @purchase_price, @total_amount,
        @is_gst_applicable, @tax_rate_percent, @hsn_sac_code, 'SYNCED', @created_at, @updated_at
      )
      ON CONFLICT(item_id) DO UPDATE SET
        product_id = excluded.product_id,
        name = excluded.name,
        quantity = excluded.quantity,
        purchase_price = excluded.purchase_price,
        total_amount = excluded.total_amount,
        is_gst_applicable = excluded.is_gst_applicable,
        tax_rate_percent = excluded.tax_rate_percent,
        hsn_sac_code = excluded.hsn_sac_code,
        created_at = COALESCE(purchase_bill_items.created_at, excluded.created_at),
        updated_at = excluded.updated_at,
        sync_status = 'SYNCED'
      WHERE purchase_bill_items.sync_status != 'PENDING'
    `);

    const tx = db.transaction((bills: any[]) => {
      for (const bill of bills) {
        try {
          upsertBill.run({
            purchase_bill_id: bill.purchase_bill_id,
            tenant_id: tenantId,
            bill_number: bill.bill_number,
            supplier_id: bill.supplier_id || null,
            supplier_name: bill.supplier_name,
            bill_date: bill.bill_date || null,
            invoice_number: bill.invoice_number || null,
            notes: bill.notes || null,
            total_amount: bill.total_amount ?? 0,
            bill_type: bill.bill_type || 'GST',
            payment_type: bill.payment_type || 'CASH',
            created_at: toSqliteDate(bill.created_at),
            updated_at: toSqliteDate(bill.updated_at),
          });
          if (Array.isArray(bill.items)) {
            for (const item of bill.items) {
              upsertItem.run({
                item_id: item.item_id,
                purchase_bill_id: bill.purchase_bill_id,
                tenant_id: tenantId,
                product_id: item.product_id,
                name: item.name,
                quantity: item.quantity ?? 0,
                purchase_price: item.purchase_price ?? 0,
                total_amount: item.total_amount ?? 0,
                is_gst_applicable: item.is_gst_applicable === false ? 0 : 1,
                tax_rate_percent: item.tax_rate_percent ?? 0,
                hsn_sac_code: item.hsn_sac_code || null,
                created_at: toSqliteDate(item.created_at),
                updated_at: toSqliteDate(item.updated_at),
              });
            }
          }
        } catch (e: any) {
          console.error('[SyncWorker] Error pulling purchase bill:', e.message);
        }
      }
    });

    tx(cloudBills);

    const reconciled = reconcilePending(db, 'purchase_bills', 'purchase_bill_id', cloudBills);
    console.log(`[SyncWorker] Pulled ${cloudBills.length} purchase bills from cloud.${reconciled > 0 ? ` Reconciled ${reconciled}.` : ''}`);
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Pull purchase bills failed:', err.message);
    return false;
  }
}

// ── Cash Drawer Sync (Edge → Cloud) ─────────────────────────────────────────────
async function syncCashDrawer(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM cash_drawer WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} cash drawer records to cloud...`);

  const updateStmt = db.prepare(`UPDATE cash_drawer SET sync_status = 'SYNCED' WHERE drawer_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      `${getCloudApiBase()}/api/sync/cash_drawer`,
      token, batch, 'cash_drawer', `Cash Drawer batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Cash Transactions Sync (Edge → Cloud) ───────────────────────────────────────
async function syncCashTransactions(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM cash_transactions WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} cash transactions to cloud...`);

  const updateStmt = db.prepare(`UPDATE cash_transactions SET sync_status = 'SYNCED' WHERE transaction_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      `${getCloudApiBase()}/api/sync/cash_transactions`,
      token, batch, 'cash_transactions', `Cash Transactions batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Cash Categories Sync (Edge → Cloud) ─────────────────────────────────────────
async function syncCashCategories(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM cash_categories WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} cash categories to cloud...`);

  const updateStmt = db.prepare(`UPDATE cash_categories SET sync_status = 'SYNCED' WHERE category_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      `${getCloudApiBase()}/api/sync/cash_categories`,
      token, batch, 'cash_categories', `Cash Categories batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Pull Cash Drawer (Cloud → Edge) ─────────────────────────────────────────────
async function pullCashDrawer(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  try {
    const response = await fetch(`${getCloudApiBase()}/api/sync/cash_drawer`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Pull cash drawer failed: HTTP ${response.status}`);
      return false;
    }

    const cloudRows: any[] = await response.json();
    if (!Array.isArray(cloudRows) || cloudRows.length === 0) return false;

    const upsert = db.prepare(`
      INSERT INTO cash_drawer (
        drawer_id, tenant_id, business_date, opening_balance, cash_sales, cash_in, cash_out,
        current_cash, expected_closing, actual_cash, cash_short, cash_excess, closing_remarks,
        status, opened_by, closed_by, opened_at, closed_at, sync_status, created_at, updated_at
      ) VALUES (
        @drawer_id, @tenant_id, @business_date, @opening_balance, @cash_sales, @cash_in, @cash_out,
        @current_cash, @expected_closing, @actual_cash, @cash_short, @cash_excess, @closing_remarks,
        @status, @opened_by, @closed_by, @opened_at, @closed_at, 'SYNCED', @created_at, @updated_at
      )
      ON CONFLICT(drawer_id) DO UPDATE SET
        opening_balance = excluded.opening_balance, cash_sales = excluded.cash_sales,
        cash_in = excluded.cash_in, cash_out = excluded.cash_out,
        current_cash = excluded.current_cash, expected_closing = excluded.expected_closing,
        actual_cash = excluded.actual_cash, cash_short = excluded.cash_short,
        cash_excess = excluded.cash_excess, closing_remarks = excluded.closing_remarks,
        status = excluded.status, closed_by = excluded.closed_by,
        closed_at = excluded.closed_at, updated_at = excluded.updated_at,
        sync_status = 'SYNCED'
      WHERE cash_drawer.sync_status != 'PENDING'
    `);

    const tx = db.transaction((rows: any[]) => {
      for (const r of rows) {
        try {
          upsert.run({
            drawer_id: r.drawer_id,
            tenant_id: tenantId,
            business_date: r.business_date,
            opening_balance: r.opening_balance ?? 0,
            cash_sales: r.cash_sales ?? 0,
            cash_in: r.cash_in ?? 0,
            cash_out: r.cash_out ?? 0,
            current_cash: r.current_cash ?? 0,
            expected_closing: r.expected_closing ?? 0,
            actual_cash: r.actual_cash ?? null,
            cash_short: r.cash_short ?? 0,
            cash_excess: r.cash_excess ?? 0,
            closing_remarks: r.closing_remarks || null,
            status: r.status || 'OPEN',
            opened_by: r.opened_by || null,
            closed_by: r.closed_by || null,
            opened_at: toSqliteDate(r.opened_at),
            closed_at: toSqliteDate(r.closed_at),
            created_at: toSqliteDate(r.created_at),
            updated_at: toSqliteDate(r.updated_at),
          });
        } catch (e: any) {
          console.error('[SyncWorker] Error pulling cash drawer:', e.message);
        }
      }
    });

    tx(cloudRows);

    const reconciled = reconcilePending(db, 'cash_drawer', 'drawer_id', cloudRows);
    console.log(`[SyncWorker] Pulled ${cloudRows.length} cash drawer records from cloud.${reconciled > 0 ? ` Reconciled ${reconciled}.` : ''}`);
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Pull cash drawer failed:', err.message);
    return false;
  }
}

async function pullCustomers(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();
  try {
    const response = await fetch(`${getCloudApiBase()}/api/sync/customers`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const cloudRows: any[] = await response.json();
    if (!Array.isArray(cloudRows) || cloudRows.length === 0) return false;

    const upsert = db.prepare(`
      INSERT INTO customers (customer_id, tenant_id, name, phone, address,
        total_points_earned, total_points_redeemed, current_points_balance,
        last_purchase_date, sync_status, created_at, updated_at)
      VALUES (@customer_id, @tenant_id, @name, @phone, @address,
        @total_points_earned, @total_points_redeemed, @current_points_balance,
        @last_purchase_date, 'SYNCED', @created_at, @updated_at)
      ON CONFLICT(customer_id) DO UPDATE SET
        name = excluded.name, phone = excluded.phone, address = excluded.address,
        total_points_earned = excluded.total_points_earned,
        total_points_redeemed = excluded.total_points_redeemed,
        current_points_balance = excluded.current_points_balance,
        last_purchase_date = excluded.last_purchase_date,
        sync_status = 'SYNCED', updated_at = excluded.updated_at
    `);
    const tx = db.transaction((rows: any[]) => {
      for (const r of rows) {
        upsert.run({
          customer_id: r.customer_id, tenant_id: r.tenant_id || tenantId,
          name: r.name, phone: r.phone || null, address: r.address || null,
          total_points_earned: r.total_points_earned ?? 0,
          total_points_redeemed: r.total_points_redeemed ?? 0,
          current_points_balance: r.current_points_balance ?? 0,
          last_purchase_date: toSqliteDate(r.last_purchase_date),
          created_at: toSqliteDate(r.created_at), updated_at: toSqliteDate(r.updated_at),
        });
      }
    });
    tx(cloudRows);
    const reconciled = reconcilePending(db, 'customers', 'customer_id', cloudRows);
    console.log(`[SyncWorker] Pulled ${cloudRows.length} customers.${reconciled > 0 ? ` Reconciled ${reconciled}.` : ''}`);
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Pull customers failed:', err.message);
    return false;
  }
}

async function pullLoyaltyTransactions(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();
  try {
    const response = await fetch(`${getCloudApiBase()}/api/sync/loyalty-transactions`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const cloudRows: any[] = await response.json();
    if (!Array.isArray(cloudRows) || cloudRows.length === 0) return false;

    const upsert = db.prepare(`
      INSERT INTO loyalty_transactions (transaction_id, tenant_id, customer_id, invoice_id,
        transaction_type, points, points_balance_before, points_balance_after,
        reference_number, description, created_by, sync_status, created_at)
      VALUES (@transaction_id, @tenant_id, @customer_id, @invoice_id,
        @transaction_type, @points, @points_balance_before, @points_balance_after,
        @reference_number, @description, @created_by, 'SYNCED', @created_at)
      ON CONFLICT(transaction_id) DO UPDATE SET
        transaction_type = excluded.transaction_type, points = excluded.points,
        points_balance_before = excluded.points_balance_before,
        points_balance_after = excluded.points_balance_after,
        reference_number = excluded.reference_number, description = excluded.description,
        sync_status = 'SYNCED'
    `);
    const tx = db.transaction((rows: any[]) => {
      for (const r of rows) {
        upsert.run({
          transaction_id: r.transaction_id, tenant_id: r.tenant_id || tenantId,
          customer_id: r.customer_id, invoice_id: r.invoice_id || null,
          transaction_type: r.transaction_type, points: r.points,
          points_balance_before: r.points_balance_before ?? 0,
          points_balance_after: r.points_balance_after ?? 0,
          reference_number: r.reference_number || null, description: r.description || null,
          created_by: r.created_by || null, created_at: toSqliteDate(r.created_at),
        });
      }
    });
    tx(cloudRows);
    const reconciled = reconcilePending(db, 'loyalty_transactions', 'transaction_id', cloudRows);
    console.log(`[SyncWorker] Pulled ${cloudRows.length} loyalty transactions.${reconciled > 0 ? ` Reconciled ${reconciled}.` : ''}`);
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Pull loyalty transactions failed:', err.message);
    return false;
  }
}

// ── Sync Returns (Edge → Cloud) ──────────────────────────────────────────
async function syncReturns(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM returns WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} returns to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE returns SET sync_status = 'SYNCED' WHERE return_id = ? AND tenant_id = ?`);
  const itemsUpdateStmt = db.prepare(`UPDATE return_items SET sync_status = 'SYNCED' WHERE return_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const enriched = batch.map((r: any) => {
      const items = db.prepare(`SELECT * FROM return_items WHERE return_id = ? AND tenant_id = ?`).all(r.return_id, tenantId);
      return { ...r, items };
    });
    const synced = await pushBatch(
      `${getCloudApiBase()}/api/sync/returns`,
      token, enriched, 'returns', `Returns batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => {
        for (const id of ids) {
          updateStmt.run(id, tenantId);
          itemsUpdateStmt.run(id, tenantId);
        }
      });
      tx(synced);
    }
  }
}

// ── Pull Returns (Cloud → Edge) ──────────────────────────────────────────
async function pullReturns(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  try {
    const response = await fetch(`${getCloudApiBase()}/api/sync/returns`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[SyncWorker] Pull returns failed: HTTP ${response.status}`);
      return false;
    }

    const cloudReturns: any[] = await response.json();
    if (!Array.isArray(cloudReturns) || cloudReturns.length === 0) return false;

    const upsertReturn = db.prepare(`
      INSERT INTO returns (return_id, invoice_id, tenant_id, user_id, return_number, customer_name, customer_phone, subtotal, tax_total, grand_total, reason, return_date, sync_status, created_at, updated_at)
      VALUES (@return_id, @invoice_id, @tenant_id, @user_id, @return_number, @customer_name, @customer_phone, @subtotal, @tax_total, @grand_total, @reason, @return_date, 'SYNCED', @created_at, @updated_at)
      ON CONFLICT(return_id) DO UPDATE SET
        customer_name = excluded.customer_name, customer_phone = excluded.customer_phone,
        subtotal = excluded.subtotal, tax_total = excluded.tax_total, grand_total = excluded.grand_total,
        reason = excluded.reason, return_date = excluded.return_date, updated_at = excluded.updated_at,
        sync_status = 'SYNCED'
      WHERE returns.sync_status != 'PENDING'
    `);

    const upsertItem = db.prepare(`
      INSERT INTO return_items (return_item_id, return_id, tenant_id, invoice_item_id, product_id, name, quantity, unit_price, tax_amount, total, sync_status, created_at)
      VALUES (@return_item_id, @return_id, @tenant_id, @invoice_item_id, @product_id, @name, @quantity, @unit_price, @tax_amount, @total, 'SYNCED', @created_at)
      ON CONFLICT(return_item_id) DO UPDATE SET
        name = excluded.name, quantity = excluded.quantity, unit_price = excluded.unit_price,
        tax_amount = excluded.tax_amount, total = excluded.total, sync_status = 'SYNCED'
      WHERE return_items.sync_status != 'PENDING'
    `);

    const tx = db.transaction((returns: any[]) => {
      for (const r of returns) {
        try {
          upsertReturn.run({
            return_id: r.return_id, invoice_id: r.invoice_id, tenant_id: tenantId,
            user_id: r.user_id || null, return_number: r.return_number,
            customer_name: r.customer_name || null, customer_phone: r.customer_phone || null,
            subtotal: r.subtotal, tax_total: r.tax_total ?? 0, grand_total: r.grand_total,
            reason: r.reason || null, return_date: toSqliteDate(r.return_date),
            created_at: toSqliteDate(r.created_at), updated_at: toSqliteDate(r.updated_at),
          });
          if (Array.isArray(r.items)) {
            for (const item of r.items) {
              upsertItem.run({
                return_item_id: item.return_item_id, return_id: r.return_id, tenant_id: tenantId,
                invoice_item_id: item.invoice_item_id || null, product_id: item.product_id,
                name: item.name, quantity: item.quantity, unit_price: item.unit_price,
                tax_amount: item.tax_amount ?? 0, total: item.total,
                created_at: toSqliteDate(item.created_at),
              });
            }
          }
        } catch (e: any) {
          console.error('[SyncWorker] Error pulling return:', e.message);
        }
      }
    });

    tx(cloudReturns);

    const reconciled = reconcilePending(db, 'returns', 'return_id', cloudReturns);
    console.log(`[SyncWorker] Pulled ${cloudReturns.length} returns from cloud.${reconciled > 0 ? ` Reconciled ${reconciled} PENDING.` : ''}`);
    return true;
  } catch (err: any) {
    console.error('[SyncWorker] Pull returns failed:', err.message);
    return false;
  }
}
