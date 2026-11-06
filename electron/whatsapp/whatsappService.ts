import { app, BrowserWindow, ipcMain } from 'electron';
import { buildReceiptHtml } from '../hardware/receiptHtml.js';
import { setSharedA4Html, clearSharedA4Html } from './sharedPrintHtml.js';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import pino from 'pino';

// Dynamic import holder for Baileys ESM
let baileysModule: typeof import('@whiskeysockets/baileys', { with: { 'resolution-mode': 'import' } }) | null = null;

async function getBaileys() {
  if (!baileysModule) {
    baileysModule = await (eval('import("@whiskeysockets/baileys")') as Promise<typeof import('@whiskeysockets/baileys', { with: { 'resolution-mode': 'import' } })>);
  }
  return baileysModule;
}

// WhatsApp session and state variables
let sock: import('@whiskeysockets/baileys', { with: { 'resolution-mode': 'import' } }).WASocket | null = null;
let currentQrBase64: string | null = null;
let connectionStatus: 'disconnected' | 'connecting' | 'syncing' | 'connected' = 'disconnected';
let connectedPhone: string | null = null;
let lastError: string | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
// Bumped on every connect/logout so an older, still-starting connection knows it was superseded.
let connectGeneration = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const VERSION_LOOKUP_TIMEOUT_MS = 8000;

// Helper to notify all renderer windows about WhatsApp state changes
function broadcastWhatsAppState() {
  const payload = {
    status: connectionStatus,
    qrCode: currentQrBase64,
    phone: connectedPhone,
    error: lastError,
  };
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('whatsapp:status-update', payload);
    }
  });
}

// Get the user data folder for WhatsApp auth credentials
function getWhatsAppSessionDir(): string {
  const sessionDir = path.join(app.getPath('userData'), 'whatsapp_session');
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  return sessionDir;
}

// Format phone number into WhatsApp JID (e.g., 919876543210@s.whatsapp.net)
function formatToWhatsAppJid(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '');
  // Default to India country code 91 if 10 digits
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  return `${cleaned}@s.whatsapp.net`;
}

