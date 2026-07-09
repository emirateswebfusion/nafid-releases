import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../lib/api';
import { Search, Loader2, Users, ArrowLeft, User, Calendar, Hash, Gift, Coins } from 'lucide-react';
import clsx from 'clsx';

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

interface CustomerInvoice {
  invoice_id: string;
  invoice_number: string;
  invoice_type: string;
  grand_total: number;
  points_earned: number;
  points_redeemed: number;
  points_redeemed_discount: number;
  previous_points_balance: number;
  remaining_points_balance: number;
  created_at: string;
}

interface LoyaltyTransaction {
  transaction_id: string;
  customer_id: string;
  invoice_id: string;
  invoice_number: string;
  transaction_type: string;
  points: number;
  points_balance_before: number;
  points_balance_after: number;
  reference_number: string;
  description: string;
  created_at: string;
}

type View = 'list' | 'detail';

const formatDate = (d: string) => {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (d: string) => {
  if (!d) return '\u2014';
  return new Date(d).toLocaleString('en-IN');
};

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<View>('list');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi('/api/customers');
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const openDetail = async (c: Customer) => {
    setSelectedCustomer(c);
    setView('detail');
    setDetailLoading(true);
    try {
      const [invData, txData] = await Promise.all([
        fetchApi(`/api/customers/${c.customer_id}/invoices`),
        fetchApi(`/api/customers/${c.customer_id}/loyalty-transactions`),
      ]);
      setInvoices(Array.isArray(invData) ? invData : []);
      setTransactions(Array.isArray(txData) ? txData : []);
    } catch {
      // silent
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = customers.filter(c =>
    !searchQuery
    || c.name.toLowerCase().includes(searchQuery.toLowerCase())
    || (c.phone || '').includes(searchQuery)
  );

  const totalIssued = customers.reduce((s, c) => s + (c.total_points_earned || 0), 0);
  const totalRedeemed = customers.reduce((s, c) => s + (c.total_points_redeemed || 0), 0);
  const activeBalance = customers.reduce((s, c) => s + (c.current_points_balance || 0), 0);

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-inner">
            {view === 'list' ? <Users className="w-5 h-5" /> : <User className="w-5 h-5" />}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">
                {view === 'list' ? 'Customers' : selectedCustomer?.name || 'Customer Detail'}
              </h1>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
            {view === 'list' && (
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">{customers.length} customers</p>
            )}
          </div>
        </div>
        {view === 'detail' && (
          <button onClick={() => setView('list')}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all active:scale-95 cursor-pointer border border-destructive/30">
            <X className="w-4 h-4 text-destructive" />
          </button>
        )}
      </header>

      {view === 'list' && (
        <>
          <div className="flex justify-between items-center gap-4 px-6 py-3 border-b border-border bg-card/50 shrink-0 shadow-sm">
            <div className="grid grid-cols-3 gap-3 w-full max-w-lg">
              <div className="bg-card p-3 rounded-xl border border-border/80 shadow-sm">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Issued</p>
                <p className="text-lg font-black text-amber-500 mt-0.5">{totalIssued.toFixed(0)}</p>
              </div>
              <div className="bg-card p-3 rounded-xl border border-border/80 shadow-sm">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Redeemed</p>
                <p className="text-lg font-black text-destructive mt-0.5">{totalRedeemed.toFixed(0)}</p>
              </div>
              <div className="bg-card p-3 rounded-xl border border-border/80 shadow-sm">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Active</p>
                <p className="text-lg font-black text-emerald-500 mt-0.5">{activeBalance.toFixed(0)}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center gap-4 px-6 py-3 border-b border-border bg-card/50 shrink-0 shadow-sm">
            <div className="flex-1 max-w-lg">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" placeholder="Search by name or phone..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-background border border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-foreground transition-all shadow-sm placeholder:text-muted-foreground/50" />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="animate-pulse rounded-md bg-muted h-16 w-full rounded-xl" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-lg font-black mb-1">{searchQuery ? 'No customers match your search' : 'No customers yet'}</p>
                <p className="text-sm">Customers are created automatically during billing</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(c => (
                  <div key={c.customer_id}
                    onClick={() => openDetail(c)}
                    className="flex items-center justify-between p-4 rounded-xl border border-border/80 bg-card hover:border-primary/30 transition-all duration-200 shadow-sm cursor-pointer">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-inner">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-foreground truncate text-sm">{c.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold mt-0.5">
                          {c.phone && <span>{c.phone}</span>}
                          {c.last_purchase_date && <span>Last: {formatDate(c.last_purchase_date)}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-emerald-500">{c.current_points_balance?.toFixed(0) || '0'}</p>
                      <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground">Points</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── DETAIL VIEW ── */}
      {view === 'detail' && selectedCustomer && (
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {detailLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="animate-pulse rounded-md bg-muted h-20 w-full rounded-xl" />)}</div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-card p-3 rounded-xl border border-border/80 shadow-sm">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Earned</p>
                  <p className="text-lg font-black text-amber-500 mt-0.5">{selectedCustomer.total_points_earned?.toFixed(0) || '0'}</p>
                </div>
                <div className="bg-card p-3 rounded-xl border border-border/80 shadow-sm">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Redeemed</p>
                  <p className="text-lg font-black text-destructive mt-0.5">{selectedCustomer.total_points_redeemed?.toFixed(0) || '0'}</p>
                </div>
                <div className="bg-card p-3 rounded-xl border border-border/80 shadow-sm">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Balance</p>
                  <p className="text-lg font-black text-emerald-500 mt-0.5">{selectedCustomer.current_points_balance?.toFixed(0) || '0'}</p>
                </div>
              </div>

              {selectedCustomer.phone && (
                <div className="text-xs text-muted-foreground font-semibold bg-muted/50 px-4 py-2.5 rounded-xl border border-border/80">
                  {selectedCustomer.phone}{selectedCustomer.address ? ` \u2022 ${selectedCustomer.address}` : ''}
                </div>
              )}

              {/* Purchase History */}
              <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <Coins className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black text-primary uppercase tracking-wider">Purchase History</span>
                </div>
                {invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-semibold py-4 text-center">No purchase history</p>
                ) : (
                  <div className="space-y-2">
                    {invoices.map(inv => (
                      <div key={inv.invoice_id} className="p-3 rounded-xl border border-border/80 bg-background">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-black text-sm">{inv.invoice_number}</p>
                            <p className="text-xs text-muted-foreground font-semibold">{formatDateTime(inv.created_at)}</p>
                          </div>
                          <p className="font-black text-sm">₹{inv.grand_total?.toFixed(2)}</p>
                        </div>
                        {(inv.points_earned || inv.points_redeemed) && (
                          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/40 text-xs font-semibold">
                            {inv.points_earned > 0 && <span className="text-amber-500">+{inv.points_earned.toFixed(0)} earned</span>}
                            {inv.points_redeemed > 0 && <span className="text-destructive">-{inv.points_redeemed.toFixed(0)} redeemed</span>}
                            {inv.points_redeemed_discount > 0 && <span className="text-green-600">-₹{inv.points_redeemed_discount.toFixed(2)} disc</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Points Transactions */}
              <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                    <Gift className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black text-amber-500 uppercase tracking-wider">Points Activity</span>
                </div>
                {transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-semibold py-4 text-center">No points activity</p>
                ) : (
                  <div className="space-y-2">
                    {transactions.map(tx => (
                      <div key={tx.transaction_id} className="p-3 rounded-xl border border-border/60 bg-background">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={clsx(
                              'text-xs font-black px-2 py-0.5 rounded-full',
                              tx.transaction_type === 'EARNED' ? 'bg-amber-500/10 text-amber-500' :
                              tx.transaction_type === 'REDEEMED' ? 'bg-destructive/10 text-destructive' :
                              'bg-blue-500/10 text-blue-500'
                            )}>
                              {tx.transaction_type}
                            </span>
                            <span className="text-xs text-muted-foreground font-semibold">{formatDate(tx.created_at)}</span>
                          </div>
                          <div className="text-right">
                            <p className={clsx(
                              'font-black text-sm',
                              tx.transaction_type === 'EARNED' ? 'text-amber-500' : 'text-destructive'
                            )}>
                              {tx.transaction_type === 'EARNED' ? '+' : '-'}{tx.points?.toFixed(0)}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-semibold">
                              Bal: {tx.points_balance_after?.toFixed(0)}
                            </p>
                          </div>
                        </div>
                        {tx.invoice_number && (
                          <p className="text-xs text-muted-foreground font-semibold mt-1">Invoice: {tx.invoice_number}</p>
                        )}
                        {tx.description && <p className="text-xs text-muted-foreground mt-0.5">{tx.description}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}