const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const { createRequire } = require('node:module');
const { app, BrowserWindow, ipcMain } = require('electron');
const ts = require('typescript');
const { PNG } = createRequire(require.resolve('qrcode'))('pngjs');

// Optional Windows integration gate: real spooler/thermal driver -> local emupos. No shop database is opened.
const options = Object.fromEntries(process.argv.slice(2).filter(arg => arg.startsWith('--')).map(arg => {
  const index = arg.indexOf('=');
  return [arg.slice(2, index), arg.slice(index + 1)];
}));
assert.ok(options.printer && options.output && path.isAbsolute(options.output), 'Pass --printer=NAME and an absolute --output=DIR outside the repo');
const output = options.output;
const base = path.resolve(__dirname, '../..');
const api = new URL(options.api || 'http://127.0.0.1:8765');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname), 'Emulator API must be local');
const device = encodeURIComponent(options.device || 'thermal');
const width = Number(options.width || 80);
const dpi = Number(options.dpi || 180);
assert.ok([58, 76, 80].includes(width) && dpi > 0);
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'electron-profile'));
Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
const { generateReceiptText } = require(path.join(base, 'src/utils/print/receiptGenerator.ts'));
const receiptHtml = require(path.join(base, 'dist-electron/hardware/receiptHtml.js'));
const source = fs.readFileSync(path.join(base, 'dist-electron/hardware/printer.js'), 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing compiled helper: ${name}`);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
const compiled = ['pendingPrint', 'executePrintWithFallback', 'printReceiptUSB'].map(extract).join('\n');
const request = async route => {
  const response = await fetch(new URL(`/api/v1/devices/${device}/${route}`, api));
  assert.ok(response.ok, `Emulator response ${response.status}`);
  return response;
};
const receipts = async () => (await request('receipts')).json();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function imageBounds(image) {
  let left = image.width, top = image.height, right = -1, bottom = -1;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const index = (y * image.width + x) * 4;
    if (image.data[index + 3] > 0 && Math.min(...image.data.subarray(index, index + 3)) < 200) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  assert.ok(right >= left && bottom >= top, 'Receipt must contain ink');
  return { left, top, right, bottom };
}
app.on('window-all-closed', () => {});
ipcMain.handle('hardware:printReady', (event, height) => {
  ipcMain.emit(`print-ready-${event.sender.id}`, height);
  return { success: true };
});
app.whenReady().then(async () => {
  const results = [];
  try {
    for (const count of [2, 60]) {
      const before = new Set((await receipts()).map(receipt => receipt.id));
      const data = {
        shopName: 'NAFID THERMAL TEST', shopAddress: 'Synthetic test - no customer data', shopPhone: '0000000000',
        invoiceNumber: `LAB-${count}`, date: '2026-10-30T10:00:00Z', staffName: 'TEST', state: 'KL',
        items: count === 2 ? [
          { name: 'S.S Baby Bucket No 4', quantity: 1, unit_price: 195, total: 195 },
          { name: 'Fiber Cap No 1', quantity: 1, unit_price: 135, total: 135 },
        ] : Array.from({ length: count }, (_, i) => ({ name: `Thermal test product ${i + 1}`, quantity: 1, unit_price: 10, total: 10 })),
        subtotal: count === 2 ? 330 : 600, discount: count === 2 ? 30 : 0, grandTotal: count === 2 ? 300 : 600,
        tax: 0, invoiceType: 'BOS',
      };
      let printCalls = 0;
      class ObservedWindow extends BrowserWindow {
        constructor(settings) {
          super(settings);
          const nativePrint = this.webContents.print.bind(this.webContents);
          this.webContents.print = (settings, callback) => {
            printCalls++;
            assert.equal(settings.deviceName, options.printer);
            assert.equal(settings.scaleFactor, 100);
            assert.equal(settings.pageSize, undefined, 'Thermal print must use the configured driver roll');
            nativePrint(settings, callback);
          };
        }
      }
      const context = {
        electron_1: { app, BrowserWindow: ObservedWindow, ipcMain }, path_1: { default: path }, receiptHtml_js_1: receiptHtml,
        __dirname: path.join(base, 'dist-electron/hardware'), getPrintFormatConfig: () => ({}), getPrinterConfig: () => ({}),
        currentReceiptText: generateReceiptText(data, width / 10, undefined, 'boxed'),
        resolvePrinterDeviceName: async () => ({ deviceName: options.printer, actualNameUsed: options.printer }),
        setTimeout, clearTimeout, console,
      };
      await vm.runInNewContext(`${compiled}\nprintReceiptUSB`, context)(options.printer, width, 'lab');
      const deadline = Date.now() + 15000;
      let received = [];
      while (Date.now() < deadline) {
        received = (await receipts()).filter(receipt => !before.has(receipt.id));
        if (received.length) break;
        await pause(200);
      }
      assert.equal(received.length, 1, 'Expect exactly one cut-delimited thermal receipt');
      await pause(1000);
      assert.equal((await receipts()).filter(receipt => !before.has(receipt.id)).length, 1, 'No duplicate cuts/jobs');
      const receipt = received[0];
      assert.equal(receipt.boundary, 'cut');
      const png = Buffer.from(await (await request(`receipts/${encodeURIComponent(receipt.id)}/image`)).arrayBuffer());
      fs.writeFileSync(path.join(output, `thermal-${count}-items.png`), png);
      const image = PNG.sync.read(png), bounds = imageBounds(image);
      const leadingBlankMm = bounds.top * 25.4 / dpi;
      assert.ok(leadingBlankMm <= 8, `Excessive leading feed: ${leadingBlankMm} mm`);
      assert.ok(bounds.left > 0 && bounds.right < image.width - 1, 'Receipt ink/borders must not touch clipped driver edges');
      assert.equal(printCalls, 1);
      results.push({ count, receipt, image: { width: image.width, height: image.height }, bounds, leadingBlankMm, printCalls });
      console.log(JSON.stringify(results.at(-1)));
    }
    fs.writeFileSync(path.join(output, 'thermal-driver-results.json'), JSON.stringify(results, null, 2));
    console.log('PASS: short/long thermal driver jobs, leading feed, printable bounds and one cut per bill');
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    for (const win of BrowserWindow.getAllWindows()) win.destroy();
    app.quit();
  }
});
