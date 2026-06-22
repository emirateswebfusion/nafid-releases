import { app, BrowserWindow, ipcMain, session } from 'electron';
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

// Ensure GH_TOKEN is set for electron-updater (fallback if dotenv didn't pick it up)
if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/^GH_TOKEN=(.+)$/m);
  if (match) {
    process.env.GH_TOKEN = match[1].trim();
    console.log('[Main] GH_TOKEN loaded manually from env file');
  }
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
  ];

  if (isDev) {
    directives.push("script-src 'self' 'unsafe-inline'");
    directives.push("connect-src 'self' ws://localhost:* http://localhost:*");
  } else {
    directives.push("script-src 'self'");
    const allowedConnect = ["'self'"];
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
  setupCSP();
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
      mainWindow.webContents.send('update-status', 'ready-to-install');
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err);
  });

  // Check for updates every 1 hour
  // setInterval(() => {
  //   autoUpdater.checkForUpdatesAndNotify();
  // }, 60 * 60 * 1000);

  // Initial check (Temporarily disabled as repo is private)
  // autoUpdater.checkForUpdatesAndNotify().catch(err => {
  //   console.error('[Updater] Initial check error:', err.message);
  // });
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
    return { success: false, error: msg };
  }
});

ipcMain.handle('db:getProducts', (event, arg: any) => {
  try {
    const db = getDb();
    const tenantId = typeof arg === 'string' ? arg : arg?.tenant_id;
    if (!tenantId) return [];

    if (typeof arg === 'string' || (!arg.limit && !arg.search && !arg.barcode && !arg.sortBy && !arg.filterDate)) {
      return db.prepare('SELECT p.*, pg.rate as grade_rate FROM products p LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id WHERE p.tenant_id = ? AND p.is_deleted = 0 ORDER BY p.name COLLATE NOCASE ASC, p.product_id ASC').all(tenantId);
    }

    const { limit, offset, search, sortBy, barcode, filterDate } = arg;
    let query = 'SELECT p.*, pg.rate as grade_rate FROM products p LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id WHERE p.tenant_id = ? AND p.is_deleted = 0';
    const params: any[] = [tenantId];

    if (barcode) {
       query += ' AND (p.sku_barcode = ? OR p.item_code = ?)';
       params.push(barcode, barcode);
    } else if (search) {
       // Numeric search: only match barcode/item_code with prefix (so "87" → 8749,8750 NOT 987,687, nor names containing "87")
       if (/^\d+$/.test(search)) {
         query += ' AND (p.sku_barcode LIKE ? OR p.item_code LIKE ?)';
         params.push(`${search}%`, `${search}%`);
       } else {
         // Text search: name/brand substring, barcode/item_code prefix
         query += ' AND (p.name LIKE ? OR p.sku_barcode LIKE ? OR p.item_code LIKE ? OR p.brand_manufacturer LIKE ?)';
         params.push(`%${search}%`, `${search}%`, `${search}%`, `%${search}%`);
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
       // Mirror logic from db:getProducts — numeric: barcode/code only; text: all fields
       if (/^\d+$/.test(arg.search)) {
         query += ' AND (sku_barcode LIKE ? OR item_code LIKE ?)';
         params.push(`${arg.search}%`, `${arg.search}%`);
       } else {
         query += ' AND (name LIKE ? OR sku_barcode LIKE ? OR item_code LIKE ? OR brand_manufacturer LIKE ?)';
         params.push(`%${arg.search}%`, `${arg.search}%`, `${arg.search}%`, `%${arg.search}%`);
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

ipcMain.handle('db:addProduct', (event, p) => {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO products (
        product_id, tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
        purchase_price, base_price, is_gst_applicable, tax_rate_percent,
        uom, brand_manufacturer, current_stock, reorder_level, domain_attributes,
        discount_percent, discount_flat, offer_price,
        is_deleted, billing_type, grade_id, pricing_mode, average_weight_per_piece, weight_override_allowed,
        sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
      p.is_deleted ?? 0,
      p.billing_type || 'PIECE',
      p.grade_id || null,
      p.pricing_mode || 'FIXED_PRICE',
      p.average_weight_per_piece ?? null,
      p.weight_override_allowed ?? 0
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
          is_deleted = ?, billing_type = ?, grade_id = ?, pricing_mode = ?, 
          average_weight_per_piece = ?, weight_override_allowed = ?,
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
      p.domain_attributes ? JSON.stringify(p.domain_attributes) : '{}',
      p.discount_percent ?? null,
      p.discount_flat ?? null,
      p.offer_price ?? null,
      p.is_deleted ?? 0,
      p.billing_type || 'PIECE',
      p.grade_id || null,
      p.pricing_mode || 'FIXED_PRICE',
      p.average_weight_per_piece ?? null,
      p.weight_override_allowed ?? 0,
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

ipcMain.handle('db:bulkImportProducts', (event, products: any[]) => {
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
          p.domain_attributes ? JSON.stringify(p.domain_attributes) : '{}',
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
    return { success: false, error: error.message };
  }
});

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
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:resetPrintStatus', (event, tenant_id: string) => {
  try {
    const db = getDb();
    if (!tenant_id) return { success: false, error: 'Tenant ID required' };
    db.prepare("UPDATE products SET print_status = 'PRINTED', sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND print_status = 'PENDING' AND is_deleted = 0").run(tenant_id);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
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
    if (limit) query += ` LIMIT ${limit}`;
    
    return db.prepare(query).all(...params);
  } catch (error: any) {
    return { error: error.message };
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

ipcMain.handle('db:getGrades', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare('SELECT * FROM product_grades WHERE tenant_id = ? AND is_deleted = 0 ORDER BY category, grade_name').all(tenantId);
  } catch (error: any) {
    return { error: error.message };
  }
});

ipcMain.handle('db:addGrade', (event, g) => {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO product_grades (grade_id, tenant_id, category, grade_name, rate, is_deleted, sync_status) 
      VALUES (?, ?, ?, ?, ?, 0, 'PENDING')
    `).run(g.grade_id, g.tenant_id, g.category, g.grade_name, g.rate);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:updateGrade', (event, g) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE product_grades 
      SET category = ?, grade_name = ?, rate = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
      WHERE grade_id = ?
    `).run(g.category, g.grade_name, g.rate, g.grade_id);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:deleteGrade', (event, gradeId: string) => {
  try {
    const db = getDb();
    db.prepare(`UPDATE product_grades SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE grade_id = ?`).run(gradeId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// ── Party (Credit Person) Handlers ──────────────────────────────────────────
ipcMain.handle('db:getParties', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare('SELECT * FROM parties WHERE tenant_id = ? AND is_deleted = 0 ORDER BY name COLLATE NOCASE ASC').all(tenantId);
  } catch (error: any) {
    return { error: error.message };
  }
});

ipcMain.handle('db:addParty', (event, p) => {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO parties (party_id, tenant_id, name, phone, balance, notes, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(p.party_id, p.tenant_id, p.name, p.phone || null, p.balance ?? 0, p.notes || null);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:updateParty', (event, p) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE parties SET name = ?, phone = ?, notes = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE party_id = ?
    `).run(p.name, p.phone || null, p.notes || null, p.party_id);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:deleteParty', (event, partyId: string) => {
  try {
    const db = getDb();
    db.prepare("UPDATE parties SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?").run(partyId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:adjustPartyBalance', (event, { party_id, amount }: { party_id: string; amount: number }) => {
  try {
    const db = getDb();
    db.prepare("UPDATE parties SET balance = balance + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?").run(amount, party_id);
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
        subtotal, tax_total, discount_total, discount_type, discount_value, grand_total, 
        payment_method, received_amount, balance_amount, customer_name, customer_phone, customer_gstin, customer_state, sync_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
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
      invoice.payment_method || 'CASH',
      invoice.received_amount ?? 0,
      invoice.balance_amount ?? 0,
      invoice.customer_name || null,
      invoice.customer_phone || null,
      invoice.customer_gstin || null,
      invoice.customer_state || null
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

    // Trigger immediate background sync so the invoice appears on web portal instantly
    import('./sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Immediate sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

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
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:getInvoices', (event, filters?: { user_id?: string; tenant_id?: string; role?: string; limit?: number; offset?: number; search?: string; payment_method?: string; filterDate?: string; filterDateEnd?: string }) => {
  try {
    const db = getDb();
    const { user_id, tenant_id, role, limit, offset, search, payment_method, filterDate, filterDateEnd } = filters || {};

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

    if (payment_method) {
      query += ' AND i.payment_method = ?';
      params.push(payment_method);
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
  items: Array<{
    item_id?: string;
    product_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    tax_amount: number;
    total: number;
  }>;
}) => {
  // Only OWNER can update invoices
  if (payload.role !== 'OWNER') {
    return { success: false, error: 'Only owners can edit past bills' };
  }
  const { v4: uuidv4 } = await import('uuid');
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
        customer_name = ?, customer_phone = ?, customer_gstin = ?, customer_state = ?,
        sync_status = 'PENDING'
      WHERE invoice_id = ?
    `).run(
      invoice.subtotal, invoice.tax_total, invoice.discount_total,
      invoice.discount_type || 'FIXED', invoice.discount_value || 0,
      invoice.grand_total, invoice.payment_method || 'CASH',
      invoice.customer_name || null, invoice.customer_phone || null,
      invoice.customer_gstin || null, invoice.customer_state || null,
      payload.invoice_id
    );

    // 3. Delete old items
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(payload.invoice_id);

    // 4. Insert new items
    const itemStmt = db.prepare(`
      INSERT INTO invoice_items (item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      itemStmt.run(
        item.item_id || uuidv4(),
        payload.invoice_id,
        payload.tenant_id,
        item.product_id,
        item.name,
        item.quantity,
        item.unit_price,
        item.tax_amount,
        item.total
      );
    }

    // 5. Adjust stock: reverse old quantities, apply new
    const stockDelta: Record<string, number> = {};
    for (const old of oldItems) {
      stockDelta[old.product_id] = (stockDelta[old.product_id] || 0) + old.quantity;
    }
    for (const item of items) {
      stockDelta[item.product_id] = (stockDelta[item.product_id] || 0) - item.quantity;
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
    return { success: false, error: error.message };
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
      INSERT INTO settings (tenant_id, key, value, sync_status, updated_at) 
      VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP) 
      ON CONFLICT(tenant_id, key) DO UPDATE SET 
        value = EXCLUDED.value, 
        sync_status = 'PENDING',
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

ipcMain.handle('db:getNextInvoiceNumber', (event, { tenant_id, prefix }: { tenant_id: string; prefix?: string }) => {
  try {
    const db = getDb();
    const effectivePrefix = prefix || 'INV-';
    const configKey = 'invoice_counter_config';

    // Use a transaction for atomic get-and-increment
    const result = db.transaction(() => {
      const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', configKey);
      let counter = 1;
      let config: { prefix: string; counter: number } = { prefix: effectivePrefix, counter: 1 };

      if (row) {
        try {
          config = JSON.parse(row.value);
          counter = (typeof config.counter === 'number' ? config.counter : 1);
        } catch {
          counter = 1;
        }
      }

      const invoiceNumber = `${config.prefix || effectivePrefix}${counter}`;
      
      // Increment and save
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
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:peekNextInvoiceNumber', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'invoice_counter_config');
    if (row) {
      const config = JSON.parse(row.value);
      return { success: true, invoiceNumber: `${config.prefix || 'INV-'}${config.counter || 1}` };
    }
    return { success: true, invoiceNumber: 'INV-1' };
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

// ── Scrap Categories IPC ───────────────────────────────────────
ipcMain.handle('db:getScrapCategories', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare('SELECT * FROM scrap_categories WHERE tenant_id = ? AND is_deleted = 0 ORDER BY name COLLATE NOCASE ASC').all(tenantId);
  } catch (error: any) {
    return { error: error.message };
  }
});

ipcMain.handle('db:addScrapCategory', (event, cat) => {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO scrap_categories (scrap_category_id, tenant_id, name, is_deleted, sync_status)
      VALUES (?, ?, ?, 0, 'PENDING')
    `).run(cat.scrap_category_id, cat.tenant_id, cat.name);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:updateScrapCategory', (event, cat) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE scrap_categories SET name = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE scrap_category_id = ?
    `).run(cat.name, cat.scrap_category_id);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:deleteScrapCategory', (event, scrapCategoryId: string) => {
  try {
    const db = getDb();
    db.prepare(`UPDATE scrap_categories SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`).run(scrapCategoryId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// ── Scrap Items IPC ────────────────────────────────────────────
ipcMain.handle('db:getScrapItems', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare(`
      SELECT si.*, sc.name as category_name 
      FROM scrap_items si 
      LEFT JOIN scrap_categories sc ON si.scrap_category_id = sc.scrap_category_id 
      WHERE si.tenant_id = ? AND si.is_deleted = 0 
      ORDER BY si.name COLLATE NOCASE ASC
    `).all(tenantId);
  } catch (error: any) {
    return { error: error.message };
  }
});

ipcMain.handle('db:addScrapItem', (event, item) => {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO scrap_items (scrap_item_id, tenant_id, name, scrap_category_id, purchase_price, selling_price, current_stock, unit, is_deleted, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING')
    `).run(item.scrap_item_id, item.tenant_id, item.name, item.scrap_category_id || null, item.purchase_price || 0, item.selling_price || 0, item.current_stock || 0, item.unit || 'Kgs');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:updateScrapItem', (event, item) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE scrap_items SET name = ?, scrap_category_id = ?, purchase_price = ?, selling_price = ?, current_stock = ?, unit = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE scrap_item_id = ?
    `).run(item.name, item.scrap_category_id || null, item.purchase_price || 0, item.selling_price || 0, item.current_stock || 0, item.unit || 'Kgs', item.scrap_item_id);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:deleteScrapItem', (event, scrapItemId: string) => {
  try {
    const db = getDb();
    db.prepare(`UPDATE scrap_items SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_item_id = ?`).run(scrapItemId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:adjustScrapStock', (event, { scrap_item_id, delta }) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE scrap_items SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_item_id = ?
    `).run(delta, scrap_item_id);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// ── Scrap Transactions IPC ─────────────────────────────────────
ipcMain.handle('db:addScrapTransaction', (event, t) => {
  try {
    const db = getDb();
    const delta = t.type === 'PURCHASE' ? t.quantity : -t.quantity;
    const result = db.transaction(() => {
      db.prepare(`
        INSERT INTO scrap_transactions (transaction_id, tenant_id, type, scrap_item_id, quantity, rate, total_amount, party_name, notes, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(t.transaction_id, t.tenant_id, t.type, t.scrap_item_id, t.quantity, t.rate, t.total_amount, t.party_name || null, t.notes || null);
      db.prepare(`UPDATE scrap_items SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_item_id = ?`).run(delta, t.scrap_item_id);
      return { success: true };
    })();
    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:getScrapTransactions', (event, { tenant_id, scrap_item_id }: { tenant_id: string; scrap_item_id?: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    let query = `
      SELECT st.*, si.name as scrap_item_name, si.unit 
      FROM scrap_transactions st 
      LEFT JOIN scrap_items si ON st.scrap_item_id = si.scrap_item_id 
      WHERE st.tenant_id = ?
    `;
    const params: any[] = [tenant_id];
    if (scrap_item_id) {
      query += ' AND st.scrap_item_id = ?';
      params.push(scrap_item_id);
    }
    query += ' ORDER BY st.created_at DESC LIMIT 500';
    return db.prepare(query).all(...params);
  } catch (error: any) {
    return { error: error.message };
  }
});

// ── Stock Report IPC ───────────────────────────────────────────
ipcMain.handle('db:getStockReport', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare(`
      SELECT p.*, pg.rate as grade_rate, pg.grade_name, pg.category as grade_category
      FROM products p 
      LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id 
      WHERE p.tenant_id = ? AND p.is_deleted = 0 
      ORDER BY p.category ASC, p.name COLLATE NOCASE ASC
    `).all(tenantId);
  } catch (error: any) {
    return { error: error.message };
  }
});

// ── Quotations IPC ─────────────────────────────────────────────
ipcMain.handle('db:getNextQuotationNumber', (event, { tenant_id, prefix: _prefix }: { tenant_id: string; prefix?: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return { success: false, error: 'Tenant ID required' };
    
    const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(tenant_id || 'global', 'quotation_counter');
    let counter = 1;
    let config: { prefix: string; counter: number } = { prefix: 'QTN-', counter: 1 };
    if (row) {
      try {
        config = JSON.parse(row.value);
        counter = config.counter;
      } catch { counter = 1; }
    }

    const quotationNumber = `${config.prefix}${counter}`;
    config.counter = counter + 1;
    db.prepare(`
      INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
      VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, key) DO UPDATE SET
        value = EXCLUDED.value, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
    `).run(tenant_id || 'global', 'quotation_counter', JSON.stringify(config));

    return { success: true, quotationNumber };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:saveQuotation', (event, q) => {
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
    return { success: false, error: error.message };
  }
});

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
    return { error: error.message };
  }
});

ipcMain.handle('db:getQuotationItems', (event, quotationId: string) => {
  try {
    const db = getDb();
    return db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY created_at ASC').all(quotationId);
  } catch (error: any) {
    return { error: error.message };
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
    return { success: false, error: error.message };
  }
});

// ── Warranties IPC ─────────────────────────────────────────────
ipcMain.handle('db:saveWarranty', (event, w) => {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO warranties (warranty_id, tenant_id, invoice_id, invoice_item_id, customer_name, customer_phone, product_name, product_details, purchase_date, warranty_period_days, expiry_date, notes, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(w.warranty_id, w.tenant_id, w.invoice_id || null, w.invoice_item_id || null, w.customer_name, w.customer_phone || null, w.product_name, w.product_details || null, w.purchase_date, w.warranty_period_days, w.expiry_date, w.notes || null);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

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
    return { error: error.message };
  }
});

ipcMain.handle('db:deleteWarranty', (event, warrantyId: string) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM warranties WHERE warranty_id = ?').run(warrantyId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

