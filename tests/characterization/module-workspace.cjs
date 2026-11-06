/** Launch after `npx vite --host 127.0.0.1`. Uses an isolated, in-memory renderer fixture. */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const os = require('node:os');
app.name = 'Nafid module UI test';
app.setPath('userData', process.env.NAFID_UI_TEST_DATA || path.join(os.tmpdir(), 'nafid-module-renderer-test'));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1280, height: 900, title: 'Nafid modules — test shop', webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await window.loadURL('http://127.0.0.1:5173/tests/fixtures/moduleWorkspace.html');
  window.show();
});
app.on('window-all-closed', () => app.quit());
