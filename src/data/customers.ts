import { bindBridge } from './client';

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
