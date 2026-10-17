const Database = require('better-sqlite3');
const db = new Database('C:/Users/suhai/AppData/Roaming/nafid/vendora_v2.db', { readonly: true });
const tenantId = '487b001a-8e5d-447f-97c4-9460ce51b1e7';

console.log('--- PRODUCT DETAILS FOR KNIFE ---');
const knife = db.prepare("SELECT * FROM products WHERE product_id = 'c49cf06c-198c-4a8a-b6ec-1de840c433b2'").get();
console.log(knife);

console.log('\n--- STOCK MOVEMENTS FOR KNIFE ---');
try {
  const sm = db.prepare("SELECT * FROM stock_movements WHERE product_id = 'c49cf06c-198c-4a8a-b6ec-1de840c433b2' ORDER BY created_at DESC LIMIT 5").all();
  console.log(sm);
} catch (e) {
  console.log('stock_movements query error:', e.message);
}

console.log('\n--- ALL PRODUCTS STOCK BREAKDOWN ---');
const allProds = db.prepare("SELECT name, current_stock, purchase_price, base_price, is_deleted FROM products WHERE tenant_id = ? ORDER BY current_stock DESC").all(tenantId);
console.log('Total products in tenant:', allProds.length);
const inStock = allProds.filter(p => (p.is_deleted === 0 || p.is_deleted === null) && Number(p.current_stock) > 0);
console.log('Active in-stock products:', inStock.length);
const totalUnits = inStock.reduce((s, p) => s + Number(p.current_stock), 0);
console.log('Total in-stock units sum:', totalUnits);
inStock.forEach(p => console.log('  -', p.name + ':', p.current_stock, 'units @ cost', p.purchase_price, 'retail', p.base_price));
