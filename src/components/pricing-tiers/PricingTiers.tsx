import { FloatToast } from '../ui/FloatToast';
import { useMemo, useRef } from 'react';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import { useAuthStore } from '../../store/authStore';

import { MRP_TIER_ID } from '../../utils/pricing/pricingTierHelper';
import { usePricingTiersState } from './hooks/usePricingTiersState';
import { usePricingTiersData } from './hooks/usePricingTiersData';
import { usePricingTierActions } from './hooks/usePricingTierActions';
import { usePricingTierMatrixActions } from './hooks/usePricingTierMatrixActions';
import { PricingTiersHeader } from './views/PricingTiersHeader';
import { TiersListView } from './views/TiersListView';
import { PriceMatrixView } from './views/PriceMatrixView';

// ── MAIN COMPONENT ───────────────────────────────────────────────────
export function PricingTiers({ onClose }: { onClose?: () => void }) {
  useCloseOnEscape(onClose);
  const { tenantId, role } = useAuthStore();
  const isOwner = !role || ['OWNER', 'ADMIN', 'ADMINISTRATOR', 'SUPER_ADMIN'].includes(role.toUpperCase());

  const pt = usePricingTiersState();
  const {
    error, initialPricingMap, pricingMap, products, searchQuery, setError, setStatusMessage, statusMessage, tiers,
    tierFilter, view, visibleCount,
  } = pt;
  const newNameRef = useRef<HTMLInputElement>(null);

  const { loadData } = usePricingTiersData({ tenantId, pt });

  const activeTiers = useMemo(() => tiers.filter(t => (t.is_mrp || t.is_active === 1 || t.is_active === true) && !t.is_deleted), [tiers]);

  const { handleAddTier, handleDeleteTier, handleRenameTier, handleSetDefaultTier, reorderTier, toggleActive, toggleOverride } = usePricingTierActions({ loadData, newNameRef, tenantId, pt });

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

  const { handlePriceChange, handleScroll, resetEdits, saveAllPrices, saveProductRow, scrollContainerRef } = usePricingTierMatrixActions({ filteredProducts, modifiedProductIds, pt, tenantId });

  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  const matrixTiers = useMemo(() => {
    const customActive = activeTiers.filter(t => !t.is_mrp && t.pricing_tier_id !== MRP_TIER_ID);
    if (tierFilter === 'all') return customActive;
    return customActive.filter(t => t.pricing_tier_id === tierFilter);
  }, [activeTiers, tierFilter]);

  /* ═══════════════════════════════════════════════════════════════════════
      RENDER
  ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background font-sans select-none">

      {/* ── HEADER ── */}
      <PricingTiersHeader
        activeTiers={activeTiers}
        filteredProducts={filteredProducts}
        matrixTiers={matrixTiers}
        modifiedProductIds={modifiedProductIds}
        onClose={onClose}
        resetEdits={resetEdits}
        saveAllPrices={saveAllPrices}
        pt={pt}
      />

      {/* ── FLOATING TOAST MESSAGES ── */}
      <div className="fixed bottom-5 right-5 z-[999999] flex flex-col items-end gap-2.5 w-full max-w-md pointer-events-none">
        {statusMessage && (
          <FloatToast message={statusMessage} onClose={() => setStatusMessage(null)} title={statusMessage?.type === 'success' ? 'PRICING STATUS' : 'PRICING ALERT'} duration={0} stackItem />
        )}
        {error && (
          <FloatToast message={typeof error === 'string' ? error : ((error as { message?: string })?.message || JSON.stringify(error))} type="error" title="PRICING ERROR" onClose={() => setError(null)} duration={0} stackItem />
        )}
      </div>

      {/* ── MAIN BODY ── */}
      {view === 'list' ? (

        /* ═══════════════════════════════════════════════════════════════
            TIERS LIST VIEW
        ═══════════════════════════════════════════════════════════════ */
        <TiersListView
          handleAddTier={handleAddTier}
          handleDeleteTier={handleDeleteTier}
          handleRenameTier={handleRenameTier}
          handleSetDefaultTier={handleSetDefaultTier}
          isOwner={isOwner}
          newNameRef={newNameRef}
          pt={pt}
          reorderTier={reorderTier}
          toggleActive={toggleActive}
          toggleOverride={toggleOverride}
        />
      ) : (

        /* ═══════════════════════════════════════════════════════════════
            PRICE MATRIX VIEW
        ═══════════════════════════════════════════════════════════════ */
        <PriceMatrixView
          activeTiers={activeTiers}
          displayedProducts={displayedProducts}
          filteredProducts={filteredProducts}
          handlePriceChange={handlePriceChange}
          handleScroll={handleScroll}
          matrixTiers={matrixTiers}
          pt={pt}
          saveProductRow={saveProductRow}
          scrollContainerRef={scrollContainerRef}
        />
      )}
    </div>
  );
}
