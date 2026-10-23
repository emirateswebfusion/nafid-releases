import React from 'react';
import { Loader2, Search, X, UserCheck, CreditCard, AlertTriangle, Tag, FilterX, Award, Gift, User, Phone, Trash2, ChevronRight, Clock, Calendar, Star } from 'lucide-react';
import clsx from 'clsx';
import { Skeleton } from '../../ui/Skeleton';
import { getInitials, formatDate } from '../customerFormat';
import type { PricingTier, Customer } from '../customerTypes';

export interface CustomerListViewProps {
  customers: Customer[];
  filterActive: boolean;
  filterCredit: "all" | "credit" | "no-credit";
  filterLoading: boolean;
  filterOverdue: boolean;
  filterPricingTier: string;
  handleDeleteCustomerClick: (cust: Customer, e?: React.MouseEvent) => void;
  handleListScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  highlightedCustomerId: string | null;
  isOwner: boolean;
  listScrollRef: React.RefObject<HTMLDivElement | null>;
  loadCustomerDetails: (customer: Customer) => Promise<void>;
  loading: boolean;
  loyaltyEnabled: boolean;
  pricingTiers: PricingTier[];
  searchQuery: string;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  setDebouncedSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setFilterActive: React.Dispatch<React.SetStateAction<boolean>>;
  setFilterCredit: React.Dispatch<React.SetStateAction<"all" | "credit" | "no-credit">>;
  setFilterOverdue: React.Dispatch<React.SetStateAction<boolean>>;
  setFilterPricingTier: React.Dispatch<React.SetStateAction<string>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  totalPointsActive: number;
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  visibleCount: number;
}

