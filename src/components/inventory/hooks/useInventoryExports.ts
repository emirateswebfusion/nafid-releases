import type React from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { printingApi } from '../../../data/printing';
import { type Product, toInventoryProducts, isGstProduct } from '../inventoryUtils';
import { useAuthStore } from '../../../store/authStore';
import { listProducts, getProductPricing } from '../../../data/products';
import { listPricingTiers } from '../../../data/pricingTiers';
import Papa from 'papaparse';
import type { InventoryState } from './useInventoryState';

export interface BuildInventoryCsvRowArgs {
  product: Product;
  grades: Array<{ grade_id: string; rate?: number | string | null; purchase_price?: number | string | null }>;
  activeTiers: Array<{ pricing_tier_id: string; name: string }>;
  pricingMap: Record<string, Record<string, number>>;
}

export function buildInventoryCsvRow(args: BuildInventoryCsvRowArgs): Record<string, unknown> {
  const { product: p, grades, activeTiers, pricingMap } = args;

  const da: Record<string, unknown> = (() => {
    try {
      if (typeof p.domain_attributes === 'string') {
        return (JSON.parse(p.domain_attributes) as Record<string, unknown>) || {};
      }
      if (p.domain_attributes && typeof p.domain_attributes === 'object') {
        return (p.domain_attributes as unknown as Record<string, unknown>) || {};
      }
      return {};
    } catch {
      return {};
    }
  })();

  const appliedGrade = p.grade_id ? grades.find(g => g.grade_id === p.grade_id) : null;
  const displayPurchasePrice = appliedGrade && p.pricing_mode === 'GRADE_RATE' && appliedGrade.purchase_price !== undefined 
    ? Number(appliedGrade.purchase_price) 
    : Number(p.purchase_price);
  const displayMrp = appliedGrade && p.pricing_mode === 'GRADE_RATE' 
    ? Number(appliedGrade.rate) 
    : Number(p.base_price);

  const itemCode = (p.item_code && String(p.item_code).trim() !== '')
    ? String(p.item_code).trim()
    : (da.item_code ? String(da.item_code).trim() : (da.itemCode ? String(da.itemCode).trim() : ''));

  const hsnCode = (p.hsn_sac_code && String(p.hsn_sac_code).trim() !== '')
    ? String(p.hsn_sac_code).trim()
    : (da.hsn_sac_code ? String(da.hsn_sac_code).trim() : (da.hsn_code ? String(da.hsn_code).trim() : (da.hsn ? String(da.hsn).trim() : '')));

  const taxRate = p.tax_rate_percent != null
    ? Number(p.tax_rate_percent)
    : (da.tax_rate_percent != null ? Number(da.tax_rate_percent) : 0);

  const row: Record<string, unknown> = {
    'Name': p.name || '',
    'Item Code': itemCode,
    'Barcode': p.sku_barcode || '',
    'HSN Code': hsnCode,
    'Category': p.category || '',
    'Brand': p.brand_manufacturer || '',
    'UOM': p.uom || '',
    'Purchase Price': displayPurchasePrice || 0,
    'Paper Purchase': Number((p as typeof p).gst_purchase_price || 0),
    'MRP': displayMrp || 0,
    'Paper MRP': Number((p as typeof p).paper_mrp || 0),
  };

  // Dynamically add tier columns with their names
  for (const tier of activeTiers) {
    const tierPrice = pricingMap[p.product_id]?.[tier.pricing_tier_id];
    row[tier.name] = tierPrice != null ? tierPrice : '';
  }

  row['Tax Rate %'] = taxRate;
  row['Discount %'] = p.discount_percent != null ? Number(p.discount_percent) : 0;
  row['Discount Flat'] = p.discount_flat != null ? Number(p.discount_flat) : 0;
  row['Offer Price'] = p.offer_price != null ? Number(p.offer_price) : '';
  row['Real Stock'] = p.current_stock || 0;
  row['Paper Stock'] = p.paper_stock || 0;
  row['Low Stock'] = p.reorder_level != null ? Number(p.reorder_level) : 0;
  row['Billing Type'] = p.billing_type || 'PIECE';
  row['GST Applicable'] = isGstProduct(p) || hsnCode !== '' ? 'YES' : 'NO';
  row['Added Date'] = p.created_at || '';

  return row;
}

