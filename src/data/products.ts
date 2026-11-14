import { api, type WriteResult, bindBridge } from './client';
import type { ProductsRow } from './dbRows';

/** A product as the product queries return it: the stored row plus what the list queries join (grade rate and
 * name, paper stock and the latest purchase price/MRP) and, for tier screens, its tier prices. */
export interface Product extends ProductsRow {
  grade_rate?: number | null;
  grade_purchase_price?: number | null;
  grade_name?: string | null;
  grade_category?: string | null;
  paper_stock?: number | null;
  gst_purchase_price?: number | null;
  paper_mrp?: number | null;
  pricing?: ProductTierPrice[];
}

/** Product row returned by `productsService.getStockReport` and `findProducts2`, including nullable grade joins. */
export interface StockReportProduct extends Product {
  grade_rate: number | null;
  grade_purchase_price: number | null;
  grade_name: string | null;
  grade_category: string | null;
}

/** All return shapes from `productsService.getStockReport`: rows, an empty list for a missing tenant, or its error. */
export type StockReportResult = StockReportProduct[] | { error: string };

export interface ProductTierPrice {
  pricing_tier_id: string;
  price: number | null;
}

export interface ProductQuery {
  tenant_id: string;
  search?: string;
  barcode?: string;
  limit?: number;
  offset?: number;
  category?: string;
  grade_id?: string;
  isGst?: number | boolean;
  includeDeleted?: boolean;
  onlyPendingPrint?: boolean;
  date?: string | null;
  dateEnd?: string | null;
  filterDate?: string | null;
  filterDateEnd?: string | null;
  stockStatus?: string | null;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface ProductPricingRow {
  product_id: string;
  pricing_tier_id: string;
  price: number | string | null;
  is_deleted?: number | null;
}

export interface ProductSalesSummary {
  product_id: string;
  name: string;
  gst_qty: number;
  bos_qty: number;
  total_qty: number;
  total_revenue?: number;
}

export async function listProducts(query: ProductQuery): Promise<Product[]> {
  return (await api().dbGetProducts(query)) as Product[];
}

export async function countProducts(query: ProductQuery): Promise<number> {
  return api().dbGetProductsCount(query);
}

export async function getProductsByIds(params: {
  tenant_id: string;
  product_ids: string[];
}): Promise<Product[]> {
  return (await api().dbGetProductsByIds(params)) as Product[];
}

export async function getProductPricing(tenantId: string): Promise<ProductPricingRow[]> {
  return (await api().dbGetProductPricing(tenantId)) as ProductPricingRow[];
}

export async function setProductPricing(params: {
  tenant_id: string;
  product_id: string;
  pricing: ProductTierPrice[];
}): Promise<WriteResult> {
  return api().dbSetProductPricing(params);
}

export interface CreateProductResult extends WriteResult {
  product_id?: string;
  reactivated?: boolean;
}

/** What the product form sends to `db:addProduct` / `db:updateProduct`: product columns (form strings included) plus
 * form-only fields; productsService coerces and validates every value. */
export type ProductWritePayload = { [K in keyof Product]?: unknown } & Record<string, unknown>;

export async function createProduct(product: ProductWritePayload): Promise<CreateProductResult> {
  return api().dbAddProduct(product);
}

export async function updateProduct(product: ProductWritePayload & { product_id: string }): Promise<WriteResult> {
  return api().dbUpdateProduct(product);
}

export async function adjustStock(args: {
  product_id: string;
  delta?: number;
  pcsDelta?: number;
}): Promise<WriteResult> {
  return api().dbAdjustStock(args);
}

export async function deleteProduct(productId: string): Promise<WriteResult> {
  return api().dbDeleteProduct(productId);
}

export async function bulkDeleteProducts(productIds: string[]): Promise<WriteResult> {
  return api().dbBulkDeleteProducts(productIds);
}

/** Products, stock, print queue and product reports. Channel catalog — the only way UI code reaches these IPC channels. */
export const productsApi = bindBridge({
  getProducts: 'dbGetProducts',
  getProductsCount: 'dbGetProductsCount',
  getProductsByIds: 'dbGetProductsByIds',
  addProduct: 'dbAddProduct',
  ensureServiceItem: 'dbEnsureServiceItem',
  updateProduct: 'dbUpdateProduct',
  updateProductName: 'dbUpdateProductName',
  deleteProduct: 'dbDeleteProduct',
  bulkDeleteProducts: 'dbBulkDeleteProducts',
  adjustStock: 'dbAdjustStock',
  bulkImportProducts: 'dbBulkImportProducts',
  updatePrintStatus: 'dbUpdatePrintStatus',
  resetPrintStatus: 'dbResetPrintStatus',
  getPendingPrintProducts: 'dbGetPendingPrintProducts',
  getStockReport: 'dbGetStockReport',
  getProductBillQuantities: 'dbGetProductBillQuantities',
  updateProductGstFlag: 'dbUpdateProductGstFlag',
  getProductSalesSummary: 'dbGetProductSalesSummary',
  productHasEstimateBills: 'dbProductHasEstimateBills',
  generateBarcode: 'dbGenerateBarcode',
});
