const Database = require('better-sqlite3');
const db = new Database('C:/Users/suhai/AppData/Roaming/nafid/vendora_v2.db', { readonly: true });
const tenantId = '487b001a-8e5d-447f-97c4-9460ce51b1e7';

console.log('=== INDEPENDENT GROUND TRUTH AUDIT (tenant: ' + tenantId + ') ===\n');

// 1. INVOICES MTD
console.log('--- 1. INVOICES MTD (2026-10-01 to 2026-10-31) ---');
const invsMtd = db.prepare(`
  SELECT invoice_id, invoice_number, grand_total, payment_method, is_held, is_deleted, converted_to_invoice_id, created_at
  FROM invoices
  WHERE tenant_id = ?
    AND (is_deleted IS NULL OR is_deleted = 0 OR is_deleted = '0')
    AND invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')
    AND (is_held IS NULL OR is_held = 0)
    AND date(created_at) >= '2026-10-01' AND date(created_at) <= '2026-10-31'
  ORDER BY created_at ASC
`).all(tenantId);

console.log('Total non-held, non-deleted invoices in MTD range:', invsMtd.length);
const convertedInvs = invsMtd.filter(i => i.converted_to_invoice_id);
console.log('Converted hold bills in MTD range:', convertedInvs.length, convertedInvs.map(i => ({ no: i.invoice_number, conv: i.converted_to_invoice_id, amt: i.grand_total })));

const validMtd = invsMtd.filter(i => !i.converted_to_invoice_id);
console.log('Valid bill count after deduplication:', validMtd.length);
const totalSalesMtd = validMtd.reduce((s, i) => s + Number(i.grand_total), 0);
console.log('Total Sales MTD:', totalSalesMtd);
console.log('Avg Ticket MTD:', totalSalesMtd / validMtd.length);

// 2. PAYMENT BREAKDOWN MTD
console.log('\n--- 2. PAYMENT METHODS MTD ---');
const pmTotals = { cash: 0, upi: 0, card: 0, credit: 0, other: 0 };
validMtd.forEach(i => {
  const m = (i.payment_method || '').toUpperCase();
  const amt = Number(i.grand_total);
  if (m.includes('CASH')) pmTotals.cash += amt;
  else if (m.includes('UPI')) pmTotals.upi += amt;
  else if (m.includes('CARD')) pmTotals.card += amt;
  else if (m.includes('CREDIT')) pmTotals.credit += amt;
  else pmTotals.other += amt;
});
console.log('Payment breakdown:', pmTotals);

// 3. YESTERDAY (2026-10-15)
console.log('\n--- 3. YESTERDAY SALES (2026-10-15) ---');
const yInvs = db.prepare(`
  SELECT invoice_id, invoice_number, grand_total, payment_method, converted_to_invoice_id
  FROM invoices
  WHERE tenant_id = ?
    AND (is_deleted IS NULL OR is_deleted = 0 OR is_deleted = '0')
    AND invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')
    AND (is_held IS NULL OR is_held = 0)
    AND date(created_at) = '2026-10-15'
`).all(tenantId);
const yValid = yInvs.filter(i => !i.converted_to_invoice_id);
console.log('Yesterday valid bills:', yValid.length, 'Total:', yValid.reduce((s, i) => s + Number(i.grand_total), 0), yValid);

// 4. TODAY (2026-10-16)
console.log('\n--- 4. TODAY SALES (2026-10-16) ---');
const tInvs = db.prepare(`
  SELECT invoice_id, invoice_number, grand_total, payment_method, converted_to_invoice_id
  FROM invoices
  WHERE tenant_id = ?
    AND (is_deleted IS NULL OR is_deleted = 0 OR is_deleted = '0')
    AND invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')
    AND (is_held IS NULL OR is_held = 0)
    AND date(created_at) = '2026-10-16'
`).all(tenantId);
const tValid = tInvs.filter(i => !i.converted_to_invoice_id);
console.log('Today valid bills:', tValid.length, 'Total:', tValid.reduce((s, i) => s + Number(i.grand_total), 0));

// 5. CUSTOMER BALANCES (Parties with type customer or balance)
console.log('\n--- 5. CUSTOMER & SUPPLIER BALANCES ---');
const parties = db.prepare(`
  SELECT name, phone, balance, party_type
  FROM parties
  WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
  ORDER BY balance DESC
`).all(tenantId);

const custReceivables = parties.filter(p => Number(p.balance) > 0);
console.log('Customers owing money count:', custReceivables.length);
console.log('Total Customer Receivables:', custReceivables.reduce((s, p) => s + Number(p.balance), 0));
custReceivables.forEach(p => console.log('  -', p.name, '(' + p.phone + '):', p.balance));

const suppPayables = parties.filter(p => p.party_type === 'SUPPLIER' || Number(p.balance) < 0);
console.log('Suppliers / negative balance:', suppPayables);

// 6. EXPENSES MTD
console.log('\n--- 6. EXPENSES MTD ---');
const expMtd = db.prepare(`
  SELECT transaction_id, type, amount, category, notes, transaction_date
  FROM cash_transactions
  WHERE (tenant_id = ? OR tenant_id IS NULL)
    AND type IN ('EXPENSE', 'CASHOUT', 'CASH_OUT')
    AND date(transaction_date) >= '2026-10-01' AND date(transaction_date) <= '2026-10-31'
`).all(tenantId);
console.log('Expenses MTD count:', expMtd.length, 'Total:', expMtd.reduce((s, e) => s + Number(e.amount), 0), expMtd);

// 7. RETURNS MTD
console.log('\n--- 7. RETURNS MTD ---');
const retsMtd = db.prepare(`
  SELECT return_id, return_number, grand_total, refund_method, created_at
  FROM returns
  WHERE tenant_id = ?
    AND date(created_at) >= '2026-10-01' AND date(created_at) <= '2026-10-31'
`).all(tenantId);
console.log('Returns MTD count:', retsMtd.length, 'Total refunded:', retsMtd.reduce((s, r) => s + Number(r.grand_total), 0), retsMtd);

// 8. INVENTORY VALUATION
console.log('\n--- 8. INVENTORY VALUATION ---');
const prods = db.prepare(`
  SELECT product_id, name, current_stock, purchase_price, base_price, is_deleted
  FROM products
  WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
`).all(tenantId);
const inStock = prods.filter(p => Number(p.current_stock) > 0);
const outOfStock = prods.filter(p => Number(p.current_stock) <= 0);
const totalCostVal = inStock.reduce((s, p) => s + (Number(p.current_stock) * Number(p.purchase_price || 0)), 0);
const totalRetailVal = inStock.reduce((s, p) => s + (Number(p.current_stock) * Number(p.base_price || 0)), 0);
const totalUnits = inStock.reduce((s, p) => s + Number(p.current_stock), 0);
console.log('In-stock items count:', inStock.length, 'Total units:', totalUnits);
console.log('Cost Valuation:', totalCostVal);
console.log('Retail Valuation:', totalRetailVal);
console.log('Out of stock count (<=0):', outOfStock.length);
