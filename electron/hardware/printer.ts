import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import net from 'net';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getDb } from '../db/localDb';

// Generic ESC/POS Hex Commands
const ESC_INIT = Buffer.from([0x1B, 0x40]); // Initialize Printer
const ESC_FONT_A = Buffer.from([0x1B, 0x4D, 0x00]); // Select Font A (12 CPI, standard)
const ESC_DEFAULT_LINE_SPACING = Buffer.from([0x1B, 0x32]); // Set default line spacing
const ESC_BOLD_ON = Buffer.from([0x1B, 0x45, 0x01]); // ESC E 1 — Emphasized (bold) mode ON
const ESC_BOLD_OFF = Buffer.from([0x1B, 0x45, 0x00]); // ESC E 0 — Emphasized (bold) mode OFF
const ESC_DENSITY = Buffer.from([0x1D, 0x28, 0x41, 0x02, 0x00, 0x08, 0x00]); // GS ( A — Max print density (+50%)
const ESC_CUT = Buffer.from([0x1D, 0x56, 0x00]); // Full Cut
const ESC_DRAWER_KICK = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]); // Open RJ11 Drawer

const ESC_POS_HEADER = Buffer.concat([ESC_INIT, ESC_FONT_A, ESC_DEFAULT_LINE_SPACING]);

// For ESC/POS network printers: strip non-ASCII chars that would print as garbage
function sanitizeForEscPos(text: string): string {
  const withoutQrMarkers = text.replace(/\[\[QR:[^\]]+\]\]\s*/g, '');
  const withoutProminent = withoutQrMarkers.replace(/\[\[PROMINENT:([^\]]+)\]\]/g, '$1');
  return withoutProminent.replace(/[\u{0080}-\u{FFFF}]/gu, (ch) => {
    if (ch === '₹') return 'Rs ';
    if (ch === '\u2588') return '#';  // █ full block
    if (ch === '\u2580') return '^';  // ▀ upper half
    if (ch === '\u2584') return ',';  // ▄ lower half
    return '?';
  });
}

function getPrinterConfig(tenantId: string, type: 'barcode' | 'receipt' = 'barcode') {
  try {
    const db = getDb();
    const key = type === 'receipt' ? 'receipt_printer_config' : 'barcode_printer_config';
    const tid = tenantId || 'global';

    let row: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = ?").get(tid, key);
    if (!row && tid !== 'global') {
      row = db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = ?").get(key);
    }
    if (!row) {
      row = db.prepare("SELECT value FROM settings WHERE key = ? ORDER BY updated_at DESC LIMIT 1").get(key);
    }
    if (row) {
      try { return JSON.parse(row.value); } catch {}
    }
    
    // Fallback to legacy printer_config
    let legacyRow: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'printer_config'").get(tid);
    if (!legacyRow && tid !== 'global') {
      legacyRow = db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = 'printer_config'").get();
    }
    if (!legacyRow) {
      legacyRow = db.prepare("SELECT value FROM settings WHERE key = 'printer_config' ORDER BY updated_at DESC LIMIT 1").get();
    }
    if (legacyRow) {
      try {
        const parsed = JSON.parse(legacyRow.value);
        if (parsed && parsed.ip === '192.168.1.100') return { type: 'none' };
        return parsed;
      } catch {}
    }
    return { type: 'none' };
  } catch {
    return { type: 'none' };
  }
}

let currentBulkPrintItems: any[] = [];
let currentReceiptText: string = '';
let currentA4Html: string = '';
let pendingReceiptHeightPx: number = 0; // measured by renderer before printReady; used by printReceiptUSB

