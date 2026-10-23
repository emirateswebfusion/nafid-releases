import { useCallback, useDeferredValue, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { Skeleton } from './ui/Skeleton';
import { isStaffRole, shouldApplyStaffMasking, calculateMaskedStockValuation } from '../utils/staffDataMasking';
import { isLegacyBillerRole } from '../utils/permissions';
import { useStockReportState } from './stock-report/hooks/useStockReportState';
import { useStockReportData } from './stock-report/hooks/useStockReportData';
import { useStockReportExports } from './stock-report/hooks/useStockReportExports';
import { StockSalesView } from './stock-report/views/StockSalesView';
import { StockReportHeader } from './stock-report/views/StockReportHeader';
import { StockSummaryCards } from './stock-report/views/StockSummaryCards';
import { StockFilterBar } from './stock-report/views/StockFilterBar';
import { StockCategoryBreakdown } from './stock-report/views/StockCategoryBreakdown';
import { StockLowStockAlerts } from './stock-report/views/StockLowStockAlerts';
import { StockTable } from './stock-report/views/StockTable';
import type { EnrichedProduct, Product } from './stock-report/stockReportTypes';

export function StockReport({ onClose, isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { shopName, tenantId, role } = useAuthStore();
  const sr = useStockReportState();
  const {
    maskingConfig, products, grades, billQuantities, loading, searchQuery, categoryFilter, stockFilter, partyFilter,
    productSupplierMap, viewMode, reportTab, salesSummary, salesSearch, salesFilter,
  } = sr;

  const { loadData } = useStockReportData({ sr, tenantId });

  const deferredSearch = useDeferredValue(searchQuery);
  const deferredCategory = useDeferredValue(categoryFilter);
  const deferredStock = useDeferredValue(stockFilter);
  const deferredParty = useDeferredValue(partyFilter);

  const filteredSalesSummary = useMemo(() => {
    let rows = salesSummary;
    const q = salesSearch.toLowerCase();
    if (q) rows = rows.filter(r => (r.name || '').toLowerCase().includes(q));
    if (salesFilter === 'bos') rows = rows.filter(r => Number(r.bos_qty) > 0);
    if (salesFilter === 'gst') rows = rows.filter(r => Number(r.gst_qty) > 0);
    return rows;
  }, [salesSummary, salesSearch, salesFilter]);

  const salesTotals = useMemo(() => ({
    products: salesSummary.length,
    gst: salesSummary.reduce((s, r) => s + Number(r.gst_qty), 0),
    bos: salesSummary.reduce((s, r) => s + Number(r.bos_qty), 0),
    bosProducts: salesSummary.filter(r => Number(r.bos_qty) > 0).length,
  }), [salesSummary]);

  const gradeMap = useMemo(() => new Map(grades.map(g => [g.grade_id, g])), [grades]);
  const billQtyMap = useMemo(() => new Map(billQuantities.map(b => [b.product_id, b])), [billQuantities]);

  const getMrp = useCallback((p: Product) => {
    const gr = p.grade_id ? gradeMap.get(p.grade_id) : null;
    const grRate = gr ? Number(gr.rate) : null;
    return grRate !== null && p.pricing_mode === 'GRADE_RATE' ? grRate : Number(p.base_price);
  }, [gradeMap]);

  const categories = useMemo(() =>
    Array.from(new Set(products.filter(p => p.category).map(p => p.category))).sort(),
    [products]
  );

  const filteredProducts = useMemo(() =>
    products.filter(p => {
      // Staff Operational Option Check: If biller does NOT have OPT_VIEW_GST permission, restrict viewing to GST products ONLY
      const { role, restrictedPage } = useAuthStore.getState();
      if (isLegacyBillerRole(role)) {
        const permissions = restrictedPage ? restrictedPage.split(',').filter(Boolean) : [];
        const hasOptViewGst = permissions.includes('OPT_VIEW_GST');
        if (!hasOptViewGst && Number(p.is_gst_applicable) !== 1) {
          return false;
        }
      }

      // Per-tab GST applicability filter
      if (viewMode === 'estimate' && Number(p.is_gst_applicable) === 1) return false;
      if (viewMode === 'gst' && Number(p.is_gst_applicable) !== 1) return false;
      // combined → no GST filter
      if (deferredSearch) {
        const q = deferredSearch.toLowerCase();
        const qNoSpace = q.replace(/\s+/g, '');
        const cleanText = (s: string) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        const qClean = cleanText(deferredSearch);

        const name = (p.name || '').toLowerCase();
        const barcode = (p.sku_barcode || '').toLowerCase();
        const code = (p.item_code || '').toLowerCase();

        const nameNoSpace = name.replace(/\s+/g, '');
        const barcodeNoSpace = barcode.replace(/\s+/g, '');
        const codeNoSpace = code.replace(/\s+/g, '');

        const nameClean = cleanText(name);
        const barcodeClean = cleanText(barcode);
        const codeClean = cleanText(code);

        const matches =
          name.includes(q) ||
          barcode.includes(q) ||
          code.includes(q) ||
          (qNoSpace.length > 0 && (
            nameNoSpace.includes(qNoSpace) ||
            barcodeNoSpace.includes(qNoSpace) ||
            codeNoSpace.includes(qNoSpace)
          )) ||
          (qClean.length > 0 && (
            nameClean.includes(qClean) ||
            barcodeClean.includes(qClean) ||
            codeClean.includes(qClean)
          ));

        if (!matches) return false;
      }
      if (deferredCategory && p.category !== deferredCategory) return false;
      if (deferredStock === 'in_stock' && Number(p.current_stock) <= 0) return false;
      if (deferredStock === 'low_stock' &&
          !(Number(p.current_stock) <= Number(p.reorder_level) && Number(p.reorder_level) > 0 && Number(p.current_stock) > 0)) return false;
      if (deferredStock === 'out_of_stock' && Number(p.current_stock) > 0) return false;
      if (deferredStock === 'dummy_gst') {
        const bq = billQtyMap.get(p.product_id);
        const gstPurchased = bq ? Number(bq.gst_purchased_qty) : 0;
        const gstSold = bq ? Number(bq.gst_qty) : 0;
        if (gstPurchased - gstSold <= 0) return false;
      }
      // Party filter: only show products that have been purchased from the selected party
      if (deferredParty) {
        const suppliers = productSupplierMap.get(p.product_id);
        if (!suppliers || !suppliers.has(deferredParty)) return false;
      }
      return true;
    }),
    [products, deferredSearch, deferredCategory, deferredStock, viewMode, deferredParty, productSupplierMap, billQtyMap]
  );

  const {
    totalStock,
    totalPurchaseValue,
    totalMrpValue,
    totalSellingValue,
    totalProducts,
    outOfStockCount,
    groupedByCategory,
    categoryStats,
    maxPct,
    lowStockItems,
  } = useMemo(() => {
    let tStock = 0;
    let tPurchase = 0;
    let tMrp = 0;
    let tSelling = 0;
    let tOutOfStock = 0;
    const groups: Record<string, EnrichedProduct[]> = {};
    const catAcc: Record<string, { stock: number; purchase: number; mrp: number; selling: number; count: number }> = {};
    const lowAcc: EnrichedProduct[] = [];

    for (const p of filteredProducts) {
      const rate = getMrp(p);
      let finalSellingPrice = rate;
      if (p.offer_price) finalSellingPrice = Number(p.offer_price);
      else if (p.discount_flat) finalSellingPrice = rate - Number(p.discount_flat);
      else if (p.discount_percent) finalSellingPrice = rate * (1 - Number(p.discount_percent) / 100);
      finalSellingPrice = Math.max(finalSellingPrice, 0);
      const da = (() => { try { return JSON.parse(p.domain_attributes || '{}'); } catch { return {}; } })();
      const unitWeightGrams = Number(da?.weight_grams) || 0;
      const cs = Number(p.current_stock);
      const valStock = Math.max(0, cs);
      const totalWeight = p.billing_type === 'WEIGHT' ? valStock : unitWeightGrams > 0 ? (unitWeightGrams / 1000) * valStock : 0;
      const totalPcs = p.billing_type === 'WEIGHT' ? (Number(da?.pcs) || 0) : valStock;
      const isLowStock = cs <= Number(p.reorder_level) && Number(p.reorder_level) > 0;
      const isOutOfStock = cs <= 0;
      const gr = p.grade_id ? gradeMap.get(p.grade_id) : null;
      const bq = billQtyMap.get(p.product_id);

      const gstQty = bq ? Number(bq.gst_qty) : 0;
      const gstPurchasedQty = bq ? Number(bq.gst_purchased_qty) : 0;
      const gstPaperStock = p.paper_stock ?? 0;

      const ep: EnrichedProduct = { 
        ...p, 
        rate, 
        finalSellingPrice, 
        totalWeight, 
        totalPcs, 
        isLowStock, 
        isOutOfStock, 
        gradeName: gr?.grade_name || '-', 
        gstQty, 
        estimateQty: bq ? Number(bq.estimate_qty) : 0, 
        gstPurchasedQty, 
        gstPaperStock 
      };

      tStock += valStock;
      tPurchase += Number(p.purchase_price) * valStock;
      tMrp += rate * valStock;
      tSelling += finalSellingPrice * valStock;
      if (isOutOfStock) tOutOfStock++;

      const cat = p.category || 'Uncategorized';
      if (!groups[cat]) {
        groups[cat] = [];
        catAcc[cat] = { stock: 0, purchase: 0, mrp: 0, selling: 0, count: 0 };
      }
      groups[cat].push(ep);
      catAcc[cat].stock += valStock;
      catAcc[cat].purchase += Number(p.purchase_price) * valStock;
      catAcc[cat].mrp += rate * valStock;
      catAcc[cat].selling += finalSellingPrice * valStock;
      catAcc[cat].count++;

      if (isLowStock) lowAcc.push(ep);
    }

    const stats = Object.entries(catAcc)
      .map(([name, c]) => ({
        name,
        stock: c.stock,
        purchase: c.purchase,
        mrp: c.mrp,
        selling: c.selling,
        pct: tStock > 0 ? (c.stock / tStock) * 100 : 0,
        count: c.count,
      }))
      .sort((a, b) => b.stock - a.stock);

    const max = Math.max(...stats.map(c => c.pct), 1);

    return {
      totalStock: tStock,
      totalPurchaseValue: tPurchase,
      totalMrpValue: tMrp,
      totalSellingValue: tSelling,
      totalProducts: filteredProducts.length,
      outOfStockCount: tOutOfStock,
      groupedByCategory: groups,
      categoryStats: stats,
      maxPct: max,
      lowStockItems: lowAcc,
    };
  }, [filteredProducts, getMrp, gradeMap]);

  const isStaff = isStaffRole(role);
  const shouldMask = shouldApplyStaffMasking(role, maskingConfig);
  const canViewCost = !shouldMask || !maskingConfig.hide_purchase_cost_for_staff;

  const maskedStockValue = useMemo(() => {
    return calculateMaskedStockValuation(totalSellingValue, maskingConfig, isStaff);
  }, [totalSellingValue, maskingConfig, isStaff]);

  const maskedMrpValue = useMemo(() => {
    return calculateMaskedStockValuation(totalMrpValue, maskingConfig, isStaff);
  }, [totalMrpValue, maskingConfig, isStaff]);

  const maskedPurchaseValue = useMemo(() => {
    return calculateMaskedStockValuation(totalPurchaseValue, maskingConfig, isStaff);
  }, [totalPurchaseValue, maskingConfig, isStaff]);

  const { handleDownloadCsv, handlePrint } = useStockReportExports({
    sr, shopName, tenantId, filteredProducts, gradeMap, billQtyMap, getMrp, canViewCost, isStaff, shouldMask,
  });

  if (reportTab === 'sales') {
    return (
      <StockSalesView
        sr={sr}
        salesTotals={salesTotals}
        filteredSalesSummary={filteredSalesSummary}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">

      {/* ══════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════ */}
      <StockReportHeader
        sr={sr}
        isStaff={isStaff}
        isRestricted={isRestricted}
        onClose={onClose}
        loadData={loadData}
        handleDownloadCsv={handleDownloadCsv}
        handlePrint={handlePrint}
      />

      {/* ══════════════════════════════════════════
          CONTENT
      ══════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto bg-muted/[0.02]">
        <div className="w-full px-4 sm:px-6 py-6 space-y-6">

          {/* Themed Stats Cards */}
          <StockSummaryCards
            sr={sr}
            isStaff={isStaff}
            shouldMask={shouldMask}
            canViewCost={canViewCost}
            totalProducts={totalProducts}
            outOfStockCount={outOfStockCount}
            totalStock={totalStock}
            totalSellingValue={totalSellingValue}
            totalPurchaseValue={totalPurchaseValue}
            maskedStockValue={maskedStockValue}
            maskedMrpValue={maskedMrpValue}
            maskedPurchaseValue={maskedPurchaseValue}
          />

          {/* Filters */}
          <StockFilterBar sr={sr} categories={categories} />

          {/* Category Breakdown */}
          <StockCategoryBreakdown sr={sr} categoryStats={categoryStats} maxPct={maxPct} />

          {/* Low Stock Alerts */}
          {!loading && stockFilter !== 'low_stock' && lowStockItems.length > 0 && (
            <StockLowStockAlerts sr={sr} lowStockItems={lowStockItems} />
          )}

          {/* Detailed Table */}
          <StockTable
            sr={sr}
            groupedByCategory={groupedByCategory}
            filteredProducts={filteredProducts}
            canViewCost={canViewCost}
            shouldMask={shouldMask}
            totalStock={totalStock}
            maskedPurchaseValue={maskedPurchaseValue}
            maskedMrpValue={maskedMrpValue}
            maskedStockValue={maskedStockValue}
          />

          <div className="text-center text-xs text-muted-foreground py-2">
            {loading ? <Skeleton className="h-3 w-48 mx-auto" /> : `Generated by Nafid POS &mdash; ${new Date().toLocaleString('en-IN')} &middot; ${totalProducts} products &middot; ${Object.keys(groupedByCategory).length} categories`}
          </div>
        </div>
      </div>
    </div>
  );
}
