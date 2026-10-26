export interface BulkPrintItem {
  barcode: string;
  quantity: number;
  name?: string;
  price?: number;
  sp?: number;
  spType?: 'SP' | 'OFF';
}
