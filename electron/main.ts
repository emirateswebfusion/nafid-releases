import { app, BrowserWindow, ipcMain, session, safeStorage, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import os from 'node:os';
import { execSync } from 'node:child_process';
import dns from 'node:dns';
import { autoUpdater } from 'electron-updater';
import dotenv from 'dotenv';
import log from 'electron-log/main';
import { dbGetStaff, dbSaveStaff, dbVerifyBillerPin, dbGetStaffLedger, dbAddStaffTransaction, dbGetStaffAttendance, dbSaveStaffAttendance, localSaveUser, localAuthenticateUser, autoDeduplicateCustomersAndParties, CustomerIdentityService } from './db/localDb';
import { calculateCashierSettlement } from './utils/cashierSettlement';
import { initWhatsAppIpc } from './whatsapp/whatsappService';


// Initialize and configure structured logging
log.initialize();
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
Object.assign(console, log.functions);

const resolveGstApplicability = (gstFlag: unknown, hsnCode: unknown): number => {
  const hasHsnCode = String(hsnCode ?? '').trim() !== '';
  const isExplicitlyGst = gstFlag === undefined || gstFlag === null || gstFlag === true || gstFlag === 'true' || Number(gstFlag) === 1;
  return hasHsnCode || isExplicitlyGst ? 1 : 0;
};

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

// â”€â”€ IPC Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  return process.env.DEFAULT_LAN_IP || '';
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
      ip: process.env.DEFAULT_LAN_IP || '',
      subnetPrefix: '24',
      netmask: '255.255.255.0',
      gateway: process.env.DEFAULT_GATEWAY || '',
      dns: process.env.DEFAULT_DNS || ''
    };
  }
});

// â”€â”€ IPC Input Validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
// DO NOT put real secrets there â€” they'd be extractable from the installed app.
if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN && fs.existsSync(envPath)) {
  const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf-8'));
  if (parsed.GH_TOKEN) {
    process.env.GH_TOKEN = parsed.GH_TOKEN;
    console.log('[Main] GH_TOKEN loaded manually from env file');
  }
}
// â”€â”€ Local Time Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

/** Returns store timestamp in UTC ISO format: YYYY-MM-DDTHH:mm:ss.sssZ */
function localTimestamp(d: Date = new Date()): string {
  return d.toISOString();
}

/** Returns store business date string in store timezone: YYYY-MM-DD */
function localDate(d: Date = new Date(), tenantId?: string): string {
  try {
    const db = getDb();
    const tz = getStoreTimezoneSetting(db, tenantId || 'global');
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  }
}

/** Helper to compute start and end UTC bounds for business date range in store timezone */
function getUtcRangeForStoreDateRange(fromDate?: string, toDate?: string, tenantId: string = 'global'): { startUtc: string; endUtc: string } {
  try {
    const db = getDb();
    const tz = getStoreTimezoneSetting(db, tenantId);
    const today = localDate(new Date(), tenantId);

    const startDay = fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) ? fromDate : today;
    const endDay = toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate) ? toDate : startDay;

    const parseWallClock = (dateStr: string, isEnd: boolean): Date => {
      const [y, m, d] = dateStr.split('-').map(Number);
      const targetH = isEnd ? 23 : 0;
      const targetMin = isEnd ? 59 : 0;
      const targetSec = isEnd ? 59 : 0;

      const baseUtc = new Date(Date.UTC(y, m - 1, d, targetH, targetMin, targetSec));
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false,
        });
        const parts = Object.fromEntries(formatter.formatToParts(baseUtc).map(p => [p.type, p.value]));
        let h = parseInt(parts.hour, 10);
        if (h === 24) h = 0;
        const tzAsUtc = Date.UTC(
          parseInt(parts.year, 10),
          parseInt(parts.month, 10) - 1,
          parseInt(parts.day, 10),
          h,
          parseInt(parts.minute, 10),
          parseInt(parts.second, 10)
        );
        const offsetMs = tzAsUtc - baseUtc.getTime();
        const resolved = new Date(baseUtc.getTime() - offsetMs);
        return isEnd ? new Date(resolved.getTime() + 999) : resolved;
      } catch {
        return baseUtc;
      }
    };

    return {
      startUtc: parseWallClock(startDay, false).toISOString(),
      endUtc: parseWallClock(endDay, true).toISOString(),
    };
  } catch {
    const now = new Date();
    return { startUtc: now.toISOString(), endUtc: now.toISOString() };
  }
}

function parseCleanDate(dStr: any, timeZone?: string): string {
  const activeTz = timeZone || (typeof getDb === 'function' && getDb() ? getStoreTimezoneSetting(getDb(), 'global') : 'Asia/Kolkata');
  if (!dStr) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: activeTz }).format(new Date());
    } catch {
      return localDate();
    }
  }
  const str = String(dStr).trim();

  // 1. Match YYYY-MM-DD or YYYY/MM/DD at start
  const yyyymmdd = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (yyyymmdd) {
    return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;
  }

  // 2. Match DD-MM-YYYY or DD/MM/YYYY at start
  const ddmmyyyy = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }

  let formatted = str.replace(/Z$/i, '');
  if (formatted.includes(' ')) formatted = formatted.replace(' ', 'T');

  const d = new Date(formatted);
  if (!isNaN(d.getTime())) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: activeTz }).format(d);
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

// Helper to safely access mainWindow across async boundaries
function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

// Updater state machine (module scope for access in IPC handlers)
type UpdaterState = 'idle' | 'checking' | 'update-available' | 'downloading' | 'downloaded' | 'error';
let updaterState: UpdaterState = 'idle';
let lastCheckTime = 0;
let isUpdateCheckInProgress = false;
let updateCheckTimer: NodeJS.Timeout | null = null;
const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes minimum between checks
const STARTUP_CHECK_DELAY_MS = 30 * 1000; // Wait 30s after startup before first check

function setUpdaterState(newState: UpdaterState) {
  const oldState = updaterState;
  updaterState = newState;
  log.info(`[Updater] State transition: ${oldState} -> ${newState}`);
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    // Map internal 'downloaded' state to 'ready-to-install' so the renderer
    // knows to enable the install button (renderer only handles 'ready-to-install').
    const broadcastState = newState === 'downloaded' ? 'ready-to-install' : newState;
    win.webContents.send('update-status', broadcastState);
  }
}

function canCheckForUpdates(): boolean {
  const now = Date.now();
  if (isUpdateCheckInProgress) return false;
  if (now - lastCheckTime < MIN_CHECK_INTERVAL_MS) return false;
  if (updaterState === 'checking' || updaterState === 'downloading') return false;
  return true;
}

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
  app.on('second-instance', (event, commandLine) => {
    // Someone tried to run a second instance, we should focus our window.
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      
      // On Windows, the deep link URL is in the commandLine arguments
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
    // Only forward tokens that look like JWTs (3 dot-separated base64 parts)
    // This prevents arbitrary data injection from other apps that register vendora://
    if (token && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
      win.webContents.send('auth:deep-link', token);
    }
  } catch (err) {
    log.error('[DeepLink] Failed to parse URL:', url, err);
  }
}

