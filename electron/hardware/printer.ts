import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { getDb } from '../db/localDb';
import * as printerSql from '../db/statements/printer.js';
import { buildReceiptHtml } from './receiptHtml.js';
import { getSharedA4Html } from '../whatsapp/sharedPrintHtml.js';
import { ESC_INIT, ESC_BOLD_ON, ESC_BOLD_OFF, ESC_DENSITY, ESC_CUT, ESC_DRAWER_KICK, ESC_POS_HEADER, sanitizeForEscPos, sendToNetworkPrinter } from './escPos.js';

function getPrinterConfig(tenantId: string, type: 'barcode' | 'receipt' = 'barcode') {
  try {
    const db = getDb();
    const key = type === 'receipt' ? 'receipt_printer_config' : 'barcode_printer_config';
    const tid = tenantId || 'global';

    let row: Record<string, unknown> = (printerSql.findSettingsByKey(db).get(tid, key) as Record<string, unknown>);
    if (!row && tid !== 'global') {
      row = (printerSql.findSettingsByKeyValue(db).get(key) as Record<string, unknown>);
    }
    if (!row) {
      row = (printerSql.findOneSettingByKey(db).get(key) as Record<string, unknown>);
    }
    if (row) {
      try { return JSON.parse((row.value as string)); } catch { /* ignore */ }
    }
    
    // Fallback to legacy printer_config
    let legacyRow: Record<string, unknown> = (printerSql.findSettingsByKeyPrinterConfig(db).get(tid) as Record<string, unknown>);
    if (!legacyRow && tid !== 'global') {
      legacyRow = (printerSql.findSettingsByKeyPrinterConfig2(db).get() as Record<string, unknown>);
    }
    if (!legacyRow) {
      legacyRow = (printerSql.findOneSettingByKeyPrinterConfig(db).get() as Record<string, unknown>);
    }
    if (legacyRow) {
      try {
        const parsed = JSON.parse((legacyRow.value as string));
        if (parsed && parsed.ip === '192.168.1.100') return { type: 'none' };
        return parsed;
      } catch { /* ignore */ }
    }
    return { type: 'none' };
  } catch {
    return { type: 'none' };
  }
}

let currentBulkPrintItems: { barcode: string; quantity: number; name?: string; price?: number }[] = [];
let currentReceiptText: string = '';
let currentA4Html: string = '';
let pendingReceiptHeightPx: number = 0; // measured by renderer before printReady; used by printReceiptUSB

