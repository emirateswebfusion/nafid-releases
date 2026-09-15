import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  Search, User, UserCheck, X, Phone, MapPin, Receipt, Star, Calendar, ArrowLeft, Gift, LogOut,
  ShoppingBag, Sparkles, Clock, ChevronRight, CreditCard, Award, ArrowUpRight, TrendingUp, ExternalLink, Eye, Building2
} from 'lucide-react';
import clsx from 'clsx';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { Skeleton } from './ui/Skeleton';
import { Modal } from './ui/Modal';
import { parseUTCDate, getAppTimeFormat } from '../utils/receiptGenerator';
import { getStoreTimezone } from '../utils/timezoneHelper';

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

interface Party {
  party_id: string;
  name: string;
  phone: string;
  balance: number;
  gst_balance?: number;
  estimate_balance?: number;
  balance_type: 'RECEIVABLE' | 'PAYABLE';
  credit_limit?: number;
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
  payment_method?: string;
  subtotal?: number;
  tax_total?: number;
  discount_total?: number;
  received_amount?: number;
  balance_amount?: number;
  discount_value?: number;
  scrap_deduction?: number;
  scrap_invoice_number?: string;
  return_deduction?: number;
  return_invoice_number?: string;
}

function formatCurrency(amount: number): string {
  return `\u20B9${(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  if (!d) return '—';
  const tz = getStoreTimezone();
  return parseUTCDate(d).toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d: string) {
  if (!d) return '—';
  const tz = getStoreTimezone();
  return parseUTCDate(d).toLocaleString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: getAppTimeFormat() !== '24h' });
}

function getInitials(name: string): string {
  if (!name) return 'C';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

type View = 'list' | 'detail';
type DetailTab = 'purchases' | 'points';

export function CustomersPage({ onClose, isRestricted, onOpenParty }: { onClose: () => void; isRestricted?: boolean; onOpenParty?: (partyIdOrQuery?: string) => void }) {
  useCloseOnEscape(onClose);
  const { tenantId } = useAuthStore();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [view, setView] = useState<View>('list');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [matchedParty, setMatchedParty] = useState<Party | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('purchases');

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  const [loyaltyTxs, setLoyaltyTxs] = useState<LoyaltyTx[]>([]);
  const [loyaltyTxsLoading, setLoyaltyTxsLoading] = useState(false);

  // Invoice Detail Modal state
  const [viewingInvoice, setViewingInvoice] = useState<InvoiceRecord | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const loadCustomers = useCallback(async () => {
    if (!tenantId || !window.electronAPI) return;
    setLoading(true);
    try {
      const [custData, partyData] = await Promise.all([
        window.electronAPI.dbGetCustomers({ tenant_id: tenantId }),
        window.electronAPI.dbGetParties(tenantId).catch(() => []),
      ]);
      setCustomers(Array.isArray(custData) ? custData : []);
      setParties(Array.isArray(partyData) ? partyData : []);
    } catch {
      showStatus('Failed to load customers', 'error');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const loadCustomerDetails = async (customer: Customer) => {
    setSelectedCustomer(customer);

    // Match customer to Party by phone or name
    const cleanPhone = (customer.phone || '').trim();
    const cleanName = (customer.name || '').trim().toLowerCase();
    const pMatch = parties.find(p =>
      (cleanPhone && p.phone && String(p.phone).trim() === cleanPhone) ||
      (cleanName && p.name && p.name.trim().toLowerCase() === cleanName)
    );
    setMatchedParty(pMatch || null);

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

  const handleOpenInvoiceDetail = async (inv: InvoiceRecord) => {
    setViewingInvoice(inv);
    setItemsLoading(true);
    try {
      if (window.electronAPI?.dbGetInvoiceItems) {
        const items = await window.electronAPI.dbGetInvoiceItems(inv.invoice_id);
        setInvoiceItems(Array.isArray(items) ? items : []);
      } else {
        setInvoiceItems([]);
      }
    } catch {
      showStatus('Failed to load invoice items', 'error');
    } finally {
      setItemsLoading(false);
    }
  };

  const handleNavigateToParty = () => {
    if (!selectedCustomer) return;
    const target = matchedParty?.party_id || selectedCustomer.phone || selectedCustomer.name;
    if (onOpenParty) {
      onOpenParty(target);
    } else {
      showStatus(`Party ledger for "${selectedCustomer.name}" is accessible via the Parties menu.`, 'success');
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
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
              <UserCheck className="w-5 h-5" />
            </div>

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
                onClick={() => view === 'detail' ? setView('list') : onClose()}
                className="h-10 w-10 text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center justify-center shadow-xs"
                title={view === 'detail' ? 'Back to Customers' : 'Close to Dashboard'}
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

              {/* Action & Points Badges */}
              <div className="flex items-stretch gap-3 w-full md:w-auto flex-wrap">
                {/* Party Ledger Outstanding Balance Box */}
                {(() => {
                  const bal = matchedParty?.balance || 0;
                  const isReceivable = bal > 0;
                  const isPayable = bal < 0;

                  const colorStyles = isReceivable
                    ? {
                        box: 'bg-gradient-to-br from-rose-500/15 via-rose-500/5 to-transparent border-rose-500/30',
                        title: 'text-rose-600 dark:text-rose-400',
                        amount: 'text-rose-600 dark:text-rose-400',
                        limit: 'border-rose-500/20 text-rose-700 dark:text-rose-300',
                        button: 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border-rose-500/30',
                      }
                    : isPayable
                    ? {
                        box: 'bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent border-emerald-500/30',
                        title: 'text-emerald-600 dark:text-emerald-400',
                        amount: 'text-emerald-600 dark:text-emerald-400',
                        limit: 'border-emerald-500/20 text-emerald-700 dark:text-emerald-300',
                        button: 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
                      }
                    : {
                        box: 'bg-gradient-to-br from-blue-500/15 via-blue-500/5 to-transparent border-blue-500/30',
                        title: 'text-blue-600 dark:text-blue-400',
                        amount: 'text-blue-600 dark:text-blue-400',
                        limit: 'border-blue-500/20 text-blue-700 dark:text-blue-300',
                        button: 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 border-blue-500/30',
                      };

                  return (
                    <div className={clsx("rounded-2xl p-4 w-[210px] shrink-0 shadow-xs border flex flex-col justify-between transition-all", colorStyles.box)}>
                      <div>
                        <div className={clsx("flex items-center justify-between text-[10px] font-black uppercase tracking-wider mb-1", colorStyles.title)}>
                          <span>Party Ledger Balance</span>
                          <Building2 className="w-3.5 h-3.5" />
                        </div>
                        <p className={clsx("text-xl font-black font-mono tracking-tight", colorStyles.amount)}>
                          {matchedParty
                            ? (isReceivable ? `+${formatCurrency(bal)} (Rec)` : isPayable ? `-${formatCurrency(Math.abs(bal))} (Pay)` : `₹0.00 (Settled)`)
                            : 'No Party Record'}
                        </p>
                        {matchedParty?.credit_limit != null && Number(matchedParty.credit_limit) > 0 && (
                          <div className={clsx("mt-1.5 pt-1.5 border-t text-[11px] font-bold flex items-center justify-between", colorStyles.limit)}>
                            <span>Limit: {formatCurrency(matchedParty.credit_limit)}</span>
                            {bal >= matchedParty.credit_limit ? (
                              <span className="text-red-500 font-extrabold text-[10px]">Over Limit</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">Avail: {formatCurrency(Math.max(0, matchedParty.credit_limit - Math.max(0, bal)))}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleNavigateToParty}
                        className={clsx("mt-3 w-full py-1.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border active:scale-95 shrink-0", colorStyles.button)}
                      >
                        <span>View Party Ledger</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })()}

                {/* Available Points Badge Box */}
                <div className="bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-500/30 rounded-2xl p-4 w-[210px] shrink-0 text-left shadow-xs flex flex-col justify-between transition-all">
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
                      <span>Available Points</span>
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                      {(selectedCustomer.current_points_balance || 0).toFixed(0)} pts
                    </p>
                  </div>
                  <div className="mt-3 w-full py-1.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shrink-0">
                    <span className="text-[11px]">Total Earned: {(selectedCustomer.total_points_earned || 0).toFixed(0)} pts</span>
                  </div>
                </div>
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
                          onClick={() => handleOpenInvoiceDetail(inv)}
                          className="p-4 rounded-2xl border border-border/60 bg-card hover:border-primary/40 transition-all shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer group"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 text-primary font-mono font-black text-xs shrink-0 group-hover:scale-105 transition-transform flex items-center gap-1">
                              <Eye className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-primary group-hover:underline font-mono">#{inv.invoice_number}</span>
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
                            <span className="text-xs font-bold text-primary flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                              View Bill <ChevronRight className="w-3.5 h-3.5" />
                            </span>
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

      {/* Invoice Detail Modal */}
      {viewingInvoice && (
        <Modal isOpen={!!viewingInvoice} onClose={() => setViewingInvoice(null)} title={`Invoice Detail #${viewingInvoice.invoice_number}`}>
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 select-none">
            <div className="flex items-center justify-between bg-muted/40 p-3.5 rounded-xl border border-border">
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Invoice Number</p>
                <p className="text-base font-black text-foreground font-mono">#{viewingInvoice.invoice_number}</p>
                {viewingInvoice.payment_method && (
                  <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                    Method: {viewingInvoice.payment_method}
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Date & Time</p>
                <p className="text-xs font-bold text-foreground">{formatDateTime(viewingInvoice.created_at)}</p>
              </div>
            </div>

            {/* Purchased Items Table */}
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <div className="bg-muted/60 px-4 py-2 border-b border-border text-xs font-bold text-muted-foreground flex justify-between">
                <span>Items Purchased</span>
                <span>{invoiceItems.length} item{invoiceItems.length !== 1 ? 's' : ''}</span>
              </div>
              {itemsLoading ? (
                <div className="p-6 text-center text-xs text-muted-foreground">Loading invoice line items...</div>
              ) : invoiceItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">No itemized details recorded for this invoice.</div>
              ) : (
                <div className="divide-y divide-border">
                  {invoiceItems.map((item, idx) => (
                    <div key={item.item_id || idx} className="p-3 text-xs flex items-center justify-between">
                      <div>
                        <p className="font-bold text-foreground">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {item.quantity} {item.uom || 'Pcs'} × {formatCurrency(item.unit_price)}
                          {Number(item.tax_amount) > 0 && <span className="ml-2 text-emerald-600 font-semibold">(Tax: +{formatCurrency(item.tax_amount)})</span>}
                        </p>
                      </div>
                      <div className="text-right font-bold text-foreground font-mono">
                        {formatCurrency(item.total)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Financial Summary Box */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2 text-xs">
              {/* Subtotal */}
              <div className="flex justify-between text-muted-foreground font-semibold">
                <span>Subtotal:</span>
                <span className="font-mono text-foreground font-bold">
                  {formatCurrency(viewingInvoice.subtotal ?? invoiceItems.reduce((s, i) => s + (Number(i.total) || 0), 0))}
                </span>
              </div>

              {/* Total Tax */}
              <div className="flex justify-between text-emerald-600 font-bold">
                <span>Tax Total (GST):</span>
                <span className="font-mono">
                  +{formatCurrency(viewingInvoice.tax_total ?? invoiceItems.reduce((s, i) => s + (Number(i.tax_amount) || 0), 0))}
                </span>
              </div>

              {/* Bill Discount */}
              {Number(viewingInvoice.discount_total || viewingInvoice.discount_value) > 0 && (
                <div className="flex justify-between text-amber-600 font-bold">
                  <span>Trade Discount:</span>
                  <span className="font-mono">-{formatCurrency(viewingInvoice.discount_total || viewingInvoice.discount_value || 0)}</span>
                </div>
              )}

              {/* Scrap Deduction */}
              {Number(viewingInvoice.scrap_deduction) > 0 && (
                <div className="flex justify-between text-purple-600 font-bold">
                  <span>Scrap Deduction {viewingInvoice.scrap_invoice_number ? `(#${viewingInvoice.scrap_invoice_number})` : ''}:</span>
                  <span className="font-mono">-{formatCurrency(viewingInvoice.scrap_deduction || 0)}</span>
                </div>
              )}

              {/* Return Deduction */}
              {Number(viewingInvoice.return_deduction) > 0 && (
                <div className="flex justify-between text-rose-600 font-bold">
                  <span>Return Deduction {viewingInvoice.return_invoice_number ? `(#${viewingInvoice.return_invoice_number})` : ''}:</span>
                  <span className="font-mono">-{formatCurrency(viewingInvoice.return_deduction || 0)}</span>
                </div>
              )}

              {/* Loyalty Points Earned / Redeemed */}
              {viewingInvoice.points_earned > 0 && (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Loyalty Points Earned:</span>
                  <span>+{viewingInvoice.points_earned.toFixed(0)} pts</span>
                </div>
              )}
              {viewingInvoice.points_redeemed > 0 && (
                <div className="flex justify-between text-amber-600 font-bold">
                  <span>Loyalty Points Discount:</span>
                  <span className="font-mono">-{formatCurrency(viewingInvoice.points_redeemed_discount)}</span>
                </div>
              )}

              {/* Grand Total */}
              <div className="flex justify-between font-extrabold text-base pt-2.5 border-t border-border">
                <span>Grand Total:</span>
                <span className="text-primary font-mono">{formatCurrency(viewingInvoice.grand_total)}</span>
              </div>

              {/* Received & Balance Breakdown */}
              {(Number(viewingInvoice.received_amount) > 0 || Number(viewingInvoice.balance_amount) > 0) && (
                <div className="pt-2 border-t border-border/60 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-muted/40 p-2 rounded-lg border border-border/40">
                    <span className="text-muted-foreground font-semibold block">Received Amount:</span>
                    <span className="font-bold text-foreground font-mono">{formatCurrency(viewingInvoice.received_amount || 0)}</span>
                  </div>
                  <div className="bg-muted/40 p-2 rounded-lg border border-border/40">
                    <span className="text-muted-foreground font-semibold block">Outstanding Balance:</span>
                    <span className={clsx("font-bold font-mono", Number(viewingInvoice.balance_amount) > 0 ? "text-amber-600" : "text-emerald-600")}>
                      {formatCurrency(viewingInvoice.balance_amount || 0)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
