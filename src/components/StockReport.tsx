import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import { useAuthStore } from '../store/authStore';
import { Package, TrendingUp, Search, X, Printer, FileText, RefreshCw, Activity, Receipt, BarChart3, Building2, ArrowLeft, ShoppingCart, Tag, Percent } from 'lucide-react';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { Skeleton } from './ui/Skeleton';
import clsx from 'clsx';

interface Product {
  product_id: string;
  tenant_id: string;
  name: string;
  item_code: string;
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
  domain_attributes: string;
  discount_percent?: number | null;
  discount_flat?: number | null;
  offer_price?: number | null;
  billing_type?: string;
  grade_id?: string;
  pricing_mode?: string;
  sync_status: string;
  is_service_item?: number;
  created_at?: string;
  updated_at?: string;
  paper_stock?: number;
}

interface EnrichedProduct extends Product {
  rate: number;
  finalSellingPrice: number;
  totalWeight: number;
  totalPcs: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  gradeName: string;
  gstQty: number;
  estimateQty: number;
  gstPurchasedQty: number;
  gstPaperStock: number;
}

interface ProductBillQty {
  product_id: string;
  gst_qty: number;
  estimate_qty: number;
  gst_purchased_qty?: number;
}

const CACHE_TTL = 5 * 60 * 1000;
const reportCache = new Map<string, { products: Product[]; grades: any[]; timestamp: number }>();