function getPrintFormatConfig(tenantId: string) {
  try {
    const db = getDb();
    const row: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'print_format'").get(tenantId || 'global');
    if (row) {
      try {
        const parsed = JSON.parse(row.value);
        if (typeof parsed === 'string') return { format: parsed };
        return parsed;
      } catch {
        return { format: row.value };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function getLabelCodeType(tenantId: string): string {
  try {
    const db = getDb();
    const row: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'label_code_type'").get(tenantId || 'global', 'label_code_type');
    if (row) {
      let val: any = row.value;
      try {
        const parsed = JSON.parse(row.value);
        if (typeof parsed === 'string') val = parsed;
      } catch {
        // Value is a raw (non-JSON) string, e.g. cloud-synced 'qrcode' — use as-is
      }
      if (val === 'barcode' || val === 'qrcode') return val;
    }
    return 'barcode';
  } catch {
    return 'barcode';
  }
}

export function initPrinter() {
  ipcMain.handle('hardware:getBulkPrintItems', () => currentBulkPrintItems);

  ipcMain.handle('hardware:getPrinters', async (event) => {
    return await event.sender.getPrintersAsync();
  });

  ipcMain.handle('hardware:printReady', (event, contentHeightPx?: number) => {
    if (contentHeightPx && contentHeightPx > 0) {
      pendingReceiptHeightPx = contentHeightPx;
    }
    ipcMain.emit(`print-ready-${event.sender.id}`);
    return { success: true };
  });

  ipcMain.handle('hardware:getReceiptText', () => currentReceiptText);

  ipcMain.handle('hardware:getA4Html', () => currentA4Html);

  ipcMain.handle('hardware:printA4Html', async (event, { tenant_id, htmlContent }: { tenant_id: string; htmlContent: string }) => {
    try {
      const db = getDb();
      const tid = tenant_id || 'global';
      let row: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'a4_printer_config'").get(tid);
      if (!row && tid !== 'global') {
        row = db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = 'a4_printer_config'").get();
      }
      if (!row) {
        row = db.prepare("SELECT value FROM settings WHERE key = 'a4_printer_config' ORDER BY updated_at DESC LIMIT 1").get();
      }
      let config = { deviceName: '' };
      if (row) {
        try {
          config = JSON.parse(row.value);
        } catch {
          config = { deviceName: row.value || '' };
        }
      }

      currentA4Html = htmlContent;
      const isA5 = htmlContent.includes('A5') || htmlContent.includes('half-a4');
      const isLandscape = htmlContent.includes('landscape');
      await printA4USB(config.deviceName || '', isA5 ? 'A5' : 'A4', isLandscape);

      return { success: true };
    } catch (error: any) {
      console.error('[Hardware] A4 Print Error:', error);
      return { success: false, error: error.message || 'Print failed' };
    }
  });

  ipcMain.handle('hardware:exportA4Pdf', async (event, { tenant_id, htmlContent, defaultFilename }: { tenant_id: string; htmlContent: string; defaultFilename?: string }) => {
    try {
      const printWindow = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          preload: path.join(__dirname, '../preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        }
      });

      if (app.isPackaged) {
        printWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/print-a4' });
      } else {
        printWindow.loadURL(`http://localhost:5173/#/print-a4`);
      }

      currentA4Html = htmlContent;

      const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (!printWindow.isDestroyed()) {
            printWindow.close();
            reject(new Error('PDF generation timeout'));
          }
        }, 30000);

        ipcMain.once(`print-ready-${printWindow.webContents.id}`, async () => {
          try {
            const data = await printWindow.webContents.printToPDF({
              printBackground: true,
              pageSize: 'A4',
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

      const { filePath } = await dialog.showSaveDialog({
        title: 'Save PDF',
        defaultPath: defaultFilename || 'Quotation.pdf',
        filters: [{ name: 'PDF Document (*.pdf)', extensions: ['pdf'] }],
      });

      if (filePath) {
        fs.writeFileSync(filePath, pdfBuffer);
        return { success: true };
      }

      return { success: true, canceled: true };
    } catch (error: any) {
      console.error('[Hardware] A4 PDF Export Error:', error);
      return { success: false, error: error.message || 'PDF export failed' };
    }
  });

  ipcMain.handle('hardware:printReceipt', async (event, { tenant_id, textData }: { tenant_id: string; textData: string }) => {
    console.log(`[Hardware] Received Print Request for tenant: ${tenant_id}`);
    const config = getPrinterConfig(tenant_id, 'receipt');
    const printFmt = getPrintFormatConfig(tenant_id);
    
    // Unified width: prefer print_format.width (mm) over receiptWidthCm (cm)
    const widthMm = printFmt?.width
      ? Number(printFmt.width)
      : (config.receiptWidthCm || 5.8) * 10;

    try {
      const receiptText = textData + '\n\n\n\n\n';
      
      if (config.type === 'network') {
        const asciiText = sanitizeForEscPos(receiptText);
        const textBuffer = Buffer.from(asciiText, 'ascii');
        const finalBuffer = Buffer.concat([ESC_POS_HEADER, ESC_DENSITY, ESC_BOLD_ON, textBuffer, ESC_BOLD_OFF, ESC_CUT]);
        await sendToNetworkPrinter(config.ip, config.port || 9100, finalBuffer);
        return { success: true };
      }

      // For USB / auto-detect: resolve configured printer or default system printer
      const reqName = (config.type === 'usb' && config.deviceName) ? config.deviceName : 'default';
      currentReceiptText = receiptText;
      await printReceiptUSB(reqName, widthMm);

      return { success: true };
    } catch (error: any) {
      console.error('[Hardware] Print Error:', error);
      return { success: false, error: error.message || 'Print failed' };
    }
  });

  ipcMain.handle('hardware:openCashDrawer', async (event, tenant_id: string) => {
    console.log(`[Hardware] Kick RJ11 Cash Drawer for tenant: ${tenant_id}`);
    const config = getPrinterConfig(tenant_id, 'receipt');
    try {
      if (config.type === 'network') {
        await sendToNetworkPrinter(config.ip, config.port || 9100, ESC_DRAWER_KICK);
      } else if (config.type === 'usb') {
        console.warn('[Hardware] USB cash drawer kick skipped. (Configure via OS Printer Driver settings)');
        // We return success true here so we don't trigger a scary hardware error in the ActionPane UI
      } else {
        throw new Error('Unknown printer type configuration');
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Drawer open failed' };
    }
  });

  ipcMain.handle('hardware:printBarcode', async (event, { tenant_id, barcode, price, name, quantity = 1, sp, spType }: { tenant_id: string; barcode: string; price?: number; name?: string; quantity?: number; sp?: number; spType?: string }) => {
    console.log(`[Hardware] Printing Barcode: ${barcode} (Qty: ${quantity}) for tenant: ${tenant_id}`);
    const config = getPrinterConfig(tenant_id, 'barcode');
    const codeType = getLabelCodeType(tenant_id);
    try {
      if (config.type === 'none' || !config.type) {
        throw new Error('No barcode printer configured in settings');
      }

      // Basic ESC/POS Barcode Command (CODE128)
      const barcodeData = Buffer.from(barcode, 'ascii');
      const gsBarcode = Buffer.from([
        0x1D, 0x6B, 0x49, barcodeData.length, ...barcodeData
      ]);
      const singleLabelBuffer = Buffer.concat([ESC_INIT, gsBarcode, Buffer.from('\n\n\n'), ESC_CUT]);
      const finalBuffer = Buffer.concat(Array(quantity).fill(singleLabelBuffer));
      
      if (config.type === 'network') {
        await sendToNetworkPrinter(config.ip, config.port || 9100, finalBuffer);
      } else if (config.type === 'usb' && config.deviceName) {
        await printBarcodeUSB(barcode, config.deviceName, price, name, quantity, config.labelWidthMm, config.labelHeightMm, config.labelColumns, sp, spType, codeType);
      } else if (config.type === 'usb') {
        throw new Error('USB printing requested but deviceName not configured');
      } else {
        console.warn(`[Hardware] Unknown printer type: ${config.type}`);
        throw new Error(`Unknown printer type: ${config.type}`);
      }
      return { success: true };
    } catch (error: any) {
      console.error('[Hardware] Barcode Print Error:', error);
      return { success: false, error: error.message || 'Print failed' };
    }
  });

  ipcMain.handle('hardware:printBulkBarcodes', async (event, { tenant_id, items }: { tenant_id: string; items: any[] }) => {
    console.log(`[Hardware] Printing Bulk Barcodes (${items.length} items) for tenant: ${tenant_id}`);
    const config = getPrinterConfig(tenant_id, 'barcode');
    const codeType = getLabelCodeType(tenant_id);
    try {
      if (config.type === 'none' || !config.type) {
        throw new Error('No barcode printer configured in settings');
      }

      const allBarcodes = items.map(i => i.barcode);
      if (config.type === 'network') {
        // Send per-product so a paper-out / timeout stops cleanly at the exact
        // product and we can report exactly which products were flushed.
        const printed: string[] = [];
        for (const item of items) {
          const barcodeData = Buffer.from(item.barcode, 'ascii');
          const gsBarcode = Buffer.from([0x1D, 0x6B, 0x49, barcodeData.length, ...barcodeData]);
          const singleLabelBuffer = Buffer.concat([ESC_INIT, gsBarcode, Buffer.from('\n\n\n'), ESC_CUT]);
          const itemBuffer = Buffer.concat(Array(item.quantity).fill(singleLabelBuffer));
          try {
            await sendToNetworkPrinter(config.ip, config.port || 9100, itemBuffer);
            printed.push(item.barcode);
          } catch (error: any) {
            return { success: false, printed, error: `Print stopped at ${item.barcode}: ${error?.message || 'Printer connection timed out'}` };
          }
        }
        return { success: true, printed };
      } else if (config.type === 'usb' && config.deviceName) {
        await printBulkBarcodeUSB(items, config.deviceName, config.labelWidthMm, config.labelHeightMm, config.labelColumns, codeType);
        return { success: true, printed: allBarcodes };
      } else if (config.type === 'usb') {
        throw new Error('USB printing requested but deviceName not configured');
      } else {
        throw new Error(`Unknown printer type: ${config.type}`);
      }
      return { success: true, printed: allBarcodes };
    } catch (error: any) {
      console.error('[Hardware] Bulk Barcode Print Error:', error);
      return { success: false, error: error.message || 'Print failed' };
    }
  });

  console.log('[Hardware] Printer service initialized');
}

function sendToNetworkPrinter(host: string, port: number, data: Buffer): Promise<void> {
  // Network printers are always on local networks (192.168.x.x, 10.x.x.x, etc.)
  // We skip the isPrivateIp check here because this is a printer connection, not an outbound HTTP request
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(3000);

    client.on('error', (err) => {
      client.destroy();
      reject(err);
    });

    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Printer connection timed out'));
    });

    client.connect(port, host, () => {
      client.write(data, () => {
        client.destroy();
        resolve();
      });
    });
  });
}

function printBarcodeUSB(barcode: string, deviceName: string, price?: number, name?: string, quantity: number = 1, widthMm?: number, heightMm?: number, columns?: number, sp?: number, spType?: string, codeType?: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const labelW = Math.max(20, Math.round(widthMm || 50));
    const labelH = Math.max(12, Math.round(heightMm || 25));
    const windowWidth = Math.max(80, Math.round(labelW * 96 / 25.4));
    const windowHeight = Math.max(50, Math.round(labelH * 96 / 25.4));
    const printWindow = new BrowserWindow({
      show: false,
      width: windowWidth,
      height: windowHeight,
      useContentSize: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      }
    });

    const resolved = await resolvePrinterDeviceName(printWindow, deviceName);

    const codeTypeParam = `&codeType=${codeType || 'barcode'}`;
    const sizeParams = `&labelWidthMm=${labelW}&labelHeightMm=${labelH}`;
    if (app.isPackaged) {
      printWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: `/print-barcode?barcode=${barcode}${price !== undefined ? `&price=${price}` : ''}${name ? `&name=${encodeURIComponent(name)}` : ''}&quantity=${quantity}&columns=${columns || 1}${sp !== undefined ? `&sp=${sp}` : ''}${spType ? `&spType=${spType}` : ''}${sizeParams}${codeTypeParam}` });
    } else {
      printWindow.loadURL(`http://localhost:5173/#/print-barcode?barcode=${barcode}${price !== undefined ? `&price=${price}` : ''}${name ? `&name=${encodeURIComponent(name)}` : ''}&quantity=${quantity}&columns=${columns || 1}${sp !== undefined ? `&sp=${sp}` : ''}${spType ? `&spType=${spType}` : ''}${sizeParams}${codeTypeParam}`);
    }

    const timer = setTimeout(() => {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
        reject(new Error('USB print timeout'));
      }
    }, 20000);

    ipcMain.once(`print-ready-${printWindow.webContents.id}`, async () => {
      try {
        await executePrintWithFallback(printWindow, resolved.deviceName, labelW, labelH * 1000);
        clearTimeout(timer);
        setTimeout(() => { if (!printWindow.isDestroyed()) printWindow.close(); }, 2000);
        resolve();
      } catch (err: any) {
        clearTimeout(timer);
        setTimeout(() => { if (!printWindow.isDestroyed()) printWindow.close(); }, 2000);
        reject(err);
      }
    });
  });
}

