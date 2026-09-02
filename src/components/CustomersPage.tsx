import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  Search, User, UserCheck, X, Phone, MapPin, Receipt, Star, Calendar, ArrowLeft, Gift, LogOut,
  ShoppingBag, Sparkles, Clock, ChevronRight, CreditCard, Award, ArrowUpRight, TrendingUp
} from 'lucide-react';
import clsx from 'clsx';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { Skeleton } from './ui/Skeleton';

interface Customer {
  customer_id: string;
  name: string;
  phone: string;
  address: string;
  total_points_earned: number;
  total_points_redeemed: number;
  current_points_balance: number;
  last_purchase_date: string;
  created_at: string;
}

interface LoyaltyTx {
  transaction_id: string;
  customer_id: string;
  invoice_id: string;
  transaction_type: 'EARNED' | 'REDEEMED' | 'ADJUSTED';
  points: number;
  points_balance_before: number;
  points_balance_after: number;
  reference_number: string;
  description: string;
  created_by: string;
  created_at: string;
}

interface InvoiceRecord {
  invoice_id: string;
  invoice_number: string;
  grand_total: number;
  created_at: string;
  points_earned: number;
  points_redeemed: number;
  points_redeemed_discount: number;
}

function formatCurrency(amount: number): string {
  return `\u20B9${(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

function getInitials(name: string): string {
  if (!name) return 'C';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

type View = 'list' | 'detail';
type DetailTab = 'purchases' | 'points';

export function CustomersPage({ onClose, isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { tenantId } = useAuthStore();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [view, setView] = useState<View>('list');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('purchases');

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  const [loyaltyTxs, setLoyaltyTxs] = useState<LoyaltyTx[]>([]);
  const [loyaltyTxsLoading, setLoyaltyTxsLoading] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const loadCustomers = useCallback(async () => {
    if (!tenantId || !window.electronAPI) return;
    setLoading(true);
    try {
      const data = await window.electronAPI.dbGetCustomers({ tenant_id: tenantId });
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      showStatus('Failed to load customers', 'error');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const loadCustomerDetails = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setView('detail');
    setDetailTab('purchases');
    setInvoicesLoading(true);
    setLoyaltyTxsLoading(true);

    if (!window.electronAPI) return;
    try {
      const [invData, loyaltyData] = await Promise.all([
        window.electronAPI.dbGetCustomerInvoices({ customer_id: customer.customer_id, tenant_id: tenantId }),
        window.electronAPI.dbGetCustomerLoyaltyTransactions({ customer_id: customer.customer_id, tenant_id: tenantId }),
      ]);
      setInvoices(Array.isArray(invData) ? invData : []);
      setLoyaltyTxs(Array.isArray(loyaltyData) ? loyaltyData : []);
    } catch {
      showStatus('Failed to load customer details', 'error');
    } finally {
      setInvoicesLoading(false);
      setLoyaltyTxsLoading(false);
    }
  };

  const filteredCustomers = customers.filter(c =>
    !searchQuery ||
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.phone || '').includes(searchQuery)
  );

  const totalPointsIssued = customers.reduce((s, c) => s + (c.total_points_earned || 0), 0);
  const totalPointsRedeemed = customers.reduce((s, c) => s + (c.total_points_redeemed || 0), 0);
  const totalPointsActive = customers.reduce((s, c) => s + (c.current_points_balance || 0), 0);

  const totalLifetimeSpend = invoices.reduce((s, inv) => s + (inv.grand_total || 0), 0);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background select-none overflow-hidden">
      {/* Top Header */}
      <header className="shrink-0 border-b border-border/80 bg-card/90 backdrop-blur-md shadow-xs z-30">
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            {view === 'detail' ? (
              <button
                onClick={() => setView('list')}
                className="p-2 rounded-xl bg-muted/60 hover:bg-muted text-foreground transition-all duration-200 active:scale-95 cursor-pointer border border-border/60 flex items-center gap-2 group"
                title="Back to Customers"
              >
                <ArrowLeft className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className="text-xs font-bold hidden sm:inline">Customers</span>
              </button>
            ) : (
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
                <UserCheck className="w-5 h-5" />
              </div>
            )}

            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-foreground truncate tracking-tight">
                  {view === 'list' ? 'Customer Management' : selectedCustomer?.name || 'Customer Profile'}
                </h1>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="System Live" />
              </div>
              <p className="text-xs text-muted-foreground/80 font-medium mt-0.5 flex items-center gap-1.5">
                {view === 'list' ? (
                  <span>{customers.length} registered customer{customers.length !== 1 ? 's' : ''}</span>
                ) : (
                  <>
                    <span>Loyalty Member</span>
                    <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/40" />
                    <span>ID: #{selectedCustomer?.customer_id.slice(-6).toUpperCase()}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {statusMessage && (
              <span className={clsx(
                'text-xs font-bold px-3 py-1.5 rounded-full animate-in fade-in slide-in-from-top-1 duration-200',
                statusMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'
              )}>
                {statusMessage.text}
              </span>
            )}

            {isRestricted ? (
              <button
                onClick={() => useAuthStore.getState().logout()}
                className="h-10 px-3.5 text-xs font-bold text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center gap-2"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            ) : (
              <button
                onClick={onClose}
                className="h-10 w-10 text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center justify-center shadow-xs"
                title="Close"
              >
                <X className="w-4 h-4 text-destructive" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      {view === 'list' && (
        <div className="flex-1 flex flex-col min-h-0 max-w-7xl mx-auto w-full px-6 py-6 space-y-6 overflow-hidden">
          {/* Double-Bezel Hero Stats Container */}
          <div className="p-1.5 rounded-[28px] bg-muted/40 border border-border/60 shadow-xs shrink-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-card border border-border/40 p-4 rounded-[22px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
              <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/15">
                <div className="p-3 bg-blue-500/15 text-blue-600 dark:text-blue-400 rounded-xl shrink-0 shadow-inner">
                  <Award className="w-5 h-5" />
                </div>
                <div className="leading-tight text-left min-w-0">
                  <p className="text-2xl font-black text-foreground font-mono tracking-tight">{totalPointsIssued.toFixed(0)}</p>
                  <p className="text-[10px] text-muted-foreground/90 font-bold uppercase tracking-wider mt-1">Total Issued Points</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/15">
                <div className="p-3 bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-xl shrink-0 shadow-inner">
                  <Gift className="w-5 h-5" />
                </div>
                <div className="leading-tight text-left min-w-0">
                  <p className="text-2xl font-black text-foreground font-mono tracking-tight">{totalPointsRedeemed.toFixed(0)}</p>
                  <p className="text-[10px] text-muted-foreground/90 font-bold uppercase tracking-wider mt-1">Total Points Redeemed</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/15">
                <div className="p-3 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0 shadow-inner">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="leading-tight text-left min-w-0">
                  <p className="text-2xl font-black text-foreground font-mono tracking-tight">{totalPointsActive.toFixed(0)}</p>
                  <p className="text-[10px] text-muted-foreground/90 font-bold uppercase tracking-wider mt-1">Active Points Balance</p>
                </div>
              </div>
            </div>
          </div>

          {/* Search & Action Bar */}
          <div className="flex items-center justify-between bg-card border border-border p-3.5 rounded-[22px] shadow-xs shrink-0 gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Search customers by name or phone number..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-9 py-2.5 text-xs bg-muted/30 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/50 font-semibold text-foreground"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="text-xs font-semibold text-muted-foreground hidden sm:block">
              Showing <span className="text-foreground font-bold">{filteredCustomers.length}</span> results
            </div>
          </div>

          {/* Customer Cards Grid / List Area */}
          <div className="flex-1 overflow-y-auto pr-1">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground bg-card rounded-[28px] border border-dashed border-border/80 flex flex-col items-center justify-center gap-4 p-8">
                <div className="p-4 bg-muted/40 rounded-2xl shadow-inner border border-border/40">
                  <User className="w-10 h-10 text-muted-foreground/40" />
                </div>
                <div className="max-w-md">
                  <p className="text-base font-extrabold text-foreground">{searchQuery ? 'No matching customers found' : 'No customer records yet'}</p>
                  <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
                    Customer records are automatically logged when phone numbers or customer details are entered during pos sales.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pb-6">
                {filteredCustomers.map(customer => (
                  <div
                    key={customer.customer_id}
                    onClick={() => loadCustomerDetails(customer)}
                    className="p-1.5 rounded-2xl bg-muted/30 border border-border/60 hover:border-primary/40 hover:bg-muted/50 transition-all duration-300 shadow-xs cursor-pointer group select-none"
                  >
                    <div className="p-4 rounded-[14px] bg-card border border-border/30 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 flex-1 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/15 via-primary/10 to-transparent text-primary border border-primary/20 flex items-center justify-center font-black text-sm shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                          {getInitials(customer.name)}
                        </div>
                        <div className="min-w-0 flex-1 leading-tight text-left">
                          <p className="font-extrabold text-foreground truncate text-sm group-hover:text-primary transition-colors">{customer.name}</p>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-medium mt-1.5">
                            {customer.phone ? (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-muted-foreground/70" /> {customer.phone}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">No phone</span>
                            )}
                            {customer.last_purchase_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-muted-foreground/70" /> {formatDate(customer.last_purchase_date)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                          <p className="flex items-center justify-end gap-1 text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">
                            <Star className="w-3 h-3 fill-emerald-500/20" />
                            {(customer.current_points_balance || 0).toFixed(0)} pts
                          </p>
                          <p className="text-[9px] text-emerald-600/80 font-bold uppercase tracking-wider mt-0.5">
                            {(customer.total_points_earned || 0).toFixed(0)} earned
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Customer Detail View */}
      {view === 'detail' && selectedCustomer && (
        <div className="flex-1 flex flex-col min-h-0 max-w-7xl mx-auto w-full px-6 py-6 space-y-6 overflow-y-auto">
          {/* Profile Hero Section (Double-Bezel Enclosure) */}
          <div className="p-1.5 rounded-[28px] bg-muted/40 border border-border/60 shadow-xs shrink-0">
            <div className="bg-card border border-border/40 rounded-[22px] p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-start md:items-center gap-4 flex-1 min-w-0">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary/20 via-primary/10 to-emerald-500/20 text-primary border border-primary/30 flex items-center justify-center font-black text-2xl shrink-0 shadow-inner">
                  {getInitials(selectedCustomer.name)}
                </div>
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-black text-foreground tracking-tight">{selectedCustomer.name}</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                      Active Customer
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground font-semibold flex-wrap">
                    {selectedCustomer.phone && (
                      <span className="flex items-center gap-1.5 bg-muted/40 px-2.5 py-1 rounded-lg border border-border/40">
                        <Phone className="w-3.5 h-3.5 text-primary" /> {selectedCustomer.phone}
                      </span>
                    )}
                    {selectedCustomer.address && (
                      <span className="flex items-center gap-1.5 bg-muted/40 px-2.5 py-1 rounded-lg border border-border/40">
                        <MapPin className="w-3.5 h-3.5 text-primary" /> {selectedCustomer.address}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-muted-foreground/75">
                      <Calendar className="w-3.5 h-3.5" /> Customer Since {formatDate(selectedCustomer.created_at)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Available Points Badge Box */}
              <div className="w-full md:w-auto bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-500/30 rounded-2xl p-4.5 min-w-[220px] text-left md:text-right shadow-xs">
                <div className="flex items-center md:justify-end gap-1.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" /> Available Points Balance
                </div>
                <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight mt-1">
                  {(selectedCustomer.current_points_balance || 0).toFixed(0)}
                </p>
                <p className="text-[10px] text-muted-foreground/80 font-bold mt-1">
                  Total Points Earned: {(selectedCustomer.total_points_earned || 0).toFixed(0)} pts
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics Grid (4 Cards) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 shrink-0">
            <div className="p-4 rounded-2xl bg-card border border-border/60 shadow-xs flex items-center gap-3.5">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Lifetime Spend</p>
                <p className="text-base font-black text-foreground font-mono mt-0.5">{formatCurrency(totalLifetimeSpend)}</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border/60 shadow-xs flex items-center gap-3.5">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Total Orders</p>
                <p className="text-base font-black text-foreground font-mono mt-0.5">{invoices.length} invoices</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border/60 shadow-xs flex items-center gap-3.5">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Points Earned</p>
                <p className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                  +{(selectedCustomer.total_points_earned || 0).toFixed(0)} pts
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border/60 shadow-xs flex items-center gap-3.5">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Gift className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Points Redeemed</p>
                <p className="text-base font-black text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                  -{(selectedCustomer.total_points_redeemed || 0).toFixed(0)} pts
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Tabbed History Section */}
          <div className="flex-1 flex flex-col bg-card border border-border/60 rounded-[24px] shadow-xs overflow-hidden">
            {/* Tab Header */}
            <div className="flex items-center justify-between border-b border-border/60 px-6 py-3.5 bg-muted/20 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDetailTab('purchases')}
                  className={clsx(
                    'px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer',
                    detailTab === 'purchases'
                      ? 'bg-card text-foreground shadow-xs border border-border/80'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                >
                  <Receipt className="w-3.5 h-3.5 text-primary" />
                  <span>Purchase History</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary font-black">
                    {invoices.length}
                  </span>
                </button>

                <button
                  onClick={() => setDetailTab('points')}
                  className={clsx(
                    'px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer',
                    detailTab === 'points'
                      ? 'bg-card text-foreground shadow-xs border border-border/80'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                >
                  <Gift className="w-3.5 h-3.5 text-amber-500" />
                  <span>Points Activity Log</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-black">
                    {loyaltyTxs.length}
                  </span>
                </button>
              </div>
            </div>

            {/* Tab Body */}
            <div className="flex-1 p-6 overflow-y-auto">
              {detailTab === 'purchases' && (
                <div>
                  {invoicesLoading ? (
                    <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
                  ) : invoices.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground flex flex-col items-center justify-center gap-3">
                      <div className="p-4 bg-muted/30 rounded-2xl border border-border/40">
                        <CreditCard className="w-8 h-8 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm font-extrabold text-foreground">No purchases recorded yet</p>
                      <p className="text-xs text-muted-foreground/75 max-w-sm">
                        Invoices linked to this customer will appear here automatically after checkout.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {invoices.map(inv => (
                        <div
                          key={inv.invoice_id}
                          className="p-4 rounded-2xl border border-border/60 bg-card hover:border-primary/30 transition-all shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className="p-3 bg-muted/40 rounded-xl border border-border/40 text-foreground font-mono font-black text-xs shrink-0">
                              #
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-foreground font-mono">{inv.invoice_number}</span>
                                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-muted-foreground/60" /> {formatDateTime(inv.created_at)}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground font-bold mt-1">
                                Grand Total: <span className="text-foreground font-black">{formatCurrency(inv.grand_total)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-center">
                            {inv.points_earned > 0 && (
                              <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-mono">
                                +{inv.points_earned.toFixed(0)} pts earned
                              </span>
                            )}
                            {inv.points_redeemed > 0 && (
                              <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/10 text-amber-600 border border-amber-500/20 font-mono">
                                -{inv.points_redeemed.toFixed(0)} pts ({formatCurrency(inv.points_redeemed_discount)} off)
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'points' && (
                <div>
                  {loyaltyTxsLoading ? (
                    <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
                  ) : loyaltyTxs.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground flex flex-col items-center justify-center gap-3">
                      <div className="p-4 bg-muted/30 rounded-2xl border border-border/40">
                        <Gift className="w-8 h-8 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm font-extrabold text-foreground">No points activity yet</p>
                      <p className="text-xs text-muted-foreground/75 max-w-sm">
                        Loyalty point earnings, redemptions, and manual adjustments will be logged here.
                      </p>
                    </div>
                  ) : (
                    <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
                      {loyaltyTxs.map(tx => (
                        <div key={tx.transaction_id} className="relative group">
                          {/* Timeline node */}
                          <div className={clsx(
                            'absolute -left-6 top-3 w-5 h-5 rounded-full border-2 border-card flex items-center justify-center shadow-xs',
                            tx.transaction_type === 'EARNED' ? 'bg-emerald-500 text-white' :
                            tx.transaction_type === 'REDEEMED' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                          )}>
                            <Sparkles className="w-2.5 h-2.5" />
                          </div>

                          <div className="p-4 rounded-2xl border border-border/60 bg-card hover:border-primary/30 transition-all shadow-xs flex items-center justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={clsx(
                                  'text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider',
                                  tx.transaction_type === 'EARNED' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                                  tx.transaction_type === 'REDEEMED' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' :
                                  'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                                )}>
                                  {tx.transaction_type}
                                </span>
                                <span className="text-xs text-muted-foreground font-semibold">{formatDateTime(tx.created_at)}</span>
                              </div>
                              {tx.description && (
                                <p className="text-xs font-medium text-foreground">{tx.description}</p>
                              )}
                              {tx.reference_number && (
                                <p className="text-[10px] text-muted-foreground/75 font-mono">Ref: {tx.reference_number}</p>
                              )}
                            </div>

                            <div className="text-right">
                              <p className={clsx(
                                'text-base font-black font-mono tracking-tight',
                                tx.transaction_type === 'EARNED' ? 'text-emerald-600 dark:text-emerald-400' :
                                tx.transaction_type === 'REDEEMED' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600'
                              )}>
                                {tx.transaction_type === 'EARNED' ? '+' : '-'}{tx.points.toFixed(0)} pts
                              </p>
                              <p className="text-[10px] text-muted-foreground font-bold mt-0.5">
                                Balance: {tx.points_balance_after.toFixed(0)} pts
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
