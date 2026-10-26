import { bindBridge } from './client';
import type { CustomersRow, InvoicesRow, PartiesRow, ProductsRow } from './dbRows';

/** A soft-deleted invoice as `db:getDeletedInvoices` selects it (`deleted_at` falls back to `updated_at` on old schemas). */
export type DeletedInvoice = Pick<InvoicesRow, 'invoice_id' | 'invoice_number' | 'customer_name' | 'customer_phone' | 'grand_total' | 'payment_method' | 'invoice_type' | 'created_at' | 'updated_at' | 'deleted_at'>;

/** A soft-deleted product as `db:getDeletedProducts` selects it (`barcode` = COALESCE(sku_barcode, '')). */
export type DeletedProduct = Pick<ProductsRow, 'product_id' | 'name' | 'category' | 'current_stock' | 'base_price' | 'updated_at'> & {
  barcode: string;
};

/** A soft-deleted customer as `db:getDeletedCustomers` selects it (`email` is always ''; customers have no email column). */
export type DeletedCustomer = Pick<CustomersRow, 'customer_id' | 'name' | 'phone' | 'current_points_balance' | 'updated_at'> & {
  email: string;
};

/** A soft-deleted party as `db:getDeletedParties` selects it. */
export type DeletedParty = Pick<PartiesRow, 'party_id' | 'name' | 'phone' | 'address' | 'balance' | 'balance_type' | 'party_type' | 'updated_at'>;

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
