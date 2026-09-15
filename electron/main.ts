import { app, BrowserWindow, ipcMain, session, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import os from 'node:os';
import { execSync } from 'node:child_process';
import dns from 'node:dns';
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

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('app:getLocalIp', () => {
  try {
    const interfaces = os.networkInterfaces();
    const virtualPatterns = [/vEthernet/i, /wsl/i, /hyper-v/i, /virtualbox/i, /vmware/i, /bluetooth/i, /zerotier/i, /tailscale/i, /docker/i, /loopback/i, /npcap/i, /vbox/i];
    const physicalPatterns = [/wi-fi/i, /wifi/i, /wireless/i, /wlan/i, /ethernet/i, /eth/i, /lan/i, /local area connection/i];

    const candidates: { address: string; score: number }[] = [];

    for (const name of Object.keys(interfaces)) {
      const isVirtual = virtualPatterns.some(pat => pat.test(name));
      const isPhysical = physicalPatterns.some(pat => pat.test(name));

      for (const iface of interfaces[name] || []) {
        if ((iface.family === 'IPv4' || (iface as any).family === 4) && !iface.internal) {
          const ip = iface.address;
          if (ip.startsWith('127.') || ip.startsWith('169.254.')) continue;

          let score = 50;
          if (isVirtual) {
            score = 10;
          } else {
            if (isPhysical) score += 30;
            if (ip.startsWith('192.168.')) score += 20;
            else if (ip.startsWith('10.')) score += 15;
            else if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) score += 10;
          }
          candidates.push({ address: ip, score });
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0].address;
    }
  } catch (e) {
    console.error('[app:getLocalIp] Failed to detect IP address', e);
  }
  return '192.168.1.100';
});

ipcMain.handle('app:getNetworkDetails', () => {
  try {
    const interfaces = os.networkInterfaces();
    const virtualPatterns = [/vEthernet/i, /wsl/i, /hyper-v/i, /virtualbox/i, /vmware/i, /bluetooth/i, /zerotier/i, /tailscale/i, /docker/i, /loopback/i, /npcap/i, /vbox/i];
    const physicalPatterns = [/wi-fi/i, /wifi/i, /wireless/i, /wlan/i, /ethernet/i, /eth/i, /lan/i, /local area connection/i];

    const candidates: { address: string; netmask: string; cidr?: string; score: number }[] = [];

    for (const name of Object.keys(interfaces)) {
      const isVirtual = virtualPatterns.some(pat => pat.test(name));
      const isPhysical = physicalPatterns.some(pat => pat.test(name));

      for (const iface of interfaces[name] || []) {
        if ((iface.family === 'IPv4' || (iface as any).family === 4) && !iface.internal) {
          const ip = iface.address;
          if (ip.startsWith('127.') || ip.startsWith('169.254.')) continue;

          let score = 50;
          if (isVirtual) {
            score = 10;
          } else {
            if (isPhysical) score += 30;
            if (ip.startsWith('192.168.')) score += 20;
            else if (ip.startsWith('10.')) score += 15;
            else if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) score += 10;
          }
          candidates.push({ address: ip, netmask: iface.netmask, cidr: iface.cidr || undefined, score });
        }
      }
    }

    let ip = '192.168.1.100';
    let netmask = '255.255.255.0';
    let subnetPrefix = '24';

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      ip = best.address;
      netmask = best.netmask || '255.255.255.0';
      if (best.cidr && best.cidr.includes('/')) {
        subnetPrefix = best.cidr.split('/')[1];
      } else if (netmask) {
        try {
          subnetPrefix = netmask.split('.').reduce((c, octet) => c + (parseInt(octet, 10).toString(2).match(/1/g) || []).length, 0).toString();
        } catch {
          subnetPrefix = '24';
        }
      }
    }

    let gateway = ip.replace(/\.\d+$/, '.1');
    try {
      if (process.platform === 'win32') {
        const gwOut = execSync('powershell -NoProfile -Command "(Get-NetRoute -DestinationPrefix \'0.0.0.0/0\' | Select-Object -First 1).NextHop"', { timeout: 2000, encoding: 'utf-8' }).trim();
        if (gwOut && /^(\d{1,3}\.){3}\d{1,3}$/.test(gwOut)) {
          gateway = gwOut;
        }
      }
    } catch (_) {}

    let dnsAddress = '8.8.8.8';
    try {
      const servers = dns.getServers();
      const validDns = servers.find(s => s && s !== '127.0.0.1' && s !== '::1' && !s.startsWith('127.'));
      if (validDns) {
        dnsAddress = validDns;
      }
    } catch (_) {}

    return {
      ip,
      subnetPrefix,
      netmask,
      gateway,
      dns: dnsAddress
    };
  } catch (e) {
    console.error('[app:getNetworkDetails] Failed to detect network details', e);
    return {
      ip: '192.168.1.100',
      subnetPrefix: '24',
      netmask: '255.255.255.0',
      gateway: '192.168.1.1',
      dns: '8.8.8.8'
    };
  }
});

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
// ── Local Time Helpers ────────────────────────────────────────────────────
/** Returns local timestamp: YYYY-MM-DD HH:mm:ss */
function localTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
/** Returns local date: YYYY-MM-DD */
function localDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function getStoreTimezoneSetting(db: any, tenantId?: string): string {
  try {
    if (!db || !tenantId) return 'Asia/Kolkata';
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'store_timezone' AND (tenant_id = ? OR tenant_id = 'global') LIMIT 1`).get(tenantId) as any;
    if (row?.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (typeof parsed === 'string' && parsed) return parsed;
      if (parsed?.timezone) return parsed.timezone;
    }
  } catch {}
  return 'Asia/Kolkata';
}

function parseCleanDate(dStr: any, timeZone: string = 'Asia/Kolkata'): string {
  if (!dStr) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
    } catch {
      return localDate();
    }
  }
  const str = String(dStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const ddmmyyyy = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
    } catch {
      return localDate(d);
    }
  }
  return str.slice(0, 10);
}

import { initDb, getDb, upsertCustomerRecord } from './db/localDb.js';
import { initPrinter } from './hardware/printer.js';
import { initWeighingScale } from './hardware/weighingScale.js';
import { initBarcodeScanner } from './hardware/barcodeScanner.js';
import { initSyncWorker, setSyncActive, triggerUrgentInvoiceSync, triggerUrgentCashSync, triggerUrgentQuotationSync } from './sync/syncWorker.js';

// In CommonJS (which tsc is outputting), __dirname and __filename are already available.
// We don't need the fileURLToPath logic.

let mainWindow: BrowserWindow | null = null;
const PROTOCOL = 'nafid';

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
  const apiUrl = process.env.NAFID_CLOUD_API || process.env.VENDORA_CLOUD_API || 'http://localhost:3001';
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
  const winIcoPath = path.join(__dirname, '../build/icon.ico');
  const iconPath = process.platform === 'win32' && fs.existsSync(winIcoPath)
    ? winIcoPath
    : (app.isPackaged
        ? path.join(__dirname, '../dist/logo.png')
        : path.join(__dirname, '../build/icon.png'));

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
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
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
  try {
    backfillCreditInvoices(getDb());
  } catch (e) {
    console.error('[Main] Backfill credit invoices error:', e);
  }
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
    
    // Auto-expire any stale held bills on startup
    try {
      const _db = getDb();
      // Clean up any HOLD invoices that might have been left with sync_status='PENDING'
      _db.prepare("UPDATE invoices SET sync_status = 'SYNCED' WHERE invoice_type = 'HOLD' AND sync_status = 'PENDING'").run();
      _db.prepare("UPDATE invoices SET sync_status = 'SYNCED' WHERE invoice_type = 'EXPIRED_HOLD' AND sync_status = 'PENDING'").run();
      
      // Self-heal: fix any PENDING invoices with negative balance_amount (clamp to 0)
      _db.prepare("UPDATE invoices SET balance_amount = 0 WHERE sync_status = 'PENDING' AND (balance_amount < 0 OR balance_amount IS NULL)").run();
      // Self-heal: fix any PENDING invoices with missing/null grand_total
      _db.prepare("UPDATE invoices SET grand_total = 0 WHERE sync_status = 'PENDING' AND (grand_total IS NULL OR grand_total < 0)").run();
      // Self-heal: fix any PENDING invoices with missing/null subtotal
      _db.prepare("UPDATE invoices SET subtotal = 0 WHERE sync_status = 'PENDING' AND (subtotal IS NULL OR subtotal < 0)").run();
      // Self-heal: fix any PENDING invoices with missing/null received_amount
      _db.prepare("UPDATE invoices SET received_amount = 0 WHERE sync_status = 'PENDING' AND (received_amount IS NULL OR received_amount < 0)").run();
      // Self-heal: ensure grand_total reflects net total after discounts for any invoices where grand_total was stored as gross/subtotal
      _db.prepare(`
        UPDATE invoices 
        SET grand_total = MAX(0, COALESCE(subtotal, 0) + COALESCE(tax_total, 0) - COALESCE(discount_total, 0) - COALESCE(points_redeemed_discount, 0) - COALESCE(scrap_deduction, 0) - COALESCE(return_deduction, 0))
        WHERE (COALESCE(discount_total, 0) > 0 OR COALESCE(points_redeemed_discount, 0) > 0 OR COALESCE(scrap_deduction, 0) > 0 OR COALESCE(return_deduction, 0) > 0)
          AND grand_total > (COALESCE(subtotal, 0) + COALESCE(tax_total, 0) - COALESCE(discount_total, 0) - COALESCE(points_redeemed_discount, 0) - COALESCE(scrap_deduction, 0) - COALESCE(return_deduction, 0) + 0.01)
      `).run();
      
      const staleBills = _db.prepare(
        "SELECT invoice_id, tenant_id FROM invoices WHERE invoice_type = 'HOLD' AND is_held = 1 AND held_until <= datetime('now', 'localtime')"
      ).all() as any[];
      if (staleBills.length > 0) {
        const expireTx = _db.transaction(() => {
          const stockStmt = _db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)');
          const markStmt = _db.prepare('UPDATE invoices SET is_held = 0, invoice_type = \'EXPIRED_HOLD\', sync_status = \'SYNCED\', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?');
          for (const bill of staleBills) {
            const items = _db.prepare('SELECT product_id, quantity, is_service_item FROM invoice_items WHERE invoice_id = ?').all(bill.invoice_id) as any[];
            for (const item of items) {
              if (!item.is_service_item) stockStmt.run(item.quantity, item.product_id);
            }
            markStmt.run(bill.invoice_id);
          }
        });
        expireTx();
        console.log(`[Main] Auto-expired ${staleBills.length} stale held bill(s) on startup`);
      }
    } catch (e: any) {
      console.warn('[Main] Failed to expire stale holds on startup:', e.message);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Auto-Update Configuration
  const updaterToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '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';
  if (updaterToken) {
    autoUpdater.requestHeaders = {
      Authorization: `token ${updaterToken}`
    };
    console.log('[Updater] Configured GitHub authorization headers for private repo updates.');
  }

  autoUpdater.autoDownload = true;
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

  let lastCheckTime = 0;
  const triggerUpdateCheck = () => {
    const now = Date.now();
    // Debounce checks so they don't fire more frequently than every 60 seconds
    if (now - lastCheckTime < 60 * 1000) return;
    lastCheckTime = now;
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.error('[Updater] Check error:', err.message);
    });
  };

  // Check for updates every 5 minutes (reduced from 60 minutes for fast release detection)
  setInterval(triggerUpdateCheck, 5 * 60 * 1000);

  // Also check for updates when app window receives focus
  if (mainWindow) {
    mainWindow.on('focus', triggerUpdateCheck);
  }

  // Initial check on startup
  triggerUpdateCheck();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────

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

function readAuthPayload(): any {
  const encPath = getEncryptedPath();
  if (fs.existsSync(encPath)) {
    const raw = fs.readFileSync(encPath);
    const decrypted = decrypt(raw);
    if (decrypted) {
      try { return JSON.parse(decrypted); } catch {}
    }
  }
  const p = getConfigPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

ipcMain.removeHandler('auth:saveToken');
ipcMain.handle('auth:saveToken', (event, payload) => {
  try {
    const plaintext = JSON.stringify(payload);
    fs.writeFileSync(getConfigPath(), plaintext, 'utf-8');
    const encrypted = encrypt(plaintext);
    if (encrypted) {
      fs.writeFileSync(getEncryptedPath(), encrypted);
    }
    setSyncActive(true);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: 'Failed to save token' };
  }
});

ipcMain.removeHandler('auth:getToken');
ipcMain.handle('auth:getToken', () => {
  try {
    return readAuthPayload();
  } catch {
    return null;
  }
});

ipcMain.removeHandler('auth:clearToken');
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

ipcMain.removeHandler('log:error');
ipcMain.handle('log:error', (event, payload: { message: string, error?: any }) => {
  log.error('[Frontend Error]', payload.message, payload.error || '');
});

ipcMain.removeHandler('app:getVersion');
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

// ── DEBUG: Sync State Diagnostic (remove after fixing) ─────────────────────
ipcMain.handle('db:debugSyncState', (event, tenant_id: string) => {
  try {
    const db = getDb();
    const tables = ['products', 'invoices', 'cash_transactions', 'cash_drawer', 'cashier_audit_log'];
    const counts: Record<string, any> = {};
    for (const t of tables) {
      try {
        const row = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN sync_status='SYNCED' THEN 1 ELSE 0 END) as synced, SUM(CASE WHEN sync_status='PENDING' THEN 1 ELSE 0 END) as pending FROM ${t} WHERE tenant_id = ?`).get(tenant_id) as any;
        counts[t] = row;
      } catch (e: any) { counts[t] = { error: e.message }; }
    }
    const cursors = db.prepare(`SELECT key, value FROM sync_meta WHERE key LIKE ?`).all(`pull_cursor:${tenant_id}:%`) as any[];
    const isSyncActive = db.prepare(`SELECT value FROM sync_meta WHERE key = ?`).get(`cash_drawer_conflict_fix_v2:${tenant_id}`) as any;
    console.log('[db:debugSyncState] Table counts:', JSON.stringify(counts, null, 2));
    console.log('[db:debugSyncState] Pull cursors:', JSON.stringify(cursors, null, 2));
    return { counts, cursors, healingFlagSet: !!isSyncActive };
  } catch (e: any) {
    console.error('[db:debugSyncState] Error:', e.message);
    return { error: e.message };
  }
});

