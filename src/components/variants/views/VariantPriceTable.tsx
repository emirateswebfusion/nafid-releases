import { Pencil, Trash2 } from 'lucide-react';
import type { Product } from '../../../data/products';
import { resolveLinePrice } from '../../../utils/pricing/linePricing';
import { formatCurrency } from '../../../utils/pricing/money';
import { Button } from '../../ui/Button';
import type { VariantCatalogRow } from '../variantCatalog';

export function VariantPriceTable({ rows, canEdit, canDelete, onEdit, onDelete }: {
  rows: VariantCatalogRow[]; canEdit: boolean; canDelete: boolean;
  onEdit: (product: Product) => void; onDelete: (product: Product) => void;
}) {
  return <table className="w-full text-sm text-left border-collapse">
    <caption className="sr-only">All product variants with prices and stock</caption>
    <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground"><tr>
      {['Product', 'Variant', 'Barcode', 'Purchase', 'MRP', 'Selling price', 'Stock', 'Actions'].map(label =>
        <th key={label} scope="col" className={`px-4 py-3 whitespace-nowrap ${['Purchase', 'MRP', 'Selling price', 'Stock'].includes(label) ? 'text-right' : ''}`}>{label}</th>)}
    </tr></thead>
    <tbody>{rows.map(({ product, parent, name }) => <tr key={product.product_id} className="border-t border-border hover:bg-muted/30">
      <td className="px-4 py-3 min-w-48"><div className="font-semibold">{parent?.name || product.name}</div>
        <div className="text-xs text-muted-foreground mt-1">{parent ? parent.category || 'Uncategorized' : 'Parent product unavailable'}</div>
      </td>
      <th scope="row" className="px-4 py-3"><span className="inline-flex rounded-md border border-border bg-muted/40 px-2 py-1 font-semibold whitespace-nowrap">{name}</span></th>
      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{product.sku_barcode || '—'}</td>
      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatCurrency(product.purchase_price ?? 0)}</td>
      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatCurrency(product.base_price ?? 0)}</td>
      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap font-semibold">{formatCurrency(resolveLinePrice(product, Number(product.base_price) || 0).unitRate)}</td>
      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap"><span className={(product.current_stock ?? 0) <= 0 ? 'text-destructive' : ''}>{product.current_stock ?? 0}</span> <span className="text-xs text-muted-foreground">{product.uom}</span></td>
      <td className="px-4 py-3"><div className="flex items-center gap-1">
        {canEdit && <Button variant="outline" size="sm" aria-label={`Edit ${product.name}`} disabled={!parent} title={!parent ? "Parent product unavailable" : "Edit variant"} onClick={() => onEdit(product)}><Pencil className="w-3.5 h-3.5 mr-1.5" />Edit</Button>}
        {canDelete && <Button variant="ghost" size="icon" aria-label={`Delete ${product.name}`} onClick={() => onDelete(product)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>}
      </div></td>
    </tr>)}</tbody>
  </table>;
}
