import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Trash, Pencil, Check, X, Loader2, ArrowLeft,
  Tags, ChevronUp, ChevronDown, Shield, Grid3X3, Save, Search
} from 'lucide-react';
import { Button } from './ui/Button';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';

interface PricingTier {
  pricing_tier_id: string;
  tenant_id: string;
  name: string;
  is_active: number | boolean;
  sort_order: number;
}

interface ProductRow {
  product_id: string;
  name: string;
  base_price: number;
  tier_price: number | null;
}

export function SettingsPricingTiers({ onClose }: { onClose?: () => void }) {
  useCloseOnEscape(onClose);
  const { tenantId, role } = useAuthStore();
  const isOwner = role === 'OWNER';

  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const [selectedTier, setSelectedTier] = useState<PricingTier | null>(null);
  const [tierPrices, setTierPrices] = useState<Record<string, string>>({});
  const [priceSearch, setPriceSearch] = useState('');
  const [pricingMap, setPricingMap] = useState<Record<string, Record<string, number>>>({});

  const [allowBillerOverride, setAllowBillerOverride] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
    const tid = tenantId || '';
    const [tierRes, productRes, pricingRes, overrideRes] = await Promise.all([
      window.electronAPI.dbGetPricingTiers(tid),
      window.electronAPI.dbGetProducts({ tenant_id: tid, include_inactive: true }),
      window.electronAPI.dbGetProductPricing ? window.electronAPI.dbGetProductPricing(tid) : Promise.resolve([]),
      window.electronAPI.settingsGet({ tenant_id: tid || 'global', key: 'allow_biller_price_override' }),
    ]);
    if (Array.isArray(tierRes)) setTiers(tierRes);
    if (Array.isArray(productRes)) setProducts(productRes);
    if (Array.isArray(pricingRes)) {
      const map: Record<string, Record<string, number>> = {};
      for (const row of pricingRes) {
        if (!map[row.product_id]) map[row.product_id] = {};
        map[row.product_id][row.pricing_tier_id] = Number(row.price) || 0;
      }
      setPricingMap(map);
    }
    setAllowBillerOverride(overrideRes === null || overrideRes === undefined ? true : !!overrideRes);
    } catch (e) {
      console.error('[SettingsPricingTiers] load failed', e);
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      setError('Please enter a pricing tier name.');
      return;
    }
    setError(null);
    setOperating(true);
    const res = await window.electronAPI.dbAddPricingTier({
      pricing_tier_id: crypto.randomUUID(),
      tenant_id: tenantId || '',
      name: newName.trim(),
      is_active: true,
      sort_order: null,
    });
    if (res.success) {
      setNewName('');
      await loadData();
    } else {
      setError(res.error || 'Failed to add pricing tier');
    }
    setOperating(false);
  };

  const handleRename = async (tier: PricingTier) => {
    if (!editName.trim()) return;
    const res = await window.electronAPI.dbUpdatePricingTier({ ...tier, name: editName.trim() });
    if (res.success) {
      setEditingId(null);
      await loadData();
    } else {
      setError(res.error || 'Failed to update pricing tier');
    }
  };

  const toggleActive = async (tier: PricingTier) => {
    const res = await window.electronAPI.dbUpdatePricingTier({ ...tier, is_active: !tier.is_active });
    if (res.success) await loadData();
  };

  const handleDelete = async (tierId: string) => {
    const res = await window.electronAPI.dbDeletePricingTier(tierId);
    if (res.success) {
      setConfirmDeleteId(null);
      await loadData();
    }
  };

  const moveTier = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= tiers.length) return;
    const reordered = [...tiers];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    const payload = reordered.map((t, i) => ({ pricing_tier_id: t.pricing_tier_id, sort_order: i }));
    const res = await window.electronAPI.dbReorderPricingTiers(payload);
    if (res.success) {
      setTiers(reordered.map((t, i) => ({ ...t, sort_order: i })));
    }
  };

  const toggleOverride = async (value: boolean) => {
    setAllowBillerOverride(value);
    await window.electronAPI.settingsSet({
      tenant_id: tenantId || 'global',
      key: 'allow_biller_price_override',
      value,
    });
  };

  // ── Price grid for a single tier ──────────────────────────────────────────
  const openGrid = (tier: PricingTier) => {
    setSelectedTier(tier);
    const map: Record<string, string> = {};
    for (const p of products) {
      const price = pricingMap[p.product_id]?.[tier.pricing_tier_id];
      map[p.product_id] = price === undefined || price === null ? '' : String(price);
    }
    setTierPrices(map);
    setPriceSearch('');
  };

  const filteredProducts = useMemo(() => {
    if (!selectedTier) return [];
    const q = priceSearch.toLowerCase();
    return products
      .filter((p: any) => !p.is_deleted)
      .filter((p: any) => p.name.toLowerCase().includes(q) || (p.sku_barcode || '').toLowerCase().includes(q))
      .slice(0, 200);
  }, [products, selectedTier, priceSearch]);

  const saveGrid = async () => {
    if (!selectedTier) return;
    setOperating(true);
    const pricing = products
      .filter((p: any) => !p.is_deleted)
      .map((p: any) => ({
        product_id: p.product_id,
        price: tierPrices[p.product_id] === '' ? null : Number(tierPrices[p.product_id]),
      }));
    const res = await window.electronAPI.dbSetTierPricing({
      tenant_id: tenantId || '',
      pricing_tier_id: selectedTier.pricing_tier_id,
      pricing,
    });
    if (res.success) {
      await loadData();
    } else {
      setError(res.error || 'Failed to save prices');
    }
    setOperating(false);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background animate-in fade-in duration-200 overflow-hidden">
      {/* Top Bar Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 px-6 py-4 border-b border-border bg-card/90 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3.5">
          {selectedTier ? (
            <button
              type="button"
              onClick={() => setSelectedTier(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-muted hover:bg-muted/80 text-foreground rounded-xl transition-all cursor-pointer shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Tiers
            </button>
          ) : (
            <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shrink-0 shadow-sm shadow-primary/5">
              <Tags className="w-5 h-5" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-black text-foreground tracking-tight">
                {selectedTier ? `Pricing Matrix — ${selectedTier.name}` : 'Pricing Tiers Management'}
              </h1>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {selectedTier ? 'Grid View' : 'Dedicated Page'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedTier
                ? 'Set selling price for products under this tier. Leave blank to fallback to base price.'
                : 'Configure custom multi-tier pricing strategies (Retail, Wholesale, Wholesale A, etc.) across Billing & Inventory.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedTier && (
            <Button variant="default" size="sm" onClick={saveGrid} disabled={operating} className="gap-2 shadow-sm">
              {operating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save All Prices
            </Button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-xl transition-all cursor-pointer shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Exit
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="px-6 pt-4 shrink-0 max-w-7xl mx-auto w-full">
          <div className="bg-destructive/10 text-destructive text-xs font-bold px-4 py-3 rounded-2xl border border-destructive/20 flex items-center justify-between shadow-sm">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="p-1 hover:bg-destructive/20 rounded-lg cursor-pointer transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Body */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto w-full space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs font-bold uppercase tracking-wider animate-pulse">Loading Pricing Data...</p>
            </div>
          ) : selectedTier ? (
            <div className="space-y-6">
              {/* Header Toolbar */}
              <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between bg-card border border-border/60 rounded-2xl p-4 shadow-sm">
                <div className="relative max-w-md w-full">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={priceSearch}
                    onChange={(e) => setPriceSearch(e.target.value)}
                    placeholder="Search products by name or barcode..."
                    className="w-full pl-10 pr-4 py-2.5 text-xs font-semibold bg-background border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground font-semibold bg-muted/50 px-3 py-1.5 rounded-xl border border-border/40">
                    Showing <strong className="text-foreground">{filteredProducts.length}</strong> products
                  </span>
                  <Button variant="default" size="sm" onClick={saveGrid} disabled={operating} className="gap-2 shadow-sm">
                    {operating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save All Prices
                  </Button>
                </div>
              </div>

              {/* Price Matrix Table */}
              <div className="border border-border/60 rounded-2xl overflow-hidden bg-card shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-muted/50 text-muted-foreground text-[11px] font-black uppercase tracking-wider border-b border-border/60">
                        <th className="px-6 py-4">Product Details</th>
                        <th className="px-6 py-4 w-44">Base Selling Price</th>
                        <th className="px-6 py-4 w-56 text-primary">{selectedTier.name} Custom Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {filteredProducts.map((p: any) => (
                        <tr key={p.product_id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-foreground">{p.name}</span>
                              {p.sku_barcode && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/40">
                                  {p.sku_barcode}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-xs font-black text-muted-foreground">
                            ₹{Number(p.base_price).toFixed(2)}
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={tierPrices[p.product_id] ?? ''}
                                onChange={(e) => setTierPrices({ ...tierPrices, [p.product_id]: e.target.value })}
                                placeholder={Number(p.base_price).toFixed(2)}
                                className="w-full pl-7 pr-3 py-2 text-xs font-bold bg-background border border-border/80 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredProducts.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-xs font-semibold text-muted-foreground">
                            No products match your search query.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Add New Tier Card */}
              <div className="bg-card border border-border/60 rounded-3xl p-6 md:p-8 space-y-4 shadow-sm">
                <div className="flex items-center gap-2.5 text-xs font-black uppercase tracking-widest text-primary">
                  <Plus className="w-4.5 h-4.5 text-primary" /> Create New Pricing Tier
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    placeholder="e.g. Retail, Wholesale, Tier A, Preferred Customers…"
                    className="flex-1 px-4 py-3 text-sm font-semibold bg-background border border-border/80 rounded-2xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                  />
                  <Button variant="default" onClick={handleAdd} disabled={operating || !newName.trim()} className="gap-2 px-6 py-3 rounded-2xl shadow-sm">
                    {operating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create Tier
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground/80 leading-relaxed">
                  The tier display sequence below dictates pricing evaluation during checkout when a customer tier lacks an explicit price override — the first active matching tier price applies. Use <b>Set Prices</b> to customize per-product prices.
                </p>
              </div>

              {/* Tiers List Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    Configured Pricing Tiers ({tiers.length})
                  </h2>
                </div>

                {tiers.length === 0 ? (
                  <div className="bg-card border border-dashed border-border/80 rounded-3xl p-12 text-center">
                    <Tags className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-bold text-foreground">No Pricing Tiers Created</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                      Create your first tier above. Products will default to standard base prices until assigned custom tier pricing.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {tiers.map((tier, index) => (
                      <div
                        key={tier.pricing_tier_id}
                        className="bg-card border border-border/60 hover:border-primary/30 rounded-2xl px-5 py-4 flex items-center gap-4 transition-all shadow-sm"
                      >
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveTier(index, -1)}
                            disabled={index === 0}
                            className="p-0.5 text-muted-foreground/60 hover:text-primary disabled:opacity-20 cursor-pointer transition-colors"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTier(index, 1)}
                            disabled={index === tiers.length - 1}
                            className="p-0.5 text-muted-foreground/60 hover:text-primary disabled:opacity-20 cursor-pointer transition-colors"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>

                        {editingId === tier.pricing_tier_id ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleRename(tier)}
                              autoFocus
                              className="flex-1 px-3.5 py-2 text-sm font-bold bg-background border border-border rounded-xl focus:outline-none focus:border-primary"
                            />
                            <button
                              type="button"
                              onClick={() => handleRename(tier)}
                              className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-xl cursor-pointer transition-colors"
                            >
                              <Check className="w-4.5 h-4.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="p-2 text-muted-foreground hover:bg-muted rounded-xl cursor-pointer transition-colors"
                            >
                              <X className="w-4.5 h-4.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2.5">
                              <span className={clsx('text-sm font-extrabold truncate', tier.is_active ? 'text-foreground' : 'text-muted-foreground line-through')}>
                                {tier.name}
                              </span>
                              <span className={clsx(
                                'text-[10px] font-bold px-2 py-0.5 rounded-md border',
                                tier.is_active
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                  : 'bg-muted text-muted-foreground border-border/40'
                              )}>
                                {tier.is_active ? 'Active' : 'Disabled'}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {tier.is_active ? 'Available across POS Billing & Parties' : 'Hidden from Billing selection'}
                            </p>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleActive(tier)}
                          className={clsx(
                            'relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0',
                            tier.is_active ? 'bg-emerald-500' : 'bg-muted'
                          )}
                          title={tier.is_active ? 'Disable tier' : 'Enable tier'}
                        >
                          <span className={clsx(
                            'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all',
                            tier.is_active ? 'left-[22px]' : 'left-0.5'
                          )} />
                        </button>

                        <Button variant="outline" size="sm" onClick={() => openGrid(tier)} className="gap-2 shrink-0 rounded-xl">
                          <Grid3X3 className="w-3.5 h-3.5 text-primary" /> Set Prices
                        </Button>

                        <button
                          type="button"
                          onClick={() => { setEditingId(tier.pricing_tier_id); setEditName(tier.name); }}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-muted/80 rounded-xl cursor-pointer transition-colors"
                          title="Rename"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        {confirmDeleteId === tier.pricing_tier_id ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDelete(tier.pricing_tier_id)}
                              className="px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide bg-destructive text-destructive-foreground rounded-xl cursor-pointer transition-all shadow-sm"
                            >
                              Confirm Delete
                            </button>
                            <button type="button" onClick={() => setConfirmDeleteId(null)} className="p-1.5 text-muted-foreground hover:bg-muted rounded-xl cursor-pointer">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(tier.pricing_tier_id)}
                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl cursor-pointer shrink-0 transition-colors"
                            title="Delete tier"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Owner Permission Panel */}
              {isOwner && (
                <div className="bg-card border border-border/60 rounded-3xl p-6 md:p-8 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2.5 text-xs font-black uppercase tracking-widest text-primary">
                    <Shield className="w-4.5 h-4.5 text-primary" /> Biller Price Override Permissions
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-border/40">
                    <div>
                      <p className="text-sm font-extrabold text-foreground">Allow Billing Staff to Override Prices</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-2xl">
                        When enabled, POS billing staff can manually edit unit rates during checkout outside of assigned tier pricing rules. Store Owners can always override prices regardless.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleOverride(!allowBillerOverride)}
                      className={clsx(
                        'relative w-12 h-6.5 rounded-full transition-colors cursor-pointer shrink-0',
                        allowBillerOverride ? 'bg-emerald-500' : 'bg-muted'
                      )}
                    >
                      <span className={clsx(
                        'absolute top-0.5 w-5.5 h-5.5 bg-white rounded-full shadow transition-all',
                        allowBillerOverride ? 'left-[26px]' : 'left-0.5'
                      )} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

