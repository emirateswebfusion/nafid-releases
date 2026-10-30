const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { app, BrowserWindow } = require('electron');
const ts = require('typescript');
const base = path.resolve(__dirname, '../..');
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
assert.ok(output && path.isAbsolute(output), 'Pass --output=ABSOLUTE_DIRECTORY outside the repo');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
const { generateReceiptText } = require(path.join(base, 'src/utils/print/receiptGenerator.ts'));
const { buildReceiptHtml } = require(path.join(base, 'dist-electron/hardware/receiptHtml.js'));
const inspect = `(() => {
  const rows = [...document.querySelectorAll('pre')];
  return rows.map(row => {
    const range = document.createRange(); range.selectNodeContents(row);
    const text = range.getBoundingClientRect(), bounds = row.getBoundingClientRect();
    return { text: row.textContent.trim(), available: row.clientWidth, actual: text.width, left: text.left, right: text.right, rowLeft: bounds.left, rowRight: bounds.right, align: getComputedStyle(row).textAlign, span: row.firstElementChild.getBoundingClientRect().toJSON(),
      overflow: text.width > 0 && (text.width > bounds.width + 0.5 || text.left < bounds.left - 0.5 || text.right > bounds.right + 0.5) };
  }).filter(row => row.overflow);
})()`;
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  let win;
  try {
    const data = {
      shopName: 'NAFID THERMAL TEST', shopAddress: 'Synthetic test - no customer data',
      invoiceNumber: 'LAB-2477', date: '2026-10-30T14:00:00Z', billerName: 'TEST',
      items: [['KAI MANI', 1, 550], ['MANI', 1, 30], ['BRASS MANI', 1, 895], ['KADUK TAWA S', 1, 120], ['GLASS', 2, 12]]
        .map(([name, quantity, unit_price]) => ({ name, quantity, unit_price, total: quantity * unit_price })),
      subtotal: 1619, discount: 0, tax: 0, grandTotal: 1619,
    };
    const results = [];
    win = new BrowserWindow({ show: false, width: 303, height: 2000, webPreferences: { sandbox: true, backgroundThrottling: false, offscreen: true } });
    for (const style of ['boxed', 'standard', 'compact', 'modern', 'clean', 'classic', 'dot', 'slim', 'luxe']) {
      for (const font of ['Consolas, monospace', '"Courier New", monospace', '"Lucida Console", monospace']) {
        for (const width of [58, 80]) {
          const receipt = generateReceiptText(data, width / 10, undefined, style);
          let html = await buildReceiptHtml(receipt, width, font, 0, true,
            { paperWidthMm: width, printableWidthMm: width - 8, leftMm: 4 });
          html = html.replace('<head>', '<head><script>HTMLCanvasElement.prototype.getContext=()=>null;</script>');
          await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
          await win.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
          const check = async stage => assert.deepEqual(await win.webContents.executeJavaScript(inspect), [], `${style}/${font}/${width}/${stage}: text must fit its rows`);
          await check('loaded without canvas');
          await win.webContents.executeJavaScript(`document.querySelector('.receipt-content').style.width='70%'`);
          await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
          await check('width changed after readiness');
          await win.webContents.executeJavaScript(`window.dispatchEvent(new Event('beforeprint'))`);
          await check('print layout');
          if (style === 'boxed' && font === 'Consolas, monospace') {
            fs.writeFileSync(path.join(output, `receipt-${width}-narrowed.png`), (await win.webContents.capturePage()).toPNG());
          }
          results.push({ style, font, width, canvas: false, stages: 3, overflow: false });
          if (results.length % 18 === 0) console.log('Checked receipts:', results.length);
        }
      }
    }
    fs.writeFileSync(path.join(output, 'receipt-layout-results.json'), JSON.stringify(results, null, 2));
    console.log(`PASS: ${results.length} receipts / ${results.length * 3} layout checks, canvas disabled, late width changes, beforeprint`);
    app.exit(0);
  } catch (error) {
    console.error(error.stack);
    app.exit(1);
  }
});
