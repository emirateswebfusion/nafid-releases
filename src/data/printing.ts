import { bindBridge } from './client';

/** Current USB barcode-label batch returned by `hardware:getBulkPrintItems`. */
export interface BulkPrintItem {
  barcode: string;
  quantity: number;
  name?: string;
  price?: number;
}

/** Receipt/A4/barcode printing and the cash drawer kick. Channel catalog — the only way UI code reaches these IPC channels. */
export const printingApi = bindBridge({
  printReceipt: 'printReceipt',
  openCashDrawer: 'openCashDrawer',
  printBarcode: 'printBarcode',
  printBulkBarcodes: 'printBulkBarcodes',
  getBulkPrintItems: 'getBulkPrintItems',
  getReceiptText: 'getReceiptText',
  getA4Html: 'getA4Html',
  getPrinters: 'getPrinters',
  printReady: 'printReady',
  printA4Html: 'printA4Html',
  exportA4Pdf: 'exportA4Pdf',
});
