import { storeDate } from '../../../utils/time/dateDisplay';
import { listGrades } from '../../../data/grades';
import { loadProductVariants } from '../variantProducts';
import type React from 'react';
import { isDesktopRuntime, hasBridge } from '../../../data/client';
import { listProducts, getProductPricing } from '../../../data/products';
import { getDefaultTaxRate, isVatStore } from '../../../utils/localization/storeProfile';
import { DEFAULT_FORM, type Product, isGstProduct } from '../inventoryUtils';
import { purchasesApi } from '../../../data/purchases';
import type { InventoryState } from './useInventoryState';

export interface UseInventoryFormOpenContext {
  lastInteractedProductId: React.RefObject<string | null>;
  listScrollRef: React.RefObject<HTMLDivElement | null>;
  savedScrollTop: React.RefObject<number>;
  tenantId: string | null;
  inv: InventoryState;
}

/**
 * Open the product form for a new product (`openAdd`) or an existing one (`openEdit`, loading its prices, grades and
 * last purchase).
 */
export function useInventoryFormOpen(ctx: UseInventoryFormOpenContext) {
  const { lastInteractedProductId: lastInteractedProductIdRef, listScrollRef, savedScrollTop: savedScrollTopRef, tenantId } = ctx;
  const { grades, setEditingProduct, setFormData, setTierPrices, setView, setVariants } = ctx.inv;
  const openAdd = async () => {
    let nextBarcode = '';
    if (isDesktopRuntime()) {
      try {
        const lastProduct = await listProducts({
          tenant_id: tenantId || 'global',
          limit: 1,
          sortBy: 'created_at'
        });
        if (Array.isArray(lastProduct) && lastProduct.length > 0 && lastProduct[0].sku_barcode) {
          const lastBarcode = lastProduct[0].sku_barcode;
          const match = lastBarcode.match(/(\d+)[^\d]*$/);
          if (match) {
            const numStr = match[1];
            const nextNum = (BigInt(numStr) + 1n).toString();
            nextBarcode = nextNum.padStart(numStr.length, '0');
          } else {
            // If the barcode doesn't contain a number, default to '1'
            nextBarcode = '1';
          }
        }
      } catch (err) {
        console.error("Failed to fetch last barcode", err);
      }
    }

    setFormData({ ...DEFAULT_FORM, sku_barcode: nextBarcode, tax_rate_percent: getDefaultTaxRate(), is_gst_applicable: isVatStore() });
    setEditingProduct(null);
    setTierPrices({});
    setVariants([]);
    setView('add');
  };

  const openEdit = async (product: Product) => {
    let loadedVariants;
    let availableGrades = grades;
    try {
      loadedVariants = await loadProductVariants(tenantId || 'global', product.product_id);
      // Direct management-page entry may open before the inventory lookups finish loading.
      if (product.grade_id && !grades.some(grade => grade.grade_id === product.grade_id)) {
        availableGrades = await listGrades(tenantId || 'global');
        if (!Array.isArray(availableGrades)) throw new Error('Could not load product grades. Please retry.');
        ctx.inv.setGrades(availableGrades);
      }
    }
    catch (error) {
      ctx.inv.setStatusMessage({ text: error instanceof Error ? error.message : 'Could not load variants. Please retry.', type: 'error' });
      return;
    }
    lastInteractedProductIdRef.current = product.product_id;
    if (listScrollRef.current) {
      savedScrollTopRef.current = listScrollRef.current.scrollTop;
    }
    setEditingProduct(product);
    const validGradeId = product.grade_id && availableGrades.some(g => g.grade_id === product.grade_id) ? product.grade_id : '';
    const appliedGrade = validGradeId ? availableGrades.find(g => g.grade_id === validGradeId) : null;
    const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
    setFormData({
      item_code: product.item_code || '',
      sku_barcode: product.sku_barcode || '',
      name: product.name,
      category: product.category || '',
      brand_manufacturer: product.brand_manufacturer || '',
      uom: product.uom || 'Pcs',
      purchase_price: product.purchase_price || '',
      base_price: gradeRate !== null && product.pricing_mode === 'GRADE_RATE' ? gradeRate : (product.base_price || ''),
      current_stock: product.current_stock ?? '',
      gst_purchase_quantity: product.paper_stock !== undefined && product.paper_stock !== null ? String(product.paper_stock) : '',
      gst_purchase_price: (() => {
        try {
          const da = JSON.parse(product.domain_attributes || '{}');
          const isPaper = da.gst_type === 'PAPER' || Number(product.paper_stock || da.paper_stock || 0) > 0;
          if (!isPaper) return '';
          if ((product as Omit<Product, 'gst_purchase_price' | 'paper_mrp'> & { gst_purchase_price?: string | number; paper_mrp?: string | number }).gst_purchase_price !== undefined && (product as Omit<Product, 'gst_purchase_price' | 'paper_mrp'> & { gst_purchase_price?: string | number; paper_mrp?: string | number }).gst_purchase_price !== null && (product as Omit<Product, 'gst_purchase_price' | 'paper_mrp'> & { gst_purchase_price?: string | number; paper_mrp?: string | number }).gst_purchase_price !== '') {
            return String((product as Omit<Product, 'gst_purchase_price' | 'paper_mrp'> & { gst_purchase_price?: string | number; paper_mrp?: string | number }).gst_purchase_price);
          }
          return da.paper_purchase_price !== undefined && da.paper_purchase_price !== null ? String(da.paper_purchase_price) : (da.gst_purchase_price !== undefined && da.gst_purchase_price !== null ? String(da.gst_purchase_price) : '');
        } catch { return ''; }
      })(),
      reorder_level: product.reorder_level ?? '',
      is_gst_applicable: isGstProduct(product),
      gst_type: (() => {
        try {
          if (Number(product.current_stock || 0) > 0) return 'REAL' as 'REAL' | 'PAPER';
          const da = JSON.parse(product.domain_attributes || '{}');
          if (da.gst_type === 'PAPER') return 'PAPER';
          if (Number(product.current_stock || 0) <= 0 && Number(product.paper_stock || 0) > 0) return 'PAPER';
          return (da.gst_type === 'PAPER' ? 'PAPER' : 'REAL') as 'REAL' | 'PAPER';
        } catch { return 'REAL' as 'REAL' | 'PAPER'; }
      })(),
      hsn_sac_code: product.hsn_sac_code || '',
      tax_rate_percent: product.tax_rate_percent || 0,
      domain_attributes: (() => {
        try {
          const da = JSON.parse(product.domain_attributes || '{}');
          const pcsVal = da.pcs !== undefined ? da.pcs : (da.pcs_stock !== undefined ? da.pcs_stock : '');
          da.pcs = pcsVal;
          da.pcs_stock = pcsVal;
          const isPaper = da.gst_type === 'PAPER' || Number(product.paper_stock || da.paper_stock || 0) > 0;
          if (!isPaper) {
            delete da.paper_mrp;
            delete da.paper_base_price;
            delete da.paper_purchase_price;
            delete da.gst_purchase_price;
          } else {
            const paperMrpVal = (product as Omit<Product, 'gst_purchase_price' | 'paper_mrp'> & { gst_purchase_price?: string | number; paper_mrp?: string | number }).paper_mrp !== undefined && (product as Omit<Product, 'gst_purchase_price' | 'paper_mrp'> & { gst_purchase_price?: string | number; paper_mrp?: string | number }).paper_mrp !== null && (product as Omit<Product, 'gst_purchase_price' | 'paper_mrp'> & { gst_purchase_price?: string | number; paper_mrp?: string | number }).paper_mrp !== ''
              ? (product as Omit<Product, 'gst_purchase_price' | 'paper_mrp'> & { gst_purchase_price?: string | number; paper_mrp?: string | number }).paper_mrp
              : (da.paper_mrp !== undefined && da.paper_mrp !== null ? da.paper_mrp : (da.paper_base_price !== undefined ? da.paper_base_price : ''));
            da.paper_mrp = paperMrpVal !== '' ? String(paperMrpVal) : '';
          }
          return da;
        } catch { return {}; }
      })(),
      discount_percent: product.discount_percent ?? '',
      discount_flat: product.discount_flat ?? '',
      offer_price: product.offer_price ?? '',
      billing_type: product.billing_type || 'PIECE',
      grade_id: validGradeId,
      pricing_mode: validGradeId ? (product.pricing_mode || 'FIXED_PRICE') : 'FIXED_PRICE',
      show_gst_purchase: false,
      gst_same_as_current: false,
      gst_supplier_id: '',
      gst_supplier_name: '',
      gst_bill_number: '',
      gst_bill_date: storeDate(new Date(), 'en-CA'),
      gst_purchase_is_dummy: false,
    });
    if (isDesktopRuntime()) {
      getProductPricing(tenantId || 'global')
        .then((rows) => {
          if (Array.isArray(rows)) {
            const mine: Record<string, string> = {};
            for (const r of rows) {
              if (r.product_id === product.product_id && r.price != null && r.price !== '') {
                mine[r.pricing_tier_id] = String(r.price);
              }
            }
            setTierPrices(mine);
          }
        })
        .catch(console.error);

      // Async fallback: if paper purchase price or paper MRP is missing or empty,
      // load it directly from purchase bill records
      const daParsed = (() => { try { return JSON.parse(product.domain_attributes || '{}'); } catch { return {}; } })();
      const isProductPaper = daParsed.gst_type === 'PAPER' || Number(product.paper_stock || daParsed.paper_stock || 0) > 0;
      const curPur = (product as Omit<Product, 'gst_purchase_price' | 'paper_mrp'> & { gst_purchase_price?: string | number; paper_mrp?: string | number }).gst_purchase_price ?? daParsed.gst_purchase_price ?? daParsed.paper_purchase_price ?? '';
      const curMrp = (product as Omit<Product, 'gst_purchase_price' | 'paper_mrp'> & { gst_purchase_price?: string | number; paper_mrp?: string | number }).paper_mrp ?? daParsed.paper_mrp ?? daParsed.paper_base_price ?? '';

      if (isProductPaper && (!curPur || !curMrp) && hasBridge('dbGetPurchaseBillProducts')) {
        purchasesApi.getPurchaseBillProducts({
          tenant_id: tenantId || 'global',
          search: product.name,
          limit: 10
        }).then((billProds) => {
          if (Array.isArray(billProds)) {
            const match = billProds.find(bp => bp.product_id === product.product_id);
            if (match) {
              setFormData(prev => {
                const prevDa = { ...prev.domain_attributes };
                let changed = false;
                let newPur = prev.gst_purchase_price;
                if ((!newPur || Number(newPur) <= 0) && Number(match.gst_purchase_price) > 0) {
                  newPur = String(match.gst_purchase_price);
                  prevDa.gst_purchase_price = match.gst_purchase_price;
                  prevDa.paper_purchase_price = match.gst_purchase_price;
                  changed = true;
                }
                if ((!prevDa.paper_mrp || Number(prevDa.paper_mrp) <= 0) && Number(match.paper_mrp) > 0) {
                  prevDa.paper_mrp = String(match.paper_mrp);
                  prevDa.paper_base_price = match.paper_mrp;
                  changed = true;
                }
                if (changed) {
                  return { ...prev, gst_purchase_price: newPur, domain_attributes: prevDa };
                }
                return prev;
              });
            }
          }
        }).catch(console.error);
      }
    }

    setVariants(loadedVariants);

    setView('edit');
  };

  return { openAdd, openEdit };
}
