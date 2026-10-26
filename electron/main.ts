import { app, BrowserWindow, session, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import log from 'electron-log/main';

import { initDb, getDb } from './db/localDb.js';
import { autoDeduplicateCustomersAndParties } from './db/customerDedupe.js';
import { initPrinter } from './hardware/printer.js';
import { initWeighingScale } from './hardware/weighingScale.js';
import { initBarcodeScanner } from './hardware/barcodeScanner.js';
import { initSyncWorker } from './sync/syncWorker.js';

import { setMainWindow } from './services/windowRegistry.js';
import { registerAllIpcHandlers } from './ipc/index.js';
import { backfillCreditInvoices, recalcPartyBalances } from './services/partyLedgerService.js';
import { setupAutoUpdater } from './services/updaterService.js';
import * as mainSql from './db/statements/main.js';

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
// Packaged: resources/app.env holds only public settings (scripts/runtime-env.cjs). Dev: the repo's .env.
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, 'app.env')
  : path.join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config(); // Fallback to root .env
}


let mainWindow: BrowserWindow | null = null;
const PROTOCOL = 'nafid';

app.name = 'Nafid';
try {
  const canonicalUserData = path.join(app.getPath('appData'), 'Nafid');
  app.setPath('userData', canonicalUserData);
} catch (e) {
  console.warn('[Main] Failed to override userData path:', e);
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.nafid');
}

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
  app.on('second-instance', (_event, commandLine) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      const url = commandLine.pop();
      if (url && url.startsWith(`${PROTOCOL}://`)) {
        handleDeepLink(url);
      }
    }
  });
}

function handleDeepLink(url: string) {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  try {
    const urlObj = new URL(url);
    const token = urlObj.searchParams.get('token');
    if (token && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
      win.webContents.send('auth:deep-link', token);
    }
  } catch (err) {
    log.error('[DeepLink] Failed to parse URL:', url, err);
  }
}

function setupCSP() {
  const isDev = !app.isPackaged;
  const apiUrl = process.env.NAFID_CLOUD_API || process.env.VENDORA_CLOUD_API;
  const apiOrigin = (() => {
    try {
      return apiUrl ? new URL(apiUrl).origin : '';
    } catch {
      return '';
    }
  })();

  const directives = [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com https:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  const allowedConnect = ["'self'"];
  const envOrigins = (process.env.ALLOWED_CONNECT_ORIGINS || process.env.VITE_CLOUD_API || process.env.VENDORA_CLOUD_API || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  for (const o of envOrigins) {
    if (!allowedConnect.includes(o)) allowedConnect.push(o);
  }
  if (apiOrigin && !allowedConnect.includes(apiOrigin)) {
    allowedConnect.push(apiOrigin);
  }

  if (isDev) {
    directives.push("script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:");
    const devUrl = process.env.ELECTRON_DEV_SERVER_URL;
    if (devUrl) {
      try {
        const devOrigin = new URL(devUrl).origin;
        if (!allowedConnect.includes(devOrigin)) allowedConnect.push(devOrigin);
        const wsOrigin = devOrigin.replace(/^http/, 'ws');
        if (!allowedConnect.includes(wsOrigin)) allowedConnect.push(wsOrigin);
      } catch { /* ignore */ }
    }
    if (!allowedConnect.includes('ws:')) allowedConnect.push('ws:');
    if (!allowedConnect.includes('wss:')) allowedConnect.push('wss:');
  } else {
    directives.push("script-src 'self'");
  }

  directives.push(`connect-src ${allowedConnect.join(' ')}`);

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

function getAppIconPath(): string | undefined {
  const isWin = process.platform === 'win32';
  const candidates = [
    isWin ? path.join(__dirname, '../public/icon.ico') : path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../public/logo.png'),
    isWin ? path.join(__dirname, '../dist/icon.ico') : path.join(__dirname, '../dist/icon.png'),
    path.join(__dirname, '../dist/icon.png'),
    path.join(__dirname, '../dist/logo.png'),
    isWin ? path.join(__dirname, '../build/icon.ico') : path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../build/icon.png'),
    path.join(process.resourcesPath, isWin ? 'icon.ico' : 'icon.png'),
    path.join(process.resourcesPath, 'icon.png'),
    path.join(process.resourcesPath, 'app.asar.unpacked/build/icon.ico'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function createWindow(): BrowserWindow {
  const iconPath = getAppIconPath();
  log.info(`[Main] Using window icon path: ${iconPath || 'None'}`);

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    icon: iconPath,
    show: false,
  });

  if (iconPath) {
    try {
      const img = nativeImage.createFromPath(iconPath);
      if (!img.isEmpty()) {
        win.setIcon(img);
      }
    } catch (err) {
      log.error('[Main] Error setting native icon:', err);
    }
  }

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    log.error(`[Main] Renderer failed to load: ${errorCode} - ${errorDescription} - ${validatedURL} - isMainFrame: ${isMainFrame}`);
    if (isMainFrame && app.isPackaged) {
      if (!win.webContents.isLoading()) {
        log.warn('[Main] Attempting to reload renderer...');
        win.loadFile(path.join(__dirname, '../dist/index.html')).catch((e) => {
          log.error('[Main] Reload failed:', e);
        });
      }
    }
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    log.error('[Main] Render process gone:', details);
  });

  win.webContents.on('unresponsive', () => {
    log.warn('[Main] Renderer became unresponsive');
  });

  win.webContents.on('responsive', () => {
    log.info('[Main] Renderer became responsive again');
  });

  if (!app.isPackaged) {
    const devUrl = process.env.ELECTRON_DEV_SERVER_URL;
    if (!devUrl) {
      throw new Error('[Electron] ELECTRON_DEV_SERVER_URL environment variable is required in development mode.');
    }
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => {
    if (win && !win.isDestroyed()) {
      log.info('[Main] Window ready-to-show, showing and focusing');
      win.show();
      win.focus();
    }
  });

  const showTimeout = setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) {
      log.warn('[Main] ready-to-show timeout, forcing window show');
      win.show();
      win.focus();
    }
  }, 10000);

  win.once('show', () => {
    clearTimeout(showTimeout);
  });

  win.on('focus', async () => {
    try {
      const { resetFastPollBackoff } = await import('./sync/syncWorker.js');
      resetFastPollBackoff();
    } catch { /* ignore */ }
  });

  win.on('closed', () => {
    log.info('[Main] Main window closed');
  });

  return win;
}

