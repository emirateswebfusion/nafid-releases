import { useCallback, useEffect } from 'react';
import { hasBridge, isDesktopRuntime } from '../../../data/client';
import { gradesApi } from '../../../data/grades';
import { partiesApi } from '../../../data/parties';
import { productsApi } from '../../../data/products';
import { purchasesApi } from '../../../data/purchases';
import { settingsApi } from '../../../data/settings';
import { parseStaffDataMaskingConfig, STAFF_DATA_MASKING_KEY } from '../../../utils/security/staffDataMasking';
import { CACHE_TTL, reportCache } from '../stockReportCache';
import type { StockReportState } from './useStockReportState';

export interface UseStockReportDataContext {
  sr: StockReportState;
  tenantId: string | null;
}

/** Loads the stock report's settings, products, grades, parties, bill quantities and sales summary, and stays in sync. */
export function useStockReportData(ctx: UseStockReportDataContext) {
  const { sr, tenantId } = ctx;
  const {
    reportTab, setBillQuantities, setEnableRealPaperStock, setGrades, setLastUpdated, setLoading, setMaskingConfig,
    setParties, setProductSupplierMap, setProducts, setRefreshing, setSalesLoading, setSalesSummary, setViewMode,
  } = sr;

  const cacheKey = tenantId || 'global';

  useEffect(() => {
    const loadSettings = () => {
      if (hasBridge('settingsGet')) {
        settingsApi.get({ tenant_id: tenantId || 'global', key: 'enable_real_paper_stock' }).then(val => {
          if (val !== null && val !== undefined) setEnableRealPaperStock(Boolean(val));
        }).catch(() => {});

        settingsApi.get({ tenant_id: tenantId || 'global', key: STAFF_DATA_MASKING_KEY }).then(val => {
          if (val) setMaskingConfig(parseStaffDataMaskingConfig(val));
        }).catch(() => {});
      }
    };
    loadSettings();
    window.addEventListener('settings:updated', loadSettings);
    return () => window.removeEventListener('settings:updated', loadSettings);
  }, [tenantId, setEnableRealPaperStock, setMaskingConfig]);

  const buildProductSupplierMap = useCallback(async () => {
    if (!isDesktopRuntime()) return;
    try {
      if (hasBridge('dbGetProductSuppliers')) {
        const rawMap = await purchasesApi.getProductSuppliers(cacheKey);
        const map = new Map<string, Set<string>>();
        for (const [pid, suppliers] of Object.entries(rawMap || {})) {
          map.set(pid, new Set(suppliers));
        }
        setProductSupplierMap(map);
        return;
      }
      const bills = await purchasesApi.getPurchaseBills({ tenant_id: cacheKey, limit: 500 });
      if (!Array.isArray(bills)) return;
      const map = new Map<string, Set<string>>();
      const itemPromises = bills.map(bill =>
        purchasesApi.getPurchaseBillItems(bill.purchase_bill_id)
          .then(items => {
            if (!Array.isArray(items)) return;
            const supplier = bill.supplier_name || 'Unknown';
            items.forEach((item: { product_id?: string }) => {
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
  }, [cacheKey, setProductSupplierMap]);

  const loadData = useCallback(async (forceRefresh = false) => {
    const cached = reportCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setProducts(cached.products.filter((p: import('../stockReportTypes').Product) => Number(p.is_service_item) !== 1));
      setGrades(cached.grades);
      setLastUpdated(new Date(cached.timestamp));
      setLoading(false);
      return;
    }

    if (forceRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      if (isDesktopRuntime()) {
        const [prodRes, gradeRes, partiesRes] = await Promise.all([
          productsApi.getProducts({ tenant_id: cacheKey, limit: 100000 }).catch(() => null),
          gradesApi.getGrades(cacheKey).catch(() => null),
          partiesApi.getParties(cacheKey).catch(() => null),
        ]);
        if (Array.isArray(prodRes) && Array.isArray(gradeRes)) {
          const nonServiceProducts = prodRes.filter((p: import('../stockReportTypes').Product) => Number(p.is_service_item) !== 1);
          setProducts(nonServiceProducts);
          setGrades(gradeRes);
          reportCache.set(cacheKey, { products: nonServiceProducts, grades: gradeRes, timestamp: Date.now() });
          setLastUpdated(new Date());
        }
        if (Array.isArray(partiesRes)) setParties(partiesRes);
        productsApi.getProductBillQuantities(cacheKey)
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
  }, [cacheKey, buildProductSupplierMap, setBillQuantities, setGrades, setLastUpdated, setLoading, setParties, setProducts, setRefreshing]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (isDesktopRuntime()) {
      settingsApi.get({ tenant_id: tenantId || 'global', key: 'stock_report_default_view' })
        .then((val: unknown) => {
          if (val === 'estimate' || val === 'gst' || val === 'combined') { setViewMode(val); return; }
          // Fallback: if GSTIN is set, default to GST tab; otherwise Estimate
          settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_gstin' })
            .then((gstin: unknown) => setViewMode(gstin && String(gstin).trim() ? 'gst' : 'estimate'))
            .catch(() => {});
        })
        .catch(() => {
          settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_gstin' })
            .then((gstin: unknown) => setViewMode(gstin && String(gstin).trim() ? 'gst' : 'estimate'))
            .catch(() => {});
        });
    }
  }, [tenantId, setViewMode]);

  useEffect(() => {
    if (!isDesktopRuntime() || reportTab !== 'sales') return;
    let cancelled = false;
    setSalesLoading(true);
    productsApi.getProductSalesSummary({ tenant_id: tenantId || 'global' })
      .then((res) => {
        if (!cancelled && Array.isArray(res))
          setSalesSummary(res.filter((r: import('../stockReportTypes').StockSalesSummaryRow) => Number(r.is_service_item) !== 1 && (r.name || '') !== 'Service Charge'));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSalesLoading(false); });
    return () => { cancelled = true; };
  }, [reportTab, tenantId, setSalesLoading, setSalesSummary]);

  return { loadData };
}
