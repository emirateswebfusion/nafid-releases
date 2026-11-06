import { getSampleBarcode } from '../../utils/localization/storeProfile';
/** Data upload modal: entity types, parsed row and column shapes, column specs, header maps and demo samples. */

export type UploadEntityType = 'products' | 'suppliers' | 'customers' | 'staff' | 'opening_balances';

export interface DataUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEntity?: UploadEntityType;
  allowedEntities?: UploadEntityType[];
  hideEntityTabs?: boolean;
  onImportSuccess?: (count: number, entity: UploadEntityType) => void;
}

export type ParsedRowData = {
  name?: string;
  base_price?: number;
  purchase_price?: number;
  current_stock?: number;
  reorder_level?: number;
  tax_rate_percent: number;
  sku_barcode?: string;
  item_code?: string;
  category?: string;
  brand_manufacturer?: string;
  uom: string;
  hsn_sac_code: string;
  is_gst_applicable?: number;
  tier_prices?: Record<string, number>;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  credit_limit?: number;
  balance?: number;
  balance_type?: string;
  role_designation?: string;
  monthly_salary?: number;
  joining_date?: string;
  party_type?: string;
  discount_percent?: number | null;
  discount_flat?: number | null;
  offer_price?: number | null;
  [key: string]: unknown;
};

export interface ParsedRow {
  id: string;
  data: ParsedRowData;
  isValid: boolean;
  errors: string[];
}

export interface ColumnSpec {
  name: string;
  required: boolean;
  example: string;
}

// ─── Column Orders & Specs ───────────────────────────────────────────────────

export const PRODUCT_COLUMN_SPECS: ColumnSpec[] = [
  { name: 'Product Name', required: true, example: 'Basmati Rice 5kg' },
  { name: 'MRP', required: true, example: '450' },
  { name: 'Barcode', required: false, get example() { return getSampleBarcode(); } },
  { name: 'Item Code', required: false, example: 'RICE-01' },
  { name: 'Category', required: false, example: 'Groceries' },
  { name: 'Brand', required: false, example: 'Royal Gold' },
  { name: 'Purchase Price', required: false, example: '350' },
  { name: 'Stock', required: false, example: '50' },
  { name: 'Low Stock', required: false, example: '10' },
  { name: 'Tax Rate %', required: false, example: '5' },
  { name: 'UOM', required: false, example: 'Kgs' },
  { name: 'HSN Code', required: false, example: '1006' },
  { name: 'Discount %', required: false, example: '5' },
  { name: 'Discount Flat', required: false, example: '0' },
  { name: 'Offer Price', required: false, example: '' },
];

export const SUPPLIER_COLUMN_SPECS: ColumnSpec[] = [
  { name: 'Supplier Name', required: true, example: 'ABC Wholesalers Pvt Ltd' },
  { name: 'Phone', required: false, example: '9876543210' },
  { name: 'Address', required: false, example: 'Trade Tower, Suite 402' },
  { name: 'GSTIN', required: false, example: '07AAAAA0000A1Z5' },
  { name: 'Opening Balance', required: false, example: '5000' },
  { name: 'Balance Type', required: false, example: 'PAYABLE' },
  { name: 'Credit Limit', required: false, example: '50000' },
  { name: 'Notes', required: false, example: 'Primary grocery vendor' },
];

export const CUSTOMER_COLUMN_SPECS: ColumnSpec[] = [
  { name: 'Customer Name', required: true, example: 'Rahul Sharma' },
  { name: 'Phone', required: false, example: '9899887766' },
  { name: 'Address', required: false, example: '123 Park Avenue' },
  { name: 'GSTIN', required: false, example: '07CCCCC2222C1Z9' },
  { name: 'Opening Balance', required: false, example: '1200' },
  { name: 'Balance Type', required: false, example: 'RECEIVABLE' },
  { name: 'Credit Limit', required: false, example: '10000' },
  { name: 'Notes', required: false, example: 'Regular retail customer' },
];

export const OPENING_BALANCE_COLUMN_SPECS: ColumnSpec[] = [
  { name: 'Account Name', required: true, example: 'Rahul Sharma' },
  { name: 'Balance', required: true, example: '1200 (negative = advance)' },
];

export const SAMPLE_OPENING_BALANCES = [
  { 'Account Name': 'Rahul Sharma', Balance: 1200 },
  { 'Account Name': 'Priya Traders', Balance: -500 },
];

