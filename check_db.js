const Database = require('better-sqlite3');
const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
const dbPath = appData + '/vendora/vendora.db';
const fs = require('fs');

if (fs.existsSync(dbPath)) {
  const db = new Database(dbPath);
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'").get();
  console.log("TABLE SCHEMA:\n", table.sql);
  
  const indexes = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='products'").all();
  console.log("\nINDEXES:\n", indexes);
} else {
  console.log("DB NOT FOUND AT", dbPath);
}
