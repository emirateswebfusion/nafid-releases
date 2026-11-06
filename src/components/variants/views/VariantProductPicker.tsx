import { useState } from 'react';
import { Search, ChevronRight } from 'lucide-react';
import type { Product } from '../../../data/products';
import { useCloseOnEscape } from '../../../hooks/useCloseOnEscape';
import { variantAttributes } from '../../inventory/variantProducts';
import { Modal } from '../../ui/Modal';
import { Input } from '../../ui/Input';

export function VariantProductPicker({ products, onSelect, onClose }: {
  products: Product[]; onSelect: (product: Product) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  useCloseOnEscape(onClose);
  const parents = products.filter(product => !product.is_deleted && !variantAttributes(product.domain_attributes).parent_product_id);
  const query = search.trim().toLowerCase();
  const matches = parents.filter(product => `${product.name} ${product.sku_barcode || ''} ${product.category || ''}`.toLowerCase().includes(query));
  return <Modal isOpen onClose={onClose} title="Add Variant" className="max-w-2xl">
    <div role="dialog" aria-modal="true" aria-label="Choose product for variant" className="space-y-4">
      <p className="text-sm text-muted-foreground">Choose an existing product to add a size, pack or other variant.</p>
      <div className="relative"><Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <Input autoFocus aria-label="Find product for variant" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search product name, category or barcode" className="pl-9" /></div>
      <div className="max-h-80 overflow-y-auto divide-y divide-border rounded-xl border border-border">
        {matches.slice(0, 50).map(product => <button key={product.product_id} type="button" onClick={() => onSelect(product)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
          <span className="min-w-0"><span className="block text-sm font-semibold truncate">{product.name}</span>
            <span className="block text-xs text-muted-foreground truncate">{product.category || 'Uncategorized'}{product.sku_barcode ? ` · ${product.sku_barcode}` : ''}</span></span>
          <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" /></button>)}
        {!matches.length && <p className="p-6 text-center text-sm text-muted-foreground">{parents.length ? 'No matching products. Try another search.' : 'Create a product in Inventory before adding its variants.'}</p>}
      </div>
      {matches.length > 50 && <p className="text-xs text-muted-foreground">Showing the first 50 products. Search to find a specific product.</p>}
    </div>
  </Modal>;
}