/** Customers list: search / filters, summary, and the customer cards or rows. */
export function CustomerListView({
  customers, filterActive, filterCredit, filterLoading, filterOverdue, filterPricingTier, handleDeleteCustomerClick,
  handleListScroll, highlightedCustomerId, isOwner, listScrollRef, loadCustomerDetails, loading, loyaltyEnabled,
  pricingTiers, searchQuery, sentinelRef, setDebouncedSearchQuery, setFilterActive, setFilterCredit,
  setFilterOverdue, setFilterPricingTier, setSearchQuery, totalPointsActive, totalPointsIssued, totalPointsRedeemed,
  visibleCount,
}: CustomerListViewProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 w-full px-4 sm:px-6 py-4 space-y-4 overflow-hidden">
      {/* Streamlined Toolbar (Search + Summary Pills) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card border border-border/80 px-4 py-2.5 rounded-2xl shadow-xs shrink-0">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          {filterLoading ? (
            <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
          ) : (
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          )}
          <input
            type="text"
            placeholder="Search customers by name or phone..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-9 py-2 text-xs bg-muted/40 border border-border/80 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/60 font-semibold text-foreground"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setDebouncedSearchQuery('');
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Active Filter */}
          <button
            onClick={() => setFilterActive(!filterActive)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
              filterActive
                ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted hover:text-foreground'
            )}
            title="Active customers (purchased in last 90 days)"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Active</span>
          </button>

          {/* Credit Filter */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilterCredit(filterCredit === 'credit' ? 'all' : 'credit')}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                filterCredit === 'credit'
                  ? 'bg-amber-500/10 text-amber-600 border border-amber-500/30'
                  : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted hover:text-foreground'
              )}
              title="Customers with credit balance (receivable)"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Credit</span>
            </button>
            <button
              onClick={() => setFilterCredit(filterCredit === 'no-credit' ? 'all' : 'no-credit')}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                filterCredit === 'no-credit'
                  ? 'bg-blue-500/10 text-blue-600 border border-blue-500/30'
                  : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted hover:text-foreground'
              )}
              title="Customers without credit balance"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>No Credit</span>
            </button>

            {/* Overdue Filter */}
            <button
              onClick={() => setFilterOverdue(!filterOverdue)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer',
                filterOverdue
                  ? 'bg-rose-500/10 text-rose-600 border border-rose-500/30 font-black'
                  : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted hover:text-foreground'
              )}
              title="Filter customers with overdue credit payments"
            >
              <AlertTriangle className={clsx("w-3.5 h-3.5", filterOverdue ? "text-rose-600 animate-pulse" : "text-muted-foreground")} />
              <span>Overdue</span>
              {customers.filter(c => c.has_overdue).length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-black leading-tight">
                  {customers.filter(c => c.has_overdue).length}
                </span>
              )}
            </button>
          </div>

          {/* Pricing Tier Filter */}
          {pricingTiers.length > 0 && (
            <div className="relative">
              <select
                value={filterPricingTier}
                onChange={e => setFilterPricingTier(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-muted/50 border border-border text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 cursor-pointer appearance-none pr-8"
              >
                <option value="">All Tiers</option>
                {pricingTiers.map(tier => (
                  <option key={tier.pricing_tier_id} value={tier.pricing_tier_id}>{tier.name}</option>
                ))}
              </select>
              <Tag className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
            </div>
          )}

          {/* Clear Filters */}
          {(filterActive || filterCredit !== 'all' || filterOverdue || filterPricingTier) && (
            <button
              onClick={() => {
                setFilterActive(false);
                setFilterCredit('all');
                setFilterOverdue(false);
                setFilterPricingTier('');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-destructive/80 border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 transition-all cursor-pointer"
              title="Clear all filters"
            >
              <FilterX className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Metric Pills Row */}
        {loyaltyEnabled && (
          <div className="flex items-center gap-2 overflow-x-auto py-0.5 shrink-0">
            <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-xl shrink-0">
              <Award className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <div className="text-left">
                <span className="text-[10px] text-muted-foreground font-bold uppercase block leading-none">Issued</span>
                <span className="text-xs font-black text-blue-600 dark:text-blue-400 font-mono leading-tight">{totalPointsIssued.toFixed(0)} pts</span>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl shrink-0">
              <Gift className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <div className="text-left">
                <span className="text-[10px] text-muted-foreground font-bold uppercase block leading-none">Redeemed</span>
                <span className="text-xs font-black text-amber-600 dark:text-amber-400 font-mono leading-tight">{totalPointsRedeemed.toFixed(0)} pts</span>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl shrink-0">
              <Award className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <div className="text-left">
                <span className="text-[10px] text-muted-foreground font-bold uppercase block leading-none">Active</span>
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono leading-tight">{totalPointsActive.toFixed(0)} pts</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Customer Cards Grid / List Area */}
      <div ref={listScrollRef} onScroll={handleListScroll} className="flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground bg-card rounded-2xl border border-dashed border-border/80 flex flex-col items-center justify-center gap-3 p-8">
            <div className="p-3.5 bg-muted/40 rounded-xl border border-border/40">
              <User className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <div className="max-w-md">
              <p className="text-sm font-extrabold text-foreground">
                {(searchQuery || filterActive || filterCredit !== 'all' || filterPricingTier)
                  ? 'No matching customers found'
                  : 'No customer records yet'}
              </p>
              <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
                {searchQuery || filterActive || filterCredit !== 'all' || filterPricingTier
                  ? 'Try adjusting your search or filters.'
                  : 'Customer records are automatically logged when phone numbers or details are entered during sales checkout.'}
              </p>
            </div>
          </div>
        ) : (
          (() => {
            const displayedCustomers = customers.slice(0, visibleCount);

            return (
              <div className="space-y-4">
                <div className={clsx(
                  "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3.5 transition-opacity duration-150",
                  filterLoading && "opacity-60 pointer-events-none"
                )}>
                  {displayedCustomers.map(customer => (
                    <div
                      key={customer.customer_id}
                      id={`customer-row-${customer.customer_id}`}
                      onClick={() => loadCustomerDetails(customer)}
                      className={clsx(
                        "p-3.5 rounded-xl bg-card border border-border/80 hover:border-primary/50 hover:shadow-md transition-all duration-200 cursor-pointer group select-none flex flex-col justify-between gap-3",
                        highlightedCustomerId === customer.customer_id && "ring-2 ring-primary ring-offset-2 bg-primary/10 border-primary"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 via-primary/10 to-transparent text-primary border border-primary/20 flex items-center justify-center font-black text-xs shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                            {getInitials(customer.name)}
                          </div>
                          <div className="min-w-0 leading-tight">
                            <p className="font-bold text-foreground truncate text-sm group-hover:text-primary transition-colors">{customer.name}</p>
                            <p className="text-xs text-muted-foreground font-medium mt-0.5 flex items-center gap-1 truncate">
                              {customer.phone ? (
                                <span className="flex items-center gap-1 text-muted-foreground/90 font-mono">
                                  <Phone className="w-3 h-3 text-primary/70" /> {customer.phone}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/50">No phone</span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {isOwner && (
                            <button
                              onClick={(e) => handleDeleteCustomerClick(customer, e)}
                              className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100 active:scale-95 cursor-pointer"
                              title="Delete Customer & Ledger"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </div>

                      {/* Status and Credit Tags */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {customer.has_overdue && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 animate-pulse">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {customer.overdue_bills_count || 1} OVERDUE
                          </span>
                        )}
                        {Boolean(customer.credit_period_enabled) && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                            <Clock className="w-2.5 h-2.5" />
                            {customer.credit_period_days || 30}d Period
                          </span>
                        )}
                        {customer.party_balance != null && customer.party_balance > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-mono">
                            Due: ₹{customer.party_balance.toFixed(2)}
                          </span>
                        )}
                        {customer.pricing_tier_name && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-600 dark:text-violet-400">
                            <Tag className="w-2.5 h-2.5" />
                            {customer.pricing_tier_name}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-border/40 text-[11px]">
                        <span className="text-muted-foreground flex items-center gap-1 font-medium">
                          <Calendar className="w-3 h-3 text-muted-foreground/60" />
                          {customer.last_purchase_date ? formatDate(customer.last_purchase_date) : 'No purchases'}
                        </span>

                        {loyaltyEnabled && (
                          <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-black font-mono">
                            <Star className="w-3 h-3 fill-emerald-500/20" />
                            {(customer.current_points_balance || 0).toFixed(0)} pts
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sentinel element for scroll intersection */}
                <div ref={sentinelRef} className="h-4 w-full" />

                {/* Infinite Scroll Progress Bar */}
                {customers.length > 0 && (
                  <div className="flex items-center justify-between border-t border-border/80 pt-3.5 text-xs select-none">
                    <div className="text-muted-foreground font-semibold">
                      Showing <span className="font-mono text-foreground font-bold">{Math.min(visibleCount, customers.length)}</span> of{' '}
                      <span className="font-mono text-foreground font-bold">{customers.length}</span> customers
                    </div>
                    {visibleCount < customers.length && (
                      <div className="text-xs text-muted-foreground font-medium animate-pulse flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        <span>Scroll down to load more...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