// Baileys looks the current WhatsApp Web version up on raw.githubusercontent.com with no timeout. Where that host
// is blocked or stalls, the QR never appeared; after the timeout we use the version bundled with Baileys instead.
export async function resolveWhatsAppVersion(
  fetchLatest: () => Promise<{ version: [number, number, number] }>
): Promise<[number, number, number] | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), VERSION_LOOKUP_TIMEOUT_MS); });
  const latest = fetchLatest().then((r) => r.version).catch(() => undefined);
  try {
    return await Promise.race([latest, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Initialize Baileys WhatsApp Connection
async function startWhatsAppConnection(): Promise<void> {
  const generation = ++connectGeneration;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try {
    lastError = null;
    connectionStatus = 'connecting';
    broadcastWhatsAppState();

    const baileys = await getBaileys();
    const { makeWASocket, DisconnectReason, useMultiFileAuthState: loadMultiFileAuthState, fetchLatestBaileysVersion } = baileys;

    const sessionDir = getWhatsAppSessionDir();
    const { state, saveCreds } = await loadMultiFileAuthState(sessionDir);
    const version = await resolveWhatsAppVersion(fetchLatestBaileysVersion);
    if (generation !== connectGeneration) return;

    // Two live sockets on one session overwrite each other's QR and corrupt the saved credentials.
    const previous = sock;
    sock = null;
    if (previous) {
      try { previous.end(undefined); } catch { /* already closed */ }
    }

    const logger = pino({ level: 'silent' });

    const thisSock = makeWASocket({
      ...(version ? { version } : {}),
      logger,
      printQRInTerminal: false,
      auth: state,
      browser: ['Nafid POS', 'Chrome', '1.0.0'],
      syncFullHistory: false,
    });
    sock = thisSock;

    thisSock.ev.on('creds.update', saveCreds);

    thisSock.ev.on('connection.update', async (update: Partial<import('@whiskeysockets/baileys', { with: { 'resolution-mode': 'import' } }).ConnectionState>) => {
      // Events from a socket that was replaced or logged out must not touch the current state.
      if (sock !== thisSock) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrImage = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
          if (sock !== thisSock) return;
          currentQrBase64 = qrImage;
          connectionStatus = 'connecting';
          broadcastWhatsAppState();
        } catch (err) {
          console.error('[WhatsApp] QR generate error:', err);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
        // These sessions can never log in again; keeping them means WhatsApp never offers a new QR.
        const sessionUnusable = statusCode === DisconnectReason.loggedOut
          || statusCode === DisconnectReason.badSession
          || statusCode === DisconnectReason.multideviceMismatch;
        const shouldReconnect = !sessionUnusable;
        console.log(`[WhatsApp] Connection closed. Reason code: ${statusCode}, Reconnecting: ${shouldReconnect}`);

        currentQrBase64 = null;
        connectionStatus = shouldReconnect ? 'connecting' : 'disconnected';
        connectedPhone = null;
        sock = null;

        if (sessionUnusable) {
          console.log('[WhatsApp] Session is no longer valid. Clearing session files...');
          try {
            fs.rmSync(sessionDir, { recursive: true, force: true });
          } catch (e) {
            console.error('[WhatsApp] Failed to clear session dir:', e);
          }
          lastError = 'WhatsApp session expired. Click "Generate WhatsApp QR Code" to link again.';
        } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const timeout = Math.min(reconnectAttempts * 2000, 10000);
          console.log(`[WhatsApp] Attempting reconnect #${reconnectAttempts} in ${timeout}ms...`);
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            startWhatsAppConnection();
          }, timeout);
        } else {
          reconnectAttempts = 0;
          lastError = 'Could not reach WhatsApp. Retrying connection in background...';
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            startWhatsAppConnection();
          }, 30000);
        }
        broadcastWhatsAppState();
      } else if (connection === 'open') {
        console.log('[WhatsApp] Connection established successfully! QR scanned, waiting for session sync...');
        reconnectAttempts = 0;
        currentQrBase64 = null;

        // Transition to syncing state - QR scanned, now waiting for session to fully stabilize
        connectionStatus = 'syncing';
        broadcastWhatsAppState();

        // Extract phone number from JID
        const jid = sock?.user?.id || '';
        connectedPhone = jid.split(':')[0] || jid.split('@')[0] || 'Connected';

        // After a brief delay, mark as fully connected (session stabilized)
        setTimeout(() => {
          if (connectionStatus === 'syncing') {
            console.log('[WhatsApp] Session stabilized, marking as connected');
            connectionStatus = 'connected';
            broadcastWhatsAppState();
          }
        }, 3000);
      }
    });
  } catch (error) {
    console.error('[WhatsApp] startWhatsAppConnection error:', error);
    if (generation !== connectGeneration) return;
    connectionStatus = 'disconnected';
    currentQrBase64 = null;
    lastError = `WhatsApp could not start: ${(error as Error)?.message || String(error)}`;
    broadcastWhatsAppState();
  }
}

// Disconnect / Log out
async function logoutWhatsApp(): Promise<{ success: boolean; error?: string }> {
  try {
    connectGeneration++;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempts = 0;
    lastError = null;
    if (sock) {
      const current = sock;
      sock = null;
      try {
        await current.logout();
      } catch (err) {
        console.warn('[WhatsApp] Logout call warning:', err);
      }
    }
    const sessionDir = getWhatsAppSessionDir();
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    connectionStatus = 'disconnected';
    currentQrBase64 = null;
    connectedPhone = null;
    broadcastWhatsAppState();
    return { success: true };
  } catch (error) {
    console.error('[WhatsApp] Logout error:', error);
    return { success: false, error: (error as Error).message };
  }
}

