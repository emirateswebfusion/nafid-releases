import { ipcMain } from 'electron';
import net from 'net';
import { getDb } from '../db/localDb';

// Generic ESC/POS Hex Commands
const ESC_INIT = Buffer.from([0x1B, 0x40]); // Initialize Printer
const ESC_CUT = Buffer.from([0x1D, 0x56, 0x00]); // Full Cut
const ESC_DRAWER_KICK = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]); // Open RJ11 Drawer

function getPrinterConfig(tenantId: string) {
  try {
    const db = getDb();
    const row: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'printer_config'").get(tenantId || 'global');
    return row ? JSON.parse(row.value) : { type: 'network', ip: '192.168.1.100', port: 9100 };
  } catch {
    return { type: 'network', ip: '192.168.1.100', port: 9100 };
  }
}

export function initPrinter() {
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
        console.warn('[Hardware] USB printing not yet implemented');
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
