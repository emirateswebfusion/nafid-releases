import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  Search, User, X, Phone, MapPin, Receipt, Star, Calendar, ArrowLeft, Gift, LogOut
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
  return `\u20B9${amount.toFixed(2)}`;
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function _formatDateTime(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN');
}

type View = 'list' | 'detail';

export function CustomersPage({ onClose, isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { tenantId } = useAuthStore();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [view, setView] = useState<View>('list');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

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

  const totalPointsIssued = customers.reduce((s, c) => s + c.total_points_earned, 0);
  const totalPointsRedeemed = customers.reduce((s, c) => s + c.total_points_redeemed, 0);
  const totalPointsActive = customers.reduce((s, c) => s + c.current_points_balance, 0);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-card shadow-sm z-30">
        <div className="max-w-7xl mx-auto w-full px-6 flex items-center justify-between py-3 gap-4 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-inner">
            {view === 'list' ? <User className="w-5 h-5" /> : <Star className="w-5 h-5" />}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">
                {view === 'list' ? 'Customers' : selectedCustomer?.name || 'Customer Details'}
              </h1>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
            {view === 'list' && (
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                {customers.length} customer{customers.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {statusMessage && (
            <span className={clsx('text-sm font-medium', statusMessage.type === 'success' ? 'text-green-600' : 'text-destructive')}>
              {statusMessage.text}
            </span>
          )}
          {view === 'detail' && (
            <button onClick={() => setView('list')}
              className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center justify-center"
              title="Back to list">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          {isRestricted ? (
            <button onClick={() => useAuthStore.getState().logout()}
              className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center justify-center"
              title="Logout">
              <LogOut className="w-4 h-4 text-destructive" />
            </button>
          ) : (
            <button onClick={onClose}
              className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center justify-center"
              title="Close">
              <X className="w-4 h-4 text-destructive" />
            </button>
          )}
        </div>
      </div>
      </header>

      {view === 'list' && (
        <div className="flex-1 flex flex-col min-h-0 bg-background select-none max-w-7xl mx-auto w-full px-6 py-6 space-y-6">
          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-5 bg-card border border-border p-5 rounded-[24px] shrink-0 shadow-sm select-none">
            <div className="bg-card border border-border/40 p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <div className="p-3 bg-gradient-to-br from-blue-500/10 to-blue-500/5 text-blue-600 dark:text-blue-400 rounded-xl shrink-0 shadow-inner">
                <Gift className="w-5 h-5" />
              </div>
              <div className="leading-tight text-left">
                <p className="text-xl font-black text-foreground font-mono">{totalPointsIssued.toFixed(0)}</p>
                <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Issued Points</p>
              </div>
            </div>
            <div className="bg-card border border-border/40 p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <div className="p-3 bg-gradient-to-br from-amber-500/10 to-amber-500/5 text-amber-600 dark:text-amber-400 rounded-xl shrink-0 shadow-inner">
                <Gift className="w-5 h-5" />
              </div>
              <div className="leading-tight text-left">
                <p className="text-xl font-black text-foreground font-mono">{totalPointsRedeemed.toFixed(0)}</p>
                <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Redeemed</p>
              </div>
            </div>
            <div className="bg-card border border-border/40 p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <div className="p-3 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0 shadow-inner">
                <Gift className="w-5 h-5" />
              </div>
              <div className="leading-tight text-left">
                <p className="text-xl font-black text-foreground font-mono">{totalPointsActive.toFixed(0)}</p>
                <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Active Balance</p>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card border border-border p-4 rounded-[28px] shadow-sm px-6 py-3.5 shrink-0 select-none">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45" />
              <input type="text" placeholder="Search by name or phone..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* List area */}
          <div className="flex-1 overflow-y-auto bg-muted/[0.02]">
            <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm flex-1 flex flex-col min-h-0 bg-card border border-border rounded-[28px] overflow-hidden shadow-sm p-6">
              {loading ? (
                <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
              ) : filteredCustomers.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground bg-muted/20 rounded-[28px] border border-dashed border-border flex flex-col items-center justify-center gap-4 p-6">
                  <div className="p-4.5 bg-muted/30 rounded-2xl shadow-inner">
                    <User className="w-10 h-10 text-muted-foreground/30 stroke-[1.5]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{searchQuery ? 'No customers match your search' : 'No customers yet'}</p>
                    <p className="text-xs text-muted-foreground/75 mt-1 leading-relaxed">Customer records are created automatically during billing when customer details are entered.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {filteredCustomers.map(customer => (
                    <div key={customer.customer_id}
                      onClick={() => loadCustomerDetails(customer)}
                      className="flex items-center justify-between p-4.5 rounded-3xl border border-border bg-card hover:border-primary/20 hover:shadow-md transition-all duration-300 shadow-sm cursor-pointer group select-none animate-in fade-in duration-200">
                      <div className="flex items-center gap-3.5 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                          <User className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1 leading-tight text-left">
                          <p className="font-extrabold text-foreground truncate text-sm">{customer.name}</p>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground/75 font-semibold mt-1">
                            {customer.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3.5 h-3.5" /> {customer.phone}
                              </span>
                            )}
                            {customer.last_purchase_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" /> {formatDate(customer.last_purchase_date)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <p className="flex items-center gap-1 text-sm font-black text-emerald-600 dark:text-emerald-400">
                            <Star className="w-3.5 h-3.5" />
                            {customer.current_points_balance.toFixed(0)} pts
                          </p>
                          <p className="text-[10px] text-muted-foreground/75 font-bold uppercase tracking-wider mt-0.5">
                            {customer.total_points_earned.toFixed(0)} earned
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {view === 'detail' && selectedCustomer && (
        <div className="flex flex-col flex-1 min-h-0 bg-background">
          <div className="px-6 py-4 border-b border-border bg-card shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-foreground">{selectedCustomer.name}</h2>
                <div className="flex items-center gap-3 text-xs text-muted-foreground font-semibold mt-1">
                  {selectedCustomer.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {selectedCustomer.phone}</span>}
                  {selectedCustomer.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {selectedCustomer.address}</span>}
                </div>
              </div>
              <div className="text-right bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Available Points</p>
                <p className="text-2xl font-black text-emerald-600">{selectedCustomer.current_points_balance.toFixed(0)}</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Receipt className="w-3.5 h-3.5" /> Purchase History ({invoices.length})
                </h3>
                {invoicesLoading ? (
                  <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
                ) : invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No purchase history yet.</p>
                ) : (
                  <div className="space-y-2">
                    {invoices.map(inv => (
                      <div key={inv.invoice_id} className="p-3.5 rounded-xl border border-border bg-card hover:border-primary/30 transition-all">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-foreground">{inv.invoice_number}</span>
                              <span className="text-xs text-muted-foreground">{formatDate(inv.created_at)}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">Total: {formatCurrency(inv.grand_total)}</div>
                          </div>
                          <div className="text-right">
                            {inv.points_earned > 0 && (
                              <p className="text-xs font-bold text-emerald-600">+{inv.points_earned.toFixed(0)} pts</p>
                            )}
                            {inv.points_redeemed > 0 && (
                              <p className="text-xs font-bold text-amber-600">-{inv.points_redeemed.toFixed(0)} pts ({formatCurrency(inv.points_redeemed_discount)} off)</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Gift className="w-3.5 h-3.5" /> Points History ({loyaltyTxs.length})
                </h3>
                {loyaltyTxsLoading ? (
                  <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
                ) : loyaltyTxs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No points activity yet.</p>
                ) : (
                  <div className="space-y-2">
                    {loyaltyTxs.map(tx => (
                      <div key={tx.transaction_id} className="p-3.5 rounded-xl border border-border bg-card">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={clsx(
                                'text-xs font-bold px-2 py-0.5 rounded-full',
                                tx.transaction_type === 'EARNED' ? 'bg-emerald-500/10 text-emerald-600' :
                                tx.transaction_type === 'REDEEMED' ? 'bg-amber-500/10 text-amber-600' :
                                'bg-blue-500/10 text-blue-600'
                              )}>
                                {tx.transaction_type}
                              </span>
                              <span className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</span>
                            </div>
                            {tx.description && (
                              <p className="text-xs text-muted-foreground mt-1">{tx.description}</p>
                            )}
                            {tx.reference_number && (
                              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">Ref: {tx.reference_number}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className={clsx(
                              'text-sm font-black',
                              tx.transaction_type === 'EARNED' ? 'text-emerald-600' :
                              tx.transaction_type === 'REDEEMED' ? 'text-amber-600' : 'text-blue-600'
                            )}>
                              {tx.transaction_type === 'EARNED' ? '+' : '-'}{tx.points.toFixed(0)} pts
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Balance: {tx.points_balance_after.toFixed(0)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
