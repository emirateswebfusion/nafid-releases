import React from 'react';
import { Package, PackagePlus, Pencil, Save, Upload, Search, Loader2, X, Layers, CheckCircle2, AlertTriangle, AlertCircle, Tag, Plus, Trash, RefreshCw } from 'lucide-react';
import { isAdminRole, formatRoleName } from '../../../utils/security/permissions';
import { useAuthStore } from '../../../store/authStore';
import { RedCrossButton } from '../../ui/RedCrossButton';
import { Select } from '../../ui/Select';
import { settingsApi } from '../../../data/settings';
import clsx from 'clsx';
import { DateRangeFilter } from '../../ui/DateRangeFilter';
import type { InventoryState } from '../hooks/useInventoryState';

export interface InventoryHeaderProps {
  downloadCsv: () => Promise<void>;
  onClose: () => void;
  openAdd: () => Promise<void>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  tenantId: string | null;
  inv: InventoryState;
  onSyncCatalog?: () => Promise<void>;
  isSyncingCatalog?: boolean;
}

/** Inventory screen header: title and counts, list / form switch, view mode, date / stock / sort filters, search and the add / bulk / print / export actions. */
export function InventoryHeader({
  downloadCsv, onClose, openAdd, searchInputRef, tenantId, inv, onSyncCatalog, isSyncingCatalog,
}: InventoryHeaderProps) {
  const { editingProduct, filterDate, filterDateEnd, isSearching, searchQuery, selectedProductIds, setDebouncedSearchQuery, setFilterDate, setFilterDateEnd, setSearchQuery, setShowBulkDeleteConfirm, setShowUploadModal, setSortBy, setStockFilter, setView, setViewMode, sortBy, stockFilter, totalCount, view, viewMode } = inv;
  return (
    <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
      {/* Row 1: Title & Actions (Export, Import, Close) */}
      <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
            {view === 'list' ? <Package className="w-4 h-4" /> : view === 'add' ? <PackagePlus className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">
                {view === 'list' ? 'Inventory' : view === 'add' ? 'Add New Product' : `Edit: ${editingProduct?.name}`}
              </h1>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
            {view === 'list' && <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">{totalCount !== null ? totalCount : '...'} products in stock</p>}
            {view !== 'list' && (
              <span className="text-[11px] text-muted-foreground font-medium bg-muted px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 mt-0.5">
                {isAdminRole(useAuthStore.getState().role) ? formatRoleName(useAuthStore.getState().role) : (useAuthStore.getState().userName || 'Staff')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {view === 'list' && (
            <>
              {onSyncCatalog && (
                <button
                  type="button"
                  onClick={onSyncCatalog}
                  disabled={isSyncingCatalog}
                  className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Re-sync all products from cloud"
                >
                  <RefreshCw className={clsx("w-4 h-4", isSyncingCatalog && "animate-spin text-primary")} />
                </button>
              )}
              <button
                onClick={downloadCsv}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
                title="Export CSV"
              >
                <Save className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowUploadModal(true)}
                className="p-2 text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
                title="Import CSV/Excel"
              >
                <Upload className="w-4 h-4" />
              </button>
            </>
          )}
          <RedCrossButton
            onClick={view !== 'list' ? () => setView('list') : onClose}
            title="Close"
          />
        </div>
      </div>

      {/* Row 2: Search & Filters (only in list view) */}
      {view === 'list' && (
        <div className="px-4 sm:px-6 py-3 border-t border-border/50 bg-background/50">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            
            {/* Search - Full width on mobile, flex-1 on desktop */}
            <div className="relative w-full sm:max-w-xl flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground/40 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search by name, barcode, brand, or category..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full pl-11 pr-11 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-medium text-foreground"
              />
              {isSearching ? (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                </div>
              ) : searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDebouncedSearchQuery('');
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1.5 hover:bg-muted rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4 text-destructive" />
                </button>
              ) : null}
            </div>

            {/* Filter Controls - Horizontal row */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              
              {/* View Mode */}
              <div className="relative">
                <label className="sr-only">View Mode</label>
                <Select
                  value={viewMode}
                  onChange={v => {
                    setViewMode(v as typeof viewMode);
                    settingsApi.set({ tenant_id: tenantId || 'global', key: 'inventory_default_view', value: v }).catch(console.error);
                  }}
                  options={[
                    { value: 'estimate', label: 'Estimate' },
                    { value: 'gst', label: 'GST' },
                    { value: 'combined', label: 'All Products' },
                  ]}
                  className="min-w-[130px]"
                  triggerClassName="border-border hover:border-muted-foreground/30 shadow-none px-3 py-2 rounded-lg h-auto text-xs font-medium bg-background"
                  renderOption={(option, isSelected) => (
                    <div className="flex items-center gap-2 py-1">
                      <span className={clsx(
                        'w-2.5 h-2.5 rounded-full shrink-0',
                        option.value === 'estimate' && 'bg-amber-500',
                        option.value === 'gst' && 'bg-sky-500',
                        option.value === 'combined' && 'bg-primary'
                      )} />
                      <span className={clsx(isSelected && "font-semibold text-sm")}>{option.label}</span>
                    </div>
                  )}
                />
              </div>

              {/* Date Range */}
              <div className="relative hidden sm:block">
                <DateRangeFilter
                  startDate={filterDate}
                  endDate={filterDateEnd}
                  onChange={(start, end) => {
                    setFilterDate(start);
                    setFilterDateEnd(end);
                  }}
                />
              </div>

              {/* Stock Status */}
              <div className="relative">
                <label className="sr-only">Stock Status</label>
                <Select
                  value={stockFilter}
                  onChange={v => setStockFilter(v as typeof stockFilter)}
                  options={[
                    { value: 'all', label: 'All Stock', icon: Layers, color: 'text-primary' },
                    { value: 'in_stock', label: 'In Stock', icon: CheckCircle2, color: 'text-emerald-500' },
                    { value: 'low_stock', label: 'Low Stock', icon: AlertTriangle, color: 'text-amber-500' },
                    { value: 'out_of_stock', label: 'Out of Stock', icon: AlertCircle, color: 'text-red-500' },
                    { value: 'no_barcode', label: 'No Barcode', icon: Tag, color: 'text-orange-500' },
                  ]}
                  className="min-w-[135px]"
                  triggerClassName="border-border hover:border-muted-foreground/30 shadow-none px-3 py-2 rounded-lg h-auto text-xs font-medium bg-background"
                  renderOption={(option, isSelected) => {
                    const Icon = option.icon;
                    return (
                      <div className="flex items-center gap-2 py-1">
                        {Icon && <Icon className={clsx('w-3.5 h-3.5 shrink-0', option.color)} />}
                        <span className={clsx(isSelected && "font-semibold text-sm")}>{option.label}</span>
                      </div>
                    );
                  }}
                />
              </div>

              {/* Sort By */}
              <div className="relative hidden md:block">
                <label className="sr-only">Sort By</label>
                <Select
                  value={sortBy}
                  onChange={v => setSortBy(v as typeof sortBy)}
                  options={[
                    { value: 'name', label: 'Sort by Name' },
                    { value: 'created_at', label: 'Sort by Date Added' },
                    { value: 'updated_at', label: 'Sort by Date Updated' },
                    { value: 'stock', label: 'Sort by Stock (Low to High)' },
                  ]}
                  className="min-w-[160px]"
                  triggerClassName="border-border hover:border-muted-foreground/30 shadow-none px-3 py-2 rounded-lg h-auto text-xs font-medium bg-background"
                />
              </div>

              {/* Primary Action - Add Product */}
              <button
                onClick={openAdd}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground shadow-sm font-semibold hover:bg-primary/95 transition-all duration-200 active:scale-95 py-2 px-4 cursor-pointer shrink-0 whitespace-nowrap text-sm"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Product</span>
              </button>

            </div>

          </div>

          {/* Secondary Actions Row - Bulk Delete only (when items selected) */}
          {selectedProductIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50 hidden sm:flex">
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-destructive text-destructive-foreground shadow-sm font-medium hover:bg-destructive/90 transition-all duration-200 active:scale-95 py-2 px-3 cursor-pointer shrink-0 whitespace-nowrap text-xs animate-in fade-in"
              >
                <Trash className="w-3.5 h-3.5" />
                <span>Delete ({selectedProductIds.size})</span>
              </button>
            </div>
          )}

        </div>
      )}
    </header>
  );
}
