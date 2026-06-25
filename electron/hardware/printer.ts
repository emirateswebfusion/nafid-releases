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
const ESC_CUT = Buffer.from([0x1D, 0x56, 0x00]); // Full Cut
const ESC_DRAWER_KICK = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]); // Open RJ11 Drawer

const ESC_POS_HEADER = Buffer.concat([ESC_INIT, ESC_FONT_A, ESC_DEFAULT_LINE_SPACING]);

// For ESC/POS network printers: strip non-ASCII chars that would print as garbage
function sanitizeForEscPos(text: string): string {
  return text.replace(/[\u{0080}-\u{FFFF}]/gu, (ch) => {
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
    return legacyRow ? JSON.parse(legacyRow.value) : { type: 'usb', ip: '192.168.1.100', port: 9100 };
  } catch {
    return { type: 'usb', ip: '192.168.1.100', port: 9100 };
  }
}

let currentBulkPrintItems: any[] = [];
let currentReceiptText: string = '';
let currentA4Html: string = '';

export function initPrinter() {
  ipcMain.handle('hardware:getBulkPrintItems', () => currentBulkPrintItems);

  ipcMain.handle('hardware:getPrinters', async (event) => {
    return await event.sender.getPrintersAsync();
  });

  ipcMain.handle('hardware:printReady', (event) => {
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
        await printA4USB(config.deviceName);
      } else {
        // No specific A4 printer configured — use default print dialog via popup
        return { success: false, useDefaultDialog: true };
      }

      return { success: true };
    } catch (error: any) {
      console.error('[Hardware] A4 Print Error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('hardware:printReceipt', async (event, { tenant_id, textData }: { tenant_id: string; textData: string }) => {
    console.log(`[Hardware] Received Print Request for tenant: ${tenant_id}`);
    const config = getPrinterConfig(tenant_id, 'receipt');
    
    try {
      const receiptText = textData + '\n\n\n\n\n';
      
      if (config.type === 'network') {
        // ESC/POS network printers only understand ASCII-based code pages
        const asciiText = sanitizeForEscPos(receiptText);
        const textBuffer = Buffer.from(asciiText, 'ascii');
        const finalBuffer = Buffer.concat([ESC_POS_HEADER, textBuffer, ESC_CUT]);
        await sendToNetworkPrinter(config.ip, config.port || 9100, finalBuffer);
      } else if (config.type === 'usb' && config.deviceName) {
        currentReceiptText = receiptText;
        const widthMm = (config.receiptWidthCm || 5.8) * 10;
        await printReceiptUSB(config.deviceName, widthMm);
      } else if (config.type === 'usb') {
        throw new Error('USB printing requested but deviceName not configured');
      } else {
        throw new Error(`Unknown printer type: ${config.type}`);
      }

      return { success: true };
    } catch (error: any) {
      console.error('[Hardware] Print Error:', error);
      return { success: false, error: error.message };
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
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('hardware:printBarcode', async (event, { tenant_id, barcode, price, name, quantity = 1, sp, spType }: { tenant_id: string; barcode: string; price?: number; name?: string; quantity?: number; sp?: number; spType?: string }) => {
    console.log(`[Hardware] Printing Barcode: ${barcode} (Qty: ${quantity}) for tenant: ${tenant_id}`);
    const config = getPrinterConfig(tenant_id, 'barcode');
    try {
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
        await printBarcodeUSB(barcode, config.deviceName, price, name, quantity, config.labelWidthMm, config.labelHeightMm, config.labelColumns, sp, spType);
      } else if (config.type === 'usb') {
        throw new Error('USB printing requested but deviceName not configured');
      } else {
        console.warn(`[Hardware] Unknown printer type: ${config.type}`);
        throw new Error(`Unknown printer type: ${config.type}`);
      }
      return { success: true };
    } catch (error: any) {
      console.error('[Hardware] Barcode Print Error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('hardware:printBulkBarcodes', async (event, { tenant_id, items }: { tenant_id: string; items: any[] }) => {
    console.log(`[Hardware] Printing Bulk Barcodes (${items.length} items) for tenant: ${tenant_id}`);
    const config = getPrinterConfig(tenant_id, 'barcode');
    try {
      if (config.type === 'network') {
        const buffers = items.flatMap(item => {
          const barcodeData = Buffer.from(item.barcode, 'ascii');
          const gsBarcode = Buffer.from([0x1D, 0x6B, 0x49, barcodeData.length, ...barcodeData]);
          const singleLabelBuffer = Buffer.concat([ESC_INIT, gsBarcode, Buffer.from('\n\n\n'), ESC_CUT]);
          return Array(item.quantity).fill(singleLabelBuffer);
        });
        const finalBuffer = Buffer.concat(buffers);
        await sendToNetworkPrinter(config.ip, config.port || 9100, finalBuffer);
      } else if (config.type === 'usb' && config.deviceName) {
        await printBulkBarcodeUSB(items, config.deviceName, config.labelWidthMm, config.labelHeightMm, config.labelColumns);
      } else if (config.type === 'usb') {
        throw new Error('USB printing requested but deviceName not configured');
      } else {
        throw new Error(`Unknown printer type: ${config.type}`);
      }
      return { success: true };
    } catch (error: any) {
      console.error('[Hardware] Bulk Barcode Print Error:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[Hardware] Printer service initialized');
}

function sendToNetworkPrinter(host: string, port: number, data: Buffer): Promise<void> {
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

function printBarcodeUSB(barcode: string, deviceName: string, price?: number, name?: string, quantity: number = 1, widthMm?: number, heightMm?: number, columns?: number, sp?: number, spType?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const printWindow = new BrowserWindow({
      show: false,
      width: 400,
      height: 400,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      }
    });

    if (app.isPackaged) {
      printWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: `/print-barcode?barcode=${barcode}${price !== undefined ? `&price=${price}` : ''}${name ? `&name=${encodeURIComponent(name)}` : ''}&quantity=${quantity}&columns=${columns || 1}${sp !== undefined ? `&sp=${sp}` : ''}${spType ? `&spType=${spType}` : ''}` });
    } else {
      printWindow.loadURL(`http://localhost:5173/#/print-barcode?barcode=${barcode}${price !== undefined ? `&price=${price}` : ''}${name ? `&name=${encodeURIComponent(name)}` : ''}&quantity=${quantity}&columns=${columns || 1}${sp !== undefined ? `&sp=${sp}` : ''}${spType ? `&spType=${spType}` : ''}`);
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
        pageSize: { width: (widthMm || 50) * 1000, height: (heightMm || 25) * 1000 }
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

function printBulkBarcodeUSB(items: any[], deviceName: string, widthMm?: number, heightMm?: number, columns?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    currentBulkPrintItems = items;
    const printWindow = new BrowserWindow({
      show: false,
      width: 400,
      height: 400,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      }
    });

    if (app.isPackaged) {
      printWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: `/print-bulk-barcode?columns=${columns || 1}` });
    } else {
      printWindow.loadURL(`http://localhost:5173/#/print-bulk-barcode?columns=${columns || 1}`);
    }

    const timer = setTimeout(() => {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
        reject(new Error('USB bulk print timeout'));
      }
    }, 60000); // give it more time for bulk

    ipcMain.once(`print-ready-${printWindow.webContents.id}`, () => {
      printWindow.webContents.print({
        silent: true,
        deviceName: deviceName,
        margins: { marginType: 'none' },
        pageSize: { width: (widthMm || 50) * 1000, height: (heightMm || 25) * 1000 }
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

function printA4USB(deviceName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const printWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
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
        pageSize: 'A4'
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
      printWindow.webContents.print({
        silent: true,
        deviceName: deviceName,
        margins: { marginType: 'none' },
        pageSize: { width: widthMm * 1000, height: 300000 }
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
