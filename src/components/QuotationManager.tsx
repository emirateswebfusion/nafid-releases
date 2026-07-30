import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { X, Search, Printer, FileText, RefreshCw, Pencil, Trash, CheckCircle2, AlertCircle } from 'lucide-react';
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
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [quotationItems, setQuotationItems] = useState<QuotationItem[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadQuotations(); }, []);

  const loadQuotations = async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const qs = await window.electronAPI.dbGetQuotations({ tenant_id: tenantId || '' });
        if (Array.isArray(qs)) setQuotations(qs);
      }
    } catch (err) {
      console.error('[QuotationManager] Failed to load quotations:', err);
    }
    setLoading(false);
  };

  const formatCurrency = (amount: number) => `\u20B9${amount.toFixed(2)}`;

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

  const handleEditQuotation = async (q: Quotation) => {
    if (!confirm(`Edit ${q.quotation_number}? This will open it in billing.`)) return;
    if (window.electronAPI) {
      const its = await window.electronAPI.dbGetQuotationItems(q.quotation_id);
      if (Array.isArray(its)) {
        localStorage.setItem('editQuotationData', JSON.stringify({ quotation: q, items: its }));
        window.dispatchEvent(new CustomEvent('open-quotation-edit'));
        onClose();
      }
    }
  };

  const handleDeleteQuotation = async (q: Quotation) => {
    if (!confirm(`Delete ${q.quotation_number}? This cannot be undone.`)) return;
    if (window.electronAPI) {
      const res = await window.electronAPI.dbDeleteQuotation(q.quotation_id);
      if (res.success) {
        setStatusMessage({ text: `Quotation ${q.quotation_number} deleted`, type: 'success' });
        loadQuotations();
        if (showDetail) setShowDetail(false);
      } else {
        setStatusMessage({ text: res.error || 'Delete failed', type: 'error' });
      }
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleConvertToInvoice = async (q: Quotation) => {
    if (!confirm(`Convert ${q.quotation_number} to invoice? This will copy items to billing.`)) return;
    if (window.electronAPI) {
      const its = await window.electronAPI.dbGetQuotationItems(q.quotation_id);
      if (Array.isArray(its)) {
        localStorage.setItem('editQuotationData', JSON.stringify({ quotation: q, items: its }));
        window.dispatchEvent(new CustomEvent('open-quotation-edit'));
        onClose();
      }
    }
  };

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr.replace(' ', 'T'));
    return `${d.toLocaleDateString('en-IN', { weekday: 'long' })} — ${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* ═══════════════════════════════════════════════════
          HEADER
      ═══════════════════════════════════════════════════ */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">
                {showDetail ? 'Quotation Detail' : 'Quotations'}
              </h1>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
            {!showDetail && (
              <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">{quotations.length} quotations</p>
            )}
            {showDetail && (
              <span className="text-[11px] text-muted-foreground font-medium bg-muted px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 mt-0.5">
                {authRole === 'OWNER' ? 'Owner' : (userName || 'Staff')}
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

      {/* ── Action Bar (list view) ── */}
      {!showDetail && (
        <div className="flex justify-between items-center gap-4 px-6 py-3 border-b border-border bg-card shrink-0 shadow-sm">
          <div className="flex-1 max-w-lg">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search quotations..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-foreground transition-all shadow-sm placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 bg-background">
        {statusMessage && (
          <div className={clsx(
            "mx-6 mt-4 px-4 py-2.5 rounded-xl border text-sm font-bold flex items-center gap-2 animate-in fade-in duration-200",
            statusMessage.type === 'success' ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 border-destructive/20 text-destructive"
          )}>
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="flex-1">{statusMessage.text}</span>
          </div>
        )}

        {/* ── QUOTATION LIST ── */}
        {!showDetail && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            <div className="grid grid-cols-12 gap-2 px-6 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border shrink-0 bg-muted/40">
              <div className="col-span-2">QTN #</div>
              <div className="col-span-3">Customer</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-2 text-center">Status</div>
              <div className="col-span-2 text-right">Date</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : quotations.filter(q => !search || q.customer_name?.toLowerCase().includes(search.toLowerCase()) || q.quotation_number?.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
                  <FileText className="w-12 h-12 mb-3" />
                  <p className="font-medium text-foreground">No quotations found</p>
                  <p className="text-sm mt-1">Click "New Quotation" to create one</p>
                </div>
              ) : Object.entries(
                quotations
                  .filter(q => !search || q.customer_name?.toLowerCase().includes(search.toLowerCase()) || q.quotation_number?.toLowerCase().includes(search.toLowerCase()))
                  .reduce<Record<string, Quotation[]>>((acc, q) => {
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
                    <div key={q.quotation_id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center bg-card border-b border-border hover:border-primary/30 hover:shadow-sm transition-all duration-150 group cursor-pointer" onClick={() => viewQuotation(q)}>
                      <div className="col-span-2 font-mono font-bold text-primary">{q.quotation_number}</div>
                      <div className="col-span-3 font-medium">{q.customer_name || '-'}</div>
                      <div className="col-span-2 text-right font-bold">{formatCurrency(q.grand_total)}</div>
                      <div className="col-span-2 text-center">
                        <span className={clsx(
                          'text-xs font-bold px-2 py-0.5 rounded-full',
                          q.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500' : q.status === 'CONVERTED' ? 'bg-blue-500/10 text-blue-500' : 'bg-amber-500/10 text-amber-500'
                        )}>{q.status === 'CONVERTED' ? 'BILLED' : q.status}</span>
                      </div>
                      <div className="col-span-2 text-right text-muted-foreground text-xs">{new Date(q.created_at).toLocaleDateString('en-IN')}</div>
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
                            title="Delete"
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

        {/* ── QUOTATION DETAIL ── */}
        {showDetail && selectedQuotation && (
          <div className="max-w-4xl mx-auto p-6">
            <div ref={printRef} className="space-y-6 bg-card border border-border rounded-2xl p-8 shadow-sm">
              <div className="text-center border-b-2 border-foreground pb-4">
                <h1 className="text-3xl font-black">{shopName || 'Shop'}</h1>
                <p className="text-sm text-muted-foreground mt-1">QUOTATION</p>
              </div>

              <div className="flex justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Quotation #</p>
                  <p className="font-bold text-lg">{selectedQuotation.quotation_number}</p>
                  <p className="text-xs text-muted-foreground mt-1">Date: {new Date(selectedQuotation.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Customer Details</p>
                  <p className="font-bold">{selectedQuotation.customer_name || 'N/A'}</p>
                  <p className="text-xs text-muted-foreground">{selectedQuotation.customer_phone || ''}</p>
                  <p className="text-xs text-muted-foreground">{selectedQuotation.customer_address || ''}</p>
                </div>
              </div>

              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-muted">
                    <th className="p-3 text-left text-xs font-bold uppercase text-muted-foreground border border-border">#</th>
                    <th className="p-3 text-left text-xs font-bold uppercase text-muted-foreground border border-border">Item</th>
                    <th className="p-3 text-center text-xs font-bold uppercase text-muted-foreground border border-border">Qty</th>
                    <th className="p-3 text-center text-xs font-bold uppercase text-muted-foreground border border-border">Weight</th>
                    <th className="p-3 text-right text-xs font-bold uppercase text-muted-foreground border border-border">Rate</th>
                    <th className="p-3 text-right text-xs font-bold uppercase text-muted-foreground border border-border">Amount</th>
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
                    <td colSpan={5} className="p-3 border border-border text-right text-muted-foreground">GST</td>
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
                Generated by Vendora POS — {new Date().toLocaleString('en-IN')}
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={handlePrint} className="px-4 py-2.5 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm">
                <Printer className="w-4 h-4" /> Print
              </button>
              <button onClick={handlePrint} className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm">
                <FileText className="w-4 h-4" /> PDF
              </button>
              {selectedQuotation.status === 'ACTIVE' && (
                <>
                  <button onClick={() => handleEditQuotation(selectedQuotation)} className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm">
                    <Pencil className="w-4 h-4" /> Edit & Bill
                  </button>
                  <button onClick={() => handleConvertToInvoice(selectedQuotation)} className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm">
                    <CheckCircle2 className="w-4 h-4" /> Convert to Invoice
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