// Helper to generate PDF Buffer from HTML content using a headless BrowserWindow
async function generatePdfBufferFromHtml(htmlContent: string, thermal = false): Promise<Buffer> {
  const isHalfA4 = htmlContent.includes('content="half-a4"') || /@page\s*\{[^}]*210mm\s+148/i.test(htmlContent);
  const isA5 = !isHalfA4 && (htmlContent.includes('content="A5"') || /@page\s*\{[^}]*148mm\s+210/i.test(htmlContent));
  const isLandscape = htmlContent.includes('content="landscape"') || /@page\s*\{[^}]*landscape/i.test(htmlContent) || isHalfA4;

  const widthMm = thermal ? (/@page\s*\{[^}]*58mm/i.test(htmlContent) || /width:\s*58mm/i.test(htmlContent) ? 58 : 80) : 80;
  const printWindow = new BrowserWindow({
    show: false,
    width: thermal ? Math.max(300, Math.ceil(widthMm * (96 / 25.4)) + 20) : (isHalfA4 ? 794 : (isA5 ? (isLandscape ? 794 : 560) : (isLandscape ? 1123 : 794))),
    height: thermal ? 800 : (isHalfA4 ? 560 : (isA5 ? (isLandscape ? 560 : 794) : (isLandscape ? 794 : 1123))),
    webPreferences: {
        backgroundThrottling: false,
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const winId = printWindow.webContents.id;

  // Set the currentA4Html globally and per-window BEFORE loading so the print-a4 route renders this bill
  try {
    if (typeof setSharedA4Html === 'function') {
      setSharedA4Html(htmlContent, winId);
    }
  } catch (e) {
    console.error('[WhatsApp] setSharedA4Html error:', e);
  }

  if (thermal) {
    // Receipt HTML is generated locally and escapes bill text. Render it directly so
    // the A4 view's sanitizer does not remove receipt QR images and barcodes.
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  } else if (app.isPackaged) {
    printWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/print-a4' });
  } else {
    printWindow.loadURL(`${process.env.ELECTRON_DEV_SERVER_URL || ''}/#/print-a4`);
  }

  const cleanup = () => {
    try {
      if (typeof clearSharedA4Html === 'function') {
        clearSharedA4Html(winId);
      }
    } catch { /* ignore */ }
    if (!printWindow.isDestroyed()) printWindow.close();
  };

  return new Promise<Buffer>((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('PDF generation timed out (30s)'));
    }, 30000);

    const triggerPdf = async (reportedHeight?: number) => {
      if (finished) return;
      finished = true;
      try {
        let heightPx = typeof reportedHeight === 'number' && reportedHeight > 0 ? reportedHeight : 0;
        if (thermal && heightPx <= 0 && typeof printWindow.webContents.executeJavaScript === 'function') {
          const jsHeight: unknown = await printWindow.webContents.executeJavaScript(`(async () => {
            if (document.fonts) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 600))]);
            return document.body?.scrollHeight || document.documentElement?.scrollHeight || null;
          })()`).catch(() => null);
          if (typeof jsHeight === 'number' && jsHeight > 0) heightPx = jsHeight;
        }

        const pageHeightMm = Math.max(40, Math.ceil((heightPx > 0 ? heightPx : 400) * 25.4 / 96 + 3));

        if (thermal && typeof printWindow.webContents.executeJavaScript === 'function') {
          await printWindow.webContents.executeJavaScript(`(() => {
            const s = document.createElement('style');
            s.textContent = '@page { size: ${widthMm}mm ${pageHeightMm}mm !important; margin: 0 !important; }';
            document.head.appendChild(s);
          })()`).catch(() => {});
        }

        const pdfOpts: Electron.PrintToPDFOptions = {
          printBackground: true,
          preferCSSPageSize: thermal,
          margins: { marginType: 'none' },
        };
        if (thermal) {
          pdfOpts.pageSize = {
            width: Number((widthMm / 25.4).toFixed(4)),
            height: Number((pageHeightMm / 25.4).toFixed(4)),
          };
        } else {
          pdfOpts.pageSize = isA5 ? 'A5' : 'A4';
          pdfOpts.landscape = isLandscape;
        }

        const data = await printWindow.webContents.printToPDF(pdfOpts);
        clearTimeout(timer);
        cleanup();
        resolve(data);
      } catch (err) {
        clearTimeout(timer);
        cleanup();
        reject(err);
      }
    };

    ipcMain.once(`print-ready-${winId}`, (height?: unknown) => {
      void triggerPdf(typeof height === 'number' ? height : undefined);
    });

    if (thermal && typeof printWindow.webContents.once === 'function') {
      printWindow.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          void triggerPdf();
        }, 1200);
      });
    }
  });
}

