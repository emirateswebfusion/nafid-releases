import { useState, useEffect, Fragment } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  Search, Package, X, Trash2, FileText, Calendar, User,
  CheckCircle2, AlertCircle, Plus, Save, ChevronDown, ChevronUp,
  Receipt
} from 'lucide-react';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { Skeleton } from './ui/Skeleton';

interface PurchaseBill {
  purchase_bill_id: string;
  tenant_id: string;
  bill_number: string;
  supplier_id: string;
  supplier_name: string;
  bill_date: string;
  notes: string;
  total_amount: number;
  created_at: string;
  supplier_phone?: string;
}

interface PurchaseBillItem {
  item_id: string;
  purchase_bill_id: string;
  product_id: string;
  name: string;
  quantity: number;
  purchase_price: number;
  total_amount: number;
  is_gst_applicable: number;
  tax_rate_percent: number;
  hsn_sac_code: string;
  sku_barcode?: string;
  item_code?: string;
}

interface Product {
  product_id: string;
  name: string;
  sku_barcode: string;
  item_code: string;
  purchase_price: number;
  base_price: number;
  current_stock: number;
  gst_purchase_quantity: number;
  gst_purchase_price: number;
}

const formatDate = (d: string) => {
  if (!d) return '—';
  const date = new Date(d.replace(' ', 'T'));
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export function PurchaseBillManager({ onClose }: { onClose: () => void }) {
  const { tenantId } = useAuthStore();

  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBill, setExpandedBill] = useState<string | null>(null);
  const [billItems, setBillItems] = useState<Record<string, PurchaseBillItem[]>>({});
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [newBillItems, setNewBillItems] = useState<Array<{
    product_id: string;
    name: string;
    quantity: string;
    purchase_price: string;
  }>>([]);
  const [newBillSupplierName, setNewBillSupplierName] = useState('');
  const [newBillSupplierId, setNewBillSupplierId] = useState('');
  const [newBillDate, setNewBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [newBillNumber, setNewBillNumber] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadBills = async () => {
    if (!window.electronAPI || !tenantId) return;
    setLoading(true);
    const result = await window.electronAPI.dbGetPurchaseBills({
      tenant_id: tenantId,
      search: searchQuery || undefined,
      limit: 100,
    });
    if (Array.isArray(result)) {
      setBills(result);
    }
    setLoading(false);
  };

  useEffect(() => { loadBills(); }, [tenantId, searchQuery]);

  useEffect(() => {
    if (showAddForm && window.electronAPI && tenantId) {
      window.electronAPI.dbGetNextPurchaseBillNumber({ tenant_id: tenantId })
        .then(res => { if (res.success && res.billNumber) setNewBillNumber(res.billNumber); })
        .catch(console.error);

      window.electronAPI.dbGetParties(tenantId)
        .then(res => { if (Array.isArray(res)) setSuppliers(res); })
        .catch(console.error);
    }
  }, [showAddForm, tenantId]);

  const handleExpandBill = async (billId: string) => {
    if (expandedBill === billId) {
      setExpandedBill(null);
      return;
    }
    setExpandedBill(billId);
    if (!billItems[billId] && window.electronAPI) {
      const items = await window.electronAPI.dbGetPurchaseBillItems(billId);
      if (Array.isArray(items)) {
        setBillItems(prev => ({ ...prev, [billId]: items }));
      }
    }
  };

  const handleDelete = async (bill: PurchaseBill) => {
    if (!confirm(`Delete purchase bill "${bill.bill_number}" from ${bill.supplier_name}?`)) return;
    if (window.electronAPI) {
      const res = await window.electronAPI.dbDeletePurchaseBill(bill.purchase_bill_id);
      if (res.success) {
        setBills(prev => prev.filter(b => b.purchase_bill_id !== bill.purchase_bill_id));
        setStatusMessage({ text: 'Purchase bill deleted', type: 'success' });
      } else {
        setStatusMessage({ text: 'Delete failed: ' + (res.error || ''), type: 'error' });
      }
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const searchProducts = async (q: string) => {
    setProductSearch(q);
    if (!window.electronAPI || !tenantId || q.length < 2) {
      if (q.length < 2) setProducts([]);
      return;
    }
    const result = await window.electronAPI.dbGetPurchaseBillProducts({ tenant_id: tenantId, search: q });
    if (Array.isArray(result)) {
      setProducts(result);
    }
  };

  const addProductToBill = (product: Product) => {
    if (newBillItems.some(i => i.product_id === product.product_id)) return;
    setNewBillItems(prev => [...prev, {
      product_id: product.product_id,
      name: product.name,
      quantity: '1',
      purchase_price: String(product.gst_purchase_price || product.purchase_price || 0),
    }]);
    setProductSearch('');
    setProducts([]);
  };

  const removeBillItem = (productId: string) => {
    setNewBillItems(prev => prev.filter(i => i.product_id !== productId));
  };

  const updateBillItem = (productId: string, field: 'quantity' | 'purchase_price', value: string) => {
    setNewBillItems(prev => prev.map(i => i.product_id === productId ? { ...i, [field]: value } : i));
  };

  const getBillTotal = () => {
    return newBillItems.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.purchase_price) || 0), 0);
  };

  const handleSavePurchaseBill = async () => {
    if (newBillItems.length === 0) {
      setStatusMessage({ text: 'Add at least one product to the bill.', type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }
    if (!newBillSupplierName.trim()) {
      setStatusMessage({ text: 'Supplier name is required.', type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    setIsSaving(true);
    const totalAmount = getBillTotal();
    const billId = uuidv4();

    if (window.electronAPI) {
      const res = await window.electronAPI.dbAddPurchaseBill({
        purchase_bill_id: billId,
        tenant_id: tenantId,
        bill_number: newBillNumber || `AUTO-${Date.now()}`,
        supplier_id: newBillSupplierId || null,
        supplier_name: newBillSupplierName.trim(),
        bill_date: newBillDate,
        notes: null,
        total_amount: totalAmount,
        items: newBillItems.map(item => ({
          item_id: uuidv4(),
          product_id: item.product_id,
          name: item.name,
          quantity: Number(item.quantity) || 0,
          purchase_price: Number(item.purchase_price) || 0,
          total_amount: (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0),
          is_gst_applicable: 1,
          tax_rate_percent: 0,
          hsn_sac_code: null,
        })),
      });

      if (res.success) {
        setStatusMessage({ text: 'Purchase bill saved successfully!', type: 'success' });
        setShowAddForm(false);
        setNewBillItems([]);
        setNewBillSupplierName('');
        setNewBillSupplierId('');
        setProductSearch('');
        setProducts([]);
        loadBills();
      } else {
        setStatusMessage({ text: 'Save failed: ' + (res.error || ''), type: 'error' });
      }
    }
    setIsSaving(false);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-inner">
            {showAddForm ? <Receipt className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">
                {showAddForm ? 'New Purchase Bill' : 'Purchase Bills'}
              </h1>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Active" />
            </div>
            <p className="text-xs text-muted-foreground font-semibold mt-0.5">
              {showAddForm ? 'Record a GST purchase entry' : `${bills.length} purchase bills`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {showAddForm ? (
            <button onClick={() => setShowAddForm(false)} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30" title="Back to list">
              <X className="w-4 h-4 text-destructive" />
            </button>
          ) : (
            <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30" title="Close">
              <X className="w-4 h-4 text-destructive" />
            </button>
          )}
        </div>
      </header>

      {/* ── LIST VIEW ── */}
      {!showAddForm && (
        <>
          <div className="flex justify-between items-center gap-4 px-6 py-3 border-b border-border bg-card/50 shrink-0 shadow-sm">
            <div className="flex-1 max-w-lg">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by bill number or supplier..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-background border border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-foreground transition-all shadow-sm placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm border border-primary/10 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> New Purchase Bill
            </button>
          </div>

          <div className="flex flex-col flex-1 min-h-0 bg-background">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-6 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border/60 shrink-0 bg-muted/40">
              <div className="col-span-4">Bill Number</div>
              <div className="col-span-3">Supplier</div>
              <div className="col-span-2 text-center">Date</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-y-auto divide-y divide-border relative">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={`skel-${i}`} className="grid grid-cols-12 gap-2 px-6 py-4 items-center">
                    <div className="col-span-4">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-8 w-8 rounded-lg" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-36" />
                        </div>
                      </div>
                    </div>
                    <div className="col-span-3"><Skeleton className="h-4 w-28" /></div>
                    <div className="col-span-2 flex justify-center"><Skeleton className="h-4 w-24" /></div>
                    <div className="col-span-2 flex justify-end"><Skeleton className="h-4 w-20" /></div>
                    <div className="col-span-1 flex justify-center gap-2">
                      <Skeleton className="h-8 w-8 rounded-lg" />
                      <Skeleton className="h-8 w-8 rounded-lg" />
                    </div>
                  </div>
                ))
              ) : bills.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
                  <Receipt className="w-12 h-12 mb-3" />
                  <p className="font-medium text-foreground">No purchase bills found</p>
                  <p className="text-sm mt-1">Click "New Purchase Bill" to record a GST purchase</p>
                </div>
              ) : (
                bills.map(bill => (
                  <Fragment key={bill.purchase_bill_id}>
                    <div
                      onClick={() => handleExpandBill(bill.purchase_bill_id)}
                      className={clsx(
                        "grid grid-cols-12 gap-2 px-4 py-3 items-center bg-card border-b border-border/40 hover:border-primary/30 hover:shadow-sm transition-all duration-150 group cursor-pointer",
                        expandedBill === bill.purchase_bill_id && "border-l-2 border-l-primary"
                      )}
                    >
                      <div className="col-span-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
                            <FileText className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="text-foreground font-bold text-sm">{bill.bill_number}</p>
                            {bill.notes && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{bill.notes}</p>}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-3 flex items-center gap-1.5">
                        <User className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-sm font-semibold text-foreground truncate">{bill.supplier_name}</span>
                      </div>
                      <div className="col-span-2 text-center">
                        <span className="text-xs font-medium text-muted-foreground flex items-center justify-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(bill.bill_date || bill.created_at)}
                        </span>
                      </div>
                      <div className="col-span-2 text-right">
                        <span className="text-sm font-black text-foreground">₹{Number(bill.total_amount).toFixed(2)}</span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(bill); }}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleExpandBill(bill.purchase_bill_id); }}
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors cursor-pointer"
                          title={expandedBill === bill.purchase_bill_id ? 'Collapse' : 'Expand'}
                        >
                          {expandedBill === bill.purchase_bill_id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded items row */}
                    {expandedBill === bill.purchase_bill_id && (
                      <div className="col-span-12 bg-muted/20 px-6 py-3 border-b border-border/40" style={{ gridColumn: '1 / -1' }}>
                        {billItems[bill.purchase_bill_id] ? (
                          <div className="space-y-1">
                            <div className="grid grid-cols-[1fr_100px_120px_120px] gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider px-3 py-1.5">
                              <span>Product</span>
                              <span className="text-right">Qty</span>
                              <span className="text-right">Rate</span>
                              <span className="text-right">Total</span>
                            </div>
                            {billItems[bill.purchase_bill_id].map(item => (
                              <div key={item.item_id} className="grid grid-cols-[1fr_100px_120px_120px] gap-2 px-3 py-2 bg-card rounded-lg border border-border/40 text-sm items-center">
                                <div>
                                  <span className="font-medium text-foreground">{item.name}</span>
                                  {item.sku_barcode && <span className="text-xs text-muted-foreground ml-2 font-mono">{item.sku_barcode}</span>}
                                </div>
                                <span className="text-right font-semibold">{Number(item.quantity).toFixed(2)}</span>
                                <span className="text-right font-semibold">₹{Number(item.purchase_price).toFixed(2)}</span>
                                <span className="text-right font-bold text-primary">₹{Number(item.total_amount).toFixed(2)}</span>
                              </div>
                            ))}
                            {bill.notes && (
                              <p className="text-xs text-muted-foreground mt-2 px-3 italic">{bill.notes}</p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            Loading items...
                          </div>
                        )}
                      </div>
                    )}
                  </Fragment>
                ))
              )}
            </div>

            {!loading && bills.length > 0 && (
              <div className="shrink-0 border-t border-border/60 bg-muted/20 px-6 py-4 text-center text-sm font-bold text-muted-foreground">
                {bills.length} purchase bill{bills.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── ADD FORM ── */}
      {showAddForm && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* Bill Details Section */}
            <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <FileText className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-wider">Bill Details</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Bill Number</label>
                  <input type="text" value={newBillNumber} onChange={e => setNewBillNumber(e.target.value)} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none font-mono tracking-wider text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Bill Date</label>
                  <input type="date" value={newBillDate} onChange={e => setNewBillDate(e.target.value)} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Supplier</label>
                  <div className="relative">
                    <input
                      type="text" placeholder="Search or type supplier name..."
                      value={supplierSearch || newBillSupplierName}
                      onChange={e => {
                        setSupplierSearch(e.target.value);
                        setNewBillSupplierName(e.target.value);
                        setNewBillSupplierId('');
                        const match = suppliers.find(s => s.name.toLowerCase() === e.target.value.toLowerCase());
                        if (match) { setNewBillSupplierName(match.name); setNewBillSupplierId(match.party_id); }
                      }}
                      className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none text-sm"
                    />
                    {supplierSearch && filteredSuppliers.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border/80 rounded-xl shadow-xl overflow-hidden max-h-40 overflow-y-auto">
                        {filteredSuppliers.map(s => (
                          <button
                            key={s.party_id} type="button"
                            onMouseDown={() => { setNewBillSupplierName(s.name); setNewBillSupplierId(s.party_id); setSupplierSearch(''); }}
                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted border-b border-border/40 last:border-0 cursor-pointer"
                          >
                            {s.name} {s.phone && <span className="text-xs text-muted-foreground ml-2">{s.phone}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Products Section */}
            <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Package className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">Products</span>
              </div>

              <div className="relative mb-4">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search products to add to this bill..."
                  value={productSearch}
                  onChange={e => searchProducts(e.target.value)}
                  className="w-full bg-background border border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-foreground transition-all shadow-sm"
                />
                {products.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border/80 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                    {products.map(p => (
                      <button
                        key={p.product_id} type="button"
                        onMouseDown={() => addProductToBill(p)}
                        className="w-full text-left px-4 py-3 flex items-center gap-3 border-b border-border/40 last:border-0 hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Package className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{p.sku_barcode}</p>
                        </div>
                        <div className="text-right text-xs shrink-0">
                          <div className="font-semibold text-foreground">Stock: {Number(p.current_stock).toFixed(0)}</div>
                          <div className="text-muted-foreground">₹{Number(p.base_price).toFixed(2)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {newBillItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium">No products added yet</p>
                  <p className="text-xs mt-1">Search and select products above</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_100px_120px_80px] gap-2 px-3 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <span>Product</span>
                    <span className="text-right">Quantity</span>
                    <span className="text-right">Purchase Price</span>
                    <span className="text-right"></span>
                  </div>
                  {newBillItems.map(item => (
                    <div key={item.product_id} className="grid grid-cols-[1fr_100px_120px_80px] gap-2 px-3 py-2 bg-muted/20 border border-border/60 rounded-lg items-center">
                      <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
                      <input
                        type="number" step="0.01" min="0"
                        value={item.quantity}
                        onChange={e => updateBillItem(item.product_id, 'quantity', e.target.value)}
                        className="w-full bg-background border border-border/80 rounded-lg p-1.5 text-right text-sm font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners"
                      />
                      <input
                        type="number" step="0.01" min="0"
                        value={item.purchase_price}
                        onChange={e => updateBillItem(item.product_id, 'purchase_price', e.target.value)}
                        className="w-full bg-background border border-border/80 rounded-lg p-1.5 text-right text-sm font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners"
                      />
                      <button onClick={() => removeBillItem(item.product_id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg transition-colors cursor-pointer">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {newBillItems.length > 0 && (
                <div className="flex justify-end mt-4 pt-3 border-t border-border/60">
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Bill Total</span>
                    <p className="text-lg font-black text-primary">₹{getBillTotal().toFixed(2)}</p>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Footer */}
          <div className="border-t border-border/50 bg-background px-4 py-3">
            {statusMessage && (
              <div className={clsx(
                "mb-2 px-3 py-2.5 rounded-xl border text-sm font-bold flex items-center gap-2",
                statusMessage.type === 'success' ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 border-destructive/20 text-destructive"
              )}>
                {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span className="flex-1">{statusMessage.text}</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddForm(false)} className="px-4 py-2.5 text-sm font-semibold text-destructive hover:text-destructive/80 border border-destructive/30 rounded-xl transition-colors cursor-pointer">
                Cancel
              </button>
              <button
                onClick={handleSavePurchaseBill}
                disabled={isSaving || newBillItems.length === 0}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? 'Saving...' : 'Save Purchase Bill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
