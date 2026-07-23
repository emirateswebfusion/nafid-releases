import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { ArrowLeft, Undo2, Search, X, Package, User, FileText, IndianRupee, AlertCircle, CheckCircle2, LogOut } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
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

  useEffect(() => { loadReturns(); }, [loadReturns]);

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

  const totalReturnValue = returnItems.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-4 h-12 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="p-1.5 hover:bg-accent rounded-lg transition-colors cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Undo2 className="w-5 h-5 text-primary" />
          <h1 className="font-black text-sm">Returns</h1>
          <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{returns.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {isRestricted ? (
            <button onClick={() => useAuthStore.getState().logout()} className="flex items-center gap-1.5 px-3 h-8 text-xs font-bold text-red-500 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer">
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          ) : (
            <button onClick={onClose} className="flex items-center gap-1.5 px-3 h-8 text-xs font-bold hover:bg-accent rounded-xl transition-all cursor-pointer">
              <X className="w-3.5 h-3.5" /> Close
            </button>
          )}
        </div>
      </header>

      {/* Status Message */}
      {statusMessage && (
        <div className={clsx('shrink-0 flex items-center gap-2 px-4 py-2 text-xs font-bold', statusMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600')}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {statusMessage.text}
          <button onClick={() => setStatusMessage(null)} className="ml-auto cursor-pointer"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Returns List */}
        <div className={clsx('flex flex-col border-r border-border', selectedReturn ? 'w-1/2 hidden md:flex' : 'w-full')}>
          {/* Search */}
          <div className="shrink-0 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search return #, customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 h-9 text-xs font-medium bg-muted border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-3 rounded-xl border border-border">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))
            ) : returns.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Undo2 className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs font-bold">No returns found</p>
              </div>
            ) : (
              returns.map((r) => (
                <button
                  key={r.return_id}
                  onClick={() => handleViewReturn(r)}
                  className={clsx(
                    'w-full text-left p-3 rounded-xl border transition-all cursor-pointer',
                    selectedReturn?.return_id === r.return_id
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border hover:border-primary/20 hover:bg-accent/50'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-foreground">{r.return_number}</span>
                    <span className="text-xs font-bold text-muted-foreground">{formatDate(r.return_date)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground truncate mr-2">{r.customer_name || 'Walk-in'}</span>
                    <span className="text-xs font-black text-red-500 shrink-0">-{formatCurrency(r.grand_total)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Return Detail */}
        {selectedReturn && (
          <div className="flex-1 flex flex-col">
            {/* Detail Header */}
            <div className="shrink-0 p-4 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-black">{selectedReturn.return_number}</h2>
                  <p className="text-[10px] text-muted-foreground">{formatDate(selectedReturn.return_date)}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs font-black text-red-500">-{formatCurrency(selectedReturn.grand_total)}</div>
                  <div className="text-[10px] text-muted-foreground">Refund Amount</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <User className="w-3 h-3" /> {selectedReturn.customer_name || 'Walk-in Customer'}
                </div>
                {selectedReturn.customer_phone && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Package className="w-3 h-3" /> {selectedReturn.customer_phone}
                  </div>
                )}
              </div>
              {selectedReturn.reason && (
                <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <FileText className="w-3 h-3 mt-0.5 shrink-0" />
                  <em>"{selectedReturn.reason}"</em>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => { setDeleteConfirmOpen(true); }}
                  className="flex items-center gap-1.5 px-3 h-7 text-[10px] font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-all cursor-pointer"
                >
                  <X className="w-3 h-3" /> Delete Return
                </button>
              </div>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Returned Items</h3>
              {itemsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 mb-2 rounded-xl border border-border">
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <div className="flex-1"><Skeleton className="h-3 w-32 mb-1" /><Skeleton className="h-3 w-20" /></div>
                  </div>
                ))
              ) : (
                <div className="space-y-1.5">
                  {returnItems.map((item) => (
                    <div key={item.return_item_id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                      <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4 text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold truncate">{item.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {item.sku_barcode && <span className="font-mono">{item.sku_barcode} · </span>}
                          {item.quantity} × {formatCurrency(item.unit_price)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-black text-red-500">-{formatCurrency(item.total)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals */}
              {!itemsLoading && returnItems.length > 0 && (
                <div className="mt-4 p-3 rounded-xl border border-border bg-muted/50">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-bold">{formatCurrency(selectedReturn.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-bold">{formatCurrency(selectedReturn.tax_total)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-black text-red-500 pt-1.5 border-t border-border">
                    <span>Total Refund</span>
                    <span>-{formatCurrency(selectedReturn.grand_total)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <div className="p-6 max-w-sm mx-auto text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-sm font-black mb-1">Delete Return?</h3>
          <p className="text-[11px] text-muted-foreground mb-5">
            This will remove the return record and deduct the returned quantity from stock.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setDeleteConfirmOpen(false)} disabled={deleteSaving}
              className="flex-1 h-9 text-xs font-bold rounded-xl border border-border hover:bg-accent transition-all cursor-pointer disabled:opacity-50"
            >Cancel</button>
            <button onClick={handleDeleteReturn} disabled={deleteSaving}
              className="flex-1 h-9 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >{deleteSaving ? 'Deleting...' : 'Delete'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