export const STAFF_COLUMN_SPECS: ColumnSpec[] = [
  { name: 'Staff Name', required: true, example: 'Amit Kumar' },
  { name: 'Phone', required: false, example: '9811122233' },
  { name: 'Email', required: false, example: 'amit@store.com' },
  { name: 'Role / Designation', required: false, example: 'Biller & Cashier' },
  { name: 'Monthly Salary', required: false, example: '18000' },
  { name: 'Joining Date', required: false, example: '2026-01-15' },
  { name: 'Notes', required: false, example: 'Morning shift staff' },
];

// ─── Header Normalizers ─────────────────────────────────────────────────────

export const PRODUCT_HEADER_MAP: Record<string, string> = {
  'base price': 'base_price',
  'sku barcode': 'sku_barcode',
  'brand manufacturer': 'brand_manufacturer',
  'hsn sac code': 'hsn_sac_code',
  'tax rate percent': 'tax_rate_percent',
  'is gst applicable': 'is_gst_applicable',
  'product name': 'name',
  'product': 'name',
  'item name': 'name',
  'item': 'name',
  'title': 'name',
  'name': 'name',
  
  'sku': 'sku_barcode',
  'barcode': 'sku_barcode',
  'sku/barcode': 'sku_barcode',
  'code': 'sku_barcode',
  'barcode / sku': 'sku_barcode',

  'item code': 'item_code',
  'product code': 'item_code',

  'category': 'category',
  'cat': 'category',

  'brand': 'brand_manufacturer',
  'manufacturer': 'brand_manufacturer',
  'brand / manufacturer': 'brand_manufacturer',

  'purchase price': 'purchase_price',
  'cost price': 'purchase_price',
  'cost': 'purchase_price',
  'buying price': 'purchase_price',

  'selling price': 'base_price',
  'selling price / mrp': 'base_price',
  'mrp': 'base_price',
  'price': 'base_price',
  'rate': 'base_price',
  'sales price': 'base_price',

  'stock': 'current_stock',
  'current stock': 'current_stock',
  'quantity': 'current_stock',
  'qty': 'current_stock',
  'initial stock': 'current_stock',

  'reorder level': 'reorder_level',
  'min stock': 'reorder_level',
  'low stock': 'reorder_level',

  'tax rate': 'tax_rate_percent',
  'tax rate %': 'tax_rate_percent',
  'tax %': 'tax_rate_percent',
  'gst %': 'tax_rate_percent',
  'gst': 'tax_rate_percent',

  'uom': 'uom',
  'unit': 'uom',

  'hsn': 'hsn_sac_code',
  'hsn code': 'hsn_sac_code',
  'hsn/sac': 'hsn_sac_code',
  'hsn/sac code': 'hsn_sac_code',

  'discount %': 'discount_percent',
  'discount percent': 'discount_percent',
  'discount percentage': 'discount_percent',
  'discount': 'discount_percent',

  'discount flat': 'discount_flat',
  'discount amount': 'discount_flat',
  'flat discount': 'discount_flat',

  'offer price': 'offer_price',
  'sale price': 'offer_price',
  'offer': 'offer_price',

  'real stock': 'current_stock',
  'paper stock': 'paper_stock',
  'paper purchase': 'gst_purchase_price',
  'paper mrp': 'paper_mrp',
  'billing type': 'billing_type',
  'gst applicable': 'is_gst_applicable',
  'added date': 'created_at',
};

// ─── Dynamic Tier Header Matcher (Zero Hardcoding) ───────────────────────────

export function resolveDynamicTierName(
  header: string,
  existingTiers: Array<{ pricing_tier_id?: string; name: string }> = []
): string | null {
  const raw = String(header || '').trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  const clean = lower.replace(/[^a-z0-9]/g, '');
  if (!clean) return null;

  // If this header is a recognized standard product column, it is NOT a tier
  if (PRODUCT_HEADER_MAP[lower] || PRODUCT_HEADER_MAP[clean]) {
    return null;
  }

  // 1. Direct match with existing tier names in store (case/symbol-insensitive)
  for (const t of existingTiers) {
    if (!t?.name) continue;
    const tClean = t.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean === tClean || clean === `${tClean}price` || clean === `${tClean}rate`) {
      return t.name;
    }
  }

  // Explicit tier headings and guide headings must not merge distinct tiers by substring or typo.
  const prefixMatch = raw.match(/^(?:tier|price\s*tier)\s*[:\-_]\s*(.+)$/i);
  if (prefixMatch?.[1]) return prefixMatch[1].trim();
  const suffixMatch = raw.match(/^(.+?)\s*\(Tier Price\)$/i);
  if (suffixMatch?.[1]) return suffixMatch[1].trim();

  // 4. Any other non-standard column title is dynamically considered a tier
  return raw;
}

