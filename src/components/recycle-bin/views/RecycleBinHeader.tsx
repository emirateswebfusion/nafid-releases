import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import clsx from 'clsx';
import { Trash2, RefreshCw, X, Receipt, Package, Users, Handshake, ShieldAlert } from 'lucide-react';
import { formatAmount } from '../../../utils/pricing/money';
import { CATEGORIES, type RecycleBinCategory } from '../recycleBinTypes';
import type { RecycleBinState } from '../hooks/useRecycleBinState';

export interface RecycleBinHeaderProps {
  activeCategory: RecycleBinCategory;
  counts: Record<RecycleBinCategory, number>;
  handleEmptyCategory: () => void;
  isAdmin: boolean;
  isCurrentLoading: boolean;
  onClose: () => void;
  rb: RecycleBinState;
  reloadActive: () => void;
  setActiveCategory: (category: RecycleBinCategory) => void;
  totalDeletedBillsValue: number;
}

/** Screen header: title, category switcher, empty-bin / refresh / close actions and the KPI strip. */
export function RecycleBinHeader({
  activeCategory, counts, handleEmptyCategory, isAdmin, isCurrentLoading, onClose, rb, reloadActive,
  setActiveCategory, totalDeletedBillsValue,
}: RecycleBinHeaderProps) {
  const { setSearch } = rb;
  return (
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-xs">
        <div className="flex items-center justify-between gap-4 px-6 py-3.5">

          {/* Left Title & Back Button */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 shadow-inner shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-foreground tracking-tight">Recycle Bin</h1>
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
                Structured data recovery &amp; restoration hub
              </p>
            </div>
          </div>

          {/* Center Category Switcher */}
          <div className="flex items-center bg-muted/60 dark:bg-muted/30 p-1 rounded-2xl border border-border/80 gap-1 shadow-inner backdrop-blur-xs">
            {CATEGORIES.map(({ id, label, Icon }) => {
              const count = counts[id];
              const isActive = id === activeCategory;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(id);
                    setSearch('');
                  }}
                  className={clsx(
                    'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer active:scale-[0.98]',
                    isActive
                      ? 'bg-card text-foreground border border-border shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
                  )}
                >
                  <Icon className={clsx('w-3.5 h-3.5 transition-colors', isActive ? 'text-rose-500' : 'text-muted-foreground')} />
                  <span>{label}</span>
                  {count > 0 && (
                    <span
                      className={clsx(
                        'text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full',
                        isActive ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : 'bg-muted-foreground/15 text-muted-foreground'
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && counts[activeCategory] > 0 && (
              <button
                type="button"
                onClick={handleEmptyCategory}
                title={`Permanently wipe all deleted ${CATEGORIES.find((c) => c.id === activeCategory)?.label || ''}`}
                className="h-8.5 px-3 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white transition-all duration-150 active:scale-[0.98] flex items-center gap-1.5 cursor-pointer text-xs font-bold shadow-2xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Empty Bin</span>
              </button>
            )}

            <button
              type="button"
              onClick={reloadActive}
              disabled={isCurrentLoading}
              title="Refresh deleted items"
              className="h-8.5 w-8.5 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-[0.98] flex items-center justify-center cursor-pointer disabled:opacity-40 shadow-2xs"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', isCurrentLoading && 'animate-spin text-rose-500')} />
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Close page"
              className="h-8.5 w-8.5 rounded-xl border border-destructive/25 bg-destructive/5 text-destructive hover:bg-destructive/15 transition-all duration-150 active:scale-[0.98] cursor-pointer flex items-center justify-center shrink-0 shadow-2xs"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ─── SUMMARY KPI STRIP ─── */}
        <div className="px-6 py-2.5 bg-muted/20 border-t border-border/70 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">

            {/* KPI 1: Sales Bills */}
            <div
              onClick={() => setActiveCategory('SALES_BILLS')}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-xl border cursor-pointer transition-all',
                activeCategory === 'SALES_BILLS'
                  ? 'bg-card border-rose-500/40 shadow-xs ring-1 ring-rose-500/20'
                  : 'bg-card/50 border-border/60 hover:bg-card'
              )}
            >
              <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 shrink-0">
                <Receipt className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Deleted Bills</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-black font-mono text-foreground">{counts.SALES_BILLS}</span>
                  <span className="text-[10px] font-mono text-muted-foreground font-bold">{getCurrencyPrefix()}{formatAmount(totalDeletedBillsValue)}</span>
                </div>
              </div>
            </div>

            {/* KPI 2: Products */}
            <div
              onClick={() => setActiveCategory('PRODUCTS')}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-xl border cursor-pointer transition-all',
                activeCategory === 'PRODUCTS'
                  ? 'bg-card border-blue-500/40 shadow-xs ring-1 ring-blue-500/20'
                  : 'bg-card/50 border-border/60 hover:bg-card'
              )}
            >
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                <Package className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Deleted Items</p>
                <p className="text-xs font-black font-mono text-foreground">{counts.PRODUCTS}</p>
              </div>
            </div>

            {/* KPI 3: Customers */}
            <div
              onClick={() => setActiveCategory('CUSTOMERS')}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-xl border cursor-pointer transition-all',
                activeCategory === 'CUSTOMERS'
                  ? 'bg-card border-purple-500/40 shadow-xs ring-1 ring-purple-500/20'
                  : 'bg-card/50 border-border/60 hover:bg-card'
              )}
            >
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-500 shrink-0">
                <Users className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Customers</p>
                <p className="text-xs font-black font-mono text-foreground">{counts.CUSTOMERS}</p>
              </div>
            </div>

            {/* KPI 4: Ledger Parties */}
            <div
              onClick={() => setActiveCategory('PARTIES')}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-xl border cursor-pointer transition-all',
                activeCategory === 'PARTIES'
                  ? 'bg-card border-emerald-500/40 shadow-xs ring-1 ring-emerald-500/20'
                  : 'bg-card/50 border-border/60 hover:bg-card'
              )}
            >
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                <Handshake className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Suppliers / Parties</p>
                <p className="text-xs font-black font-mono text-foreground">{counts.PARTIES}</p>
              </div>
            </div>
          </div>

          {/* Quick Notice */}
          <div className="text-[11px] text-muted-foreground hidden lg:flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            <span>Restoring a bill immediately updates inventory stock and recalculates customer ledger balance.</span>
          </div>
        </div>
      </header>
  );
}
