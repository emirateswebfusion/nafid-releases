const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
const dbPath = path.join(appData, 'vendora', 'vendora.db');

console.log("DB Path:", dbPath);

if (fs.existsSync(dbPath)) {
  const db = new Database(dbPath);
  const rows = db.prepare("SELECT key, value FROM settings WHERE tenant_id = 'global' AND key IN ('dual_invoice_series', 'invoice_counter_config', 'gst_invoice_counter_config')").all();
  console.log("SETTINGS ROWS:\n", JSON.stringify(rows, null, 2));
} else {
  console.log("DB NOT FOUND AT", dbPath);
}