function setupCSP() {
  const isDev = !app.isPackaged;
  // Cloud API URL â€” set VENDORA_CLOUD_API in .env
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
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
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
    directives.push("script-src 'self' 'unsafe-inline'");
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
    show: false, // Don't show until ready-to-show
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

  // Handle renderer load failures
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    log.error(`[Main] Renderer failed to load: ${errorCode} - ${errorDescription} - ${validatedURL} - isMainFrame: ${isMainFrame}`);
    if (isMainFrame && app.isPackaged) {
      // In production, try to reload once
      if (!win.webContents.isLoading()) {
        log.warn('[Main] Attempting to reload renderer...');
        win.loadFile(path.join(__dirname, '../dist/index.html')).catch((e) => {
          log.error('[Main] Reload failed:', e);
        });
      }
    }
  });

  win.webContents.on('render-process-gone', (event, details) => {
    log.error('[Main] Render process gone:', details);
  });

  win.webContents.on('unresponsive', () => {
    log.warn('[Main] Renderer became unresponsive');
  });

  win.webContents.on('responsive', () => {
    log.info('[Main] Renderer became responsive again');
  });

  if (!app.isPackaged) {
    // Development: Load from Vite dev server — requires ELECTRON_DEV_SERVER_URL in .env
    const devUrl = process.env.ELECTRON_DEV_SERVER_URL;
    if (!devUrl) {
      throw new Error('[Electron] ELECTRON_DEV_SERVER_URL environment variable is required in development mode.');
    }
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: Load from built files
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window when ready - this is the critical fix for invisible window
  win.once('ready-to-show', () => {
    if (win && !win.isDestroyed()) {
      log.info('[Main] Window ready-to-show, showing and focusing');
      win.show();
      win.focus();
    }
  });

  // Fallback: if ready-to-show doesn't fire within 10 seconds, force show
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
    } catch {}
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

  // Initialize minimal DB connection first (fast)
  initDb();
  log.info('[Main] Database initialized');

  // Run auto-deduplication to clean up existing duplicates and create partial unique indexes
  try {
    const dedupResult = autoDeduplicateCustomersAndParties();
    log.info(`[Main] Auto-deduplication completed: ${dedupResult.merged_customers} customers, ${dedupResult.merged_parties} parties merged`);
  } catch (e: any) {
    log.warn('[Main] Auto-deduplication failed (non-fatal):', e.message);
  }

  // Setup CSP and create window FIRST - show UI immediately
  setupCSP();
  mainWindow = createWindow();

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

  // Initialize hardware and sync worker after window exists
  if (mainWindow) {
    initBarcodeScanner(mainWindow);
    initWeighingScale(mainWindow);
    initPrinter();
    initWhatsAppIpc();
    initSyncWorker();
  }

  // Run heavy database operations in background (non-blocking)
  setImmediate(() => {
    try {
      log.info('[Main] Running background database maintenance...');
      backfillCreditInvoices(getDb());
      log.info('[Main] Credit invoices backfill complete');
    } catch (e) {
      log.error('[Main] Backfill credit invoices error:', e);
    }

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
      // Self-heal: ensure grand_total reflects net total after discounts
      _db.prepare(`
        UPDATE invoices 
        SET grand_total = MAX(0, COALESCE(subtotal, 0) + COALESCE(tax_total, 0) - COALESCE(discount_total, 0) - COALESCE(points_redeemed_discount, 0) - COALESCE(scrap_deduction, 0) - COALESCE(return_deduction, 0))
        WHERE (COALESCE(discount_total, 0) > 0 OR COALESCE(points_redeemed_discount, 0) > 0 OR COALESCE(scrap_deduction, 0) > 0 OR COALESCE(return_deduction, 0) > 0)
          AND grand_total > (COALESCE(subtotal, 0) + COALESCE(tax_total, 0) - COALESCE(discount_total, 0) - COALESCE(points_redeemed_discount, 0) - COALESCE(scrap_deduction, 0) - COALESCE(return_deduction, 0) + 0.01)
      `).run();
      
      // Self-heal: fix any invoices with literal string 'null' or empty string in split_details
      _db.prepare("UPDATE invoices SET split_details = NULL WHERE split_details = 'null' OR split_details = 'undefined' OR split_details = ''").run();
      
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
        log.info(`[Main] Auto-expired ${staleBills.length} stale held bill(s) on startup`);
      }
    } catch (e: any) {
      log.warn('[Main] Failed to expire stale holds on startup:', e.message);
    }
  });

  // Post-startup party balance recalculation (run after initial sync completes)
  setTimeout(() => {
    try {
      const _db = getDb();
      const parties = _db.prepare(`SELECT party_id FROM parties WHERE (is_deleted IS NULL OR is_deleted = 0)`).all() as { party_id: string }[];
      if (parties.length > 0) {
        log.info(`[Main] Post-startup party balance recalculation: ${parties.length} parties...`);
        for (const p of parties) {
          try { recalcPartyBalances(_db, p.party_id); } catch {}
        }
        log.info('[Main] Party balance recalculation complete.');
      }
    } catch (e: any) {
      log.warn('[Main] Party balance recalc error:', e.message);
    }
  }, 30000); // Increased to 30s to let initial sync complete first

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Auto-Update Configuration with proper state machine
  const updaterToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  if (updaterToken) {
    autoUpdater.requestHeaders = {
      Authorization: `token ${updaterToken}`
    };
    log.info('[Updater] Configured GitHub authorization headers for private repo updates.');
  }

  // Disable auto-download initially - we'll control it via state machine
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  async function performUpdateCheck(notify: boolean = false): Promise<void> {
    if (!canCheckForUpdates()) {
      log.debug('[Updater] Skipping check - conditions not met', { state: updaterState, lastCheckTime, inProgress: isUpdateCheckInProgress });
      return;
    }

    isUpdateCheckInProgress = true;
    lastCheckTime = Date.now();
    setUpdaterState('checking');

    try {
      log.info('[Updater] Checking for updates...');
      const result = await autoUpdater.checkForUpdatesAndNotify();
      
      if (result && result.isUpdateAvailable && result.updateInfo) {
        log.info('[Updater] Update available:', result.updateInfo.version);
        setUpdaterState('update-available');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-info', result.updateInfo);
        }
        // Auto-download the update
        try {
          setUpdaterState('downloading');
          await autoUpdater.downloadUpdate();
        } catch (downloadErr) {
          log.error('[Updater] Download failed:', downloadErr);
          setUpdaterState('error');
        }
      } else {
        log.info('[Updater] No updates available');
        setUpdaterState('idle');
      }
    } catch (err: any) {
      const msg = err.message || '';
      log.error('[Updater] Check error:', msg);
      
      // Network errors are not critical - keep app usable
      const isNetworkError = 
        msg.includes('net::ERR_') ||
        msg.includes('ENOTFOUND') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('ENETUNREACH') ||
        msg.includes('request failed') ||
        msg.toLowerCase().includes('network') ||
        msg.includes('404') ||
        msg.includes('Cannot find') ||
        msg.includes('no published version');
      
      if (isNetworkError) {
        log.warn('[Updater] Network error during check, keeping app usable');
        setUpdaterState('idle');
      } else {
        setUpdaterState('error');
      }
    } finally {
      isUpdateCheckInProgress = false;
    }
  }

  // Event handlers for auto-updater events
  autoUpdater.on('update-available', (info) => {
    log.info('[Updater] Update available (event):', info.version);
    // Only set state and notify UI here. The actual download is triggered by the
    // state-machine callers (performUpdateCheck / app:checkForUpdates) that already
    // call downloadUpdate() after this event fires. Calling it a second time here
    // causes a race condition where two concurrent downloads collide, leaving slow
    // machines stuck at 100% with the download never completing.
    if (updaterState !== 'downloading' && updaterState !== 'downloaded') {
      setUpdaterState('update-available');
    }
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-info', info);
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-download-progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[Updater] Update downloaded and ready to install:', info?.version);
    setUpdaterState('downloaded');
  });

  autoUpdater.on('error', (err) => {
    log.error('[Updater] Error:', err);
    // Don't transition to error state if we're already downloaded (install can still proceed)
    if (updaterState !== 'downloaded') {
      setUpdaterState('error');
    }
  });

  // Schedule periodic update checks (30 minutes)
  function scheduleNextUpdateCheck() {
    if (updateCheckTimer) {
      clearTimeout(updateCheckTimer);
    }
    updateCheckTimer = setTimeout(() => {
      performUpdateCheck().finally(() => {
        scheduleNextUpdateCheck();
      });
    }, MIN_CHECK_INTERVAL_MS);
  }

  // Initial check after startup delay
  setTimeout(() => {
    performUpdateCheck(true).finally(() => {
      scheduleNextUpdateCheck();
    });
  }, STARTUP_CHECK_DELAY_MS);

  // Cleanup on quit
  app.on('before-quit', () => {
    if (updateCheckTimer) {
      clearTimeout(updateCheckTimer);
      updateCheckTimer = null;
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// â”€â”€ IPC Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ Auth Token Persistence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getConfigPath = () => path.join(app.getPath('userData'), 'config.json');
const getEncryptedPath = () => path.join(app.getPath('userData'), 'auth.enc');
const getOfflineSessionPath = () => path.join(app.getPath('userData'), 'offline-auth.enc');

const encrypt = (text: string): Buffer | null => {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[Auth] safeStorage unavailable â€” token will be stored in plaintext on disk');
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

function clearOfflineSession() {
  const offlinePath = getOfflineSessionPath();
  if (fs.existsSync(offlinePath)) fs.unlinkSync(offlinePath);
}

function readOfflineSession(): any {
  const offlinePath = getOfflineSessionPath();
  if (!fs.existsSync(offlinePath)) return null;
  const decrypted = decrypt(fs.readFileSync(offlinePath));
  if (!decrypted) return null;
  try {
    return JSON.parse(decrypted);
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
    // Also persist user credentials into local SQLite database for offline login capability
    if (payload && payload.user_id && payload.tenant_id) {
      localSaveUser({
        user_id: payload.user_id,
        tenant_id: payload.tenant_id,
        name: payload.user_name || payload.email,
        email: payload.email || payload.user_name,
        password_hash: payload.password_hash,
        role: payload.role,
        restricted_page: payload.restricted_page,
        permissions: payload.permissions,
        login_enabled: payload.login_enabled
      });
    }
    clearOfflineSession();
    setSyncActive(true);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: 'Failed to save token' };
  }
});

ipcMain.removeHandler('auth:saveOfflineSession');
ipcMain.handle('auth:saveOfflineSession', (event, payload) => {
  try {
    if (!payload?.tenant_id || !payload?.user_id || !payload?.role) {
      return { success: false, error: 'Incomplete offline session' };
    }
    const session = {
      tenant_id: String(payload.tenant_id),
      user_id: String(payload.user_id),
      role: String(payload.role),
      user_name: String(payload.user_name || ''),
      shop_name: String(payload.shop_name || ''),
      restricted_page: payload.restricted_page ? String(payload.restricted_page) : null,
      permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    };
    const encrypted = encrypt(JSON.stringify(session));
    if (!encrypted) throw new Error('Unable to encrypt offline session');
    fs.writeFileSync(getOfflineSessionPath(), encrypted);

    // Offline authentication must not leave an older cloud token active.
    const encryptedPath = getEncryptedPath();
    const configPath = getConfigPath();
    if (fs.existsSync(encryptedPath)) fs.unlinkSync(encryptedPath);
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    setSyncActive(false);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to save offline session' };
  }
});

ipcMain.removeHandler('auth:getOfflineSession');
ipcMain.handle('auth:getOfflineSession', () => {
  try {
    return readOfflineSession();
  } catch {
    return null;
  }
});

ipcMain.removeHandler('auth:saveLocalUser');
ipcMain.handle('auth:saveLocalUser', (event, payload) => {
  try {
    localSaveUser(payload);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.removeHandler('auth:loginOffline');
ipcMain.handle('auth:loginOffline', (event, payload) => {
  try {
    const { email, password } = payload || {};
    if (!email || !password) {
      return { success: false, error: 'Email and password required' };
    }
    return localAuthenticateUser(email, password);
  } catch (error: any) {
    return { success: false, error: error.message || 'Offline authentication failed' };
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
    clearOfflineSession();
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
  log.info('[Updater] Triggering quitAndInstall...');
  setImmediate(() => {
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (e) {
      log.error('[Updater] quitAndInstall error:', e);
    }
    setTimeout(() => {
      BrowserWindow.getAllWindows().forEach(w => {
        try { w.destroy(); } catch (err) {}
      });
      app.exit(0);
    }, 800);
  });
});

ipcMain.handle('app:downloadUpdate', async () => {
  try {
    if (updaterState === 'downloading' || updaterState === 'downloaded') {
      log.warn('[Updater] Download already in progress or completed');
      return { success: true, message: 'Download already in progress' };
    }
    log.info('[Updater] Manual download triggered');
    setUpdaterState('downloading');
    await autoUpdater.downloadUpdate();
    // Note: setUpdaterState('downloaded') is handled by the 'update-downloaded' event
    return { success: true };
  } catch (error: any) {
    log.error('[Updater] Download error:', error);
    setUpdaterState('error');
    return { success: false, error: error.message || 'Operation failed' };
  }
});

ipcMain.handle('app:checkForUpdates', async () => {
  try {
    // For manual checks, bypass the state machine throttling but still prevent concurrent checks
    if (isUpdateCheckInProgress) {
      return { success: false, error: 'Check already in progress' };
    }
    
    isUpdateCheckInProgress = true;
    lastCheckTime = Date.now();
    setUpdaterState('checking');
    
    log.info('[Updater] Manual check for updates...');
    const result = await autoUpdater.checkForUpdatesAndNotify();
    
    // result contains complex objects (like CancellationToken) that cannot be cloned over IPC.
    // We only return the updateInfo which is serializable.
    if (result && result.isUpdateAvailable && result.updateInfo) {
      log.info('[Updater] Manual check found update:', result.updateInfo.version);
      setUpdaterState('update-available');
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-info', result.updateInfo);
      }
      // Auto-start download
      try {
        setUpdaterState('downloading');
        await autoUpdater.downloadUpdate();
      } catch (downloadErr) {
        log.error('[Updater] Auto-download after manual check failed:', downloadErr);
        setUpdaterState('error');
      }
      return { success: true, updateInfo: result.updateInfo };
    }
    // No update available — already on latest version
    log.info('[Updater] Manual check: no updates available');
    setUpdaterState('idle');
    return { success: true, updateInfo: null };
  } catch (error: any) {
    log.error('[Updater] Manual check error:', error);
    const msg = error.message || '';
    // 404 means no release found on the current channel — likely already up-to-date
    if (msg.includes('404') || msg.includes('Cannot find') || msg.includes('no published version')) {
      setUpdaterState('idle');
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
      setUpdaterState('idle');
      return { success: false, error: 'No internet connection' };
    }
    setUpdaterState('error');
    return { success: false, error: msg };
  } finally {
    isUpdateCheckInProgress = false;
  }
});

// â”€â”€ DEBUG: Sync State Diagnostic (remove after fixing) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

function buildProductSearchConditions(search: string, tablePrefix: string = 'p.') {
  const cleanSearch = String(search).trim();
  const tokens = cleanSearch.split(/\s+/).filter(w => w.length > 0);
  const p = tablePrefix;

  const buildSingleFieldGroup = (val: string) => {
    const valNoSpace = val.replace(/\s+/g, '');
    const valClean = val.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const sql = `(${p}name LIKE ? OR REPLACE(${p}name, ' ', '') LIKE ? OR CLEAN_STR(${p}name) LIKE ? OR ${p}sku_barcode LIKE ? OR REPLACE(${p}sku_barcode, ' ', '') LIKE ? OR CLEAN_STR(${p}sku_barcode) LIKE ? OR ${p}item_code LIKE ? OR REPLACE(${p}item_code, ' ', '') LIKE ? OR CLEAN_STR(${p}item_code) LIKE ? OR ${p}brand_manufacturer LIKE ? OR REPLACE(${p}brand_manufacturer, ' ', '') LIKE ? OR CLEAN_STR(${p}brand_manufacturer) LIKE ? OR ${p}category LIKE ? OR REPLACE(${p}category, ' ', '') LIKE ? OR CLEAN_STR(${p}category) LIKE ? OR ${p}hsn_sac_code LIKE ? OR CLEAN_STR(${p}hsn_sac_code) LIKE ?)`;
    const params = [
      `%${val}%`, `%${valNoSpace}%`, `%${valClean}%`,
      `%${val}%`, `%${valNoSpace}%`, `%${valClean}%`,
      `%${val}%`, `%${valNoSpace}%`, `%${valClean}%`,
      `%${val}%`, `%${valNoSpace}%`, `%${valClean}%`,
      `%${val}%`, `%${valNoSpace}%`, `%${valClean}%`,
      `%${val}%`, `%${valClean}%`,
    ];
    return { sql, params };
  };

  if (tokens.length <= 1) {
    const single = buildSingleFieldGroup(cleanSearch);
    return {
      sql: `(${single.sql} OR ${p}product_id = ?)`,
      params: [...single.params, cleanSearch]
    };
  }

  const tokenClauses: string[] = [];
  const tokenParams: any[] = [];
  for (const token of tokens) {
    const tGroup = buildSingleFieldGroup(token);
    tokenClauses.push(tGroup.sql);
    tokenParams.push(...tGroup.params);
  }

  const fullGroup = buildSingleFieldGroup(cleanSearch);
  const sql = `((${tokenClauses.join(' AND ')}) OR ${fullGroup.sql} OR ${p}product_id = ?)`;
  const params = [...tokenParams, ...fullGroup.params, cleanSearch];

  return { sql, params };
}

ipcMain.handle('db:getProducts', (event, arg: any) => {
  try {
    const db = getDb();
    const tenantId = typeof arg === 'string' ? arg : arg?.tenant_id;
    if (!tenantId) {
      console.warn('[db:getProducts] Called with no tenant_id â€” returning []');
      return [];
    }

    console.log(`[db:getProducts] Called â€” tenantId=${tenantId} arg=${JSON.stringify(arg)}`);

    if (typeof arg === 'string' || (!arg.limit && !arg.search && !arg.barcode && !arg.sortBy && !arg.filterDate && !arg.isGst && !arg.dateField && (!arg.stockStatus || arg.stockStatus === 'all'))) {
      const rows = db.prepare(`
        SELECT p.*, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price,
          CASE WHEN (COALESCE(pb_paper.paper_in, 0) - COALESCE(inv_paper.paper_out, 0)) != 0
               THEN (COALESCE(pb_paper.paper_in, 0) - COALESCE(inv_paper.paper_out, 0))
               WHEN CAST(JSON_EXTRACT(p.domain_attributes, '$.paper_stock') AS REAL) IS NOT NULL
               THEN CAST(JSON_EXTRACT(p.domain_attributes, '$.paper_stock') AS REAL)
               ELSE 0
          END as paper_stock
        FROM products p 
        LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id 
        LEFT JOIN (
          SELECT product_id, SUM(quantity) as paper_in
          FROM purchase_bill_items
          WHERE skip_stock_update = 1 AND tenant_id = ?
          GROUP BY product_id
        ) pb_paper ON p.product_id = pb_paper.product_id
        LEFT JOIN (
          SELECT product_id, SUM(qty_from_paper_stock) as paper_out
          FROM invoice_items
          WHERE tenant_id = ?
          GROUP BY product_id
        ) inv_paper ON p.product_id = inv_paper.product_id
        WHERE p.tenant_id = ? AND p.is_deleted = 0 
        ORDER BY p.name COLLATE NOCASE ASC, p.product_id ASC
      `).all(tenantId, tenantId, tenantId);
      console.log(`[db:getProducts] Full list query â†’ ${rows.length} rows returned for tenant ${tenantId}`);
      return rows;
    }

    const { limit, offset, search, sortBy, barcode, filterDate, isGst, dateField, stockStatus } = arg;
    let query = `
      SELECT p.*, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price,
        CASE WHEN (COALESCE(pb_paper.paper_in, 0) - COALESCE(inv_paper.paper_out, 0)) != 0
             THEN (COALESCE(pb_paper.paper_in, 0) - COALESCE(inv_paper.paper_out, 0))
             WHEN CAST(JSON_EXTRACT(p.domain_attributes, '$.paper_stock') AS REAL) IS NOT NULL
             THEN CAST(JSON_EXTRACT(p.domain_attributes, '$.paper_stock') AS REAL)
             ELSE 0
        END as paper_stock
      FROM products p 
      LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id 
      LEFT JOIN (
        SELECT product_id, SUM(quantity) as paper_in
        FROM purchase_bill_items
        WHERE skip_stock_update = 1 AND tenant_id = ?
        GROUP BY product_id
      ) pb_paper ON p.product_id = pb_paper.product_id
      LEFT JOIN (
        SELECT product_id, SUM(qty_from_paper_stock) as paper_out
        FROM invoice_items
        WHERE tenant_id = ?
        GROUP BY product_id
      ) inv_paper ON p.product_id = inv_paper.product_id
      WHERE p.tenant_id = ? AND p.is_deleted = 0
    `;
    const params: any[] = [tenantId, tenantId, tenantId];

    if (isGst !== undefined) {
       query += ' AND p.is_gst_applicable = ?';
       params.push(isGst ? 1 : 0);
    }

    if (stockStatus && stockStatus !== 'all') {
      if (stockStatus === 'low_stock' || stockStatus === 'low') {
        query += ' AND p.current_stock <= p.reorder_level AND p.reorder_level > 0 AND p.current_stock > 0';
      } else if (stockStatus === 'out_of_stock' || stockStatus === 'out') {
        query += ' AND p.current_stock <= 0 AND COALESCE((COALESCE(pb_paper.paper_in, 0) - COALESCE(inv_paper.paper_out, 0)), CAST(JSON_EXTRACT(p.domain_attributes, \'$.paper_stock\') AS REAL), 0) <= 0';
      } else if (stockStatus === 'in_stock' || stockStatus === 'in') {
        query += ' AND (p.current_stock > 0 OR COALESCE((COALESCE(pb_paper.paper_in, 0) - COALESCE(inv_paper.paper_out, 0)), CAST(JSON_EXTRACT(p.domain_attributes, \'$.paper_stock\') AS REAL), 0) > 0)';
      } else if (stockStatus === 'no_barcode' || stockStatus === 'no_code') {
        query += " AND (p.sku_barcode IS NULL OR TRIM(p.sku_barcode) = '')";
      }
    }

    if (barcode) {
       const cleanBarcode = String(barcode).trim();
       const cleanBarcodeNoSpace = cleanBarcode.replace(/\s+/g, '');
       query += ' AND (TRIM(p.sku_barcode) = ? OR LOWER(p.sku_barcode) = LOWER(?) OR REPLACE(p.sku_barcode, \' \', \'\') = ? OR TRIM(p.item_code) = ? OR LOWER(p.item_code) = LOWER(?) OR REPLACE(p.item_code, \' \', \'\') = ?)';
        params.push(cleanBarcode, cleanBarcode, cleanBarcodeNoSpace, cleanBarcode, cleanBarcode, cleanBarcodeNoSpace);
     } else if (search) {
        const cond = buildProductSearchConditions(search, 'p.');
        query += ` AND ${cond.sql}`;
        params.push(...cond.params);
     }

     if (filterDate && String(filterDate).trim() !== '') {
        const dateCol = dateField === 'updated_at' ? 'COALESCE(p.updated_at, p.created_at)' : 'p.created_at';
        const cleanStart = parseCleanDate(filterDate);
        const cleanEnd = arg.filterDateEnd && String(arg.filterDateEnd).trim() !== '' ? parseCleanDate(arg.filterDateEnd) : cleanStart;
        const { startUtc, endUtc } = getUtcRangeForStoreDateRange(cleanStart, cleanEnd, tenantId);
        query += ` AND (${dateCol} >= ? AND ${dateCol} <= ?)`;
        params.push(startUtc, endUtc);
     }

     if (sortBy === 'created_at') query += ' ORDER BY p.created_at DESC, p.product_id ASC';
     else if (sortBy === 'updated_at') query += ' ORDER BY p.updated_at DESC, p.product_id ASC';
     else if (sortBy === 'created_at') query += ' ORDER BY p.created_at DESC, p.product_id ASC';
     else if (sortBy === 'updated_at') query += ' ORDER BY p.updated_at DESC, p.product_id ASC';
     else if (sortBy === 'stock') query += ' ORDER BY p.current_stock ASC, p.product_id ASC';
     else if (search) {
        const cleanSearch = String(search).trim();
        const cleanSearchNoSpace = cleanSearch.replace(/\s+/g, '');
        const cleanSearchClean = cleanSearch.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        query += ` ORDER BY ` +
          `CASE ` +
            `WHEN TRIM(p.sku_barcode) = ? OR TRIM(p.item_code) = ? OR REPLACE(p.sku_barcode, ' ', '') = ? OR REPLACE(p.item_code, ' ', '') = ? OR CLEAN_STR(p.sku_barcode) = ? OR CLEAN_STR(p.item_code) = ? THEN 1 ` +
            `WHEN TRIM(p.sku_barcode) LIKE ? OR TRIM(p.item_code) LIKE ? OR REPLACE(p.sku_barcode, ' ', '') LIKE ? OR REPLACE(p.item_code, ' ', '') LIKE ? OR CLEAN_STR(p.sku_barcode) LIKE ? OR CLEAN_STR(p.item_code) LIKE ? THEN 2 ` +
            `WHEN p.sku_barcode LIKE ? OR p.item_code LIKE ? OR REPLACE(p.sku_barcode, ' ', '') LIKE ? OR REPLACE(p.item_code, ' ', '') LIKE ? OR CLEAN_STR(p.sku_barcode) LIKE ? OR CLEAN_STR(p.item_code) LIKE ? THEN 3 ` +
            `WHEN p.name LIKE ? OR REPLACE(p.name, ' ', '') LIKE ? OR CLEAN_STR(p.name) LIKE ? THEN 4 ` +
            `WHEN p.name LIKE ? OR REPLACE(p.name, ' ', '') LIKE ? OR CLEAN_STR(p.name) LIKE ? THEN 5 ` +
            `WHEN p.brand_manufacturer LIKE ? OR REPLACE(p.brand_manufacturer, ' ', '') LIKE ? OR CLEAN_STR(p.brand_manufacturer) LIKE ? THEN 6 ` +
            `WHEN p.brand_manufacturer LIKE ? OR REPLACE(p.brand_manufacturer, ' ', '') LIKE ? OR CLEAN_STR(p.brand_manufacturer) LIKE ? THEN 7 ` +
            `ELSE 8 ` +
          `END ASC, ` +
          `p.name COLLATE NOCASE ASC, ` +
          `p.product_id ASC`;
        params.push(
          cleanSearch, cleanSearch, cleanSearchNoSpace, cleanSearchNoSpace, cleanSearchClean, cleanSearchClean,
          `${cleanSearch}%`, `${cleanSearch}%`, `${cleanSearchNoSpace}%`, `${cleanSearchNoSpace}%`, `${cleanSearchClean}%`, `${cleanSearchClean}%`,
          `%${cleanSearch}%`, `%${cleanSearch}%`, `%${cleanSearchNoSpace}%`, `%${cleanSearchNoSpace}%`, `%${cleanSearchClean}%`, `%${cleanSearchClean}%`,
          `${cleanSearch}%`, `${cleanSearchNoSpace}%`, `${cleanSearchClean}%`,
          `%${cleanSearch}%`, `%${cleanSearchNoSpace}%`, `%${cleanSearchClean}%`,
          `${cleanSearch}%`, `${cleanSearchNoSpace}%`, `${cleanSearchClean}%`,
          `%${cleanSearch}%`, `%${cleanSearchNoSpace}%`, `%${cleanSearchClean}%`
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
       const cond = buildProductSearchConditions(arg.search, '');
       query += ` AND ${cond.sql}`;
       params.push(...cond.params);
    }

    if (arg?.filterDate && String(arg.filterDate).trim() !== '') {
       const dateCol = arg?.dateField === 'updated_at' ? 'COALESCE(updated_at, created_at)' : 'created_at';
       const cleanStart = parseCleanDate(arg.filterDate);
       const cleanEnd = arg.filterDateEnd && String(arg.filterDateEnd).trim() !== '' ? parseCleanDate(arg.filterDateEnd) : cleanStart;
       const { startUtc, endUtc } = getUtcRangeForStoreDateRange(cleanStart, cleanEnd, tenantId);
       query += ` AND (${dateCol} >= ? AND ${dateCol} <= ?)`;
       params.push(startUtc, endUtc);
    }

    if (arg?.stockStatus && arg.stockStatus !== 'all') {
      if (arg.stockStatus === 'low_stock' || arg.stockStatus === 'low') {
        query += ' AND current_stock <= reorder_level AND reorder_level > 0 AND current_stock > 0';
      } else if (arg.stockStatus === 'out_of_stock' || arg.stockStatus === 'out') {
        query += ' AND current_stock <= 0';
      } else if (arg.stockStatus === 'in_stock' || arg.stockStatus === 'in') {
        query += ' AND current_stock > 0';
      } else if (arg.stockStatus === 'no_barcode' || arg.stockStatus === 'no_code') {
        query += " AND (sku_barcode IS NULL OR TRIM(sku_barcode) = '')";
      }
    }

    if (arg?.isGst !== undefined) {
      query += ' AND is_gst_applicable = ?';
      params.push(arg.isGst ? 1 : 0);
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
      resolveGstApplicability(p.is_gst_applicable, p.hsn_sac_code),
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
      // The soft-deleted duplicate still occupies the UNIQUE '99' â€” clear it first, then hand it over.
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
      resolveGstApplicability(p.is_gst_applicable, p.hsn_sac_code),
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

// Lightweight GST/Estimate toggle â€” flips only is_gst_applicable without touching
// any other product field.
ipcMain.handle('db:updateProductGstFlag', safeHandler((event, { tenant_id, product_id, is_gst_applicable }: { tenant_id: string; product_id: string; is_gst_applicable: number }) => {
  const db = getDb();
  const res = db.prepare(`
    UPDATE products
    SET is_gst_applicable = CASE WHEN ? = 1 OR TRIM(COALESCE(hsn_sac_code, '')) <> '' THEN 1 ELSE 0 END,
        sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
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

ipcMain.handle('db:bulkDeleteProducts', (event, productIds: string[]) => {
  try {
    const db = getDb();
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return { success: true, count: 0 };
    }
    const placeholders = productIds.map(() => '?').join(',');
    const stmt = db.prepare(`UPDATE products SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id IN (${placeholders})`);
    const res = stmt.run(...productIds);
    return { success: true, count: res.changes };
  } catch (error: any) {
    console.error('[db:bulkDeleteProducts]', error);
    return { success: false, error: 'Bulk delete failed: ' + (error?.message || 'Unknown error') };
  }
});

ipcMain.handle('db:bulkImportProducts', safeHandler((event, products: any[]) => {
  try {
    const db = getDb();
    
    if (!products.length) return { success: true };
    const tenantId = products[0].tenant_id;
    
    // Get pricing tiers for this tenant to map names to IDs
    interface PricingTier { pricing_tier_id: string; name: string; }
    const tiers = db.prepare('SELECT pricing_tier_id, name FROM pricing_tiers WHERE tenant_id = ? AND is_deleted = 0').all(tenantId) as PricingTier[];
    const tierNameToId = new Map<string, string>();
    for (const t of tiers) {
      tierNameToId.set(t.name.toLowerCase().trim(), t.pricing_tier_id);
    }
    
    // Helper: get or create tier by name dynamically (auto-create if missing)
    const getOrCreateTierId = (tierName: string): string => {
      const trimmed = tierName.trim();
      const normalized = trimmed.toLowerCase();
      let tierId = tierNameToId.get(normalized);
      if (tierId) return tierId;

      // Dynamic match against existing tiers (strip spaces and non-alphanumeric chars)
      const cleanName = normalized.replace(/[^a-z0-9]/g, '');
      if (cleanName) {
        for (const t of tiers) {
          const cleanTier = t.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (
            cleanName === cleanTier ||
            cleanName === `${cleanTier}price` ||
            cleanName === `${cleanTier}rate` ||
            cleanTier.includes(cleanName) ||
            cleanName.includes(cleanTier)
          ) {
            tierNameToId.set(normalized, t.pricing_tier_id);
            return t.pricing_tier_id;
          }
        }
      }
      
      // Auto-create missing tier dynamically with the exact provided name
      const newTierId = crypto.randomUUID();
      const now = localTimestamp(new Date());
      db.prepare(`
        INSERT INTO pricing_tiers (pricing_tier_id, tenant_id, name, is_active, sort_order, is_deleted, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, 0, 'PENDING', ?, ?)
      `).run(newTierId, tenantId, trimmed, tiers.length, now, now);
      
      tierNameToId.set(normalized, newTierId);
      if (cleanName) tierNameToId.set(cleanName, newTierId);
      tiers.push({ pricing_tier_id: newTierId, name: trimmed });
      console.log('[bulkImportProducts] Auto-created dynamic tier:', trimmed, '->', newTierId);
      return newTierId;
    };
    
    const transaction = db.transaction((prods) => {
      const findExistingByBarcode = db.prepare(`SELECT product_id FROM products WHERE tenant_id = ? AND sku_barcode = ?`);
      const findExistingByItemCode = db.prepare(`SELECT product_id FROM products WHERE tenant_id = ? AND item_code = ?`);
      const findExistingByName = db.prepare(`SELECT product_id FROM products WHERE tenant_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND COALESCE(brand_manufacturer, '') = COALESCE(?, '')`);

      const insertStmt = db.prepare(`
        INSERT INTO products (
          product_id, tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
          purchase_price, base_price, is_gst_applicable, tax_rate_percent,
          uom, brand_manufacturer, current_stock, reorder_level, domain_attributes,
          discount_percent, discount_flat, offer_price,
          is_deleted, billing_type, grade_id, pricing_mode, average_weight_per_piece, weight_override_allowed,
          sync_status, print_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, ?)
      `);

      const updateStmt = db.prepare(`
        UPDATE products SET
          name = ?,
          sku_barcode = COALESCE(?, sku_barcode),
          item_code = COALESCE(?, item_code),
          category = COALESCE(?, category),
          hsn_sac_code = COALESCE(?, hsn_sac_code),
          purchase_price = ?,
          base_price = ?,
          is_gst_applicable = ?,
          tax_rate_percent = ?,
          uom = COALESCE(?, uom),
          brand_manufacturer = COALESCE(?, brand_manufacturer),
          current_stock = ?,
          reorder_level = ?,
          domain_attributes = COALESCE(?, domain_attributes),
          discount_percent = ?,
          discount_flat = ?,
          offer_price = ?,
          is_deleted = 0,
          billing_type = COALESCE(?, billing_type),
          grade_id = COALESCE(?, grade_id),
          pricing_mode = COALESCE(?, pricing_mode),
          average_weight_per_piece = COALESCE(?, average_weight_per_piece),
          weight_override_allowed = COALESCE(?, weight_override_allowed),
          sync_status = 'PENDING',
          updated_at = ?
        WHERE product_id = ?
      `);
      
      const tierStmt = db.prepare(`
        INSERT INTO product_pricing (product_pricing_id, tenant_id, product_id, pricing_tier_id, price, is_deleted, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 'PENDING', ?, ?)
        ON CONFLICT(product_id, pricing_tier_id) DO UPDATE SET
          price = EXCLUDED.price,
          is_deleted = 0,
          sync_status = 'PENDING',
          updated_at = EXCLUDED.updated_at
      `);
      
      const now = new Date();
      for (const p of prods) {
        now.setMilliseconds(now.getMilliseconds() + 1);
        const timestamp = localTimestamp(now);

        const cleanBarcode = (p.sku_barcode && String(p.sku_barcode).trim()) ? String(p.sku_barcode).trim() : null;
        const cleanItemCode = (p.item_code && String(p.item_code).trim()) ? String(p.item_code).trim() : null;
        const cleanName = (p.name && String(p.name).trim()) ? String(p.name).trim() : '';

        let existingId: string | null = null;
        if (cleanBarcode) {
          const row = findExistingByBarcode.get(tenantId, cleanBarcode) as any;
          if (row?.product_id) existingId = row.product_id;
        }
        if (!existingId && cleanItemCode) {
          const row = findExistingByItemCode.get(tenantId, cleanItemCode) as any;
          if (row?.product_id) existingId = row.product_id;
        }
        if (!existingId && cleanName) {
          const row = findExistingByName.get(tenantId, cleanName, p.brand_manufacturer || '') as any;
          if (row?.product_id) existingId = row.product_id;
        }

        const effectiveProductId = existingId || p.product_id || crypto.randomUUID();

        if (existingId) {
          updateStmt.run(
            p.name,
            cleanBarcode,
            cleanItemCode,
            p.category || null,
            p.hsn_sac_code || null,
            p.purchase_price || 0,
            p.base_price || 0,
            resolveGstApplicability(p.is_gst_applicable, p.hsn_sac_code),
            p.tax_rate_percent || 0,
            p.uom || 'Pcs',
            p.brand_manufacturer || null,
            p.current_stock || 0,
            p.reorder_level || 0,
            typeof p.domain_attributes === 'string' ? p.domain_attributes : JSON.stringify(p.domain_attributes ?? {}),
            p.discount_percent ?? null,
            p.discount_flat ?? null,
            p.offer_price ?? null,
            p.billing_type || 'PIECE',
            p.grade_id || null,
            p.pricing_mode || 'FIXED_PRICE',
            p.average_weight_per_piece ?? null,
            p.weight_override_allowed ?? 0,
            timestamp,
            existingId
          );
        } else {
          insertStmt.run(
            effectiveProductId,
            p.tenant_id,
            p.name,
            cleanBarcode,
            cleanItemCode,
            p.category || null,
            p.hsn_sac_code || null,
            p.purchase_price || 0,
            p.base_price || 0,
            resolveGstApplicability(p.is_gst_applicable, p.hsn_sac_code),
            p.tax_rate_percent || 0,
            p.uom || 'Pcs',
            p.brand_manufacturer || null,
            p.current_stock || 0,
            p.reorder_level || 0,
            typeof p.domain_attributes === 'string' ? p.domain_attributes : JSON.stringify(p.domain_attributes ?? {}),
            p.discount_percent ?? null,
            p.discount_flat ?? null,
            p.offer_price ?? null,
            p.billing_type || 'PIECE',
            p.grade_id || null,
            p.pricing_mode || 'FIXED_PRICE',
            p.average_weight_per_piece ?? null,
            p.weight_override_allowed ?? 0,
            timestamp,
            timestamp
          );
        }
        
        // Handle tier prices - support both tier_id keys and tier_name keys
        if (p.tier_prices && typeof p.tier_prices === 'object') {
          for (const [key, price] of Object.entries(p.tier_prices)) {
            const priceNum = Number(price);
            if (!isNaN(priceNum) && priceNum >= 0) {
              let tierId = tierNameToId.get(key.toLowerCase().trim());
              // Also try direct tier_id match
              if (!tierId) {
                const directMatch = tiers.find(t => t.pricing_tier_id === key);
                if (directMatch) tierId = directMatch.pricing_tier_id;
              }
              // Auto-create tier if not found
              if (!tierId) {
                tierId = getOrCreateTierId(key);
              }
              if (tierId) {
                tierStmt.run(crypto.randomUUID(), tenantId, effectiveProductId, tierId, priceNum, timestamp, timestamp);
              }
            }
          }
        }
      }
    });
    transaction(products);
    return { success: true };
  } catch (error: any) {
    console.error('[db:bulkImportProducts]', error);
    return { success: false, error: error?.message || 'Operation failed' };
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

// â”€â”€ Pricing Tier Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('db:getPricingTiers', (event, tenantId: string) => {
  try {
    const db = getDb();
    const tid = tenantId || 'global';
    return db.prepare(`
      SELECT * FROM pricing_tiers
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND is_deleted = 0
      ORDER BY sort_order ASC, name COLLATE NOCASE ASC
    `).all(tid);
  } catch (error: any) {
    console.error('[db:getPricingTiers]', error);
    return [];
  }
});

ipcMain.handle('db:addPricingTier', safeHandler((event, t) => {
  try {
    const db = getDb();
    const tid = t.tenant_id || 'global';
    const cleanName = String(t.name || '').trim();
    if (!cleanName) return { success: false, error: 'Name is required' };

    // Check if an existing tier with the same name exists
    const existing = db.prepare(`
      SELECT pricing_tier_id, is_deleted FROM pricing_tiers
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND LOWER(TRIM(name)) = LOWER(?)
    `).get(tid, cleanName) as any;

    const isActive = (t.is_active === false || t.is_active === 0 || t.is_active === '0') ? 0 : 1;

    if (existing) {
      db.prepare(`
        UPDATE pricing_tiers
        SET is_active = ?, is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE pricing_tier_id = ?
      `).run(isActive, existing.pricing_tier_id);
      return { success: true, pricing_tier_id: existing.pricing_tier_id };
    }

    const nextSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM pricing_tiers WHERE tenant_id = ? OR tenant_id = \'global\'').get(tid) as any;
    const tierId = t.pricing_tier_id || crypto.randomUUID();

    db.prepare(`
      INSERT INTO pricing_tiers (pricing_tier_id, tenant_id, name, is_active, sort_order, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(tierId, tid, cleanName, isActive, t.sort_order ?? (nextSort?.next_sort || 0));
    return { success: true, pricing_tier_id: tierId };
  } catch (error: any) {
    console.error('[db:addPricingTier]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:updatePricingTier', safeHandler((event, t) => {
  try {
    const db = getDb();
    const isActive = (t.is_active === false || t.is_active === 0 || t.is_active === '0') ? 0 : 1;
    const cleanName = String(t.name || '').trim();
    db.prepare(`
      UPDATE pricing_tiers
      SET name = COALESCE(NULLIF(?, ''), name), is_active = ?, sort_order = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE pricing_tier_id = ?
    `).run(cleanName, isActive, t.sort_order ?? 0, t.pricing_tier_id);
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

ipcMain.handle('db:setDefaultPricingTier', safeHandler((event, payload: { tenant_id: string; pricing_tier_id: string }) => {
  try {
    const db = getDb();
    let { tenant_id, pricing_tier_id } = payload || {};
    pricing_tier_id = pricing_tier_id || '';

    if (!tenant_id && pricing_tier_id) {
      const targetTier = db.prepare('SELECT tenant_id FROM pricing_tiers WHERE pricing_tier_id = ?').get(pricing_tier_id) as any;
      if (targetTier?.tenant_id) tenant_id = targetTier.tenant_id;
    }
    const tid = tenant_id || 'global';

    if (pricing_tier_id) {
      const targetTier = db.prepare('SELECT tenant_id FROM pricing_tiers WHERE pricing_tier_id = ?').get(pricing_tier_id) as any;
      const actualTenantId = targetTier?.tenant_id || tid;

      db.prepare(`
        UPDATE pricing_tiers
        SET is_default = CASE WHEN pricing_tier_id = ? THEN 1 ELSE 0 END,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? OR tenant_id = ? OR tenant_id = 'global'
      `).run(pricing_tier_id, actualTenantId, tid);
    } else {
      db.prepare(`
        UPDATE pricing_tiers
        SET is_default = 0,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? OR tenant_id = 'global'
      `).run(tid);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[db:setDefaultPricingTier]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:getProductPricing', (event, tenantId: string) => {
  try {
    const db = getDb();
    const tid = tenantId || 'global';
    return db.prepare(`
      SELECT * FROM product_pricing
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND is_deleted = 0
    `).all(tid);
  } catch (error: any) {
    console.error('[db:getProductPricing]', error);
    return [];
  }
});

// â”€â”€ Combo Offers Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      const cleanS = String(search).trim();
      const s = `%${cleanS}%`;
      const sClean = `%${cleanS.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')}%`;
      query += ` AND (co.name LIKE ? OR co.sku_barcode LIKE ? OR co.description LIKE ? OR CLEAN_STR(co.name) LIKE ? OR CLEAN_STR(co.sku_barcode) LIKE ? OR CLEAN_STR(co.description) LIKE ?)`;
      params.push(s, s, s, `%${sClean}%`, `%${sClean}%`, `%${sClean}%`);
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
    const tid = tenant_id || 'global';
    const findExisting = db.prepare(`SELECT product_pricing_id FROM product_pricing WHERE product_id = ? AND pricing_tier_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
    const upsert = db.prepare(`
      INSERT INTO product_pricing (product_pricing_id, tenant_id, product_id, pricing_tier_id, price, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(product_id, pricing_tier_id) DO UPDATE SET
        price = excluded.price,
        is_deleted = 0,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
    `);
    const clear = db.prepare(`UPDATE product_pricing SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND pricing_tier_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
    const tx = db.transaction((rows: Array<{ pricing_tier_id: string; price: number | null }>) => {
      for (const item of rows) {
        if (!item?.pricing_tier_id) continue;
        const isEmpty = item.price === null || item.price === undefined || String(item.price).trim() === '';
        if (isEmpty) {
          clear.run(product_id, item.pricing_tier_id, tid);
          continue;
        }
        const existing = findExisting.get(product_id, item.pricing_tier_id, tid) as any;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const pricingId = (existing?.product_pricing_id && uuidRegex.test(existing.product_pricing_id)) ? existing.product_pricing_id : crypto.randomUUID();
        upsert.run(pricingId, tid, product_id, item.pricing_tier_id, Number(item.price) || 0);
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
    const tid = tenant_id || 'global';
    const findExisting = db.prepare(`SELECT product_pricing_id FROM product_pricing WHERE product_id = ? AND pricing_tier_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
    const upsert = db.prepare(`
      INSERT INTO product_pricing (product_pricing_id, tenant_id, product_id, pricing_tier_id, price, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(product_id, pricing_tier_id) DO UPDATE SET
        price = excluded.price,
        is_deleted = 0,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
    `);
    const clear = db.prepare(`UPDATE product_pricing SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND pricing_tier_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
    const tx = db.transaction((rows: Array<{ product_id: string; price: number | null }>) => {
      for (const item of rows) {
        if (!item?.product_id) continue;
        const isEmpty = item.price === null || item.price === undefined || String(item.price).trim() === '';
        if (isEmpty) {
          clear.run(item.product_id, pricing_tier_id, tenant_id);
          continue;
        }
        const existing = findExisting.get(item.product_id, pricing_tier_id, tenant_id) as any;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const pricingId = (existing?.product_pricing_id && uuidRegex.test(existing.product_pricing_id)) ? existing.product_pricing_id : crypto.randomUUID();
        upsert.run(pricingId, tenant_id, item.product_id, pricing_tier_id, Number(item.price) || 0);
      }
    });
    tx(pricing);
    return { success: true };
  } catch (error: any) {
    console.error('[db:setTierPricing]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

// â”€â”€ Party (Credit Person) Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function deterministicUUID(seed: string): string {
  const hash = crypto.createHash('sha1').update(seed).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

ipcMain.handle('db:getParties', (event, tenantId: string, includeDeleted = false) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    backfillCreditInvoices(db);
    reconcileAllPartyBalances(db, tenantId);
    const sql = includeDeleted
      ? `SELECT p.*, 
          COALESCE(
            (SELECT ROUND(SUM(pl.credit_amount) - SUM(pl.debit_amount), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.balance,
            0
          ) AS current_balance,
          COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'GST' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.gst_balance,
            p.balance,
            0
          ) AS current_gst_balance,
          COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'ESTIMATE' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.estimate_balance,
            0
          ) AS current_estimate_balance,
          (SELECT MAX(pl.transaction_date) FROM party_ledger pl WHERE pl.party_id = p.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)) AS last_transaction_date
        FROM parties p WHERE p.tenant_id = ? ORDER BY p.is_deleted ASC, p.name COLLATE NOCASE ASC`
      : `SELECT p.*, 
          COALESCE(
            (SELECT ROUND(SUM(pl.credit_amount) - SUM(pl.debit_amount), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.balance,
            0
          ) AS current_balance,
          COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'GST' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.gst_balance,
            p.balance,
            0
          ) AS current_gst_balance,
          COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'ESTIMATE' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
             FROM party_ledger pl
             WHERE pl.party_id = p.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            p.estimate_balance,
            0
          ) AS current_estimate_balance,
          (SELECT MAX(pl.transaction_date) FROM party_ledger pl WHERE pl.party_id = p.party_id AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)) AS last_transaction_date
        FROM parties p WHERE p.tenant_id = ? AND p.is_deleted = 0 ORDER BY p.name COLLATE NOCASE ASC`;
    const parties = db.prepare(sql).all(tenantId) as any[];
    for (const p of parties) {
      if (p.current_balance !== undefined && p.current_balance !== null) {
        p.balance = Number(p.current_balance);
      }
      if (p.current_gst_balance !== undefined && p.current_gst_balance !== null) {
        p.gst_balance = Number(p.current_gst_balance);
      }
      if (p.current_estimate_balance !== undefined && p.current_estimate_balance !== null) {
        p.estimate_balance = Number(p.current_estimate_balance);
      }
    }
    return parties;
  } catch (error: any) {
    console.error('[db:getParties]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:addParty', safeHandler((event, p) => {
  try {
    const db = getDb();
    const phoneClean = (p.phone || '').replace(/\D/g, '');
    const nameClean = (p.name || '').trim().toLowerCase();

    // Duplicate check: Do NOT allow creation of another party with the exact same name
    const existingSameName = db.prepare('SELECT party_id, name FROM parties WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(p.tenant_id, nameClean);
    if (existingSameName) {
      return { success: false, error: `A party named "${p.name.trim()}" already exists!` };
    }

    const creditLimit = Math.max(0, Number(p.credit_limit) || 0);
    const creditPeriodEnabled = p.credit_period_enabled ? 1 : 0;
    const creditPeriodDays = Math.max(1, parseInt(p.credit_period_days, 10) || 30);
    const creditPeriodBasis = p.credit_period_basis || 'BILL_BASED';
    const restrictOnCreditExpiry = p.restrict_on_credit_expiry !== undefined ? (p.restrict_on_credit_expiry ? 1 : 0) : 1;
    const whatsappAlertsEnabled = p.whatsapp_alerts_enabled !== undefined ? (p.whatsapp_alerts_enabled ? 1 : 0) : 1;
    const bt = p.balance_type || 'RECEIVABLE';
    const initialBalance = bt === 'RECEIVABLE'
      ? Math.abs(p.balance || 0)
      : -Math.abs(p.balance || 0);
    const partyType = p.party_type || 'CUSTOMER';
    const customCategory = p.custom_category || null;

    db.prepare(`
      INSERT INTO parties (party_id, tenant_id, name, phone, address, gstin, balance, gst_balance, estimate_balance, balance_type, party_type, custom_category, notes, pricing_tier_id, credit_limit, credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry, whatsapp_alerts_enabled, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(p.party_id, p.tenant_id, p.name, p.phone || null, p.address || null, p.gstin || null, initialBalance, initialBalance, bt, partyType, customCategory, p.notes || null, p.pricing_tier_id || null, creditLimit, creditPeriodEnabled, creditPeriodDays, creditPeriodBasis, restrictOnCreditExpiry, whatsappAlertsEnabled);

    // Create opening balance ledger entry
    if (p.balance && parseFloat(p.balance) > 0) {
      const amount = Math.abs(parseFloat(p.balance));
      const ledgerId = deterministicUUID(`party_opening:${p.party_id}`);
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

ipcMain.handle('db:bulkImportParties', safeHandler((event, parties: any[]) => {
  try {
    const db = getDb();
    const transaction = db.transaction((partyList) => {
      const selectPhoneStmt = db.prepare('SELECT party_id, phone, name FROM parties WHERE tenant_id = ? AND is_deleted = 0');
      const insertStmt = db.prepare(`
        INSERT INTO parties (
          party_id, tenant_id, name, phone, address, gstin, balance, gst_balance, estimate_balance,
          pricing_tier_id, credit_limit, party_type, custom_category, notes, balance_type,
          is_deleted, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 0, 'PENDING', ?, ?)
      `);
      const updateStmt = db.prepare(`
        UPDATE parties 
        SET name = ?, phone = COALESCE(?, phone), address = COALESCE(?, address), gstin = COALESCE(?, gstin),
            pricing_tier_id = COALESCE(?, pricing_tier_id), credit_limit = COALESCE(?, credit_limit),
            party_type = COALESCE(?, party_type), custom_category = COALESCE(?, custom_category), notes = COALESCE(?, notes),
            is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE party_id = ?
      `);
      const insertLedgerStmt = db.prepare(`
        INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, created_by, created_by_name, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GST', ?, ?, 'PENDING', ?, ?)
      `);

      const now = new Date();
      for (const p of partyList) {
        now.setMilliseconds(now.getMilliseconds() + 1);
        const timestamp = localTimestamp(now);

        const phoneClean = (p.phone || '').replace(/\D/g, '');
        const nameClean = (p.name || '').trim().toLowerCase();

        let existing: any = null;
        if (p.tenant_id) {
          const tenantParties = selectPhoneStmt.all(p.tenant_id) as any[];
          if (phoneClean.length >= 7) {
            existing = tenantParties.find((party: any) => {
              const pDigits = (party.phone || '').replace(/\D/g, '');
              return pDigits.length >= 7 && (pDigits === phoneClean || (phoneClean.length >= 10 && pDigits.slice(-10) === phoneClean.slice(-10)));
            });
          }
          if (!existing && nameClean) {
            existing = tenantParties.find((party: any) => (party.name || '').trim().toLowerCase() === nameClean);
          }
        }

        if (existing) {
          updateStmt.run(
            p.name,
            p.phone || null,
            p.address || null,
            p.gstin || null,
            p.pricing_tier_id || null,
            p.credit_limit || 0,
            p.party_type || 'SUPPLIER',
            p.custom_category || null,
            p.notes || null,
            existing.party_id
          );
        } else {
          const bt = p.balance_type || (p.party_type === 'SUPPLIER' ? 'PAYABLE' : 'RECEIVABLE');
          const initialBalance = bt === 'RECEIVABLE'
            ? Math.abs(p.balance || 0)
            : -Math.abs(p.balance || 0);
          const creditLimit = Math.max(0, Number(p.credit_limit) || 0);
          const partyType = p.party_type || 'SUPPLIER';

          insertStmt.run(
            p.party_id,
            p.tenant_id,
            p.name,
            p.phone || null,
            p.address || null,
            p.gstin || null,
            initialBalance,
            initialBalance,
            p.pricing_tier_id || null,
            creditLimit,
            partyType,
            p.custom_category || null,
            p.notes || null,
            bt,
            timestamp,
            timestamp
          );

          if (p.balance && parseFloat(p.balance) !== 0) {
            const amount = Math.abs(parseFloat(p.balance));
            const ledgerId = deterministicUUID(`party_opening:${p.party_id}`);
            insertLedgerStmt.run(
              ledgerId, p.party_id, p.tenant_id, timestamp,
              `Opening Balance (${bt === 'RECEIVABLE' ? 'Receivable' : 'Payable'})`,
              bt === 'RECEIVABLE' ? amount : 0,
              bt === 'PAYABLE' ? amount : 0,
              initialBalance,
              p.created_by || null,
              p.created_by_name || null,
              timestamp,
              timestamp
            );
          }
        }
      }
    });
    transaction(parties);
    return { success: true };
  } catch (error: any) {
    console.error('[db:bulkImportParties]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:updateParty', safeHandler((event, p) => {
  try {
    const db = getDb();
    const hasTier = p.pricing_tier_id !== undefined;
    const hasCreditLimit = p.credit_limit !== undefined;
    const hasPartyType = p.party_type !== undefined;
    const hasCustomCategory = p.custom_category !== undefined;
    const creditLimit = hasCreditLimit ? Math.max(0, Number(p.credit_limit) || 0) : 0;
    const hasCreditPeriodEnabled = p.credit_period_enabled !== undefined;
    const hasCreditPeriodDays = p.credit_period_days !== undefined;
    const hasCreditPeriodBasis = p.credit_period_basis !== undefined;
    const hasRestrictOnCreditExpiry = p.restrict_on_credit_expiry !== undefined;
    const hasWhatsappAlertsEnabled = p.whatsapp_alerts_enabled !== undefined;

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
    if (hasCreditPeriodEnabled) {
      updateSql += `, credit_period_enabled = ?`;
      params.push(p.credit_period_enabled ? 1 : 0);
    }
    if (hasCreditPeriodDays) {
      updateSql += `, credit_period_days = ?`;
      params.push(Math.max(1, parseInt(p.credit_period_days, 10) || 30));
    }
    if (hasCreditPeriodBasis) {
      updateSql += `, credit_period_basis = ?`;
      params.push(p.credit_period_basis || 'BILL_BASED');
    }
    if (hasRestrictOnCreditExpiry) {
      updateSql += `, restrict_on_credit_expiry = ?`;
      params.push(p.restrict_on_credit_expiry ? 1 : 0);
    }
    if (hasPartyType) {
      updateSql += `, party_type = ?`;
      params.push(p.party_type || 'CUSTOMER');
    }
    if (hasCustomCategory) {
      updateSql += `, custom_category = ?`;
      params.push(p.custom_category || null);
    }
    if (hasWhatsappAlertsEnabled) {
      updateSql += `, whatsapp_alerts_enabled = ?`;
      params.push(p.whatsapp_alerts_enabled ? 1 : 0);
    }

    // Fetch existing party details before update to ensure robust matching even if name or phone changed
    const oldPartyRow: any = db.prepare('SELECT tenant_id, phone, name FROM parties WHERE party_id = ?').get(p.party_id);
    const tenantId = p.tenant_id || oldPartyRow?.tenant_id;
    const oldPhone = (oldPartyRow?.phone || '').trim();
    const oldName = (oldPartyRow?.name || '').trim();
    const newPhone = (p.phone || '').trim();
    const newName = (p.name || '').trim();

    updateSql += `, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`;
    params.push(p.party_id);

    db.prepare(updateSql).run(...params);

    // Synchronize to matching customer in customers table if exists
    try {
      let cust: any = null;
      if (newPhone) {
        cust = db.prepare('SELECT customer_id FROM customers WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(tenantId, newPhone);
      }
      if (!cust && oldPhone) {
        cust = db.prepare('SELECT customer_id FROM customers WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(tenantId, oldPhone);
      }
      if (!cust && newName) {
        cust = db.prepare('SELECT customer_id FROM customers WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(tenantId, newName.toLowerCase());
      }
      if (!cust && oldName) {
        cust = db.prepare('SELECT customer_id FROM customers WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(tenantId, oldName.toLowerCase());
      }
      if (cust) {
        db.prepare(`
          UPDATE customers 
          SET name = COALESCE(?, name),
              phone = COALESCE(?, phone),
              address = COALESCE(?, address),
              gstin = COALESCE(?, gstin),
              notes = COALESCE(?, notes),
              credit_limit = COALESCE(?, credit_limit),
              credit_period_enabled = COALESCE(?, credit_period_enabled),
              credit_period_days = COALESCE(?, credit_period_days),
              credit_period_basis = COALESCE(?, credit_period_basis),
              restrict_on_credit_expiry = COALESCE(?, restrict_on_credit_expiry),
              pricing_tier_id = COALESCE(?, pricing_tier_id),
              sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE customer_id = ? AND tenant_id = ?
        `).run(
          p.name || null,
          p.phone || null,
          p.address || null,
          p.gstin !== undefined ? (p.gstin ? p.gstin.trim().toUpperCase() : null) : null,
          p.notes !== undefined ? (p.notes ? p.notes.trim() : null) : null,
          hasCreditLimit ? creditLimit : null,
          hasCreditPeriodEnabled ? (p.credit_period_enabled ? 1 : 0) : null,
          hasCreditPeriodDays ? Math.max(1, parseInt(p.credit_period_days, 10) || 30) : null,
          hasCreditPeriodBasis ? (p.credit_period_basis || 'BILL_BASED') : null,
          hasRestrictOnCreditExpiry ? (p.restrict_on_credit_expiry ? 1 : 0) : null,
          hasTier ? (p.pricing_tier_id || null) : null,
          cust.customer_id, tenantId
        );
      }
    } catch (syncErr) {
      console.warn('[db:updateParty] Customer sync skipped:', syncErr);
    }

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

ipcMain.handle('db:restoreParty', (event, partyId: string) => {
  try {
    const db = getDb();
    db.prepare("UPDATE parties SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?").run(partyId);
    recalcPartyBalances(db, partyId);
    return { success: true };
  } catch (error: any) {
    console.error('[db:restoreParty]', error);
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
export function recalcPartyBalances(db: any, partyId: string) {
  try {
    // 1. Deduplicate entries by reference_number, description, credit_amount, and debit_amount
    const refDups = db.prepare(`
      SELECT reference_number, description, credit_amount, debit_amount, COUNT(*) as cnt 
      FROM party_ledger 
      WHERE party_id = ? 
        AND reference_number IS NOT NULL 
        AND TRIM(reference_number) <> '' 
        AND (is_deleted IS NULL OR is_deleted = 0)
      GROUP BY reference_number, description, credit_amount, debit_amount 
      HAVING cnt > 1
    `).all(partyId) as any[];

    for (const d of refDups) {
      const rows = db.prepare(`
        SELECT ledger_id FROM party_ledger
        WHERE party_id = ? 
          AND reference_number = ? 
          AND description = ?
          AND credit_amount = ?
          AND debit_amount = ?
          AND (is_deleted IS NULL OR is_deleted = 0)
        ORDER BY created_at ASC, rowid ASC
      `).all(partyId, d.reference_number, d.description, d.credit_amount, d.debit_amount) as any[];

      for (let i = 1; i < rows.length; i++) {
        db.prepare(`
          UPDATE party_ledger 
          SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
          WHERE ledger_id = ?
        `).run(rows[i].ledger_id);
      }
    }

    // 2. Deduplicate exact match entries (same description, credit_amount, debit_amount, transaction_date)
    const exactDups = db.prepare(`
      SELECT description, credit_amount, debit_amount, transaction_date, COUNT(*) as cnt
      FROM party_ledger
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
      GROUP BY description, credit_amount, debit_amount, transaction_date
      HAVING cnt > 1
    `).all(partyId) as any[];

    for (const d of exactDups) {
      const rows = db.prepare(`
        SELECT ledger_id FROM party_ledger
        WHERE party_id = ? 
          AND description = ? 
          AND credit_amount = ? 
          AND debit_amount = ? 
          AND transaction_date = ? 
          AND (is_deleted IS NULL OR is_deleted = 0)
        ORDER BY created_at ASC, rowid ASC
      `).all(partyId, d.description, d.credit_amount, d.debit_amount, d.transaction_date) as any[];

      for (let i = 1; i < rows.length; i++) {
        db.prepare(`
          UPDATE party_ledger 
          SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
          WHERE ledger_id = ?
        `).run(rows[i].ledger_id);
      }
    }

    // 3. Re-sequence running_balance for all remaining active entries
    const activeEntries = db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY transaction_date ASC, created_at ASC
    `).all(partyId) as any[];

    let running = 0;
    for (const row of activeEntries) {
      running += (Number(row.credit_amount) || 0) - (Number(row.debit_amount) || 0);
      running = Math.round(running * 100) / 100;
      db.prepare(`UPDATE party_ledger SET running_balance = ? WHERE ledger_id = ?`).run(running, row.ledger_id);
    }
  } catch (err) {
    console.error('[recalcPartyBalances] Deduplication error:', err);
  }

  const rows = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN balance_type = 'GST' THEN credit_amount - debit_amount ELSE 0 END), 0) AS gst,
            COALESCE(SUM(CASE WHEN balance_type = 'ESTIMATE' THEN credit_amount - debit_amount ELSE 0 END), 0) AS estimate,
            COALESCE(SUM(credit_amount - debit_amount), 0) AS total
     FROM party_ledger WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)`
  ).get(partyId) as any;
  const gst = Math.round((parseFloat(rows.gst) || 0) * 100) / 100;
  const estimate = Math.round((parseFloat(rows.estimate) || 0) * 100) / 100;
  const total = Math.round((gst + estimate) * 100) / 100;
  const latest = db.prepare(`SELECT transaction_date FROM party_ledger WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY transaction_date DESC LIMIT 1`).get(partyId) as any;
  db.prepare(`UPDATE parties SET balance = ?, gst_balance = ?, estimate_balance = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`)
    .run(total, gst, estimate, latest ? latest.transaction_date : null, partyId);
  return total;
}

export function reconcileAllPartyBalances(db: any, tenantId?: string) {
  try {
    const tenantClause = tenantId ? 'WHERE parties.tenant_id = ? AND' : 'WHERE';
    const params = tenantId ? [tenantId] : [];
    db.prepare(`
      UPDATE parties
      SET balance = COALESCE(
            (SELECT ROUND(SUM(credit_amount) - SUM(debit_amount), 2)
             FROM party_ledger pl
             WHERE pl.party_id = parties.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            parties.balance, 0
          ),
          gst_balance = COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'GST' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
             FROM party_ledger pl
             WHERE pl.party_id = parties.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            parties.gst_balance, parties.balance, 0
          ),
          estimate_balance = COALESCE(
            (SELECT ROUND(SUM(CASE WHEN pl.balance_type = 'ESTIMATE' THEN pl.credit_amount - pl.debit_amount ELSE 0 END), 2)
             FROM party_ledger pl
             WHERE pl.party_id = parties.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            parties.estimate_balance, 0
          ),
          last_transaction_date = COALESCE(
            (SELECT MAX(pl.transaction_date)
             FROM party_ledger pl
             WHERE pl.party_id = parties.party_id
               AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
            parties.last_transaction_date
          )
      ${tenantClause} parties.party_id IN (SELECT DISTINCT party_id FROM party_ledger pl WHERE pl.is_deleted IS NULL OR pl.is_deleted = 0)
    `).run(...params);
  } catch (err: any) {
    console.error('[reconcileAllPartyBalances] Error:', err);
  }
}

ipcMain.handle('db:mergeParties', safeHandler((event, payload: { tenant_id: string; primary_party_id: string; secondary_party_id: string }) => {
  try {
    const db = getDb();
    const { tenant_id, primary_party_id, secondary_party_id } = payload;
    if (!tenant_id || !primary_party_id || !secondary_party_id || primary_party_id === secondary_party_id) {
      return { success: false, error: 'Invalid parameters for party merge' };
    }

    const primaryParty = db.prepare('SELECT * FROM parties WHERE party_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(primary_party_id, tenant_id) as any;
    const secondaryParty = db.prepare('SELECT * FROM parties WHERE party_id = ? AND tenant_id = ?').get(secondary_party_id, tenant_id) as any;

    if (!primaryParty || !secondaryParty) {
      return { success: false, error: 'One or both parties not found' };
    }

    const tx = db.transaction(() => {
      // 1. Move all party_ledger entries from secondary to primary
      db.prepare(`
        UPDATE party_ledger 
        SET party_id = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
        WHERE party_id = ? AND tenant_id = ?
      `).run(primary_party_id, secondary_party_id, tenant_id);

      // 2. Update primary party phone, address, and gstin if secondary has them
      const secPhone = (secondaryParty.phone || '').trim();
      const secAddr = (secondaryParty.address || '').trim();
      const secGst = (secondaryParty.gstin || '').trim();
      db.prepare(`
        UPDATE parties 
        SET phone = CASE WHEN (phone IS NULL OR phone = '') AND ? <> '' THEN ? ELSE phone END,
            address = CASE WHEN (address IS NULL OR address = '') AND ? <> '' THEN ? ELSE address END,
            gstin = CASE WHEN (gstin IS NULL OR gstin = '') AND ? <> '' THEN ? ELSE gstin END,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        WHERE party_id = ? AND tenant_id = ?
      `).run(secPhone, secPhone, secAddr, secAddr, secGst, secGst, primary_party_id, tenant_id);

      // 3. Mark secondary party as deleted
      db.prepare(`
        UPDATE parties 
        SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
        WHERE party_id = ? AND tenant_id = ?
      `).run(secondary_party_id, tenant_id);

      // 4. Recalculate primary party balance (soft-deletes duplicate reference numbers & exact matches)
      recalcPartyBalances(db, primary_party_id);
      recalcPartyBalances(db, secondary_party_id);
    });

    tx();

    import('./sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Merge sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));

    return { success: true };
  } catch (error: any) {
    console.error('[db:mergeParties]', error);
    return { success: false, error: 'Failed to merge parties' };
  }
}));

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
    customer_id?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_address?: string | null;
    customer_gstin?: string | null;
    user_id?: string;
    user_name?: string;
    split_details?: any;
    created_at?: string;
  },
  isDelete = false
) {
  try {
    const tenantId = invoice.tenant_id || 'global';
    const invoiceNumber = (invoice.invoice_number || '').trim();
    if (!invoiceNumber) return;

    // ── 1. DELETION HANDLING (MUST BE EVALUATED FIRST) ──────────────────────
    if (isDelete) {
      console.log(`[syncInvoiceCreditLedger] Soft-deleting ledger entries for invoice: ${invoiceNumber}`);
      const toDelete = db.prepare(`
        SELECT ledger_id, party_id FROM party_ledger
        WHERE (
          reference_number = ? 
          OR reference_number = ? 
          OR reference_number LIKE ? 
          OR description LIKE ?
        )
        AND (is_deleted IS NULL OR is_deleted = 0)
      `).all(invoiceNumber, `${invoiceNumber}-PAY`, `${invoiceNumber}%`, `%${invoiceNumber}%`) as any[];

      if (toDelete.length > 0) {
        const affectedParties = new Set<string>();
        for (const row of toDelete) {
          affectedParties.add(row.party_id);
          db.prepare(`
            UPDATE party_ledger 
            SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
            WHERE ledger_id = ?
          `).run(row.ledger_id);
        }

        for (const pId of affectedParties) {
          // Re-sequence running_balance for this party
          const allEntries = db.prepare(`
            SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
            WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
            ORDER BY transaction_date ASC, created_at ASC
          `).all(pId) as any[];

          let running = 0;
          for (const row of allEntries) {
            running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
            db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
          }

          recalcPartyBalances(db, pId);
        }
        console.log(`[syncInvoiceCreditLedger] Soft-deleted ${toDelete.length} entries for ${invoiceNumber}.`);
      }
      return;
    }

    // ── 2. FIND ALL EXISTING ENTRIES FOR THIS INVOICE ───────────────────────
    // Query without strict tenantId to catch any previous entries created under different tenant tags
    const existingEntries = db.prepare(`
      SELECT * FROM party_ledger 
      WHERE (
        reference_number = ? 
        OR reference_number = ? 
        OR reference_number LIKE ?
        OR description LIKE ?
      )
      AND (is_deleted IS NULL OR is_deleted = 0)
    `).all(invoiceNumber, `${invoiceNumber}-PAY`, `${invoiceNumber}-%`, `%${invoiceNumber}%`) as any[];

    // ── 3. PARSE PAYMENT METHODS & SPLIT DETAILS ────────────────────────────
    let splitObj: any = null;
    if ((invoice as any).split_details && (invoice as any).split_details !== 'null') {
      try {
        splitObj = typeof (invoice as any).split_details === 'string'
          ? JSON.parse((invoice as any).split_details)
          : (invoice as any).split_details;
      } catch {}
    }

    const paymentMethodUpper = (invoice.payment_method || '').toUpperCase();
    const splitCredit = Math.max(0, Number(splitObj?.credit) || 0);
    const splitCash = Math.max(0, Number(splitObj?.cash) || 0);
    const splitUpi = Math.max(0, Number(splitObj?.upi) || 0);
    const splitCard = Math.max(0, Number(splitObj?.card) || 0);
    const splitBank = Math.max(0, Number(splitObj?.bank_transfer || splitObj?.bank) || 0);
    const splitCheque = Math.max(0, Number(splitObj?.cheque) || 0);

    const isSplit = paymentMethodUpper === 'SPLIT';
    const isSplitCredit = isSplit && splitCredit > 0;
    const isPureCredit = paymentMethodUpper === 'CREDIT';
    const isCredit = isPureCredit || isSplitCredit;

    const invoiceGrandTotal = Math.max(0, Number(invoice.grand_total) || 0);
    const invoiceReceivedAmount = Math.max(0, Number(invoice.received_amount) || 0);

    // ── 4. RESOLVE CUSTOMER & PARTY IDENTITY ────────────────────────────────
    const custName = (invoice.customer_name || '').trim();
    const custPhone = (invoice.customer_phone || '').trim();
    const custAddress = (invoice.customer_address || '').trim() || null;
    const custGstin = (invoice.customer_gstin || '').trim() || null;
    const custId = invoice.customer_id || null;

    if (!custName && !custPhone && !custId) {
      // If customer identity is missing, soft delete any existing entries for this bill
      if (existingEntries.length > 0) {
        const affectedPartyIds = new Set<string>();
        for (const entry of existingEntries) {
          affectedPartyIds.add(entry.party_id);
          db.prepare(`UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(entry.ledger_id);
        }
        for (const pId of affectedPartyIds) recalcPartyBalances(db, pId);
      }
      return;
    }

    const identityResult = CustomerIdentityService.findOrCreateCustomerAndParty(db, tenantId, {
      customer_id: custId,
      name: custName,
      phone: custPhone,
      address: custAddress,
      gstin: custGstin,
    });

    if (!identityResult) {
      console.error('[syncInvoiceCreditLedger] Failed to resolve customer/party identity');
      return;
    }

    const targetPartyId = identityResult.party_id;

    // Party changed? Clean up entries from previous party
    const oldPartyIds = new Set<string>();
    for (const entry of existingEntries) {
      if (entry.party_id !== targetPartyId) {
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

    // ── 5. HANDLE NON-CREDIT INVOICES (CASH, UPI, CARD, ETC.) ───────────────
    if (!isCredit) {
      // Check if show_fully_paid_cash_in_ledger is enabled for cash
      const isCash = paymentMethodUpper === 'CASH';
      const isFullyPaidCash = isCash && invoiceGrandTotal > 0 && invoiceReceivedAmount >= invoiceGrandTotal - 0.01;

      let showFullyPaidCash = false;
      if (isFullyPaidCash) {
        const showSetting = db.prepare(`SELECT value FROM settings WHERE tenant_id = ? AND key = ?`).get(tenantId, 'show_fully_paid_cash_in_ledger');
        showFullyPaidCash = showSetting ? JSON.parse(showSetting.value) : false;
      }

      if (!showFullyPaidCash) {
        // Soft delete all existing entries for this invoice for this party
        const targetEntries = existingEntries.filter(e => e.party_id === targetPartyId);
        if (targetEntries.length > 0) {
          for (const entry of targetEntries) {
            db.prepare(`
              UPDATE party_ledger 
              SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
              WHERE ledger_id = ?
            `).run(entry.ledger_id);
          }
          // Re-sequence and update balance
          const allEntries = db.prepare(`
            SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
            WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
            ORDER BY transaction_date ASC, created_at ASC
          `).all(targetPartyId) as any[];

          let running = 0;
          for (const row of allEntries) {
            running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
            db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
          }
          recalcPartyBalances(db, targetPartyId);
        }
        return;
      }
    }

    // ── 6. SYNC CREDIT / SPLIT-CREDIT / CASH-IN-LEDGER ENTRIES ─────────────
    const balanceType: 'GST' | 'ESTIMATE' = (invoice.invoice_type === 'ESTIMATE') ? 'ESTIMATE' : 'GST';
    const txDate = invoice.created_at || localTimestamp();

    // Mark ALL existing active entries for this invoice for this party as deleted first
    // so we can cleanly recreate the exact updated set of sale and payment entries
    const existingForParty = existingEntries.filter(e => e.party_id === targetPartyId);
    for (const entry of existingForParty) {
      db.prepare(`UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(entry.ledger_id);
    }

    // A. Construct Sale Description and Breakdown
    let breakdownParts: string[] = [];
    if (isSplit) {
      if (splitCash > 0) breakdownParts.push(`Cash ₹${splitCash}`);
      if (splitUpi > 0) breakdownParts.push(`UPI ₹${splitUpi}`);
      if (splitCard > 0) breakdownParts.push(`Card ₹${splitCard}`);
      if (splitBank > 0) breakdownParts.push(`Bank ₹${splitBank}`);
      if (splitCheque > 0) breakdownParts.push(`Cheque ₹${splitCheque}`);
      if (splitCredit > 0) breakdownParts.push(`Credit ₹${splitCredit}`);
    } else if (isPureCredit) {
      const creditPortion = Math.max(0, invoiceGrandTotal - invoiceReceivedAmount);
      if (invoiceReceivedAmount > 0) breakdownParts.push(`Paid ₹${invoiceReceivedAmount}`);
      breakdownParts.push(`Credit ₹${creditPortion}`);
    } else if (paymentMethodUpper === 'CASH') {
      breakdownParts.push(`Cash ₹${invoiceGrandTotal}`);
    }

    const breakdownText = breakdownParts.length > 0 ? ` (${breakdownParts.join(', ')})` : '';
    const salePrefix = isCredit ? 'Credit Sale' : 'Cash Sale';
    const saleDescription = `${salePrefix} ${invoiceNumber} - Total ₹${invoiceGrandTotal.toFixed(2)}${breakdownText} - ${custName || 'Customer'}`;

    // 1. Sale Entry (Credit Amount = total invoice amount)
    const saleLedgerId = deterministicUUID(`credit_sale:${tenantId}:${invoiceNumber}`);
    db.prepare(`
      INSERT INTO party_ledger (
        ledger_id, party_id, tenant_id, transaction_date, description,
        credit_amount, debit_amount, running_balance, balance_type,
        payment_method, reference_number, created_by, created_by_name,
        is_deleted, sync_status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(ledger_id) DO UPDATE SET
        party_id = excluded.party_id,
        tenant_id = excluded.tenant_id,
        credit_amount = excluded.credit_amount,
        debit_amount = 0,
        description = excluded.description,
        transaction_date = excluded.transaction_date,
        balance_type = excluded.balance_type,
        payment_method = excluded.payment_method,
        is_deleted = 0,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
    `).run(
      saleLedgerId,
      targetPartyId,
      tenantId,
      txDate,
      saleDescription,
      invoiceGrandTotal,
      balanceType,
      isCredit ? 'CREDIT' : paymentMethodUpper,
      invoiceNumber,
      invoice.user_id || 'system',
      invoice.user_name || 'System'
    );

    // 2. Immediate Payments received at checkout (Debit Amount = payment amounts)
    const upsertPaymentEntry = (type: string, amount: number, refSuffix: string, method: string) => {
      if (amount <= 0) return;
      const payLedgerId = deterministicUUID(`credit_pay_${refSuffix.toLowerCase()}:${tenantId}:${invoiceNumber}`);
      const payRef = `${invoiceNumber}-${refSuffix}`;
      const payDesc = `Payment received (${type}) for ${invoiceNumber}`;
      db.prepare(`
        INSERT INTO party_ledger (
          ledger_id, party_id, tenant_id, transaction_date, description,
          credit_amount, debit_amount, running_balance, balance_type,
          payment_method, reference_number, created_by, created_by_name,
          is_deleted, sync_status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(ledger_id) DO UPDATE SET
          party_id = excluded.party_id,
          tenant_id = excluded.tenant_id,
          credit_amount = 0,
          debit_amount = excluded.debit_amount,
          description = excluded.description,
          transaction_date = excluded.transaction_date,
          balance_type = excluded.balance_type,
          payment_method = excluded.payment_method,
          is_deleted = 0,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      `).run(
        payLedgerId,
        targetPartyId,
        tenantId,
        txDate,
        payDesc,
        amount,
        balanceType,
        method,
        payRef,
        invoice.user_id || 'system',
        invoice.user_name || 'System'
      );
    };

    if (isSplit) {
      upsertPaymentEntry('Cash', splitCash, 'CASH', 'CASH');
      upsertPaymentEntry('UPI', splitUpi, 'UPI', 'UPI');
      upsertPaymentEntry('Card', splitCard, 'CARD', 'CARD');
      upsertPaymentEntry('Bank', splitBank, 'BANK', 'BANK_TRANSFER');
      upsertPaymentEntry('Cheque', splitCheque, 'CHEQUE', 'CHEQUE');
    } else if (isPureCredit && invoiceReceivedAmount > 0) {
      upsertPaymentEntry('Cash', invoiceReceivedAmount, 'PAY', 'CASH');
    } else if (paymentMethodUpper === 'CASH' && invoiceGrandTotal > 0) {
      upsertPaymentEntry('Cash', invoiceGrandTotal, 'PAY', 'CASH');
    }

    // 3. Re-sequence running_balance for the party
    const allEntries = db.prepare(`
      SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY transaction_date ASC, created_at ASC
    `).all(targetPartyId) as any[];

    let running = 0;
    for (const row of allEntries) {
      running += parseFloat(row.credit_amount) - parseFloat(row.debit_amount);
      db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, row.ledger_id);
    }

    recalcPartyBalances(db, targetPartyId);
  } catch (err: any) {
    console.error('[syncInvoiceCreditLedger] Error:', err);
  }
}

export function syncReturnLedger(
  db: any,
  params: {
    tenant_id: string;
    return_number: string;
    return_id?: string;
    invoice_id?: string | null;
    invoice_number?: string | null;
    customer_id?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_address?: string | null;
    customer_gstin?: string | null;
    grand_total: number;
    refund_method: string; // 'CREDIT' | 'CASH' | 'ADJUST_BILL' | 'STORE_CREDIT' | 'CARD' | 'UPI' | etc.
    adjusted_invoice_number?: string | null;
    amount?: number; // For ADJUST_BILL, the amount being adjusted
    user_id?: string;
    user_name?: string;
    created_at?: string;
  }
) {
  try {
    const tenantId = params.tenant_id || 'global';
    const returnNumber = params.return_number;
    if (!returnNumber) return;

    const custName = (params.customer_name || '').trim();
    const custPhone = (params.customer_phone || '').trim();
    const custAddress = (params.customer_address || '').trim() || null;
    const custGstin = (params.customer_gstin || '').trim() || null;

    if (!custName && !custPhone && !params.customer_id) return;

    // Use the unified CustomerIdentityService for consistent party resolution
    const identityResult = CustomerIdentityService.findOrCreateCustomerAndParty(db, tenantId, {
      customer_id: params.customer_id || undefined,
      name: custName,
      phone: custPhone,
      address: custAddress,
      gstin: custGstin,
    });

    if (!identityResult) {
      console.error('[syncReturnLedger] Failed to resolve customer/party identity');
      return;
    }

    const party = { party_id: identityResult.party_id, name: custName || custPhone };

    // Determine the reference number for the ledger entry
    const referenceNumber = params.adjusted_invoice_number
      ? `${returnNumber}-ADJ-${params.adjusted_invoice_number}`
      : returnNumber;

    // Check for existing entry
    const existingEntry = db.prepare(`
      SELECT * FROM party_ledger WHERE tenant_id = ? AND reference_number = ? LIMIT 1
    `).get(tenantId, referenceNumber) as any;

    const refundMethod = (params.refund_method || '').toUpperCase();
    const isCashRefund = refundMethod === 'CASH';
    const isAdjustBill = refundMethod === 'ADJUST_BILL';
    const isCreditRefund = refundMethod === 'CREDIT' || refundMethod === 'STORE_CREDIT';
    const isOtherRefund = ['CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE'].includes(refundMethod);
    const adjustmentAmount = Math.max(0, Number(params.amount ?? params.grand_total) || 0);

    if (adjustmentAmount <= 0) return;

    const balanceType = 'GST'; // Returns typically affect GST balance
    const txDate = params.created_at || localTimestamp();
    const refText = params.invoice_number ? ` (Ref: ${params.invoice_number})` : '';
    let description = `Return ${returnNumber}${refText} - ${custName || party.name || 'Customer'}`;
    if (isCashRefund) {
      description = `Return refund (Cash) ${returnNumber}${refText} - ${custName || party.name || 'Customer'}`;
    } else if (isAdjustBill) {
      description = params.adjusted_invoice_number
        ? `Return credit adjusted ${returnNumber} → ${params.adjusted_invoice_number}${refText} - ${custName || party.name || 'Customer'}`
        : `Sales Return ${returnNumber}${refText} - ${custName || party.name || 'Customer'}`;
    } else if (isCreditRefund) {
      description = `Sales Return ${returnNumber}${refText} - ${custName || party.name || 'Customer'}`;
    } else if (isOtherRefund) {
      description = `Return refund (${refundMethod}) ${returnNumber}${refText} - ${custName || party.name || 'Customer'}`;
    }

    const debitAmount = adjustmentAmount;

    if (existingEntry) {
      // Update existing entry
      db.prepare(`
        UPDATE party_ledger SET
          credit_amount = 0, debit_amount = ?, description = ?, transaction_date = ?,
          balance_type = ?, payment_method = ?, is_deleted = 0,
          sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE ledger_id = ?
      `).run(
        debitAmount,
        description,
        txDate,
        balanceType,
        refundMethod,
        existingEntry.ledger_id
      );
    } else {
      // Create new entry with deterministic UUID
      const ledgerId = deterministicUUID(`return:${tenantId}:${referenceNumber}`);
      db.prepare(`
        INSERT INTO party_ledger (
          ledger_id, party_id, tenant_id, transaction_date, description,
          credit_amount, debit_amount, running_balance, balance_type,
          payment_method, reference_number, created_by, created_by_name,
          is_deleted, sync_status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(ledger_id) DO UPDATE SET
          credit_amount = 0,
          debit_amount = excluded.debit_amount,
          description = excluded.description,
          transaction_date = excluded.transaction_date,
          balance_type = excluded.balance_type,
          payment_method = excluded.payment_method,
          is_deleted = 0,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      `).run(
        ledgerId,
        party.party_id,
        tenantId,
        txDate,
        description,
        debitAmount,
        balanceType,
        refundMethod,
        referenceNumber,
        params.user_id || 'system',
        params.user_name || 'System'
      );
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
    console.error('[syncReturnLedger] Error:', err);
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

    // Backfill any returns against credit invoices (or store credit returns) that are missing from party_ledger
    try {
      const unlinkedReturns = db.prepare(`
        SELECT r.*, i.invoice_number as orig_invoice_number, i.payment_method as orig_payment_method, i.split_details as orig_split_details, i.customer_id as orig_customer_id, i.customer_name as orig_customer_name, i.customer_phone as orig_customer_phone, i.customer_address as orig_customer_address, i.customer_gstin as orig_customer_gstin
        FROM returns r
        LEFT JOIN invoices i ON i.invoice_id = r.invoice_id
        WHERE (
          UPPER(COALESCE(i.payment_method, '')) = 'CREDIT'
          OR (UPPER(COALESCE(i.payment_method, '')) = 'SPLIT' AND i.split_details LIKE '%"credit":%' AND i.split_details NOT LIKE '%"credit":0%')
          OR UPPER(COALESCE(r.refund_method, '')) IN ('CREDIT', 'STORE_CREDIT', 'ADJUST_BILL')
        )
          AND (i.is_deleted IS NULL OR i.is_deleted = 0)
          AND NOT EXISTS (
            SELECT 1 FROM party_ledger pl
            WHERE pl.reference_number = r.return_number
              AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
          )
      `).all() as any[];

      if (unlinkedReturns.length > 0) {
        console.log(`[DB] Backfilling ${unlinkedReturns.length} returns into party ledger...`);
        for (const ret of unlinkedReturns) {
          syncReturnLedger(db, {
            tenant_id: ret.tenant_id || 'global',
            return_number: ret.return_number,
            return_id: ret.return_id,
            invoice_id: ret.invoice_id || null,
            invoice_number: ret.orig_invoice_number || null,
            customer_id: ret.orig_customer_id || null,
            customer_name: ret.customer_name || ret.orig_customer_name || null,
            customer_phone: ret.customer_phone || ret.orig_customer_phone || null,
            customer_address: ret.customer_address || ret.orig_customer_address || null,
            customer_gstin: ret.orig_customer_gstin || null,
            grand_total: Number(ret.grand_total) || 0,
            refund_method: ret.refund_method || 'CREDIT',
            amount: Number(ret.grand_total) || 0,
            user_id: ret.user_id,
            created_at: ret.created_at,
          });
        }
        console.log(`[DB] Returns backfill completed.`);
      }
    } catch (e) {
      console.error('[DB] Failed to backfill credit returns:', e);
    }

    // Clean up any lingering active ledger entries belonging to soft-deleted invoices
    try {
      const staleEntries = db.prepare(`
        SELECT pl.ledger_id, pl.party_id FROM party_ledger pl
        JOIN invoices i ON (
          i.invoice_number = pl.reference_number 
          OR pl.reference_number = i.invoice_number || '-PAY'
          OR pl.reference_number LIKE i.invoice_number || '-%'
          OR pl.description LIKE '%' || i.invoice_number || '%'
        )
        WHERE i.is_deleted = 1 AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
      `).all() as any[];

      if (staleEntries.length > 0) {
        console.log(`[DB] Cleaning up ${staleEntries.length} stale ledger entries for soft-deleted invoices...`);
        const affectedParties = new Set<string>();
        for (const row of staleEntries) {
          affectedParties.add(row.party_id);
          db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?").run(row.ledger_id);
        }
        for (const pId of affectedParties) {
          recalcPartyBalances(db, pId);
        }
      }
    } catch (e) {
      console.error('[DB] Failed to clean stale deleted invoice ledger entries in backfill:', e);
    }
  } catch (err: any) {
    console.error('[DB] Failed to backfill credit invoices:', err);
  }
}

// â”€â”€ Party Ledger Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('db:getPartyLedger', (event, partyId: string, includeDeleted = false) => {
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

    // Clean up any ledger entries where the invoice was deleted (is_deleted = 1)
    try {
      const deletedInvoiceEntries = db.prepare(`
        SELECT pl.ledger_id FROM party_ledger pl
        WHERE pl.party_id = ?
          AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
          AND (
            EXISTS (
              SELECT 1 FROM invoices i 
              WHERE i.is_deleted = 1 
                AND (
                  i.invoice_number = pl.reference_number 
                  OR pl.reference_number = i.invoice_number || '-PAY'
                  OR pl.reference_number LIKE i.invoice_number || '-%'
                  OR pl.description LIKE '%' || i.invoice_number || '%'
                )
            )
          )
      `).all(partyId) as any[];

      if (deletedInvoiceEntries.length > 0) {
        console.log(`[db:getPartyLedger] Cleaning up ${deletedInvoiceEntries.length} entries for deleted invoices`);
        for (const entry of deletedInvoiceEntries) {
          db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?").run(entry.ledger_id);
        }
        recalcPartyBalances(db, partyId);
      }
    } catch (e) {
      console.error('[db:getPartyLedger] Error cleaning deleted invoice ledger entries:', e);
    }
    try { recalcPartyBalances(db, partyId); } catch (e) {}
    const sql = includeDeleted
      ? `SELECT * FROM party_ledger WHERE party_id = ? ORDER BY transaction_date ASC, created_at ASC`
      : `SELECT * FROM party_ledger WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY transaction_date ASC, created_at ASC`;
    return db.prepare(sql).all(partyId);
  } catch (error: any) {
    console.error('[db:getPartyLedger]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:restorePartyLedgerEntry', (event, { ledger_id, party_id }: { ledger_id: string; party_id: string }) => {
  try {
    const db = getDb();
    db.prepare("UPDATE party_ledger SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ? AND party_id = ?").run(ledger_id, party_id);
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
    return { success: true };
  } catch (error: any) {
    console.error('[db:restorePartyLedgerEntry]', error);
    return { success: false, error: 'Operation failed' };
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

    recalcPartyBalances(db, entry.party_id);

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

// ── Helper: Compute customer credit status & FIFO allocations ──
export function computeCustomerCreditStatusSync(db: any, tenantId: string, customerId: string, invoices: any[]) {
  // 1. Fetch customer credit configuration
  const customer: any = db.prepare(`
    SELECT c.*, 
           p.party_id, p.balance as party_balance, p.credit_limit as party_credit_limit,
           p.credit_period_enabled as party_credit_period_enabled,
           p.credit_period_days as party_credit_period_days,
           p.credit_period_basis as party_credit_period_basis,
           p.restrict_on_credit_expiry as party_restrict_on_credit_expiry
    FROM customers c
    LEFT JOIN parties p ON p.tenant_id = c.tenant_id AND (p.is_deleted IS NULL OR p.is_deleted = 0)
      AND ((c.phone IS NOT NULL AND TRIM(c.phone) <> '' AND p.phone = c.phone) OR (LOWER(TRIM(p.name)) = LOWER(TRIM(c.name))))
    WHERE c.customer_id = ? AND c.tenant_id = ?
    ORDER BY CASE WHEN p.party_type = 'CUSTOMER' THEN 0 ELSE 1 END LIMIT 1
  `).get(customerId, tenantId) || {};

  const partyBalance = Number(customer.party_balance ?? 0);
  const creditPeriodEnabled = Boolean(customer.credit_period_enabled ?? customer.party_credit_period_enabled ?? false);
  const creditPeriodDays = Number(customer.credit_period_days ?? customer.party_credit_period_days ?? 30) || 30;
  const now = new Date();

  // If party balance is <= 0, customer owes nothing (all settled)
  const isSettled = partyBalance <= 0;

  // 2. Fetch all debits (payments) from party_ledger if a party exists
  let ledgerDebits: any[] = [];
  if (customer.party_id) {
    ledgerDebits = db.prepare(`
      SELECT ledger_id, debit_amount, reference_number, transaction_date 
      FROM party_ledger 
      WHERE party_id = ? AND tenant_id = ? AND debit_amount > 0 AND (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY transaction_date ASC, created_at ASC
    `).all(customer.party_id, tenantId) as any[];
  }

  // Map explicit payments by invoice reference
  const explicitPayments = new Map<string, number>();
  let totalExplicitDebits = 0;
  let totalDebits = 0;

  for (const d of ledgerDebits) {
    const amt = Number(d.debit_amount) || 0;
    totalDebits += amt;
    const ref = (d.reference_number || '').trim();
    if (ref) {
      const cleanRef = ref.replace(/-PAY$/i, '');
      explicitPayments.set(cleanRef, (explicitPayments.get(cleanRef) || 0) + amt);
      totalExplicitDebits += amt;
    }
  }

  let unallocatedPool = Math.max(0, totalDebits - totalExplicitDebits);

  // 3. Sort credit bills oldest to newest for FIFO allocation
  const creditInvoices = invoices.filter((inv: any) => {
    const pm = (inv.payment_method || '').toUpperCase();
    let splitCredit = 0;
    if (inv.split_details) {
      try {
        const s = typeof inv.split_details === 'string' ? JSON.parse(inv.split_details) : inv.split_details;
        splitCredit = Number(s?.credit) || 0;
      } catch {}
    }
    return pm === 'CREDIT' || splitCredit > 0 || (Number(inv.balance_amount) > 0 && pm !== 'CASH');
  }).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const billAllocations = new Map<string, { outstanding: number; dueDate: Date | null; isOverdue: boolean; overdueDays: number; remainingDays: number; status: string }>();

  for (const inv of creditInvoices) {
    const invNum = (inv.invoice_number || '').trim();
    const pm = (inv.payment_method || '').toUpperCase();
    let splitCredit = 0;
    if (inv.split_details) {
      try {
        const s = typeof inv.split_details === 'string' ? JSON.parse(inv.split_details) : inv.split_details;
        splitCredit = Number(s?.credit) || 0;
      } catch {}
    }

    const billCreditTotal = pm === 'SPLIT' && splitCredit > 0
      ? splitCredit
      : Math.max(0, Number(inv.grand_total) - (Number(inv.received_amount) || 0));

    if (isSettled) {
      billAllocations.set(inv.invoice_id, {
        outstanding: 0,
        dueDate: inv.due_date ? new Date(inv.due_date) : null,
        isOverdue: false,
        overdueDays: 0,
        remainingDays: 0,
        status: 'PAID'
      });
      continue;
    }

    const directPay = explicitPayments.get(invNum) || 0;
    let rem = Math.max(0, billCreditTotal - directPay);

    if (rem > 0 && unallocatedPool > 0) {
      const take = Math.min(rem, unallocatedPool);
      rem -= take;
      unallocatedPool -= take;
    }

    // Determine due date
    let dueDate: Date | null = null;
    if (inv.due_date) {
      dueDate = new Date(inv.due_date);
    } else if (creditPeriodEnabled && creditPeriodDays > 0 && inv.created_at) {
      dueDate = new Date(new Date(inv.created_at).getTime() + creditPeriodDays * 24 * 60 * 60 * 1000);
    }

    let isOverdue = false;
    let overdueDays = 0;
    let remainingDays = 0;
    let status = 'PAID';

    if (rem > 0.005) {
      if (dueDate) {
        const diffMs = dueDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
        if (diffDays < 0) {
          isOverdue = true;
          overdueDays = Math.abs(diffDays);
          status = 'OVERDUE';
        } else {
          remainingDays = diffDays;
          status = diffDays <= 3 ? 'DUE_SOON' : 'ACTIVE';
        }
      } else {
        status = 'ACTIVE';
      }
    } else {
      rem = 0;
      status = 'PAID';
    }

    billAllocations.set(inv.invoice_id, {
      outstanding: Math.round(rem * 100) / 100,
      dueDate,
      isOverdue,
      overdueDays,
      remainingDays,
      status
    });
  }

  return invoices.map((inv: any) => {
    const alloc = billAllocations.get(inv.invoice_id);
    if (alloc) {
      return {
        ...inv,
        is_credit_bill: true,
        due_date: alloc.dueDate ? alloc.dueDate.toISOString() : null,
        outstanding_amount: alloc.outstanding,
        is_overdue: alloc.isOverdue,
        overdue_days: alloc.overdueDays,
        remaining_days: alloc.remainingDays,
        credit_status: alloc.status
      };
    }
    return {
      ...inv,
      is_credit_bill: false,
      outstanding_amount: 0,
      is_overdue: false,
      overdue_days: 0,
      remaining_days: 0,
      credit_status: 'NON_CREDIT'
    };
  });
}

export function checkCustomerOverdueSync(db: any, tenantId: string, customerId?: string, custPhone?: string, custName?: string) {
  let cust: any = null;
  if (customerId) {
    cust = db.prepare('SELECT * FROM customers WHERE customer_id = ? AND tenant_id = ?').get(customerId, tenantId);
  }
  if (!cust && custPhone) {
    const cleanDigits = custPhone.replace(/\D/g, '');
    if (cleanDigits.length >= 7) {
      cust = db.prepare(`SELECT * FROM customers WHERE tenant_id = ? AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?)`).get(tenantId, custPhone, `%${cleanDigits.slice(-10)}`);
    } else {
      cust = db.prepare('SELECT * FROM customers WHERE tenant_id = ? AND phone = ?').get(tenantId, custPhone);
    }
  }
  if (!cust && custName) {
    cust = db.prepare('SELECT * FROM customers WHERE tenant_id = ? AND LOWER(TRIM(name)) = ?').get(tenantId, custName.trim().toLowerCase());
  }

  let party: any = null;
  if (custPhone) {
    const cleanDigits = custPhone.replace(/\D/g, '');
    if (cleanDigits.length >= 7) {
      party = db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0) AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?) LIMIT 1`).get(tenantId, custPhone, `%${cleanDigits.slice(-10)}`);
    } else {
      party = db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0) LIMIT 1`).get(tenantId, custPhone);
    }
  }
  if (!party && custName) {
    party = db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0) LIMIT 1`).get(tenantId, custName.trim().toLowerCase());
  }

  const periodEnabled = Boolean(cust?.credit_period_enabled ?? party?.credit_period_enabled ?? false);
  const restrictOnExpiry = (cust?.restrict_on_credit_expiry ?? party?.restrict_on_credit_expiry) !== 0 && (cust?.restrict_on_credit_expiry ?? party?.restrict_on_credit_expiry) !== false;
  const creditPeriodDays = Number(cust?.credit_period_days ?? party?.credit_period_days ?? 30) || 30;
  const partyBal = Number(party?.balance ?? cust?.party_balance ?? 0);

  if (!periodEnabled || partyBal <= 0) {
    return {
      isOverdue: false,
      overdueCount: 0,
      overdueAmount: 0,
      oldestOverdueDays: 0,
      restrictOnExpiry,
      creditPeriodEnabled: periodEnabled,
      creditPeriodDays,
      customerName: cust?.name || party?.name || custName || 'Customer'
    };
  }

  const cId = cust?.customer_id || '';
  const pId = party?.party_id || '';
  if (!cId && !pId) {
    return {
      isOverdue: false,
      overdueCount: 0,
      overdueAmount: 0,
      oldestOverdueDays: 0,
      restrictOnExpiry,
      creditPeriodEnabled: periodEnabled,
      creditPeriodDays,
      customerName: cust?.name || party?.name || custName || 'Customer'
    };
  }

  const cleanPh = (cust?.phone || party?.phone || custPhone || '').replace(/\D/g, '');
  const last10Ph = cleanPh.length >= 7 ? cleanPh.slice(-10) : '';
  const cleanNm = (cust?.name || party?.name || custName || '').trim().toLowerCase();

  const invs = db.prepare(`
    SELECT invoice_id, invoice_number, grand_total, received_amount, balance_amount, payment_method, split_details, due_date, created_at
    FROM invoices
    WHERE tenant_id = ?
      AND (
        (? != '' AND customer_id = ?)
        OR (? != '' AND customer_id = ?)
        OR (? != '' AND customer_phone IS NOT NULL AND customer_phone != '' AND REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '-', ''), '+', '') LIKE ?)
        OR (? != '' AND customer_name IS NOT NULL AND LOWER(REPLACE(TRIM(customer_name), '  ', ' ')) = ? AND (customer_phone IS NULL OR customer_phone = '' OR ? = ''))
      )
      AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
      AND (is_held IS NULL OR is_held = 0)
      AND (is_deleted IS NULL OR is_deleted = 0)
    ORDER BY created_at DESC
  `).all(
    tenantId,
    cId, cId,
    pId, pId,
    last10Ph ? `%${last10Ph}` : '', last10Ph ? `%${last10Ph}` : '',
    cleanNm, cleanNm, last10Ph
  ) as any[];

  const enriched = computeCustomerCreditStatusSync(db, tenantId, cId || pId, invs);
  const overdues = enriched.filter((i: any) => i.is_overdue);

  return {
    isOverdue: overdues.length > 0,
    overdueCount: overdues.length,
    overdueAmount: overdues.reduce((acc: number, curr: any) => acc + (Number(curr.outstanding_amount) || 0), 0),
    oldestOverdueDays: overdues.length > 0 ? Math.max(...overdues.map((o: any) => o.overdue_days || 0)) : 0,
    restrictOnExpiry,
    creditPeriodEnabled: periodEnabled,
    creditPeriodDays,
    customerName: cust?.name || party?.name || custName || 'Customer'
  };
}

const recentCheckoutsCache = new Map<string, { timestamp: number; result: any }>();
const customerCreateCache = new Map<string, number>();

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

  let checkoutCreatedAt = '';
  const transaction = db.transaction(() => {
    // Credit Limit & Credit Period enforcement guard
    const paymentMethodUpper = (invoice.payment_method || '').toUpperCase();
    let splitObj: any = null;
    if (invoice.split_details && typeof invoice.split_details === 'string') {
      try { splitObj = JSON.parse(invoice.split_details); } catch {}
    } else if (invoice.split_details && typeof invoice.split_details === 'object') {
      splitObj = invoice.split_details;
    }
    const isCreditBilling = paymentMethodUpper === 'CREDIT' || (paymentMethodUpper === 'SPLIT' && Number(splitObj?.credit) > 0);

    if (isCreditBilling) {
      const custPhone = (invoice.customer_phone || '').trim();
      const custName = (invoice.customer_name || '').trim();
      let matchedParty: any = null;
      if (custPhone) {
        const cleanDigits = custPhone.replace(/\D/g, '');
        if (cleanDigits.length >= 7) {
          const last10 = cleanDigits.slice(-10);
          matchedParty = db.prepare(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?)
            LIMIT 1
          `).get(tenantId, custPhone, `%${last10}`);
        } else {
          matchedParty = db.prepare('SELECT * FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(tenantId, custPhone);
        }
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

      // Credit Period Expiry restriction check:
      // Restricts only credit purchases if configured to restrict when overdue bills exist
      const overdueStatus = checkCustomerOverdueSync(db, tenantId, invoice.customer_id, custPhone, custName);
      if (overdueStatus.creditPeriodEnabled && overdueStatus.restrictOnExpiry && overdueStatus.isOverdue) {
        const fmtN = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        throw new Error(
          `Credit purchase blocked: ${overdueStatus.customerName} has ${overdueStatus.overdueCount} overdue credit bill(s) totaling ₹${fmtN(overdueStatus.overdueAmount)} (oldest overdue by ${overdueStatus.oldestOverdueDays} days). Credit period has expired. Please settle pending dues before making new credit purchases.`
        );
      }
    }

    const customerId = invoice.customer_id || upsertCustomerRecord(
      db,
      tenantId,
      invoice.customer_name,
      invoice.customer_phone,
      invoice.customer_address
    );

    // Calculate due date if credit purchase and customer has credit period configured
    let calculatedDueDate: string | null = invoice.due_date || null;
    if (!calculatedDueDate && isCreditBilling) {
      const custPhone = (invoice.customer_phone || '').trim();
      const custName = (invoice.customer_name || '').trim();
      const overdueStatus = checkCustomerOverdueSync(db, tenantId, customerId || invoice.customer_id, custPhone, custName);
      if (overdueStatus.creditPeriodEnabled && overdueStatus.creditPeriodDays > 0) {
        calculatedDueDate = new Date(Date.now() + overdueStatus.creditPeriodDays * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    const nowTimestamp = localTimestamp();
    checkoutCreatedAt = nowTimestamp;
    const invStmt = db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, user_id, invoice_number, invoice_type, 
        subtotal, tax_total, discount_total, discount_type, discount_value, grand_total, 
        payment_method, split_details, received_amount, balance_amount, customer_name, customer_phone, customer_gstin, customer_state, customer_address, sync_status,
        scrap_deduction, scrap_invoice_number, return_deduction, return_invoice_number, customer_id,
        cgst_total, sgst_total, igst_total, supply_type, actual_refund_paid, notes, description, settled_at, due_date, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      invoice.split_details && typeof invoice.split_details === 'object' ? JSON.stringify(invoice.split_details) : (invoice.split_details && invoice.split_details !== 'null' ? invoice.split_details : null),
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
      invoice.actual_refund_paid ?? 0,
      invoice.notes || invoice.description || null,
      invoice.description || invoice.notes || null,
      (invoice.payment_method && invoice.payment_method !== 'PENDING' && invoice.payment_method !== 'HOLD') ? nowTimestamp : null,
      calculatedDueDate,
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

    // 4. Handle scrap items â€” create scrap transactions and update scrap stock
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
    }
    adjustPaymentSourcesForInvoice(db, invoice.tenant_id || 'global', invoice, false);
    if (newCash <= 0) {
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

    const res = { success: true, invoice_id: invoice.invoice_id, invoice_number: finalInvoiceNumber, created_at: checkoutCreatedAt };
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

// â”€â”€ Hold Bill IPC Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        payment_method, split_details, received_amount, balance_amount, customer_name, customer_phone, 
        customer_gstin, customer_state, customer_address, sync_status,
        scrap_deduction, scrap_invoice_number, return_deduction, return_invoice_number,
        held_until, is_held, hold_note
      )
      VALUES (?, ?, ?, ?, 'HOLD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?, ?, datetime('now', '+24 hours', 'localtime'), 1, ?)
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
      invoice.split_details && typeof invoice.split_details === 'object' ? JSON.stringify(invoice.split_details) : (invoice.split_details && invoice.split_details !== 'null' ? invoice.split_details : null),
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

// Manually release a held bill â€” revert stock and mark as expired
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

// Auto-expire stale held bills â€” called on startup
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

// â”€â”€ Payment Methods (BANK / CARD / UPI sources) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Diagnostic: Clear stuck PENDING sync records â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Diagnostic: Get stuck PENDING sync records â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // Only ADMIN or SUPER_ADMIN can apply discounts
    const normalizedRole = (role || '').toUpperCase();
    if (!['ADMIN', 'SUPER_ADMIN', 'OWNER'].includes(normalizedRole)) {
      return { success: false, error: 'Admin access required to apply discounts' };
    }
    
    const invoice = db.prepare('SELECT subtotal, tax_total, scrap_deduction, return_deduction FROM invoices WHERE invoice_id = ?').get(invoice_id) as any;
    if (!invoice) return { success: false, error: 'Invoice not found' };

    let discount_total = 0;
    if (discount_type === 'PERCENTAGE') {
      discount_total = invoice.subtotal * (discount_value / 100);
    } else {
      discount_total = discount_value;
    }

    const scrapD = Math.max(0, Number(invoice.scrap_deduction) || 0);
    const returnD = Math.max(0, Number(invoice.return_deduction) || 0);
    const grand_total = Math.max(0, invoice.subtotal + invoice.tax_total - discount_total - scrapD - returnD);

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

    const activeTenantId = tenant_id || 'global';

    let query = `
      SELECT i.*, u.name as biller_name,
        st_biller.name as biller_staff_name,
        st_sales.name as sales_staff_name,
        COALESCE((SELECT COUNT(*) FROM invoice_items ii WHERE ii.invoice_id = i.invoice_id), 0) as item_count
      FROM invoices i 
      LEFT JOIN users u ON i.user_id = u.user_id 
      LEFT JOIN staff st_biller ON i.biller_staff_id = st_biller.staff_id
      LEFT JOIN staff st_sales ON i.sales_staff_id = st_sales.staff_id
      WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) 
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (i.is_held IS NULL OR i.is_held = 0)
    `;
    const params: any[] = [activeTenantId];

    // Only filter by user_id if explicitly requested (e.g. only_user_invoices flag)
    if (filters?.only_user_invoices && user_id) {
      query += ' AND i.user_id = ?';
      params.push(user_id);
    }

    if (search) {
      query += ' AND (i.invoice_number LIKE ? OR i.customer_name LIKE ? OR i.customer_phone LIKE ? OR i.description LIKE ? OR i.notes LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (payment_method) {
      const pmUpper = payment_method.toUpperCase();
      if (['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'].includes(pmUpper)) {
        const jsonKey = pmUpper === 'BANK_TRANSFER' ? 'bank_transfer' : pmUpper.toLowerCase();
        query += ` AND (UPPER(i.payment_method) = ? OR (UPPER(i.payment_method) IN ('SPLIT', 'CREDIT') AND CAST(json_extract(i.split_details, '$.${jsonKey}') AS REAL) > 0))`;
        params.push(pmUpper);
      } else {
        query += ' AND UPPER(i.payment_method) = ?';
        params.push(pmUpper);
      }
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
      const cleanStart = parseCleanDate(filterDate);
      const cleanEnd = filterDateEnd ? parseCleanDate(filterDateEnd) : cleanStart;
      const { startUtc, endUtc } = getUtcRangeForStoreDateRange(cleanStart, cleanEnd, activeTenantId);

      // Use created_at for date filtering to match the grouping/ordering in the UI.
      // Using COALESCE(settled_at, created_at) caused invoices created on a different date
      // to appear under wrong date groups (e.g. filtered for Oct 12 but displayed under Oct 19).
      query += ` AND (i.created_at >= ? AND i.created_at <= ?)`;
      params.push(startUtc, endUtc);
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

    const activeTenantId = tenant_id || 'global';

    // Determine the split_details JSON key for the active payment method filter
    const splitJsonKey = payment_method && ['CASH','UPI','CARD','BANK_TRANSFER','CHEQUE','CREDIT'].includes(payment_method.toUpperCase())
      ? (payment_method.toUpperCase() === 'BANK_TRANSFER' ? 'bank_transfer' : payment_method.toLowerCase())
      : null;

    let query = `
      SELECT 
        COALESCE(SUM(CASE WHEN i.converted_to_invoice_id IS NULL THEN 
          CASE
            WHEN UPPER(i.payment_method) IN ('SPLIT', 'CREDIT') AND i.split_details IS NOT NULL AND ${splitJsonKey ? `'${splitJsonKey}' IS NOT NULL` : `1=0`}
              THEN CAST(COALESCE(json_extract(i.split_details, '$.${splitJsonKey || 'cash'}'), 0) AS REAL)
            ELSE MIN(i.grand_total, MAX(0, COALESCE(i.subtotal, 0) + COALESCE(i.tax_total, 0) - COALESCE(i.discount_total, 0) - COALESCE(i.points_redeemed_discount, 0) - COALESCE(i.scrap_deduction, 0) - COALESCE(i.return_deduction, 0)))
          END
        ELSE 0 END), 0) as totalSales,
        COUNT(CASE WHEN i.converted_to_invoice_id IS NULL THEN 1 END) as totalInvoices,
        COALESCE(SUM(CASE WHEN i.converted_to_invoice_id IS NULL THEN i.tax_total ELSE 0 END), 0) as totalTax,
        COALESCE(SUM(CASE WHEN i.converted_to_invoice_id IS NULL THEN i.discount_total ELSE 0 END), 0) as totalDiscount
      FROM invoices i 
      WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) 
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (i.is_held IS NULL OR i.is_held = 0)
    `;
    const params: any[] = [activeTenantId];


    if (filters?.only_user_invoices && user_id) {
      query += ' AND i.user_id = ?';
      params.push(user_id);
    }

    if (search) {
      query += ' AND (i.invoice_number LIKE ? OR i.customer_name LIKE ? OR i.customer_phone LIKE ? OR i.description LIKE ? OR i.notes LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (payment_method) {
      const pmUpper = payment_method.toUpperCase();
      if (['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'].includes(pmUpper)) {
        const jsonKey = pmUpper === 'BANK_TRANSFER' ? 'bank_transfer' : pmUpper.toLowerCase();
        query += ` AND (UPPER(i.payment_method) = ? OR (UPPER(i.payment_method) IN ('SPLIT', 'CREDIT') AND CAST(json_extract(i.split_details, '$.${jsonKey}') AS REAL) > 0))`;
        params.push(pmUpper);
      } else {
        query += ' AND UPPER(i.payment_method) = ?';
        params.push(pmUpper);
      }
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
      const cleanStart = parseCleanDate(filterDate);
      const cleanEnd = filterDateEnd ? parseCleanDate(filterDateEnd) : cleanStart;
      const { startUtc, endUtc } = getUtcRangeForStoreDateRange(cleanStart, cleanEnd, activeTenantId);

      // Use created_at for date filtering to match the grouping/ordering in the UI.
      // Using COALESCE(settled_at, created_at) caused invoices created on a different date
      // to appear under wrong date groups (e.g. filtered for Oct 12 but displayed under Oct 19).
      query += ` AND (i.created_at >= ? AND i.created_at <= ?)`;
      params.push(startUtc, endUtc);
    }

    const row = db.prepare(query).get(...params) as any;
    const totalSales = row ? Number(row.totalSales) || 0 : 0;
    const totalInvoices = row ? Number(row.totalInvoices) || 0 : 0;
    const totalTax = row ? Number(row.totalTax) || 0 : 0;
    const totalDiscount = row ? Number(row.discount_total) || 0 : 0;
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
    const dateStr = localDate(new Date(), tenantId);
    const { startUtc, endUtc } = getUtcRangeForStoreDateRange(dateStr, dateStr, tenantId);
    const row = db.prepare(`
      SELECT COALESCE(SUM(MIN(grand_total, MAX(0, COALESCE(subtotal, 0) + COALESCE(tax_total, 0) - COALESCE(discount_total, 0) - COALESCE(points_redeemed_discount, 0) - COALESCE(scrap_deduction, 0) - COALESCE(return_deduction, 0)))), 0) as totalSales, COUNT(*) as invoiceCount
      FROM invoices
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
        AND (COALESCE(settled_at, created_at) >= ? AND COALESCE(settled_at, created_at) <= ?)
        AND converted_to_invoice_id IS NULL 
        AND (is_deleted IS NULL OR is_deleted = 0 OR is_deleted = '0' OR is_deleted = '0.0' OR is_deleted = 0.0)
        AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (is_held IS NULL OR is_held = 0)
    `).get(tenantId, startUtc, endUtc) as any;
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
  actual_refund_paid?: number;
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
  // Only ADMIN or SUPER_ADMIN can update invoices
  const normalizedRole = (payload.role || '').toUpperCase();
  if (!['ADMIN', 'SUPER_ADMIN', 'OWNER', 'ADMINISTRATOR'].includes(normalizedRole)) {
    return { success: false, error: 'Only administrators can edit past bills' };
  }
  const { items, ...invoice } = payload;
  const db = getDb();
  const existingInv = db.prepare(`SELECT * FROM invoices WHERE invoice_id = ?`).get(payload.invoice_id) as any;
  if (!existingInv) {
    return { success: false, error: 'Invoice not found' };
  }
  const oldCash = getCashAmountFromInvoice(existingInv);

  // Deduplication guard: block duplicate update calls within a 4-second window for the same invoice
  const itemsSig = (items || []).map((i: any) => `${i.product_id}:${i.quantity}:${i.unit_price}`).sort().join('|');
  const updateCacheKey = `update:${existingInv.tenant_id || payload.tenant_id}:${payload.invoice_id}:${invoice.grand_total}:${itemsSig}`;
  const now = Date.now();
  const cachedUpdate = recentCheckoutsCache.get(updateCacheKey);
  if (cachedUpdate && (now - cachedUpdate.timestamp < 4000)) {
    console.warn(`[db:updateInvoice] Duplicate update request blocked within 4s window for invoice ${payload.invoice_id}. Returning previous result.`);
    return cachedUpdate.result;
  }

  const finalReceivedAmount = payload.received_amount !== undefined ? payload.received_amount : (existingInv?.received_amount ?? null);
  const finalActualRefundPaid = payload.actual_refund_paid !== undefined ? payload.actual_refund_paid : (existingInv?.actual_refund_paid ?? 0);
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
        received_amount = ?, actual_refund_paid = ?, balance_amount = ?, split_details = ?,
        customer_name = ?, customer_phone = ?, customer_gstin = ?, customer_state = ?, customer_address = ?,
        scrap_deduction = ?, scrap_invoice_number = ?, return_deduction = ?, return_invoice_number = ?,
        customer_id = ?, cgst_total = ?, sgst_total = ?, igst_total = ?, supply_type = ?,
        notes = ?, description = ?,
        sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE invoice_id = ?
    `).run(
      invoice.subtotal, invoice.tax_total, invoice.discount_total,
      invoice.discount_type || 'FIXED', invoice.discount_value || 0,
      invoice.grand_total, invoice.payment_method || 'PENDING',
      finalReceivedAmount, finalActualRefundPaid, finalBalanceAmount,
      (invoice as any).split_details && typeof (invoice as any).split_details === 'object' ? JSON.stringify((invoice as any).split_details) : ((invoice as any).split_details && (invoice as any).split_details !== 'null' ? (invoice as any).split_details : null),
      invoice.customer_name || null, invoice.customer_phone || null,
      invoice.customer_gstin || null, invoice.customer_state || null,
      invoice.customer_address || null,
      invoice.scrap_deduction ?? 0, invoice.scrap_invoice_number || null,
      invoice.return_deduction ?? 0, invoice.return_invoice_number || null,
      customerId || null,
      (invoice as any).cgst_total ?? 0, (invoice as any).sgst_total ?? 0,
      (invoice as any).igst_total ?? 0, (invoice as any).supply_type || 'INTRA',
      (invoice as any).notes || (invoice as any).description || null,
      (invoice as any).description || (invoice as any).notes || null,
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
      customer_id: customerId || (payload as any).customer_id || (invoice as any).customer_id || existingInv.customer_id,
      customer_name: invoice.customer_name,
      customer_phone: invoice.customer_phone,
      customer_address: invoice.customer_address,
      customer_gstin: invoice.customer_gstin,
      split_details: (invoice as any).split_details || (payload as any).split_details || existingInv.split_details,
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
    const res = { success: true, created_at: existingInv?.created_at };
    recentCheckoutsCache.set(updateCacheKey, { timestamp: now, result: res });
    if (recentCheckoutsCache.size > 100) {
      for (const [k, v] of recentCheckoutsCache.entries()) {
        if (now - v.timestamp > 30000) recentCheckoutsCache.delete(k);
      }
    }
    return res;
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
    const existingInv = db.prepare(`SELECT * FROM invoices WHERE invoice_id = ?`).get(payload.invoice_id) as any;
    if (!existingInv) {
      return { success: false, error: 'Invoice not found' };
    }
    const oldCash = getCashAmountFromInvoice(existingInv);

    // Deduplication guard
    const paymentCacheKey = `updatePayment:${existingInv.tenant_id || payload.tenant_id}:${payload.invoice_id}:${payload.payment_method}:${payload.received_amount}:${payload.balance_amount}`;
    const now = Date.now();
    const cachedPayment = recentCheckoutsCache.get(paymentCacheKey);
    if (cachedPayment && (now - cachedPayment.timestamp < 4000)) {
      console.warn(`[db:updateInvoicePayment] Duplicate update request blocked within 4s window for invoice ${payload.invoice_id}. Returning previous result.`);
      return cachedPayment.result;
    }

    const splitDetailsVal = payload.split_details && typeof payload.split_details === 'object'
      ? JSON.stringify(payload.split_details)
      : (payload.split_details && payload.split_details !== 'null' ? payload.split_details : null);

    db.prepare(`
      UPDATE invoices SET
        payment_method = ?,
        received_amount = ?,
        balance_amount = ?,
        split_details = ?,
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
    adjustPaymentSourcesForInvoice(db, existingInv.tenant_id || payload.tenant_id, updatedInvObj, false);

    syncInvoiceCreditLedger(db, {
      invoice_id: payload.invoice_id,
      tenant_id: existingInv.tenant_id || payload.tenant_id,
      invoice_number: existingInv.invoice_number,
      invoice_type: existingInv.invoice_type,
      grand_total: existingInv.grand_total,
      payment_method: payload.payment_method,
      received_amount: payload.received_amount,
      balance_amount: payload.balance_amount,
      customer_id: existingInv.customer_id,
      customer_name: existingInv.customer_name,
      customer_phone: existingInv.customer_phone,
      customer_address: existingInv.customer_address,
      customer_gstin: existingInv.customer_gstin,
      split_details: payload.split_details ?? existingInv.split_details,
      created_at: existingInv.created_at,
    });
    backfillLastRun = 0; // reset so next db:getParties re-scans

    import('./sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Invoice payment update sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    const res = { success: true };
    recentCheckoutsCache.set(paymentCacheKey, { timestamp: now, result: res });
    if (recentCheckoutsCache.size > 100) {
      for (const [k, v] of recentCheckoutsCache.entries()) {
        if (now - v.timestamp > 30000) recentCheckoutsCache.delete(k);
      }
    }
    return res;
  } catch (error: any) {
    console.error('[db:updateInvoicePayment]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// â”€â”€ Return Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('db:createReturn', safeHandler((event, payload: {
  return_id: string;
  invoice_id: string;
  tenant_id: string;
  user_id?: string;
  user_name?: string;
  return_number: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
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
    const now = localTimestamp();
    db.prepare(`
      INSERT INTO returns (
        return_id, invoice_id, tenant_id, user_id, return_number,
        customer_name, customer_phone, customer_address,
        subtotal, tax_total, grand_total, reason,
        refund_method, adjusted_invoice_number, adjusted_amount,
        sync_status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).run(
      returnData.return_id, returnData.invoice_id, returnData.tenant_id, returnData.user_id || null,
      returnData.return_number, returnData.customer_name || null, returnData.customer_phone || null,
      returnData.customer_address || null,
      returnData.subtotal, returnData.tax_total, returnData.grand_total, returnData.reason || null,
      returnData.refund_method || null, returnData.adjusted_invoice_number || null,
      returnData.adjusted_amount ?? 0,
      now, now
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

    let origInv: any = null;
    if (returnData.invoice_id) {
      origInv = db.prepare('SELECT * FROM invoices WHERE invoice_id = ?').get(returnData.invoice_id);
    }
    const origPm = (origInv?.payment_method || '').toUpperCase();
    let origSplitCredit = 0;
    if (origInv?.split_details) {
      try {
        const s = typeof origInv.split_details === 'string' ? JSON.parse(origInv.split_details) : origInv.split_details;
        origSplitCredit = Number(s?.credit) || 0;
      } catch {}
    }
    const isOrigCredit = Boolean(
      origInv && (
        origPm === 'CREDIT' ||
        origSplitCredit > 0 ||
        (Number(origInv.balance_amount) > 0 && origPm !== 'CASH')
      )
    );

    // If original invoice was a credit bill, reduce its balance_amount by the returned amount
    if (isOrigCredit && origInv) {
      const currentBal = Number(origInv.balance_amount) || (origPm === 'CREDIT' ? Math.max(0, Number(origInv.grand_total) - (Number(origInv.received_amount) || 0)) : origSplitCredit);
      const newBal = Math.max(0, currentBal - Number(returnData.grand_total));
      db.prepare("UPDATE invoices SET balance_amount = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?").run(newBal, origInv.invoice_id);
    }

    const refMethod = (returnData.refund_method || (isOrigCredit ? 'CREDIT' : 'ADJUST_BILL')).toUpperCase();

    if (refMethod === 'CASH' && Number(returnData.grand_total) > 0) {
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

    // Sync party ledger whenever:
    // 1. Original bill was a credit invoice (return reduces customer's balance), OR
    // 2. Refund method is CREDIT, STORE_CREDIT, or ADJUST_BILL (customer gets account credit), OR
    // 3. Customer has an account / identity and refund was made
    const shouldSyncLedger = isOrigCredit || ['CREDIT', 'STORE_CREDIT', 'ADJUST_BILL'].includes(refMethod) || (
      Boolean(returnData.customer_name || returnData.customer_phone || origInv?.customer_id) &&
      ['CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CASH'].includes(refMethod) &&
      Number(returnData.grand_total) > 0
    );

    if (shouldSyncLedger && Number(returnData.grand_total) > 0) {
      syncReturnLedger(db, {
        tenant_id: returnData.tenant_id || origInv?.tenant_id || 'global',
        return_number: returnData.return_number,
        return_id: returnData.return_id,
        invoice_id: returnData.invoice_id || null,
        invoice_number: origInv?.invoice_number || null,
        customer_id: origInv?.customer_id || null,
        customer_name: returnData.customer_name || origInv?.customer_name || null,
        customer_phone: returnData.customer_phone || origInv?.customer_phone || null,
        customer_address: returnData.customer_address || origInv?.customer_address || null,
        customer_gstin: origInv?.customer_gstin || null,
        grand_total: Number(returnData.grand_total) || 0,
        refund_method: refMethod,
        amount: Number(returnData.grand_total) || 0,
        user_id: returnData.user_id,
        user_name: returnData.user_name || returnData.user_id,
        created_at: now,
      });
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
    return { success: false, error: error?.message || 'Operation failed' };
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

// Return-mode invoice search â€” only returns bills that still have at least one
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
  
  // Get return details for ledger sync
  const returnData = db.prepare(`
    SELECT return_id, return_number, customer_name, customer_phone, customer_address, grand_total, refund_method, created_at, user_id
    FROM returns WHERE tenant_id = ? AND return_number = ?
  `).get(tenant_id, return_number) as any;
  
  const res = db.prepare(`
    UPDATE returns 
    SET adjusted_amount = COALESCE(adjusted_amount, 0) + ?,
        adjusted_invoice_number = ?,
        sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = ? AND return_number = ? AND grand_total > COALESCE(adjusted_amount, 0)
  `).run(amt, adjusted_invoice_number, tenant_id, return_number);
  
  if (res.changes === 0) return { success: false, error: 'Return not found or already fully adjusted' };
  
  // Sync party ledger for ADJUST_BILL
  if (returnData && returnData.refund_method === 'ADJUST_BILL') {
    syncReturnLedger(db, {
      tenant_id: tenant_id || 'global',
      return_number: returnData.return_number,
      return_id: returnData.return_id,
      customer_name: returnData.customer_name,
      customer_phone: returnData.customer_phone,
      customer_address: returnData.customer_address,
      customer_gstin: null,
      grand_total: returnData.grand_total,
      refund_method: 'ADJUST_BILL',
      adjusted_invoice_number: adjusted_invoice_number,
      amount: amt,
      user_id: returnData.user_id,
      user_name: returnData.user_name || returnData.user_id,
      created_at: localTimestamp(),
    });
  }
  
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
      const returnRow = db.prepare('SELECT * FROM returns WHERE return_id = ?').get(return_id) as any;
      if (!returnRow) return;

      const items = db.prepare('SELECT product_id, quantity FROM return_items WHERE return_id = ?').all(return_id) as any[];
      for (const item of items) {
        db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?').run(item.quantity, item.product_id);
      }

      // Restore original invoice balance_amount if it was a credit bill
      if (returnRow.invoice_id) {
        const origInv = db.prepare('SELECT * FROM invoices WHERE invoice_id = ?').get(returnRow.invoice_id) as any;
        if (origInv) {
          const origPm = (origInv.payment_method || '').toUpperCase();
          let origSplitCredit = 0;
          if (origInv.split_details) {
            try {
              const s = typeof origInv.split_details === 'string' ? JSON.parse(origInv.split_details) : origInv.split_details;
              origSplitCredit = Number(s?.credit) || 0;
            } catch {}
          }
          const isOrigCredit = origPm === 'CREDIT' || origSplitCredit > 0 || (Number(origInv.balance_amount) > 0 && origPm !== 'CASH');
          if (isOrigCredit) {
            const restoredBalance = (Number(origInv.balance_amount) || 0) + (Number(returnRow.grand_total) || 0);
            db.prepare("UPDATE invoices SET balance_amount = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?").run(restoredBalance, origInv.invoice_id);
          }
        }
      }

      // Soft delete party ledger entries for this return
      const ledgerRows = db.prepare(`
        SELECT ledger_id, party_id FROM party_ledger
        WHERE reference_number = ?
           OR reference_number LIKE ? || '-%'
           OR description LIKE '%' || ? || '%'
      `).all(returnRow.return_number, returnRow.return_number, returnRow.return_number) as any[];

      const affectedParties = new Set<string>();
      for (const row of ledgerRows) {
        affectedParties.add(row.party_id);
        db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?").run(row.ledger_id);
      }

      db.prepare('DELETE FROM return_items WHERE return_id = ?').run(return_id);
      db.prepare('DELETE FROM returns WHERE return_id = ?').run(return_id);

      for (const pId of affectedParties) {
        recalcPartyBalances(db, pId);
      }
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
          // Respect user-set prefix -- no forced override
        }
        prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
        counter = typeof cfg.counter === 'number' ? cfg.counter : 1;
      } catch {
        // Invalid JSON â€” use defaults
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
          // Respect user-set prefix -- no forced override
      }
      prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
      counter = typeof cfg.counter === 'number' ? cfg.counter : 1;
    } catch {
      // Invalid JSON â€” use defaults
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

    // Some settings are stored raw (server-synced) and some JSON-encoded â€” parse both.
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
          const copyItems: { item_id: string; source_item_id: string; product_id: string; name: string; quantity: number; is_service_item: number; newUnitPrice: number; newTotal: number; newTaxAmount: number; bosUnitPrice: number; bosTax: number; bosTotal: number; qtyFromPaper: number; paperConsumed: { item_id: string; qty: number }[] }[] = [];
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

            // ─── Compute available paper stock WITH rates from purchase bills (FIFO) ───
            const paperStockRows = db.prepare(`
              SELECT pbi.item_id, pbi.quantity, pbi.purchase_price, pbi.selling_price, pbi.offer_price
              FROM purchase_bill_items pbi
              JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
              WHERE pbi.product_id = ? 
                AND pb.bill_type = 'GST' 
                AND pbi.skip_stock_update = 1 
                AND pb.tenant_id = ?
              ORDER BY pbi.created_at ASC
            `).all(gstProduct.product_id, payload.tenant_id) as any[];

            const paperSoldRow = db.prepare(`
              SELECT COALESCE(SUM(ii.qty_from_paper_stock), 0) as total_paper_sold
              FROM invoice_items ii
              JOIN invoices i ON ii.invoice_id = i.invoice_id
              WHERE ii.product_id = ? AND i.invoice_type = 'GST' AND ii.tenant_id = ?
            `).get(gstProduct.product_id, payload.tenant_id) as any;
            const totalPaperSold = paperSoldRow ? Number(paperSoldRow.total_paper_sold) : 0;

            // Calculate remaining qty per purchase bill item (FIFO consumption)
            let remainingToSell = totalPaperSold;
            const availablePaperBatches: { item_id: string; qty: number; purchase_price: number; selling_price: number; offer_price: number }[] = [];

            for (const batch of paperStockRows) {
              const batchQty = Number(batch.quantity) || 0;
              const alreadyConsumed = Math.min(batchQty, remainingToSell);
              const availableQty = batchQty - alreadyConsumed;
              remainingToSell = Math.max(0, remainingToSell - batchQty);
              
              if (availableQty > 0) {
                availablePaperBatches.push({
                  item_id: batch.item_id,
                  qty: availableQty,
                  purchase_price: Number(batch.purchase_price) || 0,
                  selling_price: Number(batch.selling_price) || 0,
                  offer_price: Number(batch.offer_price) || 0,
                });
              }
            }

            const totalAvailablePaper = availablePaperBatches.reduce((sum, b) => sum + b.qty, 0);
            const qtyToConvert = Math.min(originalQty, totalAvailablePaper);

            if (qtyToConvert <= 0) {
              skippedItems.push(`${item.name || item.product_id} (No available paper stock - 0 of ${originalQty} converted)`);
              continue;
            }

            // ─── Determine unit price: prefer paper stock rates, fallback to profit % ───
            let newUnitPrice = 0;
            let paperConsumed: { item_id: string; qty: number }[] = [];
            let remainingQty = qtyToConvert;

            for (const batch of availablePaperBatches) {
              if (remainingQty <= 0) break;
              const take = Math.min(batch.qty, remainingQty);
              
              // Use paper stock rate priority: offer_price > selling_price > purchase_price * (1 + profit%)
              const batchPrice = batch.offer_price > 0 ? batch.offer_price
                : batch.selling_price > 0 ? batch.selling_price
                : batch.purchase_price > 0 ? Math.round(batch.purchase_price * multiplier * 100) / 100
                : 0;
              
              if (batchPrice > 0) {
                newUnitPrice = batchPrice;
                paperConsumed.push({ item_id: batch.item_id, qty: take });
                remainingQty -= take;
                break;
              }
              remainingQty -= take;
              paperConsumed.push({ item_id: batch.item_id, qty: take });
            }

            // Fallback: no paper stock with valid rates → use profit % on catalog base_price
            if (!newUnitPrice || newUnitPrice <= 0) {
              newUnitPrice = gstProduct.offer_price && Number(gstProduct.offer_price) > 0
                ? Number(gstProduct.offer_price)
                : Math.round(Number(gstProduct.base_price) * multiplier * 100) / 100;
              
              // Still consume paper stock (FIFO) even if rates not usable
              remainingQty = qtyToConvert;
              paperConsumed = [];
              for (const batch of availablePaperBatches) {
                if (remainingQty <= 0) break;
                const take = Math.min(batch.qty, remainingQty);
                paperConsumed.push({ item_id: batch.item_id, qty: take });
                remainingQty -= take;
              }
            }

            // ─── Decrement paper stock (update purchase_bill_items quantities) ───
            for (const consumed of paperConsumed) {
              db.prepare(`
                UPDATE purchase_bill_items 
                SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                WHERE item_id = ?
              `).run(consumed.qty, consumed.item_id);
            }

            const taxRate = Number(gstProduct.tax_rate_percent) || 0;
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
              paperConsumed,
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

          // 1. Create the GST invoice as a NEW row (copy) â€” the BoS stays intact.
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

          // 2. Copy the priced items â€” they remember their original BoS values so
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

          // 3. Mark the BoS as superseded â€” linked to its GST copy (original Estimate remains untouched)
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
        console.log('[convertBosToGst] Converted', invoice_id, 'â†’', invoice.new_number);
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
  'label_show_shop_name',
  'billing_ui_config'
];

ipcMain.removeHandler('settings:set');
ipcMain.handle('settings:set', async (event, { tenant_id, key, value }: { tenant_id: string; key: string; value: any }) => {
  try {
    const db = getDb();
    const isLocalDeviceKey = LOCAL_DEVICE_SETTING_KEYS.includes(key);
    const syncStatus = isLocalDeviceKey ? 'LOCAL' : 'PENDING';
    const tid = tenant_id || 'global';
    const valString = typeof value === 'string' ? value : JSON.stringify(value);

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

ipcMain.handle('sync:resetFastPollBackoff', async () => {
  try {
    const { resetFastPollBackoff } = await import('./sync/syncWorker.js');
    resetFastPollBackoff();
    return { success: true };
  } catch (err: any) {
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
  const defaultCloud = (process.env.VENDORA_CLOUD_API || process.env.NAFID_CLOUD_API || process.env.VITE_CLOUD_API || '').replace(/\/$/, '');

  if (syncMode === 'LAN' || syncMode === 'HYBRID') {
    if (lanRole === 'PRIMARY') {
      return {
        ok: true,
        route: 'LAN',
        message: `Wifi Sync Active â€” This PC is Primary Master Server (Port ${port})`
      };
    }

    const host = cleanHost || process.env.DEFAULT_LAN_IP || '';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`http://${host}:${port}/health`, { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        return {
          ok: true,
          route: 'LAN',
          message: `Wifi Sync Active â€” Connected to Primary Master Server (${host}:${port})`
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
              message: `Cloud Sync Active (Hybrid Fallback) â€” LAN Master Server (${host}) returned status ${res.status}. Syncing via Cloud API.`
            };
          }
        } catch {}
        return {
          ok: false,
          error: `Sync Inactive â€” Master Server (${host}) returned status ${res.status}`
        };
      } else {
        return {
          ok: false,
          error: `Sync Inactive â€” Master Server (${host}) returned status ${res.status}`
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
              message: `Cloud Sync Active (Hybrid Fallback) â€” LAN Master Server (${host}) unreachable. Automatically syncing via Cloud API!`
            };
          }
        } catch {}
      }
      return {
        ok: false,
        error: `Sync Inactive â€” Could not connect to Master Server at ${host}:${port}. Ensure PC 1 is on, POS is open & Windows Firewall allows Port 3888.`
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
          message: `Cloud Sync Active â€” Connected to Cloud API server`
        };
      }
    } catch {}
    return {
      ok: false,
      error: `Sync Inactive â€” Cloud API server (${defaultCloud}) is unreachable.`
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
    // Cloud API URL â€” set VENDORA_CLOUD_API in .env
    const apiUrl = (endpoints.primaryUrl || process.env.VENDORA_CLOUD_API || '').replace(/\/$/, '');
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

// â”€â”€ Scrap Categories IPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€ Scrap Categories IPC (categories ARE items, with price/stock/unit) â”€â”€
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
    const qtyNum = Number(t.quantity) || 0;
    const delta = t.type === 'PURCHASE' ? qtyNum : -qtyNum;
    const paymentStatus = t.payment_status || 'CASH';
    const result = db.transaction(() => {
      if (t.party_name || t.customer_phone) {
        upsertCustomerRecord(db, t.tenant_id || 'global', t.party_name, t.customer_phone, t.customer_address);
      }
      db.prepare(`
        INSERT INTO scrap_transactions (transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, payment_status, sync_status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
      `).run(t.transaction_id, t.tenant_id, t.type, t.scrap_category_id, qtyNum, t.rate, t.total_amount, t.party_name || null, t.customer_phone || null, t.customer_address || null, t.notes || null, t.scrap_invoice_number || null, paymentStatus);
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
      } else if (t.type === 'SALE' && (paymentStatus === 'CASH' || paymentStatus === 'PAID') && Number(t.total_amount) > 0) {
        const todayDate = localDate();
        const drawer = getOpenCashDrawer(db, t.tenant_id || 'global', todayDate);
        if (drawer) {
          const txnId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, sync_status)
            VALUES (?, ?, ?, 'CASH_IN', ?, 'SCRAP_SALE', ?, 'system', 'PENDING')
          `).run(
            txnId,
            t.tenant_id || 'global',
            drawer.drawer_id,
            Number(t.total_amount),
            `Scrap sale ${t.scrap_invoice_number || ''}`.trim()
          );
          const newCashSales = Number(drawer.cash_sales) + Number(t.total_amount);
          const newCurrentCash = Number(drawer.current_cash) + Number(t.total_amount);
          const newExpectedClosing = Number(drawer.opening_balance) + newCashSales + Number(drawer.cash_in) - Number(drawer.cash_out);
          db.prepare(`
            UPDATE cash_drawer SET cash_sales = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE drawer_id = ?
          `).run(newCashSales, newCurrentCash, newExpectedClosing, drawer.drawer_id);
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
    const cleanSearch = String(search).trim();
    const cleanSearchNoSpace = cleanSearch.replace(/\s+/g, '');
    return db.prepare(`
      SELECT * FROM scrap_categories 
      WHERE tenant_id = ? AND is_deleted = 0 AND (name LIKE ? OR REPLACE(name, ' ', '') LIKE ? OR CLEAN_STR(name) LIKE ?)
      ORDER BY name COLLATE NOCASE ASC
      LIMIT 10
    `).all(tenant_id, `%${cleanSearch}%`, `%${cleanSearchNoSpace}%`, `%${cleanSearch.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')}%`);
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
      // Use the stored prefix as-is — do NOT override prefixes that happen to contain '-SCR-'.
      // The stored prefix is whatever the user configured in Settings.
      const defaultPrefix = `${terminalCode}-SCR-`;
      let prefix = defaultPrefix;

      if (row) {
        try {
          const parsed = JSON.parse(row.value);
          counter = (typeof parsed.counter === 'number' && parsed.counter > 0) ? parsed.counter : 1;
          // Respect user-set prefix directly — no keyword-based override.
          if (parsed.prefix && /[A-Z0-9]/i.test(parsed.prefix)) {
            prefix = parsed.prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
          }
        } catch {
          counter = 1;
        }
      }

      // ── Duplicate-safety check (mirrors normal invoice behaviour) ──────────
      // Check existing scrap_transactions for this invoice number so we never
      // reuse a number that was already printed/saved on a previous bill.
      const checkStmt = db.prepare(
        'SELECT 1 FROM scrap_transactions WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0) LIMIT 1'
      );
      let candidate = `${prefix}${String(counter).padStart(3, '0')}`;
      while (checkStmt.get(tenant_id || 'global', candidate)) {
        counter++;
        candidate = `${prefix}${String(counter).padStart(3, '0')}`;
      }

      // Persist the next counter value so subsequent calls start from counter+1.
      const nextConfig = { prefix, counter: counter + 1 };
      db.prepare(`
        INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
        VALUES ('global', ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, key) DO UPDATE SET
          value = EXCLUDED.value,
          sync_status = 'LOCAL',
          updated_at = CURRENT_TIMESTAMP
      `).run(configKey, JSON.stringify(nextConfig));

      return { success: true, invoiceNumber: candidate, counter };
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
    let counter = 1;
    let prefix = defaultPrefix;

    if (row) {
      try {
        const config = JSON.parse(row.value);
        counter = (typeof config.counter === 'number' && config.counter > 0) ? config.counter : 1;
        // Respect user-set prefix directly -- no keyword-based override.
        if (config.prefix && /[A-Z0-9]/i.test(config.prefix)) {
          prefix = config.prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
        }
      } catch {
        // Invalid JSON in stored value -- fall through to defaults
      }
    }

    // Duplicate-safety check (peek -- read-only, no counter increment)
    const checkStmt = db.prepare(
      'SELECT 1 FROM scrap_transactions WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0) LIMIT 1'
    );
    let candidate = `${prefix}${String(counter).padStart(3, '0')}`;
    while (checkStmt.get(tenant_id || 'global', candidate)) {
      counter++;
      candidate = `${prefix}${String(counter).padStart(3, '0')}`;
    }

    return { success: true, invoiceNumber: candidate };
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

// â”€â”€ Scrap CREDIT â†’ Party/Ledger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

      // Party changed â†’ move the entry to the new party
      if (existingEntry && existingEntry.party_id !== party.party_id) {
        removeEntry(existingEntry);
        existingEntry = null;
      }

      if (existingEntry) {
        // Same party â†’ update in place (keeps ledger_id stable for sync)
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
      SELECT 
        p.product_id,
        COALESCE(inv_summary.gst_qty, 0) as gst_qty,
        COALESCE(inv_summary.estimate_qty, 0) as estimate_qty,
        COALESCE(pb_summary.gst_purchased_qty, 0) as gst_purchased_qty
      FROM products p
      LEFT JOIN (
        SELECT 
          ii.product_id,
          SUM(CASE WHEN i.invoice_type = 'GST' THEN ii.quantity ELSE 0 END) as gst_qty,
          SUM(CASE WHEN i.invoice_type = 'BILL_OF_SUPPLY' AND i.converted_to_invoice_id IS NULL THEN ii.quantity ELSE 0 END) as estimate_qty
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.invoice_id
        WHERE ii.tenant_id = ? AND (i.is_deleted IS NULL OR i.is_deleted = 0)
        GROUP BY ii.product_id
      ) inv_summary ON p.product_id = inv_summary.product_id
      LEFT JOIN (
        SELECT 
          pbi.product_id,
          SUM(pbi.quantity) as gst_purchased_qty
        FROM purchase_bill_items pbi
        JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
        WHERE pb.tenant_id = ? AND pb.bill_type = 'GST'
        GROUP BY pbi.product_id
      ) pb_summary ON p.product_id = pb_summary.product_id
      WHERE p.tenant_id = ? AND p.is_deleted = 0
    `).all(tenantId, tenantId, tenantId);
  } catch (error: any) {
    console.error('[db:getProductBillQuantities]', error);
    return [];
  }
});

ipcMain.handle('db:getProductSuppliers', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return {};
    const rows = db.prepare(`
      SELECT DISTINCT pbi.product_id, pb.supplier_name
      FROM purchase_bill_items pbi
      JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
      WHERE pb.tenant_id = ? AND pb.supplier_name IS NOT NULL AND TRIM(pb.supplier_name) != ''
    `).all(tenantId);
    const map: Record<string, string[]> = {};
    for (const row of rows as any[]) {
      if (!map[row.product_id]) map[row.product_id] = [];
      if (!map[row.product_id].includes(row.supplier_name)) {
        map[row.product_id].push(row.supplier_name);
      }
    }
    return map;
  } catch (error: any) {
    console.error('[db:getProductSuppliers]', error);
    return {};
  }
});

// â”€â”€ Product Sales Summary (GST qty vs BoS qty sold per product) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ BoS convertible check: which BoS invoices have â‰¥1 item with a GST purchase record â”€â”€
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

// â”€â”€ Quotations IPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          // Respect user-set prefix -- no forced override
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
          // Respect user-set prefix -- no forced override
        }
        const prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
        return { success: true, quotationNumber: `${prefix}${String(config.counter || 1).padStart(3, '0')}` };
      } catch {
        // Invalid JSON in stored value â€” fall through to default
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
      const qCols = db.prepare('PRAGMA table_info(quotations)').all().map((c: any) => c.name);
      if (qCols.includes('customer_gstin')) {
        db.prepare(`
          INSERT INTO quotations (
            quotation_id, tenant_id, quotation_number, customer_name, customer_phone, customer_address,
            customer_gstin, customer_state, is_gst, discount_total, round_off, biller_name,
            terms_conditions, subtotal, tax_total, grand_total, status, sync_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'PENDING')
          ON CONFLICT(quotation_id) DO UPDATE SET
            quotation_number = excluded.quotation_number,
            customer_name = excluded.customer_name,
            customer_phone = excluded.customer_phone,
            customer_address = excluded.customer_address,
            customer_gstin = excluded.customer_gstin,
            customer_state = excluded.customer_state,
            is_gst = excluded.is_gst,
            discount_total = excluded.discount_total,
            round_off = excluded.round_off,
            biller_name = excluded.biller_name,
            terms_conditions = excluded.terms_conditions,
            subtotal = excluded.subtotal,
            tax_total = excluded.tax_total,
            grand_total = excluded.grand_total,
            status = 'ACTIVE',
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        `).run(
          q.quotation_id, q.tenant_id, q.quotation_number, q.customer_name || null, q.customer_phone || null, q.customer_address || null,
          q.customer_gstin || null, q.customer_state || null, q.is_gst ?? (Number(q.tax_total) > 0 ? 1 : 0),
          Number(q.discount_total) || 0, Number(q.round_off) || 0, q.biller_name || null,
          q.terms_conditions || null, q.subtotal, q.tax_total, q.grand_total
        );
      } else {
        db.prepare(`
          INSERT INTO quotations (quotation_id, tenant_id, quotation_number, customer_name, customer_phone, customer_address, terms_conditions, subtotal, tax_total, grand_total, status, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'PENDING')
          ON CONFLICT(quotation_id) DO UPDATE SET
            quotation_number = excluded.quotation_number,
            customer_name = excluded.customer_name,
            customer_phone = excluded.customer_phone,
            customer_address = excluded.customer_address,
            terms_conditions = excluded.terms_conditions,
            subtotal = excluded.subtotal,
            tax_total = excluded.tax_total,
            grand_total = excluded.grand_total,
            status = 'ACTIVE',
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        `).run(q.quotation_id, q.tenant_id, q.quotation_number, q.customer_name || null, q.customer_phone || null, q.customer_address || null, q.terms_conditions || null, q.subtotal, q.tax_total, q.grand_total);
      }

      // Delete old items before inserting new ones to prevent duplicate rows
      db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(q.quotation_id);

      const qiCols = db.prepare('PRAGMA table_info(quotation_items)').all().map((c: any) => c.name);
      if (qiCols.includes('hsn_code')) {
        const stmt = db.prepare(`
          INSERT INTO quotation_items (
            item_id, quotation_id, tenant_id, product_id, name, quantity, weight, rate, amount,
            hsn_code, uom, tax_rate_percent, discount_amount, discount_percent, taxable_amount,
            cgst_amount, sgst_amount, igst_amount, sync_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `);
        for (const item of q.items) {
          stmt.run(
            item.item_id, q.quotation_id, q.tenant_id, item.product_id || null, item.name, item.quantity, item.weight || null, item.rate, item.amount,
            item.hsn_code || null, item.uom || null, Number(item.tax_rate_percent) || 0,
            Number(item.discount_amount) || 0, Number(item.discount_percent) || 0,
            Number(item.taxable_amount) || item.amount,
            Number(item.cgst_amount) || 0, Number(item.sgst_amount) || 0, Number(item.igst_amount) || 0
          );
        }
      } else {
        const stmt = db.prepare(`
          INSERT INTO quotation_items (item_id, quotation_id, tenant_id, product_id, name, quantity, weight, rate, amount, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `);
        for (const item of q.items) {
          stmt.run(item.item_id, q.quotation_id, q.tenant_id, item.product_id || null, item.name, item.quantity, item.weight || null, item.rate, item.amount);
        }
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

ipcMain.handle('db:getQuotationItems', async (event, quotationId: string) => {
  try {
    const db = getDb();
    const qiCols = db.prepare('PRAGMA table_info(quotation_items)').all().map((c: any) => c.name);
    let selectFields = 'qi.*';
    if (qiCols.includes('hsn_code')) {
      selectFields = "qi.*, COALESCE(NULLIF(TRIM(qi.hsn_code), ''), p.hsn_sac_code, '') AS hsn_code, COALESCE(NULLIF(TRIM(qi.uom), ''), p.uom, 'PCS') AS uom, COALESCE(NULLIF(qi.tax_rate_percent, 0), p.tax_rate_percent, qi.tax_rate_percent, 0) AS tax_rate_percent, COALESCE(p.is_gst_applicable, 1) AS is_gst_applicable";
    } else {
      selectFields = "qi.*, COALESCE(p.hsn_sac_code, '') AS hsn_code, COALESCE(p.uom, 'PCS') AS uom, COALESCE(p.tax_rate_percent, 0) AS tax_rate_percent, COALESCE(p.is_gst_applicable, 1) AS is_gst_applicable";
    }
    const query = `
      SELECT ${selectFields}
      FROM quotation_items qi
      LEFT JOIN products p ON qi.product_id = p.product_id
      WHERE qi.quotation_id = ?
      ORDER BY qi.created_at ASC
    `;
    let items = db.prepare(query).all(quotationId);
    if ((!items || items.length === 0) && quotationId) {
      const q = db.prepare('SELECT * FROM quotations WHERE quotation_id = ?').get(quotationId) as any;
      if (q && (Number(q.subtotal) > 0 || Number(q.grand_total) > 0)) {
        console.log(`[db:getQuotationItems] Repairing missing items for quotation ${quotationId}...`);
        db.prepare("UPDATE quotations SET sync_status = 'PENDING' WHERE quotation_id = ?").run(quotationId);
        triggerUrgentQuotationSync().catch(() => {});
        await new Promise(r => setTimeout(r, 300));
        items = db.prepare(query).all(quotationId);
      }
    }
    if (Array.isArray(items) && items.length > 1) {
      const timestamps: number[] = items.map((i: any) => i.created_at ? new Date(i.created_at).getTime() : 0).filter(Boolean);
      const uniqueTs = Array.from(new Set<number>(timestamps));
      if (uniqueTs.length > 1) {
        const latestTs = Math.max(...uniqueTs);
        items = items.filter((i: any) => (i.created_at ? new Date(i.created_at).getTime() : 0) === latestTs);
      }
    }
    return items;
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
      const qCols = db.prepare('PRAGMA table_info(quotations)').all().map((c: any) => c.name);
      if (qCols.includes('customer_gstin')) {
        db.prepare(`
          UPDATE quotations SET 
            customer_name = ?, customer_phone = ?, customer_address = ?,
            customer_gstin = ?, customer_state = ?, is_gst = ?, discount_total = ?, round_off = ?, biller_name = ?,
            terms_conditions = ?, subtotal = ?, tax_total = ?, grand_total = ?,
            sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE quotation_id = ?
        `).run(
          q.customer_name || null, q.customer_phone || null, q.customer_address || null,
          q.customer_gstin || null, q.customer_state || null, q.is_gst ?? (Number(q.tax_total) > 0 ? 1 : 0),
          Number(q.discount_total) || 0, Number(q.round_off) || 0, q.biller_name || null,
          q.terms_conditions || null, q.subtotal, q.tax_total, q.grand_total, q.quotation_id
        );
      } else {
        db.prepare(`
          UPDATE quotations SET 
            customer_name = ?, customer_phone = ?, customer_address = ?, terms_conditions = ?,
            subtotal = ?, tax_total = ?, grand_total = ?,
            sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE quotation_id = ?
        `).run(q.customer_name || null, q.customer_phone || null, q.customer_address || null, q.terms_conditions || null, q.subtotal, q.tax_total, q.grand_total, q.quotation_id);
      }

      // Delete old items
      db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(q.quotation_id);

      // Insert new items
      const qiCols = db.prepare('PRAGMA table_info(quotation_items)').all().map((c: any) => c.name);
      if (qiCols.includes('hsn_code')) {
        const stmt = db.prepare(`
          INSERT INTO quotation_items (
            item_id, quotation_id, tenant_id, product_id, name, quantity, weight, rate, amount,
            hsn_code, uom, tax_rate_percent, discount_amount, discount_percent, taxable_amount,
            cgst_amount, sgst_amount, igst_amount, sync_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `);
        for (const item of q.items) {
          stmt.run(
            item.item_id, q.quotation_id, q.tenant_id, item.product_id || null, item.name, item.quantity, item.weight || null, item.rate, item.amount,
            item.hsn_code || null, item.uom || null, Number(item.tax_rate_percent) || 0,
            Number(item.discount_amount) || 0, Number(item.discount_percent) || 0,
            Number(item.taxable_amount) || item.amount,
            Number(item.cgst_amount) || 0, Number(item.sgst_amount) || 0, Number(item.igst_amount) || 0
          );
        }
      } else {
        const stmt = db.prepare(`
          INSERT INTO quotation_items (item_id, quotation_id, tenant_id, product_id, name, quantity, weight, rate, amount, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `);
        for (const item of q.items) {
          stmt.run(item.item_id, q.quotation_id, q.tenant_id, item.product_id || null, item.name, item.quantity, item.weight || null, item.rate, item.amount);
        }
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

// â”€â”€ Warranties IPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Purchase Bill IPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getNextOrPeekPurchaseBillNumber(
  db: any,
  tenantId: string,
  billType?: string,
  advance: boolean = false
): { success: boolean; billNumber: string; counter: number } {
  const terminalCode = getOrInitTerminalCode(db);
  const defaultPrefix = `${terminalCode}-PUR-`;
  const configKey = 'purchase_bill_counter';
  const effectiveTenant = tenantId || 'global';

  // 1. Fetch configured prefix/counter from tenant or global settings
  const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(effectiveTenant, configKey)
    || db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', configKey);

  let prefix = defaultPrefix;
  let configuredCounter: number | null = null;

  if (row && row.value) {
    try {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (typeof parsed.counter === 'number' && parsed.counter > 0) {
        configuredCounter = parsed.counter;
      }
      if (parsed.prefix && typeof parsed.prefix === 'string' && parsed.prefix.trim().length > 0) {
        const clean = parsed.prefix.trim().replace(/[^A-Z0-9_-]/gi, '').toUpperCase();
        prefix = clean.endsWith('-') ? clean : `${clean}-`;
      }
    } catch {}
  }

  // 2. If no explicit prefix was configured in settings, inspect existing purchase bills for this tenant
  const existingBills: any[] = db.prepare(
    'SELECT bill_number, bill_type FROM purchase_bills WHERE tenant_id = ?'
  ).all(effectiveTenant);

  if ((!row || prefix === defaultPrefix) && existingBills.length > 0) {
    for (const b of existingBills) {
      const match = String(b.bill_number || '').match(/^([A-Z0-9]+-PUR-)/i);
      if (match) {
        prefix = match[1].toUpperCase();
        break;
      }
    }
  }

  const isEstimate = (billType || '').toUpperCase() === 'ESTIMATE';

  // 3. Scan existing bills for the maximum used numeric counter in this series
  let maxUsed = 0;
  for (const b of existingBills) {
    const numStr = String(b.bill_number || '');
    const isEstBill = numStr.endsWith('-EST') || (b.bill_type || '').toUpperCase() === 'ESTIMATE';

    // GST series matches non-EST bills; Estimate series matches EST bills
    if (isEstimate === isEstBill) {
      const match = numStr.match(/(\d+)(?:-EST)?$/i);
      if (match) {
        const parsedNum = parseInt(match[1], 10);
        if (!isNaN(parsedNum) && parsedNum > maxUsed) {
          maxUsed = parsedNum;
        }
      }
    }
  }

  // 4. Determine starting counter:
  // Counter is strictly maxUsed + 1 if bills exist, else fallback to configuredCounter or 1.
  let counter = 1;
  if (maxUsed > 0) {
    counter = maxUsed + 1;
  } else {
    counter = configuredCounter && configuredCounter > 0 ? configuredCounter : 1;
  }

  // 5. Duplicate check against existing bills
  const checkStmt = db.prepare(
    'SELECT 1 FROM purchase_bills WHERE tenant_id = ? AND bill_number = ? LIMIT 1'
  );

  let candidate = isEstimate
    ? `${prefix}${String(counter).padStart(3, '0')}-EST`
    : `${prefix}${String(counter).padStart(3, '0')}`;

  while (checkStmt.get(effectiveTenant, candidate)) {
    counter++;
    candidate = isEstimate
      ? `${prefix}${String(counter).padStart(3, '0')}-EST`
      : `${prefix}${String(counter).padStart(3, '0')}`;
  }

  // 6. If advancing, persist next counter value
  if (advance) {
    const nextConfig = { prefix, counter: counter + 1 };
    db.prepare(`
      INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
      VALUES (?, ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, key) DO UPDATE SET
        value = EXCLUDED.value,
        sync_status = 'LOCAL',
        updated_at = CURRENT_TIMESTAMP
    `).run(effectiveTenant, configKey, JSON.stringify(nextConfig));

    if (effectiveTenant !== 'global') {
      db.prepare(`
        INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
        VALUES ('global', ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, key) DO UPDATE SET
          value = EXCLUDED.value,
          sync_status = 'LOCAL',
          updated_at = CURRENT_TIMESTAMP
      `).run(configKey, JSON.stringify(nextConfig));
    }
  }

  return { success: true, billNumber: candidate, counter };
}

ipcMain.handle('db:peekNextPurchaseBillNumber', (event, payload: { tenant_id: string; bill_type?: string }) => {
  try {
    const db = getDb();
    return getNextOrPeekPurchaseBillNumber(db, payload?.tenant_id, payload?.bill_type, false);
  } catch (error: any) {
    console.error('[db:peekNextPurchaseBillNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getNextPurchaseBillNumber', (event, payload: { tenant_id: string; bill_type?: string }) => {
  try {
    const db = getDb();
    const result = db.transaction(() => {
      return getNextOrPeekPurchaseBillNumber(db, payload?.tenant_id, payload?.bill_type, true);
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
      // Only ESTIMATE bills update inventory stock â€” check stored bill_type before reverting.
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

ipcMain.handle('db:getPurchaseBillProducts', (event, { tenant_id, search, limit, numericPrefixOnly = false }: { tenant_id: string; search?: string; limit?: number; numericPrefixOnly?: boolean }) => {
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
      const cleanSearch = String(search).trim();
      const cleanSearchNoSpace = cleanSearch.replace(/\s+/g, '');
      if (/^\d+$/.test(cleanSearch) && numericPrefixOnly) {
        query += ' AND (p.sku_barcode LIKE ? OR p.item_code LIKE ? OR REPLACE(p.sku_barcode, \' \', \'\') LIKE ? OR REPLACE(p.item_code, \' \', \'\') LIKE ?)';
        params.push(`${cleanSearch}%`, `${cleanSearch}%`, `${cleanSearchNoSpace}%`, `${cleanSearchNoSpace}%`);
      } else {
        const cond = buildProductSearchConditions(cleanSearch, 'p.');
        query += ` AND ${cond.sql}`;
        params.push(...cond.params);
      }
    }

    const resultLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 200)));
    query += ' ORDER BY p.name COLLATE NOCASE ASC LIMIT ?';
    params.push(resultLimit);
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

// â”€â”€ Cash Drawer Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function deduplicateAndGetOpenDrawer(db: any, tenantId: string, dateStr?: string): any {
  if (!db) return null;
  const activeTenantId = tenantId || 'global';
  const storeTz = getStoreTimezoneSetting(db, activeTenantId);
  const cleanDate = dateStr ? parseCleanDate(dateStr, storeTz) : localDate();
  const parts = cleanDate.split('-');
  const altDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : cleanDate;
  const dateLike = `${cleanDate}%`;

  const candidates = db.prepare(`
    SELECT * FROM cash_drawer 
    WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
      AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ? OR substr(business_date, 1, 10) = ?)
    ORDER BY (CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) DESC, (CASE WHEN opening_balance > 0 THEN 1 ELSE 0 END) DESC, current_cash DESC, created_at DESC
  `).all(activeTenantId, cleanDate, altDate, cleanDate, dateLike, cleanDate, altDate) as any[];

  let primary: any = null;
  if (candidates && candidates.length > 0) {
    primary = candidates[0];
  } else {
    const openCandidates = db.prepare(`
      SELECT * FROM cash_drawer 
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
        AND status = 'OPEN' 
      ORDER BY business_date DESC, created_at DESC
    `).all(activeTenantId) as any[];
    if (openCandidates && openCandidates.length > 0) {
      primary = openCandidates[0];
    }
  }

  if (!primary) return null;

  if (candidates && candidates.length > 1) {
    for (let i = 1; i < candidates.length; i++) {
      const dup = candidates[i];
      if (dup.drawer_id !== primary.drawer_id) {
        try {
          db.prepare(`UPDATE cash_transactions SET drawer_id = ? WHERE drawer_id = ?`).run(primary.drawer_id, dup.drawer_id);
          db.prepare(`UPDATE cashier_audit_log SET drawer_id = ? WHERE drawer_id = ?`).run(primary.drawer_id, dup.drawer_id);
          if (dup.status === 'OPEN') {
            db.prepare(`UPDATE cash_drawer SET status = 'CLOSED', closing_remarks = 'Merged duplicate drawer' WHERE drawer_id = ?`).run(dup.drawer_id);
          }
        } catch {}
      }
    }
  }

  return reconcileCashDrawer(db, activeTenantId, primary);
}

function getOpenCashDrawer(db: any, tenantId: string, dateStr?: string): any {
  return deduplicateAndGetOpenDrawer(db, tenantId, dateStr);
}

function getCashAmountFromInvoice(inv: any): number {
  if (!inv) return 0;
  const pm = (inv.payment_method || '').toUpperCase();
  const grand = Math.max(0, Number(inv.grand_total) || 0);
  const retD = Math.max(0, Number(inv.return_deduction) || 0);
  const scrapD = Math.max(0, Number(inv.scrap_deduction) || 0);
  const netPayable = Math.max(0, grand - retD - scrapD);

  if (pm === 'CASH') {
    if (netPayable <= 0) return 0;
    const rec = Number(inv.received_amount);
    if (rec > 0 && rec < netPayable) {
      return rec;
    }
    return netPayable;
  }
  if (pm === 'SPLIT' || pm === 'CREDIT') {
    if (inv.split_details && inv.split_details !== 'null') {
      try {
        let sd = typeof inv.split_details === 'string' ? JSON.parse(inv.split_details) : inv.split_details;
        while (typeof sd === 'string') {
          try { sd = JSON.parse(sd); } catch { break; }
        }
        if (sd && typeof sd === 'object') {
          const cashSplit = Math.max(0, Number(sd.cash) || 0);
          if (cashSplit > 0) return Math.min(cashSplit, netPayable);
        }
      } catch {}
    }
    if (pm === 'CREDIT' && Number(inv.received_amount) > 0) {
      return Math.min(Number(inv.received_amount), netPayable);
    }
  }
  return 0;
}

function reconcileCashDrawer(db: any, tenantId: string, drawer: any): any {
  if (!drawer || !tenantId) return drawer;
  try {
    const storeTz = getStoreTimezoneSetting(db, tenantId);
    const cleanDate = parseCleanDate(drawer.business_date, storeTz);
    const parts = cleanDate.split('-');
    const altDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : cleanDate;
    const dateLike1 = `${cleanDate}%`;
    const dateLike2 = `${altDate}%`;

    // Calculate total cash sales from settled cash invoices & cash portion of split invoices for this business date
    const salesRow = db.prepare(`
      SELECT 
        COALESCE(SUM(
          CASE 
            WHEN UPPER(payment_method) = 'CASH' THEN (
              CASE 
                WHEN COALESCE(grand_total, 0) <= 0 THEN 0
                WHEN received_amount > 0 AND received_amount < COALESCE(grand_total, 0)
                  THEN received_amount 
                ELSE MAX(0, COALESCE(grand_total, 0))
              END
            )
            WHEN UPPER(payment_method) IN ('SPLIT', 'CREDIT') AND split_details IS NOT NULL THEN (
              CASE 
                WHEN json_extract(split_details, '$.cash') IS NOT NULL 
                THEN MIN(
                  CAST(json_extract(split_details, '$.cash') AS REAL),
                  MAX(0, COALESCE(grand_total, 0))
                )
                WHEN UPPER(payment_method) = 'CREDIT' AND received_amount > 0
                THEN MIN(
                  received_amount,
                  MAX(0, COALESCE(grand_total, 0))
                )
                ELSE 0 
              END
            )
            WHEN UPPER(payment_method) = 'CREDIT' AND received_amount > 0 THEN (
              MIN(received_amount, MAX(0, COALESCE(grand_total, 0)))
            )
            ELSE 0 
          END
        ), 0) AS total_cash_sales
      FROM invoices
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND (
          UPPER(payment_method) IN ('CASH', 'SPLIT')
          OR (UPPER(payment_method) = 'CREDIT' AND (received_amount > 0 OR (split_details IS NOT NULL AND CAST(json_extract(split_details, '$.cash') AS REAL) > 0)))
        )
        AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (is_held IS NULL OR is_held = 0)
        AND (is_deleted IS NULL OR is_deleted = 0 OR is_deleted = '0' OR is_deleted = 0.0)
        AND (
          substr(COALESCE(settled_at, created_at), 1, 10) = ?
          OR substr(COALESCE(settled_at, created_at), 1, 10) = ?
          OR date(COALESCE(settled_at, created_at)) = ?
          OR date(COALESCE(settled_at, created_at)) = ?
          OR COALESCE(settled_at, created_at) LIKE ?
          OR COALESCE(settled_at, created_at) LIKE ?
        )
    `).get(tenantId, cleanDate, altDate, cleanDate, altDate, dateLike1, dateLike2) as any;

    const calcSales = Math.round(Number(salesRow?.total_cash_sales || 0) * 100) / 100;

    // Calculate Cash In and Cash Out sums across all drawers / transactions for this business date
    const txSums = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE 0 END), 0) AS total_in,
        COALESCE(SUM(CASE WHEN type = 'CASH_OUT' THEN amount ELSE 0 END), 0) AS total_out
      FROM cash_transactions 
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (
        drawer_id = ? 
        OR drawer_id IN (SELECT drawer_id FROM cash_drawer WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ? OR substr(business_date, 1, 10) = ?))
        OR date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ? OR substr(transaction_date, 1, 10) = ?
      )
    `).get(tenantId, drawer.drawer_id, tenantId, cleanDate, altDate, cleanDate, dateLike1, cleanDate, altDate, cleanDate, dateLike1, cleanDate, altDate) as any;

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
    const today = localDate(new Date(), tenantId);
    const storeTz = getStoreTimezoneSetting(db, tenantId);
    const openDrawers = db.prepare(`
      SELECT * FROM cash_drawer
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND status = 'OPEN'
    `).all(tenantId) as any[];

    if (Array.isArray(openDrawers) && openDrawers.length > 0) {
      for (const d of openDrawers) {
        const cleanDate = parseCleanDate(d.business_date, storeTz);
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

  let businessDate = localDate(new Date(), tenantId);
  if (invoiceCreatedAt) {
    try {
      const d = new Date(invoiceCreatedAt);
      if (!isNaN(d.getTime())) {
        businessDate = localDate(d, tenantId);
      }
    } catch {}
  }

  let drawer = deduplicateAndGetOpenDrawer(db, tenantId, businessDate);

  if (!drawer && tenantId) {
    try {
      let defaultBal = 0;
      let autoOpenSetting = false;
      const autoOpenRow = db.prepare("SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'auto_open_cash_drawer' ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 0 END) DESC LIMIT 1").get(tenantId, tenantId) as any;
      if (autoOpenRow && autoOpenRow.value !== undefined && autoOpenRow.value !== null) {
        try { autoOpenSetting = Boolean(JSON.parse(autoOpenRow.value)); } catch { autoOpenSetting = String(autoOpenRow.value).trim() === 'true'; }
      }
      if (autoOpenSetting) {
        const balRow = db.prepare("SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'default_opening_balance' ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 0 END) DESC LIMIT 1").get(tenantId, tenantId) as any;
        if (balRow && balRow.value !== undefined && balRow.value !== null) {
          try { defaultBal = Number(JSON.parse(balRow.value)) || 0; } catch { defaultBal = Number(balRow.value) || 0; }
        }
        if (isNaN(defaultBal) || defaultBal < 0) defaultBal = 0;
      }

      const drawerId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, opening_balance, cash_sales, cash_in, cash_out, current_cash, expected_closing, status, opened_at, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, 'OPEN', CURRENT_TIMESTAMP, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(drawerId, tenantId, businessDate, defaultBal, defaultBal, defaultBal);
      drawer = db.prepare(`SELECT * FROM cash_drawer WHERE drawer_id = ?`).get(drawerId) as any;
    } catch (e: any) {
      console.error('[Cashier] Auto-create drawer error:', e.message);
    }
  }

  if (drawer) {
    reconcileCashDrawer(db, tenantId, drawer);
  }
}

function adjustPaymentSourcesForInvoice(
  db: any,
  tenantId: string,
  invoice: any,
  isDeleteOrCancel: boolean = false
) {
  if (!db || !tenantId || !invoice) return;
  try {
    const pm = (invoice.payment_method || '').toUpperCase();
    let splitObj: any = null;
    if (invoice.split_details && invoice.split_details !== 'null') {
      if (typeof invoice.split_details === 'string') {
        try { splitObj = JSON.parse(invoice.split_details); } catch {}
      } else if (typeof invoice.split_details === 'object') {
        splitObj = invoice.split_details;
      }
    }

    const processSourceTransaction = (sourceId: string | undefined, sourceType: string, amount: number) => {
      if (amount <= 0) return;
      let source: any = null;
      if (sourceId) {
        source = db.prepare(`SELECT * FROM payment_sources WHERE source_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND is_deleted = 0`).get(sourceId, tenantId) as any;
      }
      if (!source) {
        source = db.prepare(`SELECT * FROM payment_sources WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND type = ? AND is_deleted = 0 AND is_enabled = 1 ORDER BY is_default DESC, sort_order ASC LIMIT 1`).get(tenantId, sourceType) as any;
      }
      if (source) {
        const delta = isDeleteOrCancel ? -amount : amount;
        const newBalance = Number(source.current_balance) + delta;
        const txnType = isDeleteOrCancel ? 'CASH_OUT' : 'CASH_IN';
        const category = isDeleteOrCancel ? 'Invoice Cancellation' : 'Invoice Sale';
        
        db.prepare(`
          INSERT INTO payment_source_transactions (transaction_id, tenant_id, source_id, type, amount, category, reference_number, notes, transaction_date, running_balance, entered_by, entered_by_name, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, 'PENDING')
        `).run(
          crypto.randomUUID(), tenantId, source.source_id, txnType, amount,
          category, invoice.invoice_number || null, `Invoice ${invoice.invoice_number || ''} ${isDeleteOrCancel ? 'cancelled' : 'payment'} via ${sourceType}`,
          newBalance, invoice.user_id || 'system', invoice.user_name || null
        );

        db.prepare(`UPDATE payment_sources SET current_balance = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE source_id = ?`)
          .run(newBalance, source.source_id);
      }
    };

    if (pm === 'UPI') {
      const upiAmt = Math.max(0, Number(invoice.received_amount || invoice.grand_total) || 0);
      processSourceTransaction(invoice.payment_source_id || splitObj?.upi_source_id, 'UPI', upiAmt);
    } else if (pm === 'CARD') {
      const cardAmt = Math.max(0, Number(invoice.received_amount || invoice.grand_total) || 0);
      processSourceTransaction(invoice.payment_source_id || splitObj?.card_source_id, 'CARD', cardAmt);
    } else if (pm === 'BANK_TRANSFER' || pm === 'BANK') {
      const bankAmt = Math.max(0, Number(invoice.received_amount || invoice.grand_total) || 0);
      processSourceTransaction(invoice.payment_source_id || splitObj?.bank_source_id, 'BANK_TRANSFER', bankAmt);
    } else if (pm === 'SPLIT' && splitObj) {
      if (Number(splitObj.upi) > 0) {
        processSourceTransaction(splitObj.upi_source_id || invoice.payment_source_id, 'UPI', Number(splitObj.upi));
      }
      if (Number(splitObj.card) > 0) {
        processSourceTransaction(splitObj.card_source_id || invoice.payment_source_id, 'CARD', Number(splitObj.card));
      }
      if (Number(splitObj.bank_transfer) > 0) {
        processSourceTransaction(splitObj.bank_source_id || invoice.payment_source_id, 'BANK_TRANSFER', Number(splitObj.bank_transfer));
      }
    }
  } catch (err: any) {
    console.error('[PaymentSources] adjustPaymentSourcesForInvoice error:', err.message);
  }
}

// â”€â”€ Cashier & Settlement IPC Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ipcMain.handle('db:cashier:getDrawer', (event, { tenant_id, business_date }: { tenant_id: string; business_date?: string }) => {
  try {
    const db = getDb();
    autoClosePastOpenDrawers(db, tenant_id);
    let drawer = deduplicateAndGetOpenDrawer(db, tenant_id, business_date);

    if (!drawer || drawer.status !== 'OPEN') {
      const activeTenantId = tenant_id || 'global';
      let autoOpenSetting = false;
      const autoOpenRow = db.prepare("SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'auto_open_cash_drawer' ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 0 END) DESC LIMIT 1").get(activeTenantId, activeTenantId) as any;
      if (autoOpenRow && autoOpenRow.value !== undefined && autoOpenRow.value !== null) {
        try { autoOpenSetting = Boolean(JSON.parse(autoOpenRow.value)); } catch { autoOpenSetting = String(autoOpenRow.value).trim() === 'true'; }
      }

      if (autoOpenSetting) {
        let defaultBal = 0;
        const balRow = db.prepare("SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'default_opening_balance' ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 0 END) DESC LIMIT 1").get(activeTenantId, activeTenantId) as any;
        if (balRow && balRow.value !== undefined && balRow.value !== null) {
          try { defaultBal = Number(JSON.parse(balRow.value)) || 0; } catch { defaultBal = Number(balRow.value) || 0; }
        }
        if (isNaN(defaultBal) || defaultBal < 0) defaultBal = 0;

        const storeTz = getStoreTimezoneSetting(db, activeTenantId);
        const cleanDate = business_date ? parseCleanDate(business_date, storeTz) : localDate();

        const existing = db.prepare(`
          SELECT * FROM cash_drawer 
          WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
            AND (business_date = ? OR date(business_date) = ?)
          ORDER BY created_at DESC LIMIT 1
        `).get(activeTenantId, cleanDate, cleanDate) as any;

        if (!existing) {
          const drawer_id = crypto.randomUUID();
          db.prepare(`
            INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, opening_balance, current_cash, expected_closing, status, opened_by, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, 'OPEN', 'system_auto', 'PENDING')
          `).run(drawer_id, activeTenantId, cleanDate, defaultBal, defaultBal, defaultBal);
          drawer = deduplicateAndGetOpenDrawer(db, tenant_id, business_date);
        }
      }
    }

    return drawer;
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

    const existing = db.prepare(`
      SELECT * FROM cash_drawer 
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
        AND (business_date = ? OR date(business_date) = ?)
      ORDER BY (CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) DESC, created_at DESC LIMIT 1
    `).get(tenant_id, date, date) as any;
    
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
    const targetDrawer = db.prepare(`
      SELECT * FROM cash_drawer 
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
        AND (business_date = ? OR date(business_date) = ?)
      ORDER BY (CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) DESC, created_at DESC LIMIT 1
    `).get(tenant_id, date, date) as any;
    if (targetDrawer) {
      db.prepare(`
        UPDATE cash_transactions 
        SET drawer_id = ? 
        WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
          AND (substr(transaction_date, 1, 10) = ? OR date(transaction_date) = ?)
      `).run(targetDrawer.drawer_id, tenant_id, date, date);
      reconcileCashDrawer(db, tenant_id, targetDrawer);
    }

    db.prepare(`
      INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(crypto.randomUUID(), tenant_id, dId || (targetDrawer ? targetDrawer.drawer_id : ''), 'OPENING_BALANCE_SET', JSON.stringify({ opening_balance, business_date: date }), user_id, user_name || null);
    
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

ipcMain.handle('db:cashier:settlePayment', safeHandler((event, { tenant_id, invoice_id, received_amount, discount_amount, payment_method, payment_source_id, split_details, user_id, user_name }: {
  tenant_id: string; invoice_id: string; received_amount: number; discount_amount?: number; payment_method: string; payment_source_id?: string; split_details?: any; user_id: string; user_name?: string
}) => {
  const db = getDb();
  const validMethods = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'SPLIT'];
  if (!validMethods.includes(payment_method)) {
    return { success: false, error: 'Invalid payment method' };
  }
  
  try {
    const tx = db.transaction(() => {
      const invoice = (db.prepare(`SELECT * FROM invoices WHERE invoice_id = ?`).get(invoice_id) || db.prepare(`SELECT * FROM invoices WHERE invoice_id = ? AND tenant_id = ?`).get(invoice_id, tenant_id)) as any;
      if (!invoice) throw new Error('Invoice not found');
      
      const targetTenantId = invoice.tenant_id || tenant_id || 'global';
      const received = Number(received_amount) || 0;
      const settlement = calculateCashierSettlement(invoice, received, discount_amount);
      const {
        discountTotal: newDiscountTotal,
        discountValue,
        discountType,
        grandTotal: newGrandTotal,
        receivedAmount: storedReceivedAmount,
        actualRefundPaid,
        expectedRefundAmount: calculatedRefund,
        settlementDiscount,
      } = settlement;

      const splitStr = split_details && typeof split_details === 'object'
        ? JSON.stringify(split_details)
        : (split_details && split_details !== 'null' ? split_details : null);

      db.prepare(`
        UPDATE invoices SET 
          payment_method = ?, 
          split_details = ?, 
          received_amount = ?, 
          actual_refund_paid = ?,
          discount_total = ?, 
          discount_value = ?, 
          discount_type = ?, 
          grand_total = ?, 
          settled_at = CURRENT_TIMESTAMP,
          sync_status = 'PENDING', 
          updated_at = CURRENT_TIMESTAMP
        WHERE invoice_id = ?
      `).run(payment_method, splitStr, storedReceivedAmount, actualRefundPaid, newDiscountTotal, discountValue, discountType, newGrandTotal, invoice_id);
      
      const date = localDate();
      const drawer = getOpenCashDrawer(db, targetTenantId, date);

      let parsedSplitObj: any = null;
      if (split_details && split_details !== 'null') {
        try {
          parsedSplitObj = typeof split_details === 'string' ? JSON.parse(split_details) : split_details;
        } catch {}
      }
      const splitCashAmt = Number(parsedSplitObj?.cash) || 0;

      if (payment_method === 'CASH' || (payment_method === 'SPLIT' && splitCashAmt > 0)) {
        if (drawer) {
          if (actualRefundPaid > 0) {
            const transaction_id = crypto.randomUUID();
            db.prepare(`
              INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, entered_by_name, sync_status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
            `).run(transaction_id, tenant_id, drawer.drawer_id, 'CASH_OUT', actualRefundPaid, 'CREDIT_REFUND', `Refund leftover credits for settled invoice ${invoice.invoice_number}`, user_id, user_name || null);
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
        JSON.stringify({ invoice_id, invoice_number: invoice.invoice_number, received_amount: storedReceivedAmount, requested_net_amount: received, refund_amount: actualRefundPaid, expected_refund_amount: calculatedRefund, settlement_discount: settlementDiscount, discount: newDiscountTotal, payment_method, split_details: split_details || null, grand_total: newGrandTotal }),
        user_id, user_name || null
      );

      // Sync party credit ledger for credit payments
      syncInvoiceCreditLedger(db, {
        invoice_id: invoice.invoice_id,
        tenant_id: targetTenantId,
        invoice_number: invoice.invoice_number,
        invoice_type: invoice.invoice_type,
        grand_total: newGrandTotal,
        payment_method: payment_method,
        received_amount: storedReceivedAmount,
        balance_amount: 0, // Fully settled
        customer_id: invoice.customer_id,
        customer_name: invoice.customer_name,
        customer_phone: invoice.customer_phone,
        customer_address: invoice.customer_address,
        customer_gstin: invoice.customer_gstin,
        split_details: splitStr,
        user_id: user_id,
        user_name: user_name,
        created_at: invoice.created_at,
      });
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
      if (drawer.status !== 'OPEN') throw new Error('Cash register is closed for today. Entries are locked.');
      
      const transaction_id = crypto.randomUUID();
      const txDateIso = new Date().toISOString();
      db.prepare(`
        INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, entered_by_name, transaction_date, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(transaction_id, tenant_id, drawer.drawer_id, type, amount, category || null, notes || null, user_id, user_name || null, txDateIso);
      
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
    return { success: false, error: error?.message || 'Operation failed' };
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
      const date = business_date ? (typeof business_date === 'string' ? parseCleanDate(business_date) : localDate(new Date(business_date))) : localDate();
      const parts = date.split('-');
      const altDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : date;
      let drawer = db.prepare(`
        SELECT * FROM cash_drawer 
        WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
          AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ? OR substr(business_date, 1, 10) = ?)
        ORDER BY created_at DESC LIMIT 1
      `).get(tenant_id, date, altDate, date, `${date}%`, date, altDate) as any;
      if (!drawer) {
        drawer = db.prepare(`
          SELECT * FROM cash_drawer 
          WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
            AND status = 'OPEN' 
          ORDER BY business_date DESC, created_at DESC LIMIT 1
        `).get(tenant_id) as any;
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

ipcMain.handle('db:cashier:reopenDrawer', safeHandler((event, { tenant_id, drawer_id, user_id, user_name }: { tenant_id: string; drawer_id: string; user_id: string; user_name?: string }) => {
  const db = getDb();
  try {
    const tx = db.transaction(() => {
      const drawer = db.prepare(`SELECT * FROM cash_drawer WHERE drawer_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).get(drawer_id, tenant_id) as any;
      if (!drawer) throw new Error('Cash drawer not found');

      db.prepare(`
        UPDATE cash_drawer SET 
          status = 'OPEN',
          actual_cash = NULL,
          cash_short = 0,
          cash_excess = 0,
          closing_remarks = NULL,
          closed_by = NULL,
          closed_at = NULL,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
        WHERE drawer_id = ?
      `).run(drawer_id);

      reconcileCashDrawer(db, tenant_id, drawer);

      db.prepare(`
        INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
        VALUES (?, ?, ?, 'DAY_REOPENED', ?, ?, ?, 'PENDING')
      `).run(
        crypto.randomUUID(), tenant_id, drawer_id,
        JSON.stringify({ business_date: drawer.business_date, reopened_at: localTimestamp() }),
        user_id, user_name || null
      );
    });

    tx();
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('sync:data-updated');
    import('./sync/syncWorker.js').then(({ triggerUrgentCashSync }) => {
      triggerUrgentCashSync().catch(e => console.error('[Main] Urgent cash sync error on reopen:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    return { success: true };
  } catch (error: any) {
    console.error('[db:cashier:reopenDrawer]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:cashier:deleteTransaction', safeHandler((event, { tenant_id, transaction_id, user_id, user_name }: { tenant_id: string; transaction_id: string; user_id: string; user_name?: string }) => {
  const db = getDb();
  try {
    let targetDrawerId: string | null = null;
    const tx = db.transaction(() => {
      const transaction = db.prepare(`SELECT * FROM cash_transactions WHERE transaction_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).get(transaction_id, tenant_id) as any;
      if (!transaction) throw new Error('Transaction not found');

      targetDrawerId = transaction.drawer_id;

      db.prepare(`DELETE FROM cash_transactions WHERE transaction_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).run(transaction_id, tenant_id);

      if (targetDrawerId) {
        const drawer = db.prepare(`SELECT * FROM cash_drawer WHERE drawer_id = ?`).get(targetDrawerId) as any;
        if (drawer) {
          reconcileCashDrawer(db, tenant_id, drawer);
        }
      }

      db.prepare(`
        INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
        VALUES (?, ?, ?, 'TRANSACTION_DELETED', ?, ?, ?, 'PENDING')
      `).run(
        crypto.randomUUID(), tenant_id, targetDrawerId || null,
        JSON.stringify({ transaction_id, type: transaction.type, amount: transaction.amount, category: transaction.category }),
        user_id, user_name || null
      );
    });

    tx();
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('sync:data-updated');
    import('./sync/syncWorker.js').then(({ triggerUrgentCashSync }) => {
      triggerUrgentCashSync().catch(e => console.error('[Main] Urgent cash sync error on delete transaction:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    return { success: true };
  } catch (error: any) {
    console.error('[db:cashier:deleteTransaction]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:cashier:getTransactions', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const date = localDate();
    const dateLike = `${date}%`;
    let drawers = db.prepare(`SELECT drawer_id FROM cash_drawer WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ?)`).all(tenant_id, date, date, dateLike, date) as any[];
    if (!drawers || drawers.length === 0) {
      drawers = db.prepare(`SELECT drawer_id FROM cash_drawer WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND status = 'OPEN' ORDER BY business_date DESC LIMIT 1`).all(tenant_id) as any[];
    }
    const drawerIds = (drawers || []).map(d => d.drawer_id).filter(Boolean);
    if (drawerIds.length === 0) {
      return db.prepare(`SELECT * FROM cash_transactions WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ?) ORDER BY transaction_date DESC`).all(tenant_id, date, dateLike, date);
    }
    const placeholders = drawerIds.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM cash_transactions WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (drawer_id IN (${placeholders}) OR date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ?) ORDER BY transaction_date DESC`).all(tenant_id, ...drawerIds, date, dateLike, date);
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
        (SELECT COUNT(*) FROM invoices i WHERE (i.tenant_id = cd.tenant_id OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) AND i.payment_method NOT IN ('PENDING', 'HOLD_DRAFT') AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')) AND (i.is_held IS NULL OR i.is_held = 0) AND (date(COALESCE(i.settled_at, i.created_at)) = date(cd.business_date) OR COALESCE(i.settled_at, i.created_at) LIKE SUBSTR(cd.business_date, 1, 10) || '%' OR substr(COALESCE(i.settled_at, i.created_at), 1, 10) = SUBSTR(cd.business_date, 1, 10)) AND (i.is_deleted IS NULL OR i.is_deleted = 0)) as settled_count,
        (SELECT COALESCE(SUM(i.received_amount), 0) FROM invoices i WHERE (i.tenant_id = cd.tenant_id OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) AND i.payment_method NOT IN ('PENDING', 'HOLD_DRAFT') AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')) AND (i.is_held IS NULL OR i.is_held = 0) AND (date(COALESCE(i.settled_at, i.created_at)) = date(cd.business_date) OR COALESCE(i.settled_at, i.created_at) LIKE SUBSTR(cd.business_date, 1, 10) || '%' OR substr(COALESCE(i.settled_at, i.created_at), 1, 10) = SUBSTR(cd.business_date, 1, 10)) AND (i.is_deleted IS NULL OR i.is_deleted = 0)) as total_collected
      FROM cash_drawer cd
      LEFT JOIN users u1 ON cd.opened_by = u1.user_id
      LEFT JOIN users u2 ON cd.closed_by = u2.user_id
      WHERE (cd.tenant_id = ? OR cd.tenant_id = 'global' OR cd.tenant_id = 'unset' OR cd.tenant_id IS NULL)
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
      WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) 
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

ipcMain.handle('db:cashier:getDayTransactions', (event, { tenant_id, business_date, from_date, to_date }: { tenant_id: string; business_date?: string; from_date?: string; to_date?: string }) => {
  try {
    const db = getDb();
    if (from_date && to_date) {
      const cleanFrom = from_date.split('T')[0].split(' ')[0];
      const cleanTo = to_date.split('T')[0].split(' ')[0];
      return db.prepare(`SELECT * FROM cash_transactions WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND substr(transaction_date, 1, 10) >= ? AND substr(transaction_date, 1, 10) <= ? ORDER BY transaction_date DESC`).all(tenant_id, cleanFrom, cleanTo);
    }
    const cleanDate = business_date ? business_date.split('T')[0].split(' ')[0] : '';
    const dateLike = `${cleanDate}%`;
    const drawers = db.prepare(`SELECT drawer_id FROM cash_drawer WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ?)`).all(tenant_id, cleanDate, cleanDate, dateLike, cleanDate) as any[];
    const drawerIds = (drawers || []).map(d => d.drawer_id).filter(Boolean);
    if (drawerIds.length === 0) {
      return db.prepare(`SELECT * FROM cash_transactions WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ?) ORDER BY transaction_date DESC`).all(tenant_id, cleanDate, dateLike, cleanDate);
    }
    const placeholders = drawerIds.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM cash_transactions WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (drawer_id IN (${placeholders}) OR date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ?) ORDER BY transaction_date DESC`).all(tenant_id, ...drawerIds, cleanDate, dateLike, cleanDate);
  } catch (error: any) {
    console.error('[db:cashier:getDayTransactions]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:getAuditLog', (event, { tenant_id, limit = 50, offset = 0 }: { tenant_id: string; limit?: number; offset?: number }) => {
  try {
    const db = getDb();
    return db.prepare(`SELECT * FROM cashier_audit_log WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) ORDER BY performed_at DESC LIMIT ? OFFSET ?`).all(tenant_id, limit, offset);
  } catch (error: any) {
    console.error('[db:cashier:getAuditLog]', error);
    return { error: 'Operation failed' };
  }
});

// â”€â”€ Cash Categories IPC Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Customer / Loyalty Points IPC Handlers â”€â”€

ipcMain.handle('db:getCustomers', (event, { tenant_id, active, credit, pricing_tier_id, search, overdue }: { tenant_id: string; active?: boolean; credit?: boolean; pricing_tier_id?: string; search?: string; overdue?: boolean }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];

    // Single LEFT JOIN to best-matching party (CUSTOMER-type preferred, highest absolute balance)
    // resolves all 6 party fields in one pass instead of 6 correlated subqueries
    let query = `
      SELECT c.*,
             COALESCE(c.credit_limit,          p.credit_limit,          0)            AS credit_limit,
             COALESCE(c.credit_period_enabled, p.credit_period_enabled, 0)            AS credit_period_enabled,
             COALESCE(c.credit_period_days,    p.credit_period_days,    30)           AS credit_period_days,
             COALESCE(c.credit_period_basis,   p.credit_period_basis,   'BILL_BASED') AS credit_period_basis,
             COALESCE(c.restrict_on_credit_expiry, p.restrict_on_credit_expiry, 1)   AS restrict_on_credit_expiry,
             COALESCE(
               (SELECT ROUND(SUM(pl.credit_amount) - SUM(pl.debit_amount), 2)
                FROM party_ledger pl
                WHERE pl.party_id = p.party_id
                  AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
               p.balance,
               0
             )                                                                        AS party_balance,
             p.gstin                                                                  AS gstin,
             p.notes                                                                  AS notes,
             COALESCE(c.pricing_tier_id, p.pricing_tier_id)                          AS resolved_pricing_tier_id,
             pt.name                                                                  AS pricing_tier_name
      FROM customers c
      LEFT JOIN parties p ON p.tenant_id = c.tenant_id
        AND (p.is_deleted IS NULL OR p.is_deleted = 0)
        AND p.party_id = (
          SELECT p2.party_id FROM parties p2
          WHERE p2.tenant_id = c.tenant_id
            AND (p2.is_deleted IS NULL OR p2.is_deleted = 0)
            AND (
              (c.phone IS NOT NULL AND TRIM(c.phone) <> '' AND p2.phone IS NOT NULL AND TRIM(p2.phone) <> '' AND p2.phone = c.phone)
              OR (LOWER(TRIM(p2.name)) = LOWER(TRIM(c.name)))
            )
          ORDER BY CASE WHEN p2.party_type = 'CUSTOMER' THEN 0 ELSE 1 END,
                   ABS(COALESCE(p2.balance, 0)) DESC
          LIMIT 1
        )
      LEFT JOIN pricing_tiers pt ON pt.pricing_tier_id = COALESCE(c.pricing_tier_id, p.pricing_tier_id)
      WHERE c.tenant_id = ? AND (c.is_deleted IS NULL OR c.is_deleted = 0)
    `;
    const params: any[] = [tenant_id];

    if (search) {
      query += ` AND (c.name LIKE ? OR c.phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (active) {
      query += ` AND c.last_purchase_date IS NOT NULL AND c.last_purchase_date >= datetime('now', '-90 days')`;
    }

    if (credit === true) {
      query += ` AND p.balance > 0`;
    } else if (credit === false) {
      query += ` AND (p.balance <= 0 OR p.balance IS NULL)`;
    }

    if (pricing_tier_id) {
      query += ` AND COALESCE(c.pricing_tier_id, p.pricing_tier_id) = ?`;
      params.push(pricing_tier_id);
    }

    query += ` ORDER BY c.name COLLATE NOCASE ASC`;

    const rows = db.prepare(query).all(...params) as any[];

    for (const row of rows) {
      const bal = Number(row.party_balance || 0);
      const periodEnabled = Boolean(row.credit_period_enabled);
      if (bal > 0 && periodEnabled) {
        const overdueStatus = checkCustomerOverdueSync(db, tenant_id, row.customer_id, row.phone, row.name);
        row.has_overdue = overdueStatus.isOverdue;
        row.overdue_bills_count = overdueStatus.overdueCount;
        row.overdue_amount = overdueStatus.overdueAmount;
        row.oldest_overdue_days = overdueStatus.oldestOverdueDays;
      } else {
        row.has_overdue = false;
        row.overdue_bills_count = 0;
        row.overdue_amount = 0;
        row.oldest_overdue_days = 0;
      }
    }

    if (overdue === true || String(overdue) === 'true') {
      return rows.filter((r: any) => r.has_overdue);
    }

    return rows;
  } catch (error: any) {
    console.error('[db:getCustomers]', error);
    return [];
  }
});

ipcMain.handle('db:checkCustomerCreditStatus', (event, { tenant_id, customer_id, customer_name, customer_phone }: { tenant_id: string; customer_id?: string; customer_name?: string; customer_phone?: string }) => {
  try {
    const db = getDb();
    const status = checkCustomerOverdueSync(db, tenant_id, customer_id, customer_phone, customer_name);
    return {
      allowed: !(status.creditPeriodEnabled && status.restrictOnExpiry && status.isOverdue),
      ...status
    };
  } catch (error: any) {
    console.error('[db:checkCustomerCreditStatus]', error);
    return { allowed: true, isOverdue: false, error: error.message };
  }
});

ipcMain.handle('db:createCustomer', (event, c: any) => {
  try {
    const db = getDb();
    if (!c.name || !c.tenant_id) return { success: false, error: 'Customer name and Tenant ID are required' };
    
    // Deduplication cache: block duplicate create requests within 2-second window
    const cacheKey = `createCust:${c.tenant_id}:${c.name.trim().toLowerCase()}:${(c.phone || '').trim()}`;
    const now = Date.now();
    const cached = customerCreateCache.get(cacheKey);
    if (cached && (now - cached < 2000)) {
      console.warn(`[db:createCustomer] Duplicate create request blocked within 2s window. Returning existing.`);
      return { success: false, error: 'Duplicate request blocked. Please wait.' };
    }

    const nameClean = (c.name || '').trim().toLowerCase();
    const existingSameName = db.prepare('SELECT customer_id FROM customers WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(c.tenant_id, nameClean);
    if (existingSameName) {
      return { success: false, error: `A customer named "${c.name.trim()}" already exists!` };
    }

    const customerId = c.customer_id || crypto.randomUUID();
    const creditLimit = Math.max(0, Number(c.credit_limit) || 0);
    const creditPeriodEnabled = c.credit_period_enabled ? 1 : 0;
    const creditPeriodDays = Math.max(1, parseInt(c.credit_period_days, 10) || 30);
    const creditPeriodBasis = c.credit_period_basis || 'BILL_BASED';
    const restrictOnCreditExpiry = c.restrict_on_credit_expiry !== undefined ? (c.restrict_on_credit_expiry ? 1 : 0) : 1;

    const cleanGstin = (c.gstin || '').trim().toUpperCase() || null;
    const cleanNotes = (c.notes || '').trim() || null;

    db.prepare(`
      INSERT INTO customers (
        customer_id, tenant_id, name, phone, address, gstin, notes, pricing_tier_id,
        credit_limit, credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry,
        sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      customerId, c.tenant_id, c.name, c.phone || null, c.address || null, cleanGstin, cleanNotes, c.pricing_tier_id || null,
      creditLimit, creditPeriodEnabled, creditPeriodDays, creditPeriodBasis, restrictOnCreditExpiry
    );

    // Also sync to parties table as CUSTOMER party
    let matchedParty: any = null;
    const cleanPhone = (c.phone || '').trim();
    const cleanName = (c.name || '').trim();
    if (cleanPhone) {
      matchedParty = db.prepare('SELECT party_id FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(c.tenant_id, cleanPhone);
    }
    if (!matchedParty && cleanName) {
      matchedParty = db.prepare('SELECT party_id FROM parties WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(c.tenant_id, cleanName.toLowerCase());
    }

    if (matchedParty) {
      db.prepare(`
        UPDATE parties 
        SET name = ?, phone = COALESCE(?, phone), address = COALESCE(?, address),
            gstin = COALESCE(?, gstin), notes = COALESCE(?, notes),
            credit_limit = ?, credit_period_enabled = ?, credit_period_days = ?, credit_period_basis = ?, restrict_on_credit_expiry = ?,
            pricing_tier_id = COALESCE(?, pricing_tier_id),
            sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE party_id = ?
      `).run(
        c.name, c.phone || null, c.address || null,
        cleanGstin, cleanNotes,
        creditLimit, creditPeriodEnabled, creditPeriodDays, creditPeriodBasis, restrictOnCreditExpiry,
        c.pricing_tier_id || null, matchedParty.party_id
      );
    } else {
      const partyId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO parties (
          party_id, tenant_id, name, phone, address, gstin, notes, balance, gst_balance, estimate_balance,
          balance_type, party_type, pricing_tier_id, credit_limit,
          credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry,
          is_deleted, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'RECEIVABLE', 'CUSTOMER', ?, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        partyId, c.tenant_id, c.name, c.phone || null, c.address || null, cleanGstin, cleanNotes,
        c.pricing_tier_id || null, creditLimit, creditPeriodEnabled, creditPeriodDays, creditPeriodBasis, restrictOnCreditExpiry
      );
    }

    // Record successful creation in cache
    customerCreateCache.set(cacheKey, now);
    // Cleanup old cache entries
    if (customerCreateCache.size > 100) {
      for (const [k, v] of customerCreateCache.entries()) {
        if (now - v > 30000) customerCreateCache.delete(k);
      }
    }

    return { success: true, customer_id: customerId };
  } catch (error: any) {
    console.error('[db:createCustomer]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:deduplicateCustomers', (event, tenant_id?: string) => {
  try {
    const db = getDb();
    const result = autoDeduplicateCustomersAndParties(db);
    return { success: true, ...result };
  } catch (error: any) {
    console.error('[db:deduplicateCustomers]', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:findCustomers', (event, { tenant_id, name, phone }: { tenant_id: string; name?: string; phone?: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    let query = `SELECT * FROM customers WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)`;
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

ipcMain.handle('db:deleteCustomer', (event, { customer_id, tenant_id }: { customer_id: string; tenant_id: string }) => {
  try {
    const db = getDb();
    if (!customer_id || !tenant_id) return { success: false, error: 'Customer ID and Tenant ID are required' };

    return db.transaction(() => {
      // 1. Fetch customer details
      const customer = db.prepare(`SELECT * FROM customers WHERE customer_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)`).get(customer_id, tenant_id) as any;
      if (!customer) return { success: false, error: 'Customer not found' };

      // 2. Mark customer as deleted
      db.prepare(`UPDATE customers SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ? AND tenant_id = ?`).run(customer_id, tenant_id);

      // 3. Find matching party by phone or name
      let matchedParties: any[] = [];
      const cleanPhone = (customer.phone || '').trim();
      const cleanName = (customer.name || '').trim();

      if (cleanPhone) {
        matchedParties = db.prepare(`SELECT party_id, name FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)`).all(tenant_id, cleanPhone);
      }
      if (matchedParties.length === 0 && cleanName) {
        matchedParties = db.prepare(`SELECT party_id, name FROM parties WHERE tenant_id = ? AND name = ? COLLATE NOCASE AND (is_deleted IS NULL OR is_deleted = 0)`).all(tenant_id, cleanName);
      }

      // 4. Soft-delete matched parties and their party_ledger entries
      for (const party of matchedParties) {
        db.prepare(`UPDATE parties SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ? AND tenant_id = ?`).run(party.party_id, tenant_id);
        db.prepare(`UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ? AND tenant_id = ?`).run(party.party_id, tenant_id);
      }

      return { success: true, deleted_party_count: matchedParties.length };
    })();
  } catch (error: any) {
    console.error('[db:deleteCustomer]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateCustomer', (event, c: any) => {
  try {
    const db = getDb();
    if (!c.customer_id || !c.tenant_id) return { success: false, error: 'Customer ID and Tenant ID are required' };

    const hasCreditLimit = c.credit_limit !== undefined;
    const hasCreditPeriodEnabled = c.credit_period_enabled !== undefined;
    const hasCreditPeriodDays = c.credit_period_days !== undefined;
    const hasCreditPeriodBasis = c.credit_period_basis !== undefined;
    const hasRestrictOnCreditExpiry = c.restrict_on_credit_expiry !== undefined;

    const creditLimit = hasCreditLimit ? Math.max(0, Number(c.credit_limit) || 0) : 0;
    const creditPeriodEnabled = hasCreditPeriodEnabled ? (c.credit_period_enabled ? 1 : 0) : 0;
    const creditPeriodDays = hasCreditPeriodDays ? Math.max(1, parseInt(c.credit_period_days, 10) || 30) : 30;
    const creditPeriodBasis = c.credit_period_basis || 'BILL_BASED';
    const restrictOnCreditExpiry = hasRestrictOnCreditExpiry ? (c.restrict_on_credit_expiry ? 1 : 0) : 1;

    let updateSql = `
      UPDATE customers
      SET name = ?, phone = ?, address = ?,
          pricing_tier_id = ?
    `;
    const params: any[] = [c.name, c.phone || null, c.address || null, c.pricing_tier_id || null];

    if (c.gstin !== undefined) {
      updateSql += `, gstin = ?`;
      params.push(c.gstin ? c.gstin.trim().toUpperCase() : null);
    }
    if (c.notes !== undefined) {
      updateSql += `, notes = ?`;
      params.push(c.notes ? c.notes.trim() : null);
    }
    if (hasCreditLimit) {
      updateSql += `, credit_limit = ?`;
      params.push(creditLimit);
    }
    if (hasCreditPeriodEnabled) {
      updateSql += `, credit_period_enabled = ?`;
      params.push(creditPeriodEnabled);
    }
    if (hasCreditPeriodDays) {
      updateSql += `, credit_period_days = ?`;
      params.push(creditPeriodDays);
    }
    if (hasCreditPeriodBasis) {
      updateSql += `, credit_period_basis = ?`;
      params.push(creditPeriodBasis);
    }
    if (hasRestrictOnCreditExpiry) {
      updateSql += `, restrict_on_credit_expiry = ?`;
      params.push(restrictOnCreditExpiry);
    }

    // Fetch existing customer details before update to ensure robust matching even if name or phone changed
    const oldCustomerRow: any = db.prepare('SELECT tenant_id, phone, name FROM customers WHERE customer_id = ? AND tenant_id = ?').get(c.customer_id, c.tenant_id);
    const oldPhone = (oldCustomerRow?.phone || '').trim();
    const oldName = (oldCustomerRow?.name || '').trim();
    const newPhone = (c.phone || '').trim();
    const newName = (c.name || '').trim();

    updateSql += `, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ? AND tenant_id = ?`;
    params.push(c.customer_id, c.tenant_id);

    db.prepare(updateSql).run(...params);

    // Sync to matching party in parties
    let matchedParty: any = null;
    if (newPhone) {
      matchedParty = db.prepare('SELECT party_id FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(c.tenant_id, newPhone);
    }
    if (!matchedParty && oldPhone) {
      matchedParty = db.prepare('SELECT party_id FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(c.tenant_id, oldPhone);
    }
    if (!matchedParty && newName) {
      matchedParty = db.prepare('SELECT party_id FROM parties WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(c.tenant_id, newName.toLowerCase());
    }
    if (!matchedParty && oldName) {
      matchedParty = db.prepare('SELECT party_id FROM parties WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(c.tenant_id, oldName.toLowerCase());
    }

    if (matchedParty) {
      db.prepare(`
        UPDATE parties 
        SET name = ?, phone = COALESCE(?, phone), address = COALESCE(?, address),
            gstin = COALESCE(?, gstin), notes = COALESCE(?, notes),
            credit_limit = COALESCE(?, credit_limit),
            credit_period_enabled = COALESCE(?, credit_period_enabled),
            credit_period_days = COALESCE(?, credit_period_days),
            credit_period_basis = COALESCE(?, credit_period_basis),
            restrict_on_credit_expiry = COALESCE(?, restrict_on_credit_expiry),
            pricing_tier_id = COALESCE(?, pricing_tier_id),
            sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE party_id = ?
      `).run(
        c.name,
        c.phone || null,
        c.address || null,
        c.gstin !== undefined ? (c.gstin ? c.gstin.trim().toUpperCase() : null) : null,
        c.notes !== undefined ? (c.notes ? c.notes.trim() : null) : null,
        hasCreditLimit ? creditLimit : null,
        hasCreditPeriodEnabled ? creditPeriodEnabled : null,
        hasCreditPeriodDays ? creditPeriodDays : null,
        hasCreditPeriodBasis ? creditPeriodBasis : null,
        hasRestrictOnCreditExpiry ? restrictOnCreditExpiry : null,
        c.pricing_tier_id || null,
        matchedParty.party_id
      );
    }

    return { success: true };
  } catch (error: any) {
    console.error('[db:updateCustomer]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getCustomerInvoices', (event, { customer_id, tenant_id, phone, name }: { customer_id: string; tenant_id: string; phone?: string; name?: string }) => {
  try {
    const db = getDb();
    if (!customer_id && !phone && !name) return [];
    const effectiveTenantId = tenant_id || 'global';

    // 1. Resolve customer record
    let cust: any = null;
    if (customer_id) {
      cust = db.prepare('SELECT * FROM customers WHERE customer_id = ? AND tenant_id = ?').get(customer_id, effectiveTenantId);
    }
    const cleanArgPhone = (phone || '').replace(/\D/g, '');
    if (!cust && cleanArgPhone.length >= 7) {
      cust = db.prepare(`SELECT * FROM customers WHERE tenant_id = ? AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?)`).get(effectiveTenantId, phone, `%${cleanArgPhone.slice(-10)}`);
    }
    if (!cust && name) {
      cust = db.prepare('SELECT * FROM customers WHERE tenant_id = ? AND (LOWER(TRIM(name)) = LOWER(?) OR LOWER(REPLACE(TRIM(name), "  ", " ")) = LOWER(REPLACE(TRIM(?), "  ", " ")))').get(effectiveTenantId, name.trim(), name.trim());
    }

    // 2. Resolve associated party
    const searchPhone = (cust?.phone || phone || '').trim();
    const searchName = (cust?.name || name || '').trim();
    const phoneClean = searchPhone.replace(/\D/g, '');
    const phoneLast10 = phoneClean.length >= 7 ? phoneClean.slice(-10) : '';

    let party: any = null;
    if (customer_id) {
      party = db.prepare('SELECT * FROM parties WHERE party_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(customer_id, effectiveTenantId);
    }
    if (!party && phoneLast10) {
      party = db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0) AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?) LIMIT 1`).get(effectiveTenantId, searchPhone, `%${phoneLast10}`);
    }
    if (!party && searchName) {
      party = db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0) AND (LOWER(TRIM(name)) = LOWER(?) OR LOWER(REPLACE(TRIM(name), "  ", " ")) = LOWER(REPLACE(TRIM(?), "  ", " "))) LIMIT 1`).get(effectiveTenantId, searchName, searchName);
    }

    // If customer wasn't found in customers table, but party was, try finding customer via party
    if (!cust && party) {
      const pClean = (party.phone || '').replace(/\D/g, '');
      if (pClean.length >= 7) {
        cust = db.prepare(`SELECT * FROM customers WHERE tenant_id = ? AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?)`).get(effectiveTenantId, party.phone, `%${pClean.slice(-10)}`);
      }
      if (!cust && party.name) {
        cust = db.prepare('SELECT * FROM customers WHERE tenant_id = ? AND (LOWER(TRIM(name)) = LOWER(?) OR LOWER(REPLACE(TRIM(name), "  ", " ")) = LOWER(REPLACE(TRIM(?), "  ", " ")))').get(effectiveTenantId, party.name.trim(), party.name.trim());
      }
    }

    const targetCustomerId = cust?.customer_id || customer_id;
    const targetPartyId = party?.party_id || '';
    const nameNorm = searchName ? searchName.toLowerCase().replace(/\s+/g, ' ') : '';

    // 3. Self-healing: link any unlinked invoices belonging to this customer
    if (targetCustomerId) {
      if (phoneLast10) {
        db.prepare(`
          UPDATE invoices
          SET customer_id = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE (customer_id IS NULL OR customer_id = '')
            AND tenant_id = ?
            AND customer_phone IS NOT NULL AND customer_phone != ''
            AND REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '-', ''), '+', '') LIKE ?
        `).run(targetCustomerId, effectiveTenantId, `%${phoneLast10}`);
      }
      if (nameNorm) {
        db.prepare(`
          UPDATE invoices
          SET customer_id = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE (customer_id IS NULL OR customer_id = '')
            AND tenant_id = ?
            AND customer_name IS NOT NULL
            AND LOWER(REPLACE(TRIM(customer_name), '  ', ' ')) = ?
            AND (customer_phone IS NULL OR customer_phone = '' OR (? != '' AND REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '-', ''), '+', '') LIKE ?))
        `).run(targetCustomerId, effectiveTenantId, nameNorm, phoneLast10, `%${phoneLast10}`);
      }
    }

    // 4. Query all matching invoices
    const rawInvoices = db.prepare(`
      SELECT *
      FROM invoices
      WHERE tenant_id = ?
        AND (
          (? != '' AND customer_id = ?)
          OR (? != '' AND customer_id = ?)
          OR (? != '' AND customer_phone IS NOT NULL AND customer_phone != '' AND REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '-', ''), '+', '') LIKE ?)
          OR (? != '' AND customer_name IS NOT NULL AND LOWER(REPLACE(TRIM(customer_name), '  ', ' ')) = ? AND (customer_phone IS NULL OR customer_phone = '' OR ? = ''))
        )
        AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (is_held IS NULL OR is_held = 0)
        AND (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY created_at DESC
    `).all(
      effectiveTenantId,
      targetCustomerId || '', targetCustomerId || '',
      targetPartyId || '', targetPartyId || '',
      phoneLast10 ? `%${phoneLast10}` : '', phoneLast10 ? `%${phoneLast10}` : '',
      nameNorm || '', nameNorm || '', phoneLast10 || ''
    ) as any[];

    return computeCustomerCreditStatusSync(db, effectiveTenantId, targetCustomerId, rawInvoices);
  } catch (error: any) {
    console.error('[db:getCustomerInvoices]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:deleteInvoice', (event, invoice_id: string) => {
  try {
    const db = getDb();
    const existingInv = db.prepare(`SELECT * FROM invoices WHERE invoice_id = ?`).get(invoice_id) as any;
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

      // Soft-delete party_ledger entries immediately within transaction
      if (existingInv && existingInv.invoice_number) {
        const invNum = String(existingInv.invoice_number).trim();
        db.prepare(`
          UPDATE party_ledger 
          SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
          WHERE (reference_number = ? OR reference_number = ? OR reference_number LIKE ? OR description LIKE ?)
            AND (is_deleted IS NULL OR is_deleted = 0)
        `).run(invNum, `${invNum}-PAY`, `${invNum}%`, `%${invNum}%`);
      }
    })();

    if (existingInv) {
      syncInvoiceCreditLedger(db, existingInv, true);
    }

    if (existingInv) {
      adjustPaymentSourcesForInvoice(db, existingInv.tenant_id, existingInv, true);
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

// â”€â”€ Staff Management Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('db:getStaff', safeHandler((event, params: any) => {
  return dbGetStaff(params);
}));

ipcMain.handle('db:saveStaff', safeHandler((event, params: any) => {
  return dbSaveStaff(params);
}));

ipcMain.handle('db:verifyBillerPin', safeHandler((event, params: any) => {
  return dbVerifyBillerPin(params);
}));

ipcMain.handle('db:getStaffLedger', safeHandler((event, params: any) => {
  return dbGetStaffLedger(params);
}));

ipcMain.handle('db:addStaffTransaction', safeHandler((event, params: any) => {
  return dbAddStaffTransaction(params);
}));

ipcMain.handle('db:getStaffAttendance', safeHandler((event, params: any) => {
  return dbGetStaffAttendance(params);
}));

ipcMain.handle('db:saveStaffAttendance', safeHandler((event, params: any) => {
  return dbSaveStaffAttendance(params);
}));
