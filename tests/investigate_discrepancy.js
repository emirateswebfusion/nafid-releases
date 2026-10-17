const Database = require('better-sqlite3');
const db = new Database('C:/Users/suhai/AppData/Roaming/nafid/vendora_v2.db', { readonly: true });
const tenantId = '487b001a-8e5d-447f-97c4-9460ce51b1e7';

console.log('--- RETURN POS1-RTN-003 ---');
const r3 = db.prepare("SELECT * FROM returns WHERE return_number = 'POS1-RTN-003'").get();
console.log(r3);

console.log('\n--- RETURN ITEMS FOR POS1-RTN-003 ---');
if (r3) {
  const rItems = db.prepare("SELECT * FROM return_items WHERE return_id = ?").all(r3.return_id);
  console.log(rItems);
}

console.log('\n--- SUHAIB PARTY DETAILS & LEDGER ---');
const suhaib = db.prepare("SELECT * FROM parties WHERE tenant_id = ? AND (name LIKE '%suhaib%' OR phone = '8078075855')").all(tenantId);
console.log('Parties row for suhaib:', suhaib);

if (suhaib.length > 0) {
  const ledger = db.prepare("SELECT * FROM party_ledger WHERE party_id = ? ORDER BY created_at DESC LIMIT 10").all(suhaib[0].party_id);
  console.log('Suhaib party_ledger recent rows:', ledger);
}
