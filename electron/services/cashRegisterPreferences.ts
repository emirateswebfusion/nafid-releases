import type { Db } from '../db/statements/types.js';
import { findDrawerSetting } from '../db/statements/cashDrawer.js';

export function getCashRegisterPreferences(db: Db, tenantId: string) {
  const read = (key: string): unknown => {
    const row = findDrawerSetting(db).get(tenantId, key, tenantId) as { value?: unknown } | undefined;
    if (typeof row?.value !== 'string') return row?.value;
    try { return JSON.parse(row.value); } catch { return row.value; }
  };
  const ledger = read('cash_register_ledger_mode');
  const methods = read('cash_register_payment_methods');
  return {
    includeScrapSales: read('cash_register_include_scrap_sales') !== false,
    deductReturns: read('cash_register_deduct_returns') !== false,
    ledgerMode: ledger === 'off' || ledger === 'all' ? ledger : 'today',
    paymentMethods: Array.isArray(methods) ? methods.filter((m): m is string => typeof m === 'string' && ['UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'].includes(m)) : [],
  };
}