function getPrintFormatConfig(tenantId: string) {
  try {
    const db = getDb();
    const row: Record<string, unknown> = (printerSql.findSettingsByKeyPrintFormat(db).get(tenantId || 'global') as Record<string, unknown>);
    if (row) {
      try {
        const parsed = JSON.parse((row.value as string));
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
    const row: Record<string, unknown> = (printerSql.findSettingsByKeyLabelCodeType(db).get(tenantId || 'global', 'label_code_type') as Record<string, unknown>);
    if (row) {
      let val: unknown = (row.value as Record<string, unknown>);
      try {
        const parsed = JSON.parse((row.value as string));
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
    lastPrintersFetchTime = 0;
    const printers = await event.sender.getPrintersAsync();
    cachedPrinters = printers;
    lastPrintersFetchTime = Date.now();
    return printers;
  });

  // Pre-warm printer list in background shortly after startup
  setTimeout(() => {
    getSystemPrinters().catch(() => {});
  }, 2000);

  ipcMain.handle('hardware:printReady', (event, contentHeightPx?: number) => {
    if (contentHeightPx && contentHeightPx > 0) {
      pendingReceiptHeightPx = contentHeightPx;
    }
    ipcMain.emit(`print-ready-${event.sender.id}`);
    return { success: true };
  });

  ipcMain.handle('hardware:getReceiptText', () => currentReceiptText);

  ipcMain.handle('hardware:getA4Html', () => {
    if (currentA4Html) return currentA4Html;
    try {
      return getSharedA4Html() || '';
    } catch {
      return '';
    }
  });

  ipcMain.handle('hardware:printA4Html', async (event, { tenant_id, htmlContent }: { tenant_id: string; htmlContent: string }) => {
    try {
      const db = getDb();
      const tid = tenant_id || 'global';
      let row: Record<string, unknown> = (printerSql.findSettingsByKeyA4PrinterConfig(db).get(tid) as Record<string, unknown>);
      if (!row && tid !== 'global') {
        row = (printerSql.findSettingsByKeyA4PrinterConfig2(db).get() as Record<string, unknown>);
      }
      if (!row) {
        row = (printerSql.findOneSettingByKeyA4PrinterConfig(db).get() as Record<string, unknown>);
      }
      let config = { deviceName: '' };
      if (row) {
        try {
          config = JSON.parse((row.value as string));
        } catch {
          config = { deviceName: (row.value as string) || ('' as string) };
        }
      }

      currentA4Html = htmlContent;
      const isHalfA4 = htmlContent.includes('content="half-a4"') || /@page\s*\{[^}]*210mm\s+148/i.test(htmlContent);
      const isA5 = !isHalfA4 && (htmlContent.includes('content="A5"') || /@page\s*\{[^}]*148mm\s+210/i.test(htmlContent));
      const isLandscape = htmlContent.includes('content="landscape"') || /@page\s*\{[^}]*landscape/i.test(htmlContent) || isHalfA4;
      
      // For Half-A4 (cut A4 paper), feed width is 210mm (standard A4 portrait feed width), not rotated
      const targetPageSize = isHalfA4 ? 'A4' : (isA5 ? 'A5' : 'A4');
      const targetLandscape = isHalfA4 ? false : isLandscape;

      await printA4USB(config.deviceName || '', targetPageSize, targetLandscape);

      return { success: true };
    } catch (error) {
      console.error('[Hardware] A4 Print Error:', error);
      return { success: false, error: (error as Error).message || 'Print failed' };
    }
  });

  ipcMain.handle('hardware:exportA4Pdf', async (event, { tenant_id: _tenant_id, htmlContent, defaultFilename, displayHeaderFooter, headerTemplate, footerTemplate }: { tenant_id: string; htmlContent: string; defaultFilename?: string; displayHeaderFooter?: boolean; headerTemplate?: string; footerTemplate?: string }) => {
    try {
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
        }
      });

      if (app.isPackaged) {
        printWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/print-a4' });
      } else {
        // Dev server URL — set ELECTRON_DEV_SERVER_URL in .env
        printWindow.loadURL(`${process.env.ELECTRON_DEV_SERVER_URL || ''}/#/print-a4`);
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
            const pdfOpts: Electron.PrintToPDFOptions & { margins: { marginType: string } } = {
              printBackground: true,
              pageSize: 'A4',
              landscape: false,
              preferCSSPageSize: false,
              margins: { marginType: 'none' },
            };
            if (displayHeaderFooter) {
              pdfOpts.displayHeaderFooter = true;
              pdfOpts.headerTemplate = headerTemplate || '<div></div>';
              pdfOpts.footerTemplate = footerTemplate || `
                <div style="font-size: 8px; width: 100%; text-align: right; padding-right: 12mm; color: #64748b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                  Page <span class="pageNumber"></span> of <span class="totalPages"></span>
                </div>`;
              pdfOpts.margins = {
                marginType: 'custom',
                top: 0.3,
                bottom: 0.45,
                left: 0.3,
                right: 0.3,
              };
            }
            const data = await printWindow.webContents.printToPDF(pdfOpts);
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
    } catch (error) {
      console.error('[Hardware] A4 PDF Export Error:', error);
      return { success: false, error: (error as Error).message || 'PDF export failed' };
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
      await printReceiptUSB(reqName, widthMm, tenant_id);

      return { success: true };
    } catch (error) {
      console.error('[Hardware] Print Error:', error);
      return { success: false, error: (error as Error).message || 'Print failed' };
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
      } else {
        return { success: true, skipped: true };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message || 'Drawer open failed' };
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
    } catch (error) {
      console.error('[Hardware] Barcode Print Error:', error);
      return { success: false, error: (error as Error).message || 'Print failed' };
    }
  });

  ipcMain.handle('hardware:printBulkBarcodes', async (event, { tenant_id, items }: { tenant_id: string; items: { barcode: string; quantity: number; name?: string; price?: number }[] }) => {
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
          } catch (error) {
            return { success: false, printed, error: `Print stopped at ${item.barcode}: ${(error as Error)?.message || 'Printer connection timed out'}` };
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
    } catch (error) {
      console.error('[Hardware] Bulk Barcode Print Error:', error);
      return { success: false, error: (error as Error).message || 'Print failed' };
    }
  });

  console.log('[Hardware] Printer service initialized');
}

