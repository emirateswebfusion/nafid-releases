import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Product } from '../../../data/products';
import { formatCurrency } from '../../../utils/pricing/money';
import { menuUnitPrice } from '../restaurantRules';

interface MenuGridProps {
  products: Product[];
  onPick: (product: Product) => void;
}

/** Touch menu: category tabs, search, one button per item with its order-time price. */
export function MenuGrid({ products, onPick }: MenuGridProps) {
  const [category, setCategory] = useState<string>('');
  const [query, setQuery] = useState('');
  const menu = useMemo(() => products.filter(p => !Number(p.is_service_item) || p.category), [products]);
  const categories = useMemo(() => [...new Set(menu.map(p => p.category || 'Other'))].sort(), [menu]);
  const shown = menu.filter(p => {
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.item_code ?? '').toLowerCase().includes(q) || (p.sku_barcode ?? '').toLowerCase() === q;
    }
    return !category || (p.category || 'Other') === category;
  }).slice(0, 300);
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search menu or scan code"
          className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setCategory('')}
          className={`rounded-full px-3 py-1 text-xs font-bold ${!category ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>All</button>
        {categories.map(c => (
          <button key={c} type="button" onClick={() => { setCategory(c); setQuery(''); }}
            className={`rounded-full px-3 py-1 text-xs font-bold ${category === c ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{c}</button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2 overflow-y-auto pr-1">
        {shown.map(p => (
          <button key={p.product_id} type="button" onClick={() => onPick(p)}
            className="flex min-h-[70px] flex-col justify-between rounded-xl border border-border bg-card p-2 text-left transition hover:border-primary active:scale-95">
            <span className="line-clamp-2 text-sm font-bold leading-tight">{p.name}</span>
            <span className="text-xs text-muted-foreground">{formatCurrency(menuUnitPrice(p))}</span>
          </button>
        ))}
        {shown.length === 0 && <div className="col-span-full p-6 text-center text-sm text-muted-foreground">No items</div>}
      </div>
    </div>
  );
}
