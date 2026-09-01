import { app, BrowserWindow, ipcMain } from 'electron';
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
    const row: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = ?").get(tenantId || 'global', key);
    if (row) return JSON.parse(row.value);
    
    // Fallback to legacy printer_config
    const legacyRow: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'printer_config'").get(tenantId || 'global');
    return legacyRow ? JSON.parse(legacyRow.value) : { type: 'none' };
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
    const row: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'print_format'").get(tenantId || 'global', 'print_format');
    if (row) return JSON.parse(row.value);
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
      const row: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'a4_printer_config'").get(tenant_id || 'global', 'a4_printer_config');
      const config = row ? JSON.parse(row.value) : { deviceName: '' };

      if (config.deviceName) {
        currentA4Html = htmlContent;
        const isA5 = htmlContent.includes('A5 landscape') || htmlContent.includes('size: A5');
        await printA4USB(config.deviceName, isA5 ? 'A5' : 'A4');
      } else {
        // No specific A4 printer configured — use default print dialog via popup
        return { success: false, useDefaultDialog: true };
      }

      return { success: true };
    } catch (error: any) {
      console.error('[Hardware] A4 Print Error:', error);
      return { success: false, error: 'Print failed' };
    }
  });

  ipcMain.handle('hardware:printReceipt', async (event, { tenant_id, textData }: { tenant_id: string; textData: string }) => {
    console.log(`[Hardware] Received Print Request for tenant: ${tenant_id}`);
    const config = getPrinterConfig(tenant_id, 'receipt');
    const printFmt = getPrintFormatConfig(tenant_id);
    
    // Unified width: prefer print_format.width (mm) over receiptWidthCm (cm)
    // This ensures the physical page size always matches the selected Bill Format
    const widthMm = printFmt?.width
      ? Number(printFmt.width)
      : (config.receiptWidthCm || 5.8) * 10;

    try {
      // Gracefully skip if no printer configured
      if (config.type === 'none' || !config.type) {
        console.log('[Hardware] No receipt printer configured — skipping print');
        return { success: true, skipped: true };
      }

      const receiptText = textData + '\n\n\n\n\n';
      
      if (config.type === 'network') {
        // ESC/POS network printers only understand ASCII-based code pages
        const asciiText = sanitizeForEscPos(receiptText);
        const textBuffer = Buffer.from(asciiText, 'ascii');
        // Apply max print density + bold/emphasized mode for darker text visibility
        const finalBuffer = Buffer.concat([ESC_POS_HEADER, ESC_DENSITY, ESC_BOLD_ON, textBuffer, ESC_BOLD_OFF, ESC_CUT]);
        await sendToNetworkPrinter(config.ip, config.port || 9100, finalBuffer);
      } else if (config.type === 'usb' && config.deviceName) {
        currentReceiptText = receiptText;
        await printReceiptUSB(config.deviceName, widthMm);
      } else if (config.type === 'usb') {
        throw new Error('USB printing requested but deviceName not configured');
      } else {
        throw new Error(`Unknown printer type: ${config.type}`);
      }

      return { success: true };
    } catch (error: any) {
      console.error('[Hardware] Print Error:', error);
      return { success: false, error: 'Print failed' };
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
      return { success: false, error: 'Print failed' };
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
  return new Promise((resolve, reject) => {
    // Size the print window to the physical label size (CSS px @96dpi) so the
    // label content renders 1:1 on the label instead of being shrink-to-fitted
    // from a fixed 400px viewport (which made barcode text unreadably small).
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

    ipcMain.once(`print-ready-${printWindow.webContents.id}`, () => {
      printWindow.webContents.print({
        silent: true,
        deviceName: deviceName,
        margins: { marginType: 'none' },
        // Convert mm to microns (1 mm = 1000 microns). Default to 50x25mm (approx 2"x1")
        pageSize: { width: labelW * 1000, height: labelH * 1000 }
      }, (success, failureReason) => {
        clearTimeout(timer);
        
        // Delay window close to allow PDF software spoolers to finish writing to disk
        setTimeout(() => {
          if (!printWindow.isDestroyed()) printWindow.close();
        }, 3000);
        
        if (success) {
          resolve();
        } else {
          reject(new Error(`Print failed: ${failureReason}`));
        }
      });
    });
  });
}

function printBulkBarcodeUSB(items: any[], deviceName: string, widthMm?: number, heightMm?: number, columns?: number, codeType?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    currentBulkPrintItems = items;
    // Size the print window to the physical label size (CSS px @96dpi) so the
    // label content renders 1:1 on the label instead of being shrink-to-fitted
    // from a fixed 400px viewport (which made barcode text unreadably small).
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

    const sizeParams = `&labelWidthMm=${labelW}&labelHeightMm=${labelH}`;
    if (app.isPackaged) {
      printWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: `/print-bulk-barcode?columns=${columns || 1}${sizeParams}&codeType=${codeType || 'barcode'}` });
    } else {
      printWindow.loadURL(`http://localhost:5173/#/print-bulk-barcode?columns=${columns || 1}${sizeParams}&codeType=${codeType || 'barcode'}`);
    }

    const timer = setTimeout(() => {
      // Paper-out or slow spooler: keep the window alive so the OS print
      // queue keeps the job; the print callback resolves once it completes.
      console.warn('[Hardware] USB bulk print still spooling after 60s — keeping job alive');
    }, 60000);

    const watchdog = setTimeout(() => {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
        reject(new Error('USB bulk print timeout'));
      }
    }, 300000); // hard cap 5 min; print callback normally resolves long before

    ipcMain.once(`print-ready-${printWindow.webContents.id}`, () => {
      printWindow.webContents.print({
        silent: true,
        deviceName: deviceName,
        margins: { marginType: 'none' },
        pageSize: { width: labelW * 1000, height: labelH * 1000 }
      }, (success, failureReason) => {
        clearTimeout(timer);
        clearTimeout(watchdog);
        setTimeout(() => {
          if (!printWindow.isDestroyed()) printWindow.close();
        }, 3000);
        
        if (success) {
          resolve();
        } else {
          reject(new Error(`Print failed: ${failureReason}`));
        }
      });
    });
  });
}

