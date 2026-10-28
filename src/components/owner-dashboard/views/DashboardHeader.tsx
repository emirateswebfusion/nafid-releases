import React from 'react';
import { isAdminRole, formatRoleName } from '../../../utils/security/permissions';
import { getStoreTimezone } from '../../../utils/time/timezoneHelper';
import clsx from 'clsx';
import { SlidersHorizontal, LayoutGrid, Grid3x3, Sun, Moon, Settings, LogOut } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
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

/** Dashboard header: shop and user, clock, sales today, sync status / route, theme toggle and the menu. */
export function DashboardHeader({
  canOpenSettings, isCloudSyncPaused, isEditMode, isSyncing, menuRef, role, setIsEditMode, shopName, theme,
  toggleTheme, userName, od,
}: DashboardHeaderProps) {
  const { activeRoute, gridMode, invoiceCount, isOnline, menuOpen, setGridMode, setMenuOpen, setShowCustomizeModal, totalSales, totalSalesBeforeDeductions, dashboardSalesMetric } = od;
  const isRevenueMetric = dashboardSalesMetric === 'NET_REVENUE';
  const displaySalesAmount = isRevenueMetric ? totalSales : (totalSalesBeforeDeductions || totalSales);
  const displaySalesLabel = isRevenueMetric ? 'Revenue Today' : 'Sales Today';
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
          <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
            {new Date().toLocaleDateString('en-US', { timeZone: getStoreTimezone(), weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20" title={isRevenueMetric ? 'Total Revenue (Net realized collections after scrap/return deductions)' : 'Total Sales (Gross product sales before deductions)'}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">₹{displaySalesAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {displaySalesLabel}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{invoiceCount} {invoiceCount === 1 ? 'Invoice' : 'Invoices'}</span>
            </div>
            <div
              className={clsx(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors",
                isCloudSyncPaused
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 cursor-pointer hover:bg-amber-500/20 active:scale-[0.97]"
                  : (!isOnline || activeRoute === 'NONE')
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
                  : (!isOnline || activeRoute === 'NONE')
                  ? "bg-destructive"
                  : isSyncing
                  ? "bg-blue-500 animate-spin"
                  : "bg-emerald-500 animate-pulse"
              )} />
              <span className="text-[10px] font-bold tracking-wider">
                {isCloudSyncPaused
                  ? 'Re-Login Needed'
                  : (!isOnline || activeRoute === 'NONE')
                  ? 'Offline'
                  : isSyncing
                  ? 'Syncing...'
                  : (activeRoute === 'LAN' ? 'Wi-Fi Synced' : 'Cloud Synced')}
              </span>
            </div>
            <span className="w-px h-5 bg-border/40" />
          </div>

          {/* Reorder / Customizer Header Action */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-95 cursor-pointer shadow-xs border",
                isEditMode
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-muted/60 hover:bg-muted text-foreground border-border"
              )}
              title={isEditMode ? "Exit Reorder Mode" : "Enable Reorder Cards Mode"}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{isEditMode ? 'Done Reordering' : 'Reorder Cards'}</span>
            </button>
          </div>

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
                    onClick={() => useAuthStore.getState().logout()}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors text-left cursor-pointer"
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
