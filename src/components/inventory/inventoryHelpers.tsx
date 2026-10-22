import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import type { Product as ProductRow } from '../../data/products';

export interface Product {
  product_id: string;
  tenant_id: string;
  name: string;
  item_code: string;
  sku_barcode: string;
  category: string;
  brand_manufacturer: string;
  uom: string;
  purchase_price: number;
  base_price: number;
  current_stock: number;
  reorder_level: number;
  is_gst_applicable: number;
  hsn_sac_code: string;
  tax_rate_percent: number;
  domain_attributes: string; // JSON string from SQLite
  discount_percent?: number | null;
  discount_flat?: number | null;
  offer_price?: number | null;
  billing_type?: string;
  grade_id?: string;
  pricing_mode?: string;
  is_service_item?: number;
  sync_status: string;
  created_at?: string;
  updated_at?: string;
  paper_stock?: number;
  gst_purchase_price?: number;
  paper_mrp?: number;
}

export const toInventoryProducts = (rows: ProductRow[]): Product[] =>
  rows as unknown as Product[];

export const isGstProduct = (product: Pick<Product, 'is_gst_applicable' | 'hsn_sac_code'>) =>
  Number(product.is_gst_applicable) === 1 || String(product.hsn_sac_code || '').trim() !== '';

export const DEFAULT_FORM = {
  item_code: '',
  sku_barcode: '',
  name: '',
  category: '',
  brand_manufacturer: '',
  uom: 'Pcs',
  purchase_price: '' as string | number,
  base_price: '' as string | number,
  current_stock: '' as string | number,
  reorder_level: '' as string | number,
  is_gst_applicable: false,
  gst_type: 'REAL' as 'REAL' | 'PAPER',
  hsn_sac_code: '',
  tax_rate_percent: 0,
  domain_attributes: {} as Record<string, any>,
  discount_percent: '' as string | number | null,
  discount_flat: '' as string | number | null,
  offer_price: '' as string | number | null,
  billing_type: 'PIECE',
  grade_id: '',
  pricing_mode: 'FIXED_PRICE',
  show_gst_purchase: false,
  gst_same_as_current: false,
  gst_purchase_price: '' as string | number,
  gst_purchase_quantity: '' as string | number,
  gst_supplier_id: '',
  gst_supplier_name: '',
  gst_bill_number: '',
  gst_bill_date: new Date().toLocaleDateString('en-CA'),
  gst_purchase_is_dummy: false,
};

export function QRCodePreview({ barcode }: { barcode: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(barcode, { width: 120, margin: 1 })
      .then(u => setUrl(u))
      .catch(() => setUrl(null));
  }, [barcode]);
  if (!url) return <div style={{ width: '100px', height: '50px', background: '#f0f0f0' }} />;
  return <img src={url} alt="QR" style={{ width: '100px', height: '100px', imageRendering: 'pixelated' }} />;
}

export function DomainField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-muted-foreground mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition-all shadow-sm" />
    </div>
  );
}
