import { getStoreLocale, getCurrencyDecimals } from '../../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React, { useEffect } from 'react';
import { Button } from '../../ui/Button';
import { isAdminRole, formatRoleName } from '../../../utils/security/permissions';
import clsx from 'clsx';
import { DigitalClock } from '../DigitalClock';
import { SlidersHorizontal, LayoutGrid, Grid3x3, Sun, Moon, Settings, LogOut, Lock, RotateCcw, Download, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { useUpdateStore } from '../../../store/updateStore';
import type { OwnerDashboardState } from '../hooks/useOwnerDashboardState';

export interface DashboardHeaderProps {
  canOpenSettings: boolean;
  isCloudSyncPaused: boolean;
  isEditMode: boolean;
  isSyncing: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  role: "SUPER_ADMIN" | "ADMIN" | "STAFF" | null;
  setIsEditMode: (editing: boolean) => void;
  shopName: string | null;
  theme: "light" | "dark";
  toggleTheme: () => void;
  userName: string | null;
  od: OwnerDashboardState;
}

/** Dashboard header: shop and user, clock, sales today, sync status / route, theme toggle, update action, and the menu. */
export function DashboardHeader({
  canOpenSettings, isCloudSyncPaused, isEditMode, isSyncing, menuRef, role, setIsEditMode, shopName, theme,
  toggleTheme, userName, od,
}: DashboardHeaderProps) {
  const { activeRoute, gridMode, invoiceCount, isOnline, menuOpen, setGridMode, setMenuOpen, setShowCustomizeModal, totalSales, totalSalesBeforeDeductions, dashboardSalesMetric } = od;
  const isRevenueMetric = dashboardSalesMetric === 'NET_REVENUE';
  const displaySalesAmount = isRevenueMetric ? totalSales : (totalSalesBeforeDeductions || totalSales);
  const displaySalesLabel = isRevenueMetric ? 'Revenue Today' : 'Sales Today';

  const { updateInfo, updateReady, isDownloading, installUpdate, init: initUpdate, installError, isInstalling } = useUpdateStore();

  useEffect(() => {
    initUpdate();
  }, [initUpdate]);

  return (
    <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 px-5 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-foreground truncate">
              Welcome back, <span className="text-primary">{userName || shopName || (isAdminRole(role) ? 'Admin' : 'Staff')}</span>
            </h1>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          </div>
          <DigitalClock variant="header" showSeconds={true} className="mt-1" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20" title={isRevenueMetric ? 'Total Revenue (Net realized collections after scrap/return deductions)' : 'Total Sales (Gross product sales before deductions)'}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{getCurrencyPrefix()}{displaySalesAmount.toLocaleString(getStoreLocale(), { minimumFractionDigits: getCurrencyDecimals(), maximumFractionDigits: getCurrencyDecimals() })} {displaySalesLabel}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{invoiceCount} {invoiceCount === 1 ? 'Invoice' : 'Invoices'}</span>
            </div>
            <Button type="button" variant="ghost" disabled={!isCloudSyncPaused}
              className={clsx(
                "h-auto flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors disabled:opacity-100",
                isCloudSyncPaused
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 cursor-pointer hover:bg-amber-500/20 active:scale-[0.97]"
                  : (!isOnline || !activeRoute || activeRoute === 'NONE')
                  ? "bg-destructive/10 border-destructive/20 text-destructive"
                  : isSyncing
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              )}
              onClick={isCloudSyncPaused ? () => window.dispatchEvent(new Event('open-session-expired-modal')) : undefined}
              title={isCloudSyncPaused ? "Click to login and resume cloud sync" : undefined}
            >
              <span className={clsx(
                "w-1.5 h-1.5 rounded-full",
                isCloudSyncPaused
                  ? "bg-amber-500 animate-pulse"
                  : (!isOnline || !activeRoute || activeRoute === 'NONE')
                  ? "bg-destructive"
                  : isSyncing
                  ? "bg-blue-500 animate-spin"
                  : "bg-emerald-500 animate-pulse"
              )} />
              <span className="text-[10px] font-bold tracking-wider">
                {isCloudSyncPaused
                  ? 'Re-Login Needed'
                  : (!isOnline || !activeRoute || activeRoute === 'NONE')
                  ? 'Offline'
                  : isSyncing
                  ? 'Syncing...'
                  : (activeRoute === 'LAN' ? 'Wi-Fi Connected' : 'Cloud Connected')}
              </span>
            </Button>
            <span className="w-px h-5 bg-border/40" />
          </div>

          {/* Dynamic Update Action with smooth transition */}
          {updateReady ? (
            <button
              type="button"
              onClick={installUpdate} disabled={isInstalling}
              className="group relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm hover:shadow-md hover:brightness-105 active:scale-95 transition-all duration-300 cursor-pointer animate-in fade-in slide-in-from-right-3 zoom-in-95 border border-emerald-400/30"
              title={installError || "Start the downloaded update installer"}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              <RotateCcw className="w-3.5 h-3.5 shrink-0 transition-transform duration-500 group-hover:-rotate-180" />
              <span className="tracking-wide">{isInstalling ? 'Starting installer...' : installError ? 'Retry installation' : 'Restart to Update'}</span>
              {updateInfo?.version && (
                <span className="text-[9px] font-mono font-bold bg-white/20 px-1.5 py-0.5 rounded-md">
                  v{updateInfo.version}
                </span>
              )}
            </button>
          ) : updateInfo ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-settings-manager'))}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25 hover:bg-blue-500/20 active:scale-95 transition-all duration-300 cursor-pointer animate-in fade-in slide-in-from-right-3 zoom-in-95 shadow-xs"
              title="New update available. Click to view release highlights and update progress in Settings."
            >
              {isDownloading ? (
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-blue-500" />
              ) : (
                <Download className="w-3.5 h-3.5 shrink-0 text-blue-500" />
              )}
              <span className="tracking-wide">
                {isDownloading ? 'Downloading Update...' : `v${updateInfo.version} Available`}
              </span>
            </button>
          ) : null}

          {/* Grid Mode Selector */}
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border">
            <button
              onClick={() => setGridMode('2COL')}
              className={clsx("p-1.5 rounded-lg transition-all cursor-pointer", gridMode === '2COL' ? "bg-card text-primary shadow-sm border border-border" : "text-muted-foreground hover:text-foreground")}
              title="2-Column Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setGridMode('3COL')}
              className={clsx("p-1.5 rounded-lg transition-all cursor-pointer", gridMode === '3COL' ? "bg-card text-primary shadow-sm border border-border" : "text-muted-foreground hover:text-foreground")}
              title="Compact Grid View"
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all duration-200 active:scale-95 cursor-pointer"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Settings Button */}
          {canOpenSettings && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-settings-manager'))}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all duration-200 active:scale-95 cursor-pointer"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {/* Profile Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center font-bold text-xs text-primary-foreground shadow-sm hover:shadow-md hover:scale-105 transition-all duration-200 cursor-pointer"
              title="Profile"
            >
              {(userName || shopName)?.[0].toUpperCase() || 'A'}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] w-56 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
                  <p className="text-sm font-bold text-foreground truncate">{userName || shopName || (isAdminRole(role) ? 'Admin' : 'Staff')}</p>
                  <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-widest font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {formatRoleName(role)}
                  </p>
                </div>
                <div className="p-1.5 space-y-1">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setShowCustomizeModal(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted rounded-lg transition-colors text-left cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                    <span>Customize Cards Order</span>
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setIsEditMode(!isEditMode);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted rounded-lg transition-colors text-left cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                    <span>{isEditMode ? 'Exit Reorder Mode' : 'Reorder Cards on Grid'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      void useAuthStore.getState().lockTerminal();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted rounded-lg transition-colors text-left cursor-pointer"
                    title="Lock terminal screen (unlock with PIN)"
                  >
                    <Lock className="w-3.5 h-3.5 text-primary" />
                    <span>Lock Terminal</span>
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      void useAuthStore.getState().logout();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors text-left cursor-pointer"
                    title="Full sign out (disconnects cloud sync on this PC)"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
