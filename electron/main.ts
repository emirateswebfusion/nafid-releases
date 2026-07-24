import { app, BrowserWindow, ipcMain, session, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
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

// ── IPC Input Validation ────────────────────────────────────────────────────────
function validateString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid ${name}: expected non-empty string`);
  return value;
}
function validateNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || isNaN(value)) throw new Error(`Invalid ${name}: expected number`);
  return value;
}
function validateOptionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return validateString(value, name);
}
function validateOptionalNumber(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return validateNumber(value, name);
}
function validateObject<T extends Record<string, unknown>>(value: unknown, name: string): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Invalid ${name}: expected object`);
  return value as T;
}
function validateArray<T>(value: unknown, name: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${name}: expected array`);
  return value;
}
type IpcHandler<T, A extends unknown[]> = (event: Electron.IpcMainInvokeEvent, ...args: A) => T;
function safeHandler<T, A extends unknown[]>(handler: IpcHandler<T, A>): IpcHandler<T, A> {
  return (event, ...args) => {
    try {
      return handler(event, ...args);
    } catch (err: any) {
      log.error(`[IPC] Validation error: ${err.message}`);
      throw err;
    }
  };
}

// GH_TOKEN for electron-updater; prefer GITHUB_TOKEN (CI-safe) over bundled file
// WARNING: .env.production is bundled with the app (see electron-builder.config.js extraResources).
// DO NOT put real secrets there — they'd be extractable from the installed app.
if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN && fs.existsSync(envPath)) {
  const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf-8'));
  if (parsed.GH_TOKEN) {
    process.env.GH_TOKEN = parsed.GH_TOKEN;
    console.log('[Main] GH_TOKEN loaded manually from env file');
  }
}
import { initDb, getDb } from './db/localDb.js';
import { initPrinter } from './hardware/printer.js';
import { initWeighingScale } from './hardware/weighingScale.js';
import { initBarcodeScanner } from './hardware/barcodeScanner.js';
import { initSyncWorker, setSyncActive } from './sync/syncWorker.js';

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
    // Only forward tokens that look like JWTs (3 dot-separated base64 parts)
    // This prevents arbitrary data injection from other apps that register vendora://
    if (token && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
      mainWindow.webContents.send('auth:deep-link', token);
    }
  } catch (err) {
    console.error('[DeepLink] Failed to parse URL:', url);
  }
}

function setupCSP() {
  const isDev = !app.isPackaged;
  const apiUrl = process.env.VENDORA_CLOUD_API || 'http://localhost:3001';
  const apiOrigin = (() => {
    try {
      return new URL(apiUrl).origin;
    } catch {
      return '';
    }
  })();

  const directives = [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  if (isDev) {
    directives.push("script-src 'self' 'unsafe-inline'");
    directives.push("connect-src 'self' ws://localhost:* http://localhost:* https://clients3.google.com");
  } else {
    directives.push("script-src 'self'");
    const allowedConnect = ["'self'", "https://clients3.google.com"];
    if (apiOrigin && apiOrigin !== 'self') allowedConnect.push(apiOrigin);
    directives.push(`connect-src ${allowedConnect.join(' ')}`);
  }

  const csp = directives.join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
  const dbPath = path.join(app.getPath('userData'), 'vendora_v2.db');
  console.log(`[Main] App Data Path: ${app.getPath('userData')}`);
  console.log(`[Main] Database Path: ${dbPath}`);

  initDb();
  initPrinter();
  setupCSP();
  createWindow();

  // Handle deep link when app is opened via protocol
  // On Windows: command line arguments; on macOS: open-url event
  if (process.platform === 'win32') {
    const url = process.argv.find(arg => arg.startsWith(`${PROTOCOL}://`));
    if (url) {
      setTimeout(() => handleDeepLink(url), 1000);
    }
  }

  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (url.startsWith(`${PROTOCOL}://`)) {
      setTimeout(() => handleDeepLink(url), 1000);
    }
  });

  if (mainWindow) {
    initBarcodeScanner(mainWindow);
    initWeighingScale(mainWindow);
    initSyncWorker();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Auto-Update Configuration
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', 'update-available');
      mainWindow.webContents.send('update-info', info);
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  autoUpdater.on('update-downloaded', () => {
    console.log('[Updater] Update downloaded.');
    if (mainWindow) {
      mainWindow.webContents.send('update-status', 'ready-to-install');
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', 'error');
    }
  });

  // Check for updates every 1 hour
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 60 * 60 * 1000);

  // Initial check on startup
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

