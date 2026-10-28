import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { buildReceiptHtml } from '../../electron/hardware/receiptHtml';

function harness() {
  const source = readFileSync('electron/whatsapp/whatsappService.ts', 'utf8');
  const start = source.lastIndexOf('  ipcMain.handle(', source.indexOf("'whatsapp:sendInvoice'"));
  const code = ts.transpileModule(source.slice(start, source.lastIndexOf('\n}')), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const send = vi.fn().mockResolvedValue({ success: true });
  const pdf = vi.fn().mockResolvedValue(Buffer.from('pdf'));
  const receipt = vi.fn().mockResolvedValue('<style>@page { margin: 0; }</style>');
  let invoke: (event: unknown, payload: unknown) => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  runInNewContext(code, {
    ipcMain: { handle: (_channel: string, callback: typeof invoke) => { invoke = callback; } },
    sendWhatsAppBill: send, generatePdfBufferFromHtml: pdf, buildReceiptHtml: receipt, console: { warn: vi.fn() },
  });
  return { invoke, send, pdf, receipt };
}
it('renders thermal receipt data through the existing renderer and selects receipt page size', async () => {
  const h = harness();
  await h.invoke(null, { phone: '123', message: 'Receipt', receiptText: 'Thermal', receiptWidthMm: 58 });
  expect(h.receipt).toHaveBeenCalledWith('Thermal', 58);
  expect(h.pdf).toHaveBeenCalledWith(expect.stringContaining('size: 58mm 297mm;'), true);
  expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ pdfBuffer: Buffer.from('pdf') }));
});
it('keeps A4 generation options and reports PDF failure without sending a false success', async () => {
  const h = harness(); h.pdf.mockRejectedValue(new Error('PDF failed'));
  const result = await h.invoke(null, { phone: '123', message: 'Invoice', htmlContent: '<h1>Bill</h1>' });
  expect(h.pdf).toHaveBeenCalledWith('<h1>Bill</h1>', false);
  expect(result.success).toBe(false);
  expect(h.send).not.toHaveBeenCalled();
});
it('renders receipt QR and barcode markers and escapes customer text', async () => {
  const html = await buildReceiptHtml('<Shop>\n[[QR:upi://pay?pa=shop@upi]]\n[[BARCODE:B1]]', 80);
  expect(html).toContain('&lt;Shop&gt;');
  expect(html).toContain('data:image/png;base64,');
  expect(html).toContain('<svg');
  expect(html).not.toContain('[[QR:');
  expect(html).not.toContain('[[BARCODE:');
});

it('prints generated receipt HTML directly so the A4 sanitizer cannot strip QR images', async () => {
  const source = readFileSync('electron/whatsapp/whatsappService.ts', 'utf8');
  const start = source.indexOf('async function generatePdfBufferFromHtml(');
  const end = source.indexOf('\n}', start) + 2;
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const load = vi.fn(); const print = vi.fn().mockResolvedValue(Buffer.from('pdf'));
  let ready = async () => {};
  class Window {
    webContents = { id: 1, printToPDF: print };
    loadURL = load;
    loadFile = vi.fn();
    isDestroyed = () => false;
    close = vi.fn();
  }
  const generate = runInNewContext(`${code}\ngeneratePdfBufferFromHtml`, {
    BrowserWindow: Window, app: { isPackaged: false }, path: { join: () => 'preload.js' }, __dirname: '.',
    ipcMain: { once: (_event: string, callback: typeof ready) => { ready = callback; } },
    setSharedA4Html: vi.fn(), setTimeout: () => 1, clearTimeout: vi.fn(), Buffer, console,
    process: { env: {} },
  }) as (html: string, thermal: boolean) => Promise<Buffer>;
  const result = generate('<img src="data:image/png;base64,ABC"/>', true);
  expect(load).toHaveBeenCalledWith(expect.stringContaining('data:text/html;charset=utf-8,'));
  expect(decodeURIComponent(load.mock.calls[0][0])).toContain('data:image/png;base64,ABC');
  await ready(); await result;
  expect(print).toHaveBeenCalledWith(expect.objectContaining({ preferCSSPageSize: true }));
});
import { setSharedA4Html, getSharedA4Html, clearSharedA4Html } from '../../electron/whatsapp/sharedPrintHtml';

it('isolates A4 HTML per window ID so previously printed invoices never leak into WhatsApp PDFs', () => {
  setSharedA4Html('<h1>Invoice B2B-001</h1>', 1);
  setSharedA4Html('<h1>Invoice M8DG-305</h1>', 2);
  expect(getSharedA4Html(1)).toBe('<h1>Invoice B2B-001</h1>');
  expect(getSharedA4Html(2)).toBe('<h1>Invoice M8DG-305</h1>');
  expect(getSharedA4Html()).toBe('<h1>Invoice M8DG-305</h1>');
  clearSharedA4Html(1);
  expect(getSharedA4Html(1)).toBe('<h1>Invoice M8DG-305</h1>');
  expect(getSharedA4Html(2)).toBe('<h1>Invoice M8DG-305</h1>');
  clearSharedA4Html(2);
  expect(getSharedA4Html()).toBe('');
});

it('binds A4 HTML to the window ID before opening print-a4 and cleans up on completion', async () => {
  const source = readFileSync('electron/whatsapp/whatsappService.ts', 'utf8');
  const start = source.indexOf('async function generatePdfBufferFromHtml(');
  const end = source.indexOf('\n}', start) + 2;
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const load = vi.fn(); const print = vi.fn().mockResolvedValue(Buffer.from('pdf'));
  const setHtml = vi.fn(); const clearHtml = vi.fn();
  let ready = async () => {};
  class Window {
    webContents = { id: 42, printToPDF: print };
    loadURL = load;
    loadFile = vi.fn();
    isDestroyed = () => false;
    close = vi.fn();
  }
  const generate = runInNewContext(`${code}\ngeneratePdfBufferFromHtml`, {
    BrowserWindow: Window, app: { isPackaged: false }, path: { join: () => 'preload.js' }, __dirname: '.',
    ipcMain: { once: (_event: string, callback: typeof ready) => { ready = callback; } },
    setSharedA4Html: setHtml, clearSharedA4Html: clearHtml, setTimeout: () => 1, clearTimeout: vi.fn(), Buffer, console,
    process: { env: { ELECTRON_DEV_SERVER_URL: 'http://localhost:5173' } },
  }) as (html: string, thermal: boolean) => Promise<Buffer>;
  const result = generate('<h1>Invoice M8DG-305</h1>', false);
  expect(setHtml).toHaveBeenCalledWith('<h1>Invoice M8DG-305</h1>', 42);
  expect(load).toHaveBeenCalledWith(expect.stringContaining('/#/print-a4'));
  await ready();
  const buffer = await result;
  expect(buffer).toEqual(Buffer.from('pdf'));
  expect(clearHtml).toHaveBeenCalledWith(42);
});

