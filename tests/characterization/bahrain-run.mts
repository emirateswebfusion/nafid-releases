/**
 * A Bahrain shop driven through the real IPC handlers on a real better-sqlite3 database (same bootstrap as run.mts):
 * country selection, a BHD 0.185 product, cash / split / credit bills, a later payment, a return, payment accounts
 * and the cash drawer close. Every amount is checked to the fils; expected values are worked out by hand.
 * Usage (see README.md): EQ_USERDATA=<empty dir> npx tsx bahrain-run.mts <treeRoot>
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tree = path.resolve(process.argv[2]);
const handlers: Map<string, Function> = ((globalThis as any).__handlers ||= new Map());
const realLog = console.log;
console.log = () => {}; console.warn = () => {}; console.error = () => {};

const { initDb, getDb } = await import(pathToFileURL(path.join(tree, 'electron/db/localDb.ts')).href);
initDb();
const ipc = await import(pathToFileURL(path.join(tree, 'electron/ipc/index.ts')).href);
ipc.registerAllIpcHandlers();
const db = getDb();

const event = { sender: { send() {}, isDestroyed: () => false } };
async function call(channel: string, ...args: unknown[]): Promise<any> {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`no handler: ${channel}`);
  return fn(event, ...args);
}

let failures = 0;
const fils = (n: unknown) => Math.round(Number(n) * 1000);
function check(label: string, actual: unknown, expected: unknown) {
  const ok = typeof expected === 'number' ? fils(actual) === fils(expected) && Math.abs(Number(actual) - expected) < 1e-9 : actual === expected;
  if (!ok) failures++;
  realLog(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}${ok ? '' : `  (expected ${JSON.stringify(expected)})`}`);
}
const one = (sql: string, ...params: unknown[]) => db.prepare(sql).get(...params) as Record<string, any> | undefined;
const ok = (label: string, result: any) => check(label, result?.success !== false && !result?.error, true);

const T = 'bh-shop';
const P1 = '11111111-1111-4111-8111-111111111111', P2 = '22222222-2222-4222-8222-222222222222';
const C1 = 'c0000000-0000-4000-8000-000000000001', PA = 'a0000000-0000-4000-8000-000000000001';
const I1 = 'f0000000-0000-4000-8000-000000000001', I2 = 'f0000000-0000-4000-8000-000000000002', I3 = 'f0000000-0000-4000-8000-000000000003';

// 1. A new shop chooses Bahrain.
ok('choose Bahrain', await call('settings:set', { tenant_id: T, key: 'store_country', value: 'BH' }));
check('stored country', String(one("SELECT value FROM settings WHERE tenant_id = ? AND key = 'store_country'", T)?.value).replace(/"/g, ''), 'BH');
await call('settings:set', { tenant_id: T, key: 'store_name', value: 'Manama Mart' });

// 2. Catalogue, customer, accounts, drawer.
const prod = (id: string, name: string, price: number) => ({ product_id: id, tenant_id: T, name, sku_barcode: name.slice(0, 3).toUpperCase() + '1', item_code: null, category: 'General', hsn_sac_code: null, purchase_price: price * 0.7, base_price: price, is_gst_applicable: 1, tax_rate_percent: 10, uom: 'Pcs', brand_manufacturer: 'X', current_stock: 50, reorder_level: 5, domain_attributes: {} });
ok('add product Khubz 0.185', await call('db:addProduct', prod(P1, 'Khubz', 0.185)));
ok('add product Laban 0.650', await call('db:addProduct', prod(P2, 'Laban', 0.65)));
check('product price keeps fils', one('SELECT base_price FROM products WHERE product_id = ?', P1)?.base_price, 0.185);
await call('db:createCustomer', { customer_id: C1, tenant_id: T, name: 'Walk In', phone: '33000001', address: 'Manama' });
await call('db:addParty', { party_id: PA, tenant_id: T, name: 'Riffa Traders', phone: '33000002', balance: 0, balance_type: 'GST', party_type: 'CUSTOMER' });
await call('db:payments:addSource', { source_id: 'card1', tenant_id: T, name: 'NBB Card', type: 'CARD', opening_balance: 10, is_enabled: 1 });
ok('open drawer with BHD 5.000', await call('db:cashier:setOpeningBalance', { tenant_id: T, opening_balance: 5, user_id: 'u1', user_name: 'Owner' }));

// VAT 10% on top; a stored line total is net of VAT.
const item = (pid: string, name: string, qty: number, price: number, tax: number) => ({ item_id: `${pid}-${Math.random()}`, product_id: pid, name, quantity: qty, unit_price: price, tax_amount: tax, total: +(qty * price).toFixed(3), uom: 'Pcs', billing_type: 'PIECE', tax_rate_percent: 10 });
const inv = (id: string, method: string, items: any[], extra = {}) => {
  const net = +items.reduce((s, i) => s + i.total, 0).toFixed(3); const tax = +items.reduce((s, i) => s + i.tax_amount, 0).toFixed(3); const total = +(net + tax).toFixed(3);
  return { invoice_id: id, tenant_id: T, invoice_type: 'GST', user_id: 'u1', subtotal: net, tax_total: tax, discount_total: 0, grand_total: total, payment_method: method, received_amount: method === 'CREDIT' ? 0 : total, balance_amount: method === 'CREDIT' ? total : 0, customer_name: 'Walk In', customer_phone: '33000001', customer_id: C1, items, ...extra };
};

// 3. Cash bill: 3 x 0.185 = 0.555, VAT 0.056 (0.0555 rounded up), total 0.611.
ok('cash bill', await call('db:checkout', inv(I1, 'CASH', [item(P1, 'Khubz', 3, 0.185, 0.056)])));
const cash = one('SELECT grand_total, tax_total, subtotal, received_amount FROM invoices WHERE invoice_id = ?', I1)!;
check('cash bill total', cash.grand_total, 0.611); check('cash bill VAT', cash.tax_total, 0.056); check('cash bill net', cash.subtotal, 0.555);
const line = one('SELECT total, tax_amount, unit_price FROM invoice_items WHERE invoice_id = ?', I1)!;
check('line net', line.total, 0.555); check('line VAT', line.tax_amount, 0.056); check('line unit price', line.unit_price, 0.185);
check('stock 50 - 3', one('SELECT current_stock FROM products WHERE product_id = ?', P1)?.current_stock, 47);

// 4. Split bill: 2 x 0.650 = 1.300, VAT 0.130, total 1.430 paid 0.430 cash + 1.000 card.
ok('split bill', await call('db:checkout', inv(I2, 'SPLIT', [item(P2, 'Laban', 2, 0.65, 0.13)], { split_details: { cash: 0.43, card: 1 } })));
const split = one('SELECT grand_total, split_details FROM invoices WHERE invoice_id = ?', I2)!;
check('split bill total', split.grand_total, 1.43);
const parts = typeof split.split_details === 'string' ? JSON.parse(split.split_details) : split.split_details;
check('split cash part', parts?.cash, 0.43); check('split card part', parts?.card, 1);
check('card account 10.000 + 1.000', one("SELECT current_balance FROM payment_sources WHERE source_id = 'card1'")?.current_balance, 11);

// 5. Credit bill 0.611 to a party, then 0.250 received on account (the billing screen saves this as CREDIT with the
//    amount paid): 0.361 owed.
ok('credit bill', await call('db:checkout', inv(I3, 'CREDIT', [item(P1, 'Khubz', 3, 0.185, 0.056)], { customer_name: 'Riffa Traders', customer_phone: '33000002', customer_id: PA, party_id: PA })));
check('party owes after credit bill', one('SELECT balance FROM parties WHERE party_id = ?', PA)?.balance, 0.611);
ok('payment on the credit bill', await call('db:updateInvoicePayment', { invoice_id: I3, tenant_id: T, received_amount: 0.25, balance_amount: 0.361, payment_method: 'CREDIT' }));
check('party owes after 0.250 payment', one('SELECT balance FROM parties WHERE party_id = ?', PA)?.balance, 0.361);

// 6. Return one Khubz from the cash bill: 0.185 + VAT 0.019 (0.0185 rounded up) = 0.204 refunded in cash.
const itemRow = one('SELECT item_id FROM invoice_items WHERE invoice_id = ?', I1)!;
const ret = await call('db:createReturn', { return_id: 'e0000000-0000-4000-8000-000000000001', invoice_id: I1, tenant_id: T, user_id: 'u1', user_name: 'Owner', return_number: 'RET-1', customer_name: 'Walk In', customer_phone: '33000001', subtotal: 0.185, tax_total: 0.019, grand_total: 0.204, refund_method: 'CASH', reason: 'stale',
  items: [{ return_item_id: 'e1000000-0000-4000-8000-000000000001', product_id: P1, invoice_item_id: itemRow.item_id, name: 'Khubz', quantity: 1, unit_price: 0.185, tax_amount: 0.019, total: 0.185 }] });
ok('cash return', ret);
check('return total', one("SELECT grand_total FROM returns WHERE return_number = 'RET-1' AND tenant_id = ?", T)?.grand_total, 0.204);
check('stock back to 45 (47 - 3 + 1)', one('SELECT current_stock FROM products WHERE product_id = ?', P1)?.current_stock, 45);

// 7. Cash drawer: every figure to the fils, and a 5 fils excess when the count is 0.005 over.
const drawer = await call('db:cashier:getDrawer', { tenant_id: T, user_id: 'u1' });
realLog('INFO  drawer: ' + JSON.stringify({ opening: drawer?.opening_balance, cash_sales: drawer?.cash_sales, cash_in: drawer?.cash_in, cash_out: drawer?.cash_out, expected: drawer?.expected_closing }));
// Cash received: 0.611 (cash bill) + 0.430 (cash part of the split) + 0.250 (payment on the credit bill) = 1.291.
check('drawer cash sales', drawer?.cash_sales, 1.291);
const expected = Number(drawer?.expected_closing);
check('drawer expected has no sub-fils noise', Math.abs(expected * 1000 - Math.round(expected * 1000)) < 1e-6, true);
ok('close drawer 5 fils over', await call('db:cashier:dayClosing', { tenant_id: T, actual_cash: +(expected + 0.005).toFixed(3), closing_remarks: 'count', user_id: 'u1', user_name: 'Owner' }));
const closed = one('SELECT actual_cash, cash_excess, cash_short, status FROM cash_drawer WHERE tenant_id = ? ORDER BY rowid DESC LIMIT 1', T)!;
check('drawer excess 0.005', closed.cash_excess, 0.005); check('drawer short', closed.cash_short, 0); check('drawer closed', closed.status, 'CLOSED');

// 8. The country is locked once the shop has data.
const change = await call('settings:set', { tenant_id: T, key: 'store_country', value: 'IN' });
check('country change refused after trading', change?.success === false, true);

realLog(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL BAHRAIN CHECKS PASSED');
process.exit(failures ? 1 : 0);