ipcMain.handle('app:installUpdate', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('app:downloadUpdate', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error: any) {
    console.error('[Updater] Download error:', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('app:checkForUpdates', async () => {
  try {
    const result = await autoUpdater.checkForUpdatesAndNotify();
    // result contains complex objects (like CancellationToken) that cannot be cloned over IPC.
    // We only return the updateInfo which is serializable.
    if (result && result.isUpdateAvailable && result.updateInfo) {
      return { success: true, updateInfo: result.updateInfo };
    }
    // No update available — already on latest version
    return { success: true, updateInfo: null };
  } catch (error: any) {
    console.error('[Updater] Manual check error:', error);
    const msg = error.message || '';
    // 404 means no release found on the current channel — likely already up-to-date
    if (msg.includes('404') || msg.includes('Cannot find') || msg.includes('no published version')) {
      return { success: true, updateInfo: null };
    }
    // Network errors — show a clean message
    if (
      msg.includes('net::ERR_') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENETUNREACH') ||
      msg.includes('request failed') ||
      msg.toLowerCase().includes('network')
    ) {
      return { success: false, error: 'No internet connection' };
    }
    return { success: false, error: msg };
  }
});

ipcMain.handle('db:getProducts', (event, arg: any) => {
  try {
    const db = getDb();
    const tenantId = typeof arg === 'string' ? arg : arg?.tenant_id;
    if (!tenantId) return [];

    if (typeof arg === 'string' || (!arg.limit && !arg.search && !arg.barcode && !arg.sortBy && !arg.filterDate)) {
      return db.prepare('SELECT p.*, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price FROM products p LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id WHERE p.tenant_id = ? AND p.is_deleted = 0 ORDER BY p.name COLLATE NOCASE ASC, p.product_id ASC').all(tenantId);
    }

    const { limit, offset, search, sortBy, barcode, filterDate } = arg;
    let query = 'SELECT p.*, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price FROM products p LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id WHERE p.tenant_id = ? AND p.is_deleted = 0';
    const params: any[] = [tenantId];

    if (barcode) {
       query += ' AND (p.sku_barcode = ? OR p.item_code = ?)';
       params.push(barcode, barcode);
    } else if (search) {
       // Numeric search: only match barcode/item_code with prefix (so "87" → 8749,8750 NOT 987,687, nor names containing "87")
       if (/^\d+$/.test(search)) {
          query += ' AND (p.sku_barcode LIKE ? OR p.item_code LIKE ?)';
          params.push(`%${search}%`, `%${search}%`);
        } else {
          // Text search: substring match on all fields
          query += ' AND (p.name LIKE ? OR p.sku_barcode LIKE ? OR p.item_code LIKE ? OR p.brand_manufacturer LIKE ?)';
          params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
       }
    }

    if (filterDate) {
       if (arg.filterDateEnd) {
         query += ' AND date(p.created_at, \'localtime\') BETWEEN ? AND ?';
         params.push(filterDate, arg.filterDateEnd);
       } else {
         query += ' AND date(p.created_at, \'localtime\') = ?';
         params.push(filterDate);
       }
    }

    if (sortBy === 'created_at') query += ' ORDER BY p.created_at DESC, p.product_id ASC';
    else if (sortBy === 'updated_at') query += ' ORDER BY p.updated_at DESC, p.product_id ASC';
    else if (sortBy === 'stock') query += ' ORDER BY p.current_stock ASC, p.product_id ASC';
    else query += ' ORDER BY p.name COLLATE NOCASE ASC, p.product_id ASC';

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
    console.error('[db:getProducts]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getProductsByIds', (event, { tenant_id, product_ids }: { tenant_id: string; product_ids: string[] }) => {
  try {
    const db = getDb();
    if (!product_ids?.length) return [];
    const placeholders = product_ids.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM products WHERE tenant_id = ? AND product_id IN (${placeholders})`).all(tenant_id, ...product_ids);
  } catch (error: any) {
    console.error('[db:getProductsByIds]', error);
    return { error: 'Operation failed' };
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
       // Mirror logic from db:getProducts — numeric: barcode/code only; text: all fields
       if (/^\d+$/.test(arg.search)) {
          query += ' AND (sku_barcode LIKE ? OR item_code LIKE ?)';
          params.push(`%${arg.search}%`, `%${arg.search}%`);
        } else {
          query += ' AND (name LIKE ? OR sku_barcode LIKE ? OR item_code LIKE ? OR brand_manufacturer LIKE ?)';
          params.push(`%${arg.search}%`, `%${arg.search}%`, `%${arg.search}%`, `%${arg.search}%`);
       }
    }

    if (arg?.filterDate) {
       if (arg.filterDateEnd) {
         query += ' AND date(created_at, \'localtime\') BETWEEN ? AND ?';
         params.push(arg.filterDate, arg.filterDateEnd);
       } else {
         query += ' AND date(created_at, \'localtime\') = ?';
         params.push(arg.filterDate);
       }
    }

    const result = db.prepare(query).get(...params) as { count: number };
    return result ? result.count : 0;
  } catch (error: any) {
    return 0;
  }
});

ipcMain.handle('db:addProduct', safeHandler((event, p) => {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO products (
        product_id, tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
        purchase_price, base_price, is_gst_applicable, tax_rate_percent,
        uom, brand_manufacturer, current_stock, reorder_level, domain_attributes,
        discount_percent, discount_flat, offer_price,
        is_deleted, billing_type, grade_id, pricing_mode, average_weight_per_piece, weight_override_allowed,
        is_service_item, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
       typeof p.domain_attributes === 'string' ? p.domain_attributes : JSON.stringify(p.domain_attributes ?? {}),
       p.discount_percent ?? null,
       p.discount_flat ?? null,
       p.offer_price ?? null,
       p.is_deleted ?? 0,
       p.billing_type || 'PIECE',
       p.grade_id || null,
       p.pricing_mode || 'FIXED_PRICE',
       p.average_weight_per_piece ?? null,
       p.weight_override_allowed ?? 0,
       p.is_service_item ?? 0
    );
    return { success: true };
  } catch (error: any) {
    const msg = error?.message || 'Operation failed';
    console.error('[db:addProduct]', msg);
    return { success: false, error: msg };
  }
}));

ipcMain.handle('db:ensureServiceItem', safeHandler((event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const existing = db.prepare("SELECT product_id FROM products WHERE tenant_id = ? AND is_service_item = 1 AND is_deleted = 0").get(tenant_id);
    if (existing) return { success: true };
    const product_id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO products (product_id, tenant_id, name, sku_barcode, base_price, tax_rate_percent, uom, current_stock, is_service_item, billing_type, pricing_mode, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, 'Service Charge', ?, 0, 0, 'Pcs', 0, 1, 'PIECE', 'FIXED_PRICE', 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(product_id, tenant_id, `SVC-${tenant_id.substring(0, 4).toUpperCase()}-001`);
    return { success: true, product_id };
  } catch (error: any) {
    console.error('[db:ensureServiceItem]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:updateProduct', safeHandler((event, p) => {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE products 
      SET tenant_id = ?, name = ?, sku_barcode = ?, item_code = ?, category = ?, hsn_sac_code = ?, 
          purchase_price = ?, base_price = ?, is_gst_applicable = ?, tax_rate_percent = ?,
          uom = ?, brand_manufacturer = ?, current_stock = ?, reorder_level = ?, 
          domain_attributes = ?, discount_percent = ?, discount_flat = ?, offer_price = ?, 
          is_deleted = ?, billing_type = ?, grade_id = ?, pricing_mode = ?, 
          average_weight_per_piece = ?, weight_override_allowed = ?,
          is_service_item = ?,
          sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
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
       typeof p.domain_attributes === 'string' ? p.domain_attributes : JSON.stringify(p.domain_attributes ?? {}),
       p.discount_percent ?? null,
       p.discount_flat ?? null,
       p.offer_price ?? null,
       p.is_deleted ?? 0,
       p.billing_type || 'PIECE',
       p.grade_id || null,
       p.pricing_mode || 'FIXED_PRICE',
       p.average_weight_per_piece ?? null,
       p.weight_override_allowed ?? 0,
       p.is_service_item ?? 0,
       p.product_id
    );
    return { success: true };
  } catch (error: any) {
    console.error('[db:updateProduct]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:deleteProduct', (event, productId) => {
  try {
    const db = getDb();
    // Soft delete
    db.prepare("UPDATE products SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?").run(productId);
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteProduct]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:bulkImportProducts', safeHandler((event, products: any[]) => {
  try {
    const db = getDb();
    const transaction = db.transaction((prods) => {
      const stmt = db.prepare(`
        INSERT INTO products (
          product_id, tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
          purchase_price, base_price, is_gst_applicable, tax_rate_percent,
          uom, brand_manufacturer, current_stock, reorder_level, domain_attributes,
          discount_percent, discount_flat, offer_price,
          is_deleted, billing_type, grade_id, pricing_mode, average_weight_per_piece, weight_override_allowed,
          sync_status, print_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, ?)
      `);
      
      const now = new Date();
      for (const p of prods) {
        now.setMilliseconds(now.getMilliseconds() + 1);
        const timestamp = now.toISOString().replace('T', ' ').replace('Z', '');
        
        stmt.run(
          p.product_id,
          p.tenant_id,
          p.name,
          p.sku_barcode,
          p.item_code || null,
          p.category || null,
          p.hsn_sac_code || null,
          p.purchase_price || 0,
          p.base_price || 0,
          p.is_gst_applicable ?? 1,
          p.tax_rate_percent || 0,
          p.uom || 'Pcs',
          p.brand_manufacturer || null,
          p.current_stock || 0,
          p.reorder_level || 0,
           typeof p.domain_attributes === 'string' ? p.domain_attributes : JSON.stringify(p.domain_attributes ?? {}),
           p.discount_percent ?? null,
           p.discount_flat ?? null,
           p.offer_price ?? null,
           0,
           p.billing_type || 'PIECE',
          p.grade_id || null,
          p.pricing_mode || 'FIXED_PRICE',
          p.average_weight_per_piece ?? null,
          p.weight_override_allowed ?? 0,
          timestamp,
          timestamp
        );
      }
    });
    transaction(products);
    return { success: true };
  } catch (error: any) {
    console.error('[db:bulkImportProducts]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:updatePrintStatus', (event, productIds: string[]) => {
  try {
    const db = getDb();
    const transaction = db.transaction((ids) => {
      const stmt = db.prepare("UPDATE products SET print_status = 'PRINTED', sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?");
      for (const id of ids) {
        stmt.run(id);
      }
    });
    transaction(productIds);
    return { success: true };
  } catch (error: any) {
    console.error('[db:updatePrintStatus]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:resetPrintStatus', (event, tenant_id: string) => {
  try {
    const db = getDb();
    if (!tenant_id) return { success: false, error: 'Tenant ID required' };
    db.prepare("UPDATE products SET print_status = 'PRINTED', sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND print_status = 'PENDING' AND is_deleted = 0").run(tenant_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:resetPrintStatus]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getPendingPrintProducts', (event, { tenant_id, limit, date, dateEnd, only_pending = true }: { tenant_id: string, limit: number, date?: string, dateEnd?: string, only_pending?: boolean }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    
    let query = "SELECT * FROM products WHERE tenant_id = ? AND is_deleted = 0 AND current_stock > 0";
    const params: any[] = [tenant_id];

    if (only_pending) {
      query += " AND print_status = 'PENDING'";
    }

    if (date) {
      if (dateEnd) {
        query += " AND date(created_at) BETWEEN ? AND ?";
        params.push(date, dateEnd);
      } else {
        query += " AND date(created_at) = ?";
        params.push(date);
      }
    }
    
    query += " ORDER BY created_at ASC";
    if (limit) { query += " LIMIT ?"; params.push(limit); }
    
    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:getPendingPrintProducts]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:adjustStock', (event, { product_id, delta }) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE products 
      SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE product_id = ?
    `    ).run(delta, product_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:adjustStock]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getGrades', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare('SELECT * FROM product_grades WHERE tenant_id = ? AND is_deleted = 0 ORDER BY category, grade_name').all(tenantId);
  } catch (error: any) {
    console.error('[db:getGrades]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:addGrade', safeHandler((event, g) => {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO product_grades (grade_id, tenant_id, category, grade_name, rate, purchase_price, is_deleted, sync_status) 
      VALUES (?, ?, ?, ?, ?, ?, 0, 'PENDING')
    `).run(g.grade_id, g.tenant_id, g.category, g.grade_name, g.rate, g.purchase_price || 0);
    return { success: true };
  } catch (error: any) {
    console.error('[db:addGrade]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:updateGrade', safeHandler((event, g) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE product_grades 
      SET category = ?, grade_name = ?, rate = ?, purchase_price = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
      WHERE grade_id = ?
    `).run(g.category, g.grade_name, g.rate, g.purchase_price || 0, g.grade_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:updateGrade]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:deleteGrade', (event, gradeId: string) => {
  try {
    const db = getDb();
    db.prepare(`UPDATE product_grades SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE grade_id = ?`).run(gradeId);
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteGrade]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// ── Party (Credit Person) Handlers ──────────────────────────────────────────
ipcMain.handle('db:getParties', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    const parties = db.prepare(`
      SELECT p.*, 
        (SELECT MAX(pl.transaction_date) FROM party_ledger pl WHERE pl.party_id = p.party_id) AS last_transaction_date
      FROM parties p WHERE p.tenant_id = ? AND p.is_deleted = 0 ORDER BY p.name COLLATE NOCASE ASC
    `).all(tenantId);
    return parties;
  } catch (error: any) {
    console.error('[db:getParties]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:addParty', safeHandler((event, p) => {
  try {
    const db = getDb();
    const bt = p.balance_type || 'RECEIVABLE';
    const initialBalance = bt === 'RECEIVABLE'
      ? Math.abs(p.balance || 0)
      : -Math.abs(p.balance || 0);

    db.prepare(`
      INSERT INTO parties (party_id, tenant_id, name, phone, address, gstin, balance, balance_type, notes, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(p.party_id, p.tenant_id, p.name, p.phone || null, p.address || null, p.gstin || null, initialBalance, bt, p.notes || null);

    // Create opening balance ledger entry
    if (p.balance && parseFloat(p.balance) > 0) {
      const amount = Math.abs(parseFloat(p.balance));
      const ledgerId = p.party_id + '-OPENING';
      db.prepare(`
        INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, created_by, created_by_name, created_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        ledgerId, p.party_id, p.tenant_id,
        `Opening Balance (${bt === 'RECEIVABLE' ? 'Receivable' : 'Payable'})`,
        bt === 'RECEIVABLE' ? amount : 0,
        bt === 'PAYABLE' ? amount : 0,
        initialBalance,
        p.created_by || null,
        p.created_by_name || null
      );
      db.prepare(`UPDATE parties SET last_transaction_date = CURRENT_TIMESTAMP WHERE party_id = ?`).run(p.party_id);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[db:addParty]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:updateParty', safeHandler((event, p) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE parties SET name = ?, phone = ?, address = ?, gstin = ?, notes = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE party_id = ?
    `).run(p.name, p.phone || null, p.address || null, p.gstin || null, p.notes || null, p.party_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:updateParty]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:deleteParty', (event, partyId: string) => {
  try {
    const db = getDb();
    db.prepare("UPDATE parties SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?").run(partyId);
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteParty]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:adjustPartyBalance', (event, { party_id, amount }: { party_id: string; amount: number }) => {
  try {
    const db = getDb();
    db.prepare("UPDATE parties SET balance = balance + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?").run(amount, party_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:adjustPartyBalance]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// ── Party Ledger Handlers ────────────────────────────────────────────────
ipcMain.handle('db:getPartyLedger', (event, partyId: string) => {
  try {
    const db = getDb();
    // Ensure the table exists (safe for first run after migration)
    db.exec(`CREATE TABLE IF NOT EXISTS party_ledger (
      ledger_id TEXT PRIMARY KEY,
      party_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      transaction_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      description TEXT NOT NULL,
      credit_amount REAL NOT NULL DEFAULT 0,
      debit_amount REAL NOT NULL DEFAULT 0,
      running_balance REAL NOT NULL,
      reference_number TEXT,
      created_by TEXT,
      created_by_name TEXT,
      sync_status TEXT DEFAULT 'SYNCED',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    return db.prepare(`
      SELECT * FROM party_ledger WHERE party_id = ? ORDER BY transaction_date ASC, created_at ASC
    `).all(partyId);
  } catch (error: any) {
    console.error('[db:getPartyLedger]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:addPartyLedgerEntry', safeHandler((event, entry) => {
  try {
    const db = getDb();
    
    // Get current party balance
    const party = db.prepare('SELECT balance FROM parties WHERE party_id = ?').get(entry.party_id) as any;
    if (!party) return { success: false, error: 'Party not found' };

    const currentBalance = parseFloat(party.balance) || 0;
    const parsedAmount = Math.abs(parseFloat(entry.amount));
    const creditAmount = entry.transaction_type === 'CREDIT' ? parsedAmount : 0;
    const debitAmount = entry.transaction_type === 'DEBIT' ? parsedAmount : 0;
    const newBalance = currentBalance + creditAmount - debitAmount;

    db.prepare(`
      INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, reference_number, created_by, created_by_name, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      entry.ledger_id,
      entry.party_id,
      entry.tenant_id,
      entry.transaction_date || new Date().toISOString(),
      entry.description,
      creditAmount,
      debitAmount,
      newBalance,
      entry.reference_number || null,
      entry.created_by || null,
      entry.created_by_name || null
    );

    db.prepare(`UPDATE parties SET balance = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`)
      .run(newBalance, entry.transaction_date || new Date().toISOString(), entry.party_id);

    return { success: true };
  } catch (error: any) {
    console.error('[db:addPartyLedgerEntry]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:updatePartyLedgerEntry', (event, entry) => {
  try {
    const db = getDb();

    const existing = db.prepare('SELECT * FROM party_ledger WHERE ledger_id = ? AND party_id = ?').get(entry.ledger_id, entry.party_id) as any;
    if (!existing) return { success: false, error: 'Ledger entry not found' };

    const parsedAmount = entry.amount !== undefined ? Math.abs(parseFloat(entry.amount)) : (existing.credit_amount || existing.debit_amount || 0);
    const txType = entry.transaction_type || (existing.credit_amount > 0 ? 'CREDIT' : 'DEBIT');
    const creditAmount = txType === 'CREDIT' ? parsedAmount : 0;
    const debitAmount = txType === 'DEBIT' ? parsedAmount : 0;

    db.prepare(`
      UPDATE party_ledger SET 
        transaction_date = ?, description = ?, credit_amount = ?, debit_amount = ?,
        reference_number = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE ledger_id = ? AND party_id = ?
    `).run(
      entry.transaction_date || existing.transaction_date,
      entry.description || existing.description,
      creditAmount,
      debitAmount,
      entry.reference_number !== undefined ? entry.reference_number : existing.reference_number,
      entry.ledger_id,
      entry.party_id
    );

    // Recalculate running balance for all entries
    const entries = db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
      WHERE party_id = ? ORDER BY transaction_date ASC, created_at ASC
    `).all(entry.party_id) as any[];

    let running = 0;
    for (const row of entries) {
      running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
      db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
    }

    const latest = db.prepare(`
      SELECT transaction_date FROM party_ledger WHERE party_id = ?
      ORDER BY transaction_date DESC LIMIT 1
    `).get(entry.party_id) as any;

    db.prepare(`UPDATE parties SET balance = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`)
      .run(running, latest ? latest.transaction_date : null, entry.party_id);

    return { success: true };
  } catch (error: any) {
    console.error('[db:updatePartyLedgerEntry]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:deletePartyLedgerEntry', (event, { ledger_id, party_id }: { ledger_id: string; party_id: string }) => {
  try {
    const db = getDb();
    
    db.prepare('DELETE FROM party_ledger WHERE ledger_id = ? AND party_id = ?').run(ledger_id, party_id);

    // Recalculate running balance
    const entries = db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
      WHERE party_id = ? ORDER BY transaction_date ASC, created_at ASC
    `).all(party_id) as any[];

    let running = 0;
    for (const row of entries) {
      running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
      db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
    }

    const latest = db.prepare(`
      SELECT transaction_date FROM party_ledger WHERE party_id = ?
      ORDER BY transaction_date DESC LIMIT 1
    `).get(party_id) as any;

    db.prepare(`UPDATE parties SET balance = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`)
      .run(running, latest ? latest.transaction_date : null, party_id);

    return { success: true };
  } catch (error: any) {
    console.error('[db:deletePartyLedgerEntry]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:checkout', safeHandler((event, payload) => {
  const { items, scrap_items, ...invoice } = payload;
  const db = getDb();
  const transaction = db.transaction(() => {
    // 1. Insert invoice
    const invStmt = db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, user_id, invoice_number, invoice_type, 
        subtotal, tax_total, discount_total, discount_type, discount_value, grand_total, 
        payment_method, received_amount, balance_amount, customer_name, customer_phone, customer_gstin, customer_state, customer_address, sync_status,
        scrap_deduction, scrap_invoice_number, return_deduction, return_invoice_number
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)
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
      invoice.discount_type || 'FIXED',
      invoice.discount_value || 0,
      invoice.grand_total,
      invoice.payment_method || 'PENDING',
      invoice.received_amount ?? 0,
      invoice.balance_amount ?? 0,
      invoice.customer_name || null,
      invoice.customer_phone || null,
      invoice.customer_gstin || null,
      invoice.customer_state || null,
      invoice.customer_address || null,
      invoice.scrap_deduction ?? 0,
      invoice.scrap_invoice_number || null,
      invoice.return_deduction ?? 0,
      invoice.return_invoice_number || null
    );

    // 2. Insert items and update stock
    const itemStmt = db.prepare(`
      INSERT INTO invoice_items (item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total, is_service_item)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\' WHERE product_id = ?');
    const getDaStmt = db.prepare('SELECT domain_attributes FROM products WHERE product_id = ?');
    const updDaStmt = db.prepare('UPDATE products SET domain_attributes = ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?');

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
        item.total,
        item.isServiceItem ? 1 : 0
      );
      if (!item.isServiceItem) {
        stockStmt.run(item.quantity, item.product_id);
        if (item.pieces_sold) {
          const row = getDaStmt.get(item.product_id) as any;
          if (row?.domain_attributes) {
            try {
              const da = JSON.parse(row.domain_attributes);
              if (da.pcs !== undefined) {
                da.pcs = Math.max(0, Number(da.pcs) - item.pieces_sold);
                updDaStmt.run(JSON.stringify(da), item.product_id);
              }
            } catch {}
          }
        }
      }
    }

    // 3. Handle scrap items — create scrap transactions and update scrap stock
    if (scrap_items && scrap_items.length > 0) {
      const scrapTxStmt = db.prepare(`
        INSERT INTO scrap_transactions (transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, sync_status, updated_at)
        VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
      `);
      const scrapStockStmt = db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`);

      for (const scrap of scrap_items) {
        scrapTxStmt.run(
          scrap.transaction_id,
          invoice.tenant_id,
          scrap.scrap_category_id,
          scrap.quantity,
          scrap.rate,
          scrap.total_amount,
          invoice.customer_name || null,
          invoice.customer_phone || null,
          invoice.customer_address || null,
          `From invoice ${invoice.invoice_number}`,
          invoice.scrap_invoice_number || null
        );
        scrapStockStmt.run(scrap.quantity, scrap.scrap_category_id);
      }
    }
  });

  try {
    transaction();

    // Trigger immediate background sync so the invoice appears on web portal instantly
    import('./sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Immediate sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));

    return { success: true };
  } catch (error: any) {
    console.error('[db:checkout]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:applyInvoiceDiscount', (event, { invoice_id, discount_type, discount_value, role }: { invoice_id: string, discount_type: 'FIXED' | 'PERCENTAGE', discount_value: number, role?: string }) => {
  try {
    const db = getDb();

    // Only OWNER can apply discounts
    if (role !== 'OWNER') {
      return { success: false, error: 'Only owners can apply discounts' };
    }
    
    const invoice = db.prepare('SELECT subtotal, tax_total FROM invoices WHERE invoice_id = ?').get(invoice_id) as any;
    if (!invoice) return { success: false, error: 'Invoice not found' };

    let discount_total = 0;
    if (discount_type === 'PERCENTAGE') {
      discount_total = invoice.subtotal * (discount_value / 100);
    } else {
      discount_total = discount_value;
    }

    const grand_total = invoice.subtotal + invoice.tax_total - discount_total;

    db.prepare(`
      UPDATE invoices 
      SET discount_total = ?, discount_type = ?, discount_value = ?, grand_total = ?, sync_status = 'PENDING'
      WHERE invoice_id = ?
    `).run(discount_total, discount_type, discount_value, grand_total, invoice_id);

    return { success: true };
  } catch (error: any) {
    console.error('[db:applyInvoiceDiscount]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getInvoices', (event, filters?: { user_id?: string; tenant_id?: string; role?: string; limit?: number; offset?: number; search?: string; payment_method?: string; invoice_type?: string; filterDate?: string; filterDateEnd?: string }) => {
  try {
    const db = getDb();
    const { user_id, tenant_id, role, limit, offset, search, payment_method, invoice_type, filterDate, filterDateEnd } = filters || {};

    if (!tenant_id) return []; // Safety: always require tenant_id

    let query = `
      SELECT i.*, u.name as biller_name 
      FROM invoices i 
      LEFT JOIN users u ON i.user_id = u.user_id 
      WHERE i.tenant_id = ?
    `;
    const params: any[] = [tenant_id];

    // If Biller: strictly filter by their ID within the tenant
    if (role === 'BILLER' && user_id) {
      query += ' AND i.user_id = ?';
      params.push(user_id);
    }

    if (search) {
      query += ' AND (i.invoice_number LIKE ? OR i.customer_name LIKE ? OR i.customer_phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (payment_method) {
      query += ' AND i.payment_method = ?';
      params.push(payment_method);
    }

    if (invoice_type === 'GST_B2B') {
      query += " AND i.invoice_type = 'GST' AND i.customer_gstin IS NOT NULL AND i.customer_gstin != ''";
    } else if (invoice_type === 'GST_B2C') {
      query += " AND i.invoice_type = 'GST' AND (i.customer_gstin IS NULL OR i.customer_gstin = '')";
    } else if (invoice_type === 'BILL_OF_SUPPLY') {
      query += " AND i.invoice_type = 'BILL_OF_SUPPLY'";
    }

    if (filterDate) {
      query += ' AND i.created_at >= ?';
      params.push(filterDate);
    }
    if (filterDateEnd) {
      query += ' AND i.created_at <= ?';
      params.push(filterDateEnd + ' 23:59:59');
    }

    query += ' ORDER BY i.created_at DESC, i.invoice_id ASC';

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
    console.error('[db:getInvoices]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getDashboardStats', (event, tenantId: string) => {
  try {
    const db = getDb();
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const row = db.prepare(`
      SELECT COALESCE(SUM(grand_total), 0) as totalSales, COUNT(*) as invoiceCount
      FROM invoices
      WHERE tenant_id = ? AND created_at >= ?
    `).get(tenantId, dateStr) as any;
    return { success: true, totalSales: row.totalSales, invoiceCount: row.invoiceCount };
  } catch (error: any) {
    console.error('[db:getDashboardStats]', error);
    return { success: false, totalSales: 0, invoiceCount: 0, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getInvoiceItems', (event, invoice_id: string) => {
  try {
    const db = getDb();
    return db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice_id);
  } catch (error: any) {
    console.error('[db:getInvoiceItems]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateInvoice', async (event, payload: {
  invoice_id: string;
  tenant_id: string;
  role?: string;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  discount_type: string;
  discount_value: number;
  grand_total: number;
  payment_method?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_gstin?: string;
  customer_state?: string;
  customer_address?: string;
  items: Array<{
    item_id?: string;
    product_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    tax_amount: number;
    total: number;
    isServiceItem?: boolean;
  }>;
}) => {
  // Only OWNER can update invoices
  if (payload.role !== 'OWNER') {
    return { success: false, error: 'Only owners can edit past bills' };
  }
  const { items, ...invoice } = payload;
  const db = getDb();
  const transaction = db.transaction(() => {
    // 1. Get old items for stock adjustment
    const oldItems = db.prepare('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = ?').all(payload.invoice_id) as any[];

    // 2. Update invoice header
    db.prepare(`
      UPDATE invoices SET
        subtotal = ?, tax_total = ?, discount_total = ?, discount_type = ?,
        discount_value = ?, grand_total = ?, payment_method = ?,
        customer_name = ?, customer_phone = ?, customer_gstin = ?, customer_state = ?, customer_address = ?,
        sync_status = 'PENDING'
      WHERE invoice_id = ?
    `).run(
      invoice.subtotal, invoice.tax_total, invoice.discount_total,
      invoice.discount_type || 'FIXED', invoice.discount_value || 0,
      invoice.grand_total, invoice.payment_method || 'PENDING',
      invoice.customer_name || null, invoice.customer_phone || null,
      invoice.customer_gstin || null, invoice.customer_state || null,
      invoice.customer_address || null,
      payload.invoice_id
    );

    // 3. Delete old items
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(payload.invoice_id);

    // 4. Insert new items
    const itemStmt = db.prepare(`
      INSERT INTO invoice_items (item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total, is_service_item)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      itemStmt.run(
        item.item_id || crypto.randomUUID(),
        payload.invoice_id,
        payload.tenant_id,
        item.product_id,
        item.name,
        item.quantity,
        item.unit_price,
        item.tax_amount,
        item.total,
        (item as any).isServiceItem ? 1 : 0
      );
    }

    // 5. Adjust stock: reverse old quantities, apply new (skip service items)
    const isServiceItemLookup: Record<string, boolean> = {};
    const svcStmt = db.prepare('SELECT is_service_item FROM products WHERE product_id = ?');
    const isServiceItem = (pid: string) => {
      if (isServiceItemLookup[pid] === undefined) {
        const row = svcStmt.get(pid) as any;
        isServiceItemLookup[pid] = row ? !!row.is_service_item : false;
      }
      return isServiceItemLookup[pid];
    };

    const stockDelta: Record<string, number> = {};
    for (const old of oldItems) {
      if (!isServiceItem(old.product_id)) {
        stockDelta[old.product_id] = (stockDelta[old.product_id] || 0) + old.quantity;
      }
    }
    for (const item of items) {
      if (!isServiceItem(item.product_id)) {
        stockDelta[item.product_id] = (stockDelta[item.product_id] || 0) - item.quantity;
      }
    }
    const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?');
    for (const [product_id, delta] of Object.entries(stockDelta)) {
      stockStmt.run(delta, product_id);
    }
  });

  try {
    transaction();
    return { success: true };
  } catch (error: any) {
    console.error('[db:updateInvoice]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateInvoicePayment', (event, payload: {
  invoice_id: string;
  tenant_id: string;
  payment_method: string;
  received_amount: number;
  balance_amount: number;
}) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE invoices SET
        payment_method = ?,
        received_amount = ?,
        balance_amount = ?,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
      WHERE invoice_id = ?
    `).run(
      payload.payment_method,
      payload.received_amount,
      payload.balance_amount,
      payload.invoice_id
    );
    return { success: true };
  } catch (error: any) {
    console.error('[db:updateInvoicePayment]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// ── Return Handlers ─────────────────────────────────────────────────────
ipcMain.handle('db:createReturn', safeHandler((event, payload: {
  return_id: string;
  invoice_id: string;
  tenant_id: string;
  user_id?: string;
  return_number: string;
  customer_name?: string;
  customer_phone?: string;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  reason?: string;
  refund_method?: string;
  adjusted_invoice_number?: string;
  items: Array<{
    return_item_id: string;
    product_id: string;
    invoice_item_id?: string;
    name: string;
    quantity: number;
    unit_price: number;
    tax_amount: number;
    total: number;
  }>;
}) => {
  const { items, ...returnData } = payload;
  const db = getDb();
  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO returns (return_id, invoice_id, tenant_id, user_id, return_number, customer_name, customer_phone, subtotal, tax_total, grand_total, reason, refund_method, adjusted_invoice_number, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      returnData.return_id, returnData.invoice_id, returnData.tenant_id, returnData.user_id || null,
      returnData.return_number, returnData.customer_name || null, returnData.customer_phone || null,
      returnData.subtotal, returnData.tax_total, returnData.grand_total, returnData.reason || null,
      returnData.refund_method || null, returnData.adjusted_invoice_number || null
    );

    const itemStmt = db.prepare(`
      INSERT INTO return_items (return_item_id, return_id, tenant_id, invoice_item_id, product_id, name, quantity, unit_price, tax_amount, total, sync_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
    `);
    const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?');

    for (const item of items) {
      itemStmt.run(
        item.return_item_id, returnData.return_id, returnData.tenant_id,
        item.invoice_item_id || null, item.product_id, item.name,
        item.quantity, item.unit_price, item.tax_amount, item.total
      );
      stockStmt.run(item.quantity, item.product_id);
    }
  });

  try {
    transaction();
    import('./sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Return sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    return { success: true };
  } catch (error: any) {
    console.error('[db:createReturn]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:getAlreadyReturnedQuantities', safeHandler((event, invoice_id: string) => {
  const db = getDb();
  return db.prepare(`
    SELECT invoice_item_id, COALESCE(SUM(quantity), 0) as returned_qty
    FROM return_items
    WHERE return_id IN (SELECT return_id FROM returns WHERE invoice_id = ?)
    GROUP BY invoice_item_id
  `).all(invoice_id);
}));

ipcMain.handle('db:getReturnInvoiceByNumber', safeHandler((event, { tenant_id, return_number }: { tenant_id: string; return_number: string }) => {
  const db = getDb();
  return db.prepare('SELECT * FROM returns WHERE tenant_id = ? AND return_number = ?').get(tenant_id, return_number);
}));

ipcMain.handle('db:getPendingReturnInvoices', safeHandler((event, { tenant_id, search }: { tenant_id: string; search?: string }) => {
  const db = getDb();
  let query = `
    SELECT * FROM returns 
    WHERE tenant_id = ? 
      AND refund_method = 'ADJUST_BILL' 
      AND (adjusted_invoice_number IS NULL OR adjusted_invoice_number = '')
  `;
  const params: any[] = [tenant_id];
  if (search) {
    query += ' AND (return_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY created_at DESC LIMIT 10';
  return db.prepare(query).all(...params);
}));

ipcMain.handle('db:settleReturnInvoice', safeHandler((event, { tenant_id, return_number, adjusted_invoice_number }: { tenant_id: string; return_number: string; adjusted_invoice_number: string }) => {
  const db = getDb();
  db.prepare(`
    UPDATE returns 
    SET adjusted_invoice_number = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = ? AND return_number = ?
  `).run(adjusted_invoice_number, tenant_id, return_number);
  return { success: true };
}));

ipcMain.handle('db:getReturns', (event, filters?: {
  tenant_id?: string;
  invoice_id?: string;
  limit?: number;
  offset?: number;
  search?: string;
}) => {
  try {
    const db = getDb();
    const { tenant_id, invoice_id, limit, offset, search } = filters || {};
    if (!tenant_id) return [];

    let query = `SELECT r.* FROM returns r WHERE r.tenant_id = ?`;
    const params: any[] = [tenant_id];

    if (invoice_id) {
      query += ' AND r.invoice_id = ?';
      params.push(invoice_id);
    }

    if (search) {
      query += ' AND (r.return_number LIKE ? OR r.customer_name LIKE ? OR r.customer_phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY r.created_at DESC';

    if (limit) { query += ' LIMIT ?'; params.push(limit); }
    if (offset) { query += ' OFFSET ?'; params.push(offset); }

    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:getReturns]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getReturnItems', (event, return_id: string) => {
  try {
    const db = getDb();
    return db.prepare('SELECT ri.*, p.sku_barcode, p.item_code FROM return_items ri LEFT JOIN products p ON ri.product_id = p.product_id WHERE ri.return_id = ?').all(return_id);
  } catch (error: any) {
    console.error('[db:getReturnItems]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:deleteReturn', (event, return_id: string) => {
  try {
    const db = getDb();
    const transaction = db.transaction(() => {
      const items = db.prepare('SELECT product_id, quantity FROM return_items WHERE return_id = ?').all(return_id) as any[];
      for (const item of items) {
        db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?').run(item.quantity, item.product_id);
      }
      db.prepare('DELETE FROM return_items WHERE return_id = ?').run(return_id);
      db.prepare('DELETE FROM returns WHERE return_id = ?').run(return_id);
    });
    transaction();
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteReturn]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getNextReturnNumber', safeHandler((event, payload: { tenant_id: string; prefix?: string }) => {
  const db = getDb();
  const terminalCode = getOrInitTerminalCode(db);
  const defaultPrefix = `${terminalCode}-RTN-`;
  const result = db.transaction(() => {
    const confRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'return_counter');
    let prefix = defaultPrefix;
    let counter = 1;
    if (payload.prefix) {
      prefix = payload.prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
    } else if (confRow) {
      const cfg = JSON.parse(confRow.value);
      prefix = (cfg.prefix || defaultPrefix).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
      counter = typeof cfg.counter === 'number' ? cfg.counter : 1;
    }
    const returnNumber = `${prefix}${String(counter).padStart(3, '0')}`;
    db.prepare(`INSERT INTO settings (tenant_id, key, value, sync_status, updated_at) VALUES ('global', 'return_counter', ?, 'PENDING', CURRENT_TIMESTAMP) ON CONFLICT(tenant_id, key) DO UPDATE SET value = EXCLUDED.value, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP`).run(JSON.stringify({ prefix, counter: counter + 1 }));
    return { returnNumber };
  })();
  return result;
}));

ipcMain.handle('db:peekNextReturnNumber', safeHandler((event, payload: { tenant_id: string; prefix?: string }) => {
  const db = getDb();
  const terminalCode = getOrInitTerminalCode(db);
  const defaultPrefix = `${terminalCode}-RTN-`;
  const confRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'return_counter');
  let prefix = defaultPrefix;
  let counter = 1;
  if (payload.prefix) {
    prefix = payload.prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
  } else if (confRow) {
    const cfg = JSON.parse(confRow.value);
    prefix = (cfg.prefix || defaultPrefix).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
    counter = typeof cfg.counter === 'number' ? cfg.counter : 1;
  }
  const returnNumber = `${prefix}${String(counter).padStart(3, '0')}`;
  return { success: true, returnNumber };
}));

ipcMain.handle('db:convertBosToGst', (event, payload: {
  invoice_ids: string[];
  tenant_id: string;
  user_id: string;
}) => {
  try {
    console.log('[convertBosToGst] Starting conversion for', payload.invoice_ids.length, 'invoices');
    const db = getDb();

    // Get shop state
    const shopStateRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(payload.tenant_id || 'global', 'shop_state');
    const shopState: string = shopStateRow ? JSON.parse(shopStateRow.value) : 'KL';

    // Get profit percentage
    const profitPctRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(payload.tenant_id || 'global', 'gst_profit_percentage');
    const profitPercentage = profitPctRow ? Number(JSON.parse(profitPctRow.value)) : 30;
    const multiplier = 1 + (profitPercentage / 100);

    const results: { invoice_id: string; old_number: string; new_number: string; success: boolean; error?: string }[] = [];

    for (const invoice_id of payload.invoice_ids) {
      // Look up invoice number first so it's available even if the transaction fails
      let invoiceNumber = '';
      const invLookup: any = db.prepare('SELECT invoice_number, invoice_type FROM invoices WHERE invoice_id = ? AND tenant_id = ?').get(invoice_id, payload.tenant_id);
      if (invLookup) {
        invoiceNumber = invLookup.invoice_number;
      }

      try {
        const invoice = db.transaction(() => {
          // Get the invoice
          const inv: any = db.prepare('SELECT * FROM invoices WHERE invoice_id = ? AND tenant_id = ?').get(invoice_id, payload.tenant_id);
          if (!inv) throw new Error('Invoice not found');
          if (inv.invoice_type === 'GST') throw new Error('Invoice is already a GST invoice');

          const oldInvoiceNumber = inv.invoice_number;

          // Get the next GST invoice number
          const terminalCode: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'terminal_code');
          const tc = terminalCode ? JSON.parse(terminalCode.value) : 'POS1';

          // Check if three invoice series is enabled
          const tripleSeriesRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'three_invoice_series');
          const tripleSeries = tripleSeriesRow ? JSON.parse(tripleSeriesRow.value) : null;

          let configKey = 'invoice_counter_config';
          let defaultPrefix = `${tc}-`;

          if (tripleSeries && tripleSeries.enabled) {
            const isB2B = inv.customer_gstin && inv.customer_gstin.trim() !== '';
            configKey = isB2B ? 'gst_b2b_invoice_counter_config' : 'gst_b2c_invoice_counter_config';
            defaultPrefix = isB2B ? `${tripleSeries.b2bPrefix || 'B2B'}-` : `${tripleSeries.b2cPrefix || 'B2C'}-`;
          } else {
            // Fallback to old dual series check
            const dualSeriesRow2: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'dual_invoice_series');
            const dualSeries2 = dualSeriesRow2 ? JSON.parse(dualSeriesRow2.value) : null;
            if (dualSeries2 && dualSeries2.enabled) {
              configKey = 'gst_invoice_counter_config';
              defaultPrefix = `${dualSeries2.gstTerminalCode || 'GST'}-`;
            }
          }

          const counterRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', configKey);
          let counter = 1;
          let config: { prefix: string; counter: number } = {
            prefix: defaultPrefix,
            counter: 1
          };

          if (counterRow) {
            try {
              config = JSON.parse(counterRow.value);
              counter = typeof config.counter === 'number' ? config.counter : 1;
            } catch {
              counter = 1;
            }
          }

          if (!config.prefix) {
            config.prefix = defaultPrefix;
          }

          const newInvoiceNumber = `${config.prefix}${String(counter).padStart(3, '0')}`;

          // Increment the counter
          config.counter = counter + 1;
          db.prepare(`
            INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
            VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
            ON CONFLICT(tenant_id, key) DO UPDATE SET
              value = EXCLUDED.value,
              sync_status = 'PENDING',
              updated_at = CURRENT_TIMESTAMP
          `).run('global', configKey, JSON.stringify(config));
          // Get invoice items
          const items: any[] = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice_id);

          let newSubtotal = 0;
          let newTotalTax = 0;
          const updatedItems: { item_id: string; newUnitPrice: number; newTotal: number; newTaxAmount: number }[] = [];
          const skippedItems: string[] = [];

          for (const item of items) {
            const gstPriceRow: any = db.prepare(`
              SELECT AVG(pbi.purchase_price) as avg_price
              FROM purchase_bill_items pbi
              WHERE pbi.product_id = ?
            `).get(item.product_id);

            if (!gstPriceRow || !gstPriceRow.avg_price) {
              skippedItems.push(item.name || item.product_id);
              continue;
            }

            const basePrice = Number(gstPriceRow.avg_price);
            const newUnitPrice = Math.round(basePrice * multiplier * 100) / 100;
            const qty = Number(item.quantity) || 0;
            const newTotal = Math.round(newUnitPrice * qty * 100) / 100;
            newSubtotal += newTotal;

            let taxRate = 0;
            const prod: any = db.prepare('SELECT tax_rate_percent FROM products WHERE product_id = ?').get(item.product_id);
            if (prod) taxRate = Number(prod.tax_rate_percent) || 0;

            const itemTax = Math.round(newTotal * (taxRate / 100) * 100) / 100;

            newTotalTax += itemTax;
            updatedItems.push({ item_id: item.item_id, newUnitPrice, newTotal, newTaxAmount: itemTax });
          }

          if (updatedItems.length === 0) {
            throw new Error('No items have GST purchase records. Conversion requires at least one item with a GST purchase bill entry.');
          }

          // Delete skipped items from invoice_items
          if (skippedItems.length > 0) {
            const skippedIds = items
              .filter(item => skippedItems.includes(item.name || item.product_id))
              .map(item => item.item_id);
            const deleteStmt = db.prepare('DELETE FROM invoice_items WHERE item_id = ?');
            for (const sid of skippedIds) {
              deleteStmt.run(sid);
            }
          }

          newSubtotal = Math.round(newSubtotal * 100) / 100;
          newTotalTax = Math.round(newTotalTax * 100) / 100;

          // Recalculate discount on new subtotal
          let newDiscountTotal = 0;
          if (inv.discount_type === 'PERCENTAGE' && Number(inv.discount_value) > 0) {
            newDiscountTotal = Math.round(newSubtotal * (Number(inv.discount_value) / 100) * 100) / 100;
          } else if (inv.discount_type === 'FIXED' && Number(inv.discount_value) > 0) {
            newDiscountTotal = Math.min(Number(inv.discount_value), newSubtotal);
          }

          const taxableAmount = newSubtotal - newDiscountTotal;
          const effectiveTaxRate = newSubtotal > 0 ? newTotalTax / newSubtotal : 0;
          const adjustedTax = Math.round(taxableAmount * effectiveTaxRate * 100) / 100;
          const newGrandTotal = Math.round((taxableAmount + adjustedTax) * 100) / 100;

          // Update invoice
          db.prepare(`
            UPDATE invoices SET
              invoice_type = 'GST',
              invoice_number = ?,
              subtotal = ?,
              tax_total = ?,
              discount_total = ?,
              grand_total = ?,
              sync_status = 'PENDING',
              updated_at = CURRENT_TIMESTAMP
            WHERE invoice_id = ?
          `).run(
            newInvoiceNumber,
            newSubtotal,
            adjustedTax,
            newDiscountTotal,
            newGrandTotal,
            invoice_id
          );

          // Update invoice items
          const updateItemStmt = db.prepare(`
            UPDATE invoice_items SET
              unit_price = ?,
              tax_amount = ?,
              total = ?
            WHERE item_id = ?
          `);

          for (const ui of updatedItems) {
            updateItemStmt.run(ui.newUnitPrice, ui.newTaxAmount, ui.newTotal, ui.item_id);
          }

          return {
            old_number: oldInvoiceNumber,
            new_number: newInvoiceNumber,
            skipped: skippedItems.length > 0 ? skippedItems : undefined
          };
        })();

        results.push({
          invoice_id,
          old_number: invoice.old_number,
          new_number: invoice.new_number,
          success: true,
          ...(invoice.skipped ? { skipped_items: invoice.skipped } : {})
        });
        console.log('[convertBosToGst] Converted', invoice_id, '→', invoice.new_number);
      } catch (err: any) {
        console.error('[convertBosToGst] Failed', invoice_id, err.message);
        results.push({ invoice_id, old_number: invoiceNumber, new_number: '', success: false, error: 'Conversion failed' });
      }
    }

    console.log('[convertBosToGst] Completed', results.filter(r => r.success).length, '/', results.length);
    return { success: true, results };
  } catch (error: any) {
    console.error('[convertBosToGst] Fatal error', error.message);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('settings:get', (event, { tenant_id, key }: { tenant_id: string; key: string }) => {
  try {
    const db = getDb();
    const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(tenant_id || 'global', key);
    return row ? JSON.parse(row.value) : null;
  } catch (error: any) {
    console.error('[settings:get]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('settings:set', (event, { tenant_id, key, value }: { tenant_id: string; key: string; value: any }) => {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO settings (tenant_id, key, value, sync_status, updated_at) 
      VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP) 
      ON CONFLICT(tenant_id, key) DO UPDATE SET 
        value = EXCLUDED.value, 
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
    `).run(tenant_id || 'global', key, JSON.stringify(value));
    return { success: true };
  } catch (error: any) {
    console.error('[settings:set]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('sync:runInitial', async (event) => {
  const { runInitialSync } = await import('./sync/syncWorker.js');
  return runInitialSync(event.sender);
});

ipcMain.handle('sync:getProgress', async () => {
  const { getSyncProgress } = await import('./sync/syncWorker.js');
  return getSyncProgress();
});

// ── Auth Token Persistence ───────────────────────────────────────────────────
const getConfigPath = () => path.join(app.getPath('userData'), 'config.json');
const getEncryptedPath = () => path.join(app.getPath('userData'), 'auth.enc');

const encrypt = (text: string): Buffer | null => {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[Auth] safeStorage unavailable — token will be stored in plaintext on disk');
    return Buffer.from(text);
  }
  return safeStorage.encryptString(text);
};

const decrypt = (data: Buffer): string | null => {
  if (!safeStorage.isEncryptionAvailable()) return data.toString('utf-8');
  try {
    return safeStorage.decryptString(data);
  } catch {
    return null;
  }
};

ipcMain.handle('auth:saveToken', (event, payload) => {
  try {
    const encrypted = encrypt(JSON.stringify(payload));
    if (encrypted) {
      fs.writeFileSync(getEncryptedPath(), encrypted);
    }
    // Remove legacy config after migration
    const oldPath = getConfigPath();
    if (fs.existsSync(oldPath)) {
      try { fs.unlinkSync(oldPath); } catch {}
    }
    setSyncActive(true);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: 'Failed to save token' };
  }
});

// Shared helper to read auth payload from encrypted storage
function readAuthPayload(): any {
  const encPath = getEncryptedPath();
  if (fs.existsSync(encPath)) {
    const raw = fs.readFileSync(encPath);
    const decrypted = decrypt(raw);
    if (decrypted) return JSON.parse(decrypted);
  }
  // Legacy fallback during migration
  const p = getConfigPath();
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    // Migrate to encrypted on next saveToken call
    return data;
  } catch {
    return null;
  }
}

ipcMain.handle('auth:getToken', () => {
  try {
    return readAuthPayload();
  } catch {
    return null;
  }
});

ipcMain.handle('auth:clearToken', () => {
  try {
    const encPath = getEncryptedPath();
    if (fs.existsSync(encPath)) fs.unlinkSync(encPath);
    const p = getConfigPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
    setSyncActive(false);
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to clear token' };
  }
});

function getOrInitTerminalCode(db: any): string {
  const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'terminal_code');
  if (row) return JSON.parse(row.value);
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  db.prepare(`INSERT INTO settings (tenant_id, key, value, sync_status, updated_at) VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)`).run('global', 'terminal_code', JSON.stringify(code));
  return code;
}

ipcMain.handle('db:getNextServerInvoiceNumber', async (event, { tenant_id, series }: { tenant_id: string; series?: string }) => {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);

    let prefix = `${terminalCode}-`;
    if (series === 'gst_b2b' || series === 'gst_b2c') {
      const tripleSeriesRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'three_invoice_series');
      const tripleSeries = tripleSeriesRow ? JSON.parse(tripleSeriesRow.value) : null;
      if (tripleSeries && tripleSeries.enabled) {
        const code = series === 'gst_b2b' ? tripleSeries.b2bPrefix : tripleSeries.b2cPrefix;
        if (code) prefix = `${code}-`;
      }
    }

    const config = readAuthPayload();
    if (!config) return { success: false, error: 'Not authenticated', offline: true };
    const token = config.jwt_token;
    if (!token) return { success: false, error: 'No auth token', offline: true };

    const apiUrl = process.env.VENDORA_CLOUD_API || 'http://localhost:3001';
    const url = `${apiUrl}/api/invoices/next-number?terminal_code=${encodeURIComponent(terminalCode)}${series ? `&series=${encodeURIComponent(series)}` : ''}&prefix=${encodeURIComponent(prefix)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return { success: false, error: `Server returned ${response.status}`, offline: true };
    const data = await response.json();

    // Sync local counter to server value so peek and header badge show the correct next number
    const configKey = series === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : series === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : series === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';
    const countMatch = String(data.invoiceNumber).match(/(\d+)$/);
    if (countMatch) {
      const serverCounter = parseInt(countMatch[1], 10);
      if (!isNaN(serverCounter)) {
        const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', configKey);
        let localCounter = 1;
        if (row) {
          try { localCounter = JSON.parse(row.value).counter || 1; } catch { localCounter = 1; }
        }
        if (serverCounter >= localCounter) {
          const newConfig = { prefix, counter: serverCounter + 1 };
          db.prepare(`
            INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
            VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
            ON CONFLICT(tenant_id, key) DO UPDATE SET
              value = EXCLUDED.value, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          `).run('global', configKey, JSON.stringify(newConfig));
        }
      }
    }

    return { success: true, invoiceNumber: data.invoiceNumber };
  } catch (error: any) {
    console.error('[db:getNextServerInvoiceNumber]', error);
    return { success: false, error: 'Operation failed', offline: true };
  }
});

ipcMain.handle('db:getNextInvoiceNumber', (event, { tenant_id, series }: { tenant_id: string; series?: string }) => {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);
    const configKey = series === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : series === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : series === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';

    const result = db.transaction(() => {
      const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', configKey);
      let counter = 1;
      let config: { prefix: string; counter: number } = { prefix: `${terminalCode}-`, counter: 1 };

      if (row) {
        try {
          config = JSON.parse(row.value);
          counter = (typeof config.counter === 'number' ? config.counter : 1);
        } catch {
          counter = 1;
        }
      }

      const invoiceNumber = `${config.prefix || `${terminalCode}-`}${String(counter).padStart(3, '0')}`;
      
      config.counter = counter + 1;
      db.prepare(`
        INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
        VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, key) DO UPDATE SET
          value = EXCLUDED.value,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      `).run('global', configKey, JSON.stringify(config));

      return { success: true, invoiceNumber, counter };
    })();

    return result;
  } catch (error: any) {
    console.error('[db:getNextInvoiceNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:peekNextInvoiceNumber', (event, { tenant_id, series }: { tenant_id: string; series?: string }) => {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);
    const configKey = series === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : series === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : series === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';

    const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', configKey);
    if (row) {
      const config = JSON.parse(row.value);
      return { success: true, invoiceNumber: `${config.prefix || `${terminalCode}-`}${String(config.counter || 1).padStart(3, '0')}` };
    }
    return { success: true, invoiceNumber: `${terminalCode}-001` };
  } catch (error: any) {
    console.error('[db:peekNextInvoiceNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// ── Scrap Categories IPC ───────────────────────────────────────
// ── Scrap Categories IPC (categories ARE items, with price/stock/unit) ──
ipcMain.handle('db:getScrapCategories', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare('SELECT * FROM scrap_categories WHERE tenant_id = ? AND is_deleted = 0 ORDER BY name COLLATE NOCASE ASC').all(tenantId);
  } catch (error: any) {
    console.error('[db:getScrapCategories]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:addScrapCategory', (event, cat) => {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO scrap_categories (scrap_category_id, tenant_id, name, purchase_price, selling_price, current_stock, unit, is_deleted, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'PENDING')
    `).run(cat.scrap_category_id, cat.tenant_id, cat.name, cat.purchase_price || 0, cat.selling_price || 0, cat.current_stock || 0, cat.unit || 'Kgs');
    return { success: true };
  } catch (error: any) {
    console.error('[db:addScrapCategory]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateScrapCategory', (event, cat) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE scrap_categories SET name = ?, purchase_price = ?, selling_price = ?, current_stock = ?, unit = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE scrap_category_id = ?
    `).run(cat.name, cat.purchase_price || 0, cat.selling_price || 0, cat.current_stock || 0, cat.unit || 'Kgs', cat.scrap_category_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:updateScrapCategory]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:deleteScrapCategory', (event, scrapCategoryId: string) => {
  try {
    const db = getDb();
    db.prepare(`UPDATE scrap_categories SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`).run(scrapCategoryId);
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteScrapCategory]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:deduplicateScrapCategories', () => {
  try {
    const db = getDb();
    const dupes: any[] = db.prepare(`
      SELECT scrap_category_id, COUNT(*) as cnt, MIN(rowid) as keep_rowid
      FROM scrap_categories
      GROUP BY scrap_category_id
      HAVING COUNT(*) > 1
    `).all();
    let removed = 0;
    for (const d of dupes) {
      const result = db.prepare(`DELETE FROM scrap_categories WHERE scrap_category_id = ? AND rowid != ?`).run(d.scrap_category_id, d.keep_rowid);
      removed += result.changes;
    }
    return { removed };
  } catch (error: any) {
    console.error('[db:deduplicateScrapCategories]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:addScrapTransaction', safeHandler((event, t) => {
  try {
    const db = getDb();
    const delta = t.type === 'PURCHASE' ? t.quantity : -t.quantity;
    const paymentStatus = t.payment_status || 'CASH';
    const result = db.transaction(() => {
      db.prepare(`
        INSERT INTO scrap_transactions (transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, payment_status, sync_status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
      `).run(t.transaction_id, t.tenant_id, t.type, t.scrap_category_id, t.quantity, t.rate, t.total_amount, t.party_name || null, t.customer_phone || null, t.customer_address || null, t.notes || null, t.scrap_invoice_number || null, paymentStatus);
      db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`).run(delta, t.scrap_category_id);
      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:addScrapTransaction]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:getScrapTransactions', (event, { tenant_id, scrap_category_id }: { tenant_id: string; scrap_category_id?: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    let query = `
      SELECT st.*, sc.name as scrap_category_name, sc.unit 
      FROM scrap_transactions st 
      LEFT JOIN scrap_categories sc ON st.scrap_category_id = sc.scrap_category_id 
      WHERE st.tenant_id = ?
    `;
    const params: any[] = [tenant_id];
    if (scrap_category_id) {
      query += ' AND st.scrap_category_id = ?';
      params.push(scrap_category_id);
    }
    query += ' ORDER BY st.created_at DESC LIMIT 500';
    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:getScrapTransactions]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getScrapCategoriesBySearch', (event, { tenant_id, search }: { tenant_id: string; search: string }) => {
  try {
    const db = getDb();
    if (!tenant_id || !search) return [];
    return db.prepare(`
      SELECT * FROM scrap_categories 
      WHERE tenant_id = ? AND is_deleted = 0 AND name LIKE ?
      ORDER BY name COLLATE NOCASE ASC
      LIMIT 10
    `).all(tenant_id, `%${search}%`);
  } catch (error: any) {
    console.error('[db:getScrapCategoriesBySearch]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getNextScrapInvoiceNumber', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);
    const configKey = 'scrap_invoice_counter';

    const result = db.transaction(() => {
      const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', configKey);
      let counter = 1;
      let config: { prefix: string; counter: number } = { prefix: `${terminalCode}-SCR-`, counter: 1 };

      if (row) {
        try {
          config = JSON.parse(row.value);
          counter = (typeof config.counter === 'number' ? config.counter : 1);
        } catch {
          counter = 1;
        }
      }

      const prefix = (config.prefix || `${terminalCode}-SCR-`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || `${terminalCode}-SCR-`;
      const invoiceNumber = `${prefix}${String(counter).padStart(3, '0')}`;

      config.counter = counter + 1;
      db.prepare(`
        INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
        VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, key) DO UPDATE SET
          value = EXCLUDED.value,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      `).run('global', configKey, JSON.stringify(config));

      return { success: true, invoiceNumber, counter };
    })();

    return result;
  } catch (error: any) {
    console.error('[db:getNextScrapInvoiceNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:peekNextScrapInvoiceNumber', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);

    const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'scrap_invoice_counter');
    if (row) {
      const config = JSON.parse(row.value);
      const prefix = (config.prefix || `${terminalCode}-SCR-`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || `${terminalCode}-SCR-`;
      return { success: true, invoiceNumber: `${prefix}${String(config.counter || 1).padStart(3, '0')}` };
    }
    return { success: true, invoiceNumber: `${terminalCode}-SCR-001` };
  } catch (error: any) {
    console.error('[db:peekNextScrapInvoiceNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getScrapInvoiceByNumber', (event, { tenant_id, scrap_invoice_number }: { tenant_id: string; scrap_invoice_number: string }) => {
  try {
    const db = getDb();
    if (!tenant_id || !scrap_invoice_number) return null;
    const rows: any[] = db.prepare(`
      SELECT st.*, sc.name as scrap_category_name, sc.unit
      FROM scrap_transactions st
      LEFT JOIN scrap_categories sc ON st.scrap_category_id = sc.scrap_category_id
      WHERE st.tenant_id = ? AND st.scrap_invoice_number = ?
      ORDER BY st.created_at DESC
    `).all(tenant_id, scrap_invoice_number);
    if (rows.length === 0) return null;
    const totalAmount = rows.reduce((sum, r) => sum + r.total_amount, 0);
    return { transactions: rows, totalAmount, invoiceNumber: scrap_invoice_number };
  } catch (error: any) {
    console.error('[db:getScrapInvoiceByNumber]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getScrapInvoiceList', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    const rows: any[] = db.prepare(`
      SELECT 
        st.scrap_invoice_number as invoice_number,
        COUNT(st.transaction_id) as item_count,
        SUM(st.quantity) as total_qty,
        GROUP_CONCAT(DISTINCT sc.unit) as units,
        SUM(st.total_amount) as total_amount,
        MAX(st.payment_status) as payment_status,
        MIN(st.created_at) as created_at,
        MAX(st.created_at) as updated_at,
        MAX(st.party_name) as party_name,
        MAX(st.customer_phone) as customer_phone,
        MAX(st.customer_address) as customer_address
      FROM scrap_transactions st
      LEFT JOIN scrap_categories sc ON st.scrap_category_id = sc.scrap_category_id
      WHERE st.tenant_id = ? AND st.scrap_invoice_number IS NOT NULL AND st.type = 'PURCHASE'
      GROUP BY st.scrap_invoice_number
      ORDER BY created_at DESC
      LIMIT 500
    `).all(tenant_id);
    return rows;
  } catch (error: any) {
    console.error('[db:getScrapInvoiceList]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateScrapInvoicePaymentStatus', (event, { tenant_id, scrap_invoice_number, payment_status }: { tenant_id: string; scrap_invoice_number: string; payment_status: string }) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE scrap_transactions SET payment_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND scrap_invoice_number = ?
    `).run(payment_status, tenant_id, scrap_invoice_number);
    return { success: true };
  } catch (error: any) {
    console.error('[db:updateScrapInvoicePaymentStatus]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getStockReport', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare(`
      SELECT p.*, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price, pg.grade_name, pg.category as grade_category
      FROM products p 
      LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id 
      WHERE p.tenant_id = ? AND p.is_deleted = 0 
      ORDER BY p.category ASC, p.name COLLATE NOCASE ASC
    `).all(tenantId);
  } catch (error: any) {
    console.error('[db:getStockReport]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getProductBillQuantities', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare(`
      SELECT ii.product_id,
             COALESCE(SUM(CASE WHEN i.invoice_type = 'GST' THEN ii.quantity ELSE 0 END), 0) as gst_qty,
             COALESCE(SUM(CASE WHEN i.invoice_type = 'BILL_OF_SUPPLY' THEN ii.quantity ELSE 0 END), 0) as estimate_qty
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.invoice_id
      WHERE ii.tenant_id = ?
      GROUP BY ii.product_id
    `).all(tenantId);
  } catch (error: any) {
    console.error('[db:getProductBillQuantities]', error);
    return [];
  }
});

// ── Quotations IPC ─────────────────────────────────────────────
ipcMain.handle('db:getNextQuotationNumber', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);
    const configKey = 'quotation_counter';

    const result = db.transaction(() => {
      const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', configKey);
      let counter = 1;
      let config: { prefix: string; counter: number } = { prefix: `${terminalCode}-QTN-`, counter: 1 };

      if (row) {
        try {
          config = JSON.parse(row.value);
          counter = (typeof config.counter === 'number' ? config.counter : 1);
        } catch {
          counter = 1;
        }
      }

      const prefix = (config.prefix || `${terminalCode}-QTN-`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || `${terminalCode}-QTN-`;
      const quotationNumber = `${prefix}${String(counter).padStart(3, '0')}`;

      config.counter = counter + 1;
      db.prepare(`
        INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
        VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, key) DO UPDATE SET
          value = EXCLUDED.value,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      `).run('global', configKey, JSON.stringify(config));

      return { success: true, quotationNumber, counter };
    })();

    return result;
  } catch (error: any) {
    console.error('[db:getNextQuotationNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:peekNextQuotationNumber', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);

    const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'quotation_counter');
    if (row) {
      const config = JSON.parse(row.value);
      const prefix = (config.prefix || `${terminalCode}-QTN-`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || `${terminalCode}-QTN-`;
      return { success: true, quotationNumber: `${prefix}${String(config.counter || 1).padStart(3, '0')}` };
    }
    return { success: true, quotationNumber: `${terminalCode}-QTN-001` };
  } catch (error: any) {
    console.error('[db:peekNextQuotationNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:saveQuotation', safeHandler((event, q) => {
  try {
    const db = getDb();
    const result = db.transaction(() => {
      db.prepare(`
        INSERT INTO quotations (quotation_id, tenant_id, quotation_number, customer_name, customer_phone, customer_address, terms_conditions, subtotal, tax_total, grand_total, status, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'PENDING')
      `).run(q.quotation_id, q.tenant_id, q.quotation_number, q.customer_name || null, q.customer_phone || null, q.customer_address || null, q.terms_conditions || null, q.subtotal, q.tax_total, q.grand_total);

      const stmt = db.prepare(`
        INSERT INTO quotation_items (item_id, quotation_id, tenant_id, product_id, name, quantity, weight, rate, amount, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `);
      for (const item of q.items) {
        stmt.run(item.item_id, q.quotation_id, q.tenant_id, item.product_id || null, item.name, item.quantity, item.weight || null, item.rate, item.amount);
      }
      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:saveQuotation]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:getQuotations', (event, { tenant_id, search }: { tenant_id: string; search?: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    let query = 'SELECT * FROM quotations WHERE tenant_id = ?';
    const params: any[] = [tenant_id];
    if (search) {
      query += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR quotation_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY created_at DESC LIMIT 200';
    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:getQuotations]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getQuotationItems', (event, quotationId: string) => {
  try {
    const db = getDb();
    return db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY created_at ASC').all(quotationId);
  } catch (error: any) {
    console.error('[db:getQuotationItems]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:deleteQuotation', (event, quotationId: string) => {
  try {
    const db = getDb();
    db.transaction(() => {
      db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(quotationId);
      db.prepare('DELETE FROM quotations WHERE quotation_id = ?').run(quotationId);
    })();
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteQuotation]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateQuotation', (event, q) => {
  try {
    const db = getDb();
    const result = db.transaction(() => {
      // Update header
      db.prepare(`
        UPDATE quotations SET 
          customer_name = ?, customer_phone = ?, customer_address = ?, terms_conditions = ?,
          subtotal = ?, tax_total = ?, grand_total = ?,
          sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE quotation_id = ?
      `).run(q.customer_name || null, q.customer_phone || null, q.customer_address || null, q.terms_conditions || null, q.subtotal, q.tax_total, q.grand_total, q.quotation_id);

      // Delete old items
      db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(q.quotation_id);

      // Insert new items
      const stmt = db.prepare(`
        INSERT INTO quotation_items (item_id, quotation_id, tenant_id, product_id, name, quantity, weight, rate, amount, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `);
      for (const item of q.items) {
        stmt.run(item.item_id, q.quotation_id, q.tenant_id, item.product_id || null, item.name, item.quantity, item.weight || null, item.rate, item.amount);
      }
      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:updateQuotation]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateQuotationStatus', (event, { quotation_id, status, converted_to_invoice, invoice_id }: { quotation_id: string; status?: string; converted_to_invoice?: number; invoice_id?: string }) => {
  try {
    const db = getDb();
    const updates: string[] = ["sync_status = 'PENDING'", "updated_at = CURRENT_TIMESTAMP"];
    const params: any[] = [];
    if (status) { updates.push('status = ?'); params.push(status); }
    if (converted_to_invoice !== undefined) { updates.push('converted_to_invoice = ?'); params.push(converted_to_invoice); }
    if (invoice_id) { updates.push('invoice_id = ?'); params.push(invoice_id); }
    params.push(quotation_id);
    db.prepare(`UPDATE quotations SET ${updates.join(', ')} WHERE quotation_id = ?`).run(...params);
    return { success: true };
  } catch (error: any) {
    console.error('[db:updateQuotationStatus]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// ── Warranties IPC ─────────────────────────────────────────────
ipcMain.handle('db:saveWarranty', safeHandler((event, w) => {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO warranties (warranty_id, tenant_id, invoice_id, invoice_item_id, customer_name, customer_phone, product_name, product_details, purchase_date, warranty_period_days, expiry_date, notes, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(w.warranty_id, w.tenant_id, w.invoice_id || null, w.invoice_item_id || null, w.customer_name, w.customer_phone || null, w.product_name, w.product_details || null, w.purchase_date, w.warranty_period_days, w.expiry_date, w.notes || null);
    return { success: true };
  } catch (error: any) {
    console.error('[db:saveWarranty]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:getWarranties', (event, { tenant_id, search }: { tenant_id: string; search?: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    let query = 'SELECT * FROM warranties WHERE tenant_id = ?';
    const params: any[] = [tenant_id];
    if (search) {
      query += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR product_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY created_at DESC LIMIT 200';
    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:getWarranties]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:deleteWarranty', (event, warrantyId: string) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM warranties WHERE warranty_id = ?').run(warrantyId);
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteWarranty]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// ── Purchase Bill IPC ─────────────────────────────────────────────
ipcMain.handle('db:getNextPurchaseBillNumber', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);
    const configKey = 'purchase_bill_counter';

    const result = db.transaction(() => {
      const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', configKey);
      let counter = 1;
      let config: { prefix: string; counter: number } = { prefix: `${terminalCode}-PUR-`, counter: 1 };

      if (row) {
        try {
          config = JSON.parse(row.value);
          counter = (typeof config.counter === 'number' ? config.counter : 1);
        } catch {
          counter = 1;
        }
      }

      const billNumber = `${terminalCode}-PUR-${String(counter).padStart(3, '0')}`;

      config.counter = counter + 1;
      db.prepare(`
        INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
        VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, key) DO UPDATE SET
          value = EXCLUDED.value,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      `).run('global', configKey, JSON.stringify(config));

      return { success: true, billNumber, counter };
    })();

    return result;
  } catch (error: any) {
    console.error('[db:getNextPurchaseBillNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:addPurchaseBill', safeHandler((event, payload: {
  purchase_bill_id: string;
  tenant_id: string;
  bill_number: string;
  supplier_id?: string;
  supplier_name: string;
  bill_date?: string;
  invoice_number?: string;
  notes?: string;
  total_amount: number;
  bill_type?: string;
  payment_type?: string;
  items: Array<{
    item_id: string;
    product_id: string;
    name: string;
    quantity: number;
    purchase_price: number;
    total_amount: number;
    selling_price?: number | null;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
  }>;
}) => {
  try {
    const db = getDb();
    const billType = payload.bill_type || 'GST';
    const paymentType = payload.payment_type || 'CASH';
    const result = db.transaction(() => {
      const { items, ...bill } = payload;
      db.prepare(`
        INSERT INTO purchase_bills (purchase_bill_id, tenant_id, bill_number, supplier_id, supplier_name, bill_date, invoice_number, notes, total_amount, bill_type, payment_type, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(bill.purchase_bill_id, bill.tenant_id, bill.bill_number, bill.supplier_id || null, bill.supplier_name, bill.bill_date || null, bill.invoice_number || null, bill.notes || null, bill.total_amount, billType, paymentType);

      const stmt = db.prepare(`
        INSERT INTO purchase_bill_items (item_id, purchase_bill_id, tenant_id, product_id, name, quantity, purchase_price, total_amount, is_gst_applicable, tax_rate_percent, hsn_sac_code, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      const updateStock = billType === 'ESTIMATE' ? db.prepare(`UPDATE products SET current_stock = current_stock + ?, purchase_price = ? WHERE product_id = ? AND tenant_id = ?`) : null;
      const updatePrice = db.prepare(`UPDATE products SET base_price = ? WHERE product_id = ? AND tenant_id = ?`);
      for (const item of items) {
        const isGst = billType === 'GST' ? (item.is_gst_applicable ?? 1) : 0;
        stmt.run(item.item_id, bill.purchase_bill_id, bill.tenant_id, item.product_id, item.name, item.quantity, item.purchase_price, item.total_amount, isGst, item.tax_rate_percent ?? 0, item.hsn_sac_code || null);
        if (updateStock) {
          updateStock.run(item.quantity, item.purchase_price, item.product_id, bill.tenant_id);
        }
        if (item.selling_price != null) {
          updatePrice.run(item.selling_price, item.product_id, bill.tenant_id);
        }
      }

      // If CREDIT payment and supplier is a known party, create ledger entry
      if (paymentType === 'CREDIT' && bill.supplier_id) {
        const party = db.prepare('SELECT balance FROM parties WHERE party_id = ?').get(bill.supplier_id) as any;
        if (party) {
          const currentBalance = parseFloat(party.balance) || 0;
          const ledgerId = crypto.randomUUID();
          const debitAmount = bill.total_amount;
          const newBalance = currentBalance - debitAmount;
          db.prepare(`
            INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, reference_number, created_by, created_by_name, sync_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(ledgerId, bill.supplier_id, bill.tenant_id, bill.bill_date || new Date().toISOString(), `Purchase bill ${bill.bill_number} - ${bill.supplier_name}`, 0, debitAmount, newBalance, bill.bill_number, 'system', 'System');
          db.prepare(`UPDATE parties SET balance = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`)
            .run(newBalance, bill.bill_date || new Date().toISOString(), bill.supplier_id);
        }
      }

      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:addPurchaseBill]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:getPurchaseBills', (event, { tenant_id, search, limit, offset }: { tenant_id: string; search?: string; limit?: number; offset?: number }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];

    let query = 'SELECT pb.*, p.phone as supplier_phone, p.gstin as supplier_gstin FROM purchase_bills pb LEFT JOIN parties p ON pb.supplier_id = p.party_id WHERE pb.tenant_id = ?';
    const params: any[] = [tenant_id];

    if (search) {
      query += ' AND (pb.bill_number LIKE ? OR pb.supplier_name LIKE ? OR pb.invoice_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY pb.created_at DESC';

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
    console.error('[db:getPurchaseBills]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getPurchaseBillItems', (event, purchase_bill_id: string) => {
  try {
    const db = getDb();
    return db.prepare('SELECT pbi.*, p.sku_barcode, p.item_code FROM purchase_bill_items pbi LEFT JOIN products p ON pbi.product_id = p.product_id WHERE pbi.purchase_bill_id = ? ORDER BY pbi.created_at ASC').all(purchase_bill_id);
  } catch (error: any) {
    console.error('[db:getPurchaseBillItems]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:updatePurchaseBill', safeHandler((event, payload: {
  purchase_bill_id: string;
  tenant_id: string;
  bill_number: string;
  supplier_id?: string;
  supplier_name: string;
  bill_date?: string;
  invoice_number?: string;
  notes?: string;
  total_amount: number;
  bill_type?: string;
  payment_type?: string;
  items: Array<{
    item_id: string;
    product_id: string;
    name: string;
    quantity: number;
    purchase_price: number;
    total_amount: number;
    selling_price?: number | null;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
  }>;
}) => {
  try {
    const db = getDb();
    const billType = payload.bill_type || 'GST';
    const paymentType = payload.payment_type || 'CASH';
    const result = db.transaction(() => {
      const { items, ...bill } = payload;
      db.prepare(`
        UPDATE purchase_bills SET supplier_id = ?, supplier_name = ?, bill_date = ?, invoice_number = ?, notes = ?, total_amount = ?, bill_type = ?, payment_type = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE purchase_bill_id = ?
      `).run(bill.supplier_id || null, bill.supplier_name, bill.bill_date || null, bill.invoice_number || null, bill.notes || null, bill.total_amount, billType, paymentType, bill.purchase_bill_id);

      db.prepare('DELETE FROM purchase_bill_items WHERE purchase_bill_id = ?').run(bill.purchase_bill_id);

      const stmt = db.prepare(`
        INSERT INTO purchase_bill_items (item_id, purchase_bill_id, tenant_id, product_id, name, quantity, purchase_price, total_amount, is_gst_applicable, tax_rate_percent, hsn_sac_code, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      const updatePrice = db.prepare(`UPDATE products SET base_price = ? WHERE product_id = ? AND tenant_id = ?`);
      for (const item of items) {
        const isGst = billType === 'GST' ? (item.is_gst_applicable ?? 1) : 0;
        stmt.run(item.item_id, bill.purchase_bill_id, bill.tenant_id, item.product_id, item.name, item.quantity, item.purchase_price, item.total_amount, isGst, item.tax_rate_percent ?? 0, item.hsn_sac_code || null);
        if (item.selling_price != null) {
          updatePrice.run(item.selling_price, item.product_id, bill.tenant_id);
        }
      }

      if (paymentType === 'CREDIT' && bill.supplier_id) {
        const party = db.prepare('SELECT balance FROM parties WHERE party_id = ?').get(bill.supplier_id) as any;
        if (party) {
          const currentBalance = parseFloat(party.balance) || 0;
          const ledgerId = crypto.randomUUID();
          const debitAmount = bill.total_amount;
          const newBalance = currentBalance - debitAmount;
          db.prepare(`
            INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, reference_number, created_by, created_by_name, sync_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(ledgerId, bill.supplier_id, bill.tenant_id, bill.bill_date || new Date().toISOString(), `Purchase bill ${bill.bill_number} - ${bill.supplier_name}`, 0, debitAmount, newBalance, bill.bill_number, 'system', 'System');
          db.prepare(`UPDATE parties SET balance = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`)
            .run(newBalance, bill.bill_date || new Date().toISOString(), bill.supplier_id);
        }
      }

      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:updatePurchaseBill]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:deletePurchaseBill', (event, purchase_bill_id: string) => {
  try {
    const db = getDb();
    db.transaction(() => {
      db.prepare('DELETE FROM purchase_bill_items WHERE purchase_bill_id = ?').run(purchase_bill_id);
      db.prepare('DELETE FROM purchase_bills WHERE purchase_bill_id = ?').run(purchase_bill_id);
    })();
    return { success: true };
  } catch (error: any) {
    console.error('[db:deletePurchaseBill]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getPurchaseBillProducts', (event, { tenant_id, search }: { tenant_id: string; search?: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];

    let query = `
      SELECT p.*, 
        COALESCE((SELECT SUM(pbi.quantity) FROM purchase_bill_items pbi JOIN purchase_bills pb ON pb.purchase_bill_id = pbi.purchase_bill_id WHERE pbi.product_id = p.product_id AND pb.bill_type = 'GST'), 0) as gst_purchase_quantity,
        COALESCE((SELECT AVG(pbi.purchase_price) FROM purchase_bill_items pbi JOIN purchase_bills pb ON pb.purchase_bill_id = pbi.purchase_bill_id WHERE pbi.product_id = p.product_id AND pb.bill_type = 'GST'), 0) as gst_purchase_price
      FROM products p 
      WHERE p.tenant_id = ? AND p.is_deleted = 0
    `;
    const params: any[] = [tenant_id];

    if (search) {
      if (/^\d+$/.test(search)) {
        query += ' AND (p.sku_barcode LIKE ? OR p.item_code LIKE ?)';
        params.push(`${search}%`, `${search}%`);
      } else {
        query += ' AND (p.name LIKE ? OR p.sku_barcode LIKE ? OR p.item_code LIKE ?)';
        params.push(`%${search}%`, `${search}%`, `${search}%`);
      }
    }

    query += ' ORDER BY p.name COLLATE NOCASE ASC LIMIT 200';
    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:getPurchaseBillProducts]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:generateBarcode', (event, { tenant_id, item_code }: { tenant_id: string; item_code?: string }) => {
  try {
    const db = getDb();
    const prefix = (item_code || '').trim();
    let nextNum = 1;
    if (prefix) {
      const maxRow = db.prepare(
        `SELECT sku_barcode FROM products WHERE tenant_id = ? AND sku_barcode LIKE ? ORDER BY LENGTH(sku_barcode) DESC, sku_barcode DESC LIMIT 1`
      ).get(tenant_id, `${prefix}%`) as any;
      if (maxRow?.sku_barcode) {
        const numPart = maxRow.sku_barcode.slice(prefix.length).replace(/\D/g, '');
        if (numPart) nextNum = parseInt(numPart, 10) + 1;
      }
    } else {
      const maxRow = db.prepare(
        `SELECT sku_barcode FROM products WHERE tenant_id = ? AND sku_barcode GLOB '[0-9]*' ORDER BY LENGTH(sku_barcode) DESC, sku_barcode DESC LIMIT 1`
      ).get(tenant_id) as any;
      if (maxRow?.sku_barcode) {
        const numPart = maxRow.sku_barcode.replace(/\D/g, '');
        if (numPart) nextNum = parseInt(numPart, 10) + 1;
      }
    }
    const digits = Math.max(3, nextNum.toString().length);
    const barcode = prefix + String(nextNum).padStart(digits, '0');
    return { success: true, barcode };
  } catch (error: any) {
    console.error('[db:generateBarcode]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// ── Cashier & Settlement IPC Handlers ─────────────────────────────────────────

ipcMain.handle('db:cashier:getDrawer', (event, { tenant_id, business_date }: { tenant_id: string; business_date?: string }) => {
  try {
    const db = getDb();
    const date = business_date || new Date().toISOString().split('T')[0];
    const drawer = db.prepare(`SELECT * FROM cash_drawer WHERE tenant_id = ? AND business_date = ?`).get(tenant_id, date) as any;
    return drawer || null;
  } catch (error: any) {
    console.error(`[Cashier] getDrawer error:`, error.message);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:setOpeningBalance', safeHandler((event, { tenant_id, opening_balance, user_id, user_name }: { tenant_id: string; opening_balance: number; user_id: string; user_name?: string }) => {
  try {
    const db = getDb();
    const date = new Date().toISOString().split('T')[0];

    // Block setting opening balance if yesterday is still open
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const prevDrawer = db.prepare(`SELECT * FROM cash_drawer WHERE tenant_id = ? AND business_date = ?`).get(tenant_id, yesterdayStr) as any;
    if (prevDrawer && prevDrawer.status === 'OPEN') {
      console.log(`[Cashier] setOpeningBalance BLOCKED: yesterday ${yesterdayStr} is still OPEN`);
      return { success: false, error: 'Yesterday\'s cash drawer is not closed. Close it first before setting today\'s opening balance.' };
    }

    const existing = db.prepare(`SELECT * FROM cash_drawer WHERE tenant_id = ? AND business_date = ?`).get(tenant_id, date) as any;
    
    if (existing) {      db.prepare(`
        UPDATE cash_drawer SET 
          opening_balance = ?, 
          current_cash = ?, 
          expected_closing = ?, 
          status = 'OPEN', 
          opened_by = ?, 
          opened_at = CURRENT_TIMESTAMP, 
          actual_cash = NULL, 
          cash_short = 0, 
          cash_excess = 0, 
          closing_remarks = NULL, 
          closed_by = NULL, 
          closed_at = NULL, 
          sync_status = 'PENDING', 
          updated_at = CURRENT_TIMESTAMP
        WHERE drawer_id = ?
      `).run(opening_balance, opening_balance, opening_balance, user_id, existing.drawer_id);
    } else {
      const drawer_id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, opening_balance, current_cash, expected_closing, status, opened_by, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, 'PENDING')
      `).run(drawer_id, tenant_id, date, opening_balance, opening_balance, opening_balance, user_id);
    }
    
    const dId = existing ? existing.drawer_id : '';
    db.prepare(`
      INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(crypto.randomUUID(), tenant_id, dId, 'OPENING_BALANCE_SET', JSON.stringify({ opening_balance, business_date: date }), user_id, user_name || null);
    
    return { success: true };
  } catch (error: any) {
    console.error('[db:cashier:setOpeningBalance]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:cashier:getPendingInvoices', (event, { tenant_id, search }: { tenant_id: string; search?: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    
    let query = `
      SELECT i.*, u.name as biller_name 
      FROM invoices i 
      LEFT JOIN users u ON i.user_id = u.user_id 
      WHERE i.tenant_id = ? AND i.payment_method = 'PENDING'
    `;
    const params: any[] = [tenant_id];
    
    if (search) {
      query += ` AND (i.invoice_number LIKE ? OR i.customer_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ` ORDER BY i.created_at DESC LIMIT 100`;
    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:cashier:getPendingInvoices]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:settlePayment', safeHandler((event, { tenant_id, invoice_id, received_amount, payment_method, user_id, user_name }: {
  tenant_id: string; invoice_id: string; received_amount: number; payment_method: string; user_id: string; user_name?: string
}) => {
  const db = getDb();
  const validMethods = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'SPLIT'];
  if (!validMethods.includes(payment_method)) {
    return { success: false, error: 'Invalid payment method' };
  }
  
  try {
    const tx = db.transaction(() => {
      const invoice = db.prepare(`SELECT * FROM invoices WHERE invoice_id = ? AND tenant_id = ?`).get(invoice_id, tenant_id) as any;
      if (!invoice) throw new Error('Invoice not found');
      
      const grand_total = Number(invoice.grand_total);
      const received = Number(received_amount);
      const discount = Math.max(0, grand_total - received);
      
      db.prepare(`
        UPDATE invoices SET payment_method = ?, received_amount = ?, discount_total = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE invoice_id = ? AND tenant_id = ?
      `).run(payment_method, received, discount, invoice_id, tenant_id);
      
      if (payment_method === 'CASH') {
        const date = new Date().toISOString().split('T')[0];
        const drawer = db.prepare(`SELECT * FROM cash_drawer WHERE tenant_id = ? AND business_date = ? AND status = 'OPEN'`).get(tenant_id, date) as any;
        if (drawer) {
          const newCashSales = Number(drawer.cash_sales) + received;
          const newCurrentCash = Number(drawer.current_cash) + received;
          const newExpectedClosing = Number(drawer.opening_balance) + newCashSales + Number(drawer.cash_in) - Number(drawer.cash_out);
          db.prepare(`
            UPDATE cash_drawer SET cash_sales = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE drawer_id = ?
          `).run(newCashSales, newCurrentCash, newExpectedClosing, drawer.drawer_id);
        }
      }
      
      db.prepare(`
        INSERT INTO cashier_audit_log (audit_id, tenant_id, action, details, performed_by, performed_by_name, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(
        crypto.randomUUID(), tenant_id, 'PAYMENT_COMPLETED',
        JSON.stringify({ invoice_id, invoice_number: invoice.invoice_number, received_amount: received, discount, payment_method, grand_total }),
        user_id, user_name || null
      );
    });
    
    tx();
    return { success: true };
  } catch (error: any) {
    console.error('[db:cashier:settlePayment]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:cashier:addTransaction', safeHandler((event, { tenant_id, type, amount, category, notes, user_id, user_name }: {
  tenant_id: string; type: 'CASH_IN' | 'CASH_OUT'; amount: number; category?: string; notes?: string; user_id: string; user_name?: string
}) => {
  const db = getDb();
  if (!['CASH_IN', 'CASH_OUT'].includes(type)) return { success: false, error: 'Type must be CASH_IN or CASH_OUT' };
  if (!amount || amount <= 0) return { success: false, error: 'Amount must be positive' };
  
  try {
    const tx = db.transaction(() => {
      const date = new Date().toISOString().split('T')[0];
      const drawer = db.prepare(`SELECT * FROM cash_drawer WHERE tenant_id = ? AND business_date = ? AND status = 'OPEN'`).get(tenant_id, date) as any;
      if (!drawer) throw new Error('No open cash drawer for today. Set opening balance first.');
      
      const transaction_id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, entered_by_name, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(transaction_id, tenant_id, drawer.drawer_id, type, amount, category || null, notes || null, user_id, user_name || null);
      
      let newCashIn = Number(drawer.cash_in);
      let newCashOut = Number(drawer.cash_out);
      let newCurrentCash = Number(drawer.current_cash);
      
      if (type === 'CASH_IN') {
        newCashIn += Number(amount);
        newCurrentCash += Number(amount);
      } else {
        newCashOut += Number(amount);
        newCurrentCash -= Number(amount);
      }
      
      const newExpectedClosing = Number(drawer.opening_balance) + Number(drawer.cash_sales) + newCashIn - newCashOut;
      
      db.prepare(`
        UPDATE cash_drawer SET cash_in = ?, cash_out = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE drawer_id = ?
      `).run(newCashIn, newCashOut, newCurrentCash, newExpectedClosing, drawer.drawer_id);
      
      db.prepare(`
        INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(
        crypto.randomUUID(), tenant_id, drawer.drawer_id, type,
        JSON.stringify({ transaction_id, amount, category, notes }),
        user_id, user_name || null
      );
    });
    
    tx();
    return { success: true };
  } catch (error: any) {
    console.error('[db:cashier:addTransaction]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:cashier:dayClosing', safeHandler((event, { tenant_id, actual_cash, closing_remarks, user_id, user_name, business_date }: {
  tenant_id: string; actual_cash: number; closing_remarks?: string; user_id: string; user_name?: string; business_date?: string
}) => {
  const db = getDb();
  try {
    const tx = db.transaction(() => {
      const date = business_date || new Date().toISOString().split('T')[0];
      const drawer = db.prepare(`SELECT * FROM cash_drawer WHERE tenant_id = ? AND business_date = ? AND status = 'OPEN'`).get(tenant_id, date) as any;
      if (!drawer) throw new Error(`No open cash drawer found for ${date}`);
      
      const expected = Number(drawer.expected_closing);
      const actual = Number(actual_cash);
      const variance = actual - expected;
      const cash_short = variance < 0 ? Math.abs(variance) : 0;
      const cash_excess = variance > 0 ? variance : 0;
      
      db.prepare(`
        UPDATE cash_drawer SET actual_cash = ?, cash_short = ?, cash_excess = ?, closing_remarks = ?, status = 'CLOSED', closed_by = ?, closed_at = CURRENT_TIMESTAMP, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE drawer_id = ?
      `).run(actual, cash_short, cash_excess, closing_remarks || null, user_id, drawer.drawer_id);
      
      db.prepare(`
        INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(
        crypto.randomUUID(), tenant_id, drawer.drawer_id, 'DAY_CLOSED',
        JSON.stringify({ expected_closing: expected, actual_cash: actual, cash_short, cash_excess, closing_remarks }),
        user_id, user_name || null
      );
    });
    
    tx();
    return { success: true };
  } catch (error: any) {
    console.error('[db:cashier:dayClosing]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:cashier:getTransactions', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const date = new Date().toISOString().split('T')[0];
    const drawer = db.prepare(`SELECT * FROM cash_drawer WHERE tenant_id = ? AND business_date = ?`).get(tenant_id, date) as any;
    if (!drawer) return [];
    
    return db.prepare(`SELECT * FROM cash_transactions WHERE tenant_id = ? AND drawer_id = ? ORDER BY transaction_date DESC`).all(tenant_id, drawer.drawer_id);
  } catch (error: any) {
    console.error('[db:cashier:getTransactions]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:getHistory', (event, { tenant_id, limit = 30, offset = 0 }: { tenant_id: string; limit?: number; offset?: number }) => {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT cd.*,
        u1.name as opened_by_name,
        u2.name as closed_by_name,
        (SELECT COUNT(*) FROM invoices i WHERE i.tenant_id = cd.tenant_id AND i.payment_method != 'PENDING' AND date(i.updated_at) = cd.business_date) as settled_count,
        (SELECT COALESCE(SUM(i.received_amount), 0) FROM invoices i WHERE i.tenant_id = cd.tenant_id AND i.payment_method != 'PENDING' AND date(i.updated_at) = cd.business_date) as total_collected
      FROM cash_drawer cd
      LEFT JOIN users u1 ON cd.opened_by = u1.user_id
      LEFT JOIN users u2 ON cd.closed_by = u2.user_id
      WHERE cd.tenant_id = ?
      ORDER BY cd.business_date DESC
      LIMIT ? OFFSET ?
    `).all(tenant_id, limit, offset);
  } catch (error: any) {
    console.error('[db:cashier:getHistory]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:getDaySettlements', (event, { tenant_id, business_date }: { tenant_id: string; business_date: string }) => {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT i.*, u.name as biller_name
      FROM invoices i
      LEFT JOIN users u ON i.user_id = u.user_id
      WHERE i.tenant_id = ? AND i.payment_method != 'PENDING' AND date(i.updated_at) = ?
      ORDER BY i.updated_at DESC
    `).all(tenant_id, business_date);
  } catch (error: any) {
    console.error('[db:cashier:getDaySettlements]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:getAuditLog', (event, { tenant_id, limit = 50, offset = 0 }: { tenant_id: string; limit?: number; offset?: number }) => {
  try {
    const db = getDb();
    return db.prepare(`SELECT * FROM cashier_audit_log WHERE tenant_id = ? ORDER BY performed_at DESC LIMIT ? OFFSET ?`).all(tenant_id, limit, offset);
  } catch (error: any) {
    console.error('[db:cashier:getAuditLog]', error);
    return { error: 'Operation failed' };
  }
});

// ── Cash Categories IPC Handlers ─────────────────────────────────────────────

ipcMain.handle('db:cashier:getCategories', (event, { tenant_id, type }: { tenant_id: string; type?: 'CASH_IN' | 'CASH_OUT' }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    let query = `SELECT * FROM cash_categories WHERE tenant_id = ?`;
    const params: any[] = [tenant_id];
    if (type) { query += ` AND type = ?`; params.push(type); }
    query += ` ORDER BY sort_order ASC, name ASC`;
    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:cashier:getCategories]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:addCategory', safeHandler((event, { tenant_id, name, type }: { tenant_id: string; name: string; type: 'CASH_IN' | 'CASH_OUT' }) => {
  try {
    const db = getDb();
    if (!tenant_id || !name || !type) return { success: false, error: 'Missing required fields' };
    if (!['CASH_IN', 'CASH_OUT'].includes(type)) return { success: false, error: 'Type must be CASH_IN or CASH_OUT' };
    const category_id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO cash_categories (category_id, tenant_id, name, type, sort_order, is_default, sync_status)
      VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM cash_categories WHERE tenant_id = ? AND type = ?), 0, 'PENDING')
    `).run(category_id, tenant_id, name.trim(), type, tenant_id, type);
    return { success: true, category: { category_id, tenant_id, name: name.trim(), type } };
  } catch (error: any) {
    console.error('[db:cashier:addCategory]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:cashier:deleteCategory', safeHandler((event, { category_id, tenant_id }: { category_id: string; tenant_id: string }) => {
  try {
    const db = getDb();
    const cat = db.prepare(`SELECT * FROM cash_categories WHERE category_id = ? AND tenant_id = ?`).get(category_id, tenant_id) as any;
    if (!cat) return { success: false, error: 'Category not found' };
    if (cat.is_default === 1) return { success: false, error: 'Cannot delete default category' };
    db.prepare(`DELETE FROM cash_categories WHERE category_id = ? AND tenant_id = ?`).run(category_id, tenant_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:cashier:deleteCategory]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

// ── Customer / Loyalty Points IPC Handlers ──

ipcMain.handle('db:getCustomers', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    return db.prepare(`SELECT * FROM customers WHERE tenant_id = ? ORDER BY name COLLATE NOCASE ASC`).all(tenant_id);
  } catch (error: any) {
    console.error('[db:getCustomers]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:findCustomers', (event, { tenant_id, name, phone }: { tenant_id: string; name?: string; phone?: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    let query = `SELECT * FROM customers WHERE tenant_id = ?`;
    const params: any[] = [tenant_id];
    if (name) {
      query += ` AND name LIKE ?`;
      params.push(`%${name}%`);
    }
    if (phone) {
      query += ` AND phone LIKE ?`;
      params.push(`%${phone}%`);
    }
    query += ` ORDER BY name COLLATE NOCASE ASC LIMIT 20`;
    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:findCustomers]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getCustomerInvoices', (event, { customer_id, tenant_id }: { customer_id: string; tenant_id: string }) => {
  try {
    const db = getDb();
    if (!customer_id || !tenant_id) return [];
    return db.prepare(`
      SELECT invoice_id, invoice_number, invoice_type, grand_total, points_earned, points_redeemed,
             points_redeemed_discount, previous_points_balance, remaining_points_balance,
             created_at
      FROM invoices
      WHERE customer_id = ? AND tenant_id = ?
      ORDER BY created_at DESC
    `).all(customer_id, tenant_id);
  } catch (error: any) {
    console.error('[db:getCustomerInvoices]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:deleteInvoice', (event, invoice_id: string) => {
  try {
    const db = getDb();
    db.transaction(() => {
      const items = db.prepare('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = ?').all(invoice_id) as any[];
      const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?');
      for (const item of items) {
        stockStmt.run(item.quantity, item.product_id);
      }
      db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(invoice_id);
      db.prepare('DELETE FROM invoices WHERE invoice_id = ?').run(invoice_id);
    })();
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteInvoice]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getCustomerLoyaltyTransactions', (event, { customer_id, tenant_id }: { customer_id: string; tenant_id: string }) => {
  try {
    const db = getDb();
    if (!customer_id || !tenant_id) return [];
    return db.prepare(`
      SELECT lt.*, i.invoice_number
      FROM loyalty_transactions lt
      LEFT JOIN invoices i ON lt.invoice_id = i.invoice_id
      WHERE lt.customer_id = ? AND lt.tenant_id = ?
      ORDER BY lt.created_at DESC
    `).all(customer_id, tenant_id);
  } catch (error: any) {
    console.error('[db:getCustomerLoyaltyTransactions]', error);
    return { error: 'Operation failed' };
  }
});
