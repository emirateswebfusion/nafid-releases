import { bindBridge } from './client';

/** Soft-deleted records, restore, hard delete and emergency purge. Channel catalog — the only way UI code reaches these IPC channels. */
export const recycleBinApi = bindBridge({
  emergencyPurge: 'dbEmergencyPurge',
  getDeletedInvoices: 'dbGetDeletedInvoices',
  restoreInvoice: 'dbRestoreInvoice',
  hardDeleteInvoice: 'dbHardDeleteInvoice',
  getDeletedProducts: 'dbGetDeletedProducts',
  restoreProduct: 'dbRestoreProduct',
  hardDeleteProduct: 'dbHardDeleteProduct',
  getDeletedCustomers: 'dbGetDeletedCustomers',
  restoreCustomer: 'dbRestoreCustomer',
  getDeletedParties: 'dbGetDeletedParties',
  hardDeleteCustomer: 'dbHardDeleteCustomer',
  hardDeleteParty: 'dbHardDeleteParty',
  getRecycleBinSummary: 'dbGetRecycleBinSummary',
  emptyRecycleBin: 'dbEmptyRecycleBin',
});