function printBulkBarcodeUSB(items: any[], deviceName: string, widthMm?: number, heightMm?: number, columns?: number, codeType?: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    currentBulkPrintItems = items;
    const labelW = Math.max(20, Math.round(widthMm || 50));
    const labelH = Math.max(12, Math.round(heightMm || 25));
    const windowWidth = Math.max(80, Math.round(labelW * 96 / 25.4));
    const windowHeight = Math.max(50, Math.round(labelH * 96 / 25.4));
    const printWindow = new BrowserWindow({
      show: false,
      width: windowWidth,
      height: windowHeight,
      useContentSize: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      }
    });

    const resolved = await resolvePrinterDeviceName(printWindow, deviceName);

    const sizeParams = `&labelWidthMm=${labelW}&labelHeightMm=${labelH}`;
    if (app.isPackaged) {
      printWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: `/print-bulk-barcode?columns=${columns || 1}${sizeParams}&codeType=${codeType || 'barcode'}` });
    } else {
      printWindow.loadURL(`http://localhost:5173/#/print-bulk-barcode?columns=${columns || 1}${sizeParams}&codeType=${codeType || 'barcode'}`);
    }

    const timer = setTimeout(() => {
      console.warn('[Hardware] USB bulk print still spooling after 60s — keeping job alive');
    }, 60000);

    const watchdog = setTimeout(() => {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
        reject(new Error('USB bulk print timeout'));
      }
    }, 300000);

    ipcMain.once(`print-ready-${printWindow.webContents.id}`, async () => {
      try {
        await executePrintWithFallback(printWindow, resolved.deviceName, labelW, labelH * 1000);
        clearTimeout(timer);
        clearTimeout(watchdog);
        setTimeout(() => { if (!printWindow.isDestroyed()) printWindow.close(); }, 2000);
        resolve();
      } catch (err: any) {
        clearTimeout(timer);
        clearTimeout(watchdog);
        setTimeout(() => { if (!printWindow.isDestroyed()) printWindow.close(); }, 2000);
        reject(err);
      }
    });
  });
}

