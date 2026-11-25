import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { generateReceiptText, type ReceiptData } from '../../src/utils/print/receiptGenerator';
import { JSDOM } from 'jsdom';
import { buildReceiptHtml } from '../../electron/hardware/receiptHtml';
import { sanitizeForEscPos } from '../../electron/hardware/escPos';
import { generateUaeReceipt } from '../../src/utils/print/uaeInvoice';
import { setUaeArabicPrint } from '../../src/utils/print/uaeLabels';
import { setStoreCountry } from '../../src/utils/localization/storeProfile';

const source = readFileSync('electron/hardware/printer.ts', 'utf8');
function compile(name: string) {
  const start = source.indexOf(`function ${name}(`);
  return ts.transpileModule(source.slice(start, source.indexOf('\n}', start) + 2), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

describe('compact receipt UPI QR', () => {
  it.each([58, 76, 80])('keeps the QR at 25 mm on %s mm rolls', async width => {
    const payload = 'upi://pay?pa=shop%40upi&pn=Test%20Store&am=125.50&cu=INR';
    const dom = new JSDOM(await buildReceiptHtml(`Total 125.50\n[[QR:${payload}]]`, width));
    const image = dom.window.document.querySelector('img');
    expect(image?.style.width).toBe('25mm');
    expect(image?.style.maxWidth).toBe('100%');
    expect(image?.style.height).toBe('auto');
    expect(image?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(dom.window.document.body.textContent).toContain('Total 125.50');
    expect(dom.window.document.body.textContent).not.toContain('[[QR:');
  });
});

describe('thermal paper layout', () => {
  it.each([58, 76, 80])('uses one inset and keeps the body inside %s mm paper', async width => {
    const dom = new JSDOM(await buildReceiptHtml('Item     10.00', width));
    const style = dom.window.getComputedStyle(dom.window.document.documentElement);
    expect(style.padding).toBe('0px');
    const body = dom.window.getComputedStyle(dom.window.document.body);
    expect(body.width).toBe(`${width}mm`);
    expect(body.padding).toBe('0px');
  });
  it('applies the calibration offset once', async () => {
    const dom = new JSDOM(await buildReceiptHtml('Item', 58, 'monospace', 2));
    expect(dom.window.getComputedStyle(dom.window.document.documentElement).marginLeft).toBe('0px');
    expect(dom.window.getComputedStyle(dom.window.document.body).left).toBe('2mm');
    expect(dom.window.getComputedStyle(dom.window.document.body).padding).toBe('0px');
  });
});

it('measures the receipt after assets load, without counting the viewport as paper', async () => {
  const dom = new JSDOM(await buildReceiptHtml(Array(60).fill('Product    10.00').join('\n'), 58));
  const printReady = vi.fn();
  dom.window.HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
  Object.defineProperty(dom.window.document.body, 'scrollHeight', { value: 1500 });
  Object.defineProperty(dom.window.document.documentElement, 'scrollHeight', { value: 1800 });
  const listeners = new Map<string, () => Promise<void>>();
  runInNewContext(dom.window.document.querySelector('script')!.textContent!, {
    window: { addEventListener: (event: string, fn: () => Promise<void>) => listeners.set(event, fn), electronAPI: { printReady } },
    document: dom.window.document,
  });
  expect(listeners.has('load')).toBe(true);
  await listeners.get('load')!();
  expect(printReady).toHaveBeenCalledWith(1500);
});

it.each([80, 300, 1800])('waits for content readiness and prints one continuous page for %s px receipts', async height => {
  const listeners = new Map<string, (height?: number) => Promise<void>>();
  const loaded = new Map<string, () => void>();
  const print = vi.fn();
  class Window {
    webContents = { id: 11, once: (event: string, fn: () => void) => loaded.set(event, fn) };
    isDestroyed = () => false;
    close = vi.fn();
    loadURL = vi.fn();
  }
  const context = {
    BrowserWindow: Window, getPrintFormatConfig: () => ({}), getPrinterConfig: () => ({}),
    resolvePrinterDeviceName: async () => ({ deviceName: 'thermal', actualNameUsed: 'thermal' }),
    executePrintWithFallback: print, buildReceiptHtml: vi.fn(async () => ''),
    pendingPrint: (fn: (resolve: () => void, reject: () => void) => Promise<void>) => new Promise(fn),
    ipcMain: { once: (event: string, fn: (height?: number) => Promise<void>) => listeners.set(event, fn) },
    setTimeout: vi.fn(), clearTimeout: vi.fn(), setImmediate: (fn: () => void) => fn(),
    path: { join: () => '' }, __dirname: '', currentReceiptText: 'Original bill', pendingReceiptHeightPx: 0, console,
  };
  const invoke = runInNewContext(`${compile('printReceiptUSB')}\nprintReceiptUSB`, context);
  void invoke('thermal', 58);
  context.currentReceiptText = 'Next bill';
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(context.buildReceiptHtml).toHaveBeenCalledWith('Original bill', 58, expect.any(String), 0);
  loaded.get('did-finish-load')?.();
  expect(print).not.toHaveBeenCalled();
  await listeners.get('print-ready-11')!(height);
  const pageHeightMicrons = Math.max(40000, Math.ceil(height * 25.4 / 96 + 3) * 1000);
  await vi.waitFor(() => expect(print).toHaveBeenCalledWith(expect.anything(), 'thermal', 58, pageHeightMicrons, undefined, false, true, true));
});

it.each([0, -1, NaN, Infinity, undefined])('rejects unmeasured height %s without feeding blank paper', async height => {
  const listeners = new Map<string, (height?: number) => Promise<void>>();
  const print = vi.fn();
  class Window {
    webContents = { id: 12, once: () => {}, executeJavaScript: async () => 0 };
    isDestroyed = () => false;
    close = vi.fn();
    loadURL = vi.fn();
  }
  const context = {
    BrowserWindow: Window, getPrintFormatConfig: () => ({}), getPrinterConfig: () => ({}),
    resolvePrinterDeviceName: async () => ({ deviceName: 'thermal', actualNameUsed: 'thermal' }),
    executePrintWithFallback: print, buildReceiptHtml: async () => '',
    pendingPrint: (fn: (resolve: () => void, reject: () => void) => Promise<void>) => new Promise(fn),
    ipcMain: { once: (event: string, fn: (height?: number) => Promise<void>) => listeners.set(event, fn) },
    setTimeout: vi.fn(), clearTimeout: vi.fn(), setImmediate: (fn: () => void) => fn(),
    path: { join: () => '' }, __dirname: '', currentReceiptText: '', pendingReceiptHeightPx: 0,
    console: { ...console, warn: vi.fn() },
  };
  const invoke = runInNewContext(`${compile('printReceiptUSB')}
printReceiptUSB`, context);
  const result = expect(invoke('thermal', 58)).rejects.toThrow('Receipt paper length could not be measured');
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await listeners.get('print-ready-12')!(height);
  await result;
  expect(print).not.toHaveBeenCalled();
});

it('reports unsupported thermal dimensions instead of silently printing on a shorter driver page', async () => {
  const print = vi.fn((_options, callback) => callback(false, 'unsupported paper'));
  const invoke = runInNewContext(`${compile('executePrintWithFallback')}\nexecutePrintWithFallback`, { console });
  await expect(invoke({ isDestroyed: () => false, webContents: { print } }, 'thermal', 58, 520000, undefined, false, true)).rejects.toThrow('unsupported paper');
  expect(print).toHaveBeenCalledOnce();
});

it('never retries a print the driver has not answered yet, so a slow printer does not print the receipt twice', async () => {
  const print = vi.fn();
  const timers = vi.fn();
  const invoke = runInNewContext(`${compile('executePrintWithFallback')}\nexecutePrintWithFallback`, { console, setTimeout: timers });
  void invoke({ isDestroyed: () => false, webContents: { print } }, 'XP-80C', 80, 120000, undefined, false, true);
  await Promise.resolve();
  expect(print).toHaveBeenCalledOnce();
  expect(timers).not.toHaveBeenCalled();
});

it.each([40000, 120000, 296000, 520000])('keeps exact thermal paper at %s microns when the driver rejects it', async height => {
  const print = vi.fn((_options, callback) => callback(false, 'unsupported custom paper size'));
  const invoke = runInNewContext(`${compile('executePrintWithFallback')}\nexecutePrintWithFallback`, { console });
  await expect(invoke({ isDestroyed: () => false, webContents: { print } }, 'XP-80C', 80, height, undefined, false, true)).rejects.toThrow('unsupported custom paper size');
  expect(print).toHaveBeenCalledOnce();
});

it('preserves left-aligned metadata and indented lines without falsely centering them', async () => {
  const receipt = [
    '          PAATHRA PEEDIKA           ',
    '====================================',
    '  INV No:  M8DG-271',
    '  Date:    27/10/2026, 05:09:06 PM',
    '  Staff:   Haroon',
    '------------------------------------',
    '              CUSTOMER              ',
    '  State: KL',
    '------------------------------------',
    ' 1. GLASS                        1    46.00',
    '  MRP ₹140.00 → ₹130.00  (Offer)',
  ].join('\n');

  const html = await buildReceiptHtml(receipt, 80);
  const dom = new JSDOM(html);
  const pres = Array.from(dom.window.document.querySelectorAll('pre'));

  // Header should be centered
  expect(pres[0].style.textAlign).toBe('center');
  expect(pres[0].textContent).toBe('PAATHRA PEEDIKA');

  // Metadata should remain left-aligned and retain leading spaces
  expect(pres[2].style.textAlign).toBe('left');
  expect(pres[2].textContent).toBe('  INV No:  M8DG-271');

  expect(pres[3].style.textAlign).toBe('left');
  expect(pres[3].textContent).toBe('  Date:    27/10/2026, 05:09:06 PM');

  expect(pres[4].style.textAlign).toBe('left');
  expect(pres[4].textContent).toBe('  Staff:   Haroon');

  // CUSTOMER title should be centered
  expect(pres[6].style.textAlign).toBe('center');
  expect(pres[6].textContent).toBe('CUSTOMER');

  // Customer state should remain left-aligned
  expect(pres[7].style.textAlign).toBe('left');
  expect(pres[7].textContent).toBe('  State: KL');

  // Item and MRP discount should remain left-aligned
  expect(pres[9].style.textAlign).toBe('left');
  expect(pres[9].textContent).toBe(' 1. GLASS                        1    46.00');

  expect(pres[10].style.textAlign).toBe('left');
  expect(pres[10].textContent).toBe('  MRP ₹140.00 → ₹130.00  (Offer)');
});

it('renders GST in a separate Tax Breakup section instead of inlining it in totals', () => {
  const sampleReceipt: ReceiptData = {
    shopName: 'Supermarket',
    invoiceNumber: 'INV-101',
    date: '2026-10-28T10:00:00Z',
    items: [
      { name: 'Dove Soap 100g', quantity: 1, unit_price: 100, total: 100 },
    ],
    subtotal: 100,
    tax: 15.24,
    cgst: 7.62,
    sgst: 7.62,
    discount: 0,
    grandTotal: 100,
    invoiceType: 'GST',
  };

  const rendered = generateReceiptText(sampleReceipt, 5.8, 32, 'standard');

  // Totals block should not contain CGST or SGST lines
  const totalsSection = rendered.slice(rendered.indexOf('SUBTOTAL'), rendered.indexOf('** GRAND TOTAL **'));
  expect(totalsSection).not.toContain('CGST');
  expect(totalsSection).not.toContain('SGST');
  expect(totalsSection).toContain('SUBTOTAL');

  // There should be a dedicated TAX BREAKUP table
  expect(rendered).toContain('TAX BREAKUP');
  expect(rendered).toMatch(/Taxable\s+CGST\s+SGST\s+Total/);
  expect(rendered).toMatch(/84\.76\s+7\.62\s+7\.62\s+15\.24/);
});

it('renders boxed 80mm receipt with strict 42-char lines and exact column alignment', () => {
  const sampleReceipt: ReceiptData = {
    shopName: 'PAATHRA PEEDIKA',
    shopAddress: 'NEAR SOUTH INDIAN BANK, PERUMPUZHA',
    shopPhone: '9895073063',
    gstin: '32CEFPK8504N2ZA',
    state: 'KL',
    invoiceNumber: 'M8DG-309',
    date: '2026-10-29T11:31:07',
    customerName: 'AJAY',
    customerPhone: '8968340919',
    items: [
      { name: 'NOLTA DINNERSET 21', quantity: 1, unit: 'PC', unit_price: 2250, total: 2250, originalRate: 3790, discountLabel: 'Offer' },
      { name: 'PAINT BRUSH 3"', quantity: 2, unit: 'PC', unit_price: 150, total: 300 },
    ],
    subtotal: 2428.57,
    tax: 121.43,
    cgst: 60.71,
    sgst: 60.71,
    discount: 100,
    grandTotal: 2450,
    invoiceType: 'GST',
  };

  const rendered = generateReceiptText(sampleReceipt, 8.0, 42, 'boxed');
  const lines = rendered.split('\n').filter(l => l.length > 0);

  // Every line that is part of the box must be strictly 42 characters wide
  lines.forEach((line) => {
    if (!line.startsWith('[[') && (line.startsWith('│') || line.startsWith('┌') || line.startsWith('├') || line.startsWith('└'))) {
      expect(line.length).toBe(42);
    }
  });

  // Rates >= 1000 must NOT be truncated to 1 decimal place (e.g. 2250.00 must not be 2250.0)
  expect(rendered).toContain('2250.00');
  expect(rendered).not.toMatch(/│\s*2250\.0\s*│/);

  // Totals must have Total, Discount, and Net Total (clean single final total)
  expect(rendered).toContain('Total');
  expect(rendered).toContain('Discount');
  expect(rendered).toContain('Net Total');

  // Tax Breakup must have clean 4-column layout for intra-state
  expect(rendered).toMatch(/│\s*Taxable\s*│\s*CGST\s*│\s*SGST\s*│\s*Total\s*│/);
});

it('formats scrap and weight items with exactly 3 digits after the dot (e.g. 1.000)', () => {
  const scrapReceipt: ReceiptData = {
    shopName: 'PAATHRA PEEDIKA',
    invoiceNumber: 'SCRAP-101',
    date: '2026-10-29T11:31:07',
    items: [
      { name: 'Copper Scrap', quantity: 1, unit: 'KG', billing_type: 'WEIGHT', unit_price: 680, total: 680 },
      { name: 'Iron Scrap', quantity: 2.5, unit: 'KG', billing_type: 'WEIGHT', unit_price: 35, total: 87.5 },
    ],
    subtotal: 767.5,
    tax: 0,
    discount: 0,
    grandTotal: 767.5,
    invoiceType: 'SCRAP',
  };

  const rendered = generateReceiptText(scrapReceipt, 8.0, 42, 'boxed');
  // Weight quantity must be 3 decimal digits: 1.000 and 2.500
  expect(rendered).toContain('1.000');
  expect(rendered).toContain('2.500');
  // Lines must remain strictly 42 chars
  const lines = rendered.split('\n').filter(l => l.length > 0);
  lines.forEach((line) => {
    if (!line.startsWith('[[') && (line.startsWith('│') || line.startsWith('┌') || line.startsWith('├') || line.startsWith('└'))) {
      expect(line.length).toBe(42);
    }
  });
});

it('always sets an explicit page size so the receipt prints as one continuous page', async () => {
  const physical = await buildReceiptHtml('Bill', 80, 'monospace', 0);
  expect(physical).toMatch(/size:\s*auto/);
  expect(physical).toContain('document.head.appendChild(pageStyle)');
  expect(await buildReceiptHtml('Bill', 80)).toContain('size: auto');
});
it('clamps the calibration offset inside the page and keeps body width consistent', async () => {
  const positive = new JSDOM(await buildReceiptHtml('Bill', 80, 'monospace', 10));
  expect(positive.window.getComputedStyle(positive.window.document.body).width).toBe('70mm');
  expect(positive.window.getComputedStyle(positive.window.document.body).left).toBe('10mm');
  const negative = new JSDOM(await buildReceiptHtml('Bill', 80, 'monospace', -20));
  expect(negative.window.getComputedStyle(negative.window.document.body).left).toBe('0mm');
  expect(negative.window.getComputedStyle(negative.window.document.body).width).toBe('80mm');
});
it('preserves PDF row fitting before measuring the paper length', async () => {
  const dom = new JSDOM(await buildReceiptHtml('1234567890', 58, 'monospace'));
  const row = dom.window.document.querySelector('pre')!;
  Object.defineProperty(row, 'clientWidth', { value: 100 });
  dom.window.HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ measureText: () => ({ width: 125 }) });
  const listeners = new Map<string, () => Promise<void>>();
  runInNewContext(dom.window.document.querySelector('script')!.textContent!, {
    window: { addEventListener: (event: string, fn: () => Promise<void>) => listeners.set(event, fn) },
    document: dom.window.document, getComputedStyle: () => ({ fontSize: '10px', fontFamily: 'monospace', fontWeight: '700' }),
  });
  await listeners.get('load')!();
  expect(parseFloat(dom.window.document.body.style.fontSize)).toBeCloseTo(7.92);
});

it('submits an explicit full-receipt page size so the driver prints one continuous page', async () => {
  const print = vi.fn((_options, callback) => callback(true));
  const invoke = runInNewContext(`${compile('executePrintWithFallback')}\nexecutePrintWithFallback`, { console });
  await invoke({ isDestroyed: () => false, webContents: { print } }, 'thermal', 80, 194000, undefined, false, true);
  const options = print.mock.calls[0][0];
  expect(options).toMatchObject({ margins: { marginType: 'none' }, deviceName: 'thermal' });
  expect(options).not.toHaveProperty('scaleFactor');
  expect(options).not.toHaveProperty('usePrinterDefaultPageSize');
  expect(options.pageSize).toEqual({ width: 80000, height: 194000 });
});

it('uses the printer driver default page size without vertical centering when requested', async () => {
  const print = vi.fn((_options, callback) => callback(true));
  const invoke = runInNewContext(`${compile('executePrintWithFallback')}\nexecutePrintWithFallback`, { console });
  await invoke({ isDestroyed: () => false, webContents: { print } }, 'thermal', 80, 194000, undefined, false, true, true);
  const options = print.mock.calls[0][0];
  expect(options).toMatchObject({ margins: { marginType: 'none' }, deviceName: 'thermal', usePrinterDefaultPageSize: true });
  expect(options).not.toHaveProperty('pageSize');
});


it.each([58, 76, 80])('keeps the receipt body inside a %s mm page for both thermal and PDF output', async width => {
  const dom = new JSDOM(await buildReceiptHtml('Bill', width, 'monospace', 0));
  const body = dom.window.getComputedStyle(dom.window.document.body);
  expect(body.width).toBe(`${width}mm`);
  expect(body.left).toBe('0mm');
  expect(dom.window.getComputedStyle(dom.window.document.documentElement).width).toBe(`${width}mm`);
});
it.each(['A4', undefined])('preserves explicit A4 and label paper sizes (%s)', async page => {
  const print = vi.fn((_options, callback) => callback(true));
  const invoke = runInNewContext(`${compile('executePrintWithFallback')}\nexecutePrintWithFallback`, { console });
  await invoke({ isDestroyed: () => false, webContents: { print } }, 'other', 50, 25000, page);
  expect(print.mock.calls[0][0].pageSize).toEqual(page || { width: 50000, height: 25000 });
});

describe('UAE Arabic on thermal receipts', () => {
  const bill = { shopName: 'Al Noor', shopGstin: '100000000000003', invoiceNumber: 'INV-1', invoiceType: 'GST', date: '2026-10-15T09:15:00Z',
    items: [{ name: 'Drill', quantity: 1, unit_price: 100, total: 100, tax_rate_percent: 5 }], subtotal: 100, tax: 5, discount: 0, grandTotal: 105, paymentMethod: 'CASH' };
  const receipt = (thermal: boolean, width: number) => {
    setStoreCountry('AE'); setUaeArabicPrint({ documents: true, thermal });
    try { return generateUaeReceipt(bill, width); } finally { setUaeArabicPrint(undefined); setStoreCountry('IN'); }
  };

  it.each([32, 42])('prints exactly the English receipt on network ESC/POS printers (%s columns)', width => {
    const arabic = receipt(true, width);
    expect(arabic).toContain('\u0641\u0627\u062a\u0648\u0631\u0629 \u0636\u0631\u064a\u0628\u064a\u0629');
    expect(Math.max(...arabic.trimEnd().split('\n').map(line => line.length))).toBeLessThanOrEqual(width);
    const english = receipt(false, width);
    expect(sanitizeForEscPos(arabic)).toBe(english);
    expect(english).toContain('VAT 5%: AED 5.00');
    expect(english).toContain('TOTAL incl. VAT: AED 105.00');
  });

  it('keeps the ? fallback for Arabic product names', () => {
    expect(sanitizeForEscPos('\u062d\u0644\u064a\u0628\n1 x AED 5.00 = AED 5.00\n')).toBe('????\n1 x AED 5.00 = AED 5.00\n');
  });

  it('passes Arabic through to the USB/driver receipt page', async () => {
    const html = await buildReceiptHtml(receipt(true, 42), 80);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('\u0641\u0627\u062a\u0648\u0631\u0629 \u0636\u0631\u064a\u0628\u064a\u0629</pre>');
  });
});

describe('return receipt discount breakdown', () => {
  it('displays original price, refund rate, and discount percentage on return receipts', () => {
    const returnBill: ReceiptData = {
      shopName: 'Test Store',
      invoiceNumber: 'RTN-101',
      referenceInvoiceNumber: 'INV-500',
      invoiceType: 'RETURN',
      date: '2026-11-20 10:00',
      items: [
        {
          name: 'Stove 3-Burner',
          quantity: 1,
          unit_price: 3015,
          total: 3015,
          originalRate: 3350,
          discountLabel: '10% OFF',
          isPriceOverride: true,
        },
      ],
      subtotal: 3015,
      tax: 0,
      discount: 335,
      grandTotal: 3015,
    };

    const boxedText = generateReceiptText(returnBill, 8.0, 42, 'boxed');
    expect(boxedText).toContain('RETURN INVOICE');
    expect(boxedText).toContain('MRP 3350.00 @ 3015.00 (10% OFF)');

    const standardText = generateReceiptText(returnBill, 8.0, 48, 'standard');
    expect(standardText).toContain('RETURN INVOICE');
    expect(standardText).toContain('MRP ₹3350.00 → ₹3015.00  (10% OFF)');
  });

  it('displays both weight and piece count for returned weighted items', () => {
    const returnBillWithWeight: ReceiptData = {
      shopName: 'Test Store',
      invoiceNumber: 'RTN-102',
      referenceInvoiceNumber: 'INV-501',
      invoiceType: 'RETURN',
      date: '2026-11-21 10:00',
      items: [
        {
          name: 'Fresh Chicken',
          quantity: 1.5,
          unit_price: 200,
          total: 300,
          billing_type: 'WEIGHT',
          unit: 'Kg',
          pieces_sold: 3,
          pieces_override: 3,
        },
      ],
      subtotal: 300,
      tax: 0,
      grandTotal: 300,
    };

    const boxedText = generateReceiptText(returnBillWithWeight, 8.0, 42, 'boxed');
    expect(boxedText).toContain('1.500');
    expect(boxedText).toContain('Qty: 3 Pcs');

    const standardText = generateReceiptText(returnBillWithWeight, 8.0, 48, 'standard');
    expect(standardText).toContain('Qty: 3 Pcs');
  });

  it('labels B2B return documents as CREDIT NOTE', () => {
    const b2bReturnBill: ReceiptData = {
      shopName: 'Test Store',
      invoiceNumber: 'CN-101',
      invoiceType: 'RETURN',
      isB2B: true,
      date: '2026-11-20 10:00',
      items: [
        {
          name: 'Wholesale Item',
          quantity: 2,
          unit_price: 500,
          total: 1000,
        },
      ],
      subtotal: 1000,
      tax: 0,
      discount: 0,
      grandTotal: 1000,
    };

    const text = generateReceiptText(b2bReturnBill, 8.0, 48, 'standard');
    expect(text).toContain('CREDIT NOTE');
  });
});
