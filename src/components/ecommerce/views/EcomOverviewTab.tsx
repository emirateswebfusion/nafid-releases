import { Package, Clock, ShoppingCart, DollarSign, Wifi, WifiOff, RefreshCw, Store, Upload, ChevronRight, Copy, Zap, Server } from 'lucide-react';
import clsx from 'clsx';
import { getStoreProfile } from '../../../utils/localization/storeProfile';
import { formatAmount } from '../../../utils/pricing/money';
import type { EcommerceState } from '../hooks/useEcommerceState';

export interface EcomOverviewTabProps {
  checkConnection: (url?: string | null) => Promise<void>;
  currentTenantId: string;
  handleCopyId: (text: string) => void;
  isVendorApproved: boolean;
  refreshStatus: () => Promise<void>;
  regStatus: "PENDING" | "ACTIVE" | "NOT_REQUESTED" | "APPROVED" | "REJECTED" | "SUSPENDED" | "CONNECTION_ERROR";
  shopName: string | null;
  summary: { published: number; pending: number; revenue: number; inStockCount: number; totalCatalog: number; publishedPercent: number; };
  ec: EcommerceState;
}

/** Overview tab: vendor status, catalog and order summaries, quick actions. */
export function EcomOverviewTab({
  checkConnection, currentTenantId, handleCopyId, isVendorApproved, refreshStatus, regStatus, shopName, summary, ec,
}: EcomOverviewTabProps) {
  const { connectionStatus, copiedId, orders, setActiveTab, settings, testingConnection } = ec;
  return (
    <div className="space-y-3.5 animate-in fade-in duration-200">
      
      {/* 4-Card Bento KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* Card 1: Published Online */}
        <div className="rounded-xl border border-border/80 bg-card p-3.5 sm:p-4 shadow-xs card-sheen relative group hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Published Online</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Package className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-foreground tracking-tight font-mono">
            {summary.published}
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium mt-1.5 pt-1.5 border-t border-border/40">
            <span>Active on Storefront</span>
            <span className="font-bold font-mono text-emerald-500">{summary.publishedPercent}% of catalog</span>
          </div>
        </div>

        {/* Card 2: Sync Queue */}
        <div className="rounded-xl border border-border/80 bg-card p-3.5 sm:p-4 shadow-xs card-sheen relative group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Sync Pending</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-foreground tracking-tight font-mono">
            {summary.pending}
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium mt-1.5 pt-1.5 border-t border-border/40">
            <span>Queued updates</span>
            <span className={clsx("font-bold font-mono", summary.pending > 0 ? "text-amber-500" : "text-emerald-500")}>
              {summary.pending > 0 ? 'Push needed' : 'Up to date'}
            </span>
          </div>
        </div>

        {/* Card 3: Online Orders */}
        <div className="rounded-xl border border-border/80 bg-card p-3.5 sm:p-4 shadow-xs card-sheen relative group hover:border-blue-500/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Marketplace Orders</span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <ShoppingCart className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-foreground tracking-tight font-mono">
            {orders.length}
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium mt-1.5 pt-1.5 border-t border-border/40">
            <span>Total fulfilled orders</span>
            <span className="font-bold font-mono text-blue-500">Store #{settings?.store_id || '0'}</span>
          </div>
        </div>

        {/* Card 4: Gross Revenue */}
        <div className="rounded-xl border border-border/80 bg-card p-3.5 sm:p-4 shadow-xs card-sheen relative group hover:border-primary/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Online Revenue</span>
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <DollarSign className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-foreground tracking-tight font-mono flex items-baseline gap-1">
            <span className="text-xs font-semibold text-muted-foreground">{getStoreProfile().currency}</span>
            <span>{formatAmount(summary.revenue)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium mt-1.5 pt-1.5 border-t border-border/40">
            <span>Gross customer sales</span>
            <span className="font-bold text-foreground">Direct Payouts</span>
          </div>
        </div>
      </div>

      {/* Unified Hero Status Banner (Consolidated Alert & Health) */}
      <div className="rounded-xl border border-border/80 bg-card p-3.5 sm:p-4 shadow-xs overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Left: Health Indicator & Gateway */}
          <div className="flex items-start gap-3">
            <div className={clsx(
              "p-2.5 rounded-xl shrink-0 border",
              connectionStatus?.connected
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                : "bg-rose-500/10 text-rose-600 border-rose-500/20"
            )}>
              {connectionStatus?.connected ? <Wifi className="h-4.5 w-4.5" /> : <WifiOff className="h-4.5 w-4.5" />}
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-foreground">
                  {connectionStatus?.connected
                    ? 'FusionCart Marketplace Gateway Active'
                    : 'FusionCart Gateway Unreachable'}
                </h3>
                <span className={clsx(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                  connectionStatus?.connected
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                )}>
                  {connectionStatus?.connected ? 'Live Syncing' : 'Connection Error'}
                </span>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {connectionStatus?.connected
                  ? `Connected to ${settings?.fusioncart_url || 'http://localhost:5050/api'} • Bidirectional delta syncing between POS local database and remote storefront.`
                  : `Cannot reach ${settings?.fusioncart_url || 'http://localhost:5050/api'}. Ensure the FusionCart server instance is running or update your API endpoint in Settings.`}
              </p>
            </div>
          </div>

          {/* Right: Quick Operational CTAs */}
          <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-border/40">
            {!connectionStatus?.connected ? (
              <>
                <button
                  onClick={() => checkConnection(settings?.fusioncart_url)}
                  disabled={testingConnection}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border/80 text-xs font-bold hover:bg-muted transition-all cursor-pointer shadow-2xs"
                >
                  <RefreshCw className={clsx("h-3.5 w-3.5", testingConnection && "animate-spin text-primary")} />
                  <span>Retry Ping</span>
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition-all cursor-pointer shadow-xs"
                >
                  Configure Gateway
                </button>
              </>
            ) : !isVendorApproved ? (
              <button
                onClick={() => setActiveTab('registration')}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition-all cursor-pointer shadow-xs"
              >
                <Store className="h-3.5 w-3.5" />
                <span>Complete Store Onboarding &rarr;</span>
              </button>
            ) : (
              <button
                onClick={() => setActiveTab('products')}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition-all cursor-pointer shadow-xs"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Publish More SKUs &rarr;</span>
              </button>
            )}
          </div>
        </div>

        {/* Onboarding Stepper Strip (When not yet registered) */}
        {!isVendorApproved && (
          <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className={clsx(
              "p-2.5 rounded-xl border flex items-center gap-2.5",
              connectionStatus?.connected ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-muted/40 border-border/70 text-muted-foreground"
            )}>
              <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center font-bold text-[11px]">1</div>
              <div className="text-xs">
                <div className="font-bold">Gateway Connection</div>
                <div className="text-[10px] opacity-80">{connectionStatus?.connected ? 'Online & Healthy' : 'Offline'}</div>
              </div>
            </div>

            <div className={clsx(
              "p-2.5 rounded-xl border flex items-center gap-2.5",
              regStatus === 'PENDING' ? "bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-primary/5 border-primary/20 text-primary"
            )}>
              <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center font-bold text-[11px]">2</div>
              <div className="text-xs">
                <div className="font-bold">Store Registration</div>
                <div className="text-[10px] opacity-80">{regStatus === 'PENDING' ? 'Under Review' : 'Needs Submission'}</div>
              </div>
            </div>

            <div className="p-2.5 rounded-xl border bg-muted/30 border-border/60 text-muted-foreground flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center font-bold text-[11px]">3</div>
              <div className="text-xs">
                <div className="font-bold">Publish Catalog</div>
                <div className="text-[10px] opacity-80">{summary.published} items ready</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Operations & Identity Bento (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        
        {/* Card A: Vendor Marketplace Identity (6-Tile Grid) */}
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              <span>Vendor Marketplace Identity</span>
            </h3>
            <button
              onClick={() => setActiveTab('settings')}
              className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Store Settings</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Compact 6-Tile Grid: Fits width proportionally without empty gaps */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl bg-background/60 border border-border/50">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Store Name</span>
              <span className="font-bold text-foreground text-xs mt-0.5 block truncate">{settings?.store_name || shopName || 'Retail Hub'}</span>
            </div>

            <div className="p-2.5 rounded-xl bg-background/60 border border-border/50">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Storefront Slug</span>
              <span className="font-mono font-bold text-primary text-xs mt-0.5 block truncate">/{settings?.store_slug || 'not-assigned'}</span>
            </div>

            <div className="p-2.5 rounded-xl bg-background/60 border border-border/50">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Vendor ID</span>
              <span className="font-mono font-bold text-foreground text-xs mt-0.5 block">
                {settings?.vendor_id ? `#${settings.vendor_id}` : '#Pending'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-background/60 border border-border/50">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Last Sync</span>
              <span className="font-mono text-foreground text-xs mt-0.5 block truncate">
                {settings?.last_sync_at ? new Date(settings.last_sync_at).toLocaleTimeString() : 'Never'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-background/60 border border-border/50">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Sync Health</span>
              <span className={clsx(
                "font-bold text-xs mt-0.5 block uppercase",
                settings?.last_sync_status === 'SUCCESS' ? "text-emerald-500" : "text-amber-500"
              )}>
                {settings?.last_sync_status || 'IDLE'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-background/60 border border-border/50">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Tenant Key</span>
              <button
                onClick={() => handleCopyId(currentTenantId)}
                className="text-[11px] font-mono text-muted-foreground hover:text-foreground flex items-center justify-between w-full mt-0.5 cursor-pointer"
                title="Click to copy full tenant ID"
              >
                <span className="truncate">{currentTenantId.slice(0, 8)}...</span>
                <Copy className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                {copiedId && <span className="text-[9px] text-emerald-500 font-bold ml-1">Copied</span>}
              </button>
            </div>
          </div>
        </div>

        {/* Card B: Quick Actions & Inventory Health */}
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span>Quick Actions &amp; Catalog Health</span>
            </h3>
            <span className="text-xs font-mono font-bold text-muted-foreground">{summary.totalCatalog} Total SKUs</span>
          </div>

          <div className="space-y-2.5">
            {/* Catalog Progress Bar */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground font-medium text-[11px]">Marketplace Publishing Rate</span>
                <span className="font-bold text-foreground font-mono text-xs">{summary.published} / {summary.totalCatalog} SKUs ({summary.publishedPercent}%)</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                  style={{ width: `${summary.publishedPercent}%` }}
                />
              </div>
            </div>

            {/* Action Buttons in Compact 2x2 Grid */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => setActiveTab('products')}
                className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/80 bg-background/50 hover:bg-muted text-left transition-all cursor-pointer group shadow-2xs"
              >
                <Package className="h-4 w-4 text-primary shrink-0 group-hover:scale-105 transition-transform" />
                <div className="min-w-0">
                  <span className="text-xs font-bold text-foreground block truncate">Manage Catalog</span>
                  <span className="text-[10px] text-muted-foreground block truncate">Publish &amp; override</span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('orders')}
                className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/80 bg-background/50 hover:bg-muted text-left transition-all cursor-pointer group shadow-2xs"
              >
                <ShoppingCart className="h-4 w-4 text-blue-500 shrink-0 group-hover:scale-105 transition-transform" />
                <div className="min-w-0">
                  <span className="text-xs font-bold text-foreground block truncate">View Orders</span>
                  <span className="text-[10px] text-muted-foreground block truncate">{orders.length} incoming</span>
                </div>
              </button>

              <button
                onClick={refreshStatus}
                className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/80 bg-background/50 hover:bg-muted text-left transition-all cursor-pointer group shadow-2xs"
              >
                <RefreshCw className="h-4 w-4 text-emerald-500 shrink-0 group-hover:scale-105 transition-transform" />
                <div className="min-w-0">
                  <span className="text-xs font-bold text-foreground block truncate">Delta Sync</span>
                  <span className="text-[10px] text-muted-foreground block truncate">Push stock live</span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/80 bg-background/50 hover:bg-muted text-left transition-all cursor-pointer group shadow-2xs"
              >
                <Server className="h-4 w-4 text-indigo-500 shrink-0 group-hover:scale-105 transition-transform" />
                <div className="min-w-0">
                  <span className="text-xs font-bold text-foreground block truncate">API Settings</span>
                  <span className="text-[10px] text-muted-foreground block truncate">Gateway config</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
