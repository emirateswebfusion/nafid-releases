import React from 'react';
import {
  Link, CheckCircle2, X, Search, Loader2, UserPlus,
  Activity, TrendingUp, TrendingDown, AlertTriangle, Tag, Layers,
  BookOpen, PlusCircle, MinusCircle, Phone, Pencil, Trash,
  ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, LayoutList, Table,
  Clock, CreditCard, Calendar
} from 'lucide-react';
import clsx from 'clsx';
import { Skeleton } from '../../ui/Skeleton';
import { Select } from '../../ui/Select';
import { RedCrossButton } from '../../ui/RedCrossButton';
import { formatDate, getInitials, nameToHue } from '../partyHelpers';

export interface PartyListViewProps {
  pendingRequests: any[];
  handleRespondConnectRequest: (requestId: string, action: 'ACCEPT' | 'REJECT') => void;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  tabCounts: Record<string, number>;
  tLabels: any;
  parties: any[];
  totalReceivable: number;
  totalPayable: number;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  setDebouncedSearchQuery: (q: string) => void;
  isSearchPending: boolean;
  listLayoutMode: 'cards' | 'table';
  setListLayoutMode: (mode: 'cards' | 'table') => void;
  customCategoriesList: string[];
  customCategoryFilter: string;
  setCustomCategoryFilter: (cat: string) => void;
  fieldCls: string;
  loading: boolean;
  filteredParties: any[];
  displayedParties: any[];
  listScrollRef: React.RefObject<HTMLDivElement | null>;
  handleListScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  highlightedPartyId: string | null;
  lastInteractedPartyId: React.MutableRefObject<string | null>;
  savedScrollTop: React.MutableRefObject<number>;
  pricingTiers: any[];
  enablePartyGst: boolean;
  enablePartyEstimate: boolean;
  getPartyBalance: (p: any) => number;
  loadLedger: (partyId: string) => void;
  setSelectedParty: (p: any) => void;
  setView: (v: any) => void;
  setLedgerBalanceFilter: (f: any) => void;
  isOwner: boolean;
  startEditingParty: (party: any, returnTo?: 'list' | 'ledger') => void;
  handleDeleteParty: (party: any) => void;
  resetPartyForm: () => void;
  setVisibleCount: React.Dispatch<React.SetStateAction<number>>;
}