function pendingPrint(setup: (resolve: () => void, reject: (reason: unknown) => void) => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    void setup(resolve, reject).catch(() => { /* Preserve pending outer promise on setup failure. */ });
  });
}
function printBarcodeUSB(barcode: string, deviceName: string, price?: number, name?: string, quantity: number = 1, widthMm?: number, heightMm?: number, columns?: number, sp?: number, spType?: string, codeType?: string): Promise<void> {
  return pendingPrint(async (resolve, reject) => {
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
      // Dev server URL — set ELECTRON_DEV_SERVER_URL in .env
      printWindow.loadURL(`${process.env.ELECTRON_DEV_SERVER_URL || ''}/#/print-barcode?barcode=${barcode}${price !== undefined ? `&price=${price}` : ''}${name ? `&name=${encodeURIComponent(name)}` : ''}&quantity=${quantity}&columns=${columns || 1}${sp !== undefined ? `&sp=${sp}` : ''}${spType ? `&spType=${spType}` : ''}${sizeParams}${codeTypeParam}`);
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
      } catch (err) {
        clearTimeout(timer);
        setTimeout(() => { if (!printWindow.isDestroyed()) printWindow.close(); }, 2000);
        reject(err);
      }
    });
  });
}
function printBulkBarcodeUSB(items: { barcode: string; quantity: number; name?: string; price?: number }[], deviceName: string, widthMm?: number, heightMm?: number, columns?: number, codeType?: string): Promise<void> {
  return pendingPrint(async (resolve, reject) => {
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
      // Dev server URL — set ELECTRON_DEV_SERVER_URL in .env
      printWindow.loadURL(`${process.env.ELECTRON_DEV_SERVER_URL || ''}/#/print-bulk-barcode?columns=${columns || 1}${sizeParams}&codeType=${codeType || 'barcode'}`);
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
      } catch (err) {
        clearTimeout(timer);
        clearTimeout(watchdog);
        setTimeout(() => { if (!printWindow.isDestroyed()) printWindow.close(); }, 2000);
        reject(err);
      }
    });
  });
}

let cachedPrinters: Electron.PrinterInfo[] = [];
let lastPrintersFetchTime = 0;
const PRINTER_CACHE_TTL_MS = 60000;

async function getSystemPrinters(win?: BrowserWindow): Promise<Electron.PrinterInfo[]> {
  const now = Date.now();
  if (cachedPrinters.length > 0 && now - lastPrintersFetchTime < PRINTER_CACHE_TTL_MS) {
    return cachedPrinters;
  }
  try {
    const targetWin = (win && !win.isDestroyed()) ? win : BrowserWindow.getAllWindows()[0];
    if (targetWin && !targetWin.isDestroyed()) {
      cachedPrinters = await targetWin.webContents.getPrintersAsync();
      lastPrintersFetchTime = now;
      return cachedPrinters;
    }
  } catch (err) {
    console.warn('[Printer] Could not fetch system printers:', (err as Error).message);
  }
  return cachedPrinters;
}

