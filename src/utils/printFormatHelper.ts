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

export function formatPrinterError(rawErr: string | undefined | null): string {
  if (!rawErr) return 'Print Failed: Unknown printer error. Check printer power & settings.';

  const errStr = String(rawErr).trim();
  const lower = errStr.toLowerCase();

  // If it already has diagnostic fix instructions, clean up prefixes and return
  if (errStr.includes('Check') || errStr.includes('Settings') || errStr.includes('not found') || errStr.includes('re-select')) {
    return errStr.replace(/^(Print failed:\s*|Printing issue:\s*)+/i, '');
  }

  if (lower.includes('invalid devicename') || lower.includes('devicename not configured')) {
    return 'Printer Not Found: Please select a valid printer in Settings → Hardware & Printer Config.';
  }

  if (lower.includes('no printer configured') || lower.includes('no barcode printer configured')) {
    return 'Printer Settings Incomplete: No printer selected. Go to Settings → Hardware to configure.';
  }

  if (lower.includes('timeout')) {
    return 'Printer Timeout: Printer did not respond. Check printer power & USB/Network cable.';
  }

  if (lower.includes('econnrefused') || lower.includes('ehostunreach') || lower.includes('network printer')) {
    return 'Network Printer Error: Unable to connect to printer IP. Check Wi-Fi/LAN connection.';
  }

  if (lower === 'print failed' || lower === 'print failed:' || lower === 'printing issue: print failed') {
    return 'Print Failed: Printer rejected job. Check printer power, USB cable, paper, or re-select printer in Settings.';
  }

  const cleaned = errStr.replace(/^(Print failed:\s*|Printing issue:\s*)+/i, '');
  if (cleaned.toLowerCase().startsWith('print')) return cleaned;
  return `Print Failed: ${cleaned}`;
}