function printA4USB(deviceName: string, pageSize: string = 'A4', landscape: boolean = false): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const printWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      }
    });

    const resolved = await resolvePrinterDeviceName(printWindow, deviceName);

    if (app.isPackaged) {
      printWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/print-a4' });
    } else {
      printWindow.loadURL(`http://localhost:5173/#/print-a4`);
    }

    const timer = setTimeout(() => {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
        reject(new Error('A4 print timeout'));
      }
    }, 30000);

    ipcMain.once(`print-ready-${printWindow.webContents.id}`, async () => {
      try {
        await executePrintWithFallback(printWindow, resolved.deviceName, undefined, undefined, pageSize, landscape);
        clearTimeout(timer);
        setTimeout(() => { if (!printWindow.isDestroyed()) printWindow.close(); }, 2000);
        resolve();
      } catch (err: any) {
        clearTimeout(timer);
        setTimeout(() => { if (!printWindow.isDestroyed()) printWindow.close(); }, 2000);
        reject(err);
      }
    });
  });
}

async function resolvePrinterDeviceName(win: BrowserWindow, requestedName?: string): Promise<{ deviceName: string | undefined; actualNameUsed: string }> {
  try {
    const printers = await win.webContents.getPrintersAsync();
    console.log('[Printer] System printers detected:', printers.map((p: any) => `"${p.name}" (default:${Boolean(p.isDefault)})`).join(', '));

    if (!printers || printers.length === 0) {
      return { deviceName: undefined, actualNameUsed: 'System Default' };
    }

    if (!requestedName || requestedName.trim() === '' || requestedName.toLowerCase() === 'default') {
      const defaultPrinter = printers.find((p: any) => p.isDefault) || printers[0];
      return {
        deviceName: defaultPrinter ? defaultPrinter.name : undefined,
        actualNameUsed: defaultPrinter ? defaultPrinter.name : 'System Default'
      };
    }

    const cleanReq = requestedName.trim().toLowerCase();

    // 1. Exact match (case-insensitive)
    const exact = printers.find((p: any) => p.name.toLowerCase() === cleanReq || (p.displayName && String(p.displayName).toLowerCase() === cleanReq));
    if (exact) return { deviceName: exact.name, actualNameUsed: exact.name };

    // 2. Partial match (e.g. "POS80" matches "POSPrinter POS80")
    const partial = printers.find((p: any) => p.name.toLowerCase().includes(cleanReq) || cleanReq.includes(p.name.toLowerCase()));
    if (partial) {
      console.log(`[Printer] Resolved requested "${requestedName}" -> "${partial.name}" via partial match`);
      return { deviceName: partial.name, actualNameUsed: partial.name };
    }

    // 3. Thermal printer auto-detection if requested name failed
    const thermalKeywords = ['pos', 'rp', 'thermal', 'receipt', '80', '58', 'epson', 'xprinter', 'tspl', 'zjiang', 'sewoo'];
    const thermalPrinter = printers.find((p: any) => thermalKeywords.some(k => p.name.toLowerCase().includes(k)));
    if (thermalPrinter) {
      console.warn(`[Printer] Requested "${requestedName}" not found. Auto-detected thermal printer: "${thermalPrinter.name}"`);
      return { deviceName: thermalPrinter.name, actualNameUsed: `${thermalPrinter.name} (Auto-detected)` };
    }

    // 4. Fallback to OS default printer
    const defaultPrinter = printers.find((p: any) => p.isDefault) || printers[0];
    console.warn(`[Printer] Requested "${requestedName}" not found. Falling back to "${defaultPrinter?.name || 'System Default'}"`);
    return {
      deviceName: defaultPrinter ? defaultPrinter.name : undefined,
      actualNameUsed: defaultPrinter ? `${defaultPrinter.name} (Fallback)` : 'System Default'
    };
  } catch (e: any) {
    console.warn('[Printer] Failed to enumerate printers:', e.message);
    if (requestedName && requestedName.toLowerCase() !== 'default') {
      return { deviceName: requestedName, actualNameUsed: requestedName };
    }
    return { deviceName: undefined, actualNameUsed: 'System Default' };
  }
}

