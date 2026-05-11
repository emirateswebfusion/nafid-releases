const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Path to SQLite DB (userData/vendora.db)
// On Windows: %APPDATA%\vendora\vendora.db or similar
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'vendora', 'vendora.db');

try {
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare('SELECT invoice_number, user_id, tenant_id FROM invoices LIMIT 10').all();
  console.log('Sample Invoices:');
  console.table(rows);
  
  const userCounts = db.prepare('SELECT user_id, COUNT(*) as count FROM invoices GROUP BY user_id').all();
  console.log('Invoice counts per user_id:');
  console.table(userCounts);
  
} catch (err) {
  console.error('Error reading DB:', err.message);
  console.log('Trying alternative paths...');
  // Try another common path
  const altPath = path.join(os.homedir(), '.config', 'vendora', 'vendora.db');
}
