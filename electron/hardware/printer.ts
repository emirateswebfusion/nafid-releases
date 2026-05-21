import { app, BrowserWindow, ipcMain } from 'electron';
import net from 'net';
import path from 'path';
import { getDb } from '../db/localDb';

// Generic ESC/POS Hex Commands
const ESC_INIT = Buffer.from([0x1B, 0x40]); // Initialize Printer
const ESC_CUT = Buffer.from([0x1D, 0x56, 0x00]); // Full Cut
const ESC_DRAWER_KICK = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]); // Open RJ11 Drawer

function getPrinterConfig(tenantId: string) {
  try {
    const db = getDb();
    const row: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'printer_config'").get(tenantId || 'global');
    return row ? JSON.parse(row.value) : { type: 'usb', ip: '192.168.1.100', port: 9100 };
  } catch {
    return { type: 'usb', ip: '192.168.1.100', port: 9100 };
  }
}

export function initPrinter() {
  ipcMain.handle('hardware:getPrinters', async (event) => {
    return await event.sender.getPrintersAsync();
  });

  ipcMain.handle('hardware:printReady', (event) => {
    ipcMain.emit(`print-ready-${event.sender.id}`);
    return { success: true };
  });


  ipcMain.handle('hardware:printReceipt', async (event, { tenant_id, textData }: { tenant_id: string; textData: string }) => {
    console.log(`[Hardware] Received Print Request for tenant: ${tenant_id}`);
    const config = getPrinterConfig(tenant_id);
    
    try {
      // Construct raw buffer
      const textBuffer = Buffer.from(textData + '\n\n\n\n\n', 'utf8');
      const finalBuffer = Buffer.concat([ESC_INIT, textBuffer, ESC_CUT]);
      
      if (config.type === 'network') {
        await sendToNetworkPrinter(config.ip, config.port || 9100, finalBuffer);
      } else {
        throw new Error('USB receipt printing is not yet implemented');
      }

      return { success: true };
    } catch (error: any) {
      console.error('[Hardware] Print Error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('hardware:openCashDrawer', async (event, tenant_id: string) => {
    console.log(`[Hardware] Kick RJ11 Cash Drawer for tenant: ${tenant_id}`);
    const config = getPrinterConfig(tenant_id);
    try {
      if (config.type === 'network') {
        await sendToNetworkPrinter(config.ip, config.port || 9100, ESC_DRAWER_KICK);
      } else {
        throw new Error('USB cash drawer kick is not yet implemented');
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('hardware:printBarcode', async (event, { tenant_id, barcode }: { tenant_id: string; barcode: string }) => {
    console.log(`[Hardware] Printing Barcode: ${barcode} for tenant: ${tenant_id}`);
    const config = getPrinterConfig(tenant_id);
    try {
      // Basic ESC/POS Barcode Command (CODE128)
      const barcodeData = Buffer.from(barcode, 'ascii');
      const gsBarcode = Buffer.from([
        0x1D, 0x6B, 0x49, barcodeData.length, ...barcodeData
      ]);
      const finalBuffer = Buffer.concat([ESC_INIT, gsBarcode, Buffer.from('\n\n\n'), ESC_CUT]);
      
      if (config.type === 'network') {
        await sendToNetworkPrinter(config.ip, config.port || 9100, finalBuffer);
      } else if (config.type === 'usb' && config.deviceName) {
        await printBarcodeUSB(barcode, config.deviceName);
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

function printBarcodeUSB(barcode: string, deviceName: string): Promise<void> {
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
      printWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: `/print-barcode?barcode=${barcode}` });
    } else {
      printWindow.loadURL(`http://localhost:5173/#/print-barcode?barcode=${barcode}`);
    }

    const timer = setTimeout(() => {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
        reject(new Error('USB print timeout'));
      }
    }, 10000);

    ipcMain.once(`print-ready-${printWindow.webContents.id}`, () => {
      printWindow.webContents.print({
        silent: true,
        deviceName: deviceName,
        margins: { marginType: 'none' },
        // Use 2"x1" typical barcode label size in microns (1 inch = 25.4 mm = 25400 microns)
        pageSize: { width: 50800, height: 25400 }
      }, (success, failureReason) => {
        clearTimeout(timer);
        if (!printWindow.isDestroyed()) printWindow.close();
        
        if (success) {
          resolve();
        } else {
          reject(new Error(`Print failed: ${failureReason}`));
        }
      });
    });
  });
}
