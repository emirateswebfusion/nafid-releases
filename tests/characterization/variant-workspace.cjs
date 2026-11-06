/** Run Vite on 127.0.0.1:5189 first. Uses no shop database, credentials or network. */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.name = 'Nafid variant checks';
app.setPath('userData', path.join(require('node:os').tmpdir(), 'nafid-variant-checks-' + process.pid));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1280, height: 900, title: 'Nafid variant checks', webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await window.loadURL('http://127.0.0.1:5189/tests/fixtures/variantWorkspace.html');
});
app.on('window-all-closed', () => app.quit());
