import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildReceiptHtml } from '../../electron/hardware/receiptHtml';

const source = readFileSync('electron/hardware/printer.ts', 'utf8');
function compile(name: string) {
  const start = source.indexOf(`function ${name}(`);
  return ts.transpileModule(source.slice(start, source.indexOf('\n}', start) + 2), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

describe('thermal paper layout', () => {
  it.each([58, 76, 80])('uses one inset and keeps the body inside %s mm paper', async width => {
    const dom = new JSDOM(await buildReceiptHtml('Item     10.00', width));
    const style = dom.window.getComputedStyle(dom.window.document.documentElement);
    expect(style.padding).toBe('0px');
    const body = dom.window.getComputedStyle(dom.window.document.body);
    expect(body.width).toBe(`${width}mm`);
    expect(body.padding).toBe('2mm 3mm');
  });
  it('applies the calibration offset once', async () => {
    const dom = new JSDOM(await buildReceiptHtml('Item', 58, 'monospace', 2));
    expect(dom.window.getComputedStyle(dom.window.document.documentElement).marginLeft).toBe('0px');
    expect(dom.window.getComputedStyle(dom.window.document.body).left).toBe('2mm');
    expect(dom.window.getComputedStyle(dom.window.document.body).padding).toBe('2mm 3mm');
  });
});

it('measures the receipt after assets load, without counting the viewport as paper', async () => {
  const dom = new JSDOM(await buildReceiptHtml(Array(60).fill('Product    10.00').join('\n'), 58));
  const printReady = vi.fn();
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

it('does not print a long bill on did-finish-load before its own measurement arrives', async () => {
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
    executePrintWithFallback: print, buildReceiptHtml: async () => '',
    pendingPrint: (fn: (resolve: () => void, reject: () => void) => Promise<void>) => new Promise(fn),
    ipcMain: { once: (event: string, fn: (height?: number) => Promise<void>) => listeners.set(event, fn) },
    setTimeout: vi.fn(), clearTimeout: vi.fn(), setImmediate: (fn: () => void) => fn(),
    path: { join: () => '' }, __dirname: '', currentReceiptText: '', pendingReceiptHeightPx: 0, console,
  };
  const invoke = runInNewContext(`${compile('printReceiptUSB')}\nprintReceiptUSB`, context);
  void invoke('thermal', 58);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  loaded.get('did-finish-load')?.();
  expect(print).not.toHaveBeenCalled();
  await listeners.get('print-ready-11')!(1800);
  expect(print).toHaveBeenCalledWith(expect.anything(), 'thermal', 58, expect.any(Number), undefined, false, true);
  expect(print.mock.calls[0][3]).toBeGreaterThan(1800 * 25.4 / 96 * 1000);
});

it('reports unsupported thermal dimensions instead of silently printing on a shorter driver page', async () => {
  const print = vi.fn((_options, callback) => callback(false, 'unsupported paper'));
  const invoke = runInNewContext(`${compile('executePrintWithFallback')}\nexecutePrintWithFallback`, { console });
  await expect(invoke({ isDestroyed: () => false, webContents: { print } }, 'thermal', 58, 520000, undefined, false, true)).rejects.toThrow('unsupported paper');
  expect(print).toHaveBeenCalledOnce();
});
