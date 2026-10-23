import clsx from 'clsx';
import { Landmark, Smartphone, CreditCard, Search, X } from 'lucide-react';
import type { PaymentMethodsState } from '../hooks/usePaymentMethodsState';

export interface PaymentSourceFiltersProps {
  pmState: PaymentMethodsState;
}

/** Type filter pills and search box of the payment methods list. */
export function PaymentSourceFilters({
  pmState,
}: PaymentSourceFiltersProps) {
  const { search, setSearch, setTypeFilter, sources, typeFilter } = pmState;
  return (
    <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card/60 dark:bg-card/40 border border-border/60 p-3.5 rounded-3xl backdrop-blur-md shadow-sm select-none">
      
      {/* Segmented Filter Pills */}
      <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-2xl w-full md:w-auto overflow-x-auto">
        <button
          onClick={() => setTypeFilter('ALL')}
          className={clsx(
            'px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer',
            typeFilter === 'ALL'
              ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
          )}
        >
          All Methods ({sources.length})
        </button>
        <button
          onClick={() => setTypeFilter('BANK')}
          className={clsx(
            'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer',
            typeFilter === 'BANK'
              ? 'bg-background text-sky-600 dark:text-sky-400 shadow-sm ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
          )}
        >
          <Landmark className="w-3.5 h-3.5" />
          Banks ({sources.filter(s => s.type === 'BANK').length})
        </button>
        <button
          onClick={() => setTypeFilter('UPI')}
          className={clsx(
            'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer',
            typeFilter === 'UPI'
              ? 'bg-background text-emerald-600 dark:text-emerald-400 shadow-sm ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
          )}
        >
          <Smartphone className="w-3.5 h-3.5" />
          UPI IDs ({sources.filter(s => s.type === 'UPI').length})
        </button>
        <button
          onClick={() => setTypeFilter('CARD')}
          className={clsx(
            'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer',
            typeFilter === 'CARD'
              ? 'bg-background text-violet-600 dark:text-violet-400 shadow-sm ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
          )}
        >
          <CreditCard className="w-3.5 h-3.5" />
          Cards ({sources.filter(s => s.type === 'CARD').length})
        </button>
      </div>

      {/* Search Box */}
      <div className="relative w-full md:w-72">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search channel, bank, UPI..."
          className="w-full pl-10 pr-9 py-2 text-xs bg-background/60 border border-border/80 rounded-2xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-semibold text-foreground placeholder:text-muted-foreground/50"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
