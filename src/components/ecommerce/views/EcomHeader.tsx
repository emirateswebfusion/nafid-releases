import { Globe, TrendingUp, Package, ShoppingCart, Store, Settings, RefreshCw, X } from 'lucide-react';
import clsx from 'clsx';
import type { EcommerceState } from '../hooks/useEcommerceState';

export interface EcomHeaderProps {
  currentTenantId: string;
  isVendorApproved: boolean;
  onClose: () => void;
  refreshStatus: () => Promise<void>;
  regStatus: "PENDING" | "ACTIVE" | "NOT_REQUESTED" | "APPROVED" | "REJECTED" | "SUSPENDED" | "CONNECTION_ERROR";
  shopName: string | null;
  ec: EcommerceState;
}

/** E-commerce portal header: title, store / tenant, tab switch and close. */
export function EcomHeader({
  currentTenantId, isVendorApproved, onClose, refreshStatus, regStatus, shopName, ec,
}: EcomHeaderProps) {
  const { activeTab, connectionStatus, orders, pingLatency, products, refreshing, setActiveTab } = ec;
  return (
    <header className="h-16 shrink-0 z-30 border-b border-border/80 bg-card/95 backdrop-blur-md px-5 flex items-center justify-between shadow-2xs">
      
      {/* Brand & Store Context */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
          <Globe className="h-4.5 w-4.5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-1.5">
              <span>FusionCart Marketplace Hub</span>
            </h1>
          </div>
          <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
            <span>Store: <strong className="text-foreground">{shopName || 'Retail Hub'}</strong></span>
            <span className="text-muted-foreground/40">•</span>
            <span>Tenant: <span className="font-mono text-muted-foreground/80">{currentTenantId.slice(0, 8)}...{currentTenantId.slice(-4)}</span></span>
          </p>
        </div>
      </div>

      {/* Center Tab Navigation (Segmented Switcher) */}
      <div className="hidden lg:flex items-center gap-1 p-1 bg-muted/50 dark:bg-muted/20 border border-border/80 rounded-2xl shadow-inner">
        {[
          { id: 'overview' as const, label: 'Overview', icon: TrendingUp },
          { id: 'products' as const, label: 'Online Catalog', icon: Package, count: products.length },
          { id: 'orders' as const, label: 'Orders Stream', icon: ShoppingCart, count: orders.length },
          { id: 'registration' as const, label: 'Vendor Status', icon: Store, hasBadge: true },
          { id: 'settings' as const, label: 'Configuration', icon: Settings },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-2 py-1.5 px-3.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer select-none",
                isActive
                  ? "bg-card text-foreground shadow-xs border border-border/70 font-extrabold"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/40"
              )}
            >
              <Icon className={clsx("h-3.5 w-3.5", isActive ? "text-primary" : "text-muted-foreground/70")} />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={clsx(
                  "text-[10px] font-mono px-1.5 py-0.2 rounded-md font-bold",
                  isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground/70"
                )}>
                  {tab.count}
                </span>
              )}
              {tab.hasBadge && (
                <span className={clsx(
                  "w-2 h-2 rounded-full shrink-0",
                  isVendorApproved ? "bg-emerald-500 animate-pulse" : regStatus === 'PENDING' ? "bg-amber-500" : "bg-slate-400"
                )} />
              )}
            </button>
          );
        })}
      </div>

      {/* Right Tools & Actions */}
      <div className="flex items-center gap-2.5">
        {/* FusionCart API Status Indicator */}
        <div className={clsx(
          "flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-colors shadow-2xs",
          connectionStatus?.connected
            ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
            : "bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400"
        )}>
          <span className={clsx(
            "w-2 h-2 rounded-full",
            connectionStatus?.connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
          )} />
          <span className="hidden sm:inline">
            {connectionStatus?.connected ? (pingLatency ? `${pingLatency}ms • Live` : 'Connected') : 'Gateway Offline'}
          </span>
        </div>

        {/* Sync Button */}
        <button
          onClick={refreshStatus}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-border/80 bg-card hover:bg-muted text-foreground transition-all cursor-pointer active:scale-95 disabled:opacity-50 shadow-2xs"
          title="Refresh remote synchronization status"
        >
          <RefreshCw className={clsx("h-3.5 w-3.5", refreshing && "animate-spin text-primary")} />
          <span className="hidden md:inline">Sync Hub</span>
        </button>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/80 rounded-xl transition-all duration-150 active:scale-95 cursor-pointer shadow-2xs"
          title="Close E-Commerce Portal (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