async function resolvePrinterDeviceName(win: BrowserWindow, requestedName?: string): Promise<{ deviceName: string | undefined; actualNameUsed: string }> {
  // If no name requested or 'default', let Chromium use the OS system default printer automatically
  if (!requestedName || requestedName.trim() === '' || requestedName.toLowerCase() === 'default') {
    return { deviceName: undefined, actualNameUsed: 'System Default' };
  }

  const cleanReq = requestedName.trim().toLowerCase();

  // Check cached printers first to avoid blocking on Windows spooler query on every print
  let printers = cachedPrinters;
  if (printers.length === 0 || Date.now() - lastPrintersFetchTime >= PRINTER_CACHE_TTL_MS) {
    printers = await getSystemPrinters(win);
  }

  if (!printers || printers.length === 0) {
    return { deviceName: requestedName, actualNameUsed: requestedName };
  }

  // 1. Exact match (case-insensitive)
  const exact = printers.find((p: Electron.PrinterInfo) => p.name.toLowerCase() === cleanReq || (p.displayName && String(p.displayName).toLowerCase() === cleanReq));
  if (exact) return { deviceName: exact.name, actualNameUsed: exact.name };

  // 2. Partial match (e.g. "POS80" matches "POSPrinter POS80")
  const partial = printers.find((p: Electron.PrinterInfo) => p.name.toLowerCase().includes(cleanReq) || cleanReq.includes(p.name.toLowerCase()));
  if (partial) {
    console.log(`[Printer] Resolved requested "${requestedName}" -> "${partial.name}" via partial match`);
    return { deviceName: partial.name, actualNameUsed: partial.name };
  }

  // 3. Thermal printer auto-detection if requested name failed
  const thermalKeywords = ['pos', 'rp', 'thermal', 'receipt', '80', '58', 'epson', 'xprinter', 'tspl', 'zjiang', 'sewoo'];
  const thermalPrinter = printers.find((p: Electron.PrinterInfo) => thermalKeywords.some(k => p.name.toLowerCase().includes(k)));
  if (thermalPrinter) {
    console.warn(`[Printer] Requested "${requestedName}" not found. Auto-detected thermal printer: "${thermalPrinter.name}"`);
    return { deviceName: thermalPrinter.name, actualNameUsed: `${thermalPrinter.name} (Auto-detected)` };
  }

  // 4. Default to requestedName directly without overriding
  return { deviceName: requestedName, actualNameUsed: requestedName };
}