function printA4USB(deviceName: string, pageSize: string = 'A4'): Promise<void> {
  return new Promise((resolve, reject) => {
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

    const timer = setTimeout(() => {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
        reject(new Error('A4 print timeout'));
      }
    }, 30000);

    ipcMain.once(`print-ready-${printWindow.webContents.id}`, () => {
      printWindow.webContents.print({
        silent: true,
        deviceName: deviceName,
        margins: { marginType: 'default' },
        pageSize: pageSize as any
      }, (success, failureReason) => {
        clearTimeout(timer);
        setTimeout(() => {
          if (!printWindow.isDestroyed()) printWindow.close();
        }, 3000);

        if (success) {
          resolve();
        } else {
          reject(new Error(`A4 Print failed: ${failureReason}`));
        }
      });
    });
  });
}

function printReceiptUSB(deviceName: string, widthMm: number = 80): Promise<void> {
  return new Promise((resolve, reject) => {
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

    // Pass data via global variable to avoid URL length limits
    if (app.isPackaged) {
      printWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/print-receipt' });
    } else {
      printWindow.loadURL(`http://localhost:5173/#/print-receipt`);
    }

    const timer = setTimeout(() => {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
        reject(new Error('USB print timeout'));
      }
    }, 20000);

    ipcMain.once(`print-ready-${printWindow.webContents.id}`, () => {
      // Convert measured content height (CSS px at 96dpi) to physical microns.
      // 1 CSS px = 1/96 inch; 1 inch = 25400 microns.
      // Add 8px top + 8px bottom margin (= 16px) then convert, with a 15mm safety buffer.
      const safetyMm = 15;
      const measuredMm = pendingReceiptHeightPx > 0
        ? Math.ceil((pendingReceiptHeightPx + 16) * (25.4 / 96)) + safetyMm
        : 200;  // fallback: 200mm if height was not measured
      const pageHeightMicrons = Math.max(80, measuredMm) * 1000;
      pendingReceiptHeightPx = 0; // reset for next print

      printWindow.webContents.print({
        silent: true,
        deviceName: deviceName,
        margins: { marginType: 'none' },
        pageSize: { width: widthMm * 1000, height: pageHeightMicrons }
      }, (success, failureReason) => {
        clearTimeout(timer);
        setTimeout(() => {
          if (!printWindow.isDestroyed()) printWindow.close();
        }, 3000);
        
        if (success) {
          resolve();
        } else {
          reject(new Error(`Print failed: ${failureReason}`));
        }
      });
    });
  });
}
