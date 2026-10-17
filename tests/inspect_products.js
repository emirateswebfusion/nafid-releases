const Database = require('better-sqlite3');
const db = new Database('C:/Users/suhai/AppData/Roaming/nafid/vendora_v2.db', { readonly: true });
const tenantId = '487b001a-8e5d-447f-97c4-9460ce51b1e7';
const prods = db.prepare("SELECT name, sku_barcode, base_price, purchase_price, tax_rate_percent, current_stock FROM products WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted=0) LIMIT 10").all(tenantId);
console.log(prods);
