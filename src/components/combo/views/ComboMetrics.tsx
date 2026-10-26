import { Boxes, CheckCircle2, Layers, Zap } from 'lucide-react';

export interface ComboMetricsProps {
  metrics: { total: number; active: number; inactive: number; totalItems: number };
}

/** KPI summary banner cards for total, active, bundled items and engine status. */
export function ComboMetrics({ metrics }: ComboMetricsProps) {
  return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Combos</p>
              <h3 className="text-xl font-black text-foreground">{metrics.total}</h3>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active Offers</p>
              <h3 className="text-xl font-black text-emerald-600 dark:text-emerald-400">{metrics.active}</h3>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Bundled Items</p>
              <h3 className="text-xl font-black text-foreground">{metrics.totalItems}</h3>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Engine Status</p>
              <h3 className="text-xs font-black text-indigo-600 dark:text-indigo-400 mt-1">INVENTORY LINKED</h3>
            </div>
          </div>
        </div>
  );
}
