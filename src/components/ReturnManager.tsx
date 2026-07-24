import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { Undo2, Search, X, Package, User, FileText, AlertCircle, CheckCircle2, LogOut, Phone, Trash } from 'lucide-react';
import clsx from 'clsx';
import { Skeleton } from './ui/Skeleton';
import { Modal } from './ui/Modal';

interface ReturnInvoice {
  return_id: string;
  invoice_id: string;
  return_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  reason: string | null;
  return_date: string;
  created_at: string;
}

interface ReturnItem {
  return_item_id: string;
  return_id: string;
  invoice_item_id: string | null;
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  total: number;
  sku_barcode?: string;
  item_code?: string;
}

function formatCurrency(amount: number): string {
  return `\u20B9${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ReturnManager({ onClose, isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  const { tenantId, userName, userId } = useAuthStore();
  const [returns, setReturns] = useState<ReturnInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedReturn, setSelectedReturn] = useState<ReturnInvoice | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadReturns = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.dbGetReturns({ tenant_id: tenantId, search: search || undefined });
        if (Array.isArray(data)) setReturns(data);
      }
    } catch (err) {
      console.error('[ReturnManager] Failed to load returns:', err);
    }
    setLoading(false);
  }, [tenantId, search]);

  useEffect(() => {
    loadReturns();
  }, [loadReturns]);

  const handleViewReturn = async (r: ReturnInvoice) => {
    setSelectedReturn(r);
    setItemsLoading(true);
    try {
      if (window.electronAPI) {
        const items = await window.electronAPI.dbGetReturnItems(r.return_id);
        if (Array.isArray(items)) setReturnItems(items);
      }
    } catch (err) {
      console.error('[ReturnManager] Failed to load return items:', err);
    }
    setItemsLoading(false);
  };

  const handleDeleteReturn = async () => {
    if (!selectedReturn) return;
    setDeleteSaving(true);
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.dbDeleteReturn(selectedReturn.return_id);
        if (res.success) {
          setStatusMessage({ text: 'Return deleted & stock restored', type: 'success' });
          setSelectedReturn(null);
          setDeleteConfirmOpen(false);
          loadReturns();
        } else {
          setStatusMessage({ text: res.error || 'Failed to delete return', type: 'error' });
        }
      }
    } catch (err) {
      setStatusMessage({ text: 'Failed to delete return', type: 'error' });
    }
    setDeleteSaving(false);
  };

  // Calculations for Stats
  const totalRefunded = returns.reduce((sum, r) => sum + r.grand_total, 0);

  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const todayReturns = returns.filter(r => {
    try {
      const datePart = r.return_date.split('T')[0];
      return datePart === todayStr;
    } catch {
      return false;
    }
  });
  const todayRefundedAmount = todayReturns.reduce((sum, r) => sum + r.grand_total, 0);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 shadow-inner shrink-0">
            <Undo2 className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">Returns</h1>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
            </div>
            <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
              {returns.length} return record{returns.length !== 1 ? 's' : ''} · Track customer returns & stock restoration
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {statusMessage && (
              <span className={clsx(
                'hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg animate-in fade-in duration-200',
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-destructive/10 text-destructive'
              )}>
                {statusMessage.type === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                {statusMessage.text}
              </span>
            )}

            {isRestricted ? (
              <button onClick={() => useAuthStore.getState().logout()} className="h-10 px-4 flex items-center gap-1.5 text-xs font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-all duration-200 active:scale-95 border border-red-500/20 cursor-pointer">
                <LogOut className="w-4 h-4" /> Logout
              </button>
            ) : (
              <button onClick={onClose} className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center justify-center" title="Close">
                <X className="w-4 h-4 text-destructive" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Status Message for small screens */}
      {statusMessage && (
        <div className={clsx('sm:hidden shrink-0 flex items-center gap-2 px-4 py-2 text-xs font-bold border-b', statusMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/10' : 'bg-red-500/10 text-red-600 border-red-500/10')}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {statusMessage.text}
          <button onClick={() => setStatusMessage(null)} className="ml-auto cursor-pointer"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Statistics Panel */}
      <div className="grid grid-cols-3 gap-4 px-5 py-4 border-b border-border bg-card shrink-0 shadow-sm">
        <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Returns</p>
          <p className="text-2xl font-black text-primary mt-1">{returns.length}</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Refunded</p>
          <p className="text-2xl font-black text-rose-500 mt-1">{formatCurrency(totalRefunded)}</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Today's Refunds</p>
          <p className="text-2xl font-black text-amber-500 mt-1">{formatCurrency(todayRefundedAmount)}</p>
        </div>
      </div>

      {/* Main List Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-card/10">
        {/* Search */}
        <div className="shrink-0 p-4 border-b border-border bg-card">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search return #, customer name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 h-10 text-xs font-medium bg-background border border-border rounded-xl outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
          </div>
        </div>

        {/* List Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-4 py-3.5 rounded-xl border border-border bg-card shadow-sm flex items-center gap-4">
                  <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
                  <div className="flex-1">
                    <Skeleton className="h-3.5 w-28 mb-1.5" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-3.5 w-16 shrink-0" />
                </div>
              ))}
            </div>
          ) : returns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <Undo2 className="w-6 h-6 opacity-40" />
              </div>
              <p className="text-xs font-bold">No returns found</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pb-10">
              {returns.map((r) => (
                <button
                  key={r.return_id}
                  onClick={() => handleViewReturn(r)}
                  className="w-full text-left px-4 py-3.5 rounded-xl border border-border bg-card hover:border-rose-500/20 hover:bg-muted/30 transition-all duration-150 cursor-pointer flex items-center justify-between shadow-sm"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
                      <Undo2 className="w-4 h-4 text-rose-500" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-black text-foreground tracking-wide font-mono block">{r.return_number}</span>
                      <span className="text-[10px] text-muted-foreground font-medium truncate block">
                        {r.customer_name || 'Walk-in Customer'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 shrink-0 ml-4">
                    <span className="text-[10px] font-bold text-muted-foreground hidden sm:block">{formatDate(r.return_date)}</span>
                    <span className="text-sm font-black text-rose-500">
                      -{formatCurrency(r.grand_total)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Return Detail Modal */}
      <Modal
        isOpen={!!selectedReturn}
        onClose={() => setSelectedReturn(null)}
        className="max-w-2xl"
        title={
          selectedReturn && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-black text-foreground font-mono">{selectedReturn.return_number}</span>
              <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-bold font-mono">
                RETURN RECORD
              </span>
            </div>
          )
        }
      >
        {selectedReturn && (
          <div className="space-y-4 text-foreground">
            {/* Refund detail metadata */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground">{formatDate(selectedReturn.return_date)}</p>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase font-black tracking-wider text-muted-foreground block leading-none mb-1">Refund Amount</span>
                <span className="text-lg font-black text-rose-500">-{formatCurrency(selectedReturn.grand_total)}</span>
              </div>
            </div>

            {/* Customer Info Card */}
            <div className="bg-card border border-border rounded-xl p-3.5 grid grid-cols-2 gap-3 shadow-sm">
              <div>
                <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Customer</span>
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground mt-0.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  {selectedReturn.customer_name || 'Walk-in Customer'}
                </div>
              </div>
              {selectedReturn.customer_phone && (
                <div>
                  <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Phone</span>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    {selectedReturn.customer_phone}
                  </div>
                </div>
              )}
            </div>

            {selectedReturn.reason && (
              <div className="bg-amber-500/[0.04] border-l-4 border-amber-500 p-3.5 rounded-r-xl">
                <span className="text-[9px] uppercase tracking-wider font-bold text-amber-600 dark:text-amber-400">
                  Reason for Return
                </span>
                <p className="text-xs text-foreground italic mt-0.5">
                  "{selectedReturn.reason}"
                </p>
              </div>
            )}

            {/* Items */}
            <div className="space-y-4 pt-2">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Returned Items</h3>
              {itemsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-4 mb-2 rounded-xl border border-border bg-card shadow-sm">
                    <Skeleton className="w-10 h-10 rounded-xl" />
                    <div className="flex-1">
                      <Skeleton className="h-3 w-32 mb-1.5" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-2">
                  {returnItems.map((item) => (
                    <div key={item.return_item_id} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card shadow-sm hover:border-rose-500/15 transition-all">
                      <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0 shadow-inner">
                        <Package className="w-5 h-5 text-rose-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-foreground truncate">{item.name}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          {item.sku_barcode && (
                            <>
                              <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{item.sku_barcode}</span>
                              <span>·</span>
                            </>
                          )}
                          <span>{item.quantity} × {formatCurrency(item.unit_price)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-black text-rose-500">-{formatCurrency(item.total)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals */}
              {!itemsLoading && returnItems.length > 0 && (
                <div className="p-4 rounded-xl border border-border bg-muted/30 shadow-inner space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-bold text-foreground">{formatCurrency(selectedReturn.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-bold text-foreground">{formatCurrency(selectedReturn.tax_total)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-rose-500 pt-2.5 border-t border-border">
                    <span>Total Refund</span>
                    <span>-{formatCurrency(selectedReturn.grand_total)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-border">
              <button
                onClick={() => { setDeleteConfirmOpen(true); }}
                className="flex items-center justify-center gap-1.5 px-4 h-10 text-xs font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 border border-red-500/15 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <Trash className="w-3.5 h-3.5" /> Delete Return
              </button>
              <button
                onClick={() => setSelectedReturn(null)}
                className="ml-auto flex items-center justify-center gap-1.5 px-5 h-10 text-xs font-bold text-muted-foreground bg-muted hover:bg-muted/80 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <div className="p-6 max-w-sm mx-auto text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center shadow-inner">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-base font-black mb-1 text-foreground">Delete Return?</h3>
          <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
            This will remove the return record and deduct the returned quantity from stock.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteConfirmOpen(false)} disabled={deleteSaving}
              className="flex-1 h-10 text-xs font-bold rounded-xl border border-border hover:bg-muted hover:text-foreground text-muted-foreground transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-50"
            >Cancel</button>
            <button onClick={handleDeleteReturn} disabled={deleteSaving}
              className="flex-1 h-10 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-md shadow-red-500/10 transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-50"
            >{deleteSaving ? 'Deleting...' : 'Delete'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
