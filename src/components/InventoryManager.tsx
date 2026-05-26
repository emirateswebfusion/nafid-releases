import { useState, useEffect } from 'react';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { PackagePlus, Pencil, Save, Printer, RefreshCw, Search, Plus, Minus, Trash2, AlertTriangle } from 'lucide-react';
import Barcode from 'react-barcode';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { Modal } from './ui/Modal';

// ─── Types ─────────────────────────────────────────────────────────────────
interface Product {
  product_id: string;
  tenant_id: string;
  name: string;
  sku_barcode: string;
  category: string;
  brand_manufacturer: string;
  uom: string;
  purchase_price: number;
  base_price: number;
  current_stock: number;
  reorder_level: number;
  is_gst_applicable: number;
  hsn_sac_code: string;
  tax_rate_percent: number;
  domain_attributes: string; // JSON string from SQLite
  sync_status: string;
}

const DEFAULT_FORM = {
  sku_barcode: '',
  name: '',
  category: '',
  brand_manufacturer: '',
  uom: 'Pcs',
  purchase_price: 0,
  base_price: 0,
  current_stock: 0,
  reorder_level: 0,
  is_gst_applicable: true,
  hsn_sac_code: '',
  tax_rate_percent: 0,
  domain_attributes: {} as Record<string, any>,
};