export interface UseInventoryExportsContext {
  stockFilterRef: React.RefObject<"all" | "in_stock" | "low_stock" | "out_of_stock" | "no_barcode">;
  tenantId: string | null;
  inv: InventoryState;
}

/**
 * Inventory exports: barcode labels and product labels to the label printer, and the product list as CSV.
 */
export function useInventoryExports(ctx: UseInventoryExportsContext) {
  const { stockFilterRef, tenantId } = ctx;
  const { filterDate, filterDateEnd, formData, grades, printPrice, printQuantity, setPrintModalProduct, setPrintQuantity, setStatusMessage } = ctx.inv;
  const printBarcode = async () => {
    if (!formData.sku_barcode) return;
    setStatusMessage({ text: 'Connecting to printer...', type: 'success' });
    
    if (isDesktopRuntime()) {
      const appliedGrade = formData.grade_id ? grades.find(g => g.grade_id === formData.grade_id) : null;
      const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
      const effectiveMrp = gradeRate !== null && formData.pricing_mode === 'GRADE_RATE' 
        ? gradeRate 
        : Number(formData.base_price);

      let sp: number | undefined;
      let spType: 'SP' | 'OFF' = 'SP';
      if (formData.offer_price) {
        sp = Number(formData.offer_price);
        spType = 'OFF';
      } else if (formData.discount_flat) {
        sp = effectiveMrp - Number(formData.discount_flat);
        spType = 'SP';
      } else if (formData.discount_percent) {
        sp = effectiveMrp * (1 - Number(formData.discount_percent) / 100);
        spType = 'SP';
      }
      if (sp !== undefined && sp === effectiveMrp) {
         sp = undefined;
      }
      if (printPrice) {
        localStorage.setItem('printBarcodePrice', effectiveMrp.toString());
        if (sp !== undefined) {
          localStorage.setItem('printBarcodeSp', sp.toString());
          localStorage.setItem('printBarcodeSpType', spType);
        } else {
          localStorage.removeItem('printBarcodeSp');
          localStorage.removeItem('printBarcodeSpType');
        }
      } else {
        localStorage.removeItem('printBarcodePrice');
        localStorage.removeItem('printBarcodeSp');
        localStorage.removeItem('printBarcodeSpType');
      }
      const cleanName = (formData.name || '').replace(/\s*\((GST|EST|Estimate)\)$/i, '').trim();
      localStorage.setItem('printBarcodeName', cleanName);

      const res = await printingApi.printBarcode(
        tenantId || 'global', 
        formData.sku_barcode, 
        printPrice ? effectiveMrp : undefined, 
        cleanName, 
        Math.max(1, Number(printQuantity) || 1), 
        printPrice ? sp : undefined,
        printPrice ? spType : undefined
      );
      if (res.success) {
        setStatusMessage({ text: `Barcode printed successfully (${printQuantity} label${Number(printQuantity) > 1 ? 's' : ''})!`, type: 'success' });
        setPrintQuantity(1);
      } else {
        setStatusMessage({ text: `Print Failed: ${res.error || 'Printer not connected'}`, type: 'error' });
      }
      
      // Clear message after 3 seconds
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ text: 'Print command dispatched', type: 'success' });
      setPrintQuantity(1);
    }
  };

  const printProductLabel = async (p: Product) => {
    if (!p.sku_barcode) return;
    setStatusMessage({ text: 'Connecting to printer...', type: 'success' });
    
    if (isDesktopRuntime()) {
      const appliedGrade = p.grade_id ? grades.find(g => g.grade_id === p.grade_id) : null;
      const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
      const effectiveMrp = gradeRate !== null && p.pricing_mode === 'GRADE_RATE' 
        ? gradeRate 
        : Number(p.base_price);

      let sp: number | undefined;
      let spType: 'SP' | 'OFF' = 'SP';
      if (p.offer_price) {
        sp = Number(p.offer_price);
        spType = 'OFF';
      } else if (p.discount_flat) {
        sp = effectiveMrp - Number(p.discount_flat);
        spType = 'SP';
      } else if (p.discount_percent) {
        sp = effectiveMrp * (1 - Number(p.discount_percent) / 100);
        spType = 'SP';
      }
      if (sp !== undefined && sp === effectiveMrp) {
         sp = undefined;
      }
      if (printPrice) {
        localStorage.setItem('printBarcodePrice', effectiveMrp.toString());
        if (sp !== undefined) {
          localStorage.setItem('printBarcodeSp', sp.toString());
          localStorage.setItem('printBarcodeSpType', spType);
        } else {
          localStorage.removeItem('printBarcodeSp');
          localStorage.removeItem('printBarcodeSpType');
        }
      } else {
        localStorage.removeItem('printBarcodePrice');
        localStorage.removeItem('printBarcodeSp');
        localStorage.removeItem('printBarcodeSpType');
      }
      const cleanName = (p.name || '').replace(/\s*\((GST|EST|Estimate)\)$/i, '').trim();
      localStorage.setItem('printBarcodeName', cleanName);

      const res = await printingApi.printBarcode(
        tenantId || 'global', 
        p.sku_barcode, 
        printPrice ? effectiveMrp : undefined, 
        cleanName, 
        Math.max(1, Number(printQuantity) || 1), 
        printPrice ? sp : undefined,
        printPrice ? spType : undefined
      );
      if (res.success) {
        setStatusMessage({ text: `Barcode printed successfully (${printQuantity} label${Number(printQuantity) > 1 ? 's' : ''})!`, type: 'success' });
        setTimeout(() => setPrintModalProduct(null), 2000);
      } else {
        setStatusMessage({ text: `Print Failed: ${res.error || 'Printer not connected'}`, type: 'error' });
      }
      
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ text: 'Print command dispatched (mock)', type: 'success' });
      setTimeout(() => {
        setPrintModalProduct(null);
        setStatusMessage(null);
      }, 2000);
    }
  };

  const downloadCsv = async () => {
    setStatusMessage({ text: 'Generating CSV...', type: 'success' });
    if (isDesktopRuntime()) {
      const { tenantId } = useAuthStore.getState();
      const tid = tenantId || 'global';
      const [result, tiersRes, pricingRows] = await Promise.all([
        listProducts({
          tenant_id: tid,
          filterDate: filterDate,
          filterDateEnd: filterDateEnd,
          stockStatus: stockFilterRef.current,
          limit: 100000 
        }).then(toInventoryProducts),
        listPricingTiers(tid),
        getProductPricing(tid)
      ]);

      if (Array.isArray(result) && result.length > 0) {
        const activeTiers = Array.isArray(tiersRes)
          ? tiersRes.filter((t: import('../../../data/pricingTiers').PricingTier) => (t.is_active === 1 || t.is_active === true || t.is_active === '1') && !t.is_deleted)
          : [];

        // Build product_id -> { [pricing_tier_id]: price }
        const pricingMap: Record<string, Record<string, number>> = {};
        if (Array.isArray(pricingRows)) {
          for (const row of pricingRows) {
            if (!row.is_deleted && row.price != null && row.price !== '') {
              if (!pricingMap[row.product_id]) {
                pricingMap[row.product_id] = {};
              }
              pricingMap[row.product_id][row.pricing_tier_id] = Number(row.price);
            }
          }
        }

        const dataToExport = result.map(p =>
          buildInventoryCsvRow({ product: p, grades, activeTiers, pricingMap })
        );

        const csvContent = Papa.unparse(dataToExport);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const csvName = filterDateEnd ? `products_${filterDate}_${filterDateEnd}.csv` : filterDate ? `products_${filterDate}.csv` : 'products_all.csv';
        link.setAttribute('download', csvName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setStatusMessage({ text: 'CSV Downloaded with Pricing Tiers', type: 'success' });
      } else {
        setStatusMessage({ text: 'No products to download for this date', type: 'error' });
      }
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  return { printBarcode, printProductLabel, downloadCsv };
}