function executePrintWithFallback(
  printWindow: BrowserWindow,
  deviceName: string | undefined,
  widthMm?: number,
  heightMicrons?: number,
  pageSizeName?: string,
  landscape: boolean = false
): Promise<void> {
  return new Promise((resolve, reject) => {
    const primaryOptions: Electron.WebContentsPrintOptions = {
      silent: true,
      margins: { marginType: 'none' },
      landscape,
      printBackground: true,
    };

    if (deviceName) {
      primaryOptions.deviceName = deviceName;
    }
    if (pageSizeName) {
      (primaryOptions as any).pageSize = pageSizeName;
    } else if (widthMm && heightMicrons) {
      primaryOptions.pageSize = { width: widthMm * 1000, height: heightMicrons };
    }

    // Attempt 1: Print with primary options
    printWindow.webContents.print(primaryOptions, (success1, failureReason1) => {
      if (success1) {
        return resolve();
      }

      console.warn(`[Printer] Print attempt 1 failed (${failureReason1}). Retrying attempt 2 without custom pageSize...`);

      // Attempt 2: Retry without custom pageSize (lets driver use native roll/page size)
      const fallbackOptions2: Electron.WebContentsPrintOptions = {
        silent: true,
        margins: { marginType: 'none' },
        landscape,
        printBackground: true,
      };
      if (deviceName) {
        fallbackOptions2.deviceName = deviceName;
      }

      printWindow.webContents.print(fallbackOptions2, (success2, failureReason2) => {
        if (success2) {
          console.log('[Printer] Print attempt 2 (native driver page size) succeeded!');
          return resolve();
        }

        console.warn(`[Printer] Print attempt 2 failed (${failureReason2}). Retrying attempt 3 on System Default Printer...`);

        // Attempt 3: Retry without deviceName on OS Default Printer
        const fallbackOptions3: Electron.WebContentsPrintOptions = {
          silent: true,
          margins: { marginType: 'none' },
          landscape,
          printBackground: true,
        };

        printWindow.webContents.print(fallbackOptions3, (success3, failureReason3) => {
          if (success3) {
            console.log('[Printer] Print attempt 3 (OS Default Printer) succeeded!');
            return resolve();
          }

          const reason = failureReason3 || failureReason2 || failureReason1 || 'Spooler error';
          reject(new Error(`Could not print to printer "${deviceName || 'Default'}": ${reason}. Check printer power, USB cable, and paper.`));
        });
      });
    });
  });
}

