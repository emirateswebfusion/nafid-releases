import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { Plus, X, Search, Printer, Download, Shield, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';

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

export function WarrantyManager({ onClose }: { onClose: () => void }) {
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
    purchase_date: new Date().toISOString().split('T')[0],
    warranty_period_days: 365,
    notes: '',
  });

  const printRef = useRef<HTMLDivElement>(null);

  const expiryDate = form.purchase_date && form.warranty_period_days
    ? new Date(new Date(form.purchase_date).getTime() + form.warranty_period_days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
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
        setForm({ customer_name: '', customer_phone: '', product_name: '', product_details: '', purchase_date: new Date().toISOString().split('T')[0], warranty_period_days: 365, notes: '' });
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

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  const isExpired = (expiry: string) => new Date(expiry) < new Date();
  const daysRemaining = (expiry: string) => Math.max(0, Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg"><Shield className="w-6 h-6" /></div>
          <div>
            <h1 className="text-2xl font-bold">Warranty Management</h1>
            <p className="text-muted-foreground text-sm">{warranties.length} warranties registered</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {showCreate ? (
            <button onClick={() => setShowCreate(false)} className="p-2 bg-muted hover:bg-muted/80 text-muted-foreground rounded-lg transition-colors"><X className="w-5 h-5" /></button>
          ) : (
            <>
              <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all"><Plus className="w-4 h-4" /> New Warranty</button>
              <button onClick={onClose} className="px-3 py-2 text-xs font-semibold text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900 rounded-lg transition-colors">Close</button>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0 p-6">
        {statusMessage && (
          <div className={clsx('mb-4 px-4 py-2.5 rounded-xl text-sm font-bold', statusMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20')}>{statusMessage.text}</div>
        )}

        {!showCreate ? (
          <div className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="text" placeholder="Search by customer or product..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-background border border-border rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>

            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-3 font-bold text-xs uppercase text-muted-foreground">Customer</th>
                    <th className="text-left p-3 font-bold text-xs uppercase text-muted-foreground">Product</th>
                    <th className="text-center p-3 font-bold text-xs uppercase text-muted-foreground">Purchase</th>
                    <th className="text-center p-3 font-bold text-xs uppercase text-muted-foreground">Expiry</th>
                    <th className="text-center p-3 font-bold text-xs uppercase text-muted-foreground">Status</th>
                    <th className="text-center p-3 font-bold text-xs uppercase text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : warranties.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No warranties registered</td></tr>
                  ) : warranties.filter(w => !search || w.customer_name.toLowerCase().includes(search.toLowerCase()) || w.product_name.toLowerCase().includes(search.toLowerCase())).map(w => {
                    const expired = isExpired(w.expiry_date);
                    const remaining = daysRemaining(w.expiry_date);
                    return (
                      <tr key={w.warranty_id} className="hover:bg-muted/20">
                        <td className="p-3">
                          <div className="font-medium">{w.customer_name}</div>
                          <div className="text-xs text-muted-foreground">{w.customer_phone || ''}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{w.product_name}</div>
                          <div className="text-xs text-muted-foreground">{w.product_details || ''}</div>
                        </td>
                        <td className="p-3 text-center text-xs">{formatDate(w.purchase_date)}</td>
                        <td className="p-3 text-center text-xs">{formatDate(w.expiry_date)}</td>
                        <td className="p-3 text-center">
                          {expired ? (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">Expired</span>
                          ) : remaining <= 30 ? (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">{remaining}d left</span>
                          ) : (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">{remaining}d left</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => handlePrint(w)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg" title="Print"><Printer className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(w.warranty_id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-bold">Register Warranty</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Customer Name *</label>
                <input type="text" value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Customer Phone</label>
                <input type="text" value={form.customer_phone} onChange={e => setForm(p => ({ ...p, customer_phone: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Product Name *</label>
                <input type="text" value={form.product_name} onChange={e => setForm(p => ({ ...p, product_name: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Product Details</label>
                <input type="text" value={form.product_details} onChange={e => setForm(p => ({ ...p, product_details: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Purchase Date *</label>
                <input type="date" value={form.purchase_date} onChange={e => setForm(p => ({ ...p, purchase_date: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Warranty Period (Days)</label>
                <select value={form.warranty_period_days} onChange={e => setForm(p => ({ ...p, warranty_period_days: Number(e.target.value) }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none appearance-none">
                  <option value={30}>30 Days</option>
                  <option value={90}>90 Days</option>
                  <option value={180}>6 Months</option>
                  <option value={365}>1 Year</option>
                  <option value={730}>2 Years</option>
                  <option value={1095}>3 Years</option>
                  <option value={1825}>5 Years</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Auto-calculated Expiry Date</label>
                <div className="p-3 bg-muted/30 border border-border rounded-xl font-bold text-lg">{expiryDate ? formatDate(expiryDate) : '—'}</div>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} className="w-full bg-background border border-border rounded-xl p-3 text-foreground text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2.5 text-sm font-semibold text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900 rounded-xl transition-colors">Cancel</button>
              <button onClick={handleSave} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all"><Shield className="w-4 h-4" /> Register Warranty</button>
            </div>
          </div>
        )}

        {/* Hidden print template */}
        <div className="hidden">
          <div ref={printRef}>
            {selectedWarranty && (
              <div>
                <table>
                  <tr><td className="label">Customer Name</td><td>{selectedWarranty.customer_name}</td></tr>
                  <tr><td className="label">Phone</td><td>{selectedWarranty.customer_phone || '—'}</td></tr>
                  <tr><td className="label">Product</td><td>{selectedWarranty.product_name}</td></tr>
                  <tr><td className="label">Product Details</td><td>{selectedWarranty.product_details || '—'}</td></tr>
                  <tr><td className="label">Purchase Date</td><td>{formatDate(selectedWarranty.purchase_date)}</td></tr>
                  <tr><td className="label">Warranty Period</td><td>{selectedWarranty.warranty_period_days} Days</td></tr>
                  <tr><td className="label">Expiry Date</td><td>{formatDate(selectedWarranty.expiry_date)}</td></tr>
                  <tr><td className="label">Notes</td><td>{selectedWarranty.notes || '—'}</td></tr>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
