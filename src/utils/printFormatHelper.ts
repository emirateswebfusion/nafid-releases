export interface PrintFormatConfig {
  format: 'thermal' | 'a4' | 'half-a4';
  thermalStyle?: string;
  a4Style?: string;
  a5Orientation?: 'horizontal' | 'vertical';
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
  const defaultThermal = 'standard';
  const defaultA4 = 'boxed';

  if (!val) return { format: 'thermal', thermalStyle: defaultThermal, a4Style: defaultA4 };
  if (typeof val === 'string') {
    if (val === 'half-a4' || val === 'a4' || val === 'thermal') {
      return { format: val, thermalStyle: defaultThermal, a4Style: defaultA4 };
    }
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object') return parsePrintFormat(parsed);
      if (typeof parsed === 'string' && (parsed === 'half-a4' || parsed === 'a4' || parsed === 'thermal')) {
        return { format: parsed, thermalStyle: defaultThermal, a4Style: defaultA4 };
      }
    } catch {
      return { format: 'thermal', thermalStyle: defaultThermal, a4Style: defaultA4 };
    }
  }
  if (typeof val === 'object') {
    const fmt = (val.format === 'half-a4' || val.format === 'a4' || val.format === 'thermal') ? val.format : 'thermal';
    const thermalStyle = val.thermalStyle || (fmt === 'thermal' ? val.style : undefined) || defaultThermal;
    const a4Style = val.a4Style || (fmt === 'a4' ? val.style : undefined) || defaultA4;
    return { ...val, format: fmt, thermalStyle, a4Style };
  }
  return { format: 'thermal', thermalStyle: defaultThermal, a4Style: defaultA4 };
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
