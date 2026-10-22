import { bindBridge } from './client';

/** Purchase bills and suppliers. Channel catalog — the only way UI code reaches these IPC channels. */
export const purchasesApi = bindBridge({
  getProductSuppliers: 'dbGetProductSuppliers',
  peekNextPurchaseBillNumber: 'dbPeekNextPurchaseBillNumber',
  getNextPurchaseBillNumber: 'dbGetNextPurchaseBillNumber',
  addPurchaseBill: 'dbAddPurchaseBill',
  getPurchaseBills: 'dbGetPurchaseBills',
  getPurchaseBillItems: 'dbGetPurchaseBillItems',
  updatePurchaseBill: 'dbUpdatePurchaseBill',
  deletePurchaseBill: 'dbDeletePurchaseBill',
  getPurchaseBillProducts: 'dbGetPurchaseBillProducts',
});
