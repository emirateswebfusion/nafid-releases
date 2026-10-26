import { bindBridge } from './client';
import type { PurchaseBillItemsRow } from './dbRows';

/** A purchase bill line with the product columns `findPurchaseBillItemsByPurchaseBillId` joins. */
export interface PurchaseBillItemWithProduct extends PurchaseBillItemsRow {
  product_name: string | null;
  sku_barcode: string | null;
  item_code: string | null;
  product_base_price: number | null;
  product_offer_price: number | null;
  product_stock: number | null;
}

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
