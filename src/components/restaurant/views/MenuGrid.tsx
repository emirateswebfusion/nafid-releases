import { useMemo, useState } from 'react';
import { ArrowLeft, ListPlus, Search, X } from 'lucide-react';
import type { Product } from '../../../data/products';
import type { ModifierGroup } from '../../../data/restaurant';
import { formatCurrency } from '../../../utils/pricing/money';
import { groupsForProduct, menuUnitPrice } from '../restaurantRules';

interface MenuGridProps {
  onBack?: () => void;
  backLabel?: string;
  products: Product[];
  modifierGroups: ModifierGroup[];
  /** Quantity of each product already on the unsent draft, shown on its tile. */
  draftCounts: Record<string, number>;
  onPick: (product: Product) => void;
}

/** Touch menu: category rail on the left, search, one large tile per item with its price. */
export function MenuGrid({ products, modifierGroups, draftCounts, onPick, onBack, backLabel = 'Back to Tables' }: MenuGridProps) {
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) counts.set(p.category || 'Other', (counts.get(p.category || 'Other') ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [products]);
  const q = query.trim().toLowerCase();
  const shown = products.filter(p => q
    ? p.name.toLowerCase().includes(q) || (p.item_code ?? '').toLowerCase().includes(q) || (p.sku_barcode ?? '').toLowerCase() === q
    : !category || (p.category || 'Other') === category).slice(0, 400);
  const railItem = (key: string, label: string, count: number) => (
    <button key={key || 'all'} type="button" onClick={() => { setCategory(key); setQuery(''); }}
      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${category === key && !q ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
      <span className="truncate">{label}</span>
      <span className={`text-[11px] ${category === key && !q ? 'opacity-80' : 'opacity-60'}`}>{count}</span>
    </button>
  );
  return (
    <div className="flex h-full min-h-0 gap-3">
      <aside className="flex w-44 shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card p-2">
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        <div className="px-2 pb-1 pt-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Menu</div>
        {railItem('', 'All items', products.length)}
        {categories.map(([c, n]) => railItem(c, c, n))}
        </div>
        {onBack && <div className="mt-2 shrink-0 border-t border-border pt-2"><button type="button" onClick={onBack} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-4 text-sm font-bold text-primary shadow-sm transition hover:border-primary/40 hover:bg-primary/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"><ArrowLeft className="h-5 w-5 shrink-0" /><span>{backLabel}</span></button></div>}
      </aside>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search the menu or scan a code"
            className="w-full rounded-2xl border border-border bg-card py-2.5 pl-10 pr-10 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          {query && <button type="button" onClick={() => setQuery('')} title="Clear" className="absolute right-3 top-2.5 text-muted-foreground"><X className="h-4 w-4" /></button>}
        </div>
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5 overflow-y-auto pr-1">
          {shown.map(p => {
            const count = draftCounts[p.product_id] ?? 0;
            const hasAddOns = groupsForProduct(p, modifierGroups).length > 0;
            return (
              <button key={p.product_id} type="button" onClick={() => onPick(p)}
                className={`relative flex min-h-[92px] flex-col justify-between rounded-2xl border-2 bg-card p-3 text-left shadow-sm transition-all hover:border-primary/60 active:scale-[0.96] ${count > 0 ? 'border-primary' : 'border-border/70'}`}>
                <span className="line-clamp-2 pr-6 text-sm font-bold leading-snug">{p.name}</span>
                <div className="flex items-end justify-between gap-1">
                  <span className="text-sm font-black tabular-nums text-primary">{formatCurrency(menuUnitPrice(p))}</span>
                  {hasAddOns && <span className="flex items-center gap-0.5 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300"><ListPlus className="h-2.5 w-2.5" />Add-ons</span>}
                </div>
                {count > 0 && <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-black text-primary-foreground shadow">{count}</span>}
              </button>
            );
          })}
          {shown.length === 0 && <div className="col-span-full rounded-2xl border-2 border-dashed border-border p-10 text-center text-sm text-muted-foreground">No items match</div>}
        </div>
      </div>
    </div>
  );
}
