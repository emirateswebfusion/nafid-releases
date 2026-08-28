import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { X, Search, Printer, FileText, RefreshCw, Pencil, Trash, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import clsx from 'clsx';

interface Quotation {
  quotation_id: string;
  quotation_number: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  terms_conditions: string;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  status: string;
  converted_to_invoice: number;
  invoice_id: string;
  created_at: string;
}

interface QuotationItem {
  item_id: string;
  product_id: string;
  name: string;
  quantity: number;
  weight: number;
  rate: number;
  amount: number;
}

export function QuotationManager({ onClose, isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { shopName, tenantId, role: authRole, userName } = useAuthStore();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CONVERTED'>('ALL');
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [quotationItems, setQuotationItems] = useState<QuotationItem[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    variant: 'blue' | 'red' | 'emerald';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    variant: 'blue',
    onConfirm: () => {},
  });

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadQuotations(); }, []);

  const loadQuotations = async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const tid = tenantId || 'global';
        const qs = await window.electronAPI.dbGetQuotations({ tenant_id: tid });
        if (Array.isArray(qs)) {
          setQuotations(qs);
          localStorage.setItem('nafid_quotations_cache', JSON.stringify(qs));
        }
      }
    } catch (err) {
      console.error('[QuotationManager] Failed to load quotations:', err);
      const cached = localStorage.getItem('nafid_quotations_cache');
      if (cached) {
        try { setQuotations(JSON.parse(cached)); } catch (e) {}
      }
    }
    setLoading(false);
  };

  const formatCurrency = (amount: number) => `\u20B9${amount.toFixed(2)}`;

  const handleCreateNewQuotation = () => {
    useCartStore.getState().setRole('BILLER');
    useCartStore.getState().setReturnMode(false);
    useCartStore.getState().setIsScrapMode(false);
    useCartStore.getState().setEditingQuotation(null, null);
    useCartStore.getState().setEditingInvoice(null, null, null);
    useCartStore.getState().setQuotationMode(true);
    useCartStore.getState().clearCart();
    window.dispatchEvent(new CustomEvent('open-new-quotation'));
    onClose();
  };

  const viewQuotation = async (q: Quotation) => {
    setSelectedQuotation(q);
    if (window.electronAPI) {
      const its = await window.electronAPI.dbGetQuotationItems(q.quotation_id);
      if (Array.isArray(its)) setQuotationItems(its);
    }
    setShowDetail(true);
  };

  const handlePrint = async () => {
    const content = printRef.current?.innerHTML || '';
    const fullHtml = `<!DOCTYPE html>
      <html>
        <head>
          <title>Quotation - ${shopName}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 0; margin: 0; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .header h1 { font-size: 24px; margin: 0; }
            .header p { font-size: 13px; color: #666; margin: 3px 0; }
            .qtn-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #f5f5f5; padding: 8px 6px; border: 1px solid #ddd; text-align: left; font-size: 10px; text-transform: uppercase; }
            td { padding: 6px; border: 1px solid #ddd; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .total-row td { font-weight: bold; }
            .terms { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; }
            .terms h3 { font-size: 14px; margin-bottom: 8px; }
            .terms p { font-size: 11px; color: #555; white-space: pre-line; }
          </style>
        </head>
        <body>${content}</body>
      </html>`;

    if (window.electronAPI) {
      const printResult = await window.electronAPI.printA4Html(tenantId || 'global', fullHtml);
      if (!printResult.success) {
        const pw = window.open('', '_blank');
        if (pw) { pw.document.write(fullHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
      }
    } else {
      const pw = window.open('', '_blank');
      if (pw) { pw.document.write(fullHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
    }
  };

  const handleEditQuotation = (q: Quotation) => {
    setConfirmDialog({
      isOpen: true,
      title: `Edit ${q.quotation_number}`,
      message: `Are you sure you want to edit ${q.quotation_number}? This will open all quotation items in billing mode.`,
      confirmText: 'Edit Quotation',
      variant: 'blue',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        if (window.electronAPI) {
          const its = await window.electronAPI.dbGetQuotationItems(q.quotation_id);
          if (Array.isArray(its)) {
            localStorage.setItem('editQuotationData', JSON.stringify({ quotation: q, items: its }));
            window.dispatchEvent(new CustomEvent('open-quotation-edit'));
            onClose();
          }
        }
      },
    });
  };

  const handleDeleteQuotation = (q: Quotation) => {
    setConfirmDialog({
      isOpen: true,
      title: `Delete ${q.quotation_number}`,
      message: `Are you sure you want to delete ${q.quotation_number}? This action cannot be undone.`,
      confirmText: 'Delete Quotation',
      variant: 'red',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        if (window.electronAPI) {
          const res = await window.electronAPI.dbDeleteQuotation(q.quotation_id);
          if (res.success) {
            setStatusMessage({ text: `Quotation ${q.quotation_number} deleted`, type: 'success' });
            setQuotations(prev => {
              const updated = prev.filter(item => item.quotation_id !== q.quotation_id);
              localStorage.setItem('nafid_quotations_cache', JSON.stringify(updated));
              return updated;
            });
            await loadQuotations();
            if (showDetail) setShowDetail(false);
          } else {
            setStatusMessage({ text: res.error || 'Delete failed', type: 'error' });
          }
        }
        setTimeout(() => setStatusMessage(null), 3000);
      },
    });
  };

  const handleConvertToInvoice = (q: Quotation) => {
    setConfirmDialog({
      isOpen: true,
      title: `Convert ${q.quotation_number}`,
      message: `Convert ${q.quotation_number} to invoice? This will load items directly into POS checkout.`,
      confirmText: 'Convert to Invoice',
      variant: 'emerald',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        if (window.electronAPI) {
          const its = await window.electronAPI.dbGetQuotationItems(q.quotation_id);
          if (Array.isArray(its)) {
            localStorage.setItem('editQuotationData', JSON.stringify({ quotation: q, items: its, convertToInvoice: true }));
            window.dispatchEvent(new CustomEvent('open-quotation-edit'));
            onClose();
          }
        }
      },
    });
  };

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr.replace(' ', 'T'));
    return `${d.toLocaleDateString('en-IN', { weekday: 'long' })} — ${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  };

  const filteredQuotations = useMemo(() => {
    return quotations.filter(q => {
      const matchesSearch = !search || 
        q.customer_name?.toLowerCase().includes(search.toLowerCase()) || 
        q.quotation_number?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || 
        (statusFilter === 'ACTIVE' && q.status !== 'CONVERTED') || 
        (statusFilter === 'CONVERTED' && q.status === 'CONVERTED');
      return matchesSearch && matchesStatus;
    });
  }, [quotations, search, statusFilter]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background font-sans">
      
      {/* Header */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">
                {showDetail ? 'Quotation Detail' : 'Quotations Directory'}
              </h1>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
            {!showDetail && (
              <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">{quotations.length} total quotations</p>
            )}
            {showDetail && (
              <span className="text-[11px] text-muted-foreground font-medium bg-muted px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 mt-0.5">
                {authRole === 'OWNER' ? 'Owner Mode' : (userName || 'Staff')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={showDetail ? () => setShowDetail(false) : (isRestricted ? () => useAuthStore.getState().logout() : onClose)}
              className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          </div>
        </div>
      </header>

      {/* Action Bar (list view) */}
      {!showDetail && (
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3 border-b border-border bg-card shrink-0 shadow-sm">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by customer name or QTN number..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl py-2 pl-10 pr-4 text-xs font-medium text-foreground transition-all shadow-sm placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="flex items-center gap-1 p-1 bg-muted rounded-xl border border-border shrink-0 text-xs">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={clsx("px-3 py-1 font-bold rounded-lg transition-all", statusFilter === 'ALL' ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('ACTIVE')}
                className={clsx("px-3 py-1 font-bold rounded-lg transition-all", statusFilter === 'ACTIVE' ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-sm" : "text-muted-foreground")}
              >
                Active
              </button>
              <button
                onClick={() => setStatusFilter('CONVERTED')}
                className={clsx("px-3 py-1 font-bold rounded-lg transition-all", statusFilter === 'CONVERTED' ? "bg-background text-blue-600 dark:text-blue-400 shadow-sm" : "text-muted-foreground")}
              >
                Billed
              </button>
            </div>
          </div>

          <button
            onClick={handleCreateNewQuotation}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Create New Quotation
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 bg-background">

        {/* QUOTATION LIST */}
        {!showDetail && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            <div className="grid grid-cols-12 gap-2 px-6 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border shrink-0 bg-muted/40 select-none">
              <div className="col-span-2">QTN #</div>
              <div className="col-span-3">Customer Name</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-2 text-center">Status</div>
              <div className="col-span-2 text-right">Created Date</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredQuotations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16 select-none">
                  <FileText className="w-12 h-12 mb-3 opacity-30" />
                  <p className="font-extrabold text-foreground text-base">No quotations found</p>
                  <p className="text-xs text-muted-foreground mt-1">Click "+ Create New Quotation" to issue a quote.</p>
                </div>
              ) : Object.entries(
                filteredQuotations.reduce<Record<string, Quotation[]>>((acc, q) => {
                  const label = formatDateLabel(q.created_at);
                  if (!acc[label]) acc[label] = [];
                  acc[label].push(q);
                  return acc;
                }, {})
              ).map(([date, qs]) => (
                <div key={date}>
                  <div className="sticky top-0 z-10 bg-muted px-6 py-1.5 text-xs font-black text-primary uppercase tracking-wider border-b border-border">
                    {date}
                  </div>
                  {qs.map(q => (
                    <div key={q.quotation_id} className="grid grid-cols-12 gap-2 px-6 py-3.5 items-center bg-card border-b border-border hover:border-primary/30 hover:shadow-sm transition-all duration-150 group cursor-pointer" onClick={() => viewQuotation(q)}>
                      <div className="col-span-2 font-mono font-bold text-primary">{q.quotation_number}</div>
                      <div className="col-span-3 font-semibold text-foreground truncate">{q.customer_name || 'Walk-in Customer'}</div>
                      <div className="col-span-2 text-right font-bold text-foreground">{formatCurrency(q.grand_total)}</div>
                      <div className="col-span-2 text-center">
                        <span className={clsx(
                          'text-xs font-bold px-2.5 py-0.5 rounded-full border',
                          q.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : q.status === 'CONVERTED' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                        )}>{q.status === 'CONVERTED' ? 'BILLED' : q.status}</span>
                      </div>
                      <div className="col-span-2 text-right text-muted-foreground text-xs font-medium">{new Date(q.created_at).toLocaleDateString('en-IN')}</div>
                      <div className="col-span-1 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {q.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleEditQuotation(q)}
                              className="p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all cursor-pointer"
                              title="Edit in Billing"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteQuotation(q)}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all cursor-pointer"
                            title="Delete Quotation"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QUOTATION DETAIL */}
        {showDetail && selectedQuotation && (
          <div className="max-w-4xl mx-auto p-6">
            <div ref={printRef} className="space-y-6 bg-card border border-border rounded-2xl p-8 shadow-sm">
              <div className="text-center border-b-2 border-foreground pb-4">
                <h1 className="text-3xl font-black">{shopName || 'NAFID Store'}</h1>
                <p className="text-sm text-muted-foreground mt-1 uppercase font-bold tracking-widest">OFFICIAL QUOTATION</p>
              </div>

              <div className="flex justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase">Quotation Number</p>
                  <p className="font-mono font-bold text-lg text-primary">{selectedQuotation.quotation_number}</p>
                  <p className="text-xs text-muted-foreground mt-1">Date: {new Date(selectedQuotation.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground font-semibold uppercase">Customer Details</p>
                  <p className="font-bold text-foreground">{selectedQuotation.customer_name || 'N/A'}</p>
                  <p className="text-xs text-muted-foreground">{selectedQuotation.customer_phone || ''}</p>
                  <p className="text-xs text-muted-foreground">{selectedQuotation.customer_address || ''}</p>
                </div>
              </div>

              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="p-3 text-left text-xs font-bold uppercase text-muted-foreground border border-border">#</th>
                    <th className="p-3 text-left text-xs font-bold uppercase text-muted-foreground border border-border">Item Description</th>
                    <th className="p-3 text-center text-xs font-bold uppercase text-muted-foreground border border-border">Qty</th>
                    <th className="p-3 text-center text-xs font-bold uppercase text-muted-foreground border border-border">Weight</th>
                    <th className="p-3 text-right text-xs font-bold uppercase text-muted-foreground border border-border">Rate (₹)</th>
                    <th className="p-3 text-right text-xs font-bold uppercase text-muted-foreground border border-border">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {quotationItems.map((item, idx) => (
                    <tr key={item.item_id}>
                      <td className="p-3 border border-border text-center">{idx + 1}</td>
                      <td className="p-3 border border-border font-medium">{item.name}</td>
                      <td className="p-3 border border-border text-center">{item.quantity}</td>
                      <td className="p-3 border border-border text-center">{item.weight ? `${item.weight} KG` : '-'}</td>
                      <td className="p-3 border border-border text-right">{formatCurrency(item.rate)}</td>
                      <td className="p-3 border border-border text-right font-bold">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={5} className="p-3 border border-border text-right">Subtotal</td>
                    <td className="p-3 border border-border text-right">{formatCurrency(selectedQuotation.subtotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="p-3 border border-border text-right text-muted-foreground">GST Tax</td>
                    <td className="p-3 border border-border text-right">{formatCurrency(selectedQuotation.tax_total)}</td>
                  </tr>
                  <tr className="font-black text-lg">
                    <td colSpan={5} className="p-3 border border-border text-right">Grand Total</td>
                    <td className="p-3 border border-border text-right text-primary">{formatCurrency(selectedQuotation.grand_total)}</td>
                  </tr>
                </tfoot>
              </table>

              {selectedQuotation.terms_conditions && (
                <div className="border-t border-border pt-4">
                  <h3 className="font-bold text-sm mb-2">Terms & Conditions</h3>
                  <p className="text-xs text-muted-foreground whitespace-pre-line">{selectedQuotation.terms_conditions}</p>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center pt-4 border-t border-border">
                Generated by Nafid — {new Date().toLocaleString('en-IN')}
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={handlePrint} className="px-4 py-2.5 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm">
                <Printer className="w-4 h-4" /> Print
              </button>
              <button onClick={handlePrint} className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm">
                <FileText className="w-4 h-4" /> PDF Export
              </button>
              {selectedQuotation.status === 'ACTIVE' && (
                <>
                  <button onClick={() => handleEditQuotation(selectedQuotation)} className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm">
                    <Pencil className="w-4 h-4" /> Edit Quote
                  </button>
                  <button onClick={() => handleConvertToInvoice(selectedQuotation)} className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm">
                    <CheckCircle2 className="w-4 h-4" /> Convert to Sales Invoice
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Custom Confirmation Modal */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <AlertCircle className={clsx(
                  "w-5 h-5",
                  confirmDialog.variant === 'red' ? "text-red-500" :
                  confirmDialog.variant === 'emerald' ? "text-emerald-500" :
                  "text-blue-500"
                )} />
                <span>{confirmDialog.title}</span>
              </h3>
              <button
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {confirmDialog.message}
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-bold text-xs rounded-xl transition-all active:scale-95 cursor-pointer border border-border"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={clsx(
                  "px-4 py-2 text-white font-bold text-xs rounded-xl transition-all active:scale-95 shadow-sm cursor-pointer border-0",
                  confirmDialog.variant === 'red' ? "bg-red-500 hover:bg-red-600" :
                  confirmDialog.variant === 'emerald' ? "bg-emerald-500 hover:bg-emerald-600" :
                  "bg-blue-500 hover:bg-blue-600"
                )}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {statusMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300 pointer-events-auto">
          <div className={clsx(
            "flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-xl backdrop-blur-md text-xs font-bold transition-all",
            statusMessage.type === 'success'
              ? "bg-emerald-500/95 dark:bg-emerald-600/95 text-white border-emerald-400/40 shadow-emerald-500/20"
              : "bg-destructive/95 text-white border-destructive/40 shadow-destructive/20"
          )}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-white" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-white" />
            )}
            <span>{statusMessage.text}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="ml-2 p-1 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
