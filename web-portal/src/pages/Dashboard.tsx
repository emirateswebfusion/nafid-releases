import { useState, useEffect } from 'react';
import { fetchApi } from '../lib/api';
import { Search, Receipt, X, Loader2, Edit3 } from 'lucide-react';
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

  // Edit Modal State
  const [editInvoice, setEditInvoice] = useState<any>(null);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editSuccess, setEditSuccess] = useState('');

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

  const handleEditInvoice = async (inv: any) => {
    setEditInvoice(inv);
    setEditSuccess('');
    try {
      const items = await fetchApi(`/api/invoices/${inv.invoice_id}/items`);
      setEditItems(Array.isArray(items) ? items.map((i: any) => ({ ...i })) : []);
    } catch (e) {
      console.error(e);
      setEditItems([]);
    }
  };

  const handleEditItemField = (index: number, field: string, value: any) => {
    setEditItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        const qty = field === 'quantity' ? Number(value) : Number(updated[index].quantity);
        const price = field === 'unit_price' ? Number(value) : Number(updated[index].unit_price);
        updated[index].total = qty * price;
      }
      return updated;
    });
  };

  const handleRemoveEditItem = (index: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async () => {
    if (!editInvoice) return;
    setIsSavingEdit(true);
    setEditSuccess('');
    try {
      const newSubtotal = editItems.reduce((sum: number, i: any) => sum + i.total, 0);
      const newTaxTotal = editItems.reduce((sum: number, i: any) => sum + (i.tax_amount || 0), 0);
      const newGrandTotal = newSubtotal + newTaxTotal - (editInvoice.discount_total || 0);

      const res = await fetchApi(`/api/invoices/${editInvoice.invoice_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          subtotal: newSubtotal,
          tax_total: newTaxTotal,
          discount_total: editInvoice.discount_total || 0,
          discount_type: editInvoice.discount_type || 'FIXED',
          discount_value: editInvoice.discount_value || 0,
          grand_total: newGrandTotal,
          items: editItems.map((item: any) => ({
            item_id: item.item_id,
            product_id: item.product_id,
            name: item.name,
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
            tax_amount: Number(item.tax_amount || 0),
            total: Number(item.total),
          })),
        }),
      });
      setEditSuccess(`Bill updated! New total: $${newGrandTotal.toFixed(2)}`);
      setInvoices((prev: any[]) => prev.map(inv =>
        inv.invoice_id === editInvoice.invoice_id
          ? { ...inv, subtotal: newSubtotal, tax_total: newTaxTotal, grand_total: newGrandTotal }
          : inv
      ));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsSavingEdit(false);
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
                className="p-4 bg-card border border-border rounded-xl flex items-center justify-between gap-3 active:scale-[0.98] transition-transform"
              >
                <div 
                  onClick={() => {
                    setSelectedInvoice(inv);
                    setDiscountType(inv.discount_type || 'FIXED');
                    setDiscountValue(inv.discount_value || 0);
                    setSuccessMsg('');
                  }}
                  className="flex items-center gap-3 flex-1 cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{inv.invoice_number}</div>
                    <div className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleString()}</div>
                  </div>
                </div>
                <div className="text-right flex items-center gap-2">
                  <button
                    onClick={() => handleEditInvoice(inv)}
                    className="p-2 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                    title="Edit invoice"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <div>
                    <div className="font-bold text-sm">${inv.grand_total.toFixed(2)}</div>
                    {inv.discount_total > 0 && <div className="text-xs text-primary">Discounted</div>}
                  </div>
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

      {/* Edit Modal */}
      {editInvoice && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-card w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="font-bold">Edit Invoice</h3>
              <button onClick={() => { setEditInvoice(null); setEditSuccess(''); }} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="text-sm">
                <span className="font-bold">{editInvoice.invoice_number}</span>
                <span className="text-muted-foreground ml-2">{new Date(editInvoice.created_at).toLocaleString()}</span>
              </div>

              {editSuccess ? (
                <div className="p-4 bg-primary/10 text-primary rounded-lg text-center font-bold">{editSuccess}</div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-2 px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase border-b border-border">
                      <div className="col-span-5">Item</div>
                      <div className="col-span-2 text-center">Qty</div>
                      <div className="col-span-2 text-right">Rate</div>
                      <div className="col-span-2 text-right">Total</div>
                      <div className="col-span-1" />
                    </div>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {editItems.map((item: any, index: number) => (
                        <div key={item.item_id || index} className="grid grid-cols-12 gap-2 px-2 py-1.5 items-center text-sm">
                          <div className="col-span-5 truncate font-medium">{item.name}</div>
                          <div className="col-span-2">
                            <input type="number" min="0" step="any"
                              className="w-full text-center h-7 bg-muted/30 border border-border rounded text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                              value={item.quantity}
                              onChange={e => handleEditItemField(index, 'quantity', e.target.value === '' ? 0 : Number(e.target.value))} />
                          </div>
                          <div className="col-span-2">
                            <input type="number" min="0" step="any"
                              className="w-full text-right h-7 bg-muted/30 border border-border rounded text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                              value={item.unit_price}
                              onChange={e => handleEditItemField(index, 'unit_price', e.target.value === '' ? 0 : Number(e.target.value))} />
                          </div>
                          <div className="col-span-2 text-right font-bold">${item.total.toFixed(2)}</div>
                          <div className="col-span-1 text-right">
                            <button onClick={() => handleRemoveEditItem(index)} className="p-1 text-muted-foreground hover:text-destructive">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1 text-sm pt-2 border-t border-border">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span>${editItems.reduce((s: number, i: any) => s + i.total, 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tax</span>
                      <span>${editItems.reduce((s: number, i: any) => s + (i.tax_amount || 0), 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold pt-2 border-t border-border">
                      <span>Grand Total</span>
                      <span className="text-primary">
                        ${(editItems.reduce((s: number, i: any) => s + i.total, 0) + editItems.reduce((s: number, i: any) => s + (i.tax_amount || 0), 0) - (editInvoice.discount_total || 0)).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleSaveEdit}
                    disabled={isSavingEdit}
                    className="w-full py-2.5 bg-primary text-primary-foreground font-bold rounded-lg disabled:opacity-50"
                  >
                    {isSavingEdit ? 'Saving...' : 'Save Changes'}
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
