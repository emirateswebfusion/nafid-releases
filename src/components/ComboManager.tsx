import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { 
  Search, Plus, Trash2, Edit3, X, Check, Tag, Package, AlertCircle, 
  RefreshCw, Layers, ToggleLeft, ToggleRight, Sparkles, ShoppingBag, 
  Copy, Filter, Percent, CheckCircle2, Grid, List, Minus, 
  SlidersHorizontal, Zap, ArrowRight, BarChart2, Boxes
} from 'lucide-react';
import clsx from 'clsx';
import { Modal } from './ui/Modal';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';

interface ComboItem {
  combo_item_id?: string;
  product_id: string;
  quantity: number;
  product_name?: string;
  product_price?: number;
  product_stock?: number;
  sku_barcode?: string;
  uom?: string;
}

interface ComboOffer {
  combo_id: string;
  tenant_id: string;
  name: string;
  sku_barcode: string | null;
  combo_price: number;
  is_active: number;
  description: string | null;
  created_at?: string;
  items: ComboItem[];
}

interface Product {
  product_id: string;
  name: string;
  sku_barcode: string;
  item_code: string;
  base_price: number;
  current_stock: number;
  uom: string;
}

export function ComboManager({ onClose, isRestricted }: { onClose?: () => void; isRestricted?: boolean }) {
  if (onClose) {
    useCloseOnEscape(onClose);
  }
  const { tenantId, userName, role } = useAuthStore();

  const [combos, setCombos] = useState<ComboOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [viewLayout, setViewLayout] = useState<'grid' | 'table'>('grid');
  
  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState<ComboOffer | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    sku_barcode: '',
    combo_price: '',
    description: '',
    is_active: 1,
  });
  const [selectedItems, setSelectedItems] = useState<ComboItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedBarcode, setCopiedBarcode] = useState<string | null>(null);

  // Product Search state inside modal
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);

  // Auto-dismiss status toast
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  // Load combo offers
  const loadCombos = useCallback(async () => {
    if (!window.electronAPI || !tenantId) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.dbGetComboOffers({ tenant_id: tenantId, search: searchQuery });
      if (Array.isArray(res)) {
        setCombos(res);
      }
    } catch (err: any) {
      console.error('[ComboManager] Error loading combos:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, searchQuery]);

  useEffect(() => {
    loadCombos();
  }, [loadCombos]);

  // Product search inside combo editor modal
  useEffect(() => {
    if (!productSearch.trim() || !window.electronAPI || !tenantId) {
      setProductResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingProducts(true);
      try {
        const res = await window.electronAPI.dbGetProducts({
          tenant_id: tenantId,
          search: productSearch,
          limit: 12,
        });
        if (Array.isArray(res)) {
          setProductResults(res);
        }
      } catch (err) {
        console.error('[ComboManager] Product search error:', err);
      } finally {
        setSearchingProducts(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [productSearch, tenantId]);

  // Handle open add modal
  const handleOpenAdd = () => {
    setEditingCombo(null);
    setFormData({
      name: '',
      sku_barcode: `CMB-${Math.floor(100000 + Math.random() * 900000)}`,
      combo_price: '',
      description: '',
      is_active: 1,
    });
    setSelectedItems([]);
    setProductSearch('');
    setProductResults([]);
    setShowFormModal(true);
    setTimeout(() => productSearchRef.current?.focus(), 150);
  };

  // Handle open edit modal
  const handleOpenEdit = (combo: ComboOffer) => {
    setEditingCombo(combo);
    setFormData({
      name: combo.name,
      sku_barcode: combo.sku_barcode || '',
      combo_price: String(combo.combo_price),
      description: combo.description || '',
      is_active: combo.is_active,
    });
    setSelectedItems(combo.items.map(i => ({ ...i })));
    setProductSearch('');
    setProductResults([]);
    setShowFormModal(true);
  };

  // Auto generate barcode
  const handleGenerateBarcode = () => {
    setFormData(prev => ({
      ...prev,
      sku_barcode: `CMB-${Math.floor(100000 + Math.random() * 900000)}`,
    }));
  };

  // Add product to combo list
  const handleAddProductToCombo = (product: Product) => {
    const existingIndex = selectedItems.findIndex(i => i.product_id === product.product_id);
    if (existingIndex > -1) {
      const updated = [...selectedItems];
      updated[existingIndex].quantity += 1;
      setSelectedItems(updated);
    } else {
      setSelectedItems(prev => [
        ...prev,
        {
          product_id: product.product_id,
          quantity: 1,
          product_name: product.name,
          product_price: product.base_price,
          product_stock: product.current_stock,
          sku_barcode: product.sku_barcode,
          uom: product.uom,
        },
      ]);
    }
    setProductSearch('');
    setProductResults([]);
  };

  // Update item quantity in bundle
  const handleUpdateItemQty = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setSelectedItems(prev => prev.filter(i => i.product_id !== productId));
    } else {
      setSelectedItems(prev =>
        prev.map(i => i.product_id === productId ? { ...i, quantity } : i)
      );
    }
  };

  // Calculate market MRP total
  const calcStandaloneTotal = () => {
    return selectedItems.reduce((acc, item) => acc + (Number(item.product_price || 0) * item.quantity), 0);
  };

  // Handle Save Combo
  const handleSaveCombo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setStatusMessage({ text: 'Please enter a combo name', type: 'error' });
      return;
    }
    const comboPriceNum = parseFloat(formData.combo_price);
    if (isNaN(comboPriceNum) || comboPriceNum <= 0) {
      setStatusMessage({ text: 'Please enter a valid combo price', type: 'error' });
      return;
    }
    if (selectedItems.length === 0) {
      setStatusMessage({ text: 'Please add at least one product to the combo', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        combo_id: editingCombo ? editingCombo.combo_id : undefined,
        tenant_id: tenantId || 'global',
        name: formData.name.trim(),
        sku_barcode: formData.sku_barcode.trim() || null,
        combo_price: comboPriceNum,
        is_active: formData.is_active,
        description: formData.description.trim() || null,
        items: selectedItems.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
        })),
      };

      const res = await window.electronAPI.dbSaveComboOffer(payload);
      if (res.success) {
        setStatusMessage({ text: editingCombo ? 'Combo offer updated successfully!' : 'New combo offer created successfully!', type: 'success' });
        setShowFormModal(false);
        loadCombos();
      } else {
        setStatusMessage({ text: res.error || 'Failed to save combo offer', type: 'error' });
      }
    } catch (err: any) {
      console.error('[ComboManager] Error saving combo:', err);
      setStatusMessage({ text: err.message || 'Operation failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Toggle Active/Inactive
  const handleToggleActive = async (combo: ComboOffer) => {
    const nextState = combo.is_active ? 0 : 1;
    try {
      const res = await window.electronAPI.dbToggleComboOfferActive({ combo_id: combo.combo_id, tenant_id: tenantId || 'global', is_active: Boolean(nextState) });
      if (res.success) {
        setCombos(prev => prev.map(c => c.combo_id === combo.combo_id ? { ...c, is_active: nextState } : c));
        setStatusMessage({ text: `Combo "${combo.name}" ${nextState ? 'activated' : 'deactivated'}`, type: 'success' });
      }
    } catch (err) {
      console.error('[ComboManager] Error toggling active:', err);
    }
  };

  // Delete Combo
  const handleDeleteCombo = async (combo: ComboOffer) => {
    if (!confirm(`Are you sure you want to delete "${combo.name}"?`)) return;
    try {
      const res = await window.electronAPI.dbDeleteComboOffer({ combo_id: combo.combo_id, tenant_id: tenantId || 'global' });
      if (res.success) {
        setCombos(prev => prev.filter(c => c.combo_id !== combo.combo_id));
        setStatusMessage({ text: 'Combo offer deleted', type: 'success' });
      }
    } catch (err) {
      console.error('[ComboManager] Error deleting combo:', err);
    }
  };

  // Copy barcode helper
  const copyBarcodeToClipboard = (barcode: string) => {
    navigator.clipboard.writeText(barcode);
    setCopiedBarcode(barcode);
    setTimeout(() => setCopiedBarcode(null), 2000);
  };

  // Filtered combos based on tab & search
  const filteredCombos = useMemo(() => {
    return combos.filter(c => {
      if (activeFilter === 'ACTIVE' && !c.is_active) return false;
      if (activeFilter === 'INACTIVE' && c.is_active) return false;
      return true;
    });
  }, [combos, activeFilter]);

  // KPI Metrics
  const metrics = useMemo(() => {
    const total = combos.length;
    const active = combos.filter(c => c.is_active).length;
    const inactive = total - active;
    const totalItems = combos.reduce((acc, c) => acc + (c.items?.length || 0), 0);
    return { total, active, inactive, totalItems };
  }, [combos]);

  const standaloneTotal = calcStandaloneTotal();
  const comboPriceNum = parseFloat(formData.combo_price) || 0;
  const savingsAmount = Math.max(0, standaloneTotal - comboPriceNum);
  const savingsPct = standaloneTotal > 0 ? Math.round((savingsAmount / standaloneTotal) * 100) : 0;

  return (
    <div className={clsx(
      "flex flex-col h-full w-full bg-background text-foreground overflow-hidden font-sans select-none animate-in fade-in duration-200",
      !isRestricted && "fixed inset-0 z-50"
    )}>
      
      {/* ═══════════════════════════════════════════════════
          HEADER TOOLBAR
      ═══════════════════════════════════════════════════ */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-xs">
        <div className="max-w-7xl mx-auto w-full px-6 flex items-center justify-between py-3.5">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 shadow-inner shrink-0">
              <Boxes className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-foreground truncate tracking-tight">
                  Combo Offers & Bundles
                </h1>
              </div>
              <p className="text-xs text-muted-foreground font-medium leading-none mt-1 truncate">
                Bundle products at special discount prices with accurate constituent inventory deduction
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-md shadow-purple-500/20 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Combo Offer</span>
            </button>
            {!isRestricted && onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all duration-200 active:scale-95 cursor-pointer shadow-xs"
                title="Close"
              >
                <X className="w-4 h-4 text-destructive" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════
          MAIN CONTENT BODY
      ═══════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto max-w-7xl mx-auto w-full px-6 py-6 space-y-6">
        
        {/* Toast Status Banner */}
        {statusMessage && (
          <div className={clsx(
            "px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between border shadow-sm animate-in slide-in-from-top-2 duration-200",
            statusMessage.type === 'success' 
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" 
              : "bg-destructive/10 text-destructive border-destructive/30"
          )}>
            <span className="flex items-center gap-2">
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {statusMessage.text}
            </span>
            <button onClick={() => setStatusMessage(null)} className="p-1 hover:bg-black/10 rounded-lg transition-colors cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* KPI Summary Banner Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Combos</p>
              <h3 className="text-xl font-black text-foreground">{metrics.total}</h3>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active Offers</p>
              <h3 className="text-xl font-black text-emerald-600 dark:text-emerald-400">{metrics.active}</h3>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Bundled Items</p>
              <h3 className="text-xl font-black text-foreground">{metrics.totalItems}</h3>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Engine Status</p>
              <h3 className="text-xs font-black text-indigo-600 dark:text-indigo-400 mt-1">INVENTORY LINKED</h3>
            </div>
          </div>
        </div>

        {/* Action Controls & Search Toolbar */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card border border-border/80 p-4 rounded-2xl shadow-xs">
          
          {/* Search Input */}
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
            <input
              type="text"
              placeholder="Search combos by name or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 text-xs bg-background border border-border rounded-xl focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all font-semibold text-foreground placeholder:text-muted-foreground/40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Tabs & Layout Switcher */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            
            {/* Filter Tabs */}
            <div className="flex bg-muted/60 p-1 rounded-xl border border-border/60">
              {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveFilter(tab)}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer capitalize",
                    activeFilter === tab
                      ? "bg-card text-foreground shadow-xs border border-border/40 font-black"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.toLowerCase()}
                </button>
              ))}
            </div>

            {/* Layout Toggle */}
            <div className="flex bg-muted/60 p-1 rounded-xl border border-border/60">
              <button
                onClick={() => setViewLayout('grid')}
                className={clsx(
                  "p-1.5 rounded-lg transition-all cursor-pointer",
                  viewLayout === 'grid' ? "bg-card text-purple-600 shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
                title="Grid View"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewLayout('table')}
                className={clsx(
                  "p-1.5 rounded-lg transition-all cursor-pointer",
                  viewLayout === 'table' ? "bg-card text-purple-600 shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
                title="Table View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════
            COMBOS PRESENTATION (GRID / TABLE)
        ═══════════════════════════════════════════════════ */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-purple-600" />
            <p className="text-xs font-bold uppercase tracking-wider">Loading Combo Offers...</p>
          </div>
        ) : filteredCombos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-border rounded-3xl bg-card p-8 space-y-4">
            <div className="p-4 rounded-2xl bg-purple-500/10 text-purple-600">
              <ShoppingBag className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-foreground">No Combo Offers Found</h3>
              <p className="text-xs text-muted-foreground max-w-md mt-1">
                Bundle two or more products together at a special price or offer BOGO deals. Each constituent product will automatically deduct from inventory upon sale.
              </p>
            </div>
            <button
              onClick={handleOpenAdd}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-md shadow-purple-500/20 cursor-pointer"
            >
              Create Your First Combo Offer
            </button>
          </div>
        ) : viewLayout === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredCombos.map((combo) => {
              const totalRegular = combo.items.reduce((s, i) => s + ((Number(i.product_price) || 0) * (Number(i.quantity) || 1)), 0);
              const savings = Math.max(0, totalRegular - combo.combo_price);
              const discountPct = totalRegular > 0 ? Math.round((savings / totalRegular) * 100) : 0;

              return (
                <div
                  key={combo.combo_id}
                  className={clsx(
                    "group relative bg-card border rounded-3xl p-5 shadow-xs transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 flex flex-col justify-between overflow-hidden",
                    combo.is_active
                      ? "border-purple-500/30 hover:border-purple-500/60"
                      : "border-border/60 opacity-60 hover:opacity-100"
                  )}
                >
                  {/* Subtle Card Background Accent */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-purple-500/10 transition-all" />

                  <div>
                    {/* Top Row: Badge & Active Toggle */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[9px] uppercase font-black tracking-wider px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                            <Sparkles className="w-3 h-3" /> COMBO OFFER
                          </span>
                          {!combo.is_active && (
                            <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                              INACTIVE
                            </span>
                          )}
                        </div>
                        <h4 className="text-base font-extrabold text-foreground leading-snug mt-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                          {combo.name}
                        </h4>
                      </div>

                      <button
                        onClick={() => handleToggleActive(combo)}
                        title={combo.is_active ? 'Active - Click to Deactivate' : 'Inactive - Click to Activate'}
                        className={clsx(
                          "p-1.5 rounded-xl transition-colors cursor-pointer shrink-0",
                          combo.is_active
                            ? "text-emerald-500 hover:bg-emerald-500/10"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {combo.is_active ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                      </button>
                    </div>

                    {/* Barcode & Description */}
                    {combo.sku_barcode && (
                      <div className="flex items-center gap-1.5 mb-3">
                        <span className="font-mono bg-muted/60 px-2 py-0.5 rounded-md text-[10px] text-muted-foreground border border-border/40">
                          {combo.sku_barcode}
                        </span>
                        <button
                          onClick={() => copyBarcodeToClipboard(combo.sku_barcode!)}
                          className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
                          title="Copy Barcode"
                        >
                          {copiedBarcode === combo.sku_barcode ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    )}

                    {combo.description && (
                      <p className="text-xs text-muted-foreground italic mb-4 line-clamp-2">
                        "{combo.description}"
                      </p>
                    )}

                    {/* Bundled Products Sub-box */}
                    <div className="bg-muted/40 rounded-2xl p-3.5 mb-4 border border-border/60 space-y-2">
                      <div className="text-[10px] font-black text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                        <span>Included Items ({combo.items?.length || 0})</span>
                        <span>Quantity</span>
                      </div>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {combo.items?.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs text-foreground">
                            <span className="truncate pr-2 font-semibold flex items-center gap-1.5">
                              <Package className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                              {item.product_name || 'Product'}
                            </span>
                            <span className="font-extrabold text-purple-600 dark:text-purple-400 shrink-0 bg-purple-500/10 px-2 py-0.5 rounded-lg text-[11px] border border-purple-500/20">
                              x{item.quantity} {item.uom || 'Pcs'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Price Summary Footer */}
                  <div className="pt-3 border-t border-border/60">
                    <div className="flex items-baseline justify-between mb-3">
                      <div>
                        {totalRegular > combo.combo_price && (
                          <div className="text-[10px] text-muted-foreground/60 line-through font-bold">
                            MRP: ₹{totalRegular.toFixed(2)}
                          </div>
                        )}
                        <div className="text-xl font-black text-foreground">
                          ₹{combo.combo_price.toFixed(2)}
                        </div>
                      </div>

                      {discountPct > 0 && (
                        <div className="text-right">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs rounded-xl border border-emerald-500/20">
                            <Percent className="w-3 h-3" /> SAVE {discountPct}% (₹{savings.toFixed(2)})
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEdit(combo)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-xl transition-all cursor-pointer active:scale-95"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Combo</span>
                      </button>
                      <button
                        onClick={() => handleDeleteCombo(combo)}
                        className="p-2 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-xl transition-all cursor-pointer active:scale-95"
                        title="Delete Combo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table Layout View */
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Combo Name</th>
                  <th className="px-4 py-3">Barcode</th>
                  <th className="px-4 py-3">Bundled Products</th>
                  <th className="px-4 py-3 text-right">Combo Price</th>
                  <th className="px-4 py-3 text-right">Savings</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCombos.map((combo) => {
                  const totalRegular = combo.items.reduce((s, i) => s + ((Number(i.product_price) || 0) * (Number(i.quantity) || 1)), 0);
                  const savings = Math.max(0, totalRegular - combo.combo_price);
                  const discountPct = totalRegular > 0 ? Math.round((savings / totalRegular) * 100) : 0;

                  return (
                    <tr key={combo.combo_id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <button onClick={() => handleToggleActive(combo)} className="cursor-pointer">
                          {combo.is_active ? (
                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold rounded-md text-[10px] border border-emerald-500/20">Active</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-muted text-muted-foreground font-extrabold rounded-md text-[10px] border border-border">Inactive</span>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-bold text-foreground">
                        {combo.name}
                        {combo.description && <p className="text-[10px] text-muted-foreground font-normal italic truncate">{combo.description}</p>}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {combo.sku_barcode || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {combo.items?.map((item, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded text-[10px] font-semibold border border-purple-500/20">
                              {item.product_name} (x{item.quantity})
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-foreground">
                        ₹{combo.combo_price.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {discountPct > 0 ? `₹${savings.toFixed(2)} (${discountPct}%)` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => handleOpenEdit(combo)} className="p-1.5 hover:bg-primary/10 text-primary rounded-lg transition-colors cursor-pointer" title="Edit">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteCombo(combo)} className="p-1.5 hover:bg-destructive/10 text-destructive rounded-lg transition-colors cursor-pointer" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════
          CREATE / EDIT FORM MODAL
      ═══════════════════════════════════════════════════ */}
      {showFormModal && (
        <Modal
          isOpen={showFormModal}
          onClose={() => setShowFormModal(false)}
          title={editingCombo ? 'Edit Combo Offer' : 'Create New Combo Offer'}
          closeButton={
            <button
              type="button"
              onClick={() => setShowFormModal(false)}
              className="p-2 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center shadow-xs"
              title="Close"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          }
        >
          <form onSubmit={handleSaveCombo} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  Combo Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Breakfast Special Combo"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1 flex items-center justify-between">
                  <span>Combo Barcode / SKU</span>
                  <button
                    type="button"
                    onClick={handleGenerateBarcode}
                    className="text-[10px] text-purple-600 hover:text-purple-700 dark:text-purple-400 font-extrabold cursor-pointer"
                  >
                    Auto Generate
                  </button>
                </label>
                <input
                  type="text"
                  placeholder="e.g. CMB-10001"
                  value={formData.sku_barcode}
                  onChange={(e) => setFormData({ ...formData, sku_barcode: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                Offer Tagline / Description
              </label>
              <input
                type="text"
                placeholder="e.g. Buy 2 Tea Powders & Get 1 Sugar Free!"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
              />
            </div>

            {/* Product Selector */}
            <div className="border border-border/80 rounded-2xl p-4 bg-muted/30 space-y-3">
              <label className="block text-xs font-bold text-foreground">
                Bundled Products List *
              </label>

              {/* Product Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
                <input
                  ref={productSearchRef}
                  type="text"
                  placeholder="Search and select products to add to this combo..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-xl text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                />

                {/* Dropdown Results */}
                {productResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-border">
                    {productResults.map((prod) => (
                      <div
                        key={prod.product_id}
                        onClick={() => handleAddProductToCombo(prod)}
                        className="p-2.5 hover:bg-purple-500/10 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <span className="font-bold text-foreground">{prod.name}</span>
                          <span className="text-muted-foreground ml-2 font-mono text-[10px]">{prod.sku_barcode || prod.item_code}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground text-[10px]">Stock: {prod.current_stock}</span>
                          <span className="font-bold text-foreground">₹{prod.base_price}</span>
                          <Plus className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Products Table */}
              {selectedItems.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground italic bg-card rounded-xl border border-border">
                  No products added yet. Search above to add items to this combo bundle.
                </div>
              ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                  {selectedItems.map((item) => (
                    <div key={item.product_id} className="p-2.5 flex items-center justify-between text-xs">
                      <div className="flex-1 pr-2">
                        <div className="font-bold text-foreground">{item.product_name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          Unit MRP: ₹{item.product_price || 0}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center space-x-1.5 bg-muted/60 rounded-lg p-1 border border-border/60">
                          <span className="text-[10px] font-bold text-muted-foreground px-1">Qty:</span>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleUpdateItemQty(item.product_id, parseInt(e.target.value) || 0)}
                            className="w-14 px-1.5 py-0.5 bg-background border border-border rounded text-center text-xs font-black text-foreground"
                          />
                        </div>

                        <span className="font-extrabold text-foreground w-20 text-right">
                          ₹{((item.product_price || 0) * item.quantity).toFixed(2)}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleUpdateItemQty(item.product_id, 0)}
                          className="text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Combo Pricing & Real-time Savings Calculator */}
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-purple-700 dark:text-purple-300 mb-1">
                    Special Combo Selling Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 150.00"
                    value={formData.combo_price}
                    onChange={(e) => setFormData({ ...formData, combo_price: e.target.value })}
                    className="w-48 px-3 py-2 bg-background border border-purple-500/40 rounded-xl text-lg font-black text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="text-right">
                  <div className="text-xs text-muted-foreground font-semibold">Regular Items Total:</div>
                  <div className="text-base font-bold text-muted-foreground line-through">
                    ₹{standaloneTotal.toFixed(2)}
                  </div>
                </div>
              </div>

              {standaloneTotal > 0 && comboPriceNum > 0 && (
                <div className="flex items-center justify-between border-t border-purple-500/20 pt-2 text-xs">
                  <span className="font-bold text-purple-600 dark:text-purple-300 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    Customer Savings:
                  </span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400">
                    ₹{savingsAmount.toFixed(2)} ({savingsPct}% OFF)
                  </span>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-extrabold rounded-xl transition shadow-md shadow-purple-500/20 cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingCombo ? 'Update Combo Offer' : 'Save Combo Offer'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
