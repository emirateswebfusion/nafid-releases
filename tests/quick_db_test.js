const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

app.whenReady().then(() => {
  try {
    const db = new Database('C:/Users/suhai/AppData/Roaming/nafid/vendora_v2.db', { readonly: true });
    const count = db.prepare('SELECT count(*) as count FROM invoices').get();
    console.log('SUCCESS_INVOICE_COUNT:', JSON.stringify(count));
    const parties = db.prepare('SELECT name, balance FROM parties LIMIT 3').all();
    console.log('SUCCESS_PARTIES:', JSON.stringify(parties));
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    app.quit();
  }
});
