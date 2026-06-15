import { useState, useEffect } from 'react';
import { fetchApi } from '../lib/api';
import { Search, Receipt, X, Loader2 } from 'lucide-react';
import clsx from 'clsx';

export default function Dashboard() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  
  // Discount Modal State
  const [isApplying, setIsApplying] = useState(false);
  const [discountType, setDiscountType] = useState<'FIXED' | 'PERCENTAGE'>('FIXED');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [successMsg, setSuccessMsg] = useState('');

  const loadInvoices = async () => {
    setIsLoading(true);
    try {
      const data = await fetchApi(`/api/invoices?limit=30&search=${search}`);
      setInvoices(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadInvoices, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleApplyDiscount = async () => {
    if (!selectedInvoice) return;
    setIsApplying(true);
    setSuccessMsg('');
    try {
      const res = await fetchApi(`/api/invoices/${selectedInvoice.invoice_id}/discount`, {
        method: 'PUT',
        body: JSON.stringify({ discount_type: discountType, discount_value: discountValue })
      });
      setSuccessMsg(`Success! New Total: $${res.grand_total.toFixed(2)}`);
      // Update local state
      setInvoices((prev: any[]) => prev.map(inv => 
        inv.invoice_id === selectedInvoice.invoice_id 
          ? { ...inv, discount_total: res.discount_total, discount_type: discountType, discount_value: discountValue, grand_total: res.grand_total }
          : inv
      ));
      setSelectedInvoice((prev: any) => ({ ...prev, discount_total: res.discount_total, discount_type: discountType, discount_value: discountValue, grand_total: res.grand_total }));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-0 bg-background pt-2 pb-4 z-10">
        <h1 className="text-xl font-bold mb-4">Sales History</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search invoice number..."
            className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-2 pb-20">
          {invoices.map(inv => (
            <div 
              key={inv.invoice_id}
              onClick={() => {
                setSelectedInvoice(inv);
                setDiscountType(inv.discount_type || 'FIXED');
                setDiscountValue(inv.discount_value || 0);
                setSuccessMsg('');
              }}
              className="p-4 bg-card border border-border rounded-xl flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{inv.invoice_number}</div>
                  <div className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleString()}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-sm">${inv.grand_total.toFixed(2)}</div>
                {inv.discount_total > 0 && <div className="text-xs text-primary">Discounted</div>}
              </div>
            </div>
          ))}
          {invoices.length === 0 && <div className="text-center text-muted-foreground py-8">No invoices found</div>}
        </div>
      )}

      {/* Discount Modal / Bottom Sheet */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-card w-full max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold">Apply Discount</h3>
              <button onClick={() => setSelectedInvoice(null)} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="p-3 bg-muted rounded-lg flex justify-between text-sm">
                <span>Invoice: <span className="font-bold">{selectedInvoice.invoice_number}</span></span>
                <span>Subtotal: <span className="font-bold">${selectedInvoice.subtotal.toFixed(2)}</span></span>
              </div>

              {successMsg ? (
                <div className="p-4 bg-primary/10 text-primary rounded-lg text-center font-bold">
                  {successMsg}
                </div>
              ) : (
                <>
                  <div className="flex gap-2 p-1 bg-muted rounded-lg">
                    <button 
                      onClick={() => setDiscountType('FIXED')} 
                      className={clsx("flex-1 py-1.5 text-sm font-medium rounded-md transition-colors", discountType === 'FIXED' ? "bg-background shadow-sm" : "text-muted-foreground")}
                    >Fixed ($)</button>
                    <button 
                      onClick={() => setDiscountType('PERCENTAGE')} 
                      className={clsx("flex-1 py-1.5 text-sm font-medium rounded-md transition-colors", discountType === 'PERCENTAGE' ? "bg-background shadow-sm" : "text-muted-foreground")}
                    >Percentage (%)</button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Discount Amount</label>
                    <input 
                      type="number" 
                      min="0"
                      value={discountValue || ''}
                      onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                  <button 
                    onClick={handleApplyDiscount}
                    disabled={isApplying}
                    className="w-full py-2.5 bg-primary text-primary-foreground font-bold rounded-lg disabled:opacity-50"
                  >
                    {isApplying ? 'Applying...' : 'Apply Discount'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
