import { UserCheck, GitMerge, UserPlus, Edit3, Trash2, LogOut, RefreshCw, Filter } from 'lucide-react';
import clsx from 'clsx';
import { RedCrossButton } from '../../ui/RedCrossButton';
import { useAuthStore } from '../../../store/authStore';
import type { Customer, View } from '../customerTypes';

export interface CustomerPageHeaderProps {
  view: View;
  selectedCustomer: Customer | null;
  customersCount: number;
  loyaltyEnabled: boolean;
  filterActive: boolean;
  filterCredit: 'all' | 'credit' | 'no-credit';
  filterPricingTier: string;
  setFilterActive: (v: boolean) => void;
  setFilterCredit: (v: 'all' | 'credit' | 'no-credit') => void;
  setFilterPricingTier: (v: string) => void;
  cleaningDuplicates: boolean;
  handleCleanDuplicates: () => void;
  isOwner: boolean;
  handleAddCustomerClick: () => void;
  handleEditCustomerClick: (cust: Customer) => void;
  handleDeleteCustomerClick: (cust: Customer) => void;
  isRestricted?: boolean;
  onClose: () => void;
  setView: (v: View) => void;
  isResyncing: boolean;
  onResyncCustomers: () => void;
}

export function CustomerPageHeader({
  view,
  selectedCustomer,
  customersCount,
  loyaltyEnabled,
  filterActive,
  filterCredit,
  filterPricingTier,
  setFilterActive,
  setFilterCredit,
  setFilterPricingTier,
  cleaningDuplicates,
  handleCleanDuplicates,
  isOwner,
  handleAddCustomerClick,
  handleEditCustomerClick,
  handleDeleteCustomerClick,
  isRestricted,
  onClose,
  setView,
  isResyncing,
  onResyncCustomers,
}: CustomerPageHeaderProps) {
  return (
    <header className="shrink-0 border-b border-border/80 bg-card/95 backdrop-blur-md shadow-xs z-30 px-4 sm:px-6 py-2.5">
      <div className="flex items-center justify-between gap-4 w-full">
        {/* Left Title & Status */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>

          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-black text-foreground truncate tracking-tight">
                {view === 'list' ? 'Customer Directory' : selectedCustomer?.name || 'Customer Profile'}
              </h1>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="System Live" />
              {/* Active Filter Indicator Badge */}
              {(filterActive || filterCredit !== 'all' || filterPricingTier) && (
                <button
                  onClick={() => {
                    setFilterActive(false);
                    setFilterCredit('all');
                    setFilterPricingTier('');
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold uppercase tracking-wider hover:bg-primary/20 transition-all cursor-pointer"
                  title="Click to clear all filters"
                >
                  <Filter className="w-3 h-3" />
                  <span>Filters Active</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-mono">
                    {(filterActive ? 1 : 0) + (filterCredit !== 'all' ? 1 : 0) + (filterPricingTier ? 1 : 0)}
                  </span>
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground font-semibold mt-0.5 flex items-center gap-1.5 truncate">
              {view === 'list' ? (
                <span>{customersCount} registered customer{customersCount !== 1 ? 's' : ''}</span>
              ) : (
                <>
                  {loyaltyEnabled && (
                    <>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">Loyalty Member</span>
                      <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/40" />
                    </>
                  )}
                  <span className="font-mono">ID: #{selectedCustomer?.customer_id.slice(-6).toUpperCase()}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Right Actions & Close */}
        <div className="flex items-center gap-3 shrink-0">
          {view === 'list' && (
            <button
              onClick={onResyncCustomers}
              disabled={isResyncing}
              className="h-9 px-3 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted border border-border/50 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              title="Force refresh / download customers & ledgers from cloud"
            >
              <RefreshCw className={clsx("w-3.5 h-3.5", isResyncing && "animate-spin text-primary")} />
              <span className="hidden sm:inline">{isResyncing ? 'Syncing...' : 'Re-sync'}</span>
            </button>
          )}
          {view === 'list' && (
            <button
              onClick={handleCleanDuplicates}
              disabled={cleaningDuplicates}
              className="h-9 px-3 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted border border-border/50 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              title="Scan and merge duplicate customer and credit ledger records"
            >
              <GitMerge className={`w-3.5 h-3.5 ${cleaningDuplicates ? 'animate-spin' : 'text-amber-500'}`} />
              <span className="hidden sm:inline">{cleaningDuplicates ? 'Merging...' : 'Merge Duplicates'}</span>
            </button>
          )}
          {view === 'list' && isOwner && (
            <button
              onClick={handleAddCustomerClick}
              className="h-9 px-3.5 rounded-xl text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-xs"
              title="Add New Customer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add Customer</span>
            </button>
          )}
          {view === 'detail' && selectedCustomer && isOwner && (
            <>
              <button
                onClick={() => handleEditCustomerClick(selectedCustomer)}
                className="h-9 px-3 rounded-xl text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-xs"
                title="Edit Customer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Edit Customer</span>
              </button>
              <button
                onClick={() => handleDeleteCustomerClick(selectedCustomer)}
                className="h-9 px-3 rounded-xl text-xs font-bold text-destructive bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-xs"
                title="Delete Customer & Ledger"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Delete Customer</span>
              </button>
            </>
          )}

          {isRestricted ? (
            <button
              onClick={() => useAuthStore.getState().logout()}
              className="h-9 px-3.5 text-xs font-bold text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center gap-2"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          ) : (
            <RedCrossButton
              onClick={() => view === 'detail' ? setView('list') : onClose()}
              title={view === 'detail' ? 'Back to Customer List' : 'Close'}
            />
          )}
        </div>
      </div>
    </header>
  );
}