export const PARTY_HEADER_MAP: Record<string, string> = {
  'name': 'name',
  'supplier name': 'name',
  'customer name': 'name',
  'staff name': 'name',
  'employee name': 'name',
  'party name': 'name',
  'company name': 'name',

  'phone': 'phone',
  'mobile': 'phone',
  'contact': 'phone',
  'mobile number': 'phone',
  'phone number': 'phone',

  'address': 'address',
  'location': 'address',

  'gstin': 'gstin',
  'gst': 'gstin',
  'gst number': 'gstin',

  'balance': 'balance',
  'opening balance': 'balance',

  'balance type': 'balance_type',
  'type': 'balance_type',

  'credit limit': 'credit_limit',

  'notes': 'notes',
  'remark': 'notes',
  'category': 'custom_category',

  'role': 'role_designation',
  'designation': 'role_designation',
  'role / designation': 'role_designation',

  'salary': 'monthly_salary',
  'monthly salary': 'monthly_salary',

  'email': 'email',
  'joining date': 'joining_date'
};

// ─── Template Samples ────────────────────────────────────────────────────────

export const SAMPLE_PRODUCTS = [
  {
    'Product Name': 'Basmati Rice 5kg',
    'MRP': 450,
    get 'Barcode'() { return getSampleBarcode(); },
    'Item Code': 'RICE-01',
    'Category': 'Groceries',
    'Brand': 'Royal Gold',
    'Purchase Price': 350,
    'Stock': 50,
    'Low Stock': 10,
    'Tax Rate %': 5,
    'UOM': 'Kgs',
    'HSN Code': '1006',
    'Discount %': 5,
    'Discount Flat': 0,
    'Offer Price': ''
  },
  {
    'Product Name': 'Sunflower Oil 1L',
    'MRP': 140,
    get 'Barcode'() { return `${getSampleBarcode().slice(0, -1)}1`; },
    'Item Code': 'OIL-01',
    'Category': 'Groceries',
    'Brand': 'Fortune',
    'Purchase Price': 110,
    'Stock': 100,
    'Low Stock': 20,
    'Tax Rate %': 5,
    'UOM': 'Ltrs',
    'HSN Code': '1512',
    'Discount %': '',
    'Discount Flat': 0,
    'Offer Price': 120
  }
];

export const SAMPLE_SUPPLIERS = [
  {
    'Supplier Name': 'ABC Wholesalers Pvt Ltd',
    'Phone': '9876543210',
    'Address': 'Trade Tower, Suite 402, Commercial Market',
    'GSTIN': '07AAAAA0000A1Z5',
    'Opening Balance': 5000,
    'Balance Type': 'PAYABLE',
    'Credit Limit': 50000,
    'Notes': 'Primary grocery distributor'
  },
  {
    'Supplier Name': 'Global Traders',
    'Phone': '9811223344',
    'Address': 'Industrial Area, Phase 2',
    'GSTIN': '07BBBBB1111B1Z2',
    'Opening Balance': 0,
    'Balance Type': 'PAYABLE',
    'Credit Limit': 25000,
    'Notes': 'Beverages & Snacks vendor'
  }
];

export const SAMPLE_CUSTOMERS = [
  {
    'Customer Name': 'Rahul Sharma',
    'Phone': '9899887766',
    'Address': '123 Park Avenue, Block C',
    'GSTIN': '',
    'Opening Balance': 1200,
    'Balance Type': 'RECEIVABLE',
    'Credit Limit': 10000,
    'Notes': 'Regular retail buyer'
  },
  {
    'Customer Name': 'Metro Resto Cafe',
    'Phone': '9871122334',
    'Address': 'Sector 18, Commercial Hub',
    'GSTIN': '07CCCCC2222C1Z9',
    'Opening Balance': 0,
    'Balance Type': 'RECEIVABLE',
    'Credit Limit': 30000,
    'Notes': 'B2B Monthly billing customer'
  }
];

export const SAMPLE_STAFF = [
  {
    'Staff Name': 'Amit Kumar',
    'Phone': '9811122233',
    'Email': 'amit@store.com',
    'Role / Designation': 'Biller & Cashier',
    'Monthly Salary': 18000,
    'Joining Date': '2026-01-15',
    'Notes': 'Morning shift cashier'
  },
  {
    'Staff Name': 'Priya Singh',
    'Phone': '9822233344',
    'Email': 'priya@store.com',
    'Role / Designation': 'Sales Executive',
    'Monthly Salary': 22000,
    'Joining Date': '2025-11-01',
    'Notes': 'Full-time sales staff'
  }
];
