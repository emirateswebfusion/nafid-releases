import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { Plus, X, Search, Printer, Download, FileText, RefreshCw, Trash2, CheckCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
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

export function QuotationManager({ onClose }: { onClose: () => void }) {
  const { shopName, tenantId } = useAuthStore();
  const { shopState } = useCartStore();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [quotationItems, setQuotationItems] = useState<QuotationItem[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);

  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    terms_conditions: '1. Prices are subject to change without prior notice.\n2. Delivery will be made within 7-10 working days.\n3. This quotation is valid for 15 days from the date of issue.\n4. Payment terms: 50% advance, 50% on delivery.\n5. GST extra as applicable.',
  });
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [grades, setGrades] = useState<any[]>([]);

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadQuotations(); loadProducts(); }, []);

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

  const loadProducts = async () => {
    try {
      if (window.electronAPI) {
        const tid = tenantId || '';
        const [prods, grds] = await Promise.all([
          window.electronAPI.dbGetProducts({ tenant_id: tid, limit: 10000 }),
          window.electronAPI.dbGetGrades(tid || ''),
        ]);
        if (Array.isArray(prods)) setProducts(prods);
        if (Array.isArray(grds)) setGrades(grds);
      }
    } catch (err) {
      console.error('[QuotationManager] Failed to load products:', err);
    }
  };

  useEffect(() => {
    if (productSearch.length < 2) { setProductResults([]); return; }
    const t = setTimeout(() => {
      const filtered = products.filter(p =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.sku_barcode || '').toLowerCase().includes(productSearch.toLowerCase())
      ).slice(0, 8);
      setProductResults(filtered);
    }, 150);
    return () => clearTimeout(t);
  }, [productSearch, products]);

  const selectProduct = (p: any) => {
    const rate = p.pricing_mode === 'GRADE_RATE' && p.grade_id
      ? Number(p.base_price) + (p.grade_rate || 0)
      : Number(p.base_price);
    setItems(prev => [...prev, {
      item_id: uuidv4(),
      product_id: p.product_id,
      name: p.name,
      quantity: 1,
      weight: p.billing_type === 'WEIGHT' && p.average_weight_per_piece ? Number(p.average_weight_per_piece) : 0,
      rate,
      amount: rate,
    }]);
    setProductSearch('');
    setProductResults([]);
  };

  const updateItem = (id: string, field: string, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.item_id !== id) return item;
      const updated = { ...item, [field]: value };
      const qty = field === 'quantity' ? Number(value) : Number(item.quantity);
      const rate = field === 'rate' ? Number(value) : Number(item.rate);
      updated.amount = qty * rate;
      if (field === 'weight') {
        updated.weight = Number(value);
      }
      return updated;
    }));
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.item_id !== id));

  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const taxTotal = subtotal * 0.18;
  const grandTotal = subtotal + taxTotal;

  const formatCurrency = (amount: number) => `\u20B9${amount.toFixed(2)}`;

  const handleCreateQuotation = async () => {
    if (items.length === 0) { setStatusMessage({ text: 'Add at least one item', type: 'error' }); return; }
    if (window.electronAPI) {
      const numRes = await window.electronAPI.dbGetNextQuotationNumber({ tenant_id: tenantId || '' });
      if (!numRes.success) { setStatusMessage({ text: 'Failed to generate number', type: 'error' }); return; }

      const quotationId = uuidv4();
      const res = await window.electronAPI.dbSaveQuotation({
        quotation_id: quotationId,
        tenant_id: tenantId,
        quotation_number: numRes.quotationNumber,
        ...form,
        subtotal,
        tax_total: taxTotal,
        grand_total: grandTotal,
        items: items.map(i => ({ ...i, tenant_id: tenantId })),
      });

      if (res.success) {
        setStatusMessage({ text: `Quotation ${numRes.quotationNumber} created!`, type: 'success' });
        setShowCreate(false);
        setItems([]);
        setForm({ customer_name: '', customer_phone: '', customer_address: '', terms_conditions: form.terms_conditions });
        loadQuotations();
      } else {
        setStatusMessage({ text: res.error || 'Failed', type: 'error' });
      }
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const viewQuotation = async (q: Quotation) => {
    setSelectedQuotation(q);
    if (window.electronAPI) {
      const its = await window.electronAPI.dbGetQuotationItems(q.quotation_id);
      if (Array.isArray(its)) setQuotationItems(its);
    }
    setShowDetail(true);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const content = printRef.current?.innerHTML || '';
    printWindow.document.write(`
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
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const handleConvertToInvoice = async (q: Quotation) => {
    if (!confirm(`Convert ${q.quotation_number} to invoice? This will copy items to billing.`)) return;
    localStorage.setItem('quotationToInvoice', JSON.stringify({ quotation: q }));
    window.dispatchEvent(new CustomEvent('open-billing'));
    onClose();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg"><FileText className="w-6 h-6" /></div>
          <div>
            <h1 className="text-2xl font-bold">Quotations</h1>
            <p className="text-muted-foreground text-sm">{quotations.length} quotations</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {showDetail ? (
            <button onClick={() => setShowDetail(false)} className="p-2 bg-muted hover:bg-muted/80 text-muted-foreground rounded-lg transition-colors"><X className="w-5 h-5" /></button>
          ) : showCreate ? (
            <button onClick={() => { setShowCreate(false); setItems([]); }} className="p-2 bg-muted hover:bg-muted/80 text-muted-foreground rounded-lg transition-colors"><X className="w-5 h-5" /></button>
          ) : (
            <>
              <button onClick={() => { setShowCreate(true); loadProducts(); }} className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all"><Plus className="w-4 h-4" /> New Quotation</button>
              <button onClick={onClose} className="px-3 py-2 text-xs font-semibold text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900 rounded-lg transition-colors">Close</button>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0 p-6">
        {statusMessage && (
          <div className={clsx('mb-4 px-4 py-2.5 rounded-xl text-sm font-bold', statusMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20')}>{statusMessage.text}</div>
        )}

        {/* Quotation List */}
        {!showDetail && !showCreate && (
          <div className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="text" placeholder="Search quotations..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-background border border-border rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>

            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-3 font-bold text-xs uppercase text-muted-foreground">QTN #</th>
                    <th className="text-left p-3 font-bold text-xs uppercase text-muted-foreground">Customer</th>
                    <th className="text-right p-3 font-bold text-xs uppercase text-muted-foreground">Amount</th>
                    <th className="text-center p-3 font-bold text-xs uppercase text-muted-foreground">Status</th>
                    <th className="text-right p-3 font-bold text-xs uppercase text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={5} className="p-8 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
                  ) : quotations.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No quotations yet</td></tr>
                  ) : quotations.filter(q => !search || q.customer_name?.toLowerCase().includes(search.toLowerCase()) || q.quotation_number?.toLowerCase().includes(search.toLowerCase())).map(q => (
                    <tr key={q.quotation_id} className="hover:bg-muted/20 cursor-pointer" onClick={() => viewQuotation(q)}>
                      <td className="p-3 font-mono font-bold text-primary">{q.quotation_number}</td>
                      <td className="p-3 font-medium">{q.customer_name || '-'}</td>
                      <td className="p-3 text-right font-bold">{formatCurrency(q.grand_total)}</td>
                      <td className="p-3 text-center">
                        <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', q.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500' : q.status === 'CONVERTED' ? 'bg-blue-500/10 text-blue-500' : 'bg-muted text-muted-foreground')}>{q.status}</span>
                      </td>
                      <td className="p-3 text-right text-muted-foreground text-xs">{new Date(q.created_at).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Create Form */}
        {showCreate && (
          <div className="max-w-5xl mx-auto space-y-6">
            <h2 className="text-xl font-bold">New Quotation</h2>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Customer Name</label>
                <input type="text" value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Phone</label>
                <input type="text" value={form.customer_phone} onChange={e => setForm(p => ({ ...p, customer_phone: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Address</label>
                <input type="text" value={form.customer_address} onChange={e => setForm(p => ({ ...p, customer_address: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
            </div>

            {/* Product Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="text" placeholder="Search and add products..." value={productSearch} onChange={e => setProductSearch(e.target.value)}
                className="w-full bg-background border border-border rounded-xl py-3 pl-10 pr-4 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
              {productResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto">
                  {productResults.map(p => (
                    <button key={p.product_id} onClick={() => selectProduct(p)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors border-b border-border/50 last:border-0">
                      <div className="font-medium text-sm flex-1">{p.name}</div>
                      <div className="text-sm font-bold text-primary">
                        {formatCurrency(p.pricing_mode === 'GRADE_RATE' && p.grade_rate ? Number(p.base_price) + Number(p.grade_rate) : Number(p.base_price))}
                      </div>
                      <Plus className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-3 font-bold text-xs uppercase text-muted-foreground">Item</th>
                    <th className="text-center p-3 font-bold text-xs uppercase text-muted-foreground" style={{width: 80}}>Qty</th>
                    <th className="text-center p-3 font-bold text-xs uppercase text-muted-foreground" style={{width: 80}}>Weight</th>
                    <th className="text-right p-3 font-bold text-xs uppercase text-muted-foreground" style={{width: 100}}>Rate</th>
                    <th className="text-right p-3 font-bold text-xs uppercase text-muted-foreground" style={{width: 100}}>Amount</th>
                    <th className="text-center p-3" style={{width: 50}}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map(item => (
                    <tr key={item.item_id}>
                      <td className="p-2 font-medium">{item.name}</td>
                      <td className="p-2">
                        <input type="number" min="1" value={item.quantity} onChange={e => updateItem(item.item_id, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-16 text-center bg-background border border-border rounded-lg p-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                      </td>
                      <td className="p-2">
                        <input type="number" step="0.001" value={item.weight || ''} onChange={e => updateItem(item.item_id, 'weight', e.target.value === '' ? 0 : Number(e.target.value))}
                          className="w-16 text-center bg-background border border-border rounded-lg p-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                      </td>
                      <td className="p-2">
                        <input type="number" step="0.01" value={item.rate} onChange={e => updateItem(item.item_id, 'rate', e.target.value === '' ? 0 : Number(e.target.value))}
                          className="w-20 text-right bg-background border border-border rounded-lg p-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                      </td>
                      <td className="p-2 text-right font-bold">{formatCurrency(item.amount)}</td>
                      <td className="p-2 text-center">
                        <button onClick={() => removeItem(item.item_id)} className="p-1 text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/20 font-bold">
                    <td colSpan={4} className="p-3 text-right">Subtotal</td>
                    <td className="p-3 text-right">{formatCurrency(subtotal)}</td>
                    <td></td>
                  </tr>
                  <tr className="bg-muted/20">
                    <td colSpan={4} className="p-3 text-right text-muted-foreground">GST (18%)</td>
                    <td className="p-3 text-right text-muted-foreground">{formatCurrency(taxTotal)}</td>
                    <td></td>
                  </tr>
                  <tr className="bg-muted/30 font-black text-lg">
                    <td colSpan={4} className="p-3 text-right">Grand Total</td>
                    <td className="p-3 text-right text-primary">{formatCurrency(grandTotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Terms */}
            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Terms & Conditions</label>
              <textarea value={form.terms_conditions} onChange={e => setForm(p => ({ ...p, terms_conditions: e.target.value }))} rows={5}
                className="w-full bg-background border border-border rounded-xl p-3 text-foreground text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowCreate(false); setItems([]); }} className="px-4 py-2.5 text-sm font-semibold text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900 rounded-xl transition-colors">Cancel</button>
              <button onClick={handleCreateQuotation} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all"><FileText className="w-4 h-4" /> Create Quotation</button>
            </div>
          </div>
        )}

        {/* Quotation Detail */}
        {showDetail && selectedQuotation && (
          <div className="max-w-4xl mx-auto">
            <div ref={printRef} className="space-y-6 bg-card border border-border rounded-2xl p-8">
              {/* Header */}
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

              {/* Items */}
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

              {/* Terms */}
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

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={handlePrint} className="px-4 py-2.5 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-xl text-sm font-bold flex items-center gap-2"><Printer className="w-4 h-4" /> Print</button>
              <button onClick={handlePrint} className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2"><Download className="w-4 h-4" /> PDF</button>
              {selectedQuotation.status === 'ACTIVE' && (
                <button onClick={() => handleConvertToInvoice(selectedQuotation)} className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Convert to Invoice</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
