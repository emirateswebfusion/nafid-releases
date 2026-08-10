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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 md:p-6">
      <div className="bg-background border border-border rounded-[28px] shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 md:px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            {selectedTier ? (
              <button
                type="button"
                onClick={() => setSelectedTier(null)}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            ) : (
              <Tags className="w-5 h-5 text-primary" />
            )}
            <div>
              <h2 className="text-sm font-black text-foreground">
                {selectedTier ? `Pricing — ${selectedTier.name}` : 'Pricing Tiers'}
              </h2>
              <p className="text-[10px] text-muted-foreground">
                {selectedTier
                  ? 'Set the selling price for every product in this tier. Empty = use base price.'
                  : 'Create dynamic pricing tiers (e.g. Retail, Wholesale, Wholesale A). Tiers appear across Product, Inventory, Purchase & Billing.'}
              </p>
            </div>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <X className="w-4.5 h-4.5" />
            </button>
          )}
        </div>

        {error && (
          <div className="px-6 pt-3 shrink-0">
            <div className="bg-destructive/10 text-destructive text-xs font-bold px-4 py-2.5 rounded-xl border border-destructive/20">
              {error}
              <button type="button" onClick={() => setError(null)} className="float-right cursor-pointer"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 md:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : selectedTier ? (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                <div className="relative max-w-xs w-full">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={priceSearch}
                    onChange={(e) => setPriceSearch(e.target.value)}
                    placeholder="Search products…"
                    className="w-full pl-9 pr-3 py-2.5 text-xs font-semibold bg-muted/40 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-semibold">{filteredProducts.length} products</span>
                  <Button variant="default" size="sm" onClick={saveGrid} disabled={operating} className="gap-1.5">
                    {operating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save All Prices
                  </Button>
                </div>
              </div>

              <div className="border border-border rounded-2xl overflow-hidden bg-card">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 font-bold">Product</th>
                      <th className="px-4 py-3 font-bold w-36">Base Price</th>
                      <th className="px-4 py-3 font-bold w-44 text-primary">{selectedTier.name} Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredProducts.map((p: any) => (
                      <tr key={p.product_id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2 text-xs font-semibold text-foreground">
                          {p.name}
                          {p.sku_barcode && <span className="ml-2 text-[10px] text-muted-foreground font-mono">{p.sku_barcode}</span>}
                        </td>
                        <td className="px-4 py-2 text-xs font-bold text-muted-foreground">₹{Number(p.base_price).toFixed(2)}</td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={tierPrices[p.product_id] ?? ''}
                            onChange={(e) => setTierPrices({ ...tierPrices, [p.product_id]: e.target.value })}
                            placeholder="Use base"
                            className="w-full px-3 py-2 text-xs font-bold bg-background border border-border/80 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                          />
                        </td>
                      </tr>
                    ))}
                    {filteredProducts.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-10 text-center text-xs text-muted-foreground">No products found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Add tier */}
              <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-foreground">
                  <Plus className="w-4 h-4 text-primary" /> New Pricing Tier
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    placeholder="e.g. Retail, Wholesale, Wholesale A, Dealers…"
                    className="flex-1 px-4 py-2.5 text-sm font-semibold bg-background border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                  />
                  <Button variant="default" onClick={handleAdd} disabled={operating || !newName.trim()} className="gap-1.5">
                    {operating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create Tier
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Tier order below controls the default price applied in Billing when a customer's tier doesn't have a price — the first active tier with a price wins. Set each tier's per-product prices with the <b>Set Prices</b> button.
                </p>
              </div>

              {/* Tier list */}
              {tiers.length === 0 ? (
                <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
                  <Tags className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-bold text-foreground">No pricing tiers yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Create your first tier above. Products keep using their base price until a tier price is set.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {tiers.map((tier, index) => (
                    <div key={tier.pricing_tier_id} className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3">
                      <div className="flex flex-col gap-0.5">
                        <button type="button" onClick={() => moveTier(index, -1)} disabled={index === 0} className="text-muted-foreground/60 hover:text-primary disabled:opacity-25 cursor-pointer">
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => moveTier(index, 1)} disabled={index === tiers.length - 1} className="text-muted-foreground/60 hover:text-primary disabled:opacity-25 cursor-pointer">
                          <ChevronDown className="w-3.5 h-3.5" />
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
                            className="flex-1 px-3 py-1.5 text-sm font-bold bg-background border border-border rounded-lg focus:outline-none focus:border-primary"
                          />
                          <button type="button" onClick={() => handleRename(tier)} className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg cursor-pointer"><Check className="w-4 h-4" /></button>
                          <button type="button" onClick={() => setEditingId(null)} className="p-1.5 text-muted-foreground hover:bg-muted rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <p className={clsx('text-sm font-extrabold truncate', tier.is_active ? 'text-foreground' : 'text-muted-foreground line-through')}>
                            {tier.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {tier.is_active ? 'Active — used in Billing' : 'Disabled — hidden from Billing'}
                          </p>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleActive(tier)}
                        className={clsx(
                          'relative w-10 h-5.5 rounded-full transition-colors cursor-pointer shrink-0',
                          tier.is_active ? 'bg-emerald-500' : 'bg-muted'
                        )}
                        title={tier.is_active ? 'Disable tier' : 'Enable tier'}
                      >
                        <span className={clsx(
                          'absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-all',
                          tier.is_active ? 'left-[22px]' : 'left-0.5'
                        )} />
                      </button>

                      <Button variant="outline" size="sm" onClick={() => openGrid(tier)} className="gap-1.5 shrink-0">
                        <Grid3X3 className="w-3.5 h-3.5" /> Set Prices
                      </Button>

                      <button
                        type="button"
                        onClick={() => { setEditingId(tier.pricing_tier_id); setEditName(tier.name); }}
                        className="p-2 text-muted-foreground hover:text-primary hover:bg-muted/60 rounded-xl cursor-pointer"
                        title="Rename"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>

                      {confirmDeleteId === tier.pricing_tier_id ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDelete(tier.pricing_tier_id)}
                            className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide bg-destructive text-destructive-foreground rounded-lg cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} className="p-1.5 text-muted-foreground hover:bg-muted rounded-lg cursor-pointer">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(tier.pricing_tier_id)}
                          className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl cursor-pointer shrink-0"
                          title="Delete tier (parties keep their tier, prices become unused)"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Owner-only permissions */}
              {isOwner && (
                <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-foreground">
                    <Shield className="w-4 h-4 text-primary" /> Price Override Permission
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-extrabold text-foreground">Allow billers to override tier prices</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                        When ON, billing staff can manually change a product's price during billing (outside their assigned tier).
                        Owners can always override regardless of this setting.
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
      </div>
    </div>
  );
}
