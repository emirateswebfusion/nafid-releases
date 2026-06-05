import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { autoUpdater } from 'electron-updater';
import dotenv from 'dotenv';
import log from 'electron-log/main';

// Initialize and configure structured logging
log.initialize();
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
Object.assign(console, log.functions);

process.on('uncaughtException', (err) => {
  log.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason);
});

// Load environment variables
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env.production')
  : path.join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config(); // Fallback to root .env
}
import { initDb, getDb } from './db/localDb.js';
import { initPrinter } from './hardware/printer.js';
import { initWeighingScale } from './hardware/weighingScale.js';
import { initBarcodeScanner } from './hardware/barcodeScanner.js';
import { initSyncWorker } from './sync/syncWorker.js';

// In CommonJS (which tsc is outputting), __dirname and __filename are already available.
// We don't need the fileURLToPath logic.

let mainWindow: BrowserWindow | null = null;
const PROTOCOL = 'vendora';

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      
      // On Windows, the deep link URL is in the commandLine arguments
      const url = commandLine.pop();
      if (url && url.startsWith(`${PROTOCOL}://`)) {
        handleDeepLink(url);
      }
    }
  });
}

function handleDeepLink(url: string) {
  if (!mainWindow) return;
  try {
    const urlObj = new URL(url);
    const token = urlObj.searchParams.get('token');
    if (token) {
      mainWindow.webContents.send('auth:deep-link', token);
    }
  } catch (err) {
    console.error('[DeepLink] Failed to parse URL:', url);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
  });

  if (!app.isPackaged) {
    // Development: Load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Production: Load from built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'vendora.db');
  console.log(`[Main] App Data Path: ${app.getPath('userData')}`);
  console.log(`[Main] Database Path: ${dbPath}`);

  initDb();
  initPrinter();
  createWindow();

  // Handle deep link when app is opened via protocol (Windows)
  if (process.platform === 'win32') {
    const url = process.argv.find(arg => arg.startsWith(`${PROTOCOL}://`));
    if (url) {
      // Small delay to ensure window is ready
      setTimeout(() => handleDeepLink(url), 1000);
    }
  }

  if (mainWindow) {
    initBarcodeScanner(mainWindow);
    initWeighingScale(mainWindow);
    initSyncWorker();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Auto-Update Configuration
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', () => {
    console.log('[Updater] Update available. Downloading...');
    if (mainWindow) {
      mainWindow.webContents.send('update-status', 'New update available! Downloading...');
    }
  });

  autoUpdater.on('update-downloaded', () => {
    console.log('[Updater] Update downloaded.');
    if (mainWindow) {
      mainWindow.webContents.send('update-status', 'Update downloaded. Restarting in 5s to install...');
    }
    setTimeout(() => {
      autoUpdater.quitAndInstall();
    }, 5000);
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err);
  });

  // Check for updates every 1 hour
  // setInterval(() => {
  //   autoUpdater.checkForUpdatesAndNotify();
  // }, 60 * 60 * 1000);

  // Initial check
  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    console.error('[Updater] Initial check error:', err.message);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('log:error', (event, payload: { message: string, error?: any }) => {
  log.error('[Frontend Error]', payload.message, payload.error || '');
});

ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('app:checkForUpdates', async () => {
  try {
    const result = await autoUpdater.checkForUpdatesAndNotify();
    // result contains complex objects (like CancellationToken) that cannot be cloned over IPC.
    // We only return the updateInfo which is serializable, or just a boolean success.
    const updateInfo = result?.updateInfo || null;
    return { success: true, updateInfo };
  } catch (error: any) {
    console.error('[Updater] Manual check error:', error);
    if (error.message && error.message.includes('404')) {
      return { success: false, error: 'Update check failed: No updates found or repository is private. Please ensure a GitHub token is configured if using a private repository.' };
    }
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:getProducts', (event, arg: any) => {
  try {
    const db = getDb();
    const tenantId = typeof arg === 'string' ? arg : arg?.tenant_id;
    if (!tenantId) return [];

    if (typeof arg === 'string' || (!arg.limit && !arg.search && !arg.barcode && !arg.sortBy)) {
      return db.prepare('SELECT * FROM products WHERE tenant_id = ? AND is_deleted = 0 ORDER BY name COLLATE NOCASE ASC, product_id ASC').all(tenantId);
    }

    const { limit, offset, search, sortBy, barcode } = arg;
    let query = 'SELECT * FROM products WHERE tenant_id = ? AND is_deleted = 0';
    const params: any[] = [tenantId];

    if (barcode) {
       query += ' AND (sku_barcode = ? OR item_code = ?)';
       params.push(barcode, barcode);
    } else if (search) {
       query += ' AND (name LIKE ? OR sku_barcode LIKE ? OR item_code LIKE ?)';
       params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (sortBy === 'created_at') query += ' ORDER BY datetime(created_at) DESC, product_id ASC';
    else if (sortBy === 'updated_at') query += ' ORDER BY datetime(updated_at) DESC, product_id ASC';
    else if (sortBy === 'stock') query += ' ORDER BY current_stock ASC, product_id ASC';
    else query += ' ORDER BY name COLLATE NOCASE ASC, product_id ASC';

    if (limit) {
       query += ' LIMIT ?';
       params.push(limit);
    }
    if (offset) {
       query += ' OFFSET ?';
       params.push(offset);
    }

    return db.prepare(query).all(...params);
  } catch (error: any) {
    return { error: error.message };
  }
});

ipcMain.handle('db:getProductsCount', (event, arg: any) => {
  try {
    const db = getDb();
    const tenantId = typeof arg === 'string' ? arg : arg?.tenant_id;
    if (!tenantId) return 0;

    let query = 'SELECT COUNT(*) as count FROM products WHERE tenant_id = ? AND is_deleted = 0';
    const params: any[] = [tenantId];
    
    if (arg?.search) {
       query += ' AND (name LIKE ? OR sku_barcode LIKE ? OR item_code LIKE ?)';
       params.push(`%${arg.search}%`, `%${arg.search}%`, `%${arg.search}%`);
    }

    const result = db.prepare(query).get(...params) as { count: number };
    return result ? result.count : 0;
  } catch (error: any) {
    return 0;
  }
});

ipcMain.handle('db:addProduct', (event, p) => {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO products (
        product_id, tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
        purchase_price, base_price, is_gst_applicable, tax_rate_percent,
        uom, brand_manufacturer, current_stock, reorder_level, domain_attributes,
        discount_percent, discount_flat, offer_price,
        is_deleted, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    stmt.run(
      p.product_id,
      p.tenant_id,
      p.name,
      p.sku_barcode,
      p.item_code,
      p.category,
      p.hsn_sac_code,
      p.purchase_price,
      p.base_price,
      p.is_gst_applicable ?? 1,
      p.tax_rate_percent,
      p.uom || 'Pcs',
      p.brand_manufacturer,
      p.current_stock,
      p.reorder_level,
      p.domain_attributes ? JSON.stringify(p.domain_attributes) : '{}',
      p.discount_percent ?? null,
      p.discount_flat ?? null,
      p.offer_price ?? null,
      p.is_deleted ?? 0
    );
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:updateProduct', (event, p) => {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE products 
      SET tenant_id = ?, name = ?, sku_barcode = ?, item_code = ?, category = ?, hsn_sac_code = ?, 
          purchase_price = ?, base_price = ?, is_gst_applicable = ?, tax_rate_percent = ?,
          uom = ?, brand_manufacturer = ?, current_stock = ?, reorder_level = ?, 
          domain_attributes = ?, discount_percent = ?, discount_flat = ?, offer_price = ?, 
          is_deleted = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE product_id = ?
    `);
    stmt.run(
      p.tenant_id,
      p.name,
      p.sku_barcode,
      p.item_code,
      p.category,
      p.hsn_sac_code,
      p.purchase_price,
      p.base_price,
      p.is_gst_applicable ?? 1,
      p.tax_rate_percent,
      p.uom || 'Pcs',
      p.brand_manufacturer,
      p.current_stock,
      p.reorder_level,
      p.domain_attributes ? JSON.stringify(p.domain_attributes) : '{}',
      p.discount_percent ?? null,
      p.discount_flat ?? null,
      p.offer_price ?? null,
      p.is_deleted ?? 0,
      p.product_id
    );
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:deleteProduct', (event, productId) => {
  try {
    const db = getDb();
    // Soft delete
    db.prepare("UPDATE products SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?").run(productId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:adjustStock', (event, { product_id, delta }) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE products 
      SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE product_id = ?
    `).run(delta, product_id);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:checkout', (event, payload) => {
  const { items, ...invoice } = payload;
  const db = getDb();
  const transaction = db.transaction(() => {
    // 1. Insert invoice
    const invStmt = db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, user_id, invoice_number, invoice_type, 
        subtotal, tax_total, discount_total, grand_total, 
        payment_method, customer_name, customer_phone, sync_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `);
    invStmt.run(
      invoice.invoice_id,
      invoice.tenant_id,
      invoice.user_id,
      invoice.invoice_number,
      invoice.invoice_type,
      invoice.subtotal,
      invoice.tax_total,
      invoice.discount_total,
      invoice.grand_total,
      invoice.payment_method || 'CASH',
      invoice.customer_name || null,
      invoice.customer_phone || null
    );

    // 2. Insert items and update stock
    const itemStmt = db.prepare(`
      INSERT INTO invoice_items (item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\' WHERE product_id = ?');

    for (const item of items) {
      itemStmt.run(
        item.item_id,
        invoice.invoice_id,
        invoice.tenant_id,
        item.product_id,
        item.name,
        item.quantity,
        item.unit_price,
        item.tax_amount,
        item.total
      );
      stockStmt.run(item.quantity, item.product_id);
    }
  });

  try {
    transaction();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:getInvoices', (event, filters?: { user_id?: string; tenant_id?: string; role?: string; limit?: number; offset?: number; search?: string }) => {
  try {
    const db = getDb();
    const { user_id, tenant_id, role, limit, offset, search } = filters || {};

    if (!tenant_id) return []; // Safety: always require tenant_id

    let query = `
      SELECT i.*, u.name as cashier_name 
      FROM invoices i 
      LEFT JOIN users u ON i.user_id = u.user_id 
      WHERE i.tenant_id = ?
    `;
    const params: any[] = [tenant_id];

    // If Cashier: strictly filter by their ID within the tenant
    if (role === 'CASHIER' && user_id) {
      query += ' AND i.user_id = ?';
      params.push(user_id);
    }

    if (search) {
      query += ' AND (i.invoice_number LIKE ? OR i.customer_name LIKE ? OR i.customer_phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY datetime(i.created_at) DESC, i.invoice_id ASC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }
    if (offset) {
      query += ' OFFSET ?';
      params.push(offset);
    }

    return db.prepare(query).all(...params);
  } catch (error: any) {
    return { error: error.message };
  }
});

ipcMain.handle('db:getInvoiceItems', (event, invoice_id: string) => {
  try {
    const db = getDb();
    return db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice_id);
  } catch (error: any) {
    return { error: error.message };
  }
});

ipcMain.handle('settings:get', (event, { tenant_id, key }: { tenant_id: string; key: string }) => {
  try {
    const db = getDb();
    const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(tenant_id || 'global', key);
    return row ? JSON.parse(row.value) : null;
  } catch (error: any) {
    return { error: error.message };
  }
});

ipcMain.handle('settings:set', (event, { tenant_id, key, value }: { tenant_id: string; key: string; value: any }) => {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO settings (tenant_id, key, value, updated_at) 
      VALUES (?, ?, ?, CURRENT_TIMESTAMP) 
      ON CONFLICT(tenant_id, key) DO UPDATE SET 
        value = EXCLUDED.value, 
        updated_at = CURRENT_TIMESTAMP
    `).run(tenant_id || 'global', key, JSON.stringify(value));
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sync:runInitial', async () => {
  const { runInitialSync } = await import('./sync/syncWorker.js');
  return runInitialSync();
});

// ── Auth Token Persistence ───────────────────────────────────────────────────
const getConfigPath = () => path.join(app.getPath('userData'), 'config.json');

ipcMain.handle('auth:saveToken', (event, payload) => {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(payload, null, 2));
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auth:getToken', () => {
  try {
    const p = getConfigPath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
});

ipcMain.handle('auth:clearToken', () => {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:debug:dumpInvoices', () => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT invoice_number, user_id, tenant_id FROM invoices LIMIT 20').all();
    return { success: true, rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

