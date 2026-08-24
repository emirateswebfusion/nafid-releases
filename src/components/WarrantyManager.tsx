import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { Plus, X, Search, Printer, Shield, ShieldCheck, Trash, Clock, AlertTriangle, CheckCircle, User, Package, FileText, Calendar } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { Skeleton } from './ui/Skeleton';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { Select } from './ui/Select';

interface Warranty {
  warranty_id: string;
  invoice_id: string;
  customer_name: string;
  customer_phone: string;
  product_name: string;
  product_details: string;
  purchase_date: string;
  warranty_period_days: number;
  expiry_date: string;
  notes: string;
  created_at: string;
}

export function WarrantyManager({ onClose, isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { shopName, tenantId } = useAuthStore();
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWarranty, setSelectedWarranty] = useState<Warranty | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    product_name: '',
    product_details: '',
    purchase_date: new Date().toLocaleDateString('en-CA'),
    warranty_period_days: 365,
    notes: '',
  });

  const printRef = useRef<HTMLDivElement>(null);

  const expiryDate = form.purchase_date && form.warranty_period_days
    ? new Date(new Date(form.purchase_date).getTime() + form.warranty_period_days * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA')
    : '';

  useEffect(() => { loadWarranties(); }, []);

  const loadWarranties = async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const ws = await window.electronAPI.dbGetWarranties({ tenant_id: tenantId || '' });
        if (Array.isArray(ws)) setWarranties(ws);
      }
    } catch (err) {
      console.error('[WarrantyManager] Failed to load warranties:', err);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.customer_name || !form.product_name || !form.purchase_date) {
      setStatusMessage({ text: 'Customer name, product name, and purchase date are required', type: 'error' });
      return;
    }
    if (window.electronAPI) {
      const res = await window.electronAPI.dbSaveWarranty({
        warranty_id: uuidv4(),
        tenant_id: tenantId,
        ...form,
        warranty_period_days: Number(form.warranty_period_days),
        expiry_date: expiryDate,
      });
      if (res.success) {
        setStatusMessage({ text: 'Warranty saved!', type: 'success' });
        setShowCreate(false);
        setForm({ customer_name: '', customer_phone: '', product_name: '', product_details: '', purchase_date: new Date().toLocaleDateString('en-CA'), warranty_period_days: 365, notes: '' });
        loadWarranties();
      } else {
        setStatusMessage({ text: res.error || 'Failed', type: 'error' });
      }
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this warranty record?')) return;
    if (window.electronAPI) {
      await window.electronAPI.dbDeleteWarranty(id);
      loadWarranties();
    }
  };

  const handlePrint = (warranty: Warranty) => {
    setSelectedWarranty(warranty);
    setTimeout(() => {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      const content = printRef.current?.innerHTML || '';
      printWindow.document.write(`
        <html>
          <head>
            <title>Warranty Bill - ${warranty.customer_name}</title>
            <style>
              @page { size: A4; margin: 15mm; }
              body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 0; margin: 0; }
              .header { text-align: center; margin-bottom: 20px; padding: 20px; border: 2px solid #333; }
              .header h1 { font-size: 22px; margin: 0; }
              .header .warranty-badge { display: inline-block; margin-top: 8px; padding: 4px 16px; border: 2px solid #eab308; color: #a16207; font-weight: bold; font-size: 11px; letter-spacing: 2px; }
              table { width: 100%; border-collapse: collapse; margin: 15px 0; }
              td { padding: 8px 10px; border: 1px solid #ddd; }
              td.label { font-weight: bold; background: #f9f9f9; width: 40%; }
              .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #888; border-top: 1px solid #ddd; padding-top: 15px; }
              .stamp { margin-top: 40px; text-align: right; }
              .stamp div { display: inline-block; border: 2px dashed #333; padding: 15px 30px; font-weight: bold; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${shopName || 'Shop'}</h1>
              <p style="margin:4px 0;font-size:13px;color:#666;">Warranty Certificate</p>
              <div class="warranty-badge">WARRANTY CARD</div>
            </div>
            ${content}
            <div class="footer">
              <p>This warranty is valid from ${new Date(warranty.purchase_date).toLocaleDateString('en-IN')} to ${new Date(warranty.expiry_date).toLocaleDateString('en-IN')}</p>
              <p>Please present this card for any warranty service.</p>
            </div>
            <div class="stamp">
              <div>Authorized Signature</div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    }, 100);
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;
    e.preventDefault();
    const container = target.closest('[data-enter-nav]');
    if (!container) return;
    const focusable = container.querySelectorAll<HTMLElement>('[data-select-trigger]:not([disabled]), input:not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
    const idx = Array.from(focusable).indexOf(target as HTMLInputElement);
    if (idx >= 0 && idx < focusable.length - 1) {
      const nextEl = focusable[idx + 1];
      nextEl?.focus();
      if (nextEl?.hasAttribute('data-select-trigger')) setTimeout(() => nextEl.click(), 0);
    } else if (idx >= 0) {
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-enter-submit]')?.click();
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  const isExpired = (expiry: string) => new Date(expiry) < new Date();
  const daysRemaining = (expiry: string) => Math.max(0, Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  const filtered = warranties.filter(w =>
    !search ||
    w.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    w.customer_phone.toLowerCase().includes(search.toLowerCase()) ||
    w.product_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* ---------------------------------------------------
          HEADER
      --------------------------------------------------- */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="p-2 rounded-xl bg-violet-500/10 text-violet-500 shadow-inner shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">
                {showCreate ? 'Register Warranty' : 'Warranty Management'}
              </h1>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
            {!showCreate && <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">{warranties.length} warranties registered</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={showCreate ? () => setShowCreate(false) : (isRestricted ? () => useAuthStore.getState().logout() : onClose)}
              className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          </div>
        </div>
      </header>

      {statusMessage && (
        <div className={clsx('mx-6 mt-3 px-4 py-2.5 rounded-xl text-sm font-bold', statusMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20')}>{statusMessage.text}</div>
      )}

      {!showCreate ? (
        <>
          <div className="flex justify-between items-center gap-4 px-6 py-3 border-b border-border bg-card shrink-0 shadow-sm">
            <div className="flex-1 max-w-lg">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by customer or product..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-foreground transition-all shadow-sm placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowCreate(true)} className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm border border-primary/10 active:scale-95 cursor-pointer">
                <Plus className="w-4 h-4" /> New Warranty
              </button>
            </div>
          </div>

          <div className="flex flex-col flex-1 min-h-0 bg-background">
            <div className="grid grid-cols-12 gap-2 px-6 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border shrink-0 bg-muted/40">
              <div className="col-span-3">Customer</div>
              <div className="col-span-3">Product</div>
              <div className="col-span-2 text-center">Purchase</div>
              <div className="col-span-2 text-center">Expiry</div>
              <div className="col-span-1 text-center">Status</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-border relative">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={`skel-${i}`} className="grid grid-cols-12 gap-2 px-6 py-4 items-center">
                    <div className="col-span-3">
                      <div className="flex items-center gap-2">
                        <div className="space-y-2 w-full">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    </div>
                    <div className="col-span-3">
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                    <div className="col-span-2 flex justify-center"><Skeleton className="h-4 w-24" /></div>
                    <div className="col-span-2 flex justify-center"><Skeleton className="h-4 w-24" /></div>
                    <div className="col-span-1 flex justify-center"><Skeleton className="h-5 w-16 rounded-full" /></div>
                    <div className="col-span-1 flex justify-center gap-2">
                      <Skeleton className="h-8 w-8 rounded-lg" />
                      <Skeleton className="h-8 w-8 rounded-lg" />
                    </div>
                  </div>
                ))
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
                  <Shield className="w-12 h-12 mb-3" />
                  <p className="font-medium text-foreground">No warranties found</p>
                  <p className="text-sm mt-1">Click "New Warranty" to register one</p>
                </div>
              ) : (
                filtered.map(w => {
                  const expired = isExpired(w.expiry_date);
                  const remaining = daysRemaining(w.expiry_date);
                  return (
                    <div key={w.warranty_id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center bg-card border-b border-border hover:border-primary/30 hover:shadow-sm transition-all duration-150 group">
                      <div className="col-span-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-muted/40 text-muted-foreground shrink-0">
                            <Shield className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="text-foreground font-bold text-sm">{w.customer_name}</p>
                            <p className="text-muted-foreground text-xs mt-0.5">{w.customer_phone || ''}</p>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-3">
                        <p className="text-foreground font-semibold text-sm">{w.product_name}</p>
                        {w.product_details && <p className="text-muted-foreground text-xs mt-0.5">{w.product_details}</p>}
                      </div>
                      <div className="col-span-2 text-center text-muted-foreground text-xs font-semibold">{formatDate(w.purchase_date)}</div>
                      <div className="col-span-2 text-center text-xs font-semibold">{formatDate(w.expiry_date)}</div>
                      <div className="col-span-1 flex justify-center">
                        {expired ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Expired
                          </span>
                        ) : remaining <= 30 ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {remaining}d
                          </span>
                        ) : (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> {remaining}d
                          </span>
                        )}
                      </div>
                      <div className="col-span-1 flex items-center justify-center gap-1">
                        <button onClick={() => handlePrint(w)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-all active:scale-95 cursor-pointer" title="Print">
                          <Printer className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(w.warranty_id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg transition-all active:scale-95 cursor-pointer" title="Delete">
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 bg-background" onKeyDown={handleFormKeyDown}>
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 max-w-full mx-auto w-full" data-enter-nav>

            <section className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                  <User className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-blue-500 uppercase tracking-wider">1. Customer Details</span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Customer Name *</label>
                  <input type="text" value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Customer Phone</label>
                  <input type="text" value={form.customer_phone} onChange={e => setForm(p => ({ ...p, customer_phone: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                </div>
              </div>
            </section>

            <section className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                  <Package className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-indigo-500 uppercase tracking-wider">2. Product Details</span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Product Name *</label>
                  <input type="text" value={form.product_name} onChange={e => setForm(p => ({ ...p, product_name: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Product Details</label>
                  <input type="text" value={form.product_details} onChange={e => setForm(p => ({ ...p, product_details: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                </div>
              </div>
            </section>

            <section className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500">
                  <Calendar className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-violet-500 uppercase tracking-wider">3. Warranty Period</span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Purchase Date *</label>
                  <input type="date" value={form.purchase_date} onChange={e => setForm(p => ({ ...p, purchase_date: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Warranty Period</label>
                  <Select value={String(form.warranty_period_days)} onChange={v => setForm(p => ({ ...p, warranty_period_days: Number(v) }))} options={[{value:'30',label:'30 Days'},{value:'90',label:'90 Days'},{value:'180',label:'6 Months'},{value:'365',label:'1 Year'},{value:'730',label:'2 Years'},{value:'1095',label:'3 Years'},{value:'1825',label:'5 Years'}]} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Auto-calculated Expiry Date</label>
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl font-bold text-base text-primary shadow-sm">{expiryDate ? formatDate(expiryDate) : '�'}</div>
                </div>
              </div>
            </section>

            <section className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
                  <FileText className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-orange-500 uppercase tracking-wider">4. Additional Notes</span>
              </div>
              <div>
                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
              </div>
            </section>

          </div>

          <div className="flex justify-end items-center gap-3 px-6 py-4 border-t border-border bg-card shrink-0 shadow-sm">
            <button onClick={() => setShowCreate(false)} className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-xl transition-all active:scale-95 cursor-pointer border border-border">Cancel</button>
            <button onClick={handleSave} className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm border border-primary/10 active:scale-95 cursor-pointer">
              <Shield className="w-4 h-4" /> Register Warranty
            </button>
          </div>
        </div>
      )}

      <div className="hidden">
        <div ref={printRef}>
          {selectedWarranty && (
            <div>
              <table>
                <tr><td className="label">Customer Name</td><td>{selectedWarranty.customer_name}</td></tr>
                <tr><td className="label">Phone</td><td>{selectedWarranty.customer_phone || '�'}</td></tr>
                <tr><td className="label">Product</td><td>{selectedWarranty.product_name}</td></tr>
                <tr><td className="label">Product Details</td><td>{selectedWarranty.product_details || '�'}</td></tr>
                <tr><td className="label">Purchase Date</td><td>{formatDate(selectedWarranty.purchase_date)}</td></tr>
                <tr><td className="label">Warranty Period</td><td>{selectedWarranty.warranty_period_days} Days</td></tr>
                <tr><td className="label">Expiry Date</td><td>{formatDate(selectedWarranty.expiry_date)}</td></tr>
                <tr><td className="label">Notes</td><td>{selectedWarranty.notes || '�'}</td></tr>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

