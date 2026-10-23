import { Wallet, ArrowUpRight, Layers, Star, History } from 'lucide-react';
import { formatCurrency } from '../../../utils/money';
import type { PaymentSource } from '../paymentMethodsTypes';

export interface PaymentMetricsStripProps {
  activeAccounts: number;
  defaultSource: PaymentSource | undefined;
  sources: PaymentSource[];
  totalAccounts: number;
  totalLiquidity: number;
  totalTxnCount: number;
}

/** Metrics cards: net liquidity, active channels, default gateway, total volume. */
export function PaymentMetricsStrip({
  activeAccounts, defaultSource, sources, totalAccounts, totalLiquidity, totalTxnCount,
}: PaymentMetricsStripProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 select-none">
      
      {/* Card 1: Total Net Liquidity */}
      <div className="relative overflow-hidden bg-card/60 dark:bg-card/40 border border-border/60 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 backdrop-blur-md group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <Wallet className="w-16 h-16 text-primary" />
        </div>
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-500/20 shadow-inner">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Total Liquidity</span>
            <p className="text-xl font-black tracking-tight text-foreground font-mono mt-0.5">
              {formatCurrency(totalLiquidity)}
            </p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground font-medium">
          <span>Across active sources</span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
            <ArrowUpRight className="w-3.5 h-3.5" /> Healthy
          </span>
        </div>
      </div>

      {/* Card 2: Active Channels */}
      <div className="relative overflow-hidden bg-card/60 dark:bg-card/40 border border-border/60 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 backdrop-blur-md group">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-2xl border border-sky-500/20 shadow-inner">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Active Channels</span>
            <p className="text-xl font-black tracking-tight text-foreground font-mono mt-0.5">
              {activeAccounts} <span className="text-xs font-semibold text-muted-foreground">/ {totalAccounts} Total</span>
            </p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground font-medium">
          <span>{sources.filter(s => s.type === 'BANK').length} Bank · {sources.filter(s => s.type === 'UPI').length} UPI · {sources.filter(s => s.type === 'CARD').length} Card</span>
        </div>
      </div>

      {/* Card 3: Default Gateway */}
      <div className="relative overflow-hidden bg-card/60 dark:bg-card/40 border border-border/60 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 backdrop-blur-md group">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-500/20 shadow-inner">
            <Star className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Default Method</span>
            <p className="text-sm font-extrabold text-foreground truncate mt-0.5">
              {defaultSource ? defaultSource.name : 'None Selected'}
            </p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border/40 text-[11px] text-muted-foreground font-medium flex items-center justify-between">
          <span>Primary receiving target</span>
          {defaultSource && <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Active</span>}
        </div>
      </div>

      {/* Card 4: Total Volume */}
      <div className="relative overflow-hidden bg-card/60 dark:bg-card/40 border border-border/60 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 backdrop-blur-md group">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-2xl border border-violet-500/20 shadow-inner">
            <History className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Recorded Txns</span>
            <p className="text-xl font-black tracking-tight text-foreground font-mono mt-0.5">
              {totalTxnCount} <span className="text-xs font-normal text-muted-foreground">entries</span>
            </p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border/40 text-[11px] text-muted-foreground font-medium flex items-center justify-between">
          <span>Ledger history active</span>
          <span className="font-bold text-violet-600 dark:text-violet-400">Audited</span>
        </div>
      </div>

    </div>
  );
}
