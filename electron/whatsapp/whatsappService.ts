import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import pino from 'pino';

// Dynamic import holder for Baileys ESM
let baileysModule: any = null;

async function getBaileys() {
  if (!baileysModule) {
    baileysModule = await (eval('import("@whiskeysockets/baileys")') as Promise<any>);
  }
  return baileysModule;
}

// WhatsApp session and state variables
let sock: any = null;
let currentQrBase64: string | null = null;
let connectionStatus: 'disconnected' | 'connecting' | 'syncing' | 'connected' = 'disconnected';
let connectedPhone: string | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Track if we've shown QR code and are waiting for scan

// Helper to notify all renderer windows about WhatsApp state changes
function broadcastWhatsAppState() {
  const payload = {
    status: connectionStatus,
    qrCode: currentQrBase64,
    phone: connectedPhone,
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

// Initialize Baileys WhatsApp Connection
async function startWhatsAppConnection(): Promise<void> {
  try {
    const baileys = await getBaileys();
    const { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = baileys;

    const sessionDir = getWhatsAppSessionDir();
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    connectionStatus = 'connecting';
    broadcastWhatsAppState();

    const logger = pino({ level: 'silent' });

    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: state,
      browser: ['Nafid POS', 'Chrome', '1.0.0'],
      syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          currentQrBase64 = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
          connectionStatus = 'connecting';
          broadcastWhatsAppState();
        } catch (err) {
          console.error('[WhatsApp] QR generate error:', err);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`[WhatsApp] Connection closed. Reason code: ${statusCode}, Reconnecting: ${shouldReconnect}`);

        currentQrBase64 = null;
        connectionStatus = 'disconnected';
        connectedPhone = null;
        sock = null;
        broadcastWhatsAppState();

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('[WhatsApp] Device logged out. Clearing session files...');
          try {
            fs.rmSync(sessionDir, { recursive: true, force: true });
          } catch (e) {
            console.error('[WhatsApp] Failed to clear session dir:', e);
          }
        } else if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const timeout = Math.min(reconnectAttempts * 2000, 10000);
          console.log(`[WhatsApp] Attempting reconnect #${reconnectAttempts} in ${timeout}ms...`);
          setTimeout(() => {
            startWhatsAppConnection();
          }, timeout);
        }
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
    connectionStatus = 'disconnected';
    currentQrBase64 = null;
    broadcastWhatsAppState();
  }
}

// Disconnect / Log out
async function logoutWhatsApp(): Promise<{ success: boolean; error?: string }> {
  try {
    if (sock) {
      try {
        await sock.logout();
      } catch (err) {
        console.warn('[WhatsApp] Logout call warning:', err);
      }
      sock = null;
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
async function generatePdfBufferFromHtml(htmlContent: string): Promise<Buffer> {
  const isHalfA4 = htmlContent.includes('content="half-a4"') || /@page\s*\{[^}]*210mm\s+148/i.test(htmlContent);
  const isA5 = !isHalfA4 && (htmlContent.includes('content="A5"') || /@page\s*\{[^}]*148mm\s+210/i.test(htmlContent));
  const isLandscape = htmlContent.includes('content="landscape"') || /@page\s*\{[^}]*landscape/i.test(htmlContent) || isHalfA4;

  const printWindow = new BrowserWindow({
    show: false,
    width: isHalfA4 ? 794 : (isA5 ? (isLandscape ? 794 : 560) : (isLandscape ? 1123 : 794)),
    height: isHalfA4 ? 560 : (isA5 ? (isLandscape ? 560 : 794) : (isLandscape ? 794 : 1123)),
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (app.isPackaged) {
    printWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/print-a4' });
  } else {
    printWindow.loadURL(`${process.env.ELECTRON_DEV_SERVER_URL || ''}/#/print-a4`);
  }

  // Set the currentA4Html globally so the print-a4 route renders this bill
  try {
    const { setSharedA4Html } = require('./sharedPrintHtml');
    if (setSharedA4Html) {
      setSharedA4Html(htmlContent);
    }
  } catch (e) {
    console.error('[WhatsApp] setSharedA4Html error:', e);
  }

  return new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!printWindow.isDestroyed()) printWindow.close();
      reject(new Error('PDF generation timed out (30s)'));
    }, 30000);

    ipcMain.once(`print-ready-${printWindow.webContents.id}`, async () => {
      try {
        const data = await printWindow.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          landscape: false,
          preferCSSPageSize: false,
          margins: { marginType: 'none' },
        });
        clearTimeout(timer);
        if (!printWindow.isDestroyed()) printWindow.close();
        resolve(data);
      } catch (err) {
        clearTimeout(timer);
        if (!printWindow.isDestroyed()) printWindow.close();
        reject(err);
      }
    });
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
    let sentMsg: any;
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

    return { success: true, messageId: sentMsg?.key?.id };
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
    };
  });

  ipcMain.handle('whatsapp:connect', async () => {
    if (connectionStatus === 'connected') {
      return { success: true, status: connectionStatus, phone: connectedPhone };
    }
    await startWhatsAppConnection();
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
      }
    ) => {
      try {
        let pdfBuf: Buffer | undefined = undefined;
        if (payload.htmlContent) {
          try {
            pdfBuf = await generatePdfBufferFromHtml(payload.htmlContent);
          } catch (err) {
            console.warn('[WhatsApp] Could not render PDF buffer:', err);
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