// ─── Main Component ─────────────────────────────────────────────────────────
export function InventoryManager({ onClose }: { onClose: () => void }) {
  const { shopDomain } = useCartStore();
  const { tenantId } = useAuthStore();

  // View state: 'list' | 'add' | 'edit'
  const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [printQuantity, setPrintQuantity] = useState(1);

  // Load products on mount
  useEffect(() => {
    loadProducts();

    if (window.electronAPI) {
      window.electronAPI.onSyncDataUpdated(() => {
        console.log('[InventoryManager] Data updated via sync. Refreshing list...');
        loadProducts();
      });
    }
  }, []);

  const loadProducts = async () => {
    if (window.electronAPI) {
      const { tenantId } = useAuthStore.getState();
      const result = await window.electronAPI.dbGetProducts(tenantId || '');
      if (Array.isArray(result)) setProducts(result);
    }
  };

  const openAdd = () => {
    setFormData({ ...DEFAULT_FORM });
    setEditingProduct(null);
    setView('add');
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      sku_barcode: product.sku_barcode || '',
      name: product.name,
      category: product.category || '',
      brand_manufacturer: product.brand_manufacturer || '',
      uom: product.uom || 'Pcs',
      purchase_price: product.purchase_price || 0,
      base_price: product.base_price,
      current_stock: product.current_stock,
      reorder_level: product.reorder_level,
      is_gst_applicable: product.is_gst_applicable === 1,
      hsn_sac_code: product.hsn_sac_code || '',
      tax_rate_percent: product.tax_rate_percent || 0,
      domain_attributes: (() => {
        try { return JSON.parse(product.domain_attributes || '{}'); } catch { return {}; }
      })(),
    });
    setView('edit');
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    if (window.electronAPI) {
      const res = await window.electronAPI.dbDeleteProduct(product.product_id);
      if (res.success) { await loadProducts(); }
      else alert('Delete failed: ' + res.error);
    }
  };

  const handleAdjustStock = async (product: Product, delta: number) => {
    if (window.electronAPI) {
      const res = await window.electronAPI.dbAdjustStock({ product_id: product.product_id, delta });
      if (res.success) await loadProducts();
    }
  };

  const handleInputChange = (field: string, value: any) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const handleDomainAttrChange = (field: string, value: any) =>
    setFormData(prev => ({
      ...prev,
      domain_attributes: { ...prev.domain_attributes, [field]: value }
    }));

  const generateBarcode = () => {
    const code = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    handleInputChange('sku_barcode', code);
  };

  const printBarcode = async () => {
    if (!formData.sku_barcode) return;
    setStatusMessage({ text: 'Connecting to printer...', type: 'success' });
    
    if (window.electronAPI) {
      // Fallback for hot-reloading without electron restart
      localStorage.setItem('printBarcodePrice', formData.base_price.toString());
      localStorage.setItem('printBarcodeName', formData.name);
      const res = await window.electronAPI.printBarcode(tenantId || 'global', formData.sku_barcode, formData.base_price, formData.name, printQuantity);
      if (res.success) {
        setStatusMessage({ text: `Barcode printed successfully (${printQuantity} label${printQuantity > 1 ? 's' : ''})!`, type: 'success' });
      } else {
        setStatusMessage({ text: `Print Failed: ${res.error || 'Printer not connected'}`, type: 'error' });
      }
      
      // Clear message after 3 seconds
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      alert('Print command dispatched (mock)');
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.sku_barcode || formData.base_price <= 0) {
      alert('Please fill in Name, Barcode, and a valid Selling Price.');
      return;
    }
    setLoading(true);

    const payload = {
      ...(editingProduct ?? { product_id: uuidv4(), tenant_id: tenantId || 'unset' }),
      ...formData,
      is_gst_applicable: formData.is_gst_applicable ? 1 : 0,
    };

    if (window.electronAPI) {
      const res = view === 'edit'
        ? await window.electronAPI.dbUpdateProduct(payload)
        : await window.electronAPI.dbAddProduct(payload);

      if (res.success) {
        await loadProducts();
        setView('list');
      } else {
        alert('Failed to save: ' + res.error);
      }
    }
    setLoading(false);
  };

  // ── Filtered list ────────────────────────────────────────────────────────
  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.sku_barcode || '').includes(searchQuery) ||
    (p.category || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      fullScreen={true}
      title={
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            {view === 'list' ? <Search className="w-6 h-6" /> : view === 'add' ? <PackagePlus className="w-6 h-6" /> : <Pencil className="w-6 h-6" />}
          </div>
          <div>
            <h2 className="text-2xl font-bold">
              {view === 'list' ? 'Inventory' : view === 'add' ? 'Add New Product' : `Edit: ${editingProduct?.name}`}
            </h2>
            {view === 'list' && <p className="text-muted-foreground text-sm font-normal">{products.length} items in stock</p>}
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-full overflow-hidden -mx-6 -my-6">
        
        {/* Action Header inside modal */}
        <div className="flex justify-between items-center p-4 border-b border-border bg-muted/10 shrink-0">
          <div className="flex-1 max-w-md">
            {view === 'list' && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name, barcode, or category..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg py-2.5 pl-10 pr-4 text-foreground focus:border-primary focus:outline-none placeholder:text-muted-foreground"
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {view !== 'list' && (
              <button onClick={() => setView('list')} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                ← Back to List
              </button>
            )}
            {view === 'list' && (
              <button onClick={openAdd} className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-bold flex items-center gap-2 transition-colors">
                <Plus className="w-4 h-4" /> Add Product
              </button>
            )}
          </div>
        </div>

        {/* ── PRODUCT LIST VIEW ────────────────────────────────────────────── */}
        {view === 'list' && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border shrink-0 bg-muted/5">
              <div className="col-span-4">Product</div>
              <div className="col-span-1 text-center">UOM</div>
              <div className="col-span-2 text-right">Purchase</div>
              <div className="col-span-2 text-right">Selling</div>
              <div className="col-span-2 text-center">Stock</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
                  <PackagePlus className="w-12 h-12 mb-3" />
                  <p className="font-medium text-foreground">No products found</p>
                  <p className="text-sm mt-1">Click "Add Product" to seed your inventory</p>
                </div>
              ) : filtered.map(p => {
                const isLowStock = p.current_stock <= p.reorder_level && p.reorder_level > 0;
                return (
                  <div key={p.product_id} className="grid grid-cols-12 gap-2 px-6 py-4 items-center hover:bg-muted/30 transition-colors">
                    <div className="col-span-4">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-foreground font-semibold text-sm">{p.name}</p>
                          <p className="text-muted-foreground text-xs font-mono mt-0.5">{p.sku_barcode}</p>
                          <div className="flex gap-2 mt-1">
                            {p.category && <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded font-medium">{p.category}</span>}
                            {p.brand_manufacturer && <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded font-medium">{p.brand_manufacturer}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-1 text-center text-muted-foreground text-sm font-medium">{p.uom}</div>
                    <div className="col-span-2 text-right text-muted-foreground text-sm font-medium">₹{Number(p.purchase_price).toFixed(2)}</div>
                    <div className="col-span-2 text-right text-primary font-bold text-sm">₹{Number(p.base_price).toFixed(2)}</div>

                    {/* Stock with +/- */}
                    <div className="col-span-2 flex items-center justify-center gap-2">
                      <button onClick={() => handleAdjustStock(p, -1)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className={clsx('text-sm font-bold w-12 text-center', isLowStock ? 'text-amber-500' : 'text-foreground')}>
                        {Number(p.current_stock).toFixed(0)}
                        {isLowStock && <AlertTriangle className="inline w-3 h-3 ml-1 text-amber-500" />}
                      </span>
                      <button onClick={() => handleAdjustStock(p, 1)} className="p-1 text-muted-foreground hover:text-emerald-500 transition-colors">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="col-span-1 flex items-center justify-center gap-2">
                      <button onClick={() => openEdit(p)} className="p-2 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(p)} className="p-2 text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Low Stock summary bar */}
            {products.some(p => p.current_stock <= p.reorder_level && p.reorder_level > 0) && (
              <div className="shrink-0 border-t border-amber-500/30 bg-amber-500/10 px-6 py-3 flex items-center gap-2 text-amber-600 text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-semibold">{products.filter(p => p.current_stock <= p.reorder_level && p.reorder_level > 0).length} item(s) are at or below reorder level</span>
              </div>
            )}
          </div>
        )}

        {/* ── ADD / EDIT FORM VIEW ─────────────────────────────────────────── */}
        {(view === 'add' || view === 'edit') && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            <div className="flex-1 overflow-y-auto p-8 space-y-10 max-w-5xl mx-auto w-full">

              {/* Section 1: Core */}
              <section>
                <h3 className="text-lg font-bold text-primary mb-4 border-b border-border pb-2">1. Core Identifiers</h3>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Item Name *</label>
                      <input type="text" value={formData.name} onChange={e => handleInputChange('name', e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Category</label>
                        <input type="text" value={formData.category} onChange={e => handleInputChange('category', e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Brand / Mfg</label>
                        <input type="text" value={formData.brand_manufacturer} onChange={e => handleInputChange('brand_manufacturer', e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm" />
                      </div>
                    </div>
                  </div>

                  {/* Barcode Panel */}
                  <div className="bg-muted/30 p-5 rounded-2xl border border-border flex flex-col justify-center">
                    <div className="flex justify-between items-center mb-3">
                      <label className="text-sm font-semibold text-muted-foreground">Barcode *</label>
                      <button onClick={generateBarcode} className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-md transition-colors">
                        <RefreshCw className="w-3 h-3" /> Auto Generate
                      </button>
                    </div>
                    <input type="text" value={formData.sku_barcode} onChange={e => handleInputChange('sku_barcode', e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none font-mono tracking-widest mb-4 shadow-sm" />
                    {formData.sku_barcode && (
                      <div className="flex flex-col items-center p-4 bg-white rounded-xl border border-border shadow-sm">
                        <Barcode value={formData.sku_barcode} height={50} displayValue={true} background="#ffffff" />
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Section 2: Inventory & Pricing */}
              <section>
                <h3 className="text-lg font-bold text-emerald-500 mb-4 border-b border-border pb-2">2. Inventory & Pricing</h3>
                <div className="grid grid-cols-5 gap-5">
                  {[
                    { label: 'Purchase Price', field: 'purchase_price', prefix: '₹' },
                    { label: 'Selling Price *', field: 'base_price', prefix: '₹' },
                    { label: 'Current Stock', field: 'current_stock' },
                    { label: 'Reorder Level', field: 'reorder_level' },
                  ].map(({ label, field, prefix }) => (
                    <div key={field}>
                      <label className="block text-sm font-semibold text-muted-foreground mb-1.5">{label}</label>
                      <div className="relative">
                        {prefix && <span className="absolute left-3 top-3 text-muted-foreground font-medium">{prefix}</span>}
                        <input
                          type="number" step="0.01"
                          value={(formData as any)[field]}
                          onChange={e => handleInputChange(field, parseFloat(e.target.value) || 0)}
                          className={clsx('w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm', prefix && 'pl-8', field === 'base_price' && 'text-emerald-600 dark:text-emerald-400 font-bold')}
                        />
                      </div>
                    </div>
                  ))}
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">UOM</label>
                    <select value={formData.uom} onChange={e => handleInputChange('uom', e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm appearance-none">
                      {['Pcs', 'Kgs', 'Grams', 'Mtrs', 'Ltrs', 'Box', 'Dozen'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {/* Section 3: Statutory */}
              <section>
                <h3 className="text-lg font-bold text-purple-500 mb-4 border-b border-border pb-2">3. Statutory & Tax</h3>
                <div className="grid grid-cols-3 gap-6">
                  <div className="flex items-center gap-3 bg-muted/30 border border-border p-4 rounded-xl">
                    <input type="checkbox" id="gst" checked={formData.is_gst_applicable} onChange={e => handleInputChange('is_gst_applicable', e.target.checked)} className="w-5 h-5 accent-primary rounded cursor-pointer" />
                    <label htmlFor="gst" className="text-foreground font-semibold cursor-pointer select-none">Is GST Applicable?</label>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">HSN / SAC Code</label>
                    <input type="text" value={formData.hsn_sac_code} onChange={e => handleInputChange('hsn_sac_code', e.target.value)} disabled={!formData.is_gst_applicable} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-50 transition-all shadow-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Tax Rate %</label>
                    <select value={formData.tax_rate_percent} onChange={e => handleInputChange('tax_rate_percent', parseFloat(e.target.value))} disabled={!formData.is_gst_applicable} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-50 transition-all shadow-sm appearance-none">
                      {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {/* Section 4: Domain Attributes */}
              <section>
                <h3 className="text-lg font-bold text-amber-500 mb-4 border-b border-border pb-2">4. Domain Fields — {shopDomain}</h3>
                <div className="grid grid-cols-2 gap-5 bg-amber-500/5 p-6 rounded-2xl border border-amber-500/20">
                  {shopDomain === 'HARDWARE' && (<>
                    <DomainField label="Dimensions (L×W×H)" value={formData.domain_attributes['dimensions'] || ''} onChange={v => handleDomainAttrChange('dimensions', v)} />
                    <DomainField label="Material" value={formData.domain_attributes['material'] || ''} onChange={v => handleDomainAttrChange('material', v)} />
                    <DomainField label="Batch Number" value={formData.domain_attributes['batch_number'] || ''} onChange={v => handleDomainAttrChange('batch_number', v)} />
                    <DomainField label="Expiry Date" type="date" value={formData.domain_attributes['expiry_date'] || ''} onChange={v => handleDomainAttrChange('expiry_date', v)} />
                  </>)}
                  {shopDomain === 'JEWELRY' && (<>
                    <DomainField label="Purity (e.g. 22K)" value={formData.domain_attributes['purity'] || ''} onChange={v => handleDomainAttrChange('purity', v)} />
                    <DomainField label="Weight (Grams)" type="number" value={formData.domain_attributes['weight_grams'] || ''} onChange={v => handleDomainAttrChange('weight_grams', v)} />
                    <DomainField label="Making Charge %" type="number" value={formData.domain_attributes['making_charge_pct'] || ''} onChange={v => handleDomainAttrChange('making_charge_pct', v)} />
                    <DomainField label="Hallmark HUID" value={formData.domain_attributes['hallmark_huid'] || ''} onChange={v => handleDomainAttrChange('hallmark_huid', v)} />
                  </>)}
                  {shopDomain === 'GENERAL' && (
                    <div className="col-span-2 text-muted-foreground text-sm font-medium text-center py-6">
                      No domain-specific attributes required for General Retail.
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-border bg-card flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <button onClick={() => setView('list')} className="px-5 py-2.5 text-muted-foreground font-semibold hover:text-foreground transition-colors">
                  Cancel
                </button>
                {statusMessage && (
                  <div className={clsx(
                    "px-4 py-2.5 rounded-xl text-sm font-bold text-center animate-pulse border",
                    statusMessage.type === 'success' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"
                  )}>
                    {statusMessage.text}
                  </div>
                )}
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 bg-muted rounded-xl p-1 px-3 border border-border">
                  <span className="text-muted-foreground text-sm font-semibold">Qty:</span>
                  <input 
                    type="number" 
                    min="1" 
                    value={printQuantity} 
                    onChange={e => setPrintQuantity(Math.max(1, parseInt(e.target.value) || 1))} 
                    className="w-12 bg-transparent text-foreground focus:outline-none text-center font-bold" 
                  />
                </div>
                <button onClick={printBarcode} className="px-6 py-3 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-xl font-bold flex items-center gap-2 transition-all shadow-sm">
                  <Printer className="w-5 h-5" />
                  Print Label
                </button>
                <button onClick={handleSave} disabled={loading} className="px-8 py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold flex items-center gap-2 shadow-sm transition-all">
                  <Save className="w-5 h-5" />
                  {loading ? 'Saving...' : view === 'edit' ? 'Update Product' : 'Add to Inventory'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Helper sub-component ────────────────────────────────────────────────────
function DomainField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-muted-foreground mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition-all shadow-sm" />
    </div>
  );
}
