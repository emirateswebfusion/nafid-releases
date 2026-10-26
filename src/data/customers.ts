import { bindBridge } from './client';
import type { CustomersRow } from './dbRows';

/** A customer as `db:getCustomers` returns it: the stored row, the linked party's balance and tier name, and the
 * overdue status customersService adds. */
export interface CustomerListItem extends Omit<CustomersRow, 'credit_period_enabled' | 'restrict_on_credit_expiry'> {
  /** 0/1 in SQLite; screens also hold booleans before saving. */
  credit_period_enabled: number | boolean | null;
  restrict_on_credit_expiry: number | boolean | null;
  party_balance?: number | null;
  pricing_tier_name?: string | null;
  has_overdue?: boolean;
  overdue_bills_count?: number;
  overdue_amount?: number;
  oldest_overdue_days?: number;
}

/** Customers, credit status and loyalty points. Channel catalog — the only way UI code reaches these IPC channels. */
export const customersApi = bindBridge({
  getCustomers: 'dbGetCustomers',
  createCustomer: 'dbCreateCustomer',
  checkCustomerCreditStatus: 'dbCheckCustomerCreditStatus',
  findCustomers: 'dbFindCustomers',
  updateCustomer: 'dbUpdateCustomer',
  deleteCustomer: 'dbDeleteCustomer',
  deduplicateCustomers: 'dbDeduplicateCustomers',
  getCustomerInvoices: 'dbGetCustomerInvoices',
  getCustomerLoyaltyTransactions: 'dbGetCustomerLoyaltyTransactions',
  adjustCustomerLoyaltyPoints: 'dbAdjustCustomerLoyaltyPoints',
  recalculateCustomerLoyaltyPoints: 'dbRecalculateCustomerLoyaltyPoints',
});
