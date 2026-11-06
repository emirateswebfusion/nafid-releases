import { discountChange } from './productDiscounts';
import { FloatToast } from '../ui/FloatToast';
import { storeDate } from '../../utils/time/dateDisplay';
import { getStoreLocale } from '../../utils/localization/storeProfile';
import { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { syncApi } from '../../data/sync';
import { useAuthStore } from '../../store/authStore';
import { DataUploadModal } from '../data-upload/DataUploadModal';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import { isLegacyBillerRole } from '../../utils/security/permissions';
import { parseUTCDate } from '../../utils/print/receiptGenerator';
import { getStoreTimezone } from '../../utils/time/timezoneHelper';

import { type Product, isGstProduct } from './inventoryUtils';
import { InventoryTableView } from './views/InventoryTableView';
import { InventoryFormView } from './views/InventoryFormView';
import { CreateGradeModal } from './modals/CreateGradeModal';
import { AdjustStockModal } from './modals/AdjustStockModal';
import { BarcodePrintModal } from './modals/BarcodePrintModal';
import { DeleteProductModal } from './modals/DeleteProductModal';
import { BulkDeleteProductsModal } from './modals/BulkDeleteProductsModal';
import { getProductPricing } from '../../data/products';
import { pricingTiersApi, listPricingTiers } from '../../data/pricingTiers';
import { isDesktopRuntime } from '../../data/client';
import { useInventoryState } from './hooks/useInventoryState';
import { useInventorySave } from './hooks/useInventorySave';
import { useInventoryExports } from './hooks/useInventoryExports';
import { useInventoryFormOpen } from './hooks/useInventoryFormOpen';
import { useInventoryFormHandlers } from './hooks/useInventoryFormHandlers';
import { useInventoryLoader } from './hooks/useInventoryLoader';
import { InventoryHeader } from './views/InventoryHeader';
import { useInventoryListActions } from './hooks/useInventoryListActions';
import { useInventoryEffects } from './hooks/useInventoryEffects';

// ─── Main Component ─────────────────────────────────────────────────────────
export function InventoryManager({ onClose, isRestricted: _isRestricted, initialProduct }: { onClose: () => void; isRestricted?: boolean; initialProduct?: Product | null }) {
  useCloseOnEscape(onClose);
  const { tenantId } = useAuthStore();

  const inv = useInventoryState();
  const {
    view, setView, loading, isFetching, products, debouncedSearchQuery,
    sortBy, stockFilter, setStockFilter, filterDate, filterDateEnd, formData,
    setFormData, statusMessage, setStatusMessage, showUploadModal, setShowUploadModal, enableRealPaperStock,
    showPaperOnlyProducts, showZeroPaperStock, showProductGstBadge, showPriceTiersInInventory, deleteConfirmProduct, setDeleteConfirmProduct, isDeleting, printQuantity,
    setPrintQuantity, printPrice, setPrintPrice, printModalProduct, setPrintModalProduct, adjustingStockId,
    adjustModal, setAdjustModal, adjustAmount, setAdjustAmount, adjustPcs, setAdjustPcs,
    priceCoding, viewMode, showLowStockAlert, setShowLowStockAlert, labelCodeType, qrPreviewUrl,
    grades, pricingTiers, tierPrices, setTierPrices, allProductPricingMap, setAllProductPricingMap,
    showCategorySuggestions, setShowCategorySuggestions, selectedCategoryIndex, setSelectedCategoryIndex, isAddingGrade, setIsAddingGrade,
    savingGrade, newGradeForm, setNewGradeForm, nameSuggestions, setNameSuggestions, suppliers,
    supplierSearch, setSupplierSearch, showSupplierCreate, setShowSupplierCreate, newSupplierName, setNewSupplierName,
    newSupplierPhone, setNewSupplierPhone, newSupplierAddress, setNewSupplierAddress, selectedNameIndex, setSelectedNameIndex,
    highlightedProductId, offset, setOffset, hasMore, totalCount, selectedProductIds,
    setSelectedProductIds, showBulkDeleteConfirm, setShowBulkDeleteConfirm, isBulkDeleting,
    variants, setVariants,
  } = inv;
  const firstInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activePricingTiers = useMemo(() => {
    return pricingTiers.filter(t => (t.is_active === 1 || t.is_active === true || t.is_active === '1') && !t.is_deleted);
  }, [pricingTiers]);
  const categoryContainerRef = useRef<HTMLDivElement>(null);
  const nameContainerRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const lastInteractedProductId = useRef<string | null>(null);
  const savedScrollTop = useRef<number>(0);

  const existingCategories = useMemo(() => {
    const map = new Map<string, string>();
    const addCat = (raw: string | null | undefined) => {
      if (!raw) return;
      const trimmed = raw.trim().replace(/\s+/g, ' ');
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (!map.has(lower)) {
        map.set(lower, trimmed);
      }
    };
    grades.forEach(g => addCat(g.category));
    products.forEach(p => addCat(p.category));
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [grades, products]);

  const categorySuggestions = useMemo(() => {
    const query = (formData.category || '').trim().toLowerCase();
    if (!query) {
      return existingCategories;
    }
    return existingCategories.filter(c => c.toLowerCase().includes(query));
  }, [existingCategories, formData.category]);

  const categoryGrades = grades.filter(g => (g.category || '').trim().toLowerCase() === (formData.category || '').trim().toLowerCase());

  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const handleSyncCatalog = async () => {
    setIsSyncingCatalog(true);
    try {
      await syncApi.forceResyncEntities(['products']);
      await loadProducts(true);
    } catch (e) {
      console.error('Catalog resync failed:', e);
    } finally {
      setIsSyncingCatalog(false);
    }
  };

  const LIMIT = 50;

  // ── Refs to always hold the latest filter/pagination state ──────────────
  // These allow async callbacks (sync listener, intersection observer) to
  // read current values without suffering from stale closures.
  const searchQueryRef = useRef(debouncedSearchQuery);
  const sortByRef = useRef(sortBy);
  const stockFilterRef = useRef(stockFilter);
  const filterDateRef = useRef(filterDate);
  const filterDateEndRef = useRef(filterDateEnd);
  const offsetRef = useRef(offset);
  const hasMoreRef = useRef(hasMore);
  const isFetchingRef = useRef(false);
  const lastFetchTimeRef = useRef(0);
  const viewModeRef = useRef(viewMode);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const refreshProductPricing = useCallback(async () => {
    if (isDesktopRuntime()) {
      try {
        const rows = await getProductPricing(tenantId || 'global');
        if (Array.isArray(rows)) {
          const map: Record<string, Record<string, number>> = {};
          for (const r of rows) {
            if (!r.is_deleted && r.price != null && r.price !== '') {
              if (!map[r.product_id]) map[r.product_id] = {};
              map[r.product_id][r.pricing_tier_id] = Number(r.price);
            }
          }
          setAllProductPricingMap(map);
        }
      } catch (err) {
        console.warn('[InventoryManager] Failed to load product pricing:', err);
      }
    }
  }, [tenantId, setAllProductPricingMap]);

  const { loadProducts } = useInventoryLoader({
    inv, filterDateEndRef, filterDateRef, hasMoreRef, isFetchingRef, lastFetchTimeRef, LIMIT, offsetRef,
    searchQueryRef, sortByRef, stockFilterRef, viewModeRef,
  });

  // ── Name autocomplete ───────────────────────────────────────────────
  const nameSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCategoryKeyDown = (e: React.KeyboardEvent) => {
    if (!showCategorySuggestions || categorySuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedCategoryIndex(prev => Math.min(prev + 1, categorySuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedCategoryIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && selectedCategoryIndex >= 0) {
      e.preventDefault();
      selectCategorySuggestion(categorySuggestions[selectedCategoryIndex]);
    } else if (e.key === 'Escape') {
      setShowCategorySuggestions(false);
    }
  };

  const selectCategorySuggestion = (cat: string) => {
    handleInputChange('category', cat);
    setShowCategorySuggestions(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (!nameSuggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedNameIndex(prev => Math.min(prev + 1, nameSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedNameIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && selectedNameIndex >= 0) {
      e.preventDefault();
      selectNameSuggestion(nameSuggestions[selectedNameIndex]);
    } else if (e.key === 'Escape') {
      setNameSuggestions([]);
    }
  };

  const selectNameSuggestion = (product: Product) => {
    setNameSuggestions([]);
    openEdit(product);
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    const container = target.closest('[data-enter-nav]');
    if (!container) return;
    const focusable = container.querySelectorAll<HTMLElement>('[data-select-trigger]:not([disabled]), input:not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-focusable-checkbox]');
    const idx = Array.from(focusable).indexOf(target as HTMLElement);
    if (idx === -1) return;
    e.preventDefault();
    if (idx < focusable.length - 1) {
      const nextEl = focusable[idx + 1];
      nextEl?.focus();
      if (nextEl?.hasAttribute('data-select-trigger')) setTimeout(() => nextEl.click(), 0);
    } else {
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-enter-submit]')?.click();
    }
  };

  // Handle scroll on the list container to load next page smoothly
  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    savedScrollTop.current = el.scrollTop;

    // Trigger next page when scrolled within 200px of bottom
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom < 200 && !isFetchingRef.current && hasMoreRef.current) {
      loadProducts(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadProducts is a new function each render; this runs only on the listed triggers (unchanged by moving it into useInventoryLoader)
  }, []);

  const { openAdd, openEdit } = useInventoryFormOpen({
    inv, lastInteractedProductId, listScrollRef, savedScrollTop, tenantId,
  });
  const initialFormOpened = useRef(false);
  useEffect(() => {
    if (initialProduct === undefined || initialFormOpened.current) return;
    initialFormOpened.current = true;
    if (initialProduct) void openEdit(initialProduct); else void openAdd();
  }, [initialProduct, openEdit, openAdd]);


  const handleDelete = (product: Product) => {
    setDeleteConfirmProduct(product);
  };

  const filtered = useMemo(() =>
    products.filter(p => {
      // Service charge belongs on the billing page only — never in inventory
      // (flag OR literal name match — legacy/unflagged duplicates exist in old databases)
      if (Number(p.is_service_item) === 1 || String(p.name || '').trim().toLowerCase() === 'service charge') return false;
      const isGst = isGstProduct(p);

      // Staff Operational Option Check: If biller does NOT have OPT_VIEW_GST permission, restrict viewing to GST products ONLY
      const { role, restrictedPage } = useAuthStore.getState();
      if (isLegacyBillerRole(role)) {
        const permissions = restrictedPage ? restrictedPage.split(',').filter(Boolean) : [];
        const hasOptViewGst = permissions.includes('OPT_VIEW_GST');
        if (!hasOptViewGst && !isGst) {
          return false;
        }
      }

      // An HSN/SAC code classifies a product as GST-applicable, even at 0%.
      if (viewMode === 'estimate' && isGst) return false;
      if (viewMode === 'gst' && !isGst) return false;

      // Filter out Paper-only products if setting is OFF
      if (!showPaperOnlyProducts && Number(p.current_stock) <= 0 && Number(p.paper_stock || 0) > 0) {
        return false;
      }

      // Stock status filter
      if (stockFilter === 'low_stock') {
        if (!(Number(p.current_stock) <= Number(p.reorder_level) && Number(p.reorder_level) > 0 && Number(p.current_stock) > 0)) return false;
      } else if (stockFilter === 'out_of_stock') {
        if (Number(p.current_stock) > 0 || Number(p.paper_stock || 0) > 0) return false;
      } else if (stockFilter === 'in_stock') {
        if (Number(p.current_stock) <= 0 && Number(p.paper_stock || 0) <= 0) return false;
      } else if (stockFilter === 'no_barcode') {
        if (p.sku_barcode && String(p.sku_barcode).trim() !== '') return false;
      }

      return true;
    }),
    [products, viewMode, stockFilter, showPaperOnlyProducts]
  );

  const filteredIds = useMemo(() => filtered.map(p => p.product_id), [filtered]);

  const isAllSelected = useMemo(() => {
    if (filteredIds.length === 0) return false;
    return filteredIds.every(id => selectedProductIds.has(id));
  }, [filteredIds, selectedProductIds]);

  const isSomeSelected = useMemo(() => {
    return filteredIds.some(id => selectedProductIds.has(id)) && !isAllSelected;
  }, [filteredIds, selectedProductIds, isAllSelected]);

  const toggleSelectProduct = (productId: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedProductIds(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedProductIds(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const openAdjustDialog = (product: Product, mode: 'add' | 'reduce') => {
    setAdjustAmount('');
    setAdjustPcs('');
    setAdjustModal({ product, mode });
  };

  const encodePurchasePriceCode = (price: unknown) => {
    if (!priceCoding || price === '' || price === null || price === undefined) return '';
    const numeric = Number(price);
    if (isNaN(numeric) || numeric <= 0) return '';
    let code = '';
    for (const char of String(numeric)) {
      if (char === '.') code += '.';
      else if (priceCoding[char]) code += priceCoding[char];
    }
    return code;
  };

  const stripPurchasePriceCode = (barcode: string, price: unknown) => {
    const code = encodePurchasePriceCode(price);
    // Strip the new dotted format first, then the legacy dotless format
    for (const candidate of [code, code.replace(/\./g, '')]) {
      if (candidate && barcode.endsWith(candidate)) {
        return barcode.substring(0, barcode.length - candidate.length);
      }
    }
    return barcode;
  };

  const handleDomainAttrChange = (field: string, value: unknown) => {
    setFormData(prev => {
      const nextAttrs = { ...prev.domain_attributes, [field]: value };
      if (field === 'pcs') {
        nextAttrs.pcs_stock = value as typeof prev.domain_attributes.pcs_stock;
      }
      return {
        ...prev,
        domain_attributes: nextAttrs
      };
    });
    if (field === 'pcs') {
      setPrintQuantity(value === '' || value === 0 ? '' : Number(value));
    }
  };

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.phone && s.phone.includes(supplierSearch))
  );

  const getEffectiveMrp = (data: typeof formData = formData) => {
    const appliedGrade = data.grade_id ? grades.find(g => g.grade_id === data.grade_id) : null;
    const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
    return gradeRate !== null && data.pricing_mode === 'GRADE_RATE' 
      ? gradeRate 
      : Number(data.base_price) || 0;
  };

  const handleDiscountPercentChange = (val: string) => setFormData(prev => ({ ...prev, ...discountChange(getEffectiveMrp(prev), 'discount_percent', val) }));
  const handleDiscountFlatChange = (val: string) => setFormData(prev => ({ ...prev, ...discountChange(getEffectiveMrp(prev), 'discount_flat', val) }));
  const handleOfferPriceChange = (val: string) => setFormData(prev => ({ ...prev, ...discountChange(getEffectiveMrp(prev), 'offer_price', val) }));

  const { printBarcode, printProductLabel, downloadCsv } = useInventoryExports({
    inv, stockFilterRef, tenantId,
  });

  const { handleSave } = useInventorySave({
    inv, encodePurchasePriceCode, existingCategories, loadProducts, tenantId,
  });

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    const tz = getStoreTimezone();
    const d = parseUTCDate(dateStr);
    if (isNaN(d.getTime())) return '-';
    const [dd, mm, yyyy] = storeDate(d, getStoreLocale(), { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).split('/');
    const dayName = storeDate(d, getStoreLocale(), { timeZone: tz, weekday: 'long' });
    return `${dd}/${mm}/${yyyy} ${dayName}`;
  };

  const groupedByDate = filtered.reduce<Record<string, typeof products>>((acc, p) => {
    const date = formatDate(p.created_at);
    if (!acc[date]) acc[date] = [];
    acc[date].push(p);
    return acc;
  }, {});

  const adjustProduct = adjustModal?.product ?? null;
  const adjustCurrentPcs = (() => {
    if (!adjustProduct) return 0;
    try {
      const da = JSON.parse(adjustProduct.domain_attributes || '{}');
      return Number(da.pcs_stock ?? da.pcs ?? 0) || 0;
    } catch { return 0; }
  })();

  const { applyStockAdjust, handleInputChange, handleCreateSupplier, handleCreateGrade } = useInventoryFormHandlers({
    inv, encodePurchasePriceCode, getEffectiveMrp, stripPurchasePriceCode, tenantId,
  });
  const { handleConfirmDelete, handleConfirmBulkDelete, confirmAdjustStock, generateBarcode } = useInventoryListActions({
    inv, adjustCurrentPcs, applyStockAdjust, encodePurchasePriceCode, handleInputChange, searchInputRef,
  });

  useInventoryEffects({
    inv, categoryContainerRef, filterDateEndRef, filterDateRef, firstInputRef, hasMoreRef, isFetchingRef,
    lastInteractedProductId, listScrollRef, loadProducts, nameContainerRef, nameSearchTimeout, offsetRef, openAdd,
    refreshProductPricing, savedScrollTop, searchInputRef, searchQueryRef, sentinelRef, sortByRef, stockFilterRef,
    tenantId, viewModeRef,
  });

  const handleAddPricingTier = async (name: string) => {
    try {
      const tid = tenantId || 'global';
      const res = (await pricingTiersApi.addPricingTier({ name, tenant_id: tid })) as { success: boolean; error?: string; pricing_tier_id?: string };
      if (res.success && res.pricing_tier_id) {
        const updated = await listPricingTiers(tid);
        inv.setPricingTiers(updated);
        setTierPrices(prev => ({ ...prev, [res.pricing_tier_id!]: '' }));
        return { success: true, pricing_tier_id: res.pricing_tier_id };
      }
      return { success: false, error: res.error || 'Failed to add tier' };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  };

return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* ═══════════════════════════════════════════════════
          HEADER with Integrated Filters
      ═══════════════════════════════════════════════════ */}
      <InventoryHeader
        downloadCsv={downloadCsv} onClose={onClose} openAdd={openAdd} searchInputRef={searchInputRef}
        tenantId={tenantId} inv={inv} onSyncCatalog={handleSyncCatalog} isSyncingCatalog={isSyncingCatalog}
      />

      {/* ── PRODUCT LIST VIEW ────────────────────────────────────────────── */}
      <InventoryTableView
        view={view}
        isAllSelected={isAllSelected}
        isSomeSelected={isSomeSelected}
        handleToggleSelectAll={handleToggleSelectAll}
        showZeroPaperStock={showZeroPaperStock}
        showProductGstBadge={showProductGstBadge}
        showPriceTiersInInventory={showPriceTiersInInventory}
        activePricingTiers={activePricingTiers}
        listScrollRef={listScrollRef}
        handleListScroll={handleListScroll}
        products={products}
        filtered={filtered}
        groupedByDate={groupedByDate}
        offset={offset}
        highlightedProductId={highlightedProductId}
        selectedProductIds={selectedProductIds}
        toggleSelectProduct={toggleSelectProduct}
        enableRealPaperStock={enableRealPaperStock}
        grades={grades}
        allProductPricingMap={allProductPricingMap}
        adjustingStockId={adjustingStockId}
        applyStockAdjust={applyStockAdjust}
        openAdjustDialog={openAdjustDialog}
        openEdit={openEdit}
        handleDelete={handleDelete}
        setPrintModalProduct={setPrintModalProduct}
        setPrintQuantity={setPrintQuantity}
        setPrintPrice={setPrintPrice}
        sentinelRef={sentinelRef}
        isFetching={isFetching}
        hasMore={hasMore}
        totalCount={totalCount}
        showLowStockAlert={showLowStockAlert}
        setShowLowStockAlert={setShowLowStockAlert}
        stockFilter={stockFilter}
        setStockFilter={setStockFilter}
      />

      {/* ── ADD / EDIT FORM VIEW ─────────────────────────────────────────── */}
      {(view === 'add' || view === 'edit') && (
        <InventoryFormView
          view={view}
          loading={loading}
          handleFormKeyDown={handleFormKeyDown}
          firstInputRef={firstInputRef}
          formData={formData}
          handleInputChange={handleInputChange}
          handleDomainAttrChange={handleDomainAttrChange}
          generateBarcode={generateBarcode}
          categoryContainerRef={categoryContainerRef}
          showCategorySuggestions={showCategorySuggestions}
          setShowCategorySuggestions={setShowCategorySuggestions}
          categorySuggestions={categorySuggestions}
          selectedCategoryIndex={selectedCategoryIndex}
          setSelectedCategoryIndex={setSelectedCategoryIndex}
          selectCategorySuggestion={selectCategorySuggestion}
          handleCategoryKeyDown={handleCategoryKeyDown}
          nameContainerRef={nameContainerRef}
          nameSuggestions={nameSuggestions}
          selectedNameIndex={selectedNameIndex}
          setSelectedNameIndex={setSelectedNameIndex}
          selectNameSuggestion={selectNameSuggestion}
          handleNameKeyDown={handleNameKeyDown}
          categoryGrades={categoryGrades}
          isAddingGrade={isAddingGrade}
          setIsAddingGrade={setIsAddingGrade}
          grades={grades}
          handleDiscountPercentChange={handleDiscountPercentChange}
          handleDiscountFlatChange={handleDiscountFlatChange}
          handleOfferPriceChange={handleOfferPriceChange}
          activePricingTiers={activePricingTiers}
          tierPrices={tierPrices}
          setTierPrices={setTierPrices}
          enableRealPaperStock={enableRealPaperStock}
          showSupplierCreate={showSupplierCreate}
          setShowSupplierCreate={setShowSupplierCreate}
          supplierSearch={supplierSearch}
          setSupplierSearch={setSupplierSearch}
          suppliers={suppliers}
          filteredSuppliers={filteredSuppliers}
          newSupplierName={newSupplierName}
          setNewSupplierName={setNewSupplierName}
          newSupplierPhone={newSupplierPhone}
          setNewSupplierPhone={setNewSupplierPhone}
          newSupplierAddress={newSupplierAddress}
          setNewSupplierAddress={setNewSupplierAddress}
          handleCreateSupplier={handleCreateSupplier}
          labelCodeType={labelCodeType}
          qrPreviewUrl={qrPreviewUrl}
          printQuantity={printQuantity}
          setPrintQuantity={setPrintQuantity}
          printPrice={printPrice}
          setPrintPrice={setPrintPrice}
          printBarcode={printBarcode}
          handleSave={handleSave}
          setView={setView}
          setFormData={setFormData}
          onAddPricingTier={handleAddPricingTier}
          variants={variants}
          setVariants={setVariants}
        />
      )}

      <CreateGradeModal
        isOpen={isAddingGrade}
        onClose={() => { setIsAddingGrade(false); setNewGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' }); }}
        category={formData.category}
        newGradeForm={newGradeForm}
        setNewGradeForm={setNewGradeForm}
        handleCreateGrade={handleCreateGrade}
        savingGrade={savingGrade}
        handleFormKeyDown={handleFormKeyDown}
      />

      <AdjustStockModal
        adjustModal={adjustModal}
        setAdjustModal={setAdjustModal}
        adjustAmount={adjustAmount}
        setAdjustAmount={setAdjustAmount}
        adjustPcs={adjustPcs}
        setAdjustPcs={setAdjustPcs}
        adjustCurrentPcs={adjustCurrentPcs}
        confirmAdjustStock={confirmAdjustStock}
        adjustingStockId={adjustingStockId}
      />

      <BarcodePrintModal
        printModalProduct={printModalProduct}
        onClose={() => { setPrintModalProduct(null); setStatusMessage(null); }}
        labelCodeType={labelCodeType}
        printPrice={printPrice}
        setPrintPrice={setPrintPrice}
        printQuantity={printQuantity}
        setPrintQuantity={setPrintQuantity}
        printProductLabel={printProductLabel}
        grades={grades}
      />

      <DeleteProductModal
        deleteConfirmProduct={deleteConfirmProduct}
        onClose={() => setDeleteConfirmProduct(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />

      <BulkDeleteProductsModal
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        selectedCount={selectedProductIds.size}
        onConfirm={handleConfirmBulkDelete}
        isBulkDeleting={isBulkDeleting}
      />

      {/* ─── FLOATING TOASTS ─── */}
      <FloatToast message={statusMessage} onClose={() => setStatusMessage(null)} title={statusMessage?.type === 'success' ? 'INVENTORY STATUS' : 'INVENTORY ALERT'} duration={0} />

      <DataUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        defaultEntity="products"
        allowedEntities={['products']}
        hideEntityTabs={true}
        onImportSuccess={() => {
          setOffset(0);
          offsetRef.current = 0;
          loadProducts(true);
          refreshProductPricing();
          setStatusMessage({ text: 'Products imported successfully!', type: 'success' });
        }}
      />
    </div>
  );
}