ipcMain.handle('db:getProducts', (event, arg: any) => {
  try {
    const db = getDb();
    const tenantId = typeof arg === 'string' ? arg : arg?.tenant_id;
    if (!tenantId) {
      console.warn('[db:getProducts] Called with no tenant_id — returning []');
      return [];
    }

    console.log(`[db:getProducts] Called — tenantId=${tenantId} arg=${JSON.stringify(arg)}`);

    if (typeof arg === 'string' || (!arg.limit && !arg.search && !arg.barcode && !arg.sortBy && !arg.filterDate && !arg.isGst && !arg.dateField)) {
      const rows = db.prepare(`
        SELECT p.*, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price,
          COALESCE((
            SELECT SUM(pbi.quantity) 
            FROM purchase_bill_items pbi
            WHERE pbi.product_id = p.product_id AND pbi.skip_stock_update = 1 AND pbi.tenant_id = p.tenant_id
          ), 0) - COALESCE((
            SELECT SUM(ii.qty_from_paper_stock)
            FROM invoice_items ii
            WHERE ii.product_id = p.product_id AND ii.tenant_id = p.tenant_id
          ), 0) as paper_stock
        FROM products p 
        LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id 
        WHERE p.tenant_id = ? AND p.is_deleted = 0 
        ORDER BY p.name COLLATE NOCASE ASC, p.product_id ASC
      `).all(tenantId);
      console.log(`[db:getProducts] Full list query → ${rows.length} rows returned for tenant ${tenantId}`);
      return rows;
    }

    const { limit, offset, search, sortBy, barcode, filterDate, isGst, dateField } = arg;
    let query = `
      SELECT p.*, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price,
        COALESCE((
          SELECT SUM(pbi.quantity) 
          FROM purchase_bill_items pbi
          WHERE pbi.product_id = p.product_id AND pbi.skip_stock_update = 1 AND pbi.tenant_id = p.tenant_id
        ), 0) - COALESCE((
          SELECT SUM(ii.qty_from_paper_stock)
          FROM invoice_items ii
          WHERE ii.product_id = p.product_id AND ii.tenant_id = p.tenant_id
        ), 0) as paper_stock
      FROM products p 
      LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id 
      WHERE p.tenant_id = ? AND p.is_deleted = 0
    `;
    const params: any[] = [tenantId];

    if (isGst !== undefined) {
       query += ' AND p.is_gst_applicable = ?';
       params.push(isGst ? 1 : 0);
    }

    if (barcode) {
       const cleanBarcode = String(barcode).trim();
       query += ' AND (TRIM(p.sku_barcode) = ? OR LOWER(p.sku_barcode) = LOWER(?) OR TRIM(p.item_code) = ? OR LOWER(p.item_code) = LOWER(?))';
       params.push(cleanBarcode, cleanBarcode, cleanBarcode, cleanBarcode);
    } else if (search) {
       const cleanSearch = String(search).trim();
       // Any character (letter, number, symbol) matches products across all fields:
       // name, barcode, item code, brand, category, HSN, and product id.
       query += ' AND (p.name LIKE ? OR p.sku_barcode LIKE ? OR p.item_code LIKE ? OR p.brand_manufacturer LIKE ? OR p.category LIKE ? OR p.hsn_sac_code LIKE ? OR p.product_id = ?)';
       params.push(`%${cleanSearch}%`, `%${cleanSearch}%`, `%${cleanSearch}%`, `%${cleanSearch}%`, `%${cleanSearch}%`, `%${cleanSearch}%`, cleanSearch);
    }

    if (filterDate && String(filterDate).trim() !== '') {
       const dateCol = dateField === 'updated_at' ? 'COALESCE(p.updated_at, p.created_at)' : 'p.created_at';
       if (arg.filterDateEnd && String(arg.filterDateEnd).trim() !== '') {
         query += ` AND (substr(${dateCol}, 1, 10) BETWEEN ? AND ? OR date(${dateCol}, 'localtime') BETWEEN ? AND ?)`;
         params.push(filterDate, arg.filterDateEnd, filterDate, arg.filterDateEnd);
       } else {
         query += ` AND (substr(${dateCol}, 1, 10) = ? OR date(${dateCol}, 'localtime') = ?)`;
         params.push(filterDate, filterDate);
       }
    }

    if (sortBy === 'created_at') query += ' ORDER BY p.created_at DESC, p.product_id ASC';
    else if (sortBy === 'updated_at') query += ' ORDER BY p.updated_at DESC, p.product_id ASC';
    else if (sortBy === 'stock') query += ' ORDER BY p.current_stock ASC, p.product_id ASC';
    else if (search) {
       const cleanSearch = String(search).trim();
       query += ` ORDER BY 
         CASE 
           WHEN TRIM(p.sku_barcode) = ? OR TRIM(p.item_code) = ? THEN 1
           WHEN TRIM(p.sku_barcode) LIKE ? OR TRIM(p.item_code) LIKE ? THEN 2
           WHEN p.sku_barcode LIKE ? OR p.item_code LIKE ? THEN 3
           WHEN p.name LIKE ? THEN 4
           ELSE 5
         END ASC,
         CASE 
           WHEN p.sku_barcode GLOB '[0-9]*' THEN CAST(p.sku_barcode AS INTEGER)
           WHEN p.item_code GLOB '[0-9]*' THEN CAST(p.item_code AS INTEGER)
           ELSE 99999999
         END ASC,
         LENGTH(COALESCE(p.sku_barcode, p.item_code, '')) ASC,
         COALESCE(p.sku_barcode, p.item_code, '') ASC,
         p.name COLLATE NOCASE ASC,
         p.product_id ASC`;
       params.push(
         cleanSearch, cleanSearch,
         `${cleanSearch}%`, `${cleanSearch}%`,
         `%${cleanSearch}%`, `%${cleanSearch}%`,
         `${cleanSearch}%`
       );
    }
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
    return db.prepare(`SELECT p.*, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price FROM products p LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id WHERE p.tenant_id = ? AND p.product_id IN (${placeholders})`).all(tenant_id, ...product_ids);
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
       // Mirror logic from db:getProducts — any character matches across all fields
       query += ' AND (name LIKE ? OR sku_barcode LIKE ? OR item_code LIKE ? OR brand_manufacturer LIKE ? OR category LIKE ? OR hsn_sac_code LIKE ? OR product_id = ?)';
       params.push(`%${arg.search}%`, `%${arg.search}%`, `%${arg.search}%`, `%${arg.search}%`, `%${arg.search}%`, `%${arg.search}%`, arg.search);
    }

    if (arg?.filterDate && String(arg.filterDate).trim() !== '') {
       const dateCol = arg?.dateField === 'updated_at' ? 'COALESCE(updated_at, created_at)' : 'created_at';
       if (arg.filterDateEnd && String(arg.filterDateEnd).trim() !== '') {
         query += ` AND (substr(${dateCol}, 1, 10) BETWEEN ? AND ? OR date(${dateCol}, 'localtime') BETWEEN ? AND ?)`;
         params.push(arg.filterDate, arg.filterDateEnd, arg.filterDate, arg.filterDateEnd);
       } else {
         query += ` AND (substr(${dateCol}, 1, 10) = ? OR date(${dateCol}, 'localtime') = ?)`;
         params.push(arg.filterDate, arg.filterDate);
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
    const cleanBarcode = (p.sku_barcode && String(p.sku_barcode).trim() !== '') ? String(p.sku_barcode).trim() : null;
    const cleanItemCode = (p.item_code && String(p.item_code).trim() !== '') ? String(p.item_code).trim() : null;
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
      cleanBarcode,
      cleanItemCode,
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
       (['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'].includes((p.uom || '').toLowerCase()) ? 'WEIGHT' : (p.billing_type || 'PIECE')),
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
    // Gather every live Service Charge candidate: flagged items or rows literally named 'Service Charge'.
    const candidates = db.prepare(`
      SELECT * FROM products
      WHERE tenant_id = ? AND is_deleted = 0
        AND (is_service_item = 1 OR name = 'Service Charge')
      ORDER BY created_at ASC, product_id ASC
    `).all(tenant_id) as any[];
    const isFlagged = (p: any) => Number(p.is_service_item) === 1;
    const hasBarcode99 = (p: any) => String(p.sku_barcode || '').trim() === '99';

    // Deterministic canonical pick:
    //   1. flagged + barcode '99'   (the easy-scan item)
    //   2. flagged                  (the true service item)
    //   3. named 'Service Charge' + barcode '99'
    //   4. named 'Service Charge'    (oldest first)
    let canonical = candidates.find((p: any) => isFlagged(p) && hasBarcode99(p))
      || candidates.find((p: any) => isFlagged(p))
      || candidates.find((p: any) => hasBarcode99(p))
      || candidates[0];

    if (!canonical) {
      // Fresh tenant: create one canonical service charge row.
      const barcodeInUse = db.prepare("SELECT product_id FROM products WHERE tenant_id = ? AND sku_barcode = '99' AND is_deleted = 0").get(tenant_id);
      const barcode = barcodeInUse ? `SVC-${crypto.randomUUID().slice(0, 8)}` : '99';
      const product_id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO products (product_id, tenant_id, name, sku_barcode, base_price, tax_rate_percent, uom, current_stock, is_service_item, billing_type, pricing_mode, is_deleted, sync_status, created_at, updated_at)
        VALUES (?, ?, 'Service Charge', ?, 0, 0, 'Pcs', 0, 1, 'PIECE', 'FIXED_PRICE', 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(product_id, tenant_id, barcode);
      return { success: true, product_id };
    }

    // Soft-delete every duplicate so only the canonical one survives (locally + pushed to cloud).
    const softDelete = db.prepare(`
      UPDATE products SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND product_id = ?
    `);
    const deletedHadBarcode99 = candidates.some((c: any) => c.product_id !== canonical.product_id && hasBarcode99(c));
    for (const c of candidates) {
      if (c.product_id !== canonical.product_id) softDelete.run(tenant_id, c.product_id);
    }

    // Keep the canonical row properly flagged/named, and give it the easy barcode when it has none.
    const canonicalBarcode = String(canonical.sku_barcode || '').trim();
    const canAdopt99 = !canonicalBarcode || (deletedHadBarcode99 && canonicalBarcode !== '99');
    if (canAdopt99) {
      // The soft-deleted duplicate still occupies the UNIQUE '99' — clear it first, then hand it over.
      db.prepare(`
        UPDATE products SET sku_barcode = NULL, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND sku_barcode = '99' AND is_deleted = 1
      `).run(tenant_id);
      const barcodeTaken = db.prepare("SELECT product_id FROM products WHERE tenant_id = ? AND sku_barcode = '99' AND is_deleted = 0 AND product_id != ?").get(tenant_id, canonical.product_id);
      canonical.sku_barcode = barcodeTaken ? (canonicalBarcode || `SVC-${crypto.randomUUID().slice(0, 8)}`) : '99';
    }

    const needsFix = !isFlagged(canonical) || canonical.name !== 'Service Charge' || canonical.sku_barcode !== canonicalBarcode;
    if (needsFix) {
      db.prepare(`
        UPDATE products SET name = 'Service Charge', sku_barcode = ?, is_service_item = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND product_id = ?
      `).run(canonical.sku_barcode, tenant_id, canonical.product_id);
    }

    return { success: true, product_id: canonical.product_id, sku_barcode: canonical.sku_barcode };
  } catch (error: any) {
    console.error('[db:ensureServiceItem]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:updateProduct', safeHandler((event, p) => {
  try {
    const db = getDb();
    const cleanBarcode = (p.sku_barcode && String(p.sku_barcode).trim() !== '') ? String(p.sku_barcode).trim() : null;
    const cleanItemCode = (p.item_code && String(p.item_code).trim() !== '') ? String(p.item_code).trim() : null;
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
      cleanBarcode,
      cleanItemCode,
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
       (['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'].includes((p.uom || '').toLowerCase()) ? 'WEIGHT' : (p.billing_type || 'PIECE')),
       p.grade_id || null,
       p.pricing_mode || 'FIXED_PRICE',
       p.average_weight_per_piece ?? null,
       p.weight_override_allowed ?? 0,
       p.is_service_item ?? 0,
       p.product_id
    );
    return { success: true };
  } catch (error: any) {
    const msg = error?.message || 'Operation failed';
    console.error('[db:updateProduct]', msg);
    return { success: false, error: msg };
  }
}));

// Lightweight GST/Estimate toggle — flips only is_gst_applicable without touching
// any other product field.
ipcMain.handle('db:updateProductGstFlag', safeHandler((event, { tenant_id, product_id, is_gst_applicable }: { tenant_id: string; product_id: string; is_gst_applicable: number }) => {
  const db = getDb();
  const res = db.prepare(`
    UPDATE products
    SET is_gst_applicable = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
    WHERE product_id = ? AND tenant_id = ?
  `).run(is_gst_applicable ? 1 : 0, product_id, tenant_id);
  if (res.changes === 0) return { success: false, error: 'Product not found' };
  return { success: true };
}));

ipcMain.handle('db:updateProductName', safeHandler((event, { tenant_id, product_id, name }: { tenant_id: string; product_id: string; name: string }) => {
  const db = getDb();
  const res = db.prepare(`
    UPDATE products
    SET name = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
    WHERE product_id = ? AND tenant_id = ?
  `).run(name, product_id, tenant_id);
  if (res.changes === 0) return { success: false, error: 'Product not found' };
  return { success: true };
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
        const timestamp = localTimestamp(now);
        
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

ipcMain.handle('db:adjustStock', (event, { product_id, delta, pcsDelta }) => {
  try {
    const db = getDb();
    if (pcsDelta != null) {
      const row = db.prepare('SELECT domain_attributes FROM products WHERE product_id = ?').get(product_id) as any;
      let da: Record<string, any> = {};
      try { da = JSON.parse(row?.domain_attributes || '{}'); } catch { /* keep empty */ }
      const current = Number(da.pcs_stock ?? da.pcs ?? 0) || 0;
      const nextPcs = Math.max(0, current + pcsDelta);
      da.pcs_stock = nextPcs;
      da.pcs = nextPcs;
      db.prepare(`
        UPDATE products 
        SET domain_attributes = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE product_id = ?
      `).run(JSON.stringify(da), product_id);
    }
    if (delta != null) {
      db.prepare(`
        UPDATE products 
        SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE product_id = ?
      `).run(delta, product_id);
    }
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
      INSERT INTO product_grades (grade_id, tenant_id, category, grade_name, rate, purchase_price, offer_price, is_deleted, sync_status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'PENDING')
    `).run(g.grade_id, g.tenant_id, g.category, g.grade_name, g.rate, g.purchase_price || 0, g.offer_price ?? null);
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
      SET category = ?, grade_name = ?, rate = ?, purchase_price = ?, offer_price = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
      WHERE grade_id = ?
    `).run(g.category, g.grade_name, g.rate, g.purchase_price || 0, g.offer_price ?? null, g.grade_id);
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

// ── Pricing Tier Handlers ───────────────────────────────────────────────────
ipcMain.handle('db:getPricingTiers', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare('SELECT * FROM pricing_tiers WHERE tenant_id = ? AND is_deleted = 0 ORDER BY sort_order ASC, name COLLATE NOCASE ASC').all(tenantId);
  } catch (error: any) {
    console.error('[db:getPricingTiers]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:addPricingTier', safeHandler((event, t) => {
  try {
    const db = getDb();
    const nextSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM pricing_tiers WHERE tenant_id = ?').get(t.tenant_id) as any;
    const isActive = (t.is_active === false || t.is_active === 0 || t.is_active === '0') ? 0 : 1;
    db.prepare(`
      INSERT INTO pricing_tiers (pricing_tier_id, tenant_id, name, is_active, sort_order, is_deleted, sync_status)
      VALUES (?, ?, ?, ?, ?, 0, 'PENDING')
    `).run(t.pricing_tier_id, t.tenant_id, t.name, isActive, t.sort_order ?? (nextSort?.next_sort || 0));
    return { success: true };
  } catch (error: any) {
    console.error('[db:addPricingTier]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:updatePricingTier', safeHandler((event, t) => {
  try {
    const db = getDb();
    const isActive = (t.is_active === false || t.is_active === 0 || t.is_active === '0') ? 0 : 1;
    db.prepare(`
      UPDATE pricing_tiers
      SET name = ?, is_active = ?, sort_order = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE pricing_tier_id = ?
    `).run(t.name, isActive, t.sort_order ?? 0, t.pricing_tier_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:updatePricingTier]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:deletePricingTier', (event, tierId: string) => {
  try {
    const db = getDb();
    db.prepare(`UPDATE pricing_tiers SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE pricing_tier_id = ?`).run(tierId);
    return { success: true };
  } catch (error: any) {
    console.error('[db:deletePricingTier]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:reorderPricingTiers', safeHandler((event, tiers: Array<{ pricing_tier_id: string; sort_order: number }>) => {
  try {
    const db = getDb();
    const stmt = db.prepare(`UPDATE pricing_tiers SET sort_order = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE pricing_tier_id = ?`);
    const tx = db.transaction((rows: Array<{ pricing_tier_id: string; sort_order: number }>) => {
      for (const r of rows) stmt.run(r.sort_order ?? 0, r.pricing_tier_id);
    });
    tx(tiers);
    return { success: true };
  } catch (error: any) {
    console.error('[db:reorderPricingTiers]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:getProductPricing', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare('SELECT * FROM product_pricing WHERE tenant_id = ? AND is_deleted = 0').all(tenantId);
  } catch (error: any) {
    console.error('[db:getProductPricing]', error);
    return { error: 'Operation failed' };
  }
});

// ── Combo Offers Handlers ──────────────────────────────────────────────────
ipcMain.handle('db:getComboOffers', (event, { tenant_id, search, only_active }: { tenant_id: string; search?: string; only_active?: boolean }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    
    let query = `
      SELECT co.*, 
        (
          SELECT json_group_array(json_object(
            'combo_item_id', ci.combo_item_id,
            'product_id', ci.product_id,
            'quantity', ci.quantity,
            'product_name', p.name,
            'product_price', p.base_price,
            'product_stock', p.current_stock,
            'sku_barcode', p.sku_barcode,
            'uom', p.uom
          ))
          FROM combo_items ci
          JOIN products p ON ci.product_id = p.product_id
          WHERE ci.combo_id = co.combo_id AND p.is_deleted = 0
        ) as items_json
      FROM combo_offers co
      WHERE co.tenant_id = ? AND co.is_deleted = 0
    `;
    const params: any[] = [tenant_id];

    if (only_active) {
      query += ` AND co.is_active = 1`;
    }

    if (search) {
      const s = `%${String(search).trim()}%`;
      query += ` AND (co.name LIKE ? OR co.sku_barcode LIKE ? OR co.description LIKE ?)`;
      params.push(s, s, s);
    }

    query += ` ORDER BY co.name COLLATE NOCASE ASC`;
    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(r => {
      let items = [];
      try { items = JSON.parse(r.items_json || '[]'); } catch {}
      return { ...r, items };
    });
  } catch (error: any) {
    console.error('[db:getComboOffers]', error);
    return [];
  }
});

ipcMain.handle('db:getComboOfferDetails', (event, { combo_id }: { combo_id: string }) => {
  try {
    const db = getDb();
    if (!combo_id) return null;
    const combo = db.prepare(`SELECT * FROM combo_offers WHERE combo_id = ? AND is_deleted = 0`).get(combo_id) as any;
    if (!combo) return null;

    const items = db.prepare(`
      SELECT ci.*, p.name as product_name, p.base_price as product_price, p.current_stock as product_stock, p.sku_barcode, p.uom
      FROM combo_items ci
      JOIN products p ON ci.product_id = p.product_id
      WHERE ci.combo_id = ? AND p.is_deleted = 0
    `).all(combo_id) as any[];

    return { ...combo, items };
  } catch (error: any) {
    console.error('[db:getComboOfferDetails]', error);
    return null;
  }
});

ipcMain.handle('db:saveComboOffer', safeHandler((event, payload: {
  combo_id?: string;
  tenant_id: string;
  name: string;
  sku_barcode?: string;
  combo_price: number;
  is_active?: number;
  description?: string;
  items: Array<{ product_id: string; quantity: number }>;
}) => {
  try {
    const db = getDb();
    const { combo_id: reqComboId, tenant_id, name, sku_barcode, combo_price, is_active, description, items } = payload;
    if (!tenant_id || !name || !items || items.length === 0) {
      return { success: false, error: 'Name and items are required' };
    }

    const cleanBarcode = (sku_barcode || '').trim() || null;
    const combo_id = reqComboId || crypto.randomUUID();

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO combo_offers (combo_id, tenant_id, name, sku_barcode, combo_price, is_active, is_deleted, description, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(combo_id) DO UPDATE SET
          name = excluded.name,
          sku_barcode = excluded.sku_barcode,
          combo_price = excluded.combo_price,
          is_active = excluded.is_active,
          description = excluded.description,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      `).run(
        combo_id,
        tenant_id,
        name.trim(),
        cleanBarcode,
        Number(combo_price) || 0,
        is_active ?? 1,
        description?.trim() || null
      );

      db.prepare(`DELETE FROM combo_items WHERE combo_id = ?`).run(combo_id);
      const insertItem = db.prepare(`
        INSERT INTO combo_items (combo_item_id, combo_id, tenant_id, product_id, quantity, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      for (const item of items) {
        insertItem.run(
          crypto.randomUUID(),
          combo_id,
          tenant_id,
          item.product_id,
          Number(item.quantity) || 1
        );
      }
    });

    tx();
    return { success: true, combo_id };
  } catch (error: any) {
    console.error('[db:saveComboOffer]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:deleteComboOffer', (event, { combo_id }: { combo_id: string }) => {
  try {
    const db = getDb();
    if (!combo_id) return { success: false, error: 'Missing combo ID' };
    db.prepare(`UPDATE combo_offers SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE combo_id = ?`).run(combo_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteComboOffer]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:toggleComboOfferActive', (event, { combo_id, is_active }: { combo_id: string; is_active: number }) => {
  try {
    const db = getDb();
    if (!combo_id) return { success: false, error: 'Missing combo ID' };
    db.prepare(`UPDATE combo_offers SET is_active = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE combo_id = ?`).run(is_active ? 1 : 0, combo_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:toggleComboOfferActive]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// Upsert/delete per-tier prices for a single product
// payload: { tenant_id, product_id, pricing: [{ pricing_tier_id, price }] }
ipcMain.handle('db:setProductPricing', safeHandler((event, payload: { tenant_id: string; product_id: string; pricing: Array<{ pricing_tier_id: string; price: number | null }> }) => {
  try {
    const db = getDb();
    const { tenant_id, product_id, pricing } = payload;
    if (!tenant_id || !product_id || !Array.isArray(pricing)) return { success: false, error: 'Invalid payload' };
    const upsert = db.prepare(`
      INSERT INTO product_pricing (product_pricing_id, tenant_id, product_id, pricing_tier_id, price, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(product_id, pricing_tier_id) DO UPDATE SET
        price = excluded.price,
        is_deleted = 0,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
    `);
    const clear = db.prepare(`UPDATE product_pricing SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND pricing_tier_id = ? AND tenant_id = ?`);
    const tx = db.transaction((rows: Array<{ pricing_tier_id: string; price: number | null }>) => {
      for (const item of rows) {
        if (!item?.pricing_tier_id) continue;
        const isEmpty = item.price === null || item.price === undefined || String(item.price).trim() === '';
        if (isEmpty) {
          clear.run(product_id, item.pricing_tier_id, tenant_id);
          continue;
        }
        upsert.run(`${product_id}:${item.pricing_tier_id}`, tenant_id, product_id, item.pricing_tier_id, Number(item.price) || 0);
      }
    });
    tx(pricing);
    return { success: true };
  } catch (error: any) {
    console.error('[db:setProductPricing]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

// Bulk upsert/delete of product prices for one tier
// payload: { tenant_id, pricing_tier_id, pricing: [{ product_id, price }] }
ipcMain.handle('db:setTierPricing', safeHandler((event, payload: { tenant_id: string; pricing_tier_id: string; pricing: Array<{ product_id: string; price: number | null }> }) => {
  try {
    const db = getDb();
    const { tenant_id, pricing_tier_id, pricing } = payload;
    if (!tenant_id || !pricing_tier_id || !Array.isArray(pricing)) return { success: false, error: 'Invalid payload' };
    const upsert = db.prepare(`
      INSERT INTO product_pricing (product_pricing_id, tenant_id, product_id, pricing_tier_id, price, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(product_id, pricing_tier_id) DO UPDATE SET
        price = excluded.price,
        is_deleted = 0,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
    `);
    const clear = db.prepare(`UPDATE product_pricing SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND pricing_tier_id = ? AND tenant_id = ?`);
    const tx = db.transaction((rows: Array<{ product_id: string; price: number | null }>) => {
      for (const item of rows) {
        if (!item?.product_id) continue;
        const isEmpty = item.price === null || item.price === undefined || String(item.price).trim() === '';
        if (isEmpty) {
          clear.run(item.product_id, pricing_tier_id, tenant_id);
          continue;
        }
        upsert.run(`${item.product_id}:${pricing_tier_id}`, tenant_id, item.product_id, pricing_tier_id, Number(item.price) || 0);
      }
    });
    tx(pricing);
    return { success: true };
  } catch (error: any) {
    console.error('[db:setTierPricing]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

// ── Party (Credit Person) Handlers ──────────────────────────────────────────
ipcMain.handle('db:getParties', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    backfillCreditInvoices(db);
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
    const creditLimit = Math.max(0, Number(p.credit_limit) || 0);

    db.prepare(`
      INSERT INTO parties (party_id, tenant_id, name, phone, address, gstin, balance, gst_balance, estimate_balance, balance_type, notes, pricing_tier_id, credit_limit, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(p.party_id, p.tenant_id, p.name, p.phone || null, p.address || null, p.gstin || null, initialBalance, initialBalance, bt, p.notes || null, p.pricing_tier_id || null, creditLimit);

    // Create opening balance ledger entry
    if (p.balance && parseFloat(p.balance) > 0) {
      const amount = Math.abs(parseFloat(p.balance));
      const ledgerId = p.party_id + '-OPENING';
      db.prepare(`
        INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, created_by, created_by_name, created_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, 'GST', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
    const hasTier = p.pricing_tier_id !== undefined;
    const hasCreditLimit = p.credit_limit !== undefined;
    const creditLimit = hasCreditLimit ? Math.max(0, Number(p.credit_limit) || 0) : 0;

    let updateSql = `UPDATE parties SET name = ?, phone = ?, address = ?, gstin = ?, notes = ?`;
    const params: any[] = [p.name, p.phone || null, p.address || null, p.gstin || null, p.notes || null];

    if (hasTier) {
      updateSql += `, pricing_tier_id = ?`;
      params.push(p.pricing_tier_id || null);
    }
    if (hasCreditLimit) {
      updateSql += `, credit_limit = ?`;
      params.push(creditLimit);
    }

    updateSql += `, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`;
    params.push(p.party_id);

    db.prepare(updateSql).run(...params);
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
    db.prepare("UPDATE parties SET balance = balance + ?, gst_balance = gst_balance + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?").run(amount, amount, party_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:adjustPartyBalance]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// Recompute a party's GST / Estimate / total balances from its ledger entries
function recalcPartyBalances(db: any, partyId: string) {
  const rows = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN balance_type = 'GST' THEN credit_amount - debit_amount ELSE 0 END), 0) AS gst,
            COALESCE(SUM(CASE WHEN balance_type = 'ESTIMATE' THEN credit_amount - debit_amount ELSE 0 END), 0) AS estimate,
            COALESCE(SUM(credit_amount - debit_amount), 0) AS total
     FROM party_ledger WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)`
  ).get(partyId) as any;
  const gst = parseFloat(rows.gst) || 0;
  const estimate = parseFloat(rows.estimate) || 0;
  const total = gst + estimate;
  const latest = db.prepare(
    `SELECT transaction_date FROM party_ledger WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY transaction_date DESC LIMIT 1`
  ).get(partyId) as any;
  db.prepare(`UPDATE parties SET balance = ?, gst_balance = ?, estimate_balance = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`)
    .run(total, gst, estimate, latest ? latest.transaction_date : null, partyId);
  return total;
}

export function syncInvoiceCreditLedger(
  db: any,
  invoice: {
    invoice_id?: string;
    tenant_id?: string;
    invoice_number?: string;
    invoice_type?: string;
    grand_total?: number;
    payment_method?: string;
    received_amount?: number;
    balance_amount?: number;
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_address?: string | null;
    customer_gstin?: string | null;
    user_id?: string;
    user_name?: string;
    created_at?: string;
  },
  isDelete = false
) {
  try {
    const tenantId = invoice.tenant_id || 'global';
    const invoiceNumber = invoice.invoice_number;
    if (!invoiceNumber) return;

    // References: `${invoiceNumber}` (credit sale entry), `${invoiceNumber}-PAY` (immediate paid entry)
    const existingEntries = db.prepare(`
      SELECT * FROM party_ledger 
      WHERE tenant_id = ? AND (reference_number = ? OR reference_number = ?)
    `).all(tenantId, invoiceNumber, `${invoiceNumber}-PAY`) as any[];

    // Parse split_details if present
    let splitCredit = 0;
    if ((invoice as any).split_details) {
      try {
        const s = typeof (invoice as any).split_details === 'string'
          ? JSON.parse((invoice as any).split_details)
          : (invoice as any).split_details;
        splitCredit = Number(s?.credit) || 0;
      } catch {}
    }

    const paymentMethodUpper = (invoice.payment_method || '').toUpperCase();
    const isSplitCredit = paymentMethodUpper === 'SPLIT' && splitCredit > 0;
    const isCredit = paymentMethodUpper === 'CREDIT' || isSplitCredit;

    // If deleted or neither CREDIT nor SPLIT-with-credit: soft delete any existing ledger entries
    if (isDelete || !isCredit) {
      if (existingEntries.length > 0) {
        const affectedPartyIds = new Set<string>();
        for (const entry of existingEntries) {
          affectedPartyIds.add(entry.party_id);
          db.prepare(`
            UPDATE party_ledger 
            SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
            WHERE ledger_id = ?
          `).run(entry.ledger_id);
        }
        for (const pId of affectedPartyIds) {
          recalcPartyBalances(db, pId);
        }
      }
      return;
    }

    const custName = (invoice.customer_name || '').trim();
    const custPhone = (invoice.customer_phone || '').trim();
    const custAddress = (invoice.customer_address || '').trim() || null;
    const custGstin = (invoice.customer_gstin || '').trim() || null;

    if (!custName && !custPhone) return;

    // Find party by phone, then by name
    let party: any = null;
    if (custPhone) {
      party = db.prepare(`
        SELECT * FROM parties 
        WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)
      `).get(tenantId, custPhone);
    }
    if (!party && custName) {
      party = db.prepare(`
        SELECT * FROM parties 
        WHERE tenant_id = ? AND name = ? COLLATE NOCASE AND (is_deleted IS NULL OR is_deleted = 0)
      `).get(tenantId, custName);
    }

    if (!party) {
      const newPartyId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO parties (
          party_id, tenant_id, name, phone, address, gstin, 
          balance, gst_balance, estimate_balance, balance_type, 
          notes, pricing_tier_id, credit_limit, is_deleted, sync_status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 'RECEIVABLE', NULL, NULL, 0, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        newPartyId, tenantId, custName || custPhone, custPhone || null, custAddress, custGstin
      );
      party = { party_id: newPartyId, name: custName || custPhone };
    }

    // Party changed? Clean up entries from previous party
    const oldPartyIds = new Set<string>();
    for (const entry of existingEntries) {
      if (entry.party_id !== party.party_id) {
        oldPartyIds.add(entry.party_id);
        db.prepare(`
          UPDATE party_ledger 
          SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
          WHERE ledger_id = ?
        `).run(entry.ledger_id);
      }
    }
    for (const opId of oldPartyIds) {
      recalcPartyBalances(db, opId);
    }

    const grandTotal = isSplitCredit ? splitCredit : (Number(invoice.grand_total) || 0);
    const receivedAmount = isSplitCredit ? 0 : Math.max(0, Number(invoice.received_amount) || 0);
    const balanceType: 'GST' | 'ESTIMATE' = (invoice.invoice_type === 'ESTIMATE') ? 'ESTIMATE' : 'GST';
    const txDate = invoice.created_at || localTimestamp();
    const saleDescription = isSplitCredit
      ? `Credit Sale (Split) ${invoiceNumber} - ${custName || party.name || 'Customer'}`
      : `Credit Sale ${invoiceNumber} - ${custName || party.name || 'Customer'}`;

    const saleEntry = existingEntries.find(e => e.party_id === party.party_id && e.reference_number === invoiceNumber);
    const payEntry = existingEntries.find(e => e.party_id === party.party_id && e.reference_number === `${invoiceNumber}-PAY`);

    // 1. Credit Sale entry
    if (saleEntry) {
      db.prepare(`
        UPDATE party_ledger SET
          credit_amount = ?, debit_amount = 0, description = ?, transaction_date = ?,
          balance_type = ?, payment_method = 'CREDIT', is_deleted = 0,
          sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE ledger_id = ?
      `).run(
        grandTotal,
        saleDescription,
        txDate,
        balanceType,
        saleEntry.ledger_id
      );
    } else {
      const saleLedgerId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO party_ledger (
          ledger_id, party_id, tenant_id, transaction_date, description,
          credit_amount, debit_amount, running_balance, balance_type,
          payment_method, reference_number, created_by, created_by_name,
          is_deleted, sync_status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 'CREDIT', ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        saleLedgerId,
        party.party_id,
        tenantId,
        txDate,
        saleDescription,
        grandTotal,
        balanceType,
        invoiceNumber,
        invoice.user_id || 'system',
        invoice.user_name || 'System'
      );
    }

    // 2. Immediate Cash payment at checkout (if customer paid partial cash)
    if (receivedAmount > 0) {
      if (payEntry) {
        db.prepare(`
          UPDATE party_ledger SET
            credit_amount = 0, debit_amount = ?, description = ?, transaction_date = ?,
            balance_type = ?, payment_method = 'CASH', is_deleted = 0,
            sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE ledger_id = ?
        `).run(
          receivedAmount,
          `Payment received for ${invoiceNumber}`,
          txDate,
          balanceType,
          payEntry.ledger_id
        );
      } else {
        const payLedgerId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO party_ledger (
            ledger_id, party_id, tenant_id, transaction_date, description,
            credit_amount, debit_amount, running_balance, balance_type,
            payment_method, reference_number, created_by, created_by_name,
            is_deleted, sync_status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, 'CASH', ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          payLedgerId,
          party.party_id,
          tenantId,
          txDate,
          `Payment received for ${invoiceNumber}`,
          receivedAmount,
          balanceType,
          `${invoiceNumber}-PAY`,
          invoice.user_id || 'system',
          invoice.user_name || 'System'
        );
      }
    } else if (payEntry) {
      db.prepare(`UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(payEntry.ledger_id);
    }

    // Re-sequence running_balance for the party
    const allEntries = db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY transaction_date ASC, created_at ASC
    `).all(party.party_id) as any[];

    let running = 0;
    for (const row of allEntries) {
      running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
      db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
    }

    recalcPartyBalances(db, party.party_id);
  } catch (err: any) {
    console.error('[syncInvoiceCreditLedger] Error:', err);
  }
}

let backfillLastRun = 0;
export function backfillCreditInvoices(db: any) {
  // Use a 30-second cooldown instead of a one-time flag so that credit invoices
  // created AFTER app launch are picked up the next time Parties/Ledger is opened.
  const now = Date.now();
  if (now - backfillLastRun < 30000) return;
  backfillLastRun = now;
  try {
    const unlinkedCreditInvoices = db.prepare(`
      SELECT i.* FROM invoices i
      WHERE (
        UPPER(i.payment_method) = 'CREDIT'
        OR (UPPER(i.payment_method) = 'SPLIT' AND i.split_details LIKE '%"credit":%' AND i.split_details NOT LIKE '%"credit":0%')
      )
        AND (i.is_deleted IS NULL OR i.is_deleted = 0)
        AND NOT EXISTS (
          SELECT 1 FROM party_ledger pl
          WHERE pl.reference_number = i.invoice_number
            AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
        )
    `).all() as any[];

    if (unlinkedCreditInvoices.length > 0) {
      console.log(`[DB] Backfilling ${unlinkedCreditInvoices.length} credit invoices into party ledger...`);
      for (const inv of unlinkedCreditInvoices) {
        syncInvoiceCreditLedger(db, inv);
      }
      console.log(`[DB] Credit invoices backfill completed.`);
    }
  } catch (err: any) {
    console.error('[DB] Failed to backfill credit invoices:', err);
  }
}

// ── Party Ledger Handlers ────────────────────────────────────────────────
ipcMain.handle('db:getPartyLedger', (event, partyId: string) => {
  try {
    const db = getDb();
    backfillCreditInvoices(db);
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
      balance_type TEXT DEFAULT 'GST',
      payment_method TEXT,
      reference_number TEXT,
      created_by TEXT,
      created_by_name TEXT,
      is_deleted INTEGER DEFAULT 0,
      sync_status TEXT DEFAULT 'SYNCED',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    try { db.exec(`ALTER TABLE party_ledger ADD COLUMN is_deleted INTEGER DEFAULT 0`); } catch {}
    // Clean up any legacy orphan purchase bill ledger entries where the purchase bill was deleted
    try {
      const orphans = db.prepare(`
        SELECT pl.ledger_id FROM party_ledger pl
        WHERE pl.party_id = ?
          AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
          AND pl.reference_number IS NOT NULL
          AND pl.description LIKE 'Purchase bill %'
          AND NOT EXISTS (
            SELECT 1 FROM purchase_bills pb WHERE pb.bill_number = pl.reference_number
          )
      `).all(partyId) as any[];
      if (orphans.length > 0) {
        for (const orphan of orphans) {
          db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?").run(orphan.ledger_id);
        }
        recalcPartyBalances(db, partyId);
      }
    } catch {}
    return db.prepare(`
      SELECT * FROM party_ledger WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY transaction_date ASC, created_at ASC
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
    const balanceType = entry.balance_type === 'ESTIMATE' ? 'ESTIMATE' : 'GST';
    const paymentMethod = entry.payment_method || null;
    const newBalance = currentBalance + creditAmount - debitAmount;

    db.prepare(`
      INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, payment_method, reference_number, created_by, created_by_name, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      entry.ledger_id,
      entry.party_id,
      entry.tenant_id,
      entry.transaction_date || new Date().toISOString(),
      entry.description,
      creditAmount,
      debitAmount,
      newBalance,
      balanceType,
      paymentMethod,
      entry.reference_number || null,
      entry.created_by || null,
      entry.created_by_name || null
    );

    const delta = creditAmount - debitAmount;
    const balanceCol = balanceType === 'ESTIMATE' ? 'estimate_balance' : 'gst_balance';
    db.prepare(`UPDATE parties SET balance = ?, ${balanceCol} = ${balanceCol} + ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`)
      .run(newBalance, delta, entry.transaction_date || new Date().toISOString(), entry.party_id);

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
        balance_type = ?, payment_method = ?,
        reference_number = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE ledger_id = ? AND party_id = ?
    `).run(
      entry.transaction_date || existing.transaction_date,
      entry.description || existing.description,
      creditAmount,
      debitAmount,
      entry.balance_type === 'ESTIMATE' ? 'ESTIMATE' : (existing.balance_type || 'GST'),
      entry.payment_method !== undefined ? entry.payment_method : (existing.payment_method || null),
      entry.reference_number !== undefined ? entry.reference_number : existing.reference_number,
      entry.ledger_id,
      entry.party_id
    );

    // Recalculate running balances for all entries
    const entries = db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY transaction_date ASC, created_at ASC
    `).all(entry.party_id) as any[];

    let running = 0;
    for (const row of entries) {
      running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
      db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
    }

    recalcPartyBalances(db, entry.party_id);

    return { success: true };
  } catch (error: any) {
    console.error('[db:updatePartyLedgerEntry]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:deletePartyLedgerEntry', (event, { ledger_id, party_id }: { ledger_id: string; party_id: string }) => {
  try {
    const db = getDb();
    
    db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ? AND party_id = ?").run(ledger_id, party_id);

    // Recalculate running balance
    const entries = db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY transaction_date ASC, created_at ASC
    `).all(party_id) as any[];

    let running = 0;
    for (const row of entries) {
      running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
      db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
    }

    recalcPartyBalances(db, party_id);

    import('./sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Sync after delete error:', e));
    }).catch(() => {});

    return { success: true };
  } catch (error: any) {
    console.error('[db:deletePartyLedgerEntry]', error);
    return { success: false, error: 'Operation failed' };
  }
});

const recentCheckoutsCache = new Map<string, { timestamp: number; result: any }>();

ipcMain.handle('db:checkout', safeHandler((event, payload) => {
  const { items, scrap_items, ...invoice } = payload;
  const db = getDb();
  const tenantId = invoice.tenant_id || 'global';

  // Deduplication guard: block duplicate checkout calls within a 4-second window
  const itemsSig = (items || []).map((i: any) => `${i.product_id}:${i.quantity}:${i.unit_price}`).sort().join('|');
  const cacheKey = `${tenantId}:${invoice.grand_total}:${itemsSig}`;
  const now = Date.now();
  const cached = recentCheckoutsCache.get(cacheKey);
  if (cached && (now - cached.timestamp < 4000)) {
    console.warn(`[db:checkout] Duplicate checkout request blocked within 4s window (Key: ${cacheKey}). Returning previous invoice ${cached.result.invoice_number}`);
    return cached.result;
  }

  // Idempotency guard: if invoice_id already exists in database, return existing result
  if (invoice.invoice_id) {
    const existingById: any = db.prepare('SELECT invoice_id, invoice_number FROM invoices WHERE invoice_id = ?').get(invoice.invoice_id);
    if (existingById) {
      console.warn(`[db:checkout] Invoice ID ${invoice.invoice_id} already exists in database. Returning existing invoice ${existingById.invoice_number}`);
      const res = { success: true, invoice_id: existingById.invoice_id, invoice_number: existingById.invoice_number };
      recentCheckoutsCache.set(cacheKey, { timestamp: now, result: res });
      return res;
    }
  }

  // Collision guard: if invoice_number is missing or already taken by another invoice, generate a guaranteed unique number
  let finalInvoiceNumber = invoice.invoice_number;
  const tripleSeriesRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'three_invoice_series');
  let isTripleSeries = false;
  if (tripleSeriesRow && tripleSeriesRow.value) {
    try { isTripleSeries = Boolean(JSON.parse(tripleSeriesRow.value).enabled); } catch {}
  }
  let resolvedSeries: string | undefined;
  if (invoice.invoice_type === 'GST') {
    if (isTripleSeries) {
      resolvedSeries = (invoice.customer_gstin && String(invoice.customer_gstin).trim()) ? 'gst_b2b' : 'gst_b2c';
    } else {
      resolvedSeries = 'gst';
    }
  }
  const configKey = resolvedSeries === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : resolvedSeries === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : resolvedSeries === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';

  if (!finalInvoiceNumber) {
    finalInvoiceNumber = getGuaranteedNextInvoiceNumber(db, tenantId, configKey).invoiceNumber;
  } else {
    const existingByNum: any = db.prepare('SELECT invoice_id FROM invoices WHERE tenant_id = ? AND invoice_number = ? LIMIT 1').get(tenantId, finalInvoiceNumber);
    if (existingByNum) {
      console.warn(`[db:checkout] Invoice number collision detected for "${finalInvoiceNumber}". Resolving with new guaranteed unique number.`);
      finalInvoiceNumber = getGuaranteedNextInvoiceNumber(db, tenantId, configKey).invoiceNumber;
    }
  }

  const transaction = db.transaction(() => {
    // Credit Limit enforcement guard
    const paymentMethodUpper = (invoice.payment_method || '').toUpperCase();
    let splitObj: any = null;
    if (typeof invoice.split_details === 'string') {
      try { splitObj = JSON.parse(invoice.split_details); } catch {}
    } else if (typeof invoice.split_details === 'object') {
      splitObj = invoice.split_details;
    }
    const isCreditBilling = paymentMethodUpper === 'CREDIT' || (paymentMethodUpper === 'SPLIT' && Number(splitObj?.credit) > 0);

    if (isCreditBilling) {
      const custPhone = (invoice.customer_phone || '').trim();
      const custName = (invoice.customer_name || '').trim();
      let matchedParty: any = null;
      if (custPhone) {
        matchedParty = db.prepare('SELECT * FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(tenantId, custPhone);
      }
      if (!matchedParty && custName) {
        matchedParty = db.prepare('SELECT * FROM parties WHERE tenant_id = ? AND name = ? COLLATE NOCASE AND (is_deleted IS NULL OR is_deleted = 0)').get(tenantId, custName);
      }

      if (matchedParty && Number(matchedParty.credit_limit) > 0) {
        const creditLimit = Number(matchedParty.credit_limit);
        const curBal = Math.max(0, Number(matchedParty.balance) || 0);
        const billCredit = paymentMethodUpper === 'CREDIT'
          ? Math.max(0, Number(invoice.grand_total) - (Number(invoice.received_amount) || 0))
          : Math.max(0, Number(splitObj?.credit) || 0);
        const projected = curBal + billCredit;
        if (projected > creditLimit) {
          const excess = projected - creditLimit;
          throw new Error(`Credit limit of ₹${creditLimit.toLocaleString('en-IN')} exceeded for ${matchedParty.name || 'Customer'}! Current balance: ₹${curBal.toLocaleString('en-IN')}, Bill credit: ₹${billCredit.toLocaleString('en-IN')}. Exceeds limit by ₹${excess.toLocaleString('en-IN')}.`);
        }
      }
    }

    const customerId = invoice.customer_id || upsertCustomerRecord(
      db,
      tenantId,
      invoice.customer_name,
      invoice.customer_phone,
      invoice.customer_address
    );

    const nowTimestamp = localTimestamp();
    const invStmt = db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, user_id, invoice_number, invoice_type, 
        subtotal, tax_total, discount_total, discount_type, discount_value, grand_total, 
        payment_method, split_details, received_amount, balance_amount, customer_name, customer_phone, customer_gstin, customer_state, customer_address, sync_status,
        scrap_deduction, scrap_invoice_number, return_deduction, return_invoice_number, customer_id,
        cgst_total, sgst_total, igst_total, supply_type, settled_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    invStmt.run(
      invoice.invoice_id,
      invoice.tenant_id,
      invoice.user_id,
      finalInvoiceNumber,
      invoice.invoice_type,
      invoice.subtotal,
      invoice.tax_total,
      invoice.discount_total,
      invoice.discount_type || 'FIXED',
      invoice.discount_value || 0,
      invoice.grand_total,
      invoice.payment_method || 'PENDING',
      typeof invoice.split_details === 'object' ? JSON.stringify(invoice.split_details) : (invoice.split_details || null),
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
      invoice.return_invoice_number || null,
      customerId || null,
      // GST split totals (Indian GST Act compliance)
      invoice.cgst_total ?? 0,
      invoice.sgst_total ?? 0,
      invoice.igst_total ?? 0,
      invoice.supply_type || 'INTRA',
      (invoice.payment_method && invoice.payment_method !== 'PENDING' && invoice.payment_method !== 'HOLD') ? nowTimestamp : null,
      nowTimestamp,
      nowTimestamp
    );

    // 2. Insert items and update stock
    const itemStmt = db.prepare(`
      INSERT INTO invoice_items (item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total, pieces_sold, is_service_item, combo_id, combo_details, billing_type, uom,
        cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, supply_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\' WHERE product_id = ?');
    const getDaStmt = db.prepare('SELECT domain_attributes FROM products WHERE product_id = ?');
    const updDaStmt = db.prepare('UPDATE products SET domain_attributes = ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?');

    for (const item of items) {
      const isCombo = Boolean(item.isCombo || item.combo_id || (item.combo_items && item.combo_items.length > 0));
      const comboId = item.combo_id || (isCombo ? item.product_id : null);
      const comboDetailsJson = item.combo_items ? JSON.stringify(item.combo_items) : null;

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
        item.pieces_sold ?? item.pieces_override ?? null,
        item.isServiceItem ? 1 : 0,
        comboId,
        comboDetailsJson,
        item.billing_type || null,
        item.uom || item.unit || null,
        // GST split per line item (Indian GST Act compliance)
        item.cgst_rate ?? 0,
        item.sgst_rate ?? 0,
        item.igst_rate ?? 0,
        item.cgst_amount ?? 0,
        item.sgst_amount ?? 0,
        item.igst_amount ?? 0,
        item.hsn_sac_code || null,
        item.supply_type || 'INTRA',
      );
      if (!item.isServiceItem) {
        if (isCombo && item.combo_items && Array.isArray(item.combo_items)) {
          for (const ci of item.combo_items) {
            const qtyToDeduct = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
            stockStmt.run(qtyToDeduct, ci.product_id);
          }
        } else {
          stockStmt.run(item.quantity, item.product_id);
        }

        if (item.pieces_sold) {
          const row = getDaStmt.get(item.product_id) as any;
          if (row?.domain_attributes) {
            try {
              const da = JSON.parse(row.domain_attributes);
              if (da.pcs !== undefined || da.pcs_stock !== undefined) {
                const nextPcs = Math.max(0, (Number(da.pcs_stock ?? da.pcs) || 0) - item.pieces_sold);
                da.pcs_stock = nextPcs;
                da.pcs = nextPcs;
                updDaStmt.run(JSON.stringify(da), item.product_id);
              }
            } catch {}
          }
        }
      }
    }

    // 3. Handle scrap credit deduction settlement & single-use validation
    if (invoice.scrap_invoice_number && Number(invoice.scrap_deduction) > 0) {
      const existingScrapTx = db.prepare(`
        SELECT payment_status FROM scrap_transactions
        WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0)
        LIMIT 1
      `).get(invoice.tenant_id, invoice.scrap_invoice_number) as any;

      if (existingScrapTx && existingScrapTx.payment_status === 'SETTLED') {
        throw new Error(`Scrap credit ${invoice.scrap_invoice_number} has already been redeemed.`);
      }

      db.prepare(`
        UPDATE scrap_transactions
        SET payment_status = 'SETTLED', sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND scrap_invoice_number = ?
      `).run(invoice.tenant_id, invoice.scrap_invoice_number);
    }

    // 4. Handle scrap items — create scrap transactions and update scrap stock
    if (scrap_items && scrap_items.length > 0) {
      const scrapTxStmt = db.prepare(`
        INSERT INTO scrap_transactions (transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, payment_status, sync_status, updated_at)
        VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
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
          `From invoice ${finalInvoiceNumber}`,
          invoice.scrap_invoice_number || null,
          scrap.payment_status || 'SETTLED'
        );
        scrapStockStmt.run(scrap.quantity, scrap.scrap_category_id);
      }
    }

    // If payment method is CREDIT, sync with parties and party_ledger
    syncInvoiceCreditLedger(db, {
      ...invoice,
      invoice_number: finalInvoiceNumber,
      received_amount: invoice.received_amount ?? 0,
      balance_amount: invoice.balance_amount ?? 0,
    });
    // Reset backfill cooldown so the next db:getParties call immediately
    // picks up this newly created credit entry.
    backfillLastRun = 0;
  });

  try {
    transaction();

    const newCash = getCashAmountFromInvoice(invoice);
    if (newCash > 0) {
      adjustCashDrawerForInvoice(db, invoice.tenant_id || 'global', localDate(), 0, newCash);
    } else {
      const scrapD = Number(invoice.scrap_deduction) || 0;
      const returnD = Number(invoice.return_deduction) || 0;
      const totalDeductions = scrapD + returnD;
      const sub = Number(invoice.subtotal) || 0;
      const tax = Number(invoice.tax_total) || 0;
      const disc = Number(invoice.discount_total) || 0;
      const ptsDisc = Number((invoice as any).points_redeemed_discount) || 0;
      const preDeductionTotal = Math.max(0, sub + tax - disc - ptsDisc);
      const netRefund = totalDeductions > preDeductionTotal ? totalDeductions - preDeductionTotal : 0;

      const pm = (invoice.payment_method || '').toUpperCase();
      if (netRefund > 0 && (pm === 'CASH' || pm === 'SPLIT')) {
        const todayDate = localDate();
        const drawer = getOpenCashDrawer(db, invoice.tenant_id || 'global', todayDate);
        if (drawer) {
          const txnId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, sync_status)
            VALUES (?, ?, ?, 'CASH_OUT', ?, 'CREDIT_REFUND', ?, ?, 'PENDING')
          `).run(
            txnId,
            invoice.tenant_id || 'global',
            drawer.drawer_id,
            netRefund,
            `Net cash refund for invoice ${finalInvoiceNumber}`,
            invoice.user_id || 'system'
          );
          const newCashOut = Number(drawer.cash_out) + netRefund;
          const newCurrentCash = Number(drawer.current_cash) - netRefund;
          const newExpectedClosing = Number(drawer.opening_balance) + Number(drawer.cash_sales) + Number(drawer.cash_in) - newCashOut;
          db.prepare(`
            UPDATE cash_drawer SET cash_out = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE drawer_id = ?
          `).run(newCashOut, newCurrentCash, newExpectedClosing, drawer.drawer_id);
        }
      }
    }

    // Trigger immediate background sync so the invoice appears on web portal instantly
    import('./sync/syncWorker.js').then(({ triggerUrgentInvoiceSync, runInitialSync }) => {
      triggerUrgentInvoiceSync().catch(e => console.error('[Main] Immediate urgent sync error:', e));
      runInitialSync().catch(e => console.error('[Main] Immediate sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));

    const res = { success: true, invoice_id: invoice.invoice_id, invoice_number: finalInvoiceNumber };
    recentCheckoutsCache.set(cacheKey, { timestamp: now, result: res });
    if (recentCheckoutsCache.size > 100) {
      for (const [k, v] of recentCheckoutsCache.entries()) {
        if (now - v.timestamp > 30000) recentCheckoutsCache.delete(k);
      }
    }

    return res;
  } catch (error: any) {
    console.error('[db:checkout]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

// ── Hold Bill IPC Handlers ────────────────────────────────────────────────
// Save current cart as a HOLD invoice: deducts stock, sets held_until = now + 24h
ipcMain.handle('db:holdBill', safeHandler((event, payload) => {
  const { items, ...invoice } = payload;
  const db = getDb();
  const transaction = db.transaction(() => {
    // Force a unique HLD invoice number for hold bills to avoid UNIQUE constraint conflicts with regular invoices
    let holdInvoiceNumber = invoice.invoice_number;
    if (!holdInvoiceNumber || !holdInvoiceNumber.includes('HLD')) {
      holdInvoiceNumber = `${(invoice.tenant_id || 'POS1').substring(0, 4).toUpperCase()}-HLD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // 1. Insert the invoice as a HOLD type
    const invStmt = db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, user_id, invoice_number, invoice_type, 
        subtotal, tax_total, discount_total, discount_type, discount_value, grand_total, 
        payment_method, received_amount, balance_amount, customer_name, customer_phone, 
        customer_gstin, customer_state, customer_address, sync_status,
        scrap_deduction, scrap_invoice_number, return_deduction, return_invoice_number,
        held_until, is_held, hold_note
      )
      VALUES (?, ?, ?, ?, 'HOLD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?, ?, datetime('now', '+24 hours', 'localtime'), 1, ?)
    `);
    invStmt.run(
      invoice.invoice_id,
      invoice.tenant_id,
      invoice.user_id,
      holdInvoiceNumber,
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
      invoice.return_invoice_number || null,
      invoice.hold_note || null
    );

    // 2. Insert items and DEDUCT stock (reserve the inventory for this hold)
    const itemStmt = db.prepare(`
      INSERT INTO invoice_items (item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total, pieces_sold, is_service_item, combo_id, combo_details, billing_type, uom)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)');

    for (const item of items) {
      const isCombo = Boolean(item.isCombo || item.combo_id || (item.combo_items && item.combo_items.length > 0));
      const comboId = item.combo_id || (isCombo ? item.product_id : null);
      const comboDetailsJson = item.combo_items ? JSON.stringify(item.combo_items) : null;

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
        item.pieces_sold ?? item.pieces_override ?? null,
        item.isServiceItem ? 1 : 0,
        comboId,
        comboDetailsJson,
        item.billing_type || null,
        item.uom || item.unit || null
      );
      if (!item.isServiceItem) {
        if (isCombo && item.combo_items && Array.isArray(item.combo_items)) {
          for (const ci of item.combo_items) {
            const qtyToDeduct = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
            stockStmt.run(qtyToDeduct, ci.product_id);
          }
        } else {
          stockStmt.run(item.quantity, item.product_id);
        }
      }
    }
  });

  try {
    transaction();
    return { success: true };
  } catch (error: any) {
    console.error('[db:holdBill]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

// Get all active (non-expired) held bills for a tenant
ipcMain.handle('db:getHeldBills', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM invoices 
      WHERE tenant_id = ? 
        AND invoice_type = 'HOLD' 
        AND is_held = 1 
        AND held_until > datetime('now', 'localtime')
      ORDER BY created_at DESC
    `).all(tenant_id);
  } catch (error: any) {
    console.error('[db:getHeldBills]', error);
    return { error: 'Operation failed' };
  }
});

// Get a specific held bill's full data for recall, restore stock, and mark as recalled
ipcMain.handle('db:recallHeldBill', (event, { invoice_id }: { invoice_id: string }) => {
  try {
    const db = getDb();
    if (!invoice_id) return { success: false, error: 'Missing invoice ID' };

    let resultInvoice: any = null;
    let resultItems: any[] = [];

    const transaction = db.transaction(() => {
      // 1. Get the held invoice
      resultInvoice = db.prepare(
        `SELECT * FROM invoices WHERE invoice_id = ? AND (invoice_type = 'HOLD' OR is_held = 1)`
      ).get(invoice_id) as any;

      if (!resultInvoice) {
        throw new Error('Held bill not found or already recalled');
      }

      // 2. Get line items
      resultItems = db.prepare(
        `SELECT ii.*, p.sku_barcode, p.brand_manufacturer, p.grade_id, p.pricing_mode, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price, 
                p.discount_percent, p.discount_flat, p.offer_price, p.purchase_price, p.base_price,
                p.tax_rate_percent as gst_percent, p.uom, p.hsn_sac_code as hsn, p.billing_type
         FROM invoice_items ii
         LEFT JOIN products p ON ii.product_id = p.product_id
         LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id
         WHERE ii.invoice_id = ?`
      ).all(invoice_id) as any[];

      // 3. Revert stock (add back stock reserved during hold)
      const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)');
      for (const item of resultItems) {
        if (!item.is_service_item) {
          if (item.combo_details) {
            try {
              const comboItems = JSON.parse(item.combo_details);
              if (Array.isArray(comboItems)) {
                for (const ci of comboItems) {
                  const qtyToRevert = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
                  stockStmt.run(qtyToRevert, ci.product_id);
                }
                continue;
              }
            } catch {}
          }
          if (item.product_id) {
            stockStmt.run(item.quantity, item.product_id);
          }
        }
      }

      // 4. Mark invoice as recalled / deleted so it disappears from held list & sales history
      db.prepare(`
        UPDATE invoices 
        SET is_held = 0, 
            invoice_type = 'RECALLED_HOLD',
            is_deleted = 1,
            sync_status = 'SYNCED', 
            updated_at = CURRENT_TIMESTAMP 
        WHERE invoice_id = ?
      `).run(invoice_id);
    });

    transaction();
    return { success: true, invoice: resultInvoice, items: resultItems };
  } catch (error: any) {
    console.error('[db:recallHeldBill]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
});

// Manually release a held bill — revert stock and mark as expired
ipcMain.handle('db:releaseHeldBill', (event, { invoice_id }: { invoice_id: string }) => {
  try {
    const db = getDb();
    const transaction = db.transaction(() => {
      // 1. Check it's a valid held bill
      const invoice = db.prepare(
        `SELECT * FROM invoices WHERE invoice_id = ? AND invoice_type = 'HOLD' AND is_held = 1`
      ).get(invoice_id) as any;
      if (!invoice) {
        throw new Error('Held bill not found');
      }

      // 2. Get items to revert stock
      const items = db.prepare(
        'SELECT product_id, quantity, is_service_item, combo_details FROM invoice_items WHERE invoice_id = ?'
      ).all(invoice_id) as any[];

      // 3. Revert stock (add back)
      const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)');
      for (const item of items) {
        if (!item.is_service_item) {
          if (item.combo_details) {
            try {
              const comboItems = JSON.parse(item.combo_details);
              if (Array.isArray(comboItems)) {
                for (const ci of comboItems) {
                  const qtyToRevert = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
                  stockStmt.run(qtyToRevert, ci.product_id);
                }
                continue;
              }
            } catch {}
          }
          if (item.product_id) {
            stockStmt.run(item.quantity, item.product_id);
          }
        }
      }

      // 4. Mark invoice as expired/held = 0, change type to track it (keep sync_status='SYNCED' so it stays out of the sync queue)
      db.prepare(`
        UPDATE invoices 
        SET is_held = 0, 
            invoice_type = 'EXPIRED_HOLD', 
            is_deleted = 1,
            sync_status = 'SYNCED', 
            updated_at = CURRENT_TIMESTAMP 
        WHERE invoice_id = ?
      `).run(invoice_id);
    });

    transaction();
    return { success: true };
  } catch (error: any) {
    console.error('[db:releaseHeldBill]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
});

// Auto-expire stale held bills — called on startup
ipcMain.handle('db:expireStaleHeldBills', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    let expiredCount = 0;

    const transaction = db.transaction(() => {
      // 1. Find all expired held bills
      const expired = db.prepare(`
        SELECT invoice_id FROM invoices 
        WHERE tenant_id = ? 
          AND (invoice_type = 'HOLD' OR is_held = 1)
          AND held_until <= datetime('now', 'localtime')
      `).all(tenant_id) as any[];

      for (const bill of expired) {
        // 2. Get items to revert stock
        const items = db.prepare(
          'SELECT product_id, quantity, is_service_item, combo_details FROM invoice_items WHERE invoice_id = ?'
        ).all(bill.invoice_id) as any[];

        // 3. Revert stock
        const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)');
        for (const item of items) {
          if (!item.is_service_item) {
            if (item.combo_details) {
              try {
                const comboItems = JSON.parse(item.combo_details);
                if (Array.isArray(comboItems)) {
                  for (const ci of comboItems) {
                    const qtyToRevert = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
                    stockStmt.run(qtyToRevert, ci.product_id);
                  }
                  continue;
                }
              } catch {}
            }
            if (item.product_id) {
              stockStmt.run(item.quantity, item.product_id);
            }
          }
        }

        // 4. Mark as expired & deleted
        db.prepare(`
          UPDATE invoices 
          SET is_held = 0, 
              invoice_type = 'EXPIRED_HOLD', 
              is_deleted = 1,
              sync_status = 'SYNCED', 
              updated_at = CURRENT_TIMESTAMP 
          WHERE invoice_id = ?
        `).run(bill.invoice_id);

        expiredCount++;
      }

      // Cleanup any non-held EXPIRED_HOLD or RECALLED_HOLD records so they never leak into queries
      db.prepare(`UPDATE invoices SET is_deleted = 1, is_held = 0 WHERE tenant_id = ? AND invoice_type IN ('EXPIRED_HOLD', 'RECALLED_HOLD') AND (is_deleted IS NULL OR is_deleted = 0)`).run(tenant_id);
    });

    transaction();
    if (expiredCount > 0) {
      console.log(`[Hold] Expired ${expiredCount} stale held bill(s) and reverted stock`);
    }
    return { success: true, expiredCount };
  } catch (error: any) {
    console.error('[db:expireStaleHeldBills]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// ── Payment Methods (BANK / CARD / UPI sources) ──────────────────────────────
ipcMain.handle('db:payments:getSources', (event, tenant_id: string) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    return db.prepare(`
      SELECT ps.*,
        (SELECT COUNT(*) FROM payment_source_transactions pst WHERE pst.source_id = ps.source_id) AS transaction_count,
        (SELECT MAX(pst.transaction_date) FROM payment_source_transactions pst WHERE pst.source_id = ps.source_id) AS last_transaction_date
      FROM payment_sources ps
      WHERE ps.tenant_id = ? AND ps.is_deleted = 0
      ORDER BY ps.type ASC, ps.sort_order ASC, ps.name COLLATE NOCASE ASC
    `).all(tenant_id);
  } catch (error: any) {
    console.error('[db:payments:getSources]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:payments:addSource', safeHandler((event, s: any) => {
  try {
    const db = getDb();
    if (!s?.tenant_id || !s?.name || !s?.type) return { success: false, error: 'tenant_id, name and type are required' };
    if (!['BANK', 'CARD', 'UPI'].includes(s.type)) return { success: false, error: 'type must be BANK, CARD or UPI' };

    const tx = db.transaction(() => {
      const opening = parseFloat(s.opening_balance) || 0;
      const makeDefault = s.is_default === true || s.is_default === 1;
      const source_id = s.source_id || crypto.randomUUID();

      if (makeDefault) {
        db.prepare(`UPDATE payment_sources SET is_default = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND type = ? AND is_deleted = 0`)
          .run(s.tenant_id, s.type);
      }

      db.prepare(`
        INSERT INTO payment_sources (source_id, tenant_id, name, type, bank_name, account_number, holder_name, upi_id, opening_balance, current_balance, is_default, is_enabled, sort_order, is_deleted, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        source_id, s.tenant_id, s.name.trim(), s.type,
        s.bank_name?.trim() || null, s.account_number?.trim() || null,
        s.holder_name?.trim() || null, s.upi_id?.trim() || null,
        opening, opening, makeDefault ? 1 : 0, s.is_enabled === false ? 0 : 1,
        s.sort_order ?? 0
      );

      if (opening > 0) {
        db.prepare(`
          INSERT INTO payment_source_transactions (transaction_id, tenant_id, source_id, type, amount, category, notes, transaction_date, running_balance, entered_by, entered_by_name, sync_status)
          VALUES (?, ?, ?, 'CASH_IN', ?, 'Opening Balance', ?, CURRENT_TIMESTAMP, ?, ?, ?, 'PENDING')
        `).run(
          crypto.randomUUID(), s.tenant_id, source_id, opening,
          `Opening balance for ${s.name.trim()}`, opening, s.created_by || null, s.created_by_name || null
        );
      }
      return source_id;
    });

    const source_id = tx();
    return { success: true, source_id };
  } catch (error: any) {
    console.error('[db:payments:addSource]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:payments:updateSource', safeHandler((event, s: any) => {
  try {
    const db = getDb();
    if (!s?.source_id || !s?.tenant_id) return { success: false, error: 'source_id and tenant_id are required' };

    const tx = db.transaction(() => {
      const existing = db.prepare(`SELECT * FROM payment_sources WHERE source_id = ? AND tenant_id = ? AND is_deleted = 0`).get(s.source_id, s.tenant_id) as any;
      if (!existing) throw new Error('Payment source not found');

      if (s.is_default === true) {
        db.prepare(`UPDATE payment_sources SET is_default = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND type = ? AND is_deleted = 0`)
          .run(s.tenant_id, existing.type);
      }

      let newOpening: number | null = null;
      if (s.opening_balance !== undefined) {
        const parsedOpening = parseFloat(s.opening_balance) || 0;
        if (parsedOpening !== Number(existing.opening_balance)) {
          const txCount = (db.prepare(`SELECT COUNT(*) as cnt FROM payment_source_transactions WHERE source_id = ?`).get(s.source_id) as any).cnt;
          if (txCount > 0) throw new Error('Opening balance can only be changed when there are no transactions on this source');
          newOpening = parsedOpening;
        }
      }

      db.prepare(`
        UPDATE payment_sources SET
          name = COALESCE(?, name),
          bank_name = ?, account_number = ?, holder_name = ?, upi_id = ?,
          is_enabled = COALESCE(?, is_enabled),
          is_default = COALESCE(?, is_default),
          sort_order = COALESCE(?, sort_order),
          opening_balance = COALESCE(?, opening_balance),
          current_balance = COALESCE(?, current_balance),
          sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE source_id = ? AND tenant_id = ?
      `).run(
        s.name?.trim() || null,
        s.bank_name !== undefined ? (s.bank_name?.trim() || null) : existing.bank_name,
        s.account_number !== undefined ? (s.account_number?.trim() || null) : existing.account_number,
        s.holder_name !== undefined ? (s.holder_name?.trim() || null) : existing.holder_name,
        s.upi_id !== undefined ? (s.upi_id?.trim() || null) : existing.upi_id,
        s.is_enabled !== undefined ? (s.is_enabled === true || s.is_enabled === 1 ? 1 : 0) : undefined,
        s.is_default !== undefined ? (s.is_default === true || s.is_default === 1 ? 1 : 0) : undefined,
        s.sort_order !== undefined ? s.sort_order : undefined,
        newOpening,
        newOpening !== null ? newOpening : undefined,
        s.source_id, s.tenant_id
      );

      if (newOpening !== null) {
        db.prepare(`UPDATE payment_source_transactions SET amount = ?, running_balance = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE source_id = ? AND category = 'Opening Balance' AND tenant_id = ?`)
          .run(newOpening, newOpening, s.source_id, s.tenant_id);
      }
    });

    tx();
    return { success: true };
  } catch (error: any) {
    console.error('[db:payments:updateSource]', error);
    if (error.message?.includes('Opening balance')) return { success: false, error: error.message };
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:payments:deleteSource', (event, { source_id, tenant_id }: { source_id: string; tenant_id: string }) => {
  try {
    const db = getDb();
    const result = db.prepare(`UPDATE payment_sources SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE source_id = ? AND tenant_id = ?`)
      .run(source_id, tenant_id);
    if (result.changes === 0) return { success: false, error: 'Payment source not found' };
    return { success: true };
  } catch (error: any) {
    console.error('[db:payments:deleteSource]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:payments:getTransactions', (event, { source_id, tenant_id }: { source_id: string; tenant_id: string }) => {
  try {
    const db = getDb();
    if (!source_id || !tenant_id) return [];
    return db.prepare(`
      SELECT * FROM payment_source_transactions
      WHERE source_id = ? AND tenant_id = ?
      ORDER BY transaction_date DESC, created_at DESC
      LIMIT 500
    `).all(source_id, tenant_id);
  } catch (error: any) {
    console.error('[db:payments:getTransactions]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:payments:addTransaction', safeHandler((event, t: any) => {
  try {
    const db = getDb();
    if (!t?.tenant_id || !t?.source_id) return { success: false, error: 'tenant_id and source_id are required' };
    if (!['CASH_IN', 'CASH_OUT'].includes(t.type)) return { success: false, error: 'type must be CASH_IN or CASH_OUT' };
    const amount = Number(t.amount);
    if (!isFinite(amount) || amount <= 0) return { success: false, error: 'amount must be a positive number' };

    const tx = db.transaction(() => {
      const source = db.prepare(`SELECT * FROM payment_sources WHERE source_id = ? AND tenant_id = ? AND is_deleted = 0`).get(t.source_id, t.tenant_id) as any;
      if (!source) throw new Error('Payment source not found');

      const currentBalance = Number(source.current_balance) || 0;
      const newBalance = t.type === 'CASH_IN' ? currentBalance + amount : currentBalance - amount;

      db.prepare(`
        INSERT INTO payment_source_transactions (transaction_id, tenant_id, source_id, type, amount, category, notes, reference_number, transaction_date, running_balance, entered_by, entered_by_name, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, 'PENDING')
      `).run(
        t.transaction_id || crypto.randomUUID(), t.tenant_id, t.source_id, t.type, amount,
        t.category?.trim() || null, t.notes?.trim() || null, t.reference_number?.trim() || null,
        t.transaction_date || null, newBalance, t.entered_by || null, t.entered_by_name || null
      );

      db.prepare(`UPDATE payment_sources SET current_balance = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE source_id = ? AND tenant_id = ?`)
        .run(newBalance, t.source_id, t.tenant_id);

      return newBalance;
    });

    const balance = tx();
    return { success: true, balance };
  } catch (error: any) {
    console.error('[db:payments:addTransaction]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

// ── Diagnostic: Clear stuck PENDING sync records ─────────────────────────────
ipcMain.handle('sync:clearPending', async (event, { tenant_id, type, records }: { tenant_id: string; type: 'invoices' | 'products' | 'all'; records?: string[] }) => {
  try {
    const db = getDb();
    
    if (type === 'invoices' || type === 'all') {
      if (records && records.length > 0) {
        const placeholders = records.map(() => '?').join(',');
        db.prepare(`UPDATE invoices SET sync_status = 'SYNCED' WHERE invoice_id IN (${placeholders}) AND tenant_id = ?`).run(...records, tenant_id);
        console.log(`[Sync] Force-cleared ${records.length} stuck invoice(s) from sync queue`);
      }
    }
    
    if (type === 'products' || type === 'all') {
      if (records && records.length > 0) {
        const placeholders = records.map(() => '?').join(',');
        db.prepare(`UPDATE products SET sync_status = 'SYNCED' WHERE product_id IN (${placeholders}) AND tenant_id = ?`).run(...records, tenant_id);
        console.log(`[Sync] Force-cleared ${records.length} stuck product(s) from sync queue`);
      }
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('[sync:clearPending]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
});

// ── Diagnostic: Get stuck PENDING sync records ────────────────────────────────
ipcMain.handle('sync:getPending', async (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const invoices = db.prepare(
      `SELECT invoice_id, invoice_number, invoice_type, balance_amount, received_amount, 
              grand_total, subtotal, sync_status, created_at 
       FROM invoices WHERE sync_status = 'PENDING' AND tenant_id = ?`
    ).all(tenant_id);
    const products = db.prepare(
      `SELECT product_id, name, print_status, sync_status, created_at 
       FROM products WHERE sync_status = 'PENDING' AND tenant_id = ?`
    ).all(tenant_id);
    return { success: true, pending: { invoices, products } };
  } catch (error: any) {
    console.error('[sync:getPending]', error);
    return { success: false, error: error.message || 'Operation failed' };
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
    console.error('[db:applyInvoiceDiscount]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getInvoices', (event, filters?: { user_id?: string; tenant_id?: string; role?: string; limit?: number; offset?: number; search?: string; payment_method?: string; invoice_type?: string; filterDate?: string; filterDateEnd?: string; tax_rate_percent?: string; only_user_invoices?: boolean }) => {
  try {
    const db = getDb();
    const { user_id, tenant_id, role, limit, offset, search, payment_method, invoice_type, filterDate, filterDateEnd, tax_rate_percent } = filters || {};

    if (!tenant_id) {
      return []; // Safety: always require tenant_id
    }

    let query = `
      SELECT i.*, u.name as biller_name,
        COALESCE((SELECT COUNT(*) FROM invoice_items ii WHERE ii.invoice_id = i.invoice_id), 0) as item_count
      FROM invoices i 
      LEFT JOIN users u ON i.user_id = u.user_id 
      WHERE i.tenant_id = ? 
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (i.is_held IS NULL OR i.is_held = 0)
    `;
    const params: any[] = [tenant_id];

    // Only filter by user_id if explicitly requested (e.g. only_user_invoices flag)
    if (filters?.only_user_invoices && user_id) {
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
    } else if (invoice_type === 'GST') {
      query += " AND i.invoice_type = 'GST'";
    }

    if (tax_rate_percent !== undefined && tax_rate_percent !== '') {
      const targetRate = parseFloat(tax_rate_percent);
      if (!isNaN(targetRate)) {
        query += ` AND EXISTS (
          SELECT 1 FROM invoice_items ii
          WHERE ii.invoice_id = i.invoice_id
            AND (
              ROUND(COALESCE(ii.cgst_rate, 0) + COALESCE(ii.sgst_rate, 0) + COALESCE(ii.igst_rate, 0)) = ?
              OR (ii.total > 0 AND ROUND((ii.tax_amount / ii.total) * 100.0) = ?)
            )
        )`;
        params.push(targetRate, targetRate);
      }
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

    const results = db.prepare(query).all(...params);
    console.log(`[db:getInvoices] Returned ${results.length} invoices for tenant_id=${tenant_id} filterDate=${filterDate||'any'} offset=${offset||0}`);
    return results;
  } catch (error: any) {
    console.error('[db:getInvoices] Error fetching invoices:', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getInvoicesSummary', (event, filters?: { user_id?: string; tenant_id?: string; role?: string; search?: string; payment_method?: string; invoice_type?: string; filterDate?: string; filterDateEnd?: string; tax_rate_percent?: string; only_user_invoices?: boolean }) => {
  try {
    const db = getDb();
    const { user_id, tenant_id, role, search, payment_method, invoice_type, filterDate, filterDateEnd, tax_rate_percent } = filters || {};

    if (!tenant_id) {
      return { totalSales: 0, totalInvoices: 0, totalTax: 0, totalDiscount: 0, avgOrder: 0 };
    }

    let query = `
      SELECT 
        COALESCE(SUM(CASE WHEN i.converted_to_invoice_id IS NULL THEN 
          MIN(i.grand_total, MAX(0, COALESCE(i.subtotal, 0) + COALESCE(i.tax_total, 0) - COALESCE(i.discount_total, 0) - COALESCE(i.points_redeemed_discount, 0) - COALESCE(i.scrap_deduction, 0) - COALESCE(i.return_deduction, 0)))
        ELSE 0 END), 0) as totalSales,
        COUNT(CASE WHEN i.converted_to_invoice_id IS NULL THEN 1 END) as totalInvoices,
        COALESCE(SUM(CASE WHEN i.converted_to_invoice_id IS NULL THEN i.tax_total ELSE 0 END), 0) as totalTax,
        COALESCE(SUM(CASE WHEN i.converted_to_invoice_id IS NULL THEN i.discount_total ELSE 0 END), 0) as totalDiscount
      FROM invoices i 
      WHERE i.tenant_id = ? 
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (i.is_held IS NULL OR i.is_held = 0)
    `;
    const params: any[] = [tenant_id];

    if (filters?.only_user_invoices && user_id) {
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
    } else if (invoice_type === 'GST') {
      query += " AND i.invoice_type = 'GST'";
    }

    if (tax_rate_percent !== undefined && tax_rate_percent !== '') {
      const targetRate = parseFloat(tax_rate_percent);
      if (!isNaN(targetRate)) {
        query += ` AND EXISTS (
          SELECT 1 FROM invoice_items ii
          WHERE ii.invoice_id = i.invoice_id
            AND (
              ROUND(COALESCE(ii.cgst_rate, 0) + COALESCE(ii.sgst_rate, 0) + COALESCE(ii.igst_rate, 0)) = ?
              OR (ii.total > 0 AND ROUND((ii.tax_amount / ii.total) * 100.0) = ?)
            )
        )`;
        params.push(targetRate, targetRate);
      }
    }

    if (filterDate) {
      query += ' AND i.created_at >= ?';
      params.push(filterDate);
    }
    if (filterDateEnd) {
      query += ' AND i.created_at <= ?';
      params.push(filterDateEnd + ' 23:59:59');
    }

    const row = db.prepare(query).get(...params) as any;
    const totalSales = row ? Number(row.totalSales) || 0 : 0;
    const totalInvoices = row ? Number(row.totalInvoices) || 0 : 0;
    const totalTax = row ? Number(row.totalTax) || 0 : 0;
    const totalDiscount = row ? Number(row.totalDiscount) || 0 : 0;
    const avgOrder = totalInvoices > 0 ? totalSales / totalInvoices : 0;

    return { totalSales, totalInvoices, totalTax, totalDiscount, avgOrder };
  } catch (error: any) {
    console.error('[db:getInvoicesSummary] Error:', error);
    return { totalSales: 0, totalInvoices: 0, totalTax: 0, totalDiscount: 0, avgOrder: 0 };
  }
});

ipcMain.handle('db:getDashboardStats', (event, tenantId: string) => {
  try {
    const db = getDb();
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const row = db.prepare(`
      SELECT COALESCE(SUM(MIN(grand_total, MAX(0, COALESCE(subtotal, 0) + COALESCE(tax_total, 0) - COALESCE(discount_total, 0) - COALESCE(points_redeemed_discount, 0) - COALESCE(scrap_deduction, 0) - COALESCE(return_deduction, 0)))), 0) as totalSales, COUNT(*) as invoiceCount
      FROM invoices
      WHERE tenant_id = ? 
        AND created_at >= ? 
        AND converted_to_invoice_id IS NULL 
        AND (is_deleted IS NULL OR is_deleted = 0 OR is_deleted = '0' OR is_deleted = '0.0' OR is_deleted = 0.0)
        AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (is_held IS NULL OR is_held = 0)
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
  received_amount?: number;
  balance_amount?: number;
  customer_name?: string;
  customer_phone?: string;
  customer_gstin?: string;
  customer_state?: string;
  customer_address?: string;
  scrap_deduction?: number;
  scrap_invoice_number?: string;
  return_deduction?: number;
  return_invoice_number?: string;
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
  // Only OWNER or ADMINISTRATOR can update invoices
  if (payload.role !== 'OWNER' && payload.role !== 'ADMINISTRATOR') {
    return { success: false, error: 'Only owners or administrators can edit past bills' };
  }
  const { items, ...invoice } = payload;
  const db = getDb();
  const existingInv = db.prepare(`SELECT invoice_number, invoice_type, tenant_id, payment_method, received_amount, balance_amount, grand_total, split_details, created_at FROM invoices WHERE invoice_id = ?`).get(payload.invoice_id) as any;
  const oldCash = existingInv ? getCashAmountFromInvoice(existingInv) : 0;

  const finalReceivedAmount = payload.received_amount !== undefined ? payload.received_amount : (existingInv?.received_amount ?? null);
  const finalBalanceAmount = payload.balance_amount !== undefined ? payload.balance_amount : (existingInv?.balance_amount ?? null);

  const transaction = db.transaction(() => {
    const customerId = upsertCustomerRecord(
      db,
      payload.tenant_id || 'global',
      invoice.customer_name,
      invoice.customer_phone,
      invoice.customer_address
    );

    // 1. Get old items for stock adjustment
    const oldItems = db.prepare('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = ?').all(payload.invoice_id) as any[];

    // 2. Update invoice header
    db.prepare(`
      UPDATE invoices SET
        subtotal = ?, tax_total = ?, discount_total = ?, discount_type = ?,
        discount_value = ?, grand_total = ?, payment_method = ?,
        received_amount = ?, balance_amount = ?, split_details = ?,
        customer_name = ?, customer_phone = ?, customer_gstin = ?, customer_state = ?, customer_address = ?,
        scrap_deduction = ?, scrap_invoice_number = ?, return_deduction = ?, return_invoice_number = ?,
        customer_id = ?, cgst_total = ?, sgst_total = ?, igst_total = ?, supply_type = ?,
        sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE invoice_id = ?
    `).run(
      invoice.subtotal, invoice.tax_total, invoice.discount_total,
      invoice.discount_type || 'FIXED', invoice.discount_value || 0,
      invoice.grand_total, invoice.payment_method || 'PENDING',
      finalReceivedAmount, finalBalanceAmount,
      typeof (invoice as any).split_details === 'object' ? JSON.stringify((invoice as any).split_details) : ((invoice as any).split_details || null),
      invoice.customer_name || null, invoice.customer_phone || null,
      invoice.customer_gstin || null, invoice.customer_state || null,
      invoice.customer_address || null,
      invoice.scrap_deduction ?? 0, invoice.scrap_invoice_number || null,
      invoice.return_deduction ?? 0, invoice.return_invoice_number || null,
      customerId || null,
      (invoice as any).cgst_total ?? 0, (invoice as any).sgst_total ?? 0,
      (invoice as any).igst_total ?? 0, (invoice as any).supply_type || 'INTRA',
      payload.invoice_id
    );

    // 3. Delete old items
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(payload.invoice_id);

    // 4. Insert new items
    const itemStmt = db.prepare(`
      INSERT INTO invoice_items (item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total, pieces_sold, is_service_item, billing_type, uom,
        cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, supply_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of (items || [])) {
      itemStmt.run(
        item.item_id || crypto.randomUUID(),
        payload.invoice_id,
        payload.tenant_id || 'global',
        item.product_id || '',
        item.name || 'Product',
        item.quantity ?? 1,
        item.unit_price ?? 0,
        item.tax_amount ?? 0,
        item.total ?? 0,
        (item as any).pieces_sold ?? (item as any).pieces_override ?? null,
        (item as any).isServiceItem ? 1 : 0,
        (item as any).billing_type || null,
        (item as any).uom || (item as any).unit || null,
        (item as any).cgst_rate ?? 0,
        (item as any).sgst_rate ?? 0,
        (item as any).igst_rate ?? 0,
        (item as any).cgst_amount ?? 0,
        (item as any).sgst_amount ?? 0,
        (item as any).igst_amount ?? 0,
        (item as any).hsn_sac_code || null,
        (item as any).supply_type || (invoice as any).supply_type || 'INTRA',
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

    // Sync party credit ledger
    syncInvoiceCreditLedger(db, {
      invoice_id: payload.invoice_id,
      tenant_id: payload.tenant_id,
      invoice_number: existingInv.invoice_number,
      invoice_type: existingInv.invoice_type,
      grand_total: invoice.grand_total,
      payment_method: invoice.payment_method,
      received_amount: finalReceivedAmount,
      balance_amount: finalBalanceAmount,
      customer_name: invoice.customer_name,
      customer_phone: invoice.customer_phone,
      customer_address: invoice.customer_address,
      customer_gstin: invoice.customer_gstin,
      user_id: payload.role,
      user_name: payload.role,
      created_at: existingInv.created_at,
    });
    backfillLastRun = 0; // reset so next db:getParties re-scans
  });

  try {
    transaction();

    const newCash = getCashAmountFromInvoice(payload);
    if (existingInv) {
      adjustCashDrawerForInvoice(db, existingInv.tenant_id || payload.tenant_id, existingInv.created_at, oldCash, newCash);
    }

    import('./sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Invoice update sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
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
  split_details?: any;
}) => {
  try {
    const db = getDb();
    const existingInv = db.prepare(`SELECT tenant_id, payment_method, received_amount, grand_total, split_details, created_at, invoice_number, invoice_type, customer_name, customer_phone, customer_address, customer_gstin FROM invoices WHERE invoice_id = ?`).get(payload.invoice_id) as any;
    if (!existingInv) {
      return { success: false, error: 'Invoice not found' };
    }
    const oldCash = getCashAmountFromInvoice(existingInv);

    const splitDetailsVal = payload.split_details ? (typeof payload.split_details === 'object' ? JSON.stringify(payload.split_details) : payload.split_details) : null;

    db.prepare(`
      UPDATE invoices SET
        payment_method = ?,
        received_amount = ?,
        balance_amount = ?,
        split_details = COALESCE(?, split_details),
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
      WHERE invoice_id = ?
    `).run(
      payload.payment_method,
      payload.received_amount,
      payload.balance_amount,
      splitDetailsVal,
      payload.invoice_id
    );

    const updatedInvObj = {
      ...existingInv,
      payment_method: payload.payment_method,
      received_amount: payload.received_amount,
      split_details: payload.split_details ?? existingInv.split_details,
    };
    const newCash = getCashAmountFromInvoice(updatedInvObj);

    adjustCashDrawerForInvoice(db, existingInv.tenant_id || payload.tenant_id, existingInv.created_at, oldCash, newCash);

    syncInvoiceCreditLedger(db, {
      invoice_id: payload.invoice_id,
      tenant_id: existingInv.tenant_id || payload.tenant_id,
      invoice_number: existingInv.invoice_number,
      invoice_type: existingInv.invoice_type,
      grand_total: existingInv.grand_total,
      payment_method: payload.payment_method,
      received_amount: payload.received_amount,
      balance_amount: payload.balance_amount,
      customer_name: existingInv.customer_name,
      customer_phone: existingInv.customer_phone,
      customer_address: existingInv.customer_address,
      customer_gstin: existingInv.customer_gstin,
      created_at: existingInv.created_at,
    });
    backfillLastRun = 0; // reset so next db:getParties re-scans

    import('./sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Invoice payment update sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
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
  adjusted_amount?: number;
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
    if (returnData.customer_name || returnData.customer_phone) {
      upsertCustomerRecord(db, returnData.tenant_id || 'global', returnData.customer_name, returnData.customer_phone, null);
    }
    db.prepare(`
      INSERT INTO returns (return_id, invoice_id, tenant_id, user_id, return_number, customer_name, customer_phone, subtotal, tax_total, grand_total, reason, refund_method, adjusted_invoice_number, adjusted_amount, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      returnData.return_id, returnData.invoice_id, returnData.tenant_id, returnData.user_id || null,
      returnData.return_number, returnData.customer_name || null, returnData.customer_phone || null,
      returnData.subtotal, returnData.tax_total, returnData.grand_total, returnData.reason || null,
      returnData.refund_method || null, returnData.adjusted_invoice_number || null,
      returnData.adjusted_amount ?? 0
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

    if (returnData.refund_method === 'CASH' && Number(returnData.grand_total) > 0) {
      const todayDate = localDate();
      const drawer = getOpenCashDrawer(db, returnData.tenant_id, todayDate);
      if (drawer) {
        const existingTx = db.prepare(`SELECT transaction_id FROM cash_transactions WHERE drawer_id = ? AND category = 'RETURN_REFUND' AND notes LIKE ?`).get(drawer.drawer_id, `%${returnData.return_number}%`);
        if (!existingTx) {
          const txnId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, sync_status)
            VALUES (?, ?, ?, 'CASH_OUT', ?, 'RETURN_REFUND', ?, ?, 'PENDING')
          `).run(
            txnId,
            returnData.tenant_id,
            drawer.drawer_id,
            Number(returnData.grand_total),
            `Return refund for ${returnData.return_number}`,
            returnData.user_id || 'system'
          );
          const newCashOut = Number(drawer.cash_out) + Number(returnData.grand_total);
          const newCurrentCash = Number(drawer.current_cash) - Number(returnData.grand_total);
          const newExpectedClosing = Number(drawer.opening_balance) + Number(drawer.cash_sales) + Number(drawer.cash_in) - newCashOut;
          db.prepare(`
            UPDATE cash_drawer SET cash_out = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE drawer_id = ?
          `).run(newCashOut, newCurrentCash, newExpectedClosing, drawer.drawer_id);
        }
      }
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

// Return-mode invoice search — only returns bills that still have at least one
// item with remaining returnable quantity (fully returned bills are excluded).
ipcMain.handle('db:getReturnableInvoices', safeHandler((event, { tenant_id, search, limit = 10, role, user_id }: { tenant_id: string; search?: string; limit?: number; role?: string; user_id?: string }) => {
  const db = getDb();
  let query = `
    SELECT i.*, u.name as biller_name
    FROM invoices i
    LEFT JOIN users u ON i.user_id = u.user_id
    WHERE i.tenant_id = ?
      AND i.invoice_type NOT IN ('SCRAP', 'RETURN')
      AND EXISTS (
        SELECT 1 FROM invoice_items ii
        WHERE ii.invoice_id = i.invoice_id
          AND ii.quantity > COALESCE((
            SELECT SUM(ri.quantity) FROM return_items ri
            WHERE ri.invoice_item_id = ii.item_id
          ), 0)
      )
  `;
  const params: any[] = [tenant_id];

  if (role === 'BILLER' && user_id) {
    query += ' AND i.user_id = ?';
    params.push(user_id);
  }

  if (search) {
    query += ' AND (i.invoice_number LIKE ? OR i.customer_name LIKE ? OR i.customer_phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY i.created_at DESC, i.invoice_id ASC';
  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  return db.prepare(query).all(...params);
}));

ipcMain.handle('db:getReturnInvoiceByNumber', safeHandler((event, { tenant_id, return_number }: { tenant_id: string; return_number: string }) => {
  const db = getDb();
  const q = String(return_number || '').trim();
  if (!q) return null;
  const qNum = (q.match(/\d+/g) || []).join('');

  // 1. Direct match by exact return_number
  let row = db.prepare('SELECT * FROM returns WHERE tenant_id = ? AND return_number = ?').get(tenant_id, q);
  if (row) return row;

  // 2. Direct match by common prefixes
  row = db.prepare('SELECT * FROM returns WHERE tenant_id = ? AND (return_number = ? OR return_number = ?)').get(tenant_id, `RET-${q}`, `RTN-${q}`);
  if (row) return row;

  // 3. Fallback: match by numeric part
  if (qNum) {
    const list = db.prepare('SELECT * FROM returns WHERE tenant_id = ? AND grand_total > COALESCE(adjusted_amount, 0)').all(tenant_id) as any[];
    const match = list.find((r: any) => {
      const numStr = (String(r.return_number || '').match(/\d+/g) || []).join('');
      return numStr === qNum || Number(numStr) === Number(qNum) || numStr.endsWith(qNum);
    });
    if (match) return match;
  }
  return null;
}));

ipcMain.handle('db:getPendingReturnInvoices', safeHandler((event, { tenant_id, search }: { tenant_id: string; search?: string }) => {
  const db = getDb();
  let query = `
    SELECT * FROM returns 
    WHERE tenant_id = ? 
      AND (refund_method = 'ADJUST_BILL' OR refund_method IS NULL OR refund_method = '')
      AND grand_total > COALESCE(adjusted_amount, 0)
  `;
  const params: any[] = [tenant_id];
  if (search) {
    query += ' AND (return_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY created_at DESC LIMIT 50';
  return db.prepare(query).all(...params);
}));

// Accumulate partial ADJUST_BILL consumption. adjusted_amount tracks how much of
// the return credit has been used across bills; the return stays pending until
// adjusted_amount >= grand_total. adjusted_invoice_number records the last invoice
// that consumed part of the credit.
ipcMain.handle('db:settleReturnInvoice', safeHandler((event, { tenant_id, return_number, adjusted_invoice_number, amount }: { tenant_id: string; return_number: string; adjusted_invoice_number: string; amount: number }) => {
  const db = getDb();
  const amt = Math.max(0, Number(amount) || 0);
  if (amt <= 0) return { success: false, error: 'Invalid adjustment amount' };
  const res = db.prepare(`
    UPDATE returns 
    SET adjusted_amount = COALESCE(adjusted_amount, 0) + ?,
        adjusted_invoice_number = ?,
        sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = ? AND return_number = ? AND grand_total > COALESCE(adjusted_amount, 0)
  `).run(amt, adjusted_invoice_number, tenant_id, return_number);
  if (res.changes === 0) return { success: false, error: 'Return not found or already fully adjusted' };
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
      try {
        const cfg = JSON.parse(confRow.value);
        let rawPrefix = cfg.prefix && /[A-Z0-9]/i.test(cfg.prefix) ? cfg.prefix : defaultPrefix;
        if (rawPrefix.includes('-RTN-')) {
          rawPrefix = `${terminalCode}-RTN-`;
        }
        prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
        counter = typeof cfg.counter === 'number' ? cfg.counter : 1;
      } catch {
        // Invalid JSON — use defaults
      }
    }
    const usedRows: any[] = db.prepare('SELECT return_number FROM returns WHERE return_number LIKE ?').all(`${prefix}%`);
    let maxUsed = 0;
    for (const row of usedRows) {
      const usedNum = parseInt(String(row.return_number).slice(prefix.length), 10);
      if (!isNaN(usedNum) && usedNum > maxUsed) maxUsed = usedNum;
    }
    const nextCounter = Math.max(counter, maxUsed + 1);
    const returnNumber = `${prefix}${String(nextCounter).padStart(3, '0')}`;
    db.prepare(`INSERT INTO settings (tenant_id, key, value, sync_status, updated_at) VALUES ('global', 'return_counter', ?, 'LOCAL', CURRENT_TIMESTAMP) ON CONFLICT(tenant_id, key) DO UPDATE SET value = EXCLUDED.value, sync_status = 'LOCAL', updated_at = CURRENT_TIMESTAMP`).run(JSON.stringify({ prefix, counter: nextCounter + 1 }));
    return { success: true, returnNumber };
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
    const sanitized = payload.prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
    prefix = sanitized && /[A-Z0-9]/i.test(sanitized) ? sanitized : defaultPrefix;
  } else if (confRow) {
    try {
      const cfg = JSON.parse(confRow.value);
      let rawPrefix = cfg.prefix && /[A-Z0-9]/i.test(cfg.prefix) ? cfg.prefix : defaultPrefix;
      if (rawPrefix.includes('-RTN-')) {
        rawPrefix = `${terminalCode}-RTN-`;
      }
      prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
      counter = typeof cfg.counter === 'number' ? cfg.counter : 1;
    } catch {
      // Invalid JSON — use defaults
    }
  }
  const usedRows: any[] = db.prepare('SELECT return_number FROM returns WHERE return_number LIKE ?').all(`${prefix}%`);
  let maxUsed = 0;
  for (const row of usedRows) {
    const usedNum = parseInt(String(row.return_number).slice(prefix.length), 10);
    if (!isNaN(usedNum) && usedNum > maxUsed) maxUsed = usedNum;
  }
  const nextCounter = Math.max(counter, maxUsed + 1);
  return { success: true, returnNumber: `${prefix}${String(nextCounter).padStart(3, '0')}` };
}));

ipcMain.handle('db:convertBosToGst', (event, payload: {
  invoice_ids: string[];
  tenant_id: string;
  user_id: string;
}) => {
  try {
    console.log('[convertBosToGst] Starting conversion for', payload.invoice_ids.length, 'invoices');
    const db = getDb();

    // Some settings are stored raw (server-synced) and some JSON-encoded — parse both.
    const parseSetting = (row: any): any => {
      if (!row) return null;
      try { return JSON.parse(row.value); } catch { return row.value; }
    };

    // Get shop state
    const shopStateRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(payload.tenant_id || 'global', 'shop_state');
    const shopState: string = shopStateRow ? (parseSetting(shopStateRow) || 'KL') : 'KL';

    // Get profit percentage
    const profitPctRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(payload.tenant_id || 'global', 'gst_profit_percentage');
    const profitPercentage = profitPctRow ? Number(parseSetting(profitPctRow) || 0) || 30 : 30;
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
          if (inv.converted_to_invoice_id) throw new Error('Invoice is already converted');

          const oldInvoiceNumber = inv.invoice_number;

          // Check if three invoice series is enabled
          const tripleSeriesRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'three_invoice_series');
          const tripleSeries = tripleSeriesRow ? parseSetting(tripleSeriesRow) : null;

          let configKey = 'invoice_counter_config';

          if (tripleSeries && tripleSeries.enabled) {
            const isB2B = inv.customer_gstin && inv.customer_gstin.trim() !== '';
            configKey = isB2B ? 'gst_b2b_invoice_counter_config' : 'gst_b2c_invoice_counter_config';
          } else {
            // Fallback to old dual series check
            const dualSeriesRow2: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'dual_invoice_series');
            const dualSeries2 = dualSeriesRow2 ? parseSetting(dualSeriesRow2) : null;
            if (dualSeries2 && dualSeries2.enabled) {
              configKey = 'gst_invoice_counter_config';
            }
          }

          const { invoiceNumber: newInvoiceNumber } = getGuaranteedNextInvoiceNumber(db, payload.tenant_id, configKey);

          // Get invoice items
          const items: any[] = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice_id);

          let newSubtotal = 0;
          let newTotalTax = 0;
          const copyItems: { item_id: string; source_item_id: string; product_id: string; name: string; quantity: number; is_service_item: number; newUnitPrice: number; newTotal: number; newTaxAmount: number; bosUnitPrice: number; bosTax: number; bosTotal: number; qtyFromPaper: number }[] = [];
          const skippedItems: string[] = [];

          for (const item of items) {
            const cleanName = item.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '').trim();
            const gstProduct = db.prepare(`
              SELECT * FROM products 
              WHERE tenant_id = ? 
                AND (name = ? OR name = ?) 
                AND is_deleted = 0
              ORDER BY (CASE WHEN name LIKE '%(GST)' THEN 1 ELSE 2 END) ASC
              LIMIT 1
            `).get(payload.tenant_id, cleanName + ' (GST)', cleanName) as any;

            if (!gstProduct || gstProduct.is_gst_applicable === 0) {
              skippedItems.push(`${item.name || item.product_id} (Estimate-only product skipped)`);
              continue;
            }

            const originalQty = Number(item.quantity) || 0;

            // Compute available paper (dummy) GST stock for this product:
            const paperPurchasedRow = db.prepare(`
              SELECT COALESCE(SUM(pbi.quantity), 0) as total_paper
              FROM purchase_bill_items pbi
              JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
              WHERE pbi.product_id = ? AND pb.bill_type = 'GST' AND pbi.skip_stock_update = 1 AND pb.tenant_id = ?
            `).get(gstProduct.product_id, payload.tenant_id) as any;
            const totalPaperPurchased = paperPurchasedRow ? Number(paperPurchasedRow.total_paper) : 0;

            const paperSoldRow = db.prepare(`
              SELECT COALESCE(SUM(ii.qty_from_paper_stock), 0) as total_paper_sold
              FROM invoice_items ii
              JOIN invoices i ON ii.invoice_id = i.invoice_id
              WHERE ii.product_id = ? AND i.invoice_type = 'GST' AND ii.tenant_id = ?
            `).get(gstProduct.product_id, payload.tenant_id) as any;
            const totalPaperSold = paperSoldRow ? Number(paperSoldRow.total_paper_sold) : 0;

            const availablePaperGst = Math.max(0, totalPaperPurchased - totalPaperSold);
            const qtyToConvert = Math.min(originalQty, availablePaperGst);

            if (qtyToConvert <= 0) {
              skippedItems.push(`${item.name || item.product_id} (No available paper stock - 0 of ${originalQty} converted)`);
              continue;
            }

            const taxRate = Number(gstProduct.tax_rate_percent) || 0;
            const newUnitPrice = gstProduct.offer_price && Number(gstProduct.offer_price) > 0
              ? Number(gstProduct.offer_price)
              : Number(gstProduct.base_price);

            const newTotal = Math.round(newUnitPrice * qtyToConvert * 100) / 100;
            newSubtotal += newTotal;
            const itemTax = Math.round(newTotal * (taxRate / 100) * 100) / 100;
            newTotalTax += itemTax;

            copyItems.push({
              item_id: crypto.randomUUID(),
              source_item_id: item.item_id,
              product_id: gstProduct.product_id,
              name: gstProduct.name,
              quantity: qtyToConvert,
              is_service_item: item.is_service_item ? 1 : 0,
              newUnitPrice,
              newTotal,
              newTaxAmount: itemTax,
              bosUnitPrice: Number(item.unit_price) || 0,
              bosTax: Number(item.tax_amount) || 0,
              bosTotal: Number(item.total) || 0,
              qtyFromPaper: qtyToConvert,
            });

            if (qtyToConvert < originalQty) {
              skippedItems.push(`${item.name || item.product_id} (${qtyToConvert} of ${originalQty} converted due to limited paper stock, balance ${originalQty - qtyToConvert} skipped)`);
            }
          }

          if (copyItems.length === 0) {
            throw new Error('No items have available GST paper stock. Conversion failed.');
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

          const newInvoiceId = crypto.randomUUID();

          const isInterStateConv = shopState.trim().toUpperCase() !== '' && (inv.customer_state || '').trim().toUpperCase() !== '' && shopState.trim().toUpperCase() !== (inv.customer_state || '').trim().toUpperCase();
          const convSupplyType: 'INTRA' | 'INTER' = isInterStateConv ? 'INTER' : 'INTRA';
          const convCgstTotal = isInterStateConv ? 0 : Math.round((adjustedTax / 2) * 100) / 100;
          const convSgstTotal = isInterStateConv ? 0 : Math.round((adjustedTax / 2) * 100) / 100;
          const convIgstTotal = isInterStateConv ? adjustedTax : 0;

          // 1. Create the GST invoice as a NEW row (copy) — the BoS stays intact.
          //    No stock movement: stock was already deducted when the BoS was sold.
          db.prepare(`
            INSERT INTO invoices (
              invoice_id, tenant_id, user_id, invoice_number, invoice_type,
              subtotal, tax_total, discount_total, discount_type, discount_value, grand_total,
              payment_method, received_amount, balance_amount,
              customer_name, customer_phone, customer_gstin, customer_state, customer_address,
              sync_status,
              converted_from_invoice_id, converted_from_invoice_number,
              cgst_total, sgst_total, igst_total, supply_type
            )
            VALUES (?, ?, ?, ?, 'GST', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)
          `).run(
            newInvoiceId,
            inv.tenant_id,
            inv.user_id,
            newInvoiceNumber,
            newSubtotal,
            adjustedTax,
            newDiscountTotal,
            inv.discount_type || 'FIXED',
            inv.discount_value || 0,
            newGrandTotal,
            inv.payment_method || 'CASH',
            Number(inv.received_amount) || 0,
            Number(inv.balance_amount) || 0,
            inv.customer_name || null,
            inv.customer_phone || null,
            inv.customer_gstin || null,
            inv.customer_state || null,
            inv.customer_address || null,
            invoice_id,
            oldInvoiceNumber,
            convCgstTotal,
            convSgstTotal,
            convIgstTotal,
            convSupplyType
          );

          // 2. Copy the priced items — they remember their original BoS values so
          //    returns refund what the customer actually paid.
          const insertItemStmt = db.prepare(`
            INSERT INTO invoice_items (
              item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total, is_service_item,
              source_item_id, bos_unit_price, bos_tax_amount, bos_total, qty_from_paper_stock,
              cgst_amount, sgst_amount, igst_amount, supply_type
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const ci of copyItems) {
            const itemCgst = isInterStateConv ? 0 : Math.round((ci.newTaxAmount / 2) * 100) / 100;
            const itemSgst = isInterStateConv ? 0 : Math.round((ci.newTaxAmount / 2) * 100) / 100;
            const itemIgst = isInterStateConv ? ci.newTaxAmount : 0;

            insertItemStmt.run(
              ci.item_id,
              newInvoiceId,
              inv.tenant_id,
              ci.product_id,
              ci.name,
              ci.quantity,
              ci.newUnitPrice,
              ci.newTaxAmount,
              ci.newTotal,
              ci.is_service_item,
              ci.source_item_id,
              ci.bosUnitPrice,
              ci.bosTax,
              ci.bosTotal,
              ci.qtyFromPaper,
              itemCgst,
              itemSgst,
              itemIgst,
              convSupplyType
            );
          }

          // 3. Mark the BoS as superseded — linked to its GST copy (original Estimate remains untouched)
          db.prepare(`
            UPDATE invoices SET
              converted_to_invoice_id = ?,
              converted_to_invoice_number = ?,
              sync_status = 'PENDING',
              updated_at = CURRENT_TIMESTAMP
            WHERE invoice_id = ?
          `).run(newInvoiceId, newInvoiceNumber, invoice_id);

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

ipcMain.removeHandler('settings:getAll');
ipcMain.handle('settings:getAll', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';
    const rows = db.prepare(`
      SELECT tenant_id, key, value FROM settings 
      WHERE tenant_id = 'global' OR tenant_id = ?
    `).all(tid) as any[];

    const resultMap: Record<string, any> = {};
    const parseVal = (rawVal: any) => {
      if (rawVal === undefined || rawVal === null) return null;
      try {
        let parsed = JSON.parse(rawVal);
        if (typeof parsed === 'string') parsed = parsed.trim().replace(/^["']|["']$/g, '');
        if (parsed && typeof parsed === 'object' && (parsed.error === 'Operation failed' || parsed.success === false)) return null;
        return parsed;
      } catch {
        return String(rawVal).trim().replace(/^["']|["']$/g, '');
      }
    };

    for (const r of rows) {
      if (r.tenant_id === 'global') {
        resultMap[r.key] = parseVal(r.value);
      }
    }
    for (const r of rows) {
      if (r.tenant_id === tid && tid !== 'global') {
        const isLocal = LOCAL_DEVICE_SETTING_KEYS.includes(r.key);
        if (!isLocal || resultMap[r.key] === undefined) {
          resultMap[r.key] = parseVal(r.value);
        }
      }
    }
    return resultMap;
  } catch (error: any) {
    console.error('[settings:getAll]', error);
    return {};
  }
});

ipcMain.removeHandler('settings:get');
ipcMain.handle('settings:get', (event, { tenant_id, key }: { tenant_id: string; key: string }) => {
  try {
    const db = getDb();
    const isLocalDeviceKey = LOCAL_DEVICE_SETTING_KEYS.includes(key);

    let row: any = null;
    if (isLocalDeviceKey) {
      row = db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = ?").get(key);
      if (!row && tenant_id && tenant_id !== 'global') {
        row = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(tenant_id, key);
      }
      if (!row) {
        row = db.prepare("SELECT value FROM settings WHERE key = ? ORDER BY updated_at DESC LIMIT 1").get(key);
      }
    } else {
      const tid = tenant_id || 'global';
      row = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(tid, key);
      if (!row && tid !== 'global') {
        row = db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = ?").get(key);
      }
      if (!row) {
        row = db.prepare("SELECT value FROM settings WHERE key = ? ORDER BY updated_at DESC LIMIT 1").get(key);
      }
    }

    if (row && row.value !== undefined) {
      try {
        let parsed = JSON.parse(row.value);
        if (typeof parsed === 'string') {
          parsed = parsed.trim().replace(/^["']|["']$/g, '');
        }
        if (parsed && typeof parsed === 'object' && (parsed.error === 'Operation failed' || parsed.success === false)) {
          return null;
        }
        return parsed;
      } catch {
        return String(row.value).trim().replace(/^["']|["']$/g, '');
      }
    }
    return null;
  } catch (error: any) {
    console.error('[settings:get]', error);
    return null;
  }
});

const LOCAL_DEVICE_SETTING_KEYS = [
  'terminal_code',
  'invoice_counter_config',
  'gst_b2b_invoice_counter_config',
  'gst_b2c_invoice_counter_config',
  'gst_invoice_counter_config',
  'return_counter',
  'scrap_invoice_counter',
  'quotation_counter',
  'barcode_printer_config',
  'receipt_printer_config',
  'a4_printer_config',
  'scale_config',
  'printer_config',
  'network_sync_config',
  'auto_print_barcode',
  'print_format',
  'label_code_type',
  'label_show_shop_name'
];

ipcMain.removeHandler('settings:set');
ipcMain.handle('settings:set', async (event, { tenant_id, key, value }: { tenant_id: string; key: string; value: any }) => {
  try {
    const db = getDb();
    const isLocalDeviceKey = LOCAL_DEVICE_SETTING_KEYS.includes(key);
    const syncStatus = isLocalDeviceKey ? 'LOCAL' : 'PENDING';
    const tid = tenant_id || 'global';
    const valString = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);

    const upsertStmt = db.prepare(`
      INSERT INTO settings (tenant_id, key, value, sync_status, updated_at) 
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) 
      ON CONFLICT(tenant_id, key) DO UPDATE SET 
        value = EXCLUDED.value, 
        sync_status = EXCLUDED.sync_status,
        updated_at = CURRENT_TIMESTAMP
    `);

    upsertStmt.run(tid, key, valString, syncStatus);

    // For local device hardware keys, also mirror to 'global' so any tenant or startup cycle on this terminal machine retains access
    if (isLocalDeviceKey && tid !== 'global') {
      upsertStmt.run('global', key, valString, syncStatus);
    }

    if (key === 'network_sync_config' && value && typeof value === 'object') {
      const { startLocalHostServer, stopLocalHostServer } = await import('./sync/localHostServer.js');
      const { reloadSyncConfig } = await import('./sync/syncWorker.js');
      if ((value.syncMode === 'LAN' || value.syncMode === 'HYBRID') && value.lanRole === 'PRIMARY') {
        startLocalHostServer(Number(value.lanPort) || 3888);
      } else {
        stopLocalHostServer();
      }
      reloadSyncConfig();
    }
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

ipcMain.handle('sync:getCloudAccessState', async (_event, tenantId?: string) => {
  try {
    const { calculateEffectiveCloudAccess } = await import('./sync/syncWorker.js');
    return calculateEffectiveCloudAccess(tenantId);
  } catch (err: any) {
    console.error('[Main] sync:getCloudAccessState error:', err.message);
    return null;
  }
});

ipcMain.handle('sync:updateCloudAccessConfig', async (_event, payload: { config: any; tenant_id?: string }) => {
  try {
    const { updateCloudAccessConfig } = await import('./sync/syncWorker.js');
    return updateCloudAccessConfig(payload.config, payload.tenant_id);
  } catch (err: any) {
    console.error('[Main] sync:updateCloudAccessConfig error:', err.message);
    return null;
  }
});

ipcMain.handle('sync:drainPendingCloudQueue', async (event) => {
  try {
    const { drainPendingCloudQueue } = await import('./sync/syncWorker.js');
    return drainPendingCloudQueue(event.sender);
  } catch (err: any) {
    console.error('[Main] sync:drainPendingCloudQueue error:', err.message);
    return { success: false, drainedCount: 0, message: err.message };
  }
});

ipcMain.handle('sync:setPageContext', async (_event, payload: { page: string; active: boolean }) => {
  try {
    const { setPageContext } = await import('./sync/syncWorker.js');
    setPageContext(payload?.page || null, !!payload?.active);
    return { success: true };
  } catch (err: any) {
    console.error('[Main] sync:setPageContext error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sync:forceResyncInvoices', async (event) => {
  const { forceResyncInvoices } = await import('./sync/syncWorker.js');
  return forceResyncInvoices(event.sender);
});

ipcMain.handle('sync:getProgress', async () => {
  const { getSyncProgress } = await import('./sync/syncWorker.js');
  return getSyncProgress();
});

ipcMain.handle('sync:testConnection', async (_event, payload: { syncMode?: string; lanRole?: string; lanHostIp?: string; lanPort?: number }) => {
  const syncMode = payload?.syncMode || 'HYBRID';
  const lanRole = payload?.lanRole || 'SECONDARY';
  const rawHost = payload?.lanHostIp || '';
  const port = Number(payload?.lanPort) || 3888;
  const cleanHost = String(rawHost).trim().replace(/^https?:\/\//i, '').replace(/:\d+$/, '').replace(/\/.*$/, '');
  const defaultCloud = (process.env.VENDORA_CLOUD_API || process.env.NAFID_CLOUD_API || process.env.VITE_CLOUD_API || 'https://nafid.vercel.app').replace(/\/$/, '');

  if (syncMode === 'LAN' || syncMode === 'HYBRID') {
    if (lanRole === 'PRIMARY') {
      return {
        ok: true,
        route: 'LAN',
        message: `Wifi Sync Active — This PC is Primary Master Server (Port ${port})`
      };
    }

    const host = cleanHost || '192.168.1.100';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`http://${host}:${port}/health`, { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        return {
          ok: true,
          route: 'LAN',
          message: `Wifi Sync Active — Connected to Primary Master Server (${host}:${port})`
        };
      } else if (syncMode === 'HYBRID') {
        try {
          const cloudCtrl = new AbortController();
          const cloudTimeout = setTimeout(() => cloudCtrl.abort(), 3500);
          const cloudRes = await fetch(`${defaultCloud}/health`, { method: 'GET', signal: cloudCtrl.signal });
          clearTimeout(cloudTimeout);
          if (cloudRes.ok) {
            return {
              ok: true,
              route: 'CLOUD',
              fallback: true,
              message: `Cloud Sync Active (Hybrid Fallback) — LAN Master Server (${host}) returned status ${res.status}. Syncing via Cloud API.`
            };
          }
        } catch {}
        return {
          ok: false,
          error: `Sync Inactive — Master Server (${host}) returned status ${res.status}`
        };
      } else {
        return {
          ok: false,
          error: `Sync Inactive — Master Server (${host}) returned status ${res.status}`
        };
      }
    } catch {
      if (syncMode === 'HYBRID') {
        try {
          const cloudCtrl = new AbortController();
          const cloudTimeout = setTimeout(() => cloudCtrl.abort(), 3500);
          const cloudRes = await fetch(`${defaultCloud}/health`, { method: 'GET', signal: cloudCtrl.signal });
          clearTimeout(cloudTimeout);
          if (cloudRes.ok) {
            return {
              ok: true,
              route: 'CLOUD',
              fallback: true,
              message: `Cloud Sync Active (Hybrid Fallback) — LAN Master Server (${host}) unreachable. Automatically syncing via Cloud API!`
            };
          }
        } catch {}
      }
      return {
        ok: false,
        error: `Sync Inactive — Could not connect to Master Server at ${host}:${port}. Ensure PC 1 is on, POS is open & Windows Firewall allows Port 3888.`
      };
    }
  } else {
    try {
      const cloudCtrl = new AbortController();
      const cloudTimeout = setTimeout(() => cloudCtrl.abort(), 3500);
      const cloudRes = await fetch(`${defaultCloud}/health`, { method: 'GET', signal: cloudCtrl.signal });
      clearTimeout(cloudTimeout);
      if (cloudRes.ok) {
        return {
          ok: true,
          route: 'CLOUD',
          message: `Cloud Sync Active — Connected to Cloud API server`
        };
      }
    } catch {}
    return {
      ok: false,
      error: `Sync Inactive — Cloud API server (${defaultCloud}) is unreachable.`
    };
  }
});



function getOrInitTerminalCode(db: any): string {
  const row: any = db.prepare("SELECT value FROM settings WHERE (tenant_id = 'global' OR tenant_id != '') AND key = ? ORDER BY (CASE WHEN tenant_id = 'global' THEN 1 ELSE 2 END) ASC, updated_at DESC LIMIT 1").get('terminal_code');
  if (row && row.value) {
    try {
      let code = row.value;
      if (typeof code === 'string') {
        code = code.trim().replace(/^["']|["']$/g, '');
        if ((code.startsWith('"') && code.endsWith('"')) || (code.startsWith("'") && code.endsWith("'"))) {
          try { code = JSON.parse(code); } catch {}
        }
      }
      const clean = String(code).trim().replace(/^["']|["']$/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (clean.length > 0) {
        return clean;
      }
    } catch {
      const raw = String(row.value).trim().replace(/^["']|["']$/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (raw.length > 0) {
        return raw;
      }
    }
  }
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  db.prepare(`INSERT INTO settings (tenant_id, key, value, sync_status, updated_at) VALUES (?, ?, ?, 'LOCAL', CURRENT_TIMESTAMP) ON CONFLICT(tenant_id, key) DO UPDATE SET value = EXCLUDED.value, sync_status = 'LOCAL', updated_at = CURRENT_TIMESTAMP`).run('global', 'terminal_code', JSON.stringify(code));
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

    const { getSyncEndpoints } = await import('./sync/syncWorker.js');
    const endpoints = getSyncEndpoints();
    const apiUrl = (endpoints.primaryUrl || process.env.VENDORA_CLOUD_API || 'http://localhost:3001').replace(/\/$/, '');
    const url = `${apiUrl}/api/invoices/next-number?terminal_code=${encodeURIComponent(terminalCode)}${series ? `&series=${encodeURIComponent(series)}` : ''}&prefix=${encodeURIComponent(prefix)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1200),
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

function getGuaranteedNextInvoiceNumber(
  db: any,
  tenantId: string,
  configKey: string = 'invoice_counter_config',
  overrideDefaultPrefix?: string
): { invoiceNumber: string; counter: number; prefix: string } {
  const terminalCode = getOrInitTerminalCode(db);
  const defaultPrefix = overrideDefaultPrefix || `${terminalCode}-`;

  const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', configKey);
  let counter = 1;
  let prefix = defaultPrefix;

  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      counter = typeof parsed.counter === 'number' && parsed.counter > 0 ? parsed.counter : 1;
      if (configKey === 'invoice_counter_config') {
        prefix = defaultPrefix;
      } else if (parsed.prefix && /[A-Z0-9]/i.test(parsed.prefix)) {
        prefix = parsed.prefix;
      }
    } catch {
      counter = 1;
    }
  }

  const checkStmt = db.prepare('SELECT 1 FROM invoices WHERE tenant_id = ? AND invoice_number = ? LIMIT 1');
  let candidate = `${prefix}${String(counter).padStart(3, '0')}`;

  while (checkStmt.get(tenantId || 'global', candidate)) {
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
  `).run(configKey, JSON.stringify(nextConfig));

  return { invoiceNumber: candidate, counter, prefix };
}

function peekGuaranteedNextInvoiceNumber(
  db: any,
  tenantId: string,
  configKey: string = 'invoice_counter_config',
  overrideDefaultPrefix?: string
): { invoiceNumber: string } {
  const terminalCode = getOrInitTerminalCode(db);
  const defaultPrefix = overrideDefaultPrefix || `${terminalCode}-`;

  const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', configKey);
  let counter = 1;
  let prefix = defaultPrefix;

  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      counter = typeof parsed.counter === 'number' && parsed.counter > 0 ? parsed.counter : 1;
      if (configKey === 'invoice_counter_config') {
        prefix = defaultPrefix;
      } else if (parsed.prefix && /[A-Z0-9]/i.test(parsed.prefix)) {
        prefix = parsed.prefix;
      }
    } catch {
      counter = 1;
    }
  }

  const checkStmt = db.prepare('SELECT 1 FROM invoices WHERE tenant_id = ? AND invoice_number = ? LIMIT 1');
  let candidate = `${prefix}${String(counter).padStart(3, '0')}`;

  while (checkStmt.get(tenantId || 'global', candidate)) {
    counter++;
    candidate = `${prefix}${String(counter).padStart(3, '0')}`;
  }

  return { invoiceNumber: candidate };
}

ipcMain.handle('db:getNextInvoiceNumber', (event, { tenant_id, series }: { tenant_id: string; series?: string }) => {
  try {
    const db = getDb();
    const configKey = series === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : series === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : series === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';
    const result = getGuaranteedNextInvoiceNumber(db, tenant_id || 'global', configKey);
    return { success: true, invoiceNumber: result.invoiceNumber, counter: result.counter };
  } catch (error: any) {
    console.error('[db:getNextInvoiceNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:peekNextInvoiceNumber', (event, { tenant_id, series }: { tenant_id: string; series?: string }) => {
  try {
    const db = getDb();
    const configKey = series === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : series === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : series === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';
    const result = peekGuaranteedNextInvoiceNumber(db, tenant_id || 'global', configKey);
    return { success: true, invoiceNumber: result.invoiceNumber };
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
      if (t.party_name || t.customer_phone) {
        upsertCustomerRecord(db, t.tenant_id || 'global', t.party_name, t.customer_phone, t.customer_address);
      }
      db.prepare(`
        INSERT INTO scrap_transactions (transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, payment_status, sync_status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
      `).run(t.transaction_id, t.tenant_id, t.type, t.scrap_category_id, t.quantity, t.rate, t.total_amount, t.party_name || null, t.customer_phone || null, t.customer_address || null, t.notes || null, t.scrap_invoice_number || null, paymentStatus);
      db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`).run(delta, t.scrap_category_id);

      if (t.type === 'PURCHASE' && (paymentStatus === 'CASH' || paymentStatus === 'PAID') && Number(t.total_amount) > 0) {
        const todayDate = localDate();
        const drawer = getOpenCashDrawer(db, t.tenant_id || 'global', todayDate);
        if (drawer) {
          const txnId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, sync_status)
            VALUES (?, ?, ?, 'CASH_OUT', ?, 'SCRAP_PURCHASE', ?, 'system', 'PENDING')
          `).run(
            txnId,
            t.tenant_id || 'global',
            drawer.drawer_id,
            Number(t.total_amount),
            `Scrap purchase ${t.scrap_invoice_number || ''}`.trim()
          );
          const newCashOut = Number(drawer.cash_out) + Number(t.total_amount);
          const newCurrentCash = Number(drawer.current_cash) - Number(t.total_amount);
          const newExpectedClosing = Number(drawer.opening_balance) + Number(drawer.cash_sales) + Number(drawer.cash_in) - newCashOut;
          db.prepare(`
            UPDATE cash_drawer SET cash_out = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE drawer_id = ?
          `).run(newCashOut, newCurrentCash, newExpectedClosing, drawer.drawer_id);
        }
      }
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
      WHERE st.tenant_id = ? AND (st.is_deleted IS NULL OR st.is_deleted = 0)
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
          const parsed = JSON.parse(row.value);
          counter = (typeof parsed.counter === 'number' ? parsed.counter : 1);
          let rawPrefix = parsed.prefix && /[A-Z0-9]/i.test(parsed.prefix) ? parsed.prefix : `${terminalCode}-SCR-`;
          if (rawPrefix.includes('-SCR-')) {
            rawPrefix = `${terminalCode}-SCR-`;
          }
          config = { prefix: rawPrefix, counter };
        } catch {
          counter = 1;
        }
      }

      const prefix = config.prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || `${terminalCode}-SCR-`;
      const invoiceNumber = `${prefix}${String(counter).padStart(3, '0')}`;

      config.counter = counter + 1;
      db.prepare(`
        INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
        VALUES ('global', ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, key) DO UPDATE SET
          value = EXCLUDED.value,
          sync_status = 'LOCAL',
          updated_at = CURRENT_TIMESTAMP
      `).run(configKey, JSON.stringify(config));

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
    const defaultPrefix = `${terminalCode}-SCR-`;

    const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'scrap_invoice_counter');
    if (row) {
      try {
        const config = JSON.parse(row.value);
        let rawPrefix = config.prefix && /[A-Z0-9]/i.test(config.prefix) ? config.prefix : defaultPrefix;
        if (rawPrefix.includes('-SCR-')) {
          rawPrefix = `${terminalCode}-SCR-`;
        }
        const prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
        return { success: true, invoiceNumber: `${prefix}${String(config.counter || 1).padStart(3, '0')}` };
      } catch {
        // Invalid JSON in stored value — fall through to default
      }
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
      WHERE st.tenant_id = ? AND st.scrap_invoice_number = ? AND (st.is_deleted IS NULL OR st.is_deleted = 0)
      ORDER BY st.created_at DESC
    `).all(tenant_id, scrap_invoice_number);
    if (rows.length === 0) return null;
    const totalAmount = rows.reduce((sum, r) => sum + r.total_amount, 0);
    const paymentStatus = rows[0]?.payment_status || 'PENDING';
    return { transactions: rows, totalAmount, invoiceNumber: scrap_invoice_number, paymentStatus };
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
      WHERE st.tenant_id = ? AND st.scrap_invoice_number IS NOT NULL AND st.type = 'PURCHASE' AND (st.is_deleted IS NULL OR st.is_deleted = 0)
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
      UPDATE scrap_transactions SET payment_status = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND scrap_invoice_number = ?
    `).run(payment_status, tenant_id, scrap_invoice_number);
    return { success: true };
  } catch (error: any) {
    console.error('[db:updateScrapInvoicePaymentStatus]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateScrapInvoiceHeader', (event, { tenant_id, scrap_invoice_number, party_name, customer_phone, customer_address, payment_status }: { tenant_id: string; scrap_invoice_number: string; party_name?: string; customer_phone?: string; customer_address?: string; payment_status?: string }) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE scrap_transactions 
      SET party_name = ?, customer_phone = ?, customer_address = ?, payment_status = COALESCE(?, payment_status), sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND scrap_invoice_number = ?
    `).run(party_name ?? null, customer_phone ?? null, customer_address ?? null, payment_status ?? null, tenant_id, scrap_invoice_number);
    return { success: true };
  } catch (error: any) {
    console.error('[db:updateScrapInvoiceHeader]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateScrapInvoiceFull', (event, { tenant_id, scrap_invoice_number, party_name, customer_phone, customer_address, payment_status, items }: { tenant_id: string; scrap_invoice_number: string; party_name?: string; customer_phone?: string; customer_address?: string; payment_status?: string; items: any[] }) => {
  try {
    const db = getDb();
    const result = db.transaction(() => {
      const existingRows: any[] = db.prepare(
        'SELECT * FROM scrap_transactions WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0)'
      ).all(tenant_id, scrap_invoice_number);

      for (const row of existingRows) {
        const qtyDelta = row.type === 'SALE' ? Number(row.quantity) : -Number(row.quantity);
        db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`)
          .run(qtyDelta, row.scrap_category_id);
      }

      db.prepare(`UPDATE scrap_transactions SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND scrap_invoice_number = ?`)
        .run(tenant_id, scrap_invoice_number);

      const insertTx = db.prepare(`
        INSERT INTO scrap_transactions (
          transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, payment_status, created_at, updated_at
        ) VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      const updateStock = db.prepare(`
        UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?
      `);

      for (const item of items) {
        const txId = crypto.randomUUID();
        const catId = item.scrap_category_id || item.product_id;
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        const totalAmount = qty * rate;

        insertTx.run(
          txId,
          tenant_id,
          catId,
          qty,
          rate,
          totalAmount,
          party_name ?? null,
          customer_phone ?? null,
          customer_address ?? null,
          item.notes || 'Updated via Billing Page',
          scrap_invoice_number,
          payment_status || 'CASH'
        );

        updateStock.run(qty, catId);
      }

      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:updateScrapInvoiceFull]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateScrapTransaction', safeHandler((event, args) => {
  try {
    const db = getDb();
    const row: any = db.prepare(
      'SELECT * FROM scrap_transactions WHERE transaction_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)'
    ).get(args.transaction_id, args.tenant_id);
    if (!row) return { success: false, error: 'Transaction not found' };

    const oldCatId = row.scrap_category_id;
    const newCatId = args.scrap_category_id || oldCatId;
    const oldQty = Number(row.quantity);
    const newQty = Number(args.quantity);
    const newRate = Number(args.rate);
    const totalAmount = newQty * newRate;

    const result = db.transaction(() => {
      db.prepare(`
        UPDATE scrap_transactions 
        SET scrap_category_id = ?, quantity = ?, rate = ?, total_amount = ?, party_name = ?, notes = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE transaction_id = ? AND tenant_id = ?
      `).run(
        newCatId,
        newQty,
        newRate,
        totalAmount,
        args.party_name ?? row.party_name,
        args.notes ?? row.notes,
        args.transaction_id,
        args.tenant_id
      );

      if (oldCatId === newCatId) {
        const qtyDelta = row.type === 'SALE' ? oldQty - newQty : newQty - oldQty;
        db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`)
          .run(qtyDelta, oldCatId);
      } else {
        const revertOldDelta = row.type === 'SALE' ? oldQty : -oldQty;
        db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`)
          .run(revertOldDelta, oldCatId);

        const applyNewDelta = row.type === 'SALE' ? -newQty : newQty;
        db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`)
          .run(applyNewDelta, newCatId);
      }

      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:updateScrapTransaction]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:deleteScrapTransaction', (event, { tenant_id, transaction_id }: { tenant_id: string; transaction_id: string }) => {
  try {
    const db = getDb();
    const row: any = db.prepare('SELECT * FROM scrap_transactions WHERE transaction_id = ? AND tenant_id = ?').get(transaction_id, tenant_id);
    if (!row) return { success: false, error: 'Transaction not found' };
    const qtyDelta = row.type === 'SALE' ? Number(row.quantity) : -Number(row.quantity);
    const result = db.transaction(() => {
      db.prepare(`UPDATE scrap_transactions SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE transaction_id = ? AND tenant_id = ?`).run(transaction_id, tenant_id);
      db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`).run(qtyDelta, row.scrap_category_id);
      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:deleteScrapTransaction]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:deleteScrapInvoice', (event, { tenant_id, scrap_invoice_number }: { tenant_id: string; scrap_invoice_number: string }) => {
  try {
    const db = getDb();
    const rows: any[] = db.prepare(
      'SELECT * FROM scrap_transactions WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0)'
    ).all(tenant_id, scrap_invoice_number);
    const result = db.transaction(() => {
      for (const row of rows) {
        const qtyDelta = row.type === 'SALE' ? Number(row.quantity) : -Number(row.quantity);
        db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`)
          .run(qtyDelta, row.scrap_category_id);
      }
      db.prepare(`UPDATE scrap_transactions SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND scrap_invoice_number = ?`)
        .run(tenant_id, scrap_invoice_number);
      const ledgerEntries: any[] = db.prepare(
        'SELECT * FROM party_ledger WHERE tenant_id = ? AND reference_number = ?'
      ).all(tenant_id, scrap_invoice_number);
      for (const entry of ledgerEntries) {
        db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?").run(entry.ledger_id);
        recalcPartyBalances(db, entry.party_id);
      }
      return { success: true };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:deleteScrapInvoice]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// ── Scrap CREDIT → Party/Ledger ──────────────────────────────────────────
// Creates/updates a party ledger entry for a CREDIT scrap invoice (idempotent
// per invoice via reference_number). Non-CREDIT status removes the entry.
ipcMain.handle('db:upsertScrapCreditLedger', safeHandler((event, { tenant_id, scrap_invoice_number, payment_status, party_name, customer_phone, customer_address, user_id, user_name }: {
  tenant_id: string;
  scrap_invoice_number: string;
  payment_status: string;
  party_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  user_id?: string;
  user_name?: string;
}) => {
  try {
    const db = getDb();
    if (!tenant_id || !scrap_invoice_number) return { success: false, error: 'tenant_id and scrap_invoice_number are required' };

    const result = db.transaction(() => {
      let existingEntry: any = db.prepare(
        'SELECT * FROM party_ledger WHERE tenant_id = ? AND reference_number = ? LIMIT 1'
      ).get(tenant_id, scrap_invoice_number);

      const removeEntry = (entry: any) => {
        db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?").run(entry.ledger_id);
        recalcPartyBalances(db, entry.party_id);
      };

      if (payment_status !== 'CREDIT') {
        if (existingEntry) removeEntry(existingEntry);
        return { success: true, party_id: null };
      }

      const name = party_name ? String(party_name).trim() : '';
      if (!name) return { success: false, error: 'Party name is required for Credit payment' };

      const totalRow: any = db.prepare(
        `SELECT COALESCE(SUM(total_amount), 0) AS total FROM scrap_transactions WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0)`
      ).get(tenant_id, scrap_invoice_number);
      const total = parseFloat(totalRow?.total) || 0;
      if (total <= 0) return { success: false, error: 'Invoice total is zero' };

      const phone = customer_phone ? String(customer_phone).trim() : '';
      const address = customer_address ? String(customer_address).trim() : null;

      let party: any = db.prepare(
        'SELECT * FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)'
      ).get(tenant_id, phone) || null;
      if (!party) {
        party = db.prepare(
          "SELECT * FROM parties WHERE tenant_id = ? AND name = ? COLLATE NOCASE AND (is_deleted IS NULL OR is_deleted = 0)"
        ).get(tenant_id, name) || null;
      }

      if (!party) {
        const partyId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO parties (party_id, tenant_id, name, phone, address, gstin, balance, gst_balance, estimate_balance, balance_type, notes, pricing_tier_id, credit_limit, is_deleted, sync_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, NULL, 0, 0, 0, 'RECEIVABLE', NULL, NULL, 0, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(partyId, tenant_id, name, phone || null, address);
        party = { party_id: partyId };
      }

      const partyBal: any = db.prepare('SELECT balance FROM parties WHERE party_id = ?').get(party.party_id);
      const currentBalance = parseFloat(partyBal?.balance) || 0;
      const newBalance = currentBalance - total;

      // Party changed → move the entry to the new party
      if (existingEntry && existingEntry.party_id !== party.party_id) {
        removeEntry(existingEntry);
        existingEntry = null;
      }

      if (existingEntry) {
        // Same party → update in place (keeps ledger_id stable for sync)
        db.prepare(`
          UPDATE party_ledger SET
            debit_amount = ?, credit_amount = 0, description = ?, transaction_date = CURRENT_TIMESTAMP,
            payment_method = 'CREDIT', created_by = ?, created_by_name = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE ledger_id = ?
        `).run(total, `Scrap purchase ${scrap_invoice_number} - ${name}`, user_id || null, user_name || null, existingEntry.ledger_id);
        const entries = db.prepare(`
          SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
          WHERE party_id = ? ORDER BY transaction_date ASC, created_at ASC
        `).all(party.party_id) as any[];
        let running = 0;
        for (const row of entries) {
          running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
          db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
        }
        recalcPartyBalances(db, party.party_id);
      } else {
        const ledgerId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, payment_method, reference_number, created_by, created_by_name, sync_status, created_at, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, 0, ?, ?, 'GST', 'CREDIT', ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          ledgerId,
          party.party_id,
          tenant_id,
          `Scrap purchase ${scrap_invoice_number} - ${name}`,
          total,
          newBalance,
          scrap_invoice_number,
          user_id || null,
          user_name || null
        );
        db.prepare(`UPDATE parties SET balance = ?, gst_balance = gst_balance - ?, last_transaction_date = CURRENT_TIMESTAMP, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`)
          .run(newBalance, total, party.party_id);
      }

      return { success: true, party_id: party.party_id };
    })();
    return result;
  } catch (error: any) {
    console.error('[db:upsertScrapCreditLedger]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

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
      SELECT p.product_id,
             COALESCE((
               SELECT SUM(ii.quantity)
               FROM invoice_items ii
               JOIN invoices i ON ii.invoice_id = i.invoice_id
               WHERE ii.product_id = p.product_id AND i.invoice_type = 'GST' AND ii.tenant_id = p.tenant_id AND (i.is_deleted IS NULL OR i.is_deleted = 0)
             ), 0) as gst_qty,
             COALESCE((
               SELECT SUM(ii.quantity)
               FROM invoice_items ii
               JOIN invoices i ON ii.invoice_id = i.invoice_id
               WHERE ii.product_id = p.product_id AND i.invoice_type = 'BILL_OF_SUPPLY' AND i.converted_to_invoice_id IS NULL AND ii.tenant_id = p.tenant_id AND (i.is_deleted IS NULL OR i.is_deleted = 0)
             ), 0) as estimate_qty,
             COALESCE((
               SELECT SUM(pbi.quantity)
               FROM purchase_bill_items pbi
               JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
               WHERE pbi.product_id = p.product_id AND pb.bill_type = 'GST' AND pb.tenant_id = p.tenant_id
             ), 0) as gst_purchased_qty
      FROM products p
      WHERE p.tenant_id = ? AND p.is_deleted = 0
    `).all(tenantId);
  } catch (error: any) {
    console.error('[db:getProductBillQuantities]', error);
    return [];
  }
});

// ── Product Sales Summary (GST qty vs BoS qty sold per product) ─────────────
ipcMain.handle('db:getProductSalesSummary', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    return db.prepare(`
      SELECT ii.product_id,
             ii.name,
             COALESCE(SUM(CASE WHEN i.invoice_type = 'GST' THEN ii.quantity ELSE 0 END), 0) as gst_qty,
             COALESCE(SUM(CASE WHEN i.invoice_type = 'BILL_OF_SUPPLY' AND i.converted_to_invoice_id IS NULL THEN ii.quantity ELSE 0 END), 0) as bos_qty,
             COALESCE(SUM(ii.quantity), 0) as total_qty
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.invoice_id
      WHERE ii.tenant_id = ? AND i.invoice_type IN ('GST', 'BILL_OF_SUPPLY') AND (i.is_deleted IS NULL OR i.is_deleted = 0)
      GROUP BY ii.product_id, ii.name
      ORDER BY ii.name COLLATE NOCASE ASC
    `).all(tenant_id);
  } catch (error: any) {
    console.error('[db:getProductSalesSummary]', error);
    return [];
  }
});

// ── BoS convertible check: which BoS invoices have ≥1 item with a GST purchase record ──
ipcMain.handle('db:getBosConvertibleInvoices', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare(`
      SELECT i.invoice_id,
             EXISTS(
               SELECT 1 FROM invoice_items ii
               JOIN products p ON ii.product_id = p.product_id
               WHERE ii.invoice_id = i.invoice_id
                 AND EXISTS(
                   SELECT 1 FROM products pgst
                   WHERE pgst.tenant_id = i.tenant_id
                     AND pgst.is_deleted = 0
                     AND pgst.is_gst_applicable = 1
                     AND (
                       pgst.name = REPLACE(REPLACE(REPLACE(p.name, ' (GST)', ''), ' (EST)', ''), ' (Estimate)', '') || ' (GST)'
                       OR pgst.name = REPLACE(REPLACE(REPLACE(p.name, ' (GST)', ''), ' (EST)', ''), ' (Estimate)', '')
                     )
                 )
             ) AS convertible
      FROM invoices i
      WHERE i.tenant_id = ? AND i.invoice_type = 'BILL_OF_SUPPLY' AND i.converted_to_invoice_id IS NULL AND (i.is_deleted IS NULL OR i.is_deleted = 0)
    `).all(tenantId);
  } catch (error: any) {
    console.error('[db:getBosConvertibleConvertibles]', error);
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
          const parsed = JSON.parse(row.value);
          counter = (typeof parsed.counter === 'number' ? parsed.counter : 1);
          let rawPrefix = parsed.prefix && /[A-Z0-9]/i.test(parsed.prefix) ? parsed.prefix : `${terminalCode}-QTN-`;
          if (rawPrefix.includes('-QTN-')) {
            rawPrefix = `${terminalCode}-QTN-`;
          }
          config = { prefix: rawPrefix, counter };
        } catch {
          counter = 1;
        }
      }

      const prefix = config.prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || `${terminalCode}-QTN-`;
      const quotationNumber = `${prefix}${String(counter).padStart(3, '0')}`;

      config.counter = counter + 1;
      db.prepare(`
        INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
        VALUES ('global', ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, key) DO UPDATE SET
          value = EXCLUDED.value,
          sync_status = 'LOCAL',
          updated_at = CURRENT_TIMESTAMP
      `).run(configKey, JSON.stringify(config));

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
    const defaultPrefix = `${terminalCode}-QTN-`;

    const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'quotation_counter');
    if (row) {
      try {
        const config = JSON.parse(row.value);
        let rawPrefix = config.prefix && /[A-Z0-9]/i.test(config.prefix) ? config.prefix : defaultPrefix;
        if (rawPrefix.includes('-QTN-')) {
          rawPrefix = `${terminalCode}-QTN-`;
        }
        const prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
        return { success: true, quotationNumber: `${prefix}${String(config.counter || 1).padStart(3, '0')}` };
      } catch {
        // Invalid JSON in stored value — fall through to default
      }
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
    triggerUrgentQuotationSync().catch(() => {});
    return result;
  } catch (error: any) {
    console.error('[db:saveQuotation]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:getQuotations', (event, { tenant_id, search }: { tenant_id: string; search?: string }) => {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';
    let query = "SELECT * FROM quotations WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = '' OR tenant_id IS NULL) AND (status IS NULL OR status != 'DELETED')";
    const params: any[] = [tid];
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
      db.prepare("UPDATE quotations SET status = 'DELETED', sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE quotation_id = ?").run(quotationId);
      db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(quotationId);
    })();
    triggerUrgentQuotationSync().catch(() => {});
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
    triggerUrgentQuotationSync().catch(() => {});
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
    triggerUrgentQuotationSync().catch(() => {});
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
      offer_price?: number | null;
      is_gst_applicable?: number;
      tax_rate_percent?: number;
      hsn_sac_code?: string;
      skip_stock_update?: number;
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
          INSERT INTO purchase_bill_items (item_id, purchase_bill_id, tenant_id, product_id, name, quantity, purchase_price, total_amount, selling_price, offer_price, is_gst_applicable, tax_rate_percent, hsn_sac_code, skip_stock_update, sync_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
        // Two stock statements: ESTIMATE bills update stock+price; GST bills update price only (tax documents, not inventory)
        const updateStock = db.prepare(`UPDATE products SET current_stock = current_stock + ?, purchase_price = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?`);
        const updatePurchasePriceOnly = db.prepare(`UPDATE products SET purchase_price = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?`);
        const updatePrice = db.prepare(`UPDATE products SET base_price = ? WHERE product_id = ? AND tenant_id = ?`);
        const updateOfferPrice = db.prepare(`UPDATE products SET offer_price = ? WHERE product_id = ? AND tenant_id = ?`);
        for (const item of items) {
          const isGst = billType === 'GST' ? (item.is_gst_applicable ?? 1) : 0;
          const skipStock = item.skip_stock_update ?? 0;
          stmt.run(item.item_id, bill.purchase_bill_id, bill.tenant_id, item.product_id, item.name, item.quantity, item.purchase_price, item.total_amount, item.selling_price != null ? item.selling_price : 0, item.offer_price != null ? item.offer_price : 0, isGst, item.tax_rate_percent ?? 0, item.hsn_sac_code || null, skipStock);
          const actualPurchasePrice = billType === 'GST' && isGst === 1
            ? item.purchase_price * (1 + (item.tax_rate_percent ?? 0) / 100)
            : item.purchase_price;
          // Update stock for Estimates, and for GST bills only if they are not dummy (not shared/skipped)
          if (billType === 'ESTIMATE' || (billType === 'GST' && !item.skip_stock_update)) {
            updateStock.run(item.quantity, actualPurchasePrice, item.product_id, bill.tenant_id);
          } else {
            updatePurchasePriceOnly.run(actualPurchasePrice, item.product_id, bill.tenant_id);
          }
        if (item.selling_price != null) {
          updatePrice.run(item.selling_price, item.product_id, bill.tenant_id);
        }
        if (item.offer_price != null) {
          updateOfferPrice.run(item.offer_price, item.product_id, bill.tenant_id);
        }
      }

      // If CREDIT payment and supplier is a known party, create ledger entry
      if (paymentType === 'CREDIT' && bill.supplier_id) {
        const party = db.prepare('SELECT balance, gst_balance, estimate_balance FROM parties WHERE party_id = ?').get(bill.supplier_id) as any;
        if (party) {
          const balanceType = billType === 'ESTIMATE' ? 'ESTIMATE' : 'GST';
          const ledgerId = crypto.randomUUID();
          const debitAmount = bill.total_amount;
          const balanceCol = balanceType === 'ESTIMATE' ? 'estimate_balance' : 'gst_balance';
          const currentTypeBalance = parseFloat(party[balanceCol]) || 0;
          const newTypeBalance = currentTypeBalance - debitAmount;
          const newBalance = (parseFloat(party.balance) || 0) - debitAmount;
          db.prepare(`
            INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, payment_method, reference_number, created_by, created_by_name, sync_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(ledgerId, bill.supplier_id, bill.tenant_id, bill.bill_date || localTimestamp(), `Purchase bill ${bill.bill_number} - ${bill.supplier_name}`, 0, debitAmount, newBalance, balanceType, bill.bill_number, 'system', 'System');
          db.prepare(`UPDATE parties SET balance = ?, ${balanceCol} = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`)
            .run(newBalance, newTypeBalance, bill.bill_date || localTimestamp(), bill.supplier_id);
        }
      }

      // If CASH payment, deduct cash from current cash drawer
      if (paymentType === 'CASH' && Number(bill.total_amount) > 0) {
        const todayDate = localDate();
        const drawer = getOpenCashDrawer(db, bill.tenant_id, todayDate);
        if (drawer) {
          const txnId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, sync_status)
            VALUES (?, ?, ?, 'CASH_OUT', ?, 'Purchase Bill', ?, 'system', 'PENDING')
          `).run(
            txnId,
            bill.tenant_id,
            drawer.drawer_id,
            Number(bill.total_amount),
            `Purchase bill ${bill.bill_number} - ${bill.supplier_name}`
          );
          const newCashOut = Number(drawer.cash_out) + Number(bill.total_amount);
          const newCurrentCash = Number(drawer.current_cash) - Number(bill.total_amount);
          const newExpectedClosing = Number(drawer.opening_balance) + Number(drawer.cash_sales) + Number(drawer.cash_in) - newCashOut;
          db.prepare(`
            UPDATE cash_drawer SET cash_out = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE drawer_id = ?
          `).run(newCashOut, newCurrentCash, newExpectedClosing, drawer.drawer_id);
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
    return db.prepare('SELECT pbi.*, p.name as product_name, p.sku_barcode, p.item_code, p.base_price as product_base_price, p.offer_price as product_offer_price, p.current_stock as product_stock FROM purchase_bill_items pbi LEFT JOIN products p ON pbi.product_id = p.product_id WHERE pbi.purchase_bill_id = ? ORDER BY pbi.created_at ASC').all(purchase_bill_id);
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
    offer_price?: number | null;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
    skip_stock_update?: number;
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

      // Revert stock of previous items before deleting them.
      // Only ESTIMATE bills update inventory stock — check stored bill_type before reverting.
      const oldBill = db.prepare('SELECT bill_number, bill_type FROM purchase_bills WHERE purchase_bill_id = ?').get(bill.purchase_bill_id) as any;
      const oldBillType = oldBill?.bill_type || 'GST';
      const oldBillNum = oldBill?.bill_number;
      const oldItems = db.prepare('SELECT product_id, quantity FROM purchase_bill_items WHERE purchase_bill_id = ?').all(bill.purchase_bill_id) as any[];
      const decreaseStock = db.prepare(`UPDATE products SET current_stock = current_stock - ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?`);
      if (oldBillType === 'ESTIMATE') {
        for (const item of oldItems) {
          decreaseStock.run(item.quantity, item.product_id, bill.tenant_id);
        }
      } else {
        // For old GST bills, only revert stock if this item was NOT dummy (meaning no Estimate existed with same bill number)
        for (const item of oldItems) {
          const hasEstimate = oldBillNum ? db.prepare(`
            SELECT 1 FROM purchase_bill_items pbi
            JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
            WHERE pb.bill_number = ? AND pb.bill_type = 'ESTIMATE' AND pbi.product_id = ? AND pb.tenant_id = ?
            LIMIT 1
          `).get(oldBillNum, item.product_id, bill.tenant_id) : null;
          if (!hasEstimate) {
            decreaseStock.run(item.quantity, item.product_id, bill.tenant_id);
          }
        }
      }

      db.prepare('DELETE FROM purchase_bill_items WHERE purchase_bill_id = ?').run(bill.purchase_bill_id);

      const stmt = db.prepare(`
        INSERT INTO purchase_bill_items (item_id, purchase_bill_id, tenant_id, product_id, name, quantity, purchase_price, total_amount, selling_price, offer_price, is_gst_applicable, tax_rate_percent, hsn_sac_code, skip_stock_update, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      // Two stock statements: ESTIMATE bills update stock+price; GST bills update price only
      const updateStock = db.prepare(`UPDATE products SET current_stock = current_stock + ?, purchase_price = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?`);
      const updatePurchasePriceOnly = db.prepare(`UPDATE products SET purchase_price = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?`);
      const updatePrice = db.prepare(`UPDATE products SET base_price = ? WHERE product_id = ? AND tenant_id = ?`);
      const updateOfferPrice = db.prepare(`UPDATE products SET offer_price = ? WHERE product_id = ? AND tenant_id = ?`);
      for (const item of items) {
        const isGst = billType === 'GST' ? (item.is_gst_applicable ?? 1) : 0;
        const skipStock = item.skip_stock_update ?? 0;
        stmt.run(item.item_id, bill.purchase_bill_id, bill.tenant_id, item.product_id, item.name, item.quantity, item.purchase_price, item.total_amount, item.selling_price != null ? item.selling_price : 0, item.offer_price != null ? item.offer_price : 0, isGst, item.tax_rate_percent ?? 0, item.hsn_sac_code || null, skipStock);
        const actualPurchasePrice = billType === 'GST' && isGst === 1
          ? item.purchase_price * (1 + (item.tax_rate_percent ?? 0) / 100)
          : item.purchase_price;
        // Update stock for Estimates, and for GST bills only if they are not dummy (not shared/skipped)
        if (billType === 'ESTIMATE' || (billType === 'GST' && !item.skip_stock_update)) {
          updateStock.run(item.quantity, actualPurchasePrice, item.product_id, bill.tenant_id);
        } else {
          updatePurchasePriceOnly.run(actualPurchasePrice, item.product_id, bill.tenant_id);
        }
        if (item.selling_price != null) {
          updatePrice.run(item.selling_price, item.product_id, bill.tenant_id);
        }
        if (item.offer_price != null) {
          updateOfferPrice.run(item.offer_price, item.product_id, bill.tenant_id);
        }
      }

      if (paymentType === 'CREDIT' && bill.supplier_id) {
        const party = db.prepare('SELECT balance, gst_balance, estimate_balance FROM parties WHERE party_id = ?').get(bill.supplier_id) as any;
        if (party) {
          const balanceType = billType === 'ESTIMATE' ? 'ESTIMATE' : 'GST';
          const ledgerId = crypto.randomUUID();
          const debitAmount = bill.total_amount;
          const balanceCol = balanceType === 'ESTIMATE' ? 'estimate_balance' : 'gst_balance';
          const currentTypeBalance = parseFloat(party[balanceCol]) || 0;
          const newTypeBalance = currentTypeBalance - debitAmount;
          const newBalance = (parseFloat(party.balance) || 0) - debitAmount;
          db.prepare(`
            INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, payment_method, reference_number, created_by, created_by_name, sync_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(ledgerId, bill.supplier_id, bill.tenant_id, bill.bill_date || localTimestamp(), `Purchase bill ${bill.bill_number} - ${bill.supplier_name}`, 0, debitAmount, newBalance, balanceType, bill.bill_number, 'system', 'System');
          db.prepare(`UPDATE parties SET balance = ?, ${balanceCol} = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`)
            .run(newBalance, newTypeBalance, bill.bill_date || localTimestamp(), bill.supplier_id);
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
      const bill = db.prepare('SELECT supplier_id, bill_number, tenant_id, payment_type, total_amount FROM purchase_bills WHERE purchase_bill_id = ?').get(purchase_bill_id) as any;
      if (bill) {
        if (bill.supplier_id && bill.bill_number) {
          const ledgerEntries = db.prepare(
            'SELECT ledger_id FROM party_ledger WHERE tenant_id = ? AND party_id = ? AND reference_number = ?'
          ).all(bill.tenant_id, bill.supplier_id, bill.bill_number) as any[];
          for (const entry of ledgerEntries) {
            db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?").run(entry.ledger_id);
          }
          recalcPartyBalances(db, bill.supplier_id);
        }

        if (bill.payment_type === 'CASH' && Number(bill.total_amount) > 0) {
          const tx = db.prepare(`SELECT * FROM cash_transactions WHERE tenant_id = ? AND category = 'Purchase Bill' AND notes LIKE ?`).get(bill.tenant_id, `%${bill.bill_number}%`) as any;
          if (tx) {
            db.prepare(`DELETE FROM cash_transactions WHERE transaction_id = ?`).run(tx.transaction_id);
            const drawer = db.prepare(`SELECT * FROM cash_drawer WHERE drawer_id = ?`).get(tx.drawer_id) as any;
            if (drawer) {
              const newCashOut = Math.max(0, Number(drawer.cash_out) - Number(tx.amount));
              const newCurrentCash = Number(drawer.opening_balance) + Number(drawer.cash_sales) + Number(drawer.cash_in) - newCashOut;
              const newExpectedClosing = newCurrentCash;
              db.prepare(`UPDATE cash_drawer SET cash_out = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE drawer_id = ?`).run(newCashOut, newCurrentCash, newExpectedClosing, drawer.drawer_id);
            }
          }
        }
      }
      db.prepare('DELETE FROM purchase_bill_items WHERE purchase_bill_id = ?').run(purchase_bill_id);
      db.prepare('DELETE FROM purchase_bills WHERE purchase_bill_id = ?').run(purchase_bill_id);
    })();
    import('./sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Sync after delete error:', e));
    }).catch(() => {});
    return { success: true };
  } catch (error: any) {
    console.error('[db:deletePurchaseBill]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:productHasEstimateBills', (event, { product_id, tenant_id }: { product_id: string; tenant_id: string }) => {
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT 1 FROM purchase_bill_items pbi
      JOIN purchase_bills pb ON pb.purchase_bill_id = pbi.purchase_bill_id
      WHERE pbi.product_id = ? AND pbi.tenant_id = ? AND pb.bill_type = 'ESTIMATE'
      LIMIT 1
    `).get(product_id, tenant_id);
    return { success: true, hasEstimate: !!row };
  } catch (error: any) {
    console.error('[db:productHasEstimateBills]', error);
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

ipcMain.handle('db:generateBarcode', (event, { tenant_id, item_code, strip_suffix }: { tenant_id: string; item_code?: string; strip_suffix?: string }) => {
  try {
    const db = getDb();
    const prefix = (item_code || '').trim();
    const suffix = strip_suffix || '';
    let nextNum = 1;
    if (prefix) {
      const rows = db.prepare(
        `SELECT sku_barcode FROM products WHERE tenant_id = ? AND sku_barcode LIKE ?`
      ).all(tenant_id, `${prefix}%`) as any[];
      for (const row of rows) {
        let base = row.sku_barcode.slice(prefix.length);
        // Strip known suffix (priceCode) from the end before extracting digits
        if (suffix && base.endsWith(suffix)) {
          base = base.slice(0, -suffix.length);
        }
        // Skip standard/manufacturer barcodes (length >= 8 digits) to avoid auto-increment jumps
        if (base.length >= 8) {
          continue;
        }
        const numStr = base.replace(/\D/g, '');
        if (numStr) {
          const num = parseInt(numStr, 10);
          if (num >= nextNum) nextNum = num + 1;
        }
      }
    } else {
      const rows = db.prepare(
        `SELECT sku_barcode FROM products WHERE tenant_id = ? AND sku_barcode GLOB '[0-9]*'`
      ).all(tenant_id) as any[];
      for (const row of rows) {
        let base = row.sku_barcode;
        // Strip known suffix from the end
        if (suffix && base.endsWith(suffix)) {
          base = base.slice(0, -suffix.length);
        }
        // Skip standard/manufacturer barcodes (length >= 8 digits) to avoid auto-increment jumps
        if (base.length >= 8) {
          continue;
        }
        const numStr = base.replace(/\D/g, '');
        if (numStr) {
          const num = parseInt(numStr, 10);
          if (num >= nextNum) nextNum = num + 1;
        }
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

// ── Cash Drawer Helpers ───────────────────────────────────────────────────────

function getOpenCashDrawer(db: any, tenantId: string, dateStr?: string): any {
  const date = dateStr ? (typeof dateStr === 'string' ? dateStr.slice(0, 10) : localDate(new Date(dateStr))) : localDate();
  let drawer = db.prepare(`SELECT * FROM cash_drawer WHERE tenant_id = ? AND (business_date = ? OR date(business_date) = ? OR business_date LIKE ?) AND status = 'OPEN'`).get(tenantId, date, date, `${date}%`) as any;
  if (!drawer) {
    drawer = db.prepare(`SELECT * FROM cash_drawer WHERE tenant_id = ? AND status = 'OPEN' ORDER BY business_date DESC LIMIT 1`).get(tenantId) as any;
  }
  return drawer || null;
}

function getCashAmountFromInvoice(inv: any): number {
  if (!inv) return 0;
  const pm = (inv.payment_method || '').toUpperCase();
  if (pm === 'CASH') {
    const rec = Number(inv.received_amount);
    const grand = Number(inv.grand_total);
    return rec > 0 ? rec : (grand > 0 ? grand : 0);
  }
  if (pm === 'SPLIT') {
    if (inv.split_details) {
      try {
        const sd = typeof inv.split_details === 'string' ? JSON.parse(inv.split_details) : inv.split_details;
        return Number(sd.cash) || 0;
      } catch {}
    }
  }
  return 0;
}

function reconcileCashDrawer(db: any, tenantId: string, drawer: any): any {
  if (!drawer || !tenantId) return drawer;
  try {
    const storeTz = getStoreTimezoneSetting(db, tenantId);
    const cleanDate = parseCleanDate(drawer.business_date, storeTz);
    const dateLike = `${cleanDate}%`;

    // Calculate total cash sales from settled cash invoices & cash portion of split invoices for this business date
    const salesRow = db.prepare(`
      SELECT 
        COALESCE(SUM(
          CASE 
            WHEN payment_method = 'CASH' THEN (
              CASE WHEN received_amount > 0 THEN received_amount ELSE (CASE WHEN grand_total > 0 THEN grand_total ELSE 0 END) END
            )
            WHEN payment_method = 'SPLIT' AND split_details IS NOT NULL THEN (
              CASE 
                WHEN json_extract(split_details, '$.cash') IS NOT NULL 
                THEN CAST(json_extract(split_details, '$.cash') AS REAL)
                ELSE 0 
              END
            )
            ELSE 0 
          END
        ), 0) AS total_cash_sales
      FROM invoices
      WHERE tenant_id = ?
        AND payment_method IN ('CASH', 'SPLIT')
        AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (is_held IS NULL OR is_held = 0)
        AND (is_deleted IS NULL OR is_deleted = 0 OR is_deleted = '0' OR is_deleted = 0.0)
        AND (
          substr(COALESCE(settled_at, created_at), 1, 10) = ? 
          OR date(COALESCE(settled_at, created_at)) = ?
          OR COALESCE(settled_at, created_at) LIKE ?
        )
    `).get(tenantId, cleanDate, cleanDate, dateLike) as any;

    const calcSales = Math.round(Number(salesRow?.total_cash_sales || 0) * 100) / 100;

    // Calculate Cash In and Cash Out sums across all drawers / transactions for this business date
    const txSums = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE 0 END), 0) AS total_in,
        COALESCE(SUM(CASE WHEN type = 'CASH_OUT' THEN amount ELSE 0 END), 0) AS total_out
      FROM cash_transactions 
      WHERE tenant_id = ? AND (
        drawer_id = ? 
        OR drawer_id IN (SELECT drawer_id FROM cash_drawer WHERE tenant_id = ? AND (business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ?))
        OR date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ?
      )
    `).get(tenantId, drawer.drawer_id, tenantId, cleanDate, cleanDate, dateLike, cleanDate, cleanDate, dateLike, cleanDate) as any;

    const calcIn = Math.round(Number(txSums?.total_in || 0) * 100) / 100;
    const calcOut = Math.round(Number(txSums?.total_out || 0) * 100) / 100;

    const openingBal = Math.round(Number(drawer.opening_balance || 0) * 100) / 100;
    const expectedCash = Math.round((openingBal + calcSales + calcIn - calcOut) * 100) / 100;

    drawer.cash_sales = calcSales;
    drawer.cash_in = calcIn;
    drawer.cash_out = calcOut;
    drawer.current_cash = expectedCash;
    drawer.expected_closing = expectedCash;

    if (drawer.status === 'CLOSED' && drawer.actual_cash !== null && drawer.actual_cash !== undefined) {
      const actual = Math.round(Number(drawer.actual_cash) * 100) / 100;
      const variance = Math.round((actual - expectedCash) * 100) / 100;
      drawer.cash_short = variance < 0 ? Math.abs(variance) : 0;
      drawer.cash_excess = variance > 0 ? variance : 0;
      db.prepare(`
        UPDATE cash_drawer 
        SET cash_sales = ?, cash_in = ?, cash_out = ?, current_cash = ?, expected_closing = ?, cash_short = ?, cash_excess = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
        WHERE drawer_id = ?
      `).run(calcSales, calcIn, calcOut, expectedCash, expectedCash, drawer.cash_short, drawer.cash_excess, drawer.drawer_id);
    } else {
      db.prepare(`
        UPDATE cash_drawer 
        SET cash_sales = ?, cash_in = ?, cash_out = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
        WHERE drawer_id = ?
      `).run(calcSales, calcIn, calcOut, expectedCash, expectedCash, drawer.drawer_id);
    }
  } catch (err: any) {
    console.error('[Cashier] reconcileCashDrawer error:', err.message);
  }
  return drawer;
}

function autoClosePastOpenDrawers(db: any, tenantId: string) {
  if (!tenantId) return;
  try {
    const today = localDate();
    const openDrawers = db.prepare(`
      SELECT * FROM cash_drawer
      WHERE tenant_id = ? AND status = 'OPEN'
    `).all(tenantId) as any[];

    if (Array.isArray(openDrawers) && openDrawers.length > 0) {
      for (const d of openDrawers) {
        const cleanDate = parseCleanDate(d.business_date);
        if (cleanDate < today) {
          reconcileCashDrawer(db, tenantId, d);
          const exp = Number(d.expected_closing || 0);
          db.prepare(`
            UPDATE cash_drawer SET
              status = 'CLOSED',
              actual_cash = COALESCE(actual_cash, ?),
              cash_short = 0,
              cash_excess = 0,
              closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
              closing_remarks = COALESCE(closing_remarks, 'Auto-closed past shift on date transition'),
              sync_status = 'PENDING',
              updated_at = CURRENT_TIMESTAMP
            WHERE drawer_id = ?
          `).run(exp, d.drawer_id);
        }
      }
    }
  } catch (err: any) {
    console.error('[Cashier] autoClosePastOpenDrawers error:', err.message);
  }
}

function adjustCashDrawerForInvoice(
  db: any,
  tenantId: string,
  invoiceCreatedAt: string | Date | undefined,
  oldCashAmount: number,
  newCashAmount: number
) {
  const diff = (Number(newCashAmount) || 0) - (Number(oldCashAmount) || 0);
  if (Math.abs(diff) < 0.001) return; // No change in cash amount

  let businessDate = localDate();
  if (invoiceCreatedAt) {
    try {
      const d = new Date(invoiceCreatedAt);
      if (!isNaN(d.getTime())) {
        businessDate = localDate(d);
      }
    } catch {}
  }

  let drawer = db.prepare(`SELECT * FROM cash_drawer WHERE tenant_id = ? AND (business_date = ? OR date(business_date) = ? OR business_date LIKE ?)`).get(tenantId, businessDate, businessDate, `${businessDate}%`) as any;

  if (!drawer) {
    drawer = getOpenCashDrawer(db, tenantId, businessDate);
  }

  if (drawer) {
    reconcileCashDrawer(db, tenantId, drawer);
  }
}

// ── Cashier & Settlement IPC Handlers ─────────────────────────────────────────

ipcMain.handle('db:cashier:getDrawer', (event, { tenant_id, business_date }: { tenant_id: string; business_date?: string }) => {
  try {
    const db = getDb();
    autoClosePastOpenDrawers(db, tenant_id);
    const date = business_date ? parseCleanDate(business_date) : localDate();
    let drawer = db.prepare(`SELECT * FROM cash_drawer WHERE tenant_id = ? AND (business_date = ? OR date(business_date) = ? OR business_date LIKE ?)`).get(tenant_id, date, date, `${date}%`) as any;
    if (!drawer) {
      drawer = db.prepare(`SELECT * FROM cash_drawer WHERE tenant_id = ? AND status = 'OPEN' ORDER BY business_date DESC LIMIT 1`).get(tenant_id) as any;
    }

    if (drawer) {
      drawer = reconcileCashDrawer(db, tenant_id, drawer);
    }

    return drawer || null;
  } catch (error: any) {
    console.error(`[Cashier] getDrawer error:`, error.message);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:setOpeningBalance', safeHandler((event, { tenant_id, opening_balance, user_id, user_name }: { tenant_id: string; opening_balance: number; user_id: string; user_name?: string }) => {
  try {
    const db = getDb();
    autoClosePastOpenDrawers(db, tenant_id);
    const date = localDate();

    const existing = db.prepare(`SELECT * FROM cash_drawer WHERE tenant_id = ? AND business_date = ?`).get(tenant_id, date) as any;
    
    if (existing) {
      const newOpening = Number(opening_balance);
      const cashSales = Number(existing.cash_sales || 0);
      const cashIn = Number(existing.cash_in || 0);
      const cashOut = Number(existing.cash_out || 0);
      const newCurrentCash = newOpening + cashSales + cashIn - cashOut;

      db.prepare(`
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
      `).run(newOpening, newCurrentCash, newCurrentCash, user_id, existing.drawer_id);
    } else {
      const drawer_id = crypto.randomUUID();
      const newOpening = Number(opening_balance);
      db.prepare(`
        INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, opening_balance, current_cash, expected_closing, status, opened_by, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, 'PENDING')
      `).run(drawer_id, tenant_id, date, newOpening, newOpening, newOpening, user_id);
    }
    
    const dId = existing ? existing.drawer_id : '';
    db.prepare(`
      INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(crypto.randomUUID(), tenant_id, dId, 'OPENING_BALANCE_SET', JSON.stringify({ opening_balance, business_date: date }), user_id, user_name || null);
    
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('sync:data-updated');
    import('./sync/syncWorker.js').then(({ triggerUrgentCashSync }) => {
      triggerUrgentCashSync().catch(e => console.error('[Main] Immediate urgent cash sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
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
      WHERE i.tenant_id = ? 
        AND i.payment_method = 'PENDING' 
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (i.is_held IS NULL OR i.is_held = 0)
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
    `;
    const params: any[] = [tenant_id];
    
    if (search) {
      query += ` AND (i.invoice_number LIKE ? OR i.customer_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ` ORDER BY i.created_at DESC LIMIT 1000`;
    const results = db.prepare(query).all(...params);
    return results;
  } catch (error: any) {
    console.error('[db:cashier:getPendingInvoices]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:settlePayment', safeHandler((event, { tenant_id, invoice_id, received_amount, payment_method, payment_source_id, split_details, user_id, user_name }: {
  tenant_id: string; invoice_id: string; received_amount: number; payment_method: string; payment_source_id?: string; split_details?: any; user_id: string; user_name?: string
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
      
      const subtotal = Number(invoice.subtotal) || 0;
      const taxTotal = Number(invoice.tax_total) || 0;
      const prevDiscount = Number(invoice.discount_total) || 0;
      const oldGrandTotal = Number(invoice.grand_total) || Math.max(0, subtotal + taxTotal - prevDiscount);
      const received = Number(received_amount);

      const additionalDiscount = Math.max(0, oldGrandTotal - received);
      const newDiscountTotal = prevDiscount + additionalDiscount;
      const newGrandTotal = Math.max(0, subtotal + taxTotal - newDiscountTotal);
      const discountValue = newDiscountTotal;
      const discountType = 'FIXED';

      db.prepare(`
        UPDATE invoices SET 
          payment_method = ?, 
          split_details = ?, 
          received_amount = ?, 
          discount_total = ?, 
          discount_value = ?, 
          discount_type = ?, 
          grand_total = ?, 
          settled_at = CURRENT_TIMESTAMP,
          sync_status = 'PENDING', 
          updated_at = CURRENT_TIMESTAMP
        WHERE invoice_id = ? AND tenant_id = ?
      `).run(payment_method, split_details ? (typeof split_details === 'object' ? JSON.stringify(split_details) : split_details) : null, received, newDiscountTotal, discountValue, discountType, newGrandTotal, invoice_id, tenant_id);
      
      const date = localDate();
      const drawer = getOpenCashDrawer(db, tenant_id, date);

      if (payment_method === 'CASH' || (payment_method === 'SPLIT' && split_details?.cash)) {
        if (drawer) {
          const scrapD = Number(invoice.scrap_deduction) || 0;
          const returnD = Number(invoice.return_deduction) || 0;
          const totalDeductions = scrapD + returnD;
          const sub = Number(invoice.subtotal) || 0;
          const tax = Number(invoice.tax_total) || 0;
          const disc = Number(invoice.discount_total) || 0;
          const ptsDisc = Number(invoice.points_redeemed_discount) || 0;
          const preDeductionTotal = Math.max(0, sub + tax - disc - ptsDisc);
          const calculatedRefund = totalDeductions > preDeductionTotal ? totalDeductions - preDeductionTotal : 0;
          const actualRefund = received < 0 ? Math.abs(received) : (calculatedRefund > 0 ? calculatedRefund : 0);

          if (actualRefund > 0) {
            const transaction_id = crypto.randomUUID();
            db.prepare(`
              INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, entered_by_name, sync_status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
            `).run(transaction_id, tenant_id, drawer.drawer_id, 'CASH_OUT', actualRefund, 'CREDIT_REFUND', `Refund leftover credits for settled invoice ${invoice.invoice_number}`, user_id, user_name || null);
          }
        }
      } else if (payment_source_id) {
        // Non-cash payment against a configured bank / card / UPI source
        const source = db.prepare(`SELECT * FROM payment_sources WHERE source_id = ? AND tenant_id = ? AND is_deleted = 0 AND is_enabled = 1`).get(payment_source_id, tenant_id) as any;
        if (source) {
          const newBalance = Number(source.current_balance) + received;
          db.prepare(`
            INSERT INTO payment_source_transactions (transaction_id, tenant_id, source_id, type, amount, category, reference_number, notes, transaction_date, running_balance, entered_by, entered_by_name, sync_status)
            VALUES (?, ?, ?, 'CASH_IN', ?, 'Invoice Payment', ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, 'PENDING')
          `).run(
            crypto.randomUUID(), tenant_id, payment_source_id, received,
            invoice.invoice_number, `Invoice ${invoice.invoice_number} settled via ${payment_method}`,
            newBalance, user_id, user_name || null
          );
          db.prepare(`UPDATE payment_sources SET current_balance = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE source_id = ? AND tenant_id = ?`)
            .run(newBalance, payment_source_id, tenant_id);
        }
      }
      
      if (drawer) {
        reconcileCashDrawer(db, tenant_id, drawer);
      }

      db.prepare(`
        INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(
        crypto.randomUUID(), tenant_id, drawer ? drawer.drawer_id : null, 'PAYMENT_COMPLETED',
        JSON.stringify({ invoice_id, invoice_number: invoice.invoice_number, received_amount: received, discount: newDiscountTotal, payment_method, split_details: split_details || null, grand_total: newGrandTotal }),
        user_id, user_name || null
      );
    });
    
    tx();
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('sync:data-updated');
    import('./sync/syncWorker.js').then(({ triggerUrgentInvoiceSync, triggerUrgentCashSync }) => {
      triggerUrgentInvoiceSync().catch(e => console.error('[Main] Immediate urgent sync error:', e));
      triggerUrgentCashSync().catch(e => console.error('[Main] Immediate urgent cash sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
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
      const date = localDate();
      const drawer = getOpenCashDrawer(db, tenant_id, date);
      if (!drawer) throw new Error('No open cash drawer for today. Set opening balance first.');
      
      const transaction_id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, entered_by_name, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(transaction_id, tenant_id, drawer.drawer_id, type, amount, category || null, notes || null, user_id, user_name || null);
      
      reconcileCashDrawer(db, tenant_id, drawer);
      
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
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('sync:data-updated');
    import('./sync/syncWorker.js').then(({ triggerUrgentCashSync }) => {
      triggerUrgentCashSync().catch(e => console.error('[Main] Immediate urgent cash sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
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
    let expected = 0;
    let actual = 0;
    let cash_short = 0;
    let cash_excess = 0;

    const tx = db.transaction(() => {
      const date = business_date ? (typeof business_date === 'string' ? business_date.slice(0, 10) : localDate(new Date(business_date))) : localDate();
      let drawer = db.prepare(`SELECT * FROM cash_drawer WHERE tenant_id = ? AND (business_date = ? OR date(business_date) = ? OR business_date LIKE ?)`).get(tenant_id, date, date, `${date}%`) as any;
      if (!drawer) {
        drawer = db.prepare(`SELECT * FROM cash_drawer WHERE tenant_id = ? AND status = 'OPEN' ORDER BY business_date DESC LIMIT 1`).get(tenant_id) as any;
      }
      if (!drawer) throw new Error(`No open cash drawer found for ${date}`);
      
      drawer = reconcileCashDrawer(db, tenant_id, drawer);

      const cashIn = Math.round(Number(drawer.cash_in || 0) * 100) / 100;
      const cashOut = Math.round(Number(drawer.cash_out || 0) * 100) / 100;
      const openingBal = Math.round(Number(drawer.opening_balance || 0) * 100) / 100;
      const cashSales = Math.round(Number(drawer.cash_sales || 0) * 100) / 100;

      expected = Math.round(Number(drawer.expected_closing || (openingBal + cashSales + cashIn - cashOut)) * 100) / 100;
      actual = Math.round(Number(actual_cash) * 100) / 100;
      const variance = Math.round((actual - expected) * 100) / 100;
      cash_short = variance < 0 ? Math.abs(variance) : 0;
      cash_excess = variance > 0 ? variance : 0;
      
      db.prepare(`
        UPDATE cash_drawer SET 
          cash_sales = ?,
          cash_in = ?, 
          cash_out = ?, 
          current_cash = ?, 
          expected_closing = ?, 
          actual_cash = ?, 
          cash_short = ?, 
          cash_excess = ?, 
          closing_remarks = ?, 
          status = 'CLOSED', 
          closed_by = ?, 
          closed_at = CURRENT_TIMESTAMP, 
          sync_status = 'PENDING', 
          updated_at = CURRENT_TIMESTAMP
        WHERE drawer_id = ?
      `).run(cashSales, cashIn, cashOut, expected, expected, actual, cash_short, cash_excess, closing_remarks || null, user_id, drawer.drawer_id);
      
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
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('sync:data-updated');
    import('./sync/syncWorker.js').then(({ triggerUrgentCashSync }) => {
      triggerUrgentCashSync().catch(e => console.error('[Main] Immediate urgent cash sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    return { success: true, expected_closing: expected, actual_cash: actual, cash_short, cash_excess };
  } catch (error: any) {
    console.error('[db:cashier:dayClosing]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:cashier:getTransactions', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const date = localDate();
    const dateLike = `${date}%`;
    let drawers = db.prepare(`SELECT drawer_id FROM cash_drawer WHERE tenant_id = ? AND (business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ?)`).all(tenant_id, date, date, dateLike, date) as any[];
    if (!drawers || drawers.length === 0) {
      drawers = db.prepare(`SELECT drawer_id FROM cash_drawer WHERE tenant_id = ? AND status = 'OPEN' ORDER BY business_date DESC LIMIT 1`).all(tenant_id) as any[];
    }
    const drawerIds = (drawers || []).map(d => d.drawer_id).filter(Boolean);
    if (drawerIds.length === 0) {
      return db.prepare(`SELECT * FROM cash_transactions WHERE tenant_id = ? AND (date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ?) ORDER BY transaction_date DESC`).all(tenant_id, date, dateLike, date);
    }
    const placeholders = drawerIds.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM cash_transactions WHERE tenant_id = ? AND (drawer_id IN (${placeholders}) OR date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ?) ORDER BY transaction_date DESC`).all(tenant_id, ...drawerIds, date, dateLike, date);
  } catch (error: any) {
    console.error('[db:cashier:getTransactions]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:getHistory', (event, { tenant_id, limit = 30, offset = 0 }: { tenant_id: string; limit?: number; offset?: number }) => {
  try {
    const db = getDb();
    autoClosePastOpenDrawers(db, tenant_id);
    const rows = db.prepare(`
      SELECT cd.*,
        u1.name as opened_by_name,
        u2.name as closed_by_name,
        (SELECT COUNT(*) FROM invoices i WHERE i.tenant_id = cd.tenant_id AND i.payment_method NOT IN ('PENDING', 'HOLD_DRAFT') AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')) AND (i.is_held IS NULL OR i.is_held = 0) AND (date(COALESCE(i.settled_at, i.created_at)) = date(cd.business_date) OR COALESCE(i.settled_at, i.created_at) LIKE SUBSTR(cd.business_date, 1, 10) || '%' OR substr(COALESCE(i.settled_at, i.created_at), 1, 10) = SUBSTR(cd.business_date, 1, 10)) AND (i.is_deleted IS NULL OR i.is_deleted = 0)) as settled_count,
        (SELECT COALESCE(SUM(i.received_amount), 0) FROM invoices i WHERE i.tenant_id = cd.tenant_id AND i.payment_method NOT IN ('PENDING', 'HOLD_DRAFT') AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')) AND (i.is_held IS NULL OR i.is_held = 0) AND (date(COALESCE(i.settled_at, i.created_at)) = date(cd.business_date) OR COALESCE(i.settled_at, i.created_at) LIKE SUBSTR(cd.business_date, 1, 10) || '%' OR substr(COALESCE(i.settled_at, i.created_at), 1, 10) = SUBSTR(cd.business_date, 1, 10)) AND (i.is_deleted IS NULL OR i.is_deleted = 0)) as total_collected
      FROM cash_drawer cd
      LEFT JOIN users u1 ON cd.opened_by = u1.user_id
      LEFT JOIN users u2 ON cd.closed_by = u2.user_id
      WHERE cd.tenant_id = ?
      ORDER BY cd.business_date DESC
      LIMIT ? OFFSET ?
    `).all(tenant_id, limit, offset) as any[];

    if (Array.isArray(rows)) {
      rows.forEach(r => reconcileCashDrawer(db, tenant_id, r));
    }
    return rows;
  } catch (error: any) {
    console.error('[db:cashier:getHistory]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:getDaySettlements', (event, { tenant_id, business_date }: { tenant_id: string; business_date: string }) => {
  try {
    const db = getDb();
    const cleanDate = business_date ? business_date.split('T')[0].split(' ')[0] : '';
    const dateLike = `${cleanDate}%`;
    return db.prepare(`
      SELECT i.*, u.name as biller_name
      FROM invoices i
      LEFT JOIN users u ON i.user_id = u.user_id
      WHERE i.tenant_id = ? 
        AND i.payment_method NOT IN ('PENDING', 'HOLD_DRAFT') 
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (i.is_held IS NULL OR i.is_held = 0)
        AND (
          date(COALESCE(i.settled_at, i.created_at)) = ? 
          OR COALESCE(i.settled_at, i.created_at) LIKE ? 
          OR substr(COALESCE(i.settled_at, i.created_at), 1, 10) = ?
        )
        AND (i.is_deleted IS NULL OR i.is_deleted = 0)
      ORDER BY COALESCE(i.settled_at, i.updated_at, i.created_at) DESC
    `).all(tenant_id, cleanDate, dateLike, cleanDate);
  } catch (error: any) {
    console.error('[db:cashier:getDaySettlements]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:getDayTransactions', (event, { tenant_id, business_date }: { tenant_id: string; business_date: string }) => {
  try {
    const db = getDb();
    const cleanDate = business_date ? business_date.split('T')[0].split(' ')[0] : '';
    const dateLike = `${cleanDate}%`;
    const drawers = db.prepare(`SELECT drawer_id FROM cash_drawer WHERE tenant_id = ? AND (business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ?)`).all(tenant_id, cleanDate, cleanDate, dateLike, cleanDate) as any[];
    const drawerIds = (drawers || []).map(d => d.drawer_id).filter(Boolean);
    if (drawerIds.length === 0) {
      return db.prepare(`SELECT * FROM cash_transactions WHERE tenant_id = ? AND (date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ?) ORDER BY transaction_date DESC`).all(tenant_id, cleanDate, dateLike, cleanDate);
    }
    const placeholders = drawerIds.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM cash_transactions WHERE tenant_id = ? AND (drawer_id IN (${placeholders}) OR date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ?) ORDER BY transaction_date DESC`).all(tenant_id, ...drawerIds, cleanDate, dateLike, cleanDate);
  } catch (error: any) {
    console.error('[db:cashier:getDayTransactions]', error);
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
    if (name && phone) {
      const cleanName = name.trim().replace(/\s+/g, ' ');
      query += ` AND (name LIKE ? OR phone LIKE ?)`;
      params.push(`%${cleanName}%`, `%${phone.trim()}%`);
    } else if (name) {
      const cleanName = name.trim().replace(/\s+/g, ' ');
      query += ` AND (name LIKE ? OR phone LIKE ?)`;
      params.push(`%${cleanName}%`, `%${cleanName}%`);
    } else if (phone) {
      query += ` AND phone LIKE ?`;
      params.push(`%${phone.trim()}%`);
    }
    query += ` ORDER BY name COLLATE NOCASE ASC LIMIT 25`;
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
      SELECT *
      FROM invoices
      WHERE customer_id = ? AND tenant_id = ? AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')) AND (is_held IS NULL OR is_held = 0) AND (is_deleted IS NULL OR is_deleted = 0)
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
    const existingInv = db.prepare(`SELECT tenant_id, payment_method, received_amount, grand_total, split_details, created_at, invoice_number FROM invoices WHERE invoice_id = ?`).get(invoice_id) as any;
    const oldCash = existingInv ? getCashAmountFromInvoice(existingInv) : 0;

    db.transaction(() => {
      const inv = db.prepare('SELECT tenant_id, converted_from_invoice_id, converted_to_invoice_id FROM invoices WHERE invoice_id = ?').get(invoice_id) as any;

      // A conversion copy never moved stock — do NOT restore it (would double stock).
      // The superseded BoS owns the deduction.
      const isConversionCopy = !!(inv && inv.converted_from_invoice_id);

      const items = db.prepare('SELECT product_id, quantity, qty_from_paper_stock FROM invoice_items WHERE invoice_id = ?').all(invoice_id) as any[];
      const restoreStockStmt = db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?');
      const deductStockStmt = db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?');
      if (!isConversionCopy) {
        for (const item of items) {
          restoreStockStmt.run(item.quantity, item.product_id, inv.tenant_id);
        }
      }
      db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(invoice_id);

      // If a copy was deleted, un-supersede its BoS so it can be converted again
      if (isConversionCopy && inv) {
        db.prepare(`
          UPDATE invoices SET
            converted_to_invoice_id = NULL,
            converted_to_invoice_number = NULL,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
          WHERE invoice_id = ?
        `).run(inv.converted_from_invoice_id);
      }

      // If a BoS was deleted, unlink its GST copy
      if (!isConversionCopy && inv && inv.converted_to_invoice_id) {
        db.prepare(`
          UPDATE invoices SET
            converted_from_invoice_id = NULL,
            converted_from_invoice_number = NULL,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
          WHERE invoice_id = ?
        `).run(inv.converted_to_invoice_id);
      }

      db.prepare("UPDATE invoices SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?").run(invoice_id);
    })();

    if (existingInv) {
      syncInvoiceCreditLedger(db, existingInv, true);
    }

    if (existingInv && oldCash > 0) {
      adjustCashDrawerForInvoice(db, existingInv.tenant_id, existingInv.created_at, oldCash, 0);
    }

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
