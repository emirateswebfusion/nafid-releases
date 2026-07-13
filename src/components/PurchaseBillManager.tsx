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
  bill_type: string;
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
  const [supplierName, setSupplierName] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');

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
                            <div className="flex items-center gap-1.5">
                              <p className="text-foreground font-bold text-sm">{bill.bill_number}</p>
                              <span className={clsx(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider",
                                bill.bill_type === 'ESTIMATE'
                                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              )}>
                                {bill.bill_type || 'GST'}
                              </span>
                            </div>
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
                    <div className="flex items-center gap-2 px-3 mt-1">
                      <span className={clsx(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider",
                        bill.bill_type === 'ESTIMATE'
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      )}>
                        {bill.bill_type || 'GST'} BILL
                      </span>
                      {bill.notes && <span className="text-xs text-muted-foreground italic">{bill.notes}</span>}
                    </div>
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
          {/* ── Shared Info Bar ── */}
          <div className="flex items-center gap-4 px-4 py-3 bg-card border-b border-border/80 shrink-0 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5" />
              <span>Date</span>
            </div>
            <input
              type="date" value={billDate}
              onChange={e => setBillDate(e.target.value)}
              className="bg-background border border-border/80 rounded-lg px-3 py-1.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none"
            />
            <div className="w-px h-6 bg-border/60 mx-1" />
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              <User className="w-3.5 h-3.5" />
              <span>Supplier</span>
            </div>
            <div className="relative flex-1 max-w-xs">
              <input
                type="text" placeholder="Search or type supplier name..."
                value={supplierSearch || supplierName}
                onChange={e => {
                  setSupplierSearch(e.target.value);
                  setSupplierName(e.target.value);
                  setSupplierId('');
                  const match = suppliers.find(s => s.name.toLowerCase() === e.target.value.toLowerCase());
                  if (match) { setSupplierName(match.name); setSupplierId(match.party_id); }
                }}
                className="w-full bg-background border border-border/80 rounded-lg px-3 py-1.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none"
              />
              {supplierSearch && filteredSuppliers.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border/80 rounded-xl shadow-xl overflow-hidden max-h-40 overflow-y-auto">
                  {filteredSuppliers.map(s => (
                    <button
                      key={s.party_id} type="button"
                      onMouseDown={() => { setSupplierName(s.name); setSupplierId(s.party_id); setSupplierSearch(''); }}
                      className="w-full text-left px-3 py-2 text-sm font-medium text-foreground hover:bg-muted border-b border-border/40 last:border-0 cursor-pointer"
                    >
                      {s.name} {s.phone && <span className="text-xs text-muted-foreground ml-2">{s.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Two Sections ── */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <PurchaseBillFormSection
              type="GST"
              tenantId={tenantId}
              billDate={billDate}
              supplierName={supplierName}
              supplierId={supplierId}
              onStatusMessage={setStatusMessage}
              onSaved={() => { setShowAddForm(false); loadBills(); }}
            />
            <PurchaseBillFormSection
              type="ESTIMATE"
              tenantId={tenantId}
              billDate={billDate}
              supplierName={supplierName}
              supplierId={supplierId}
              onStatusMessage={setStatusMessage}
              onSaved={() => { setShowAddForm(false); loadBills(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PurchaseBillFormSection({
  type,
  tenantId,
  billDate,
  supplierName,
  supplierId,
  onStatusMessage,
  onSaved,
}: {
  type: 'GST' | 'ESTIMATE';
  tenantId: string;
  billDate: string;
  supplierName: string;
  supplierId: string;
  onStatusMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
  onSaved: () => void;
}) {
  const [billNumber, setBillNumber] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [billItems, setBillItems] = useState<Array<{
    product_id: string;
    name: string;
    quantity: string;
    purchase_price: string;
  }>>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showProductCreateForm, setShowProductCreateForm] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductItemCode, setNewProductItemCode] = useState('');
  const [newProductBarcode, setNewProductBarcode] = useState('');
  const [newProductBrand, setNewProductBrand] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('');
  const [newProductUom, setNewProductUom] = useState('Pcs');
  const [newProductPurchasePrice, setNewProductPurchasePrice] = useState('');
  const [newProductBasePrice, setNewProductBasePrice] = useState('');
  const [newProductStock, setNewProductStock] = useState('');
  const [newProductReorderLevel, setNewProductReorderLevel] = useState('');
  const [newProductHsn, setNewProductHsn] = useState('');
  const [newProductTaxRate, setNewProductTaxRate] = useState(0);
  const [newProductDiscountPercent, setNewProductDiscountPercent] = useState('');
  const [newProductDiscountFlat, setNewProductDiscountFlat] = useState('');
  const [newProductOfferPrice, setNewProductOfferPrice] = useState('');

  useEffect(() => {
    if (window.electronAPI && tenantId) {
      window.electronAPI.dbGetNextPurchaseBillNumber({ tenant_id: tenantId })
        .then(res => { if (res.success && res.billNumber) setBillNumber(res.billNumber); })
        .catch(console.error);
    }
  }, [tenantId]);

  const searchProducts = async (q: string) => {
    setProductSearch(q);
    setShowProductCreateForm(false);
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
    if (billItems.some(i => i.product_id === product.product_id)) return;
    setBillItems(prev => [...prev, {
      product_id: product.product_id,
      name: product.name,
      quantity: '1',
      purchase_price: String(product.gst_purchase_price || product.purchase_price || 0),
    }]);
    setProductSearch('');
    setProducts([]);
  };

  const removeBillItem = (productId: string) => {
    setBillItems(prev => prev.filter(i => i.product_id !== productId));
  };

  const updateBillItem = (productId: string, field: 'quantity' | 'purchase_price', value: string) => {
    setBillItems(prev => prev.map(i => i.product_id === productId ? { ...i, [field]: value } : i));
  };

  const getBillTotal = () => {
    return billItems.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.purchase_price) || 0), 0);
  };

  const autoGenerateBarcode = () => {
    const prefix = newProductItemCode || '';
    const remaining = 12 - prefix.length;
    if (remaining > 0) {
      const min = Math.pow(10, Math.max(0, remaining - 1));
      const max = Math.pow(10, remaining) - 1;
      const rand = Math.floor(min + Math.random() * (max - min + 1)).toString();
      const barcode = prefix + rand;
      setNewProductBarcode(barcode.substring(0, 12));
    } else {
      setNewProductBarcode(prefix.substring(0, 12));
    }
  };

  const resetProductForm = () => {
    setShowProductCreateForm(false);
    setNewProductName('');
    setNewProductItemCode('');
    setNewProductBarcode('');
    setNewProductBrand('');
    setNewProductCategory('');
    setNewProductUom('Pcs');
    setNewProductPurchasePrice('');
    setNewProductBasePrice('');
    setNewProductStock('');
    setNewProductReorderLevel('');
    setNewProductHsn('');
    setNewProductTaxRate(0);
    setNewProductDiscountPercent('');
    setNewProductDiscountFlat('');
    setNewProductOfferPrice('');
  };

  const handleCreateAndAddProduct = async () => {
    if (!window.electronAPI || !tenantId || !newProductName.trim()) return;
    const productId = uuidv4();
    const finalBarcode = newProductBarcode || `${newProductItemCode || 'NEW'}${Math.floor(Math.random() * 100000)}`;
    const purchasePrice = Number(newProductPurchasePrice) || 0;
    const basePrice = Number(newProductBasePrice) || purchasePrice;
    const res = await window.electronAPI.dbAddProduct({
      product_id: productId,
      tenant_id: tenantId,
      name: newProductName.trim(),
      sku_barcode: finalBarcode,
      item_code: newProductItemCode.toUpperCase(),
      category: newProductCategory,
      brand_manufacturer: newProductBrand,
      uom: newProductUom,
      purchase_price: purchasePrice,
      base_price: basePrice,
      current_stock: Number(newProductStock) || 0,
      reorder_level: Number(newProductReorderLevel) || 0,
      is_gst_applicable: type === 'GST' ? 1 : 0,
      tax_rate_percent: type === 'GST' ? newProductTaxRate : 0,
      hsn_sac_code: type === 'GST' ? newProductHsn : null,
      discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
      discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
      offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
      billing_type: 'PIECE',
      pricing_mode: 'FIXED_PRICE',
      is_deleted: 0,
      sync_status: 'PENDING',
    });
    if (res.success) {
      setBillItems(prev => [...prev, {
        product_id: productId,
        name: newProductName.trim(),
        quantity: '1',
        purchase_price: String(purchasePrice),
      }]);
      setProductSearch('');
      setProducts([]);
      resetProductForm();
    } else {
      onStatusMessage({ text: 'Failed to create product: ' + (res.error || ''), type: 'error' });
      setTimeout(() => onStatusMessage(null), 3000);
    }
  };

  const handleSave = async () => {
    if (billItems.length === 0) {
      onStatusMessage({ text: 'Add at least one product to the bill.', type: 'error' });
      setTimeout(() => onStatusMessage(null), 3000);
      return;
    }
    if (!supplierName.trim()) {
      onStatusMessage({ text: 'Supplier name is required.', type: 'error' });
      setTimeout(() => onStatusMessage(null), 3000);
      return;
    }

    setIsSaving(true);
    const totalAmount = getBillTotal();
    const billId = uuidv4();

    if (window.electronAPI) {
      const res = await window.electronAPI.dbAddPurchaseBill({
        purchase_bill_id: billId,
        tenant_id: tenantId,
        bill_number: billNumber || `AUTO-${Date.now()}`,
        supplier_id: supplierId || null,
        supplier_name: supplierName.trim(),
        bill_date: billDate,
        notes: null,
        total_amount: totalAmount,
        bill_type: type,
        items: billItems.map(item => ({
          item_id: uuidv4(),
          product_id: item.product_id,
          name: item.name,
          quantity: Number(item.quantity) || 0,
          purchase_price: Number(item.purchase_price) || 0,
          total_amount: (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0),
          is_gst_applicable: type === 'GST' ? 1 : 0,
          tax_rate_percent: 0,
          hsn_sac_code: null,
        })),
      });

      if (res.success) {
        onStatusMessage({ text: `${type} purchase bill saved successfully!`, type: 'success' });
        onSaved();
      } else {
        onStatusMessage({ text: 'Save failed: ' + (res.error || ''), type: 'error' });
      }
    }
    setIsSaving(false);
    setTimeout(() => onStatusMessage(null), 3000);
  };

  const isEstimate = type === 'ESTIMATE';

  return (
    <section className={clsx(
      "border rounded-xl shadow-sm overflow-hidden",
      isEstimate ? "border-amber-500/30 bg-amber-500/[0.02]" : "border-emerald-500/30 bg-emerald-500/[0.02]"
    )}>
      {/* Section Header */}
      <div className={clsx(
        "flex items-center justify-between px-4 py-2.5 border-b",
        isEstimate ? "bg-amber-500/5 border-amber-500/20" : "bg-emerald-500/5 border-emerald-500/20"
      )}>
        <div className="flex items-center gap-2">
          <div className={clsx(
            "p-1.5 rounded-lg",
            isEstimate ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"
          )}>
            <FileText className="w-4 h-4" />
          </div>
          <span className={clsx(
            "text-xs font-black uppercase tracking-wider",
            isEstimate ? "text-amber-500" : "text-emerald-500"
          )}>
            {isEstimate ? 'Estimate Purchase' : 'GST Purchase'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-0.5">Bill No</label>
            <input
              type="text" value={billNumber}
              onChange={e => setBillNumber(e.target.value)}
              className="w-40 bg-background border border-border/80 rounded-lg px-2.5 py-1.5 text-sm font-mono tracking-wider text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving || billItems.length === 0}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs transition-all active:scale-95 cursor-pointer shadow-sm",
              isEstimate
                ? "bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white"
            )}
          >
            <Save className="w-3 h-3" />
            {isSaving ? 'Saving...' : `Save ${isEstimate ? 'Estimate' : 'GST'}`}
          </button>
        </div>
      </div>

      {/* Products Section */}
      <div className="p-4">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search products..."
            value={productSearch}
            onChange={e => searchProducts(e.target.value)}
            className="w-full bg-background border border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-lg py-2 pl-9 pr-3 text-sm font-medium text-foreground transition-all"
          />
          {products.length > 0 && !showProductCreateForm && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border/80 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
              {products.map(p => (
                <button
                  key={p.product_id} type="button"
                  onMouseDown={() => addProductToBill(p)}
                  className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 border-b border-border/40 last:border-0 hover:bg-muted transition-colors cursor-pointer"
                >
                  <Package className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{p.sku_barcode}</p>
                  </div>
                  <div className="text-right text-[11px] shrink-0">
                    <div className="font-semibold text-foreground">Stock: {Number(p.current_stock).toFixed(0)}</div>
                    <div className="text-muted-foreground">₹{Number(p.base_price).toFixed(2)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {productSearch.length >= 2 && products.length === 0 && !showProductCreateForm && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border/80 rounded-xl shadow-xl overflow-hidden">
              <button
                type="button"
                onMouseDown={() => { setShowProductCreateForm(true); setNewProductName(productSearch); }}
                className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-muted transition-colors cursor-pointer border-0"
              >
                <Plus className="w-3.5 h-3.5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-bold text-primary">Create "{productSearch}"</p>
                  <p className="text-[11px] text-muted-foreground">Add as a new product</p>
                </div>
              </button>
            </div>
          )}
          {showProductCreateForm && (
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 bg-black/40 z-[100]" onMouseDown={resetProductForm} />
              {/* Dialog */}
              <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
                <div className="w-full max-w-6xl bg-card border border-border/80 rounded-2xl shadow-2xl pointer-events-auto overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                        <Package className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-black text-primary uppercase tracking-wider">New Product</span>
                    </div>
                    <button type="button" onMouseDown={resetProductForm}
                      className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30"
                      title="Close">
                      <X className="w-4 h-4 text-destructive" />
                    </button>
                  </div>
                  <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4">
                    {/* 1. Basic Details */}
                    <section>
                      <div className="flex items-center gap-1.5 mb-2.5 pb-1.5 border-b border-border/40">
                        <div className="p-1 rounded-md bg-primary/10 text-primary">
                          <Package className="w-3 h-3" />
                        </div>
                        <span className="text-[10px] font-black text-primary uppercase tracking-wider">Basic Details</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">Product Name *</label>
                          <input type="text" value={newProductName} onChange={e => setNewProductName(e.target.value)}
                            className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none" autoFocus />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">Item Code</label>
                          <input type="text" maxLength={10} value={newProductItemCode} onChange={e => setNewProductItemCode(e.target.value.toUpperCase())}
                            className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none font-mono" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">Brand / Mfr</label>
                          <input type="text" value={newProductBrand} onChange={e => setNewProductBrand(e.target.value)}
                            className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none" />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">Category</label>
                          <input type="text" value={newProductCategory} onChange={e => setNewProductCategory(e.target.value)}
                            className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none" />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">Barcode</label>
                          <div className="flex gap-2">
                            <input type="text" value={newProductBarcode} onChange={e => setNewProductBarcode(e.target.value)}
                              className="flex-1 bg-background border border-border/80 rounded-lg p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none font-mono" />
                            <button type="button" onMouseDown={autoGenerateBarcode}
                              className="px-3 py-2 text-xs font-bold bg-muted hover:bg-muted/80 text-muted-foreground rounded-lg border border-border/60 transition-colors cursor-pointer shrink-0">
                              Auto
                            </button>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* 2. Inventory & Pricing */}
                    <section>
                      <div className="flex items-center gap-1.5 mb-2.5 pb-1.5 border-b border-border/40">
                        <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-500">
                          <FileText className="w-3 h-3" />
                        </div>
                        <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Inventory & Pricing</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">Purchase Price</label>
                          <input type="number" step="0.01" min="0" value={newProductPurchasePrice}
                            onChange={e => setNewProductPurchasePrice(e.target.value)}
                            className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">MRP</label>
                          <input type="number" step="0.01" min="0" value={newProductBasePrice}
                            onChange={e => setNewProductBasePrice(e.target.value)}
                            className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">UOM</label>
                          <select value={newProductUom} onChange={e => setNewProductUom(e.target.value)}
                            className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none">
                            <option value="Pcs">Pcs</option>
                            <option value="Kgs">Kgs</option>
                            <option value="Grams">Grams</option>
                            <option value="Mtrs">Mtrs</option>
                            <option value="Ltrs">Ltrs</option>
                            <option value="Box">Box</option>
                            <option value="Dozen">Dozen</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">Current Stock</label>
                          <input type="number" step="0.01" min="0" value={newProductStock}
                            onChange={e => setNewProductStock(e.target.value)}
                            className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners" />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">Low Stock Alert</label>
                          <input type="number" step="0.01" min="0" value={newProductReorderLevel}
                            onChange={e => setNewProductReorderLevel(e.target.value)}
                            className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners" />
                        </div>
                      </div>
                    </section>

                    {/* 3. Offer & Discount */}
                    <section>
                      <div className="flex items-center gap-1.5 mb-2.5 pb-1.5 border-b border-border/40">
                        <div className="p-1 rounded-md bg-amber-500/10 text-amber-500">
                          <FileText className="w-3 h-3" />
                        </div>
                        <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">Offer & Discount</span>
                      </div>
                      <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">Discount %</label>
                          <input type="number" step="0.01" min="0" max="100" value={newProductDiscountPercent}
                            onChange={e => setNewProductDiscountPercent(e.target.value)}
                            disabled={!!newProductOfferPrice}
                            className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners disabled:opacity-40" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">Flat Amt (₹)</label>
                          <input type="number" step="0.01" min="0" value={newProductDiscountFlat}
                            onChange={e => setNewProductDiscountFlat(e.target.value)}
                            disabled={!!newProductOfferPrice}
                            className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners disabled:opacity-40" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">Offer Price (₹)</label>
                          <input type="number" step="0.01" min="0" value={newProductOfferPrice}
                            onChange={e => setNewProductOfferPrice(e.target.value)}
                            disabled={!!newProductDiscountPercent || !!newProductDiscountFlat}
                            className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners disabled:opacity-40" />
                        </div>
                      </div>
                    </section>

                    {/* 4. Taxes & Config (GST only) */}
                    {type === 'GST' && (
                      <section>
                        <div className="flex items-center gap-1.5 mb-2.5 pb-1.5 border-b border-border/40">
                          <div className="p-1 rounded-md bg-violet-500/10 text-violet-500">
                            <FileText className="w-3 h-3" />
                          </div>
                          <span className="text-[10px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-wider">Taxes & Config</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">HSN / SAC Code</label>
                            <input type="text" value={newProductHsn} onChange={e => setNewProductHsn(e.target.value)}
                              className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none font-mono" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">Tax Rate %</label>
                            <select value={newProductTaxRate} onChange={e => setNewProductTaxRate(Number(e.target.value))}
                              className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none">
                              <option value={0}>0%</option>
                              <option value={5}>5%</option>
                              <option value={12}>12%</option>
                              <option value={18}>18%</option>
                              <option value={28}>28%</option>
                            </select>
                          </div>
                        </div>
                      </section>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/60 bg-muted/20">
                    <button type="button" onMouseDown={handleCreateAndAddProduct} disabled={!newProductName.trim()}
                      className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg transition-all cursor-pointer shadow-sm">
                      Add Product
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {billItems.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Package className="w-6 h-6 mx-auto mb-1.5 opacity-50" />
            <p className="text-xs font-medium">No products added yet</p>
            <p className="text-[11px] mt-0.5">Search and select products above</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_90px_110px_60px] gap-2 px-2.5 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <span>Product</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Price</span>
              <span className="text-right"></span>
            </div>
            {billItems.map(item => (
              <div key={item.product_id} className="grid grid-cols-[1fr_90px_110px_60px] gap-2 px-2.5 py-1.5 bg-card border border-border/60 rounded-lg items-center">
                <span className="text-xs font-medium text-foreground truncate">{item.name}</span>
                <input
                  type="number" step="0.01" min="0"
                  value={item.quantity}
                  onChange={e => updateBillItem(item.product_id, 'quantity', e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-md p-1 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners"
                />
                <input
                  type="number" step="0.01" min="0"
                  value={item.purchase_price}
                  onChange={e => updateBillItem(item.product_id, 'purchase_price', e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-md p-1 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners"
                />
                <button onClick={() => removeBillItem(item.product_id)} className="p-1 text-muted-foreground hover:text-destructive rounded-md transition-colors cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {billItems.length > 0 && (
          <div className="flex justify-end mt-3 pt-2.5 border-t border-border/60">
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total</span>
              <p className={clsx(
                "text-base font-black",
                isEstimate ? "text-amber-600" : "text-emerald-600"
              )}>₹{getBillTotal().toFixed(2)}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