function printReceiptUSB(deviceName: string, widthMm: number = 80): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const printWindow = new BrowserWindow({
      show: false,
      width: 400,
      height: 600,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      }
    });

    const resolved = await resolvePrinterDeviceName(printWindow, deviceName);
    console.log(`[Printer] Resolved receipt printer "${deviceName}" -> "${resolved.actualNameUsed}"`);

    if (app.isPackaged) {
      printWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/print-receipt' });
    } else {
      printWindow.loadURL(`http://localhost:5173/#/print-receipt`);
    }

    const timer = setTimeout(() => {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
        reject(new Error(`Printer Timeout: Printer "${resolved.actualNameUsed}" did not respond after 20s. Check power & USB cable.`));
      }
    }, 20000);

    ipcMain.once(`print-ready-${printWindow.webContents.id}`, async () => {
      const safetyMm = 15;
      const measuredMm = pendingReceiptHeightPx > 0
        ? Math.ceil((pendingReceiptHeightPx + 16) * (25.4 / 96)) + safetyMm
        : 200;
      const pageHeightMicrons = Math.max(80, measuredMm) * 1000;
      pendingReceiptHeightPx = 0;

      try {
        await executePrintWithFallback(printWindow, resolved.deviceName, widthMm, pageHeightMicrons);
        clearTimeout(timer);
        setTimeout(() => { if (!printWindow.isDestroyed()) printWindow.close(); }, 2000);
        resolve();
      } catch (err: any) {
        clearTimeout(timer);
        setTimeout(() => { if (!printWindow.isDestroyed()) printWindow.close(); }, 2000);
        reject(err);
      }
    });
  });
}