app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'vendora_v2.db');
  log.info(`[Main] App Data Path: ${app.getPath('userData')}`);
  log.info(`[Main] Database Path: ${dbPath}`);
  log.info(`[Main] App version: ${app.getVersion()}`);
  log.info(`[Main] Packaged: ${app.isPackaged}`);
  log.info(`[Main] Platform: ${process.platform}`);
  log.info(`[Main] Executable: ${process.execPath}`);

  initDb();
  log.info('[Main] Database initialized');

  try {
    const dedupResult = autoDeduplicateCustomersAndParties();
    log.info(`[Main] Auto-deduplication completed: ${dedupResult.merged_customers} customers, ${dedupResult.merged_parties} parties merged`);
  } catch (e) {
    log.warn('[Main] Auto-deduplication failed (non-fatal):', (e as Error).message);
  }

  setupCSP();
  mainWindow = createWindow();
  setMainWindow(mainWindow);

  // Register all modular IPC handlers
  registerAllIpcHandlers();

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
    initPrinter();
    initSyncWorker();
  }

  setImmediate(() => {
    try {
      log.info('[Main] Running background database maintenance...');
      backfillCreditInvoices(getDb());
      log.info('[Main] Credit invoices backfill complete');
    } catch (e) {
      log.error('[Main] Backfill credit invoices error:', e);
    }

    try {
      const _db = getDb();
      mainSql.updateInvoices(_db).run();
      mainSql.updateInvoices2(_db).run();
      mainSql.updateInvoices3(_db).run();
      mainSql.updateInvoices4(_db).run();
      mainSql.updateInvoices5(_db).run();
      mainSql.updateInvoices6(_db).run();
      mainSql.updateInvoices7(_db).run();
      
      const staleBills = mainSql.selectInvoices(_db).all() as Record<string, unknown>[];
      if (staleBills.length > 0) {
        const expireTx = _db.transaction(() => {
          const stockStmt = mainSql.updateProducts(_db);
          const markStmt = mainSql.updateInvoices8(_db);
          for (const bill of staleBills) {
            const items = mainSql.selectInvoiceItems(_db).all(bill.invoice_id) as Record<string, unknown>[];
            for (const item of items) {
              if (!item.is_service_item) stockStmt.run(item.quantity, item.product_id);
            }
            markStmt.run(bill.invoice_id);
          }
        });
        expireTx();
        log.info(`[Main] Auto-expired ${staleBills.length} stale held bill(s) on startup`);
      }
    } catch (e) {
      log.warn('[Main] Failed to expire stale holds on startup:', (e as Error).message);
    }
  });

  setTimeout(() => {
    try {
      const _db = getDb();
      const parties = mainSql.selectParties(_db).all() as { party_id: string }[];
      if (parties.length > 0) {
        log.info(`[Main] Post-startup party balance recalculation: ${parties.length} parties...`);
        for (const p of parties) {
          try { recalcPartyBalances(_db, p.party_id); } catch { /* ignore */ }
        }
        log.info('[Main] Party balance recalculation complete.');
      }
    } catch (e) {
      log.warn('[Main] Party balance recalc error:', (e as Error).message);
    }
  }, 30000);

  setupAutoUpdater();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
