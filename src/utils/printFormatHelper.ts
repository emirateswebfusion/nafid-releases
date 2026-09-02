export interface PrintFormatConfig {
  format: 'thermal' | 'a4' | 'half-a4';
  width?: number;
  style?: string;
  showProductOffers?: boolean;
  openCashDrawerOnPending?: boolean;
  receiptFont?: string;
  billSettings?: any;
  scrapBillSettings?: any;
  [key: string]: any;
}

export function parsePrintFormat(val: any): PrintFormatConfig {
  if (!val) return { format: 'thermal' };
  if (typeof val === 'string') {
    if (val === 'half-a4' || val === 'a4' || val === 'thermal') {
      return { format: val };
    }
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object') return parsePrintFormat(parsed);
      if (typeof parsed === 'string' && (parsed === 'half-a4' || parsed === 'a4' || parsed === 'thermal')) {
        return { format: parsed };
      }
    } catch {
      return { format: 'thermal' };
    }
  }
  if (typeof val === 'object') {
    const fmt = (val.format === 'half-a4' || val.format === 'a4' || val.format === 'thermal') ? val.format : 'thermal';
    return { ...val, format: fmt };
  }
  return { format: 'thermal' };
}