function printA4USB(deviceName: string, pageSize: string = 'A4', landscape: boolean = false): Promise<void> {
  return pendingPrint(async (resolve, reject) => {
    const isA5 = pageSize === 'A5';
    const winWidth = isA5 ? (landscape ? 794 : 560) : (landscape ? 1123 : 794);
    const winHeight = isA5 ? (landscape ? 560 : 794) : (landscape ? 794 : 1123);

    const printWindow = new BrowserWindow({
      show: false,
      width: winWidth,
      height: winHeight,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      }
    });

    const resolved = await resolvePrinterDeviceName(printWindow, deviceName);

    const timer = setTimeout(() => {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
        reject(new Error('A4 print timeout'));
      }
    }, 20000);

    let printed = false;
    const triggerPrint = async () => {
      if (printed) return;
      printed = true;
      try {
        await executePrintWithFallback(printWindow, resolved.deviceName, undefined, undefined, pageSize, landscape);
        clearTimeout(timer);
        setTimeout(() => { if (!printWindow.isDestroyed()) printWindow.close(); }, 1500);
        resolve();
      } catch (err) {
        clearTimeout(timer);
        setTimeout(() => { if (!printWindow.isDestroyed()) printWindow.close(); }, 1500);
        reject(err);
      }
    };

    ipcMain.once(`print-ready-${printWindow.webContents.id}`, triggerPrint);

    printWindow.webContents.once('did-finish-load', () => {
      setImmediate(triggerPrint);
    });

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(currentA4Html)}`);
  });
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
    if (!printWindow || printWindow.isDestroyed()) {
      return reject(new Error('Print window was destroyed before printing could start'));
    }

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
      (primaryOptions as { pageSize?: string }).pageSize = pageSizeName;
    } else if (widthMm && heightMicrons) {
      primaryOptions.pageSize = { width: widthMm * 1000, height: heightMicrons };
    }

    // Attempt 1: Print with primary options
    printWindow.webContents.print(primaryOptions, (success1, failureReason1) => {
      if (success1) {
        return resolve();
      }

      if (printWindow.isDestroyed()) {
        return reject(new Error(`Print attempt 1 failed: ${failureReason1}`));
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

        if (printWindow.isDestroyed()) {
          return reject(new Error(`Print attempt 2 failed: ${failureReason2}`));
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

function printReceiptUSB(deviceName: string, widthMm: number = 80, tenantId: string = 'global'): Promise<void> {
  return pendingPrint(async (resolve, reject) => {
    const printFmt = getPrintFormatConfig(tenantId);
    const receiptConfig = getPrinterConfig(tenantId, 'receipt');
    const leftMarginOffsetMm = Number(receiptConfig?.leftMarginOffsetMm ?? printFmt?.leftMarginOffsetMm ?? 0) || 0;
    const fontKey = printFmt?.receiptFont || 'courier';
    const fontMap: Record<string, string> = {
      courier: 'Consolas, "Courier New", monospace',
      consolas: 'Consolas, monospace',
      lucida: '"Lucida Console", monospace',
      'lucida-sans': '"Lucida Sans Typewriter", "Lucida Console", monospace',
      monospace: 'monospace',
    };
    const chosenFont = fontMap[fontKey] || 'Consolas, monospace';

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
    console.log(`[Printer] Resolved receipt printer "${deviceName}" -> "${resolved.actualNameUsed}" (leftOffset: ${leftMarginOffsetMm}mm)`);

    const timer = setTimeout(() => {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
        reject(new Error(`Printer Timeout: Printer "${resolved.actualNameUsed}" did not respond after 20s. Check power & USB cable.`));
      }
    }, 20000);

    let printed = false;
    const triggerPrint = async (contentHeightPx?: number) => {
      if (printed) return;
      printed = true;
      const safetyMm = 15;
      const heightToUse = (contentHeightPx && contentHeightPx > 0) ? contentHeightPx : pendingReceiptHeightPx;
      const measuredMm = heightToUse > 0
        ? Math.ceil((heightToUse + 16) * (25.4 / 96)) + safetyMm
        : 200;
      const pageHeightMicrons = Math.max(80, measuredMm) * 1000;
      pendingReceiptHeightPx = 0;

      try {
        await executePrintWithFallback(printWindow, resolved.deviceName, widthMm, pageHeightMicrons);
        clearTimeout(timer);
        setTimeout(() => { if (!printWindow.isDestroyed()) printWindow.close(); }, 1500);
        resolve();
      } catch (err) {
        clearTimeout(timer);
        setTimeout(() => { if (!printWindow.isDestroyed()) printWindow.close(); }, 1500);
        reject(err);
      }
    };

    ipcMain.once(`print-ready-${printWindow.webContents.id}`, () => triggerPrint());

    printWindow.webContents.once('did-finish-load', () => {
      setImmediate(() => triggerPrint());
    });

    try {
      const receiptHtml = await buildReceiptHtml(currentReceiptText, widthMm, chosenFont, leftMarginOffsetMm);
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHtml)}`);
    } catch (err) {
      clearTimeout(timer);
      if (!printWindow.isDestroyed()) printWindow.close();
      reject(err);
    }
  });
}