export function StockReport({ onClose, isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { shopName, tenantId } = useAuthStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [billQuantities, setBillQuantities] = useState<ProductBillQty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'dummy_gst'>('all');
  const [partyFilter, setPartyFilter] = useState('');
  const [parties, setParties] = useState<any[]>([]);
  const [productSupplierMap, setProductSupplierMap] = useState<Map<string, Set<string>>>(new Map());
  const [viewMode, setViewMode] = useState<'estimate' | 'gst' | 'combined'>('combined');
  const [reportTab, setReportTab] = useState<'stock' | 'sales'>('stock');
  const [salesSummary, setSalesSummary] = useState<any[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesSearch, setSalesSearch] = useState('');
  const [salesFilter, setSalesFilter] = useState<'all' | 'bos' | 'gst'>('all');

  const deferredSearch = useDeferredValue(searchQuery);
  const deferredCategory = useDeferredValue(categoryFilter);
  const deferredStock = useDeferredValue(stockFilter);
  const deferredParty = useDeferredValue(partyFilter);

  const cacheKey = tenantId || 'global';

  const buildProductSupplierMap = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const bills = await window.electronAPI.dbGetPurchaseBills({ tenant_id: cacheKey, limit: 2000 });
      if (!Array.isArray(bills)) return;
      const map = new Map<string, Set<string>>();
      const itemPromises = bills.map(bill =>
        window.electronAPI!.dbGetPurchaseBillItems(bill.purchase_bill_id)
          .then(items => {
            if (!Array.isArray(items)) return;
            const supplier = bill.supplier_name || 'Unknown';
            items.forEach((item: any) => {
              const pid = item.product_id;
              if (!pid) return;
              if (!map.has(pid)) map.set(pid, new Set());
              map.get(pid)!.add(supplier);
            });
          })
          .catch(() => {})
      );
      await Promise.all(itemPromises);
      setProductSupplierMap(map);
    } catch (e) {
      console.error('[StockReport] buildProductSupplierMap error:', e);
    }
  }, [cacheKey]);

  const loadData = useCallback(async (forceRefresh = false) => {
    const cached = reportCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setProducts(cached.products.filter((p: any) => Number(p.is_service_item) !== 1));
      setGrades(cached.grades);
      setLastUpdated(new Date(cached.timestamp));
      setLoading(false);
      return;
    }

    if (forceRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      if (window.electronAPI) {
        const [prodRes, gradeRes, partiesRes] = await Promise.all([
          window.electronAPI.dbGetProducts({ tenant_id: cacheKey, limit: 100000 }).catch(() => null),
          window.electronAPI.dbGetGrades(cacheKey).catch(() => null),
          window.electronAPI.dbGetParties(cacheKey).catch(() => null),
        ]);
        if (Array.isArray(prodRes) && Array.isArray(gradeRes)) {
          const nonServiceProducts = prodRes.filter((p: any) => Number(p.is_service_item) !== 1);
          setProducts(nonServiceProducts);
          setGrades(gradeRes);
          reportCache.set(cacheKey, { products: nonServiceProducts, grades: gradeRes, timestamp: Date.now() });
          setLastUpdated(new Date());
        }
        if (Array.isArray(partiesRes)) setParties(partiesRes);
        window.electronAPI.dbGetProductBillQuantities(cacheKey)
          .then(res => setBillQuantities(Array.isArray(res) ? res : []))
          .catch(() => {});
        // Build product-supplier map in the background
        buildProductSupplierMap();
      }
    } catch (e) {
      console.error('[StockReport] loadData error:', e);
    }

    setLoading(false);
    setRefreshing(false);
  }, [cacheKey, buildProductSupplierMap]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'stock_report_default_view' })
        .then((val: any) => {
          if (val === 'estimate' || val === 'gst' || val === 'combined') { setViewMode(val); return; }
          // Fallback: if GSTIN is set, default to GST tab; otherwise Estimate
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' })
            .then((gstin: any) => setViewMode(gstin && String(gstin).trim() ? 'gst' : 'estimate'))
            .catch(() => {});
        })
        .catch(() => {
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' })
            .then((gstin: any) => setViewMode(gstin && String(gstin).trim() ? 'gst' : 'estimate'))
            .catch(() => {});
        });
    }
  }, [tenantId]);

  useEffect(() => {
    if (!window.electronAPI || reportTab !== 'sales') return;
    let cancelled = false;
    setSalesLoading(true);
    window.electronAPI.dbGetProductSalesSummary({ tenant_id: tenantId || 'global' })
      .then((res) => {
        if (!cancelled && Array.isArray(res))
          setSalesSummary(res.filter((r: any) => Number(r.is_service_item) !== 1 && (r.name || '') !== 'Service Charge'));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSalesLoading(false); });
    return () => { cancelled = true; };
  }, [reportTab, tenantId]);

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

  const formatCurrency = (amount: number) => `\u20B9${amount.toFixed(2)}`;

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
      if (role === 'BILLER') {
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
        if (!p.name.toLowerCase().includes(q) &&
            !p.sku_barcode.toLowerCase().includes(q) &&
            !(p.item_code || '').toLowerCase().includes(q)) return false;
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


  const handleDownloadCsv = () => {
    const headers = ['Product', 'Category', 'Grade', 'Stock'];
    if (viewMode !== 'estimate') headers.push('GST Qty');
    if (viewMode !== 'gst') headers.push('Est Qty');
    headers.push('Weight', 'Purchase Price', 'MRP', 'Selling Price');

    const rows: string[][] = [headers];
    for (const p of filteredProducts) {
      const gr = p.grade_id ? gradeMap.get(p.grade_id) : null;
      const bq = billQtyMap.get(p.product_id);
      const da = (() => { try { return JSON.parse(p.domain_attributes || '{}'); } catch { return {}; } })();
      const unitWeightGrams = Number(da?.weight_grams) || 0;
      const totalWeight = p.billing_type === 'WEIGHT' ? Number(p.current_stock) : unitWeightGrams > 0 ? (unitWeightGrams / 1000) * Number(p.current_stock) : 0;
      const totalPcs = p.billing_type === 'WEIGHT' ? (Number(da?.pcs) || 0) : Number(p.current_stock);
      const rate = getMrp(p);
      let finalSellingPrice = rate;
      if (p.offer_price) finalSellingPrice = Number(p.offer_price);
      else if (p.discount_flat) finalSellingPrice = rate - Number(p.discount_flat);
      else if (p.discount_percent) finalSellingPrice = rate * (1 - Number(p.discount_percent) / 100);
      finalSellingPrice = Math.max(finalSellingPrice, 0);
      const weightStr = totalWeight > 0 ? totalWeight.toFixed(2) + ' KG' + (totalPcs > 0 ? ' (' + totalPcs + ' pcs)' : '') : '-';
      const row: string[] = [
        p.name,
        p.category || '-',
        gr?.grade_name || '-',
        Number(p.current_stock).toFixed(0),
      ];
      if (viewMode !== 'estimate') row.push(bq ? Number(bq.gst_qty).toFixed(0) : '0');
      if (viewMode !== 'gst') row.push(bq ? Number(bq.estimate_qty).toFixed(0) : '0');
      row.push(weightStr, formatCurrency(Number(p.purchase_price) || 0), formatCurrency(rate), formatCurrency(finalSellingPrice));
      rows.push(row);
    }
    const csvContent = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `StockReport_${shopName || 'Shop'}_${new Date().toLocaleDateString('en-CA')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = async () => {
    const repGroupedByCategory = filteredProducts.reduce<Record<string, typeof filteredProducts>>((acc, p) => {
      const cat = p.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(p);
      return acc;
    }, {});

    const totalStockVal = filteredProducts.reduce((sum, p) => sum + Math.max(0, Number(p.current_stock)), 0);
    const totalValueVal = filteredProducts.reduce((sum, p) => {
      const rate = getMrp(p);
      return sum + (rate * Math.max(0, Number(p.current_stock)));
    }, 0);
    const totalProductsVal = filteredProducts.length;
    const outOfStockVal = filteredProducts.filter(p => Number(p.current_stock) <= 0).length;

    const totalGstQty = billQuantities.reduce((s, b) => s + Number(b.gst_qty), 0);
    const totalEstQty = billQuantities.reduce((s, b) => s + Number(b.estimate_qty), 0);

    const printColSpan = viewMode === 'combined' ? 9 : 8;
    const gstTh = '<th class="text-right">GST Qty</th>';
    const estTh = '<th class="text-right">Est Qty</th>';

    const categoryRows = Object.entries(repGroupedByCategory).map(([cat, items]) => {
      const detailRows = items.map(p => {
        const gr = p.grade_id ? gradeMap.get(p.grade_id) : null;
        const grRate = gr ? Number(gr.rate) : null;
        const rate = grRate !== null && p.pricing_mode === 'GRADE_RATE' ? Number(p.base_price) + grRate : Number(p.base_price);
        const value = rate * Math.max(0, Number(p.current_stock));
        const da = (() => { try { return JSON.parse(p.domain_attributes || '{}'); } catch { return {}; } })();
        const unitWeightGrams = Number(da?.weight_grams) || 0;
        const totalWeight = p.billing_type === 'WEIGHT' ? Number(p.current_stock) : unitWeightGrams > 0 ? (unitWeightGrams / 1000) * Number(p.current_stock) : 0;
        const totalPcs = p.billing_type === 'WEIGHT' ? (Number(da?.pcs) || 0) : 0;
        const weightStr = totalWeight > 0 ? totalWeight.toFixed(2) + ' KG' + (totalPcs > 0 ? ' (' + totalPcs + ' pcs)' : '') : '-';
        const bq = billQtyMap.get(p.product_id);
        const gstQty = bq ? Number(bq.gst_qty).toFixed(0) : '0';
        const estQty = bq ? Number(bq.estimate_qty).toFixed(0) : '0';
        let cells = `<td style="padding:6px;border:1px solid #ddd;">${p.name}</td>\n          <td style="padding:6px;border:1px solid #ddd;color:#666;">${p.category || '-'}</td>\n          <td style="padding:6px;border:1px solid #ddd;color:#666;">${gr?.grade_name || '-'}</td>\n          <td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;">${Number(p.current_stock).toFixed(0)}</td>`;
        if (viewMode !== 'estimate') cells += `\n          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${gstQty}</td>`;
        if (viewMode !== 'gst') cells += `\n          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${estQty}</td>`;
        cells += `\n          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${weightStr}</td>\n          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${formatCurrency(rate)}</td>\n          <td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;">${formatCurrency(value)}</td>`;
        return `<tr>\n          ${cells}\n        </tr>`;
      }).join('');
      return `<tr style="background:#e8f0fe;font-weight:bold;">\n        <td colspan="${printColSpan}" style="padding:8px 6px;border:1px solid #ddd;color:#2563eb;">${cat}</td>\n      </tr>${detailRows}`;
    }).join('');

    const theadCols = '<th>Product</th><th>Category</th><th>Grade</th><th class="text-right">Stock</th>'
      + (viewMode !== 'estimate' ? gstTh : '')
      + (viewMode !== 'gst' ? estTh : '')
      + '<th class="text-right">Weight</th><th class="text-right">Rate</th><th class="text-right">Value</th>';

    const html = `<!DOCTYPE html>
      <html>
        <head>
          <title>Stock Report - ${shopName}</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 20px; margin: 0; }
            .header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 3px solid #2563eb; }
            .header h1 { font-size: 24px; margin: 0; color: #1a1a1a; }
            .header p { font-size: 12px; color: #666; margin: 3px 0; }
            .summary-row { display: flex; gap: 12px; margin-bottom: 20px; }
            .summary-card { flex: 1; padding: 10px 14px; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; }
            .summary-card .value { font-size: 20px; font-weight: 800; }
            .summary-card .label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            th { background: #f3f4f6; text-align: left; padding: 7px 6px; border: 1px solid #d1d5db; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
            td { padding: 5px 6px; border: 1px solid #e5e7eb; }
            .cat-header { background: #eff6ff; font-weight: 700; font-size: 11px; color: #2563eb; }
            .cat-header td { padding: 7px 6px; }
            .total-row { background: #f9fafb; font-weight: 800; }
            .total-row td { padding: 8px 6px; border-top: 2px solid #d1d5db; }
            .text-right { text-align: right; }
            .footer { text-align: center; font-size: 9px; color: #9ca3af; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${shopName || 'Shop'}</h1>
            <p>Stock Report &mdash; ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            <p style="font-size:10px;color:#888;">Generated at ${new Date().toLocaleTimeString('en-IN')}</p>
          </div>\n\n          <div class="summary-row">
            <div class="summary-card"><div class="value">${totalProductsVal}</div><div class="label">Total Products</div></div>
            <div class="summary-card"><div class="value">${totalStockVal.toFixed(0)}</div><div class="label">Total Stock</div></div>
            <div class="summary-card"><div class="value" style="color:#059669;">${formatCurrency(totalValueVal)}</div><div class="label">Stock Value</div></div>
            <div class="summary-card"><div class="value" style="color:${outOfStockVal > 0 ? '#d97706' : '#059669'};">${outOfStockVal}</div><div class="label">Out of Stock</div></div>
          </div>\n\n          <table>
            <thead>
              <tr>
                ${theadCols}
              </tr>
            </thead>
            <tbody>
              ${categoryRows}
              <tr class="total-row">
                <td colspan="3">Grand Total</td>
                <td class="text-right">${totalStockVal.toFixed(0)}</td>
                ${viewMode !== 'estimate' ? `<td class="text-right">${totalGstQty.toFixed(0)}</td>` : ''}
                ${viewMode !== 'gst' ? `<td class="text-right">${totalEstQty.toFixed(0)}</td>` : ''}
                <td class="text-right"></td>
                <td class="text-right"></td>
                <td class="text-right" style="color:#059669;">${formatCurrency(totalValueVal)}</td>
              </tr>
            </tbody>
          </table>\n\n          <div class="footer">
            Generated by Vendora POS &mdash; ${new Date().toLocaleString('en-IN')} &middot; Showing all ${totalProductsVal} products
          </div>
        </body>
      </html>`;

    if (window.electronAPI) {
      const printResult = await window.electronAPI.printA4Html(tenantId || 'global', html);
      if (!printResult.success) {
        const pw = window.open('', '_blank');
        if (pw) { pw.document.write(html); pw.document.close(); setTimeout(() => pw.print(), 500); }
      }
    } else {
      const pw = window.open('', '_blank');
      if (pw) { pw.document.write(html); pw.document.close(); setTimeout(() => pw.print(), 500); }
    }
  };

  if (reportTab === 'sales') {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-background">
        <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-4 px-5 py-3 select-none">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-bold text-foreground truncate">Product Sales Summary</h1>
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse shrink-0" />
                </div>
                <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
                  GST vs Bill of Supply quantities sold per product
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => { setSalesSummary([]); setReportTab('stock'); }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Stock
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-muted/[0.02]">
          <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 select-none">
            <div className="bg-card border border-border p-5 rounded-[24px] flex flex-col !items-start gap-1 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <p className="text-2xl font-black text-foreground leading-none font-mono">{salesLoading ? <Skeleton className="h-7 w-16" /> : salesTotals.products.toLocaleString('en-IN')}</p>
              <p className="text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground mt-1">Products Sold</p>
            </div>
            <div className="bg-card border border-border p-5 rounded-[24px] flex flex-col !items-start gap-1 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <p className="text-2xl font-black text-sky-600 dark:text-sky-400 leading-none font-mono">{salesLoading ? <Skeleton className="h-7 w-16" /> : salesTotals.gst.toFixed(0)}</p>
              <p className="text-[9px] uppercase tracking-wider font-extrabold text-sky-500 mt-1">Sold as GST</p>
            </div>
            <div className="bg-card border border-border p-5 rounded-[24px] flex flex-col !items-start gap-1 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400 leading-none font-mono">{salesLoading ? <Skeleton className="h-7 w-16" /> : salesTotals.bos.toFixed(0)}</p>
              <p className="text-[9px] uppercase tracking-wider font-extrabold text-amber-500 mt-1">Sold as BoS</p>
            </div>
            <div className="bg-card border border-border p-5 rounded-[24px] flex flex-col !items-start gap-1 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <p className="text-2xl font-black text-foreground leading-none font-mono">{salesLoading ? <Skeleton className="h-7 w-16" /> : salesTotals.bosProducts.toLocaleString('en-IN')}</p>
              <p className="text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground mt-1">Sold as BoS (Ever)</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 flex flex-col justify-between group relative p-5 select-none">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative w-full sm:max-w-xs !max-w-xs">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search product..."
                  value={salesSearch}
                  onChange={e => setSalesSearch(e.target.value)}
                  className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
                />
                {salesSearch && (
                  <button onClick={() => setSalesSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <select
                value={salesFilter}
                onChange={e => setSalesFilter(e.target.value as any)}
                className="bg-background border border-border rounded-xl py-2.5 px-3 pr-8 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 appearance-none transition-all cursor-pointer"
              >
                <option value="all">All Products</option>
                <option value="bos">Only BoS Sales</option>
                <option value="gst">Only GST Sales</option>
              </select>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Product</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-400">Sold as GST</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Sold as BoS</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Total Sold</th>
                  </tr>
                </thead>
                <tbody>
                  {salesLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <td className="px-3 py-3"><Skeleton className="h-4 w-40" /></td>
                        <td className="px-3 py-3"><Skeleton className="h-4 w-12 ml-auto" /></td>
                        <td className="px-3 py-3"><Skeleton className="h-4 w-12 ml-auto" /></td>
                        <td className="px-3 py-3"><Skeleton className="h-4 w-12 ml-auto" /></td>
                      </tr>
                    ))
                  ) : filteredSalesSummary.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-10 text-center text-xs text-muted-foreground">
                        No sales found
                      </td>
                    </tr>
                  ) : (
                    filteredSalesSummary.map(r => (
                      <tr key={r.product_id} className="border-b border-border/60 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground">{r.name}</span>
                            {Number(r.bos_qty) > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-black">BoS</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right text-xs font-bold text-sky-600 dark:text-sky-400 tabular-nums">{Number(r.gst_qty).toFixed(0)}</td>
                        <td className="px-3 py-3 text-right text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums">{Number(r.bos_qty).toFixed(0)}</td>
                        <td className="px-3 py-3 text-right text-xs font-black text-foreground tabular-nums">{Number(r.total_qty).toFixed(0)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">

      {/* ══════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════ */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-4 px-5 py-3 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-foreground truncate">Stock Report</h1>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
            <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
              {loading ? <Skeleton className="h-3 w-16 inline-block align-middle" /> : products.length} products
              {lastUpdated && !loading && (
                <span className="ml-2 font-normal text-muted-foreground/60">&middot; {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </p>
          </div>
        </div>

          <div className="flex items-center gap-x-0.5 bg-muted/50 rounded-xl p-0.5 shrink-0">
            {([
              { tab: 'stock' as const, label: 'Stock', icon: Package },
              { tab: 'sales' as const, label: 'Product Sales', icon: BarChart3 },
            ]).map(({ tab, label, icon: Icon }) => (
              <button
                key={tab}
                onClick={() => setReportTab(tab)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer',
                  reportTab === tab
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Icon className={clsx('w-3 h-3', reportTab === tab ? 'text-primary-foreground' : 'text-muted-foreground')} />
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-x-0.5 bg-muted/50 rounded-xl p-0.5 shrink-0">
            {([
              { mode: 'estimate', label: 'Estimate', icon: Receipt, color: 'text-amber-500' },
              { mode: 'gst',      label: 'GST',      icon: FileText, color: 'text-sky-500' },
              { mode: 'combined', label: 'All',      icon: BarChart3, color: 'text-primary' },
            ] as const).map(({ mode, label, icon: Icon, color }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer',
                  viewMode === mode
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Icon className={clsx('w-3 h-3', viewMode === mode ? 'text-primary-foreground' : color)} />
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50 border border-border"
              title="Refresh data"
            >
              <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
            </button>
            <button
              onClick={handleDownloadCsv}
              disabled={loading}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={handlePrint}
              disabled={loading}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" /> Print Report
            </button>
            <button
              onClick={isRestricted ? () => useAuthStore.getState().logout() : onClose}
              className="p-2 rounded-xl border border-destructive/30 hover:bg-destructive/10 text-destructive transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center shadow-xs"
              title="Close"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════
          CONTENT
      ══════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto bg-muted/[0.02]">
        <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-6">

          {/* Themed Stats Cards */}
          <div className="grid grid-cols-3 gap-5 select-none">
            <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <div className="p-3 bg-gradient-to-br from-blue-500/10 to-blue-500/5 text-blue-600 dark:text-blue-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                <Package className="w-5 h-5" />
              </div>
              <div className="leading-tight text-left min-w-0 flex-1">
                <p className="text-2xl font-black text-foreground font-mono truncate">{loading ? <Skeleton className="h-7 w-20" /> : totalProducts.toLocaleString('en-IN')}</p>
                <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Total Products</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{loading ? <Skeleton className="h-3 w-24" /> : `${products.length} total in system`}</p>
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <div className="p-3 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="leading-tight text-left min-w-0 flex-1">
                <p className="text-2xl font-black text-foreground font-mono truncate">{loading ? <Skeleton className="h-7 w-28" /> : formatCurrency(totalSellingValue)}</p>
                <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Stock Value</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">At selling price</p>
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <div className={clsx(
                "p-3 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform bg-gradient-to-br",
                loading ? "from-gray-500/10 to-gray-500/5 text-gray-500" : outOfStockCount > 0 ? "from-amber-500/10 to-amber-500/5 text-amber-600 dark:text-amber-400" : "from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400"
              )}>
                <Activity className="w-5 h-5" />
              </div>
              <div className="leading-tight text-left min-w-0 flex-1">
                <p className={clsx(
                  "text-2xl font-black font-mono truncate",
                  loading ? "text-foreground" : outOfStockCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                )}>{loading ? <Skeleton className="h-7 w-16" /> : totalStock.toFixed(0)}</p>
                <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Stock Health</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{loading ? <Skeleton className="h-3 w-28" /> : (outOfStockCount > 0 ? `${outOfStockCount} out of stock` : 'All in stock')}</p>
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <div className="p-3 bg-gradient-to-br from-violet-500/10 to-violet-500/5 text-violet-600 dark:text-violet-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div className="leading-tight text-left min-w-0 flex-1">
                <p className="text-2xl font-black text-foreground font-mono truncate">{loading ? <Skeleton className="h-7 w-28" /> : formatCurrency(totalPurchaseValue)}</p>
                <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Purchase Value</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">At purchase price</p>
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <div className="p-3 bg-gradient-to-br from-sky-500/10 to-sky-500/5 text-sky-600 dark:text-sky-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                <Tag className="w-5 h-5" />
              </div>
              <div className="leading-tight text-left min-w-0 flex-1">
                <p className="text-2xl font-black text-foreground font-mono truncate">{loading ? <Skeleton className="h-7 w-28" /> : formatCurrency(totalMrpValue)}</p>
                <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">MRP Value</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">At max retail price</p>
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <div className="p-3 bg-gradient-to-br from-rose-500/10 to-rose-500/5 text-rose-600 dark:text-rose-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                <Percent className="w-5 h-5" />
              </div>
              <div className="leading-tight text-left min-w-0 flex-1">
                <p className={clsx(
                  "text-2xl font-black font-mono truncate",
                  totalSellingValue - totalPurchaseValue >= 0 ? "text-foreground" : "text-rose-600 dark:text-rose-400"
                )}>{loading ? <Skeleton className="h-7 w-28" /> : formatCurrency(totalSellingValue - totalPurchaseValue)}</p>
                <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Potential Margin</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Selling − purchase</p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 flex flex-col justify-between group relative p-5 select-none">
            <div className="flex items-center gap-3">
              <div className="relative w-full sm:max-w-xs flex-1 !max-w-xs">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search name, barcode, code..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="bg-background border border-border rounded-xl py-2.5 px-3 pr-8 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 appearance-none transition-all cursor-pointer"
              >
                <option value="">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={stockFilter}
                onChange={e => setStockFilter(e.target.value as any)}
                className="bg-background border border-border rounded-xl py-2.5 px-3 pr-8 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 appearance-none transition-all cursor-pointer"
              >
                <option value="all">All Stock</option>
                <option value="in_stock">In Stock</option>
                <option value="low_stock">Low Stock</option>
                <option value="out_of_stock">Out of Stock</option>
                {(viewMode === 'gst' || viewMode === 'combined') && (
                  <option value="dummy_gst">Dummy GST Stock Only</option>
                )}
              </select>
              <select
                value={partyFilter}
                onChange={e => setPartyFilter(e.target.value)}
                className="bg-background border border-border rounded-xl py-2.5 px-3 pr-8 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 appearance-none transition-all cursor-pointer min-w-[160px]"
              >
                <option value="">All Suppliers</option>
                {parties.filter(p => p.name).map(p => (
                  <option key={p.party_id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
            {searchQuery || categoryFilter || stockFilter !== 'all' || partyFilter ? (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[11px] font-bold">
                      Search: "{searchQuery}"
                      <button onClick={() => setSearchQuery('')} className="hover:bg-primary/20 rounded p-0.5 transition-colors cursor-pointer"><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {categoryFilter && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[11px] font-bold">
                      {categoryFilter}
                      <button onClick={() => setCategoryFilter('')} className="hover:bg-sky-500/20 rounded p-0.5 transition-colors cursor-pointer"><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {stockFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-bold">
                      {stockFilter === 'in_stock' ? 'In Stock' : stockFilter === 'low_stock' ? 'Low Stock' : stockFilter === 'out_of_stock' ? 'Out of Stock' : 'Dummy GST Stock'}
                      <button onClick={() => setStockFilter('all')} className="hover:bg-amber-500/20 rounded p-0.5 transition-colors cursor-pointer"><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {partyFilter && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[11px] font-bold">
                      <Building2 className="w-3 h-3" />
                      {partyFilter}
                      <button onClick={() => setPartyFilter('')} className="hover:bg-violet-500/20 rounded p-0.5 transition-colors cursor-pointer"><X className="w-3 h-3" /></button>
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setSearchQuery(''); setCategoryFilter(''); setStockFilter('all'); setPartyFilter(''); }}
                  className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-95 cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" /> Clear all
                </button>
              </div>
            ) : null}
          </div>

          {/* Category Breakdown */}
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 flex flex-col justify-between group relative p-5 select-none">
            <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Package className="w-4 h-4" />
              </div>
              <span className="text-xs font-black uppercase tracking-wider text-primary">Category Breakdown</span>
            </div>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                    <Skeleton className="h-3 w-60" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            ) : categoryStats.length > 0 ? (
              <div className="space-y-3">
                {categoryStats.map(cat => (
                  <div key={cat.name} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-foreground truncate">{cat.name}</span>
                        <span className="text-xs text-muted-foreground font-semibold shrink-0">({cat.count} items)</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-semibold shrink-0">
                        <span className="text-foreground">{cat.stock.toFixed(0)} pcs</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-1.5">
                      <span>Purchase: <span className="font-bold text-foreground">{formatCurrency(cat.purchase)}</span></span>
                      <span>MRP: <span className="font-bold text-foreground">{formatCurrency(cat.mrp)}</span></span>
                      <span>Selling: <span className="font-bold text-emerald-500">{formatCurrency(cat.selling)}</span></span>
                    </div>
                    <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-primary/60 transition-all duration-500"
                        style={{ width: `${(cat.pct / maxPct) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No category data available</p>
            )}
          </div>

          {/* Low Stock Alerts */}
          {!loading && stockFilter !== 'low_stock' && lowStockItems.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                <h3 className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                  Low Stock Alerts &mdash; {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''}
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {lowStockItems.slice(0, 6).map(p => {
                  const isOutOfStock = Number(p.current_stock) <= 0;
                  return (
                    <div key={p.product_id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.category || 'No category'}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <span className={clsx('text-sm font-black', isOutOfStock ? 'text-red-500' : 'text-amber-500')}>
                          {isOutOfStock ? 'OUT' : Number(p.current_stock).toFixed(0)}
                        </span>
                        {!isOutOfStock && <span className="text-xs text-muted-foreground ml-1">/ {Number(p.reorder_level).toFixed(0)}</span>}
                      </div>
                    </div>
                  );
                })}
                {lowStockItems.length > 6 && (
                  <button onClick={() => setStockFilter('low_stock')} className="col-span-2 text-center text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 pt-1 transition-colors cursor-pointer">
                    +{lowStockItems.length - 6} more low stock item{lowStockItems.length - 6 > 1 ? 's' : ''}
                  </button>
                )}
              </div>
            </div>
          )}


          {/* Detailed Table */}
          <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm bg-card border border-border rounded-[28px] shadow-sm overflow-hidden select-none">
            <div className="px-5 py-4.5 border-b border-border bg-muted/20 dark:bg-muted/10">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Package className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-primary">Product-wise Stock Details</span>
                <span className="text-xs text-muted-foreground ml-auto font-semibold">{loading ? <Skeleton className="h-3 w-16 inline-block" /> : `${products.length} products`}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="text-left px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Product</th>
                    <th className="text-left px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Category</th>
                    <th className="text-left px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Grade</th>
                    <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Stock</th>
                    {viewMode !== 'estimate' && <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">GST Qty</th>}
                    {viewMode !== 'estimate' && <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">GST Paper Stock</th>}
                    {viewMode !== 'gst' && <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Est Qty</th>}
                    <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Weight</th>
                    <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Purchase</th>
                    <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">MRP</th>
                    <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Selling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3" colSpan={viewMode === 'combined' ? 11 : viewMode === 'gst' ? 10 : 9}><Skeleton className="h-5 w-full rounded" /></td>
                      </tr>
                    ))
                  ) : Object.entries(groupedByCategory).length === 0 ? (
                    <tr>
                      <td colSpan={viewMode === 'combined' ? 11 : viewMode === 'gst' ? 10 : 9} className="px-4 py-8 text-center text-sm text-muted-foreground">No products found matching your filters</td>
                    </tr>
                    ) : (
                    Object.entries(groupedByCategory).map(([cat, items]) => {
                      const catTotalStock = items.reduce((s, p) => s + Number(p.current_stock), 0);
                      return (
                        <React.Fragment key={cat}>
                          <tr className="bg-primary/5">
                            <td colSpan={viewMode === 'combined' ? 11 : viewMode === 'gst' ? 10 : 9} className="px-4 py-2 text-xs font-bold text-primary uppercase tracking-wider border-b border-border/30">
                              <div className="flex items-center gap-2">
                                <span>{cat}</span>
                                <span className="text-[10px] text-muted-foreground font-semibold">
                                  ({items.length} items &middot; {catTotalStock.toFixed(0)} stock)
                                </span>
                              </div>
                            </td>
                          </tr>
                          {items.map(p => (
                            <tr key={p.product_id} className={clsx('hover:bg-muted/20 transition-colors', (p.isOutOfStock || p.isLowStock) && 'bg-amber-500/[0.02]')}>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className={clsx('w-2 h-2 rounded-full shrink-0', p.isOutOfStock ? 'bg-red-500' : p.isLowStock ? 'bg-amber-500' : 'bg-emerald-500')} />
                                  <span className="font-bold text-sm text-foreground">{p.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-sm text-muted-foreground">{p.category || '-'}</td>
                              <td className="px-4 py-2.5 text-sm text-muted-foreground">{p.gradeName}</td>
                              <td className={clsx('px-4 py-2.5 text-right font-bold text-sm', p.isOutOfStock ? 'text-red-500' : p.isLowStock ? 'text-amber-500' : 'text-foreground')}>{Number(p.current_stock).toFixed(0)}</td>
                              {viewMode !== 'estimate' && <td className="px-4 py-2.5 text-right text-sm text-muted-foreground">{p.gstQty.toFixed(0)}</td>}
                              {viewMode !== 'estimate' && <td className="px-4 py-2.5 text-right text-sm font-bold text-sky-600 dark:text-sky-400 tabular-nums">{p.gstPaperStock.toFixed(0)}</td>}
                              {viewMode !== 'gst' && <td className="px-4 py-2.5 text-right text-sm text-amber-600 dark:text-amber-400">{p.estimateQty.toFixed(0)}</td>}
                              <td className="px-4 py-2.5 text-right text-sm text-muted-foreground">{p.totalWeight > 0 ? p.totalWeight.toFixed(2) + ' KG' + (p.totalPcs > 0 ? ' (' + p.totalPcs + ' pcs)' : '') : '-'}</td>
                              <td className="px-4 py-2.5 text-right text-sm text-foreground">{formatCurrency(Number(p.purchase_price) || 0)}</td>
                              <td className="px-4 py-2.5 text-right text-sm text-foreground">{formatCurrency(p.rate)}</td>
                              <td className="px-4 py-2.5 text-right text-sm font-bold text-emerald-500">{formatCurrency(p.finalSellingPrice)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })
                  )}
                  {!loading && (
                    <tr className="bg-muted/30 border-t-2 border-border">
                      <td colSpan={3} className="px-4 py-3 text-sm font-black text-foreground">Grand Total</td>
                      <td className="px-4 py-3 text-right font-black text-sm text-foreground">{totalStock.toFixed(0)}</td>
                      {viewMode !== 'estimate' && <td className="px-4 py-3 text-right font-bold text-sm text-muted-foreground">{billQuantities.reduce((s, b) => s + Number(b.gst_qty), 0).toFixed(0)}</td>}
                      {viewMode !== 'estimate' && <td className="px-4 py-3 text-right font-black text-sm text-sky-500 tabular-nums">{filteredProducts.reduce((s, p) => s + (p.paper_stock ?? 0), 0).toFixed(0)}</td>}
                      {viewMode !== 'gst' && <td className="px-4 py-3 text-right font-bold text-sm text-amber-500">{billQuantities.reduce((s, b) => s + Number(b.estimate_qty), 0).toFixed(0)}</td>}
                      <td className="px-4 py-3 text-right"></td>
                      <td className="px-4 py-3 text-right font-bold text-sm text-rose-500">{formatCurrency(totalPurchaseValue)}</td>
                      <td className="px-4 py-3 text-right font-bold text-sm text-sky-500">{formatCurrency(totalMrpValue)}</td>
                      <td className="px-4 py-3 text-right font-bold text-sm text-emerald-500">{formatCurrency(totalSellingValue)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-center text-xs text-muted-foreground py-2">
            {loading ? <Skeleton className="h-3 w-48 mx-auto" /> : `Generated by Vendora POS &mdash; ${new Date().toLocaleString('en-IN')} &middot; ${totalProducts} products &middot; ${Object.keys(groupedByCategory).length} categories`}
          </div>
        </div>
      </div>
    </div>
  );
}