export const PartyListView: React.FC<PartyListViewProps> = ({
  pendingRequests,
  handleRespondConnectRequest,
  activeTab,
  setActiveTab,
  tabCounts,
  tLabels,
  parties,
  totalReceivable,
  totalPayable,
  searchQuery,
  setSearchQuery,
  setDebouncedSearchQuery,
  isSearchPending,
  listLayoutMode,
  setListLayoutMode,
  customCategoriesList,
  customCategoryFilter,
  setCustomCategoryFilter,
  fieldCls,
  loading,
  filteredParties,
  displayedParties,
  listScrollRef,
  handleListScroll,
  highlightedPartyId,
  lastInteractedPartyId,
  savedScrollTop,
  pricingTiers,
  enablePartyGst,
  enablePartyEstimate,
  getPartyBalance,
  loadLedger,
  setSelectedParty,
  setView,
  setLedgerBalanceFilter,
  isOwner,
  startEditingParty,
  handleDeleteParty,
  resetPartyForm,
  setVisibleCount,
}) => {
  return (
        <div className="flex flex-col flex-1 min-h-0">

          {/* Pending Connection Requests Banner */}
          {pendingRequests.length > 0 && (
            <div className="shrink-0 px-5 py-3 border-b border-border bg-indigo-500/10">
              <div className="space-y-2">
                {pendingRequests.map((req) => (
                  <div key={req.request_id} className="flex items-center justify-between gap-3 p-3 bg-card border border-indigo-500/30 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 shrink-0">
                        <Link className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">🤝 Connection Request from "{req.sender_tenant_name}"</p>
                        <p className="text-[11px] text-muted-foreground truncate">Code: {req.sender_connect_code} · Click to connect ledgers & auto-sync transactions</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleRespondConnectRequest(req.request_id, 'ACCEPT')}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                      </button>
                      <button
                        onClick={() => handleRespondConnectRequest(req.request_id, 'REJECT')}
                        className="p-1.5 bg-muted hover:bg-rose-500/10 hover:text-rose-500 text-muted-foreground rounded-xl transition-all cursor-pointer"
                        title="Decline"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary strip */}
          <div className="shrink-0 px-5 py-4 border-b border-border bg-transparent">
            <div className="grid grid-cols-3 gap-4">

              {/* Receivable */}
              <div className="bg-card dark:bg-card border border-border p-4.5 rounded-[24px] flex items-center gap-4 hover:border-rose-500/25 hover:shadow-md hover:bg-card transition-all duration-300 group select-none">
                <div className="p-3.5 bg-gradient-to-br from-rose-500/10 to-rose-500/5 text-rose-600 dark:text-rose-400 rounded-2xl group-hover:scale-105 transition-transform shadow-inner">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-black tracking-tight text-foreground font-mono">₹{totalReceivable.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider leading-none">{tLabels.receivable}</p>
                  <p className="text-[9px] text-muted-foreground/60 font-semibold mt-1 leading-none">{tLabels.receivableSub}</p>
                </div>
              </div>

              {/* Payable */}
              <div className="bg-card dark:bg-card border border-border p-4.5 rounded-[24px] flex items-center gap-4 hover:border-emerald-500/25 hover:shadow-md hover:bg-card transition-all duration-300 group select-none">
                <div className="p-3.5 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 rounded-2xl group-hover:scale-105 transition-transform shadow-inner">
                  <TrendingDown className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-black tracking-tight text-foreground font-mono">₹{totalPayable.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider leading-none">{tLabels.payable}</p>
                  <p className="text-[9px] text-muted-foreground/60 font-semibold mt-1 leading-none">{tLabels.payableSub}</p>
                </div>
              </div>

              {/* Total parties */}
              <div className="bg-card dark:bg-card border border-border p-4.5 rounded-[24px] flex items-center gap-4 hover:border-blue-500/25 hover:shadow-md hover:bg-card transition-all duration-300 group select-none">
                <div className="p-3.5 bg-gradient-to-br from-blue-500/10 to-blue-500/5 text-blue-600 dark:text-blue-400 rounded-2xl group-hover:scale-105 transition-transform shadow-inner">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-black tracking-tight text-foreground font-mono">{filteredParties.length}</p>
                  <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider leading-none">Contacts</p>
                  <p className="text-[9px] text-muted-foreground/60 font-semibold mt-1 leading-none">{filteredParties.length === 1 ? 'Active contact' : 'Active contacts'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Search & Layout toggle */}
          <div className="shrink-0 px-5 py-3 border-b border-border bg-background flex items-center justify-between gap-3">
            <div className="relative flex-1">
              {isSearchPending ? (
                <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin pointer-events-none" />
              ) : (
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              )}
              <input
                type="text"
                placeholder="Search by name, phone or GSTIN..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={clsx(fieldCls, 'pl-10')}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setDebouncedSearchQuery(''); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-destructive hover:bg-destructive/10 border border-destructive/30 transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5 text-destructive" />
                </button>
              )}
            </div>

            {/* Layout View Switcher (Icon-only) */}
            <div className="flex items-center p-1 rounded-xl bg-muted/70 border border-border shrink-0 select-none">
              <button
                type="button"
                onClick={() => setListLayoutMode('table')}
                className={clsx(
                  "p-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer",
                  listLayoutMode === 'table'
                    ? "bg-card text-primary shadow-xs border border-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Table View"
              >
                <Table className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setListLayoutMode('cards')}
                className={clsx(
                  "p-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer",
                  listLayoutMode === 'cards'
                    ? "bg-card text-primary shadow-xs border border-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Cards View"
              >
                <LayoutList className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Tabs (Ledger Categorization) */}
          <div className="shrink-0 px-5 py-2.5 border-b border-border bg-card flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
              <button
                onClick={() => setActiveTab('ALL')}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none",
                  activeTab === 'ALL'
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                🌐 All
                <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-black/10 dark:bg-white/20 font-mono">
                  {parties.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('CUSTOMER')}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none",
                  activeTab === 'CUSTOMER'
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                🛒 Customers
                <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-black/10 dark:bg-white/20 font-mono">
                  {tabCounts.customer}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('SUPPLIER')}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none",
                  activeTab === 'SUPPLIER'
                    ? "bg-purple-600 text-white shadow-sm"
                    : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                📦 Suppliers
                <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-black/10 dark:bg-white/20 font-mono">
                  {tabCounts.supplier}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('STAFF')}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none",
                  activeTab === 'STAFF'
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                👥 Staff
                <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-black/10 dark:bg-white/20 font-mono">
                  {tabCounts.staff}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('CUSTOM')}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none",
                  activeTab === 'CUSTOM'
                    ? "bg-amber-600 text-white shadow-sm"
                    : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                🏦 Custom / Chitty
                <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-black/10 dark:bg-white/20 font-mono">
                  {tabCounts.custom}
                </span>
              </button>
            </div>

            {/* Sub-category filter for Custom parties */}
            {activeTab === 'CUSTOM' && customCategoriesList.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">Category:</span>
                <select
                  value={customCategoryFilter}
                  onChange={e => setCustomCategoryFilter(e.target.value)}
                  className="bg-background border border-border rounded-xl px-3 py-1 text-xs font-bold text-foreground focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  {customCategoriesList.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div ref={listScrollRef} onScroll={handleListScroll} className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[72px] w-full rounded-xl" />)}
              </div>
            ) : filteredParties.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                  <BookOpen className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="text-base font-bold text-foreground">
                    {searchQuery ? 'No results found' : 'No parties yet'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {searchQuery ? `No parties match "${searchQuery}"` : 'Add your first party to start tracking'}
                  </p>
                </div>
                {!searchQuery && isOwner && (
                  <button
                    onClick={() => { resetPartyForm(); setView('party_form'); }}
                    className="mt-2 flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-sm hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" /> Add First Party
                  </button>
                )}
              </div>
            ) : listLayoutMode === 'table' ? (
              /* ── Standard Party Directory Table View ── */
              <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-muted/70 text-muted-foreground font-bold border-b border-border uppercase tracking-wider text-[11px] select-none sticky top-0 backdrop-blur-md">
                      <th className="py-3 px-4">Party Name</th>
                      <th className="py-3 px-4">Category / Type</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4 text-right">Balance</th>
                      <th className="py-3 px-4 text-right">Credit Limit</th>
                      <th className="py-3 px-4">Last Activity</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {displayedParties.map(party => {
                      const balance = getPartyBalance(party);
                      const isReceivable = balance > 0;
                      const isPayable = balance < 0;
                      const hue = nameToHue(party.name);
                      return (
                        <tr
                          key={party.party_id}
                          id={`party-row-${party.party_id}`}
                          onClick={() => {
                            lastInteractedPartyId.current = party.party_id;
                            if (listScrollRef.current) {
                              savedScrollTop.current = listScrollRef.current.scrollTop;
                            }
                            setSelectedParty(party);
                            setView('ledger');
                            loadLedger(party.party_id);
                          }}
                          className={clsx(
                            "hover:bg-muted/40 transition-colors cursor-pointer group",
                            highlightedPartyId === party.party_id && "bg-primary/10"
                          )}
                        >
                          {/* Party Name */}
                          <td className="py-3 px-4 font-bold text-foreground">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white font-black text-xs shadow-xs"
                                style={{ background: `hsl(${hue}, 65%, 52%)` }}
                              >
                                {getInitials(party.name)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">{party.name}</p>
                                {party.gstin && <p className="text-[10px] text-muted-foreground font-mono">GST: {party.gstin}</p>}
                              </div>
                            </div>
                          </td>

                          {/* Type / Category */}
                          <td className="py-3 px-4">
                            {party.party_type === 'SUPPLIER' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md">
                                📦 Supplier
                              </span>
                            )}
                            {party.party_type === 'STAFF' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                                👥 Staff
                              </span>
                            )}
                            {party.party_type === 'CUSTOM' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                                🏦 {party.custom_category || 'Custom'}
                              </span>
                            )}
                            {(!party.party_type || party.party_type === 'CUSTOMER') && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md">
                                🛒 Customer
                              </span>
                            )}
                          </td>

                          {/* Contact */}
                          <td className="py-3 px-4 font-medium text-muted-foreground">
                            {party.phone ? (
                              <div className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-muted-foreground/70" />
                                <span>{party.phone}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/30">—</span>
                            )}
                          </td>

                          {/* Balance */}
                          <td className="py-3 px-4 text-right">
                            <span className={clsx(
                              "font-mono font-black text-sm block",
                              isReceivable ? "text-rose-600 dark:text-rose-400" :
                              isPayable ? "text-emerald-600 dark:text-emerald-400" :
                              "text-muted-foreground"
                            )}>
                              ₹{Math.abs(balance).toFixed(2)}
                            </span>
                            {enablePartyGst && enablePartyEstimate && (
                              <div className="flex items-center justify-end gap-1.5 text-[9px] font-bold font-mono mt-0.5">
                                <span className="text-sky-600 dark:text-sky-400" title="GST Balance">G: ₹{Math.abs(Number(party.current_gst_balance ?? party.gst_balance ?? 0)).toFixed(2)}</span>
                                <span className="text-muted-foreground/30">•</span>
                                <span className="text-violet-600 dark:text-violet-400" title="Estimate Balance">E: ₹{Math.abs(Number(party.current_estimate_balance ?? party.estimate_balance ?? 0)).toFixed(2)}</span>
                              </div>
                            )}
                            {enablePartyGst && !enablePartyEstimate && (
                              <div className="flex items-center justify-end text-[9px] font-bold font-mono text-sky-600 dark:text-sky-400 mt-0.5">
                                GST Balance
                              </div>
                            )}
                            {!enablePartyGst && enablePartyEstimate && (
                              <div className="flex items-center justify-end text-[9px] font-bold font-mono text-violet-600 dark:text-violet-400 mt-0.5">
                                Estimate Balance
                              </div>
                            )}
                            <span className={clsx(
                              "inline-block text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border mt-0.5",
                              isReceivable ? "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400" :
                              isPayable ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" :
                              "bg-muted border-border text-muted-foreground"
                            )}>
                              {isReceivable ? tLabels.receivable : isPayable ? tLabels.payable : 'Settled'}
                            </span>
                          </td>

                          {/* Credit Limit & Period */}
                          <td className="py-3 px-4 text-right font-mono font-semibold text-muted-foreground">
                            <div className="flex flex-col items-end gap-1">
                              {party.credit_limit != null && Number(party.credit_limit) > 0 && (
                                <span className={clsx(
                                  "px-2 py-0.5 rounded border text-[11px] font-bold",
                                  isReceivable && balance >= party.credit_limit
                                    ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                                    : "bg-muted border-border text-foreground"
                                )}>
                                  ₹{Number(party.credit_limit).toLocaleString('en-IN')}
                                </span>
                              )}
                              {Boolean(party.credit_period_enabled) && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                                  <Clock className="w-2.5 h-2.5" />
                                  {party.credit_period_days || 30}d
                                </span>
                              )}
                              {party.has_overdue && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-black bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400 animate-pulse">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  OVERDUE
                                </span>
                              )}
                              {(!party.credit_limit || Number(party.credit_limit) <= 0) && !party.credit_period_enabled && !party.has_overdue && (
                                <span className="text-muted-foreground/30">—</span>
                              )}
                            </div>
                          </td>

                          {/* Last Activity */}
                          <td className="py-3 px-4 font-medium text-muted-foreground text-[11px]">
                            {party.last_transaction_date ? formatDate(party.last_transaction_date) : '—'}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => {
                                  setSelectedParty(party);
                                  setLedgerBalanceFilter('ALL');
                                  setView('ledger');
                                  loadLedger(party.party_id);
                                }}
                                className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                                title="Open Ledger"
                              >
                                <BookOpen className="w-4 h-4" />
                              </button>
                              {isOwner && (
                                <button
                                  onClick={() => startEditingParty(party, 'list')}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                  title="Edit"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                              )}
                              {isOwner && (
                                <button
                                  onClick={() => handleDeleteParty(party)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                                  title="Delete"
                                >
                                  <Trash className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-2">
                {displayedParties.map(party => {
                  const hue = nameToHue(party.name);
                  const balance = getPartyBalance(party);
                  const isReceivable = balance > 0;
                  const isPayable = balance < 0;
                  const _isSettled = balance === 0;
                  return (
                    <div
                      key={party.party_id}
                      id={`party-row-${party.party_id}`}
                      className={clsx(
                        "group flex items-center gap-3.5 p-4 rounded-2xl border border-border bg-card dark:bg-card hover:border-primary/30 hover:bg-card transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer",
                        highlightedPartyId === party.party_id && "ring-2 ring-primary ring-offset-2 bg-primary/10 border-primary"
                      )}
                      onClick={() => {
                        lastInteractedPartyId.current = party.party_id;
                        if (listScrollRef.current) {
                          savedScrollTop.current = listScrollRef.current.scrollTop;
                        }
                        setSelectedParty(party);
                        setLedgerBalanceFilter('ALL');
                        setView('ledger');
                        loadLedger(party.party_id);
                      }}
                    >
                      {/* Avatar */}
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white font-black text-sm shadow-inner select-none"
                        style={{ background: `hsl(${hue}, 65%, 52%)` }}
                      >
                        {getInitials(party.name)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm text-foreground truncate">{party.name}</p>
                          {/* Party Type Badge */}
                          {party.party_type === 'SUPPLIER' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                              📦 Supplier
                            </span>
                          )}
                          {party.party_type === 'STAFF' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                              👥 Staff
                            </span>
                          )}
                          {party.party_type === 'CUSTOM' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                              🏦 {party.custom_category || 'Custom'}
                            </span>
                          )}
                          {(!party.party_type || party.party_type === 'CUSTOMER') && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                              🛒 Customer
                            </span>
                          )}
                          {party.gstin && (
                            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                              GST
                            </span>
                          )}
                          {party.pricing_tier_id && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-500/10 dark:bg-violet-500/20 border border-violet-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                              <Tag className="w-2.5 h-2.5" />
                              {pricingTiers.find(t => t.pricing_tier_id === party.pricing_tier_id)?.name || 'Tier'}
                            </span>
                          )}
                          {party.credit_limit != null && Number(party.credit_limit) > 0 && (
                            <span className={clsx(
                              "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 border",
                              isReceivable && balance >= party.credit_limit
                                ? "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20"
                                : "text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/20"
                            )}>
                              <CreditCard className="w-2.5 h-2.5" />
                              Limit: ₹{Number(party.credit_limit).toLocaleString('en-IN')}
                            </span>
                          )}
                          {Boolean(party.credit_period_enabled) && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 border text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20">
                              <Clock className="w-2.5 h-2.5" />
                              {party.credit_period_days || 30}d Period
                            </span>
                          )}
                          {party.has_overdue && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded-md shrink-0 border text-rose-600 dark:text-rose-400 bg-rose-500/15 border-rose-500/30 animate-pulse">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              OVERDUE ({party.overdue_bills_count || 1})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground font-medium">
                          {party.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />{party.phone}
                            </span>
                          )}
                          {party.last_transaction_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />{formatDate(party.last_transaction_date)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Balance */}
                      <div className="text-right shrink-0">
                        <p className={clsx(
                          'text-base font-black leading-none',
                          isReceivable ? 'text-red-500 dark:text-red-400' :
                          isPayable ? 'text-emerald-600 dark:text-emerald-400' :
                          'text-muted-foreground'
                        )}>
                          ₹{Math.abs(balance).toFixed(2)}
                        </p>
                        {enablePartyGst && enablePartyEstimate && (
                          <div className="flex items-center justify-end gap-1 text-[9px] font-bold font-mono mt-1">
                            <span className="text-sky-600 dark:text-sky-400" title="GST Balance">G: ₹{Math.abs(Number(party.current_gst_balance ?? party.gst_balance ?? 0)).toFixed(2)}</span>
                            <span className="text-muted-foreground/30">•</span>
                            <span className="text-violet-600 dark:text-violet-400" title="Estimate Balance">E: ₹{Math.abs(Number(party.current_estimate_balance ?? party.estimate_balance ?? 0)).toFixed(2)}</span>
                          </div>
                        )}
                        {enablePartyGst && !enablePartyEstimate && (
                          <div className="flex items-center justify-end text-[9px] font-bold font-mono text-sky-600 dark:text-sky-400 mt-1">
                            GST Balance
                          </div>
                        )}
                        {!enablePartyGst && enablePartyEstimate && (
                          <div className="flex items-center justify-end text-[9px] font-bold font-mono text-violet-600 dark:text-violet-400 mt-1">
                            Estimate Balance
                          </div>
                        )}
                        <span className={clsx(
                          'inline-block mt-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md border',
                          isReceivable ? 'bg-red-500/10 dark:bg-red-500/20 border-red-500/20 text-red-500 dark:text-red-400' :
                          isPayable ? 'bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                          'bg-muted border-border text-muted-foreground'
                        )}>
                          {isReceivable ? tLabels.receivable : isPayable ? tLabels.payable : 'Settled'}
                        </span>
                        {party.credit_limit != null && Number(party.credit_limit) > 0 && isReceivable && (
                          <div className="mt-0.5 text-[9px]">
                            {balance >= party.credit_limit ? (
                              <span className="text-red-500 font-bold">Limit Reached</span>
                            ) : (
                              <span className="text-muted-foreground font-medium">Avail: ₹{Math.max(0, Number(party.credit_limit) - Number(balance)).toLocaleString('en-IN')}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions (show on hover) */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1" onClick={e => e.stopPropagation()}>
                        {isOwner && (
                          <button
                            onClick={() => {
                              lastInteractedPartyId.current = party.party_id;
                              if (listScrollRef.current) {
                                savedScrollTop.current = listScrollRef.current.scrollTop;
                              }
                              startEditingParty(party, 'list');
                            }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all active:scale-95 cursor-pointer"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isOwner && (
                          <button
                            onClick={() => handleDeleteParty(party)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95 cursor-pointer"
                            title="Delete"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 ml-0.5" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination / Load more indicator */}
            {filteredParties.length > displayedParties.length && (
              <div className="py-4 text-center">
                <p className="text-xs text-muted-foreground mb-2">
                  Showing <span className="font-bold text-foreground font-mono">{displayedParties.length}</span> of{' '}
                  <span className="font-bold text-foreground font-mono">{filteredParties.length}</span> parties
                </p>
                <button
                  type="button"
                  onClick={() => setVisibleCount(prev => Math.min(prev + 50, filteredParties.length))}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-muted hover:bg-muted/80 text-foreground transition-all cursor-pointer shadow-xs border border-border"
                >
                  Load more ({filteredParties.length - displayedParties.length} remaining)...
                </button>
              </div>
            )}
          </div>
        </div>
  );
};
