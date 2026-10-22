import { api, type WriteResult, bindBridge } from './client';

export interface Product {
  product_id: string;
  tenant_id: string;
  name: string;
  sku_barcode?: string | null;
  item_code?: string | null;
  category?: string | null;
  hsn_sac_code?: string | null;
  purchase_price?: number | null;
  base_price: number;
  is_gst_applicable?: number | null;
  tax_rate_percent?: number | null;
  uom?: string | null;
  brand_manufacturer?: string | null;
  current_stock?: number | null;
  reorder_level?: number | null;
  domain_attributes?: string | null;
  discount_percent?: number | null;
  discount_flat?: number | null;
  offer_price?: number | null;
  is_deleted?: number | null;
  billing_type?: string | null;
  grade_id?: string | null;
  pricing_mode?: string | null;
  average_weight_per_piece?: number | null;
  weight_override_allowed?: number | null;
  is_service_item?: number | null;
  sync_status?: string | null;
  print_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  grade_name?: string | null;
  pricing?: ProductTierPrice[];
}

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
}

export async function createProduct(product: Partial<Product>): Promise<CreateProductResult> {
  return api().dbAddProduct(product);
}

export async function updateProduct(product: Partial<Product> & { product_id: string }): Promise<WriteResult> {
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
