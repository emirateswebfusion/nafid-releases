import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Plus, Trash, Pencil, Check, X, Loader2,
  Tags, ChevronUp, ChevronDown, Shield, Save, Search,
  Package, CheckCircle2, AlertCircle, Layers, Filter, IndianRupee, BadgePercent, Star
} from 'lucide-react';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { useAuthStore } from '../store/authStore';
import { Skeleton } from './ui/Skeleton';
import clsx from 'clsx';

interface PricingTier {
  pricing_tier_id: string;
  tenant_id: string;
  name: string;
  is_active: number | boolean;
  sort_order: number;
  is_deleted?: number | boolean;
  is_default?: number | boolean | string;
}

const isTierDefault = (t?: PricingTier): boolean => {
  if (!t) return false;
  return t.is_default === 1 || t.is_default === true || t.is_default === '1' || t.is_default === 'true';
};

interface Product {
  product_id: string;
  name: string;
  sku_barcode?: string;
  category?: string;
  base_price: number;
  is_deleted?: number;
}

// ── MEMOIZED MATRIX ROW FOR 60FPS TYPING & ZERO LAG ───────────────────
interface MatrixRowProps {
  index: number;
  product: Product;
  matrixTiers: PricingTier[];
  rowPrices: Record<string, string>;
  initPrices: Record<string, string>;
  operating: boolean;
  onPriceChange: (productId: string, tierId: string, value: string) => void;
  onSaveRow: (productId: string) => void;
}

