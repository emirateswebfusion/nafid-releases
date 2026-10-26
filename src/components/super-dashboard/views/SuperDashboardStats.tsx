import { Store, Activity } from 'lucide-react';

export interface SuperDashboardStatsProps {
  stats: { total: number; healthy: number; unreachable: number; domains: { GENERAL: number; JEWELRY: number; HARDWARE: number; GROCERY: number; }; };
}

/** Statistics cards: tenants, healthy / unreachable connections, domain mix. */
export function SuperDashboardStats({
  stats,
}: SuperDashboardStatsProps) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Card 1: Total Tenants */}
      <div className="bg-card border border-border p-5 rounded-xl flex items-center justify-between relative overflow-hidden group hover:border-border transition duration-300 shadow-sm">
        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl -translate-y-1/3 translate-x-1/3 group-hover:bg-amber-500/10 transition duration-300" />
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Total Tenants</span>
          <span className="text-3xl font-black text-foreground mt-1.5 block">{stats.total}</span>
          <span className="text-[10px] font-mono text-muted-foreground mt-2 block">provisioned stores</span>
        </div>
        <div className="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
          <Store className="h-6 w-6" />
        </div>
      </div>

      {/* Card 2: Database Health */}
      <div className="bg-card border border-border p-5 rounded-xl flex items-center justify-between relative overflow-hidden group hover:border-border transition duration-300 shadow-sm">
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl -translate-y-1/3 translate-x-1/3 group-hover:bg-emerald-500/10 transition duration-300" />
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Neon Connection Status</span>
          <span className="text-3xl font-black text-foreground mt-1.5 block flex items-baseline gap-1">
            {stats.healthy}
            <span className="text-sm font-semibold text-muted-foreground font-mono">/ {stats.total}</span>
          </span>
          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-450 mt-2 block flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            online & migrated
          </span>
        </div>
        <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-455">
          <Activity className="h-6 w-6" />
        </div>
      </div>

      {/* Card 3: Domain Breakdown */}
      <div className="bg-card border border-border p-5 rounded-xl flex flex-col justify-between relative overflow-hidden group hover:border-border transition duration-300 shadow-sm lg:col-span-2">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-xl -translate-y-1/3 translate-x-1/3 group-hover:bg-blue-500/10 transition duration-300" />
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Domain Deployments</span>
          <span className="text-[10px] font-mono uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">active instances</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-muted/40 p-2 rounded-lg border border-border text-center">
            <span className="text-xs font-semibold text-muted-foreground block truncate">General</span>
            <span className="text-lg font-black text-foreground mt-0.5 block">{stats.domains.GENERAL}</span>
          </div>
          <div className="bg-muted/40 p-2 rounded-lg border border-border text-center">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-500 block truncate">Jewelry</span>
            <span className="text-lg font-black text-foreground mt-0.5 block">{stats.domains.JEWELRY}</span>
          </div>
          <div className="bg-muted/40 p-2 rounded-lg border border-border text-center">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-500 block truncate">Hardware</span>
            <span className="text-lg font-black text-foreground mt-0.5 block">{stats.domains.HARDWARE}</span>
          </div>
          <div className="bg-muted/40 p-2 rounded-lg border border-border text-center">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-500 block truncate">Grocery</span>
            <span className="text-lg font-black text-foreground mt-0.5 block">{stats.domains.GROCERY}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
