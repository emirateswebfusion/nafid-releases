export type QuickProductColumnId =
  | 'name'
  | 'basePrice'
  | 'qty'
  | 'purchasePrice'
  | 'category'
  | 'itemCode'
  | 'barcode'
  | 'uom'
  | 'taxRate';

export interface ColumnDefinition {
  id: QuickProductColumnId;
  label: string;
  shortLabel: string;
  required?: boolean;
  type: 'text' | 'number' | 'select';
  prefix?: string;
  minWidth?: string;
  options?: { value: string | number; label: string }[];
}

export interface QuickProductRow {
  id: string;
  name: string;
  basePrice: string;
  qty: string;
  purchasePrice: string;
  category: string;
  itemCode: string;
  barcode: string;
  uom: string;
  taxRate: number;
}

export interface QuickProductItemInput {
  name: string;
  basePrice: number;
  qty: number;
  purchasePrice?: number;
  category?: string;
  itemCode?: string;
  barcode?: string;
  uom?: string;
  taxRate?: number;
}

export const ALL_QUICK_COLUMNS: ColumnDefinition[] = [
  { id: 'name', label: 'Item Name', shortLabel: 'Product Name', required: true, type: 'text', minWidth: 'min-w-[180px]' },
  { id: 'basePrice', label: 'Rate / MRP', shortLabel: 'Rate (₹)', type: 'number', prefix: '₹', minWidth: 'min-w-[100px]' },
  { id: 'qty', label: 'Quantity', shortLabel: 'Qty', type: 'number', minWidth: 'min-w-[80px]' },
  { id: 'purchasePrice', label: 'Purchase Price', shortLabel: 'Cost (₹)', type: 'number', prefix: '₹', minWidth: 'min-w-[100px]' },
  { id: 'category', label: 'Category', shortLabel: 'Category', type: 'text', minWidth: 'min-w-[130px]' },
  { id: 'itemCode', label: 'Item Code', shortLabel: 'Code', type: 'text', minWidth: 'min-w-[90px]' },
  { id: 'barcode', label: 'Barcode', shortLabel: 'Barcode', type: 'text', minWidth: 'min-w-[130px]' },
  {
    id: 'uom',
    label: 'Unit (UOM)',
    shortLabel: 'UOM',
    type: 'select',
    minWidth: 'min-w-[90px]',
    options: ['Pcs', 'Kgs', 'Grams', 'Mtrs', 'Ltrs', 'Box', 'Dozen'].map(u => ({ value: u, label: u }))
  },
  {
    id: 'taxRate',
    label: 'Tax Rate (%)',
    shortLabel: 'Tax %',
    type: 'select',
    minWidth: 'min-w-[90px]',
    options: [0, 5, 12, 18, 28].map(r => ({ value: r, label: `${r}%` }))
  },
];

export const DEFAULT_QUICK_COLUMNS: QuickProductColumnId[] = ['name', 'basePrice', 'qty'];
export const STORAGE_KEY_QUICK_COLUMNS = 'nafid_quick_product_columns';
