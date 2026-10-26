import { bindBridge } from './client';
import type { PurchaseBillItemsRow } from './dbRows';
import type { Product } from './products';

/** A product as `db:getPurchaseBillProducts` returns it (`getPurchaseBillProductsStatement`): the stored row plus
 * the quantity and latest price bought on GST / paper bills and the latest paper MRP (each COALESCE(…, 0)). */
export interface PurchaseSearchProduct extends Product {
  gst_purchase_quantity: number;
  gst_purchase_price: number;
  paper_mrp: number;
}

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