// Send WhatsApp Bill Message & PDF
export async function sendWhatsAppBill({
  phone,
  message,
  pdfBuffer,
  fileName,
}: {
  phone: string;
  message: string;
  pdfBuffer?: Buffer;
  fileName?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!sock || connectionStatus !== 'connected') {
    const sessionDir = getWhatsAppSessionDir();
    const credsFile = path.join(sessionDir, 'creds.json');
    if (fs.existsSync(credsFile) && connectionStatus === 'disconnected') {
      startWhatsAppConnection().catch(() => {});
    }
    return {
      success: false,
      error: 'WhatsApp is not connected. Please scan QR code in Settings.',
    };
  }

  if (!phone || !phone.trim()) {
    return { success: false, error: 'Customer phone number is missing.' };
  }

  const jid = formatToWhatsAppJid(phone);

  try {
    let sentMsg: import('@whiskeysockets/baileys', { with: { 'resolution-mode': 'import' } }).WAMessage | undefined;
    if (pdfBuffer && pdfBuffer.length > 0) {
      // Send PDF Document with message as caption
      sentMsg = await sock.sendMessage(jid, {
        document: pdfBuffer,
        mimetype: 'application/pdf',
        fileName: fileName || 'Invoice.pdf',
        caption: message,
      });
    } else {
      // Send Text Message
      sentMsg = await sock.sendMessage(jid, {
        text: message,
      });
    }

    return { success: true, messageId: sentMsg?.key?.id as string | undefined };
  } catch (error) {
    console.error('[WhatsApp] Send Message Error:', error);
    return { success: false, error: (error as Error).message || 'Failed to send WhatsApp message.' };
  }
}

// Register IPC handlers
export function initWhatsAppIpc(): void {
  // Check if saved session exists on startup and try auto-connecting
  const sessionDir = getWhatsAppSessionDir();
  const credsFile = path.join(sessionDir, 'creds.json');
  if (fs.existsSync(credsFile)) {
    console.log('[WhatsApp] Found existing credentials, connecting in background...');
    startWhatsAppConnection().catch(() => {});
  }

  ipcMain.handle('whatsapp:getStatus', () => {
    return {
      status: connectionStatus,
      qrCode: currentQrBase64,
      phone: connectedPhone,
      error: lastError,
    };
  });

  ipcMain.handle('whatsapp:connect', async () => {
    if (connectionStatus === 'connected') {
      return { success: true, status: connectionStatus, phone: connectedPhone };
    }
    await startWhatsAppConnection();
    if (lastError) return { success: false, status: connectionStatus, error: lastError };
    return { success: true, status: connectionStatus, qrCode: currentQrBase64 };
  });

  ipcMain.handle('whatsapp:disconnect', async () => {
    return await logoutWhatsApp();
  });

  ipcMain.handle(
    'whatsapp:sendInvoice',
    async (
      _event,
      payload: {
        phone: string;
        message: string;
        htmlContent?: string;
        fileName?: string;
        receiptText?: string;
        receiptWidthMm?: number;
      }
    ) => {
      try {
        let pdfBuf: Buffer | undefined = undefined;
        if (payload.htmlContent || payload.receiptText) {
          try {
            let html = payload.htmlContent || '';
            if (payload.receiptText) {
              const width = payload.receiptWidthMm === 58 ? 58 : 80;
              html = await buildReceiptHtml(payload.receiptText, width);
              // Digital receipts get breathing room without changing physical printer geometry.
              html = html.replace('</head>', '<style>#receipt-root { width: calc(100% - 8mm) !important; max-width: calc(100% - 8mm) !important; margin-left: 4mm !important; margin-right: 4mm !important; box-sizing: border-box !important; }</style></head>');
              html = html.replace('@page {', `@page { size: ${width}mm 297mm;`);
            }
            pdfBuf = await generatePdfBufferFromHtml(html, Boolean(payload.receiptText));
          } catch (err) {
            console.warn('[WhatsApp] Could not render PDF buffer:', err);
            return { success: false, error: 'Could not generate the selected PDF. Please retry.' };
          }
        }
        return await sendWhatsAppBill({
          phone: payload.phone,
          message: payload.message,
          pdfBuffer: pdfBuf,
          fileName: payload.fileName,
        });
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    }
  );
}
