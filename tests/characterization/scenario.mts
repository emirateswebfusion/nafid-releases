/** IPC scenario replayed by run.mts: seeds a tenant, then sweeps every channel. Same order on both sides. */
const T = 't1';
const P1 = '11111111-1111-4111-8111-111111111111', P2 = '22222222-2222-4222-8222-222222222222';
const C1 = 'c0000000-0000-4000-8000-000000000001', PA = 'a0000000-0000-4000-8000-000000000001';
const I1 = 'f0000000-0000-4000-8000-000000000001', I2 = 'f0000000-0000-4000-8000-000000000002', I3 = 'f0000000-0000-4000-8000-000000000003';
const SKIP = /^(sync:(runInitial|drainPendingCloudQueue|forceResyncInvoices|testConnection)|ecommerce:(testConnection|registerVendor|refreshStatus|syncProduct|unpublishProduct|getOrders)|app:|emergency:|db:getNextServerInvoiceNumber|auth:(saveToken|getToken|clearToken))/;
export default async function (call: (ch: string, ...a: unknown[]) => Promise<any>, channels: string[]) {
  const prod = (id: string, name: string, price: number, extra = {}) => ({ product_id: id, tenant_id: T, name, sku_barcode: name.slice(0, 3).toUpperCase() + '1', item_code: null, category: 'General', hsn_sac_code: '7308', purchase_price: price * 0.7, base_price: price, is_gst_applicable: 1, tax_rate_percent: 18, uom: 'Pcs', brand_manufacturer: 'X', current_stock: 50, reorder_level: 5, domain_attributes: {}, ...extra });
  await call('db:addProduct', prod(P1, 'Steel Rod', 100));
  await call('db:addProduct', prod(P2, 'Cement Bag', 400, { uom: 'Kgs' }));
  await call('settings:set', { tenant_id: T, key: 'store_name', value: 'Test Store' });
  await call('db:createCustomer', { customer_id: C1, tenant_id: T, name: 'Ravi Kumar', phone: '9876543210', address: 'Kochi' });
  await call('db:addParty', { party_id: PA, tenant_id: T, name: 'Acme Traders', phone: '9123456780', balance: 0, balance_type: 'GST', party_type: 'CUSTOMER' });
  await call('db:addPricingTier', { tier_id: 'tier1', tenant_id: T, name: 'Wholesale', discount_percent: 5 });
  await call('db:addGrade', { grade_id: 'g1', tenant_id: T, name: 'Fe500', rate: 70, purchase_price: 60 });
  await call('db:addScrapCategory', { scrap_category_id: 's1', tenant_id: T, name: 'Iron', purchase_price: 30, selling_price: 35, unit: 'Kgs' });
  await call('db:payments:addSource', { source_id: 'ps1', tenant_id: T, name: 'HDFC', type: 'BANK', opening_balance: 1000, is_enabled: 1 });
  await call('db:cashier:addCategory', { tenant_id: T, name: 'Tea', type: 'CASH_OUT' });
  await call('db:saveStaff', { tenant_id: T, staff_id: 'st1', name: 'Anu', phone: '9000000001', monthly_salary: 15000, status: 'ACTIVE', joining_date: '2026-01-01' });
  const item = (pid: string, name: string, qty: number, price: number) => ({ product_id: pid, name, quantity: qty, unit_price: price, tax_amount: +(qty * price * 0.18 / 1.18).toFixed(2), total: qty * price, uom: 'Pcs', billing_type: 'PIECE', hsn_sac_code: '7308', tax_rate_percent: 18 });
  const inv = (id: string, method: string, items: any[], extra = {}) => { const total = items.reduce((s, i) => s + i.total, 0); const tax = items.reduce((s, i) => s + i.tax_amount, 0); return { invoice_id: id, tenant_id: T, invoice_type: 'GST', user_id: 'u1', subtotal: +(total - tax).toFixed(2), tax_total: tax, discount_total: 0, grand_total: total, payment_method: method, received_amount: method === 'CREDIT' ? 0 : total, balance_amount: method === 'CREDIT' ? total : 0, customer_name: 'Ravi Kumar', customer_phone: '9876543210', customer_id: C1, items, ...extra }; };
  await call('db:checkout', inv(I1, 'CASH', [item(P1, 'Steel Rod', 2, 100), item(P2, 'Cement Bag', 1, 400)]));
  await call('db:checkout', inv(I2, 'CREDIT', [item(P1, 'Steel Rod', 1, 100)], { customer_name: 'Acme Traders', customer_phone: '9123456780', customer_id: PA, party_id: PA }));
  await call('db:checkout', inv(I3, 'CASH', [item(P2, 'Cement Bag', 2, 400)], { invoice_type: 'BILL_OF_SUPPLY', tax_total: 0 }));
  await call('db:holdBill', { ...inv('f0000000-0000-4000-8000-0000000000aa', 'CASH', [item(P1, 'Steel Rod', 1, 100)]), hold_note: 'later' });
  await call('db:saveQuotation', { quotation_id: 'q1', tenant_id: T, quotation_number: 'Q-1', customer_name: 'Ravi', is_gst: 1, subtotal: 100, tax_total: 18, grand_total: 118, items: [item(P1, 'Steel Rod', 1, 100)] });
  await call('db:addPartyLedgerEntry', { ledger_id: 'l1', party_id: PA, tenant_id: T, description: 'Payment received', credit_amount: 0, debit_amount: 50, balance_type: 'GST', payment_method: 'CASH' });
  await call('db:cashier:addTransaction', { tenant_id: T, type: 'CASH_OUT', amount: 20, category: 'Tea', notes: 'tea', user_id: 'u1', user_name: 'Admin' });
  await call('db:addScrapTransaction', { transaction_id: 'sx1', tenant_id: T, type: 'PURCHASE', scrap_category_id: 's1', quantity: 10, rate: 30, total_amount: 300, party_name: 'Ravi' });
  await call('db:saveWarranty', { warranty_id: 'w1', tenant_id: T, invoice_id: I1, product_name: 'Steel Rod', customer_name: 'Ravi', customer_phone: '9876543210', warranty_months: 12, start_date: '2026-10-22' });
  await call('db:updateInvoicePayment', { invoice_id: I2, tenant_id: T, received_amount: 50, payment_method: 'CASH' });
  // generic sweep: every channel with several argument shapes (writes included, same order on both sides)
  const obj = { tenant_id: T, tenantId: T, user_id: 'u1', role: 'ADMIN', search: 'Ste', limit: 50, offset: 0, invoice_id: I1, invoice_ids: [I3], customer_id: C1, party_id: PA, product_id: P1, product_ids: [P1, P2], quotation_id: 'q1', staff_id: 'st1', month: '2026-10', date: '2026-10-22', filterDate: '2026-10-01', filterDateEnd: '2026-10-31', phone: '9876543210', name: 'Ravi Kumar', type: 'CASH_OUT', invoice_number: 'X', series: 'A' };
  const shapes: unknown[][] = [[obj], [T], [I1], [T, obj], [P1], [[P1, P2]], []];
  const destructive = /(delete|purge|empty|hardDelete|merge|dedup|bulk|reset|clear|restore|settle|convert|close|dayClosing|reopen|recalc|release|recall|expire|update|set|save|add|adjust|create|upsert|hold|checkout|toggle|reorder|apply|generate|ensure|verify|log:|auth:)/i;
  const reads = channels.filter(c => !SKIP.test(c) && !destructive.test(c.split(':').pop()!)).sort();
  for (const ch of reads) for (const s of shapes) await call(ch, ...s);
  const writes = channels.filter(c => !SKIP.test(c) && destructive.test(c.split(':').pop()!)).sort();
  for (const ch of writes) for (const s of shapes) await call(ch, ...s);
  for (const ch of reads) await call(ch, obj);
}
