import type { ElectronApi } from '../../../src/data/client';
import { storeCalendarDate } from '../../../src/utils/time/timezoneHelper';

let simulateReadFailure = false;
let missingDrawer = false;
export function setMissingDrawer(enabled: boolean) { missingDrawer = enabled; }
export function setReadFailure(enabled: boolean) { simulateReadFailure = enabled; }
type Channel = keyof ElectronApi;
type Bound<M extends Record<string, Channel>> = { [K in keyof M]: NonNullable<ElectronApi[M[K]]> };
const today = storeCalendarDate();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const invoices = [
  { invoice_id: 'fixture-1', invoice_number: 'DEMO-001', grand_total: 1000, subtotal: 952.38, tax_total: 47.62, discount_total: 25, payment_method: 'CASH', invoice_type: 'GST', created_at: `${date}T06:00:00Z`, customer_name: 'Ravi Kumar', customer_id: 'demo-ravi', user_id: 'demo-staff', biller_name: 'Demo Cashier', counter_name: 'Counter 1', received_amount: 1000, balance_amount: 0 },
  { invoice_id: 'fixture-2', invoice_number: 'DEMO-002', grand_total: 500, subtotal: 476.19, tax_total: 23.81, discount_total: 0, payment_method: 'CARD', invoice_type: 'GST', created_at: `${date}T07:00:00Z`, customer_name: 'Meera', customer_id: 'demo-meera', user_id: 'demo-staff', biller_name: 'Demo Cashier', counter_name: 'Counter 1', received_amount: 500, balance_amount: 0 },
];
const products = [
  { product_id: 'demo-rice', name: 'Demo Rice', sku_barcode: '629000000001', item_code: 'RICE', current_stock: 2, reorder_level: 5, min_stock_alert: 5, base_price: 50, purchase_price: 30, tax_rate_percent: 5, category: 'Grocery', uom: 'Pcs', domain_attributes: JSON.stringify({ expiry_date: date }), created_at: `${date}T05:00:00Z` },
  { product_id: 'demo-tea', name: 'Demo Tea', sku_barcode: '629000000002', current_stock: 0, reorder_level: 5, min_stock_alert: 5, base_price: 25, purchase_price: 15, tax_rate_percent: 5, category: 'Grocery', uom: 'Pcs', domain_attributes: JSON.stringify({ expiry_date: '2026-11-09' }) },
  { product_id: 'demo-cable', name: 'Demo Cable', sku_barcode: '629000000003', current_stock: 3, reorder_level: 2, base_price: 40, purchase_price: 50, category: 'Hardware', uom: 'Pcs', domain_attributes: JSON.stringify({ expiry_date: '2026-11-09' }) },
];
const transactions = [
  { transaction_id: 'demo-expense-1', type: 'CASH_OUT', amount: 30, category: 'Tea', notes: 'Staff tea', created_at: `${date}T08:00:00Z`, transaction_date: date },
  { transaction_id: 'demo-expense-2', type: 'CASH_OUT', amount: 20, category: 'Travel', notes: 'Delivery travel', created_at: `${date}T09:00:00Z`, transaction_date: date },
  { transaction_id: 'demo-capital', type: 'CASH_IN', amount: 90, category: 'Capital', notes: 'Owner deposit', created_at: `${date}T09:30:00Z`, transaction_date: date },
  { transaction_id: 'demo-collection', type: 'CASH_IN', amount: 100, category: 'Customer Payment', notes: 'Ravi old debt', created_at: `${date}T09:00:00Z`, transaction_date: date },
];
const filteredInvoices = (q?: Record<string, unknown>) => invoices.filter(i => (!q?.filterDate || i.created_at.slice(0, 10) >= String(q.filterDate)) && (!q?.filterDateEnd || i.created_at.slice(0, 10) <= String(q.filterDateEnd)));
const handlers: Record<string, (query?: Record<string, unknown>) => unknown> = {
  dbGetInvoices: filteredInvoices,
  dbGetInvoicesSummary: q => {
    const rows = filteredInvoices(q);
    const totalSales = rows.reduce((sum, i) => sum + i.grand_total, 0);
    return { totalSales, totalInvoices: rows.length, avgOrder: rows.length ? totalSales / rows.length : 0, totalTax: rows.reduce((sum, i) => sum + i.tax_total, 0), totalDiscount: rows.reduce((sum, i) => sum + i.discount_total, 0) };
  },
  dbCashierGetDrawer: () => ({ business_date: date, status: 'OPEN', opening_balance: 200, cash_sales: 1000, cash_in: 190, cash_out: 50, current_cash: 1340, expected_closing: 1340 }),
  dbCashierGetDayTransactions: q => transactions.filter(_t => (!q?.from_date || date >= String(q.from_date)) && (!q?.to_date || date <= String(q.to_date))),
  dbGetDeletedInvoices: () => [{ invoice_id: 'demo-deleted', invoice_number: 'VOID-001', customer_name: 'Ravi Kumar', grand_total: 75, created_at: `${date}T04:00:00Z`, deleted_at: `${date}T05:00:00Z` }],
  dbGetProducts: () => products,
  dbGetProductSalesSummary: q => (q?.fromDate && date < String(q.fromDate)) || (q?.toDate && date > String(q.toDate)) ? [] : [{ product_id: 'demo-rice', name: 'Demo Rice', total_qty: 20, total_revenue: 1000 }, { product_id: 'demo-tea', name: 'Demo Tea', total_qty: 20, total_revenue: 500 }],
  dbGetInvoiceItems: () => [{ product_id: 'demo-rice', name: 'Demo Rice', quantity: 20, unit_price: 50, total: 1000 }],
  dbGetParties: () => [{ party_id: 'demo-ravi', name: 'Ravi Kumar', balance: 300, current_balance: 300, balance_type: 'RECEIVABLE', party_type: 'CUSTOMER', phone: '0500000001' }, { party_id: 'demo-supplier', name: 'Demo Supplier', balance: -500, current_balance: -500, balance_type: 'PAYABLE', party_type: 'SUPPLIER' }, { party_id: 'demo-advance', name: 'Advance Supplier', balance: 200, current_balance: 200, balance_type: 'RECEIVABLE', party_type: 'SUPPLIER' }, { party_id: 'demo-dual', name: 'Dual-role Supplier', balance: -50, current_balance: -50, balance_type: 'PAYABLE', party_type: 'SUPPLIER,CUSTOMER' }],
  dbGetCustomers: () => [{ customer_id: 'demo-ravi', name: 'Ravi Kumar', phone: '0500000001', current_points_balance: 25, party_balance: 300, has_overdue: true, overdue_bills_count: 1, overdue_amount: 300, oldest_overdue_days: 10 }],
  dbGetPartyLedger: () => [{ ledger_id: 'demo-ledger', party_id: 'demo-ravi', transaction_date: date, description: 'Credit balance', credit_amount: 300, debit_amount: 0, running_balance: 300 }],
  dbGetPurchaseBills: () => [{ purchase_bill_id: 'demo-purchase', bill_number: 'PUR-001', supplier_name: 'Demo Supplier', total_amount: 150, grand_total: 150, payment_type: 'CREDIT', bill_date: date, created_at: `${date}T05:00:00Z` }],
  dbGetReturns: () => [{ return_id: 'demo-return', return_number: 'RET-001', grand_total: 50, refund_method: 'CARD', payment_method: 'CARD', return_date: date, created_at: `${date}T08:00:00Z` }],
  dbGetReturnItems: () => [{ return_id: 'demo-return', product_id: 'demo-rice', name: 'Demo Rice', quantity: 1, unit_price: 50, total: 50 }],
  settingsGet: () => ({ enabled: true, loyalty: true }),
  dbCashierGetHistory: () => [{ business_date: '2026-11-09', status: 'CLOSED', expected_closing: 1200, actual_cash: 1190 }],
  dbCashierGetDaySettlements: () => [],
  dbCashierGetPendingInvoices: () => [],
};
export function isDesktopRuntime() { return true; }
export function hasBridge(channel: Channel) { return channel in handlers; }
export function api(): ElectronApi { throw new Error('Direct bridge access is disabled in the UI fixture'); }
export function ensureSuccess(result: { success: boolean; error?: string } | null | undefined, action: string) {
  if (!result?.success) throw new Error(result?.error || `${action} failed`);
}
export function bindBridge<M extends Record<string, Channel>>(channels: M): Bound<M> {
  return Object.fromEntries(Object.entries(channels).map(([alias, channel]) => [alias, async (query?: Record<string, unknown>) => {
    if (missingDrawer && channel === 'dbCashierGetDrawer') return null;
    if (simulateReadFailure) throw new Error('Sample data read failure');
    if (!(channel in handlers)) throw new Error(`No fixture for ${channel}`);
    return handlers[channel](query);
  }])) as Bound<M>;
}
export function bindEvents<M extends Record<string, Channel>>(channels: M): Bound<M> {
  return Object.fromEntries(Object.keys(channels).map(alias => [alias, () => () => undefined])) as Bound<M>;
}
