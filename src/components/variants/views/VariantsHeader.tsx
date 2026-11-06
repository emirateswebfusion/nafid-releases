import { Layers, Plus, RefreshCw, Search } from 'lucide-react';
import type { Product } from '../../../data/products';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { RedCrossButton } from '../../ui/RedCrossButton';

export function VariantsHeader({ count, loading, canCreate, search, category, productId, parents, categories, onSearch, onCategory, onProduct, onReset, onRefresh, onAdd, onClose }: {
  count: number; loading: boolean; canCreate: boolean; search: string; category: string; productId: string;
  parents: Product[]; categories: string[]; onSearch: (value: string) => void; onCategory: (value: string) => void;
  onProduct: (value: string) => void; onReset: () => void; onRefresh: () => void; onAdd: () => void; onClose: () => void;
}) {
  return <>
    <header className="shrink-0 border-b border-border/80 bg-card/95 shadow-xs px-4 sm:px-6 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0"><div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0"><Layers className="w-5 h-5" /></div>
          <div><h1 className="text-base font-black text-foreground tracking-tight">Product Variants</h1><p className="text-xs text-muted-foreground">{loading ? 'Loading variants…' : `${count} variants · Prices & stock`}</p></div></div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Refresh variants" onClick={onRefresh} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
          {canCreate && <Button onClick={onAdd} disabled={loading}><Plus className="w-4 h-4 mr-2" />Add Variant</Button>}
          <RedCrossButton onClick={onClose} title="Close Product Variants" />
        </div>
      </div>
    </header>
    <div className="shrink-0 flex flex-wrap gap-2 items-center border-b border-border bg-card px-4 sm:px-6 py-3">
      <div className="relative flex-1 min-w-52"><Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" aria-hidden="true" /><Input aria-label="Search variants" value={search} onChange={event => onSearch(event.target.value)} placeholder="Search product, variant or barcode" className="pl-9" /></div>
      <select aria-label="Filter variant product" value={productId} onChange={event => onProduct(event.target.value)} className="h-10 max-w-full sm:max-w-56 rounded-xl bg-background border border-border px-3 text-sm"><option value="">All products</option>{parents.map(parent => <option key={parent.product_id} value={parent.product_id}>{parent.name}</option>)}</select>
      <select aria-label="Filter variant category" value={category} onChange={event => onCategory(event.target.value)} className="h-10 max-w-full sm:max-w-48 rounded-xl bg-background border border-border px-3 text-sm"><option value="">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select>
      {(search || category || productId) && <Button variant="ghost" onClick={onReset}>Clear filters</Button>}
    </div>
  </>;
}
