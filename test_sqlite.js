const db = require('better-sqlite3')(':memory:');
db.exec('CREATE TABLE products (product_id TEXT PRIMARY KEY, sync_status TEXT);');
db.exec(`INSERT INTO products (product_id, sync_status) VALUES ('1', 'SYNCED') ON CONFLICT(product_id) DO UPDATE SET sync_status = 'SYNCED' WHERE products.sync_status != 'PENDING';`);
console.log('Success');
