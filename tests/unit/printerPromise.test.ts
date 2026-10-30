import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Exercise the private hardware helpers without loading Electron or opening windows.
const source = readFileSync('electron/hardware/printer.ts', 'utf8');
const names = ['printBarcodeUSB', 'printBulkBarcodeUSB', 'printA4USB', 'printReceiptUSB'];
const functions = ['pendingPrint', ...names].map(name => {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}).join('\n');
const compiled = ts.transpileModule(functions, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function harness(name: string, failure?: 'setup' | 'print' | 'load') {
  const listeners = new Map<string, (height?: number) => Promise<void>>();
  const timers: { callback: () => void; delay: number; cleared: boolean }[] = [];
  const error = new Error('simulated failure');
  const measure = vi.fn(async (_script: string) => 0);
  const loaded = new Map<string, () => void>();
  const close = vi.fn();
  const print = vi.fn(async () => { if (failure === 'print') throw error; });
  const load = vi.fn(async () => { if (failure === 'load') throw error; });
  class Window {
    webContents = { id: 1, executeJavaScript: measure, once: (event: string, callback: () => void) => loaded.set(event, callback) };
    isDestroyed = () => false;
    close = close;
    loadURL = load;
    loadFile = load;
  }
  const context = {
    BrowserWindow: Window,
    resolvePrinterDeviceName: async () => {
      if (failure === 'setup') throw error;
      return { deviceName: 'printer', actualNameUsed: 'printer' };
    },
    executePrintWithFallback: print,
    ipcMain: { once: (event: string, callback: (height?: number) => Promise<void>) => listeners.set(event, callback) },
    setTimeout: (callback: () => void, delay: number) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer: typeof timers[number]) => { timer.cleared = true; },
    setImmediate: vi.fn(),
    getPrintFormatConfig: () => ({}), getPrinterConfig: () => ({}),
    buildReceiptHtml: async () => '<p>receipt</p>',
    currentReceiptText: '', currentA4Html: '', currentBulkPrintItems: [], pendingReceiptHeightPx: 0,
    app: { isPackaged: false }, process: { env: {} }, console,
    path: { join: (...parts: string[]) => parts.join('/') }, __dirname: '.',
  };
  const invoke = runInNewContext(`${compiled}\n${name}`, context) as (...args: unknown[]) => Promise<void>;
  const args = name === 'printBarcodeUSB' ? ['123', 'printer']
    : name === 'printBulkBarcodeUSB' ? [[], 'printer'] : ['printer'];
  const settled = vi.fn();
  void invoke(...args).then(() => settled('resolved'), err => settled(err));
  return { listeners, loaded, measure, timers, settled, error, print, close };
}

describe.each(names)('%s promise behavior', name => {
  it('waits for print-ready and resolves after printing, clearing watchdogs', async () => {
    const h = harness(name);
    await flush();
    expect(h.settled).not.toHaveBeenCalled();
    await h.listeners.get('print-ready-1')!(600);
    await flush();
    expect(h.print).toHaveBeenCalledOnce();
    expect(h.settled).toHaveBeenCalledWith('resolved');
    expect(h.timers.filter(t => t.delay >= 20000).every(t => t.cleared)).toBe(true);
    expect(h.close).not.toHaveBeenCalled();
  });

  it('rejects print failures and keeps delayed window cleanup', async () => {
    const h = harness(name, 'print');
    await flush();
    await h.listeners.get('print-ready-1')!(600);
    await flush();
    expect(h.settled).toHaveBeenCalledWith(h.error);
    expect(h.timers.some(t => t.delay === (name.includes('Barcode') ? 2000 : 1500))).toBe(true);
  });

  it('preserves the timeout and bulk warning timing', async () => {
    const h = harness(name);
    await flush();
    const timeout = name === 'printBulkBarcodeUSB' ? 300000 : 20000;
    expect(h.timers.map(t => t.delay)).toEqual(name === 'printBulkBarcodeUSB' ? [60000, timeout] : [timeout]);
    h.timers.find(t => t.delay === timeout)!.callback();
    await flush();
    expect(h.close).toHaveBeenCalledOnce();
    expect(h.settled.mock.calls[0][0]).toMatchObject({ message: expect.stringMatching(/timeout|Timeout/) });
  });

  it('leaves the outer promise pending when device setup fails', async () => {
    const h = harness(name, 'setup');
    await flush();
    expect(h.settled).not.toHaveBeenCalled();
    expect(h.timers).toEqual([]);
    expect(h.listeners.size).toBe(0);
  });
});

it('receipt load failure rejects immediately, while A4 keeps its timeout', async () => {
  const receipt = harness('printReceiptUSB', 'load');
  const a4 = harness('printA4USB', 'load');
  await flush();
  expect(receipt.settled).toHaveBeenCalledWith(receipt.error);
  expect(receipt.close).toHaveBeenCalledOnce();
  expect(receipt.timers[0].cleared).toBe(true);
  expect(a4.settled).not.toHaveBeenCalled();
  expect(a4.timers[0].cleared).toBe(false);
});

it('fails without feeding guessed paper when the receipt readiness message never arrives', async () => {
  const h = harness('printReceiptUSB');
  await flush();
  h.loaded.get('did-finish-load')!();
  h.timers.find(t => t.delay === 2500)!.callback();
  await flush();
  expect(h.print).not.toHaveBeenCalled();
  expect(h.settled).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('paper length could not be measured') }));
  h.timers.find(t => t.delay === 1500)!.callback();
  expect(h.close).toHaveBeenCalledOnce();
  expect(h.timers.filter(t => t.delay >= 20000).every(t => t.cleared)).toBe(true);
});

it.each(['missing', 'invalid'])('measures the real window when readiness is %s and prints only once', async readiness => {
  const h = harness('printReceiptUSB');
  h.measure.mockResolvedValue(720);
  await flush();
  if (readiness === 'missing') {
    h.loaded.get('did-finish-load')!();
    h.timers.find(t => t.delay === 2500)!.callback();
  } else {
    await h.listeners.get('print-ready-1')!(0);
  }
  await flush();
  expect(h.measure).toHaveBeenCalledOnce();
  expect(h.print).toHaveBeenCalledWith(expect.anything(), 'printer', undefined, undefined, undefined, false, true);
  expect(h.settled).toHaveBeenCalledWith('resolved');
  await h.listeners.get('print-ready-1')!(720);
  expect(h.print).toHaveBeenCalledOnce();
});