const MatrixRow = React.memo(({
  index,
  product,
  matrixTiers,
  rowPrices,
  initPrices,
  operating,
  onPriceChange,
  onSaveRow
}: MatrixRowProps) => {
  const pId = product.product_id;
  const isModified = matrixTiers.some(t => (rowPrices[t.pricing_tier_id] ?? '') !== (initPrices[t.pricing_tier_id] ?? ''));

  return (
    <div
      className={clsx(
        'flex items-center gap-4 px-6 py-2.5 border-b border-border/50 hover:bg-muted/30',
        isModified && 'bg-amber-500/5'
      )}
    >
      {/* Sl. No. */}
      <div className="w-12 text-center text-xs font-bold text-muted-foreground shrink-0">
        {index + 1}
      </div>

      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground truncate">{product.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {product.sku_barcode && <span className="text-[10px] font-mono text-muted-foreground">{product.sku_barcode}</span>}
          {product.category && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">{product.category}</span>}
        </div>
      </div>

      {/* Base MRP */}
      <div className="w-28 text-right text-xs font-black text-muted-foreground shrink-0">
        ₹{Number(product.base_price || 0).toFixed(2)}
      </div>

      {/* Tier Price Inputs */}
      {matrixTiers.map(t => {
        const val = rowPrices[t.pricing_tier_id] ?? '';
        const isCustom = val !== '' && !isNaN(Number(val));
        return (
          <div key={t.pricing_tier_id} className="w-36 shrink-0">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₹</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={val}
                onChange={e => onPriceChange(pId, t.pricing_tier_id, e.target.value)}
                onWheel={e => (e.target as HTMLInputElement).blur()}
                placeholder={Number(product.base_price || 0).toFixed(2)}
                className={clsx(
                  'w-full pl-7 pr-6 py-2 text-xs font-bold bg-background border rounded-xl focus:outline-none focus:ring-2 no-spinners text-right',
                  isCustom
                    ? 'border-primary text-foreground bg-primary/5 focus:ring-primary/10'
                    : 'border-border text-muted-foreground focus:border-primary focus:ring-primary/10'
                )}
              />
              {isCustom && (
                <button
                  type="button"
                  onClick={() => onPriceChange(pId, t.pricing_tier_id, '')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Save Row */}
      <div className="w-14 flex justify-center shrink-0">
        <button
          onClick={() => onSaveRow(pId)}
          disabled={operating || !isModified}
          title={isModified ? 'Save row' : 'No changes'}
          className={clsx(
            'p-2 rounded-lg cursor-pointer inline-flex items-center justify-center',
            isModified
              ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-90'
              : 'bg-muted text-muted-foreground/30 cursor-not-allowed'
          )}
        >
          <Save className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  if (prevProps.index !== nextProps.index) return false;
  if (prevProps.product !== nextProps.product) return false;
  if (prevProps.matrixTiers !== nextProps.matrixTiers) return false;
  if (prevProps.operating !== nextProps.operating) return false;
  if (prevProps.rowPrices !== nextProps.rowPrices) return false;
  if (prevProps.initPrices !== nextProps.initPrices) return false;
  return true;
});

// ── MAIN COMPONENT ───────────────────────────────────────────────────
export function SettingsPricingTiers({ onClose }: { onClose?: () => void }) {
  useCloseOnEscape(onClose);
  const { tenantId, role } = useAuthStore();
  const isOwner = !role || ['OWNER', 'ADMIN', 'ADMINISTRATOR', 'SUPER_ADMIN'].includes(role.toUpperCase());

  const [view, setView] = useState<'list' | 'matrix'>('list');
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [newName, setNewName] = useState('');
  const newNameRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Pricing Data Maps
  const [pricingMap, setPricingMap] = useState<Record<string, Record<string, string>>>({});
  const [initialPricingMap, setInitialPricingMap] = useState<Record<string, Record<string, string>>>({});
  
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [allowBillerOverride, setAllowBillerOverride] = useState(true);

  // Progressive loading for ultra-smooth matrix rendering
  const [visibleCount, setVisibleCount] = useState(50);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(null), 3000);
    return () => clearTimeout(t);
  }, [statusMessage]);

  useEffect(() => { loadData(true); }, []);

  const loadData = async (showFullLoading = true) => {
    if (!window.electronAPI) {
      setLoading(false);
      return;
    }
    if (showFullLoading) setLoading(true);
    setError(null);
    try {
      const tid = tenantId || 'global';
      const [tierRes, productRes, pricingRes, overrideRes] = await Promise.all([
        window.electronAPI.dbGetPricingTiers(tid),
        window.electronAPI.dbGetProducts({ tenant_id: tid, include_inactive: true }),
        window.electronAPI.dbGetProductPricing ? window.electronAPI.dbGetProductPricing(tid) : Promise.resolve([]),
        window.electronAPI.settingsGet({ tenant_id: tid, key: 'allow_biller_price_override' }),
      ]);
      if (Array.isArray(tierRes)) {
        setTiers(tierRes);
      } else if (tierRes && (tierRes as any).error) {
        setError((tierRes as any).error || 'Failed to load pricing tiers');
      }

      if (Array.isArray(productRes)) {
        setProducts(productRes.filter((p: any) => !p.is_deleted));
      } else if (productRes && (productRes as any).error) {
        setError((productRes as any).error || 'Failed to load products');
      }

      const map: Record<string, Record<string, string>> = {};
      if (Array.isArray(pricingRes)) {
        for (const row of pricingRes) {
          if (!map[row.product_id]) map[row.product_id] = {};
          map[row.product_id][row.pricing_tier_id] = (row.price === null || row.price === undefined) ? '' : String(row.price);
        }
      } else if (pricingRes && (pricingRes as any).error) {
        setError((pricingRes as any).error || 'Failed to load product pricing');
      }
      setPricingMap(map);
      setInitialPricingMap(map);
      setAllowBillerOverride(overrideRes === null || overrideRes === undefined ? true : !!overrideRes);
    } catch (e) {
      console.error('[SettingsPricingTiers] load failed', e);
      setError('Failed to load pricing data.');
    } finally {
      setLoading(false);
    }
  };

  const activeTiers = useMemo(() => tiers.filter(t => (t.is_active === 1 || t.is_active === true) && !t.is_deleted), [tiers]);

  const handleAddTier = async () => {
    if (!newName.trim()) return;
    setOperating(true);
    const res = await window.electronAPI.dbAddPricingTier({
      pricing_tier_id: crypto.randomUUID(),
      tenant_id: tenantId || 'global',
      name: newName.trim(),
      is_active: true,
      sort_order: tiers.length,
    });
    if (res.success) {
      setNewName('');
      setStatusMessage({ text: `Tier "${newName.trim()}" created!`, type: 'success' });
      await loadData(false);
      setTimeout(() => newNameRef.current?.focus(), 100);
    } else {
      setError(res.error || 'Failed to create tier');
    }
    setOperating(false);
  };

  const handleRenameTier = async (tier: PricingTier) => {
    if (!editName.trim()) return;
    setOperating(true);
    const res = await window.electronAPI.dbUpdatePricingTier({ ...tier, name: editName.trim() });
    if (res.success) {
      setEditingId(null);
      setStatusMessage({ text: 'Tier renamed!', type: 'success' });
      await loadData(false);
    } else {
      setError(res.error || 'Failed to rename tier');
    }
    setOperating(false);
  };

  const toggleActive = async (tier: PricingTier) => {
    setOperating(true);
    const next = !tier.is_active;
    const res = await window.electronAPI.dbUpdatePricingTier({ ...tier, is_active: next });
    if (res.success) {
      setStatusMessage({ text: `"${tier.name}" turned ${next ? 'ON' : 'OFF'}`, type: 'success' });
      await loadData(false);
    } else {
      setError(res.error || 'Failed to update status');
    }
    setOperating(false);
  };

  const handleDeleteTier = async (tier: PricingTier) => {
    setOperating(true);
    const res = await window.electronAPI.dbDeletePricingTier(tier.pricing_tier_id);
    if (res.success) {
      setConfirmDeleteId(null);
      setStatusMessage({ text: `"${tier.name}" deleted!`, type: 'success' });
      await loadData(false);
    } else {
      setError(res.error || 'Failed to delete tier');
    }
    setOperating(false);
  };

  const handleSetDefaultTier = async (tier: PricingTier) => {
    setOperating(true);
    const isAlreadyDefault = isTierDefault(tier);
    const targetId = isAlreadyDefault ? '' : tier.pricing_tier_id;
    const res = await window.electronAPI.dbSetDefaultPricingTier({
      tenant_id: tenantId || 'global',
      pricing_tier_id: targetId,
    });
    if (res.success) {
      setStatusMessage({
        text: targetId ? `"${tier.name}" set as default viewing tier in Billing` : 'Default pricing tier unset',
        type: 'success',
      });
      await loadData(false);
    } else {
      setError(res.error || 'Failed to set default tier');
    }
    setOperating(false);
  };

  const moveTier = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= tiers.length) return;
    const reordered = [...tiers];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    const payload = reordered.map((t, i) => ({ pricing_tier_id: t.pricing_tier_id, sort_order: i }));
    const res = await window.electronAPI.dbReorderPricingTiers(payload);
    if (res.success) setTiers(reordered.map((t, i) => ({ ...t, sort_order: i })));
  };

  const toggleOverride = async (value: boolean) => {
    setAllowBillerOverride(value);
    await window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'allow_biller_price_override', value });
    setStatusMessage({ text: `Staff price override ${value ? 'enabled' : 'disabled'}`, type: 'success' });
  };

  const handlePriceChange = useCallback((productId: string, tierId: string, value: string) => {
    setPricingMap(prev => ({ ...prev, [productId]: { ...(prev[productId] || {}), [tierId]: value } }));
  }, []);

  const modifiedProductIds = useMemo(() => {
    return Object.keys(pricingMap).filter(pId => {
      const cur = pricingMap[pId] || {};
      const ini = initialPricingMap[pId] || {};
      return Object.keys(cur).some(tId => (cur[tId] ?? '') !== (ini[tId] ?? ''));
    });
  }, [pricingMap, initialPricingMap]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return products;
    const qNoSpace = q.replace(/\s+/g, '');
    const cleanText = (s: string) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const qClean = cleanText(q);

    return products.filter(p => {
      const name = (p.name || '').toLowerCase();
      const barcode = (p.sku_barcode || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      return (
        name.includes(q) ||
        barcode.includes(q) ||
        cat.includes(q) ||
        (qNoSpace.length > 0 && (
          name.replace(/\s+/g, '').includes(qNoSpace) ||
          barcode.replace(/\s+/g, '').includes(qNoSpace) ||
          cat.replace(/\s+/g, '').includes(qNoSpace)
        )) ||
        (qClean.length > 0 && (
          cleanText(name).includes(qClean) ||
          cleanText(barcode).includes(qClean) ||
          cleanText(cat).includes(qClean)
        ))
      );
    });
  }, [products, searchQuery]);

  // Reset pagination on search query change
  useEffect(() => {
    setVisibleCount(50);
  }, [searchQuery, tierFilter]);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      setVisibleCount(prev => Math.min(prev + 50, filteredProducts.length));
    }
  }, [filteredProducts.length]);

  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  const matrixTiers = useMemo(() => {
    if (tierFilter === 'all') return activeTiers;
    return activeTiers.filter(t => t.pricing_tier_id === tierFilter);
  }, [activeTiers, tierFilter]);

  const saveProductRow = useCallback(async (productId: string) => {
    const current = pricingMap[productId] || {};
    const pricing = Object.entries(current).map(([tierId, val]) => ({
      pricing_tier_id: tierId,
      price: val === '' || isNaN(Number(val)) ? null : Number(val),
    }));
    setOperating(true);
    const res = await window.electronAPI.dbSetProductPricing({ tenant_id: tenantId || '', product_id: productId, pricing });
    if (res.success) {
      setStatusMessage({ text: 'Prices saved!', type: 'success' });
      setInitialPricingMap(prev => ({ ...prev, [productId]: { ...current } }));
    } else {
      setError(res.error || 'Failed to save');
    }
    setOperating(false);
  }, [pricingMap, tenantId]);

  const saveAllPrices = async () => {
    if (!modifiedProductIds.length) return;
    setOperating(true);
    let ok = 0; let fail = false;
    for (const pId of modifiedProductIds) {
      const current = pricingMap[pId] || {};
      const pricing = Object.entries(current).map(([tierId, val]) => ({
        pricing_tier_id: tierId,
        price: val === '' || isNaN(Number(val)) ? null : Number(val),
      }));
      const res = await window.electronAPI.dbSetProductPricing({ tenant_id: tenantId || '', product_id: pId, pricing });
      if (res.success) ok++;
      else fail = true;
    }
    if (!fail) {
      setStatusMessage({ text: `Saved prices for ${ok} product(s)!`, type: 'success' });
      setInitialPricingMap(pricingMap);
    } else {
      setError('Some prices could not be saved.');
    }
    setOperating(false);
  };

  const resetEdits = () => setPricingMap(initialPricingMap);

  /* ═══════════════════════════════════════════════════════════════════════
      RENDER
  ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background font-sans select-none">

      {/* ── HEADER ── */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
              <BadgePercent className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-foreground truncate">Pricing Tiers</h1>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                {view === 'matrix' && modifiedProductIds.length > 0 && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-500 text-white animate-pulse">
                    {modifiedProductIds.length} unsaved
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
                {view === 'list'
                  ? `${tiers.length} tier${tiers.length !== 1 ? 's' : ''} · ${activeTiers.length} active`
                  : `${filteredProducts.length} products · ${matrixTiers.length} tier column${matrixTiers.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* View Toggle Tabs */}
            <div className="flex gap-1 p-1 bg-muted/50 border border-border rounded-2xl shadow-inner select-none">
              {([
                { key: 'list' as const, label: 'Tiers', icon: Layers },
                { key: 'matrix' as const, label: 'Price Matrix', icon: Package },
              ]).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={clsx(
                    'flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0',
                    view === key
                      ? 'bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  <Icon className={clsx('w-3.5 h-3.5', view === key ? 'text-primary' : '')} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {view === 'matrix' && (
              <>
                {modifiedProductIds.length > 0 && (
                  <button
                    onClick={resetEdits}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-input bg-background text-foreground shadow-sm font-bold hover:bg-secondary transition-all active:scale-95 py-2 px-3.5 cursor-pointer text-xs"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={saveAllPrices}
                  disabled={operating || modifiedProductIds.length === 0}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground shadow-sm font-bold hover:bg-primary/95 transition-all active:scale-95 py-2 px-4 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                >
                  {operating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save All ({modifiedProductIds.length})
                </button>
              </>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          </div>
        </div>
      </header>

      {/* ── FLOATING TOAST MESSAGES ── */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col items-end gap-2.5 w-full max-w-md pointer-events-none">
        {statusMessage && (
          <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
            <div className={clsx("p-2 rounded-xl shrink-0", statusMessage.type === 'success' ? "bg-emerald-500/25 text-emerald-400" : "bg-red-500/25 text-red-400")}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0 leading-snug">
              <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">
                {statusMessage.type === 'success' ? 'PRICING STATUS' : 'PRICING ALERT'}
              </span>
              <span className="text-white font-bold text-xs block leading-tight">{statusMessage.text}</span>
            </div>
            <button type="button" onClick={() => setStatusMessage(null)} className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {error && (
          <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
            <div className="p-2 rounded-xl bg-red-500/25 text-red-400 shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 leading-snug">
              <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">PRICING ERROR</span>
              <span className="text-white font-bold text-xs block leading-tight">{typeof error === 'string' ? error : ((error as any)?.message || JSON.stringify(error))}</span>
            </div>
            <button type="button" onClick={() => setError(null)} className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── MAIN BODY ── */}
      {view === 'list' ? (

        /* ═══════════════════════════════════════════════════════════════
            TIERS LIST VIEW
        ═══════════════════════════════════════════════════════════════ */
        <div className="flex-1 overflow-y-auto">
          <div className="w-full px-4 sm:px-6 pt-6 pb-10 space-y-4">

            {/* Create Tier Card */}
            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Tags className="w-4 h-4" /></div>
                <span className="text-xs font-black text-primary uppercase tracking-wider">Create New Tier</span>
              </div>
              <div className="flex gap-3">
                <input
                  ref={newNameRef}
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddTier()}
                  placeholder="e.g. Retail, Wholesale, Tier A, B2B…"
                  className="flex-1 bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm font-semibold"
                />
                <button
                  onClick={handleAddTier}
                  disabled={operating || !newName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground shadow-sm font-bold hover:bg-primary/95 transition-all active:scale-95 py-2.5 px-5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {operating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add Tier
                </button>
              </div>
            </section>

            {/* Tiers Table */}
            <section className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm">
              {/* Column Header */}
              <div className="grid grid-cols-12 gap-3 px-6 py-3.5 bg-muted/20 dark:bg-muted/10 border-b border-border select-none">
                <div className="col-span-1 text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <span>Sl. No.</span>
                </div>
                <div className="col-span-5 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Tier Name</div>
                <div className="col-span-2 text-center text-[10px] font-black text-muted-foreground uppercase tracking-widest">Status</div>
                <div className="col-span-2 text-center text-[10px] font-black text-muted-foreground uppercase tracking-widest">Active</div>
                <div className="col-span-2 text-center text-[10px] font-black text-muted-foreground uppercase tracking-widest">Actions</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-border">
                {loading ? (
                  [1, 2, 3, 4].map(i => (
                    <div key={i} className="grid grid-cols-12 gap-3 px-6 py-4 items-center">
                      <div className="col-span-1 flex items-center gap-2">
                        <Skeleton className="h-4 w-4 rounded-md" />
                      </div>
                      <div className="col-span-5">
                        <Skeleton className="h-4 w-48 rounded-lg" />
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <Skeleton className="h-5 w-10 rounded-full" />
                      </div>
                      <div className="col-span-2 flex justify-center gap-2">
                        <Skeleton className="h-7 w-7 rounded-lg" />
                        <Skeleton className="h-7 w-7 rounded-lg" />
                      </div>
                    </div>
                  ))
                ) : tiers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Tags className="w-10 h-10 mb-3 opacity-30" />
                    <p className="font-bold text-sm text-foreground">No pricing tiers yet</p>
                    <p className="text-xs mt-1">Create one above to get started</p>
                  </div>
                ) : tiers.map((tier, index) => (
                  <div
                    key={tier.pricing_tier_id}
                    className={clsx(
                      'grid grid-cols-12 gap-3 px-6 py-3.5 items-center hover:bg-muted/30',
                      !tier.is_active && 'opacity-60'
                    )}
                  >
                    {/* Sl. No. & Sort Arrows */}
                    <div className="col-span-1 flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-4 text-center">{index + 1}</span>
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => moveTier(index, -1)}
                          disabled={index === 0 || operating}
                          className="p-0.5 text-muted-foreground/50 hover:text-primary disabled:opacity-20 cursor-pointer"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveTier(index, 1)}
                          disabled={index === tiers.length - 1 || operating}
                          className="p-0.5 text-muted-foreground/50 hover:text-primary disabled:opacity-20 cursor-pointer"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Name / Inline Edit */}
                    <div className="col-span-5">
                      {editingId === tier.pricing_tier_id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleRenameTier(tier)}
                            autoFocus
                            className="flex-1 bg-background border border-primary rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/10"
                          />
                          <div className="inline-flex items-center p-0.5 bg-muted/60 border border-border rounded-xl shrink-0">
                            <button
                              type="button"
                              onClick={() => handleRenameTier(tier)}
                              className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 rounded-lg cursor-pointer transition-all active:scale-90"
                              title="Save"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <span className="w-px h-4 bg-border/60" />
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="p-1.5 text-rose-500 hover:bg-rose-500/15 rounded-lg cursor-pointer transition-all active:scale-90"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={clsx('text-sm font-bold', tier.is_active ? 'text-foreground' : 'text-muted-foreground line-through')}>
                              {tier.name}
                            </p>
                            {isTierDefault(tier) && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                            {tier.is_active ? 'Visible in Inventory & POS Billing' : 'Hidden from all selections'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Status Badge */}
                    <div className="col-span-2 flex justify-center">
                      <span className={clsx(
                        'text-[10px] font-bold px-2.5 py-1 rounded-full border',
                        tier.is_active
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          : 'bg-muted text-muted-foreground border-border/40'
                      )}>
                        {tier.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </div>

                    {/* Toggle Switch */}
                    <div className="col-span-2 flex justify-center">
                      <button
                        onClick={() => toggleActive(tier)}
                        disabled={operating}
                        title={tier.is_active ? 'Turn OFF' : 'Turn ON'}
                        className={clsx(
                          'relative w-11 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50',
                          tier.is_active ? 'bg-emerald-500' : 'bg-muted'
                        )}
                      >
                        <span className={clsx(
                          'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all',
                          tier.is_active ? 'left-[22px]' : 'left-0.5'
                        )} />
                      </button>
                    </div>

                    {/* Action Buttons */}
                    <div className="col-span-2 flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleSetDefaultTier(tier)}
                        disabled={operating}
                        className={clsx(
                          'p-1.5 rounded-lg cursor-pointer transition-all',
                          isTierDefault(tier)
                            ? 'text-amber-400 hover:text-amber-500 bg-amber-500/10'
                            : 'text-muted-foreground hover:text-amber-400 hover:bg-muted'
                        )}
                        title={isTierDefault(tier) ? 'Default viewing tier in Billing (Click to unset)' : 'Set as Default viewing tier in Billing'}
                      >
                        <Star className={clsx('w-3.5 h-3.5', isTierDefault(tier) && 'fill-amber-400 text-amber-400')} />
                      </button>
                      <button
                        onClick={() => { setTierFilter(tier.pricing_tier_id); setView('matrix'); }}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg cursor-pointer"
                        title="Set Prices in Matrix"
                      >
                        <IndianRupee className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setEditingId(tier.pricing_tier_id); setEditName(tier.name); }}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg cursor-pointer"
                        title="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {confirmDeleteId === tier.pricing_tier_id ? (
                        <div className="inline-flex items-center gap-1 p-0.5 bg-muted/60 border border-border rounded-xl shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDeleteTier(tier)}
                            className="px-2.5 py-1 text-[10px] font-black bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg cursor-pointer transition-all active:scale-95"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg cursor-pointer transition-all active:scale-90"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(tier.pricing_tier_id)}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer"
                          title="Delete"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Staff Permission (Owner Only) */}
            {isOwner && (
              <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500"><Shield className="w-4 h-4" /></div>
                  <span className="text-xs font-black text-amber-500 uppercase tracking-wider">Staff Permissions</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-foreground">Allow Billing Staff to Override Prices</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cashiers can manually edit unit prices during checkout, outside tier rules
                    </p>
                  </div>
                  <button
                    onClick={() => toggleOverride(!allowBillerOverride)}
                    className={clsx(
                      'relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0',
                      allowBillerOverride ? 'bg-emerald-500' : 'bg-muted'
                    )}
                  >
                    <span className={clsx(
                      'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all',
                      allowBillerOverride ? 'left-[22px]' : 'left-0.5'
                    )} />
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      ) : (

        /* ═══════════════════════════════════════════════════════════════
            PRICE MATRIX VIEW
        ═══════════════════════════════════════════════════════════════ */
        <div className="flex-1 flex flex-col min-h-0">

          {/* Toolbar */}
          <div className="w-full px-4 sm:px-6 pt-4 shrink-0">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-card border border-border p-4 rounded-[28px] shadow-sm px-6 py-3.5 select-none">
              {/* Search */}
              <div className="relative w-full sm:max-w-xs flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name, barcode, or category..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 text-destructive" />
                  </button>
                )}
              </div>

              {/* Tier Filter Pills */}
              <div className="flex gap-1.5 p-1.5 bg-muted/50 dark:bg-muted/20 border border-border rounded-2xl overflow-x-auto scrollbar-none max-w-fit shadow-inner select-none shrink-0 items-center">
                <Filter className="w-3 h-3 text-muted-foreground/60 ml-1 shrink-0" />
                <button
                  onClick={() => setTierFilter('all')}
                  className={clsx(
                    'flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0',
                    tierFilter === 'all'
                      ? 'bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  All ({activeTiers.length})
                </button>
                {activeTiers.map(t => (
                  <button
                    key={t.pricing_tier_id}
                    onClick={() => setTierFilter(t.pricing_tier_id)}
                    className={clsx(
                      'flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0',
                      tierFilter === t.pricing_tier_id
                        ? 'bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Product Price Table */}
          <div className="w-full px-4 sm:px-6 pb-6 pt-3 flex flex-col flex-1 min-h-0">
            <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">

              {/* Column Header */}
              <div className="hidden sm:flex items-center px-6 py-3.5 bg-muted/20 dark:bg-muted/10 border-b border-border select-none shrink-0 gap-4">
                <div className="w-12 text-center text-[10px] font-black text-muted-foreground uppercase tracking-widest shrink-0">Sl. No.</div>
                <div className="flex-1 min-w-0 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Product</div>
                <div className="w-28 text-right text-[10px] font-black text-muted-foreground uppercase tracking-widest">Base MRP</div>
                {matrixTiers.map(t => (
                  <div key={t.pricing_tier_id} className="w-36 text-right text-[10px] font-black text-primary uppercase tracking-widest">
                    {t.name}
                  </div>
                ))}
                <div className="w-14 text-center text-[10px] font-black text-muted-foreground uppercase tracking-widest">Save</div>
              </div>

              {/* Scrollable Rows Container with Progressive Chunking */}
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto divide-y divide-border relative"
              >
                {loading ? (
                  [1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center gap-4 px-6 py-3 border-b border-border/50">
                      <Skeleton className="w-12 h-4 rounded" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-40 rounded" />
                        <Skeleton className="h-3 w-20 rounded" />
                      </div>
                      <Skeleton className="w-28 h-4 rounded ml-auto" />
                      <Skeleton className="w-36 h-8 rounded-xl" />
                      <Skeleton className="w-14 h-8 rounded-lg" />
                    </div>
                  ))
                ) : matrixTiers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground">
                    <Tags className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm font-bold text-foreground">No active tiers to display</p>
                    <p className="text-xs mt-1">
                      Enable tiers from the{' '}
                      <button onClick={() => setView('list')} className="text-primary underline cursor-pointer">Tiers</button>
                      {' '}tab
                    </p>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground">
                    <p className="text-sm font-bold text-foreground">No products found</p>
                    <p className="text-xs mt-1">Try a different search term</p>
                  </div>
                ) : (
                  <>
                    {displayedProducts.map((p, idx) => (
                      <MatrixRow
                        key={p.product_id}
                        index={idx}
                        product={p}
                        matrixTiers={matrixTiers}
                        rowPrices={pricingMap[p.product_id] || {}}
                        initPrices={initialPricingMap[p.product_id] || {}}
                        operating={operating}
                        onPriceChange={handlePriceChange}
                        onSaveRow={saveProductRow}
                      />
                    ))}
                    {visibleCount < filteredProducts.length && (
                      <div className="py-4 text-center text-xs font-bold text-muted-foreground/60 bg-muted/10">
                        Scroll down to load more products ({displayedProducts.length} of {filteredProducts.length} loaded)…
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              {filteredProducts.length > 0 && (
                <div className="shrink-0 border-t border-border bg-muted/20 px-6 py-3 text-center text-xs font-bold text-muted-foreground">
                  Showing {displayedProducts.length} of {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} · blank fields fallback to Base MRP
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

