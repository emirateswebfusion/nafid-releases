import type React from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { productsApi } from '../../../data/products';
import { pricingTiersApi } from '../../../data/pricingTiers';
import { v4 as uuidv4 } from 'uuid';
import { gradesApi } from '../../../data/grades';
import type { PurchaseFormItem } from '../purchaseTypes';
import type { PurchaseProductFormState } from './usePurchaseProductFormState';

export interface UsePurchaseProductActionsContext {
  getOtherSectionItems: (() => PurchaseFormItem[]) | undefined;
  onStatusMessage: (msg: { text: string; type: "success" | "error"; } | null) => void;
  setPaymentType: React.Dispatch<React.SetStateAction<"CASH" | "CREDIT" | "UPI" | "BANK_TRANSFER">>;
  setSharedEstimateMode: React.Dispatch<React.SetStateAction<boolean>>;
  tenantId: string;
  productForm: PurchaseProductFormState;
}

/**
 * Actions of the product dialog in the purchase form: open it for a bill line (`openProductEditor`), reset it
 * (`resetProductForm`) and create a new grade (`handleCreateNewGrade`).
 */
export function usePurchaseProductActions(ctx: UsePurchaseProductActionsContext) {
  const { getOtherSectionItems, onStatusMessage, setPaymentType, setSharedEstimateMode, tenantId } = ctx;
  const { newProductBasePrice, newProductCategory, newProductGradeForm, setEditingProductItemId, setNewProductBarcode, setNewProductBasePrice, setNewProductBrand, setNewProductCategory, setNewProductDiscountFlat, setNewProductDiscountPercent, setNewProductGradeForm, setNewProductGradeId, setNewProductGrades, setNewProductHsn, setNewProductIsAddingGrade, setNewProductIsCustomCategory, setNewProductIsDummy, setNewProductIsGstApplicable, setNewProductItemCode, setNewProductName, setNewProductOfferPrice, setNewProductPcs, setNewProductPurchasePrice, setNewProductReorderLevel, setNewProductSavingGrade, setNewProductStock, setNewProductTaxRate, setNewProductUom, setOriginalProductStock, setShowProductCreateForm, setTierPrices } = ctx.productForm;
  const openProductEditor = async (item: PurchaseFormItem) => {
    setEditingProductItemId(item.product_id);
    setNewProductName(item.name);
    setNewProductItemCode('');
    setNewProductBarcode('');
    setNewProductBrand('');
    setNewProductCategory('');
    setNewProductUom('Pcs');
    setNewProductPurchasePrice(item.purchase_price || '');
    setNewProductBasePrice(item.selling_price || '');
    setNewProductStock(item.quantity ? String(item.quantity) : '1');
    setNewProductReorderLevel('');
    setNewProductHsn(item.hsn_sac_code || '');
    setNewProductTaxRate(item.tax_rate_percent ?? 18);
    setNewProductDiscountPercent('');
    setNewProductDiscountFlat('');
    setNewProductOfferPrice(item.offer_price && Number(item.offer_price) > 0 ? String(item.offer_price) : '');
    setNewProductIsGstApplicable(item.is_gst_applicable !== 0);
    setNewProductIsDummy(item.skip_stock_update === 1);
    setNewProductPcs('');
    setShowProductCreateForm(true);
    // Populate full product details (MRP/Sale Price, Offer Price, Discounts, Stock, etc.)
    if (isDesktopRuntime() && tenantId) {
      try {
        const product = await productsApi.getProductsByIds({ tenant_id: tenantId, product_ids: [item.product_id] });
        const p = Array.isArray(product) ? product[0] : null;
        if (p) {
          setNewProductName(p.name ?? item.name);
          setNewProductItemCode(p.item_code || '');
          setNewProductBarcode(p.sku_barcode || '');
          setNewProductBrand(p.brand_manufacturer || '');
          setNewProductCategory(p.category || '');
          setNewProductGradeId(p.grade_id || '');
          setNewProductUom(p.uom || 'Pcs');
          if (p.domain_attributes) {
            try {
              const da = typeof p.domain_attributes === 'string' ? JSON.parse(p.domain_attributes) : p.domain_attributes;
              setNewProductPcs(da.pcs ? String(da.pcs) : '');
            } catch {}
          }
          if (!item.purchase_price || Number(item.purchase_price) <= 0) setNewProductPurchasePrice(p.purchase_price != null ? String(p.purchase_price) : '');
          if (!item.selling_price || Number(item.selling_price) <= 0) setNewProductBasePrice(p.base_price != null ? String(p.base_price) : '');
          const currentStock = p.current_stock != null ? Number(p.current_stock) : 0;
          setOriginalProductStock(currentStock);
          setNewProductReorderLevel(p.reorder_level != null ? String(p.reorder_level) : '');
          setNewProductHsn(p.hsn_sac_code || '');
          setNewProductTaxRate(p.tax_rate_percent ?? 18);
          setNewProductIsGstApplicable(p.is_gst_applicable !== 0);
          setNewProductDiscountPercent(p.discount_percent != null && p.discount_percent > 0 ? String(p.discount_percent) : '');
          setNewProductDiscountFlat(p.discount_flat != null && p.discount_flat > 0 ? String(p.discount_flat) : '');
          if (!item.offer_price || Number(item.offer_price) <= 0) setNewProductOfferPrice(p.offer_price != null && p.offer_price > 0 ? String(p.offer_price) : '');
        }
      } catch { /* non-fatal: keep bill-line values */ }
    }
    if (isDesktopRuntime() && tenantId) {
      pricingTiersApi.getProductPricing(tenantId)
        .then((rows: any[]) => {
          if (Array.isArray(rows)) {
            const mine: Record<string, string> = {};
            for (const r of rows) {
              if (r.product_id === item.product_id && r.price != null && r.price !== '') {
                mine[r.pricing_tier_id] = String(r.price);
              }
            }
            setTierPrices(mine);
          }
        })
        .catch(console.error);
    }
    // Rule C: if the product is purchased via Estimate too (present in the other section
    // or already has saved Estimate bills), its barcode purchase code must stay on the raw
    // Estimate base — GST-section edits must never inflate it.
    try {
      const inOtherSection = (getOtherSectionItems ? getOtherSectionItems() : []).some(i => i.product_id === item.product_id);
      let hasEstimateBills = false;
      if (isDesktopRuntime() && tenantId) {
        const res = await productsApi.productHasEstimateBills({ product_id: item.product_id, tenant_id: tenantId });
        hasEstimateBills = !!(res && res.success && res.hasEstimate);
      }
      setSharedEstimateMode(inOtherSection || hasEstimateBills);
    } catch { setSharedEstimateMode(false); }
  };

  const resetProductForm = () => {
    setShowProductCreateForm(false);
    setEditingProductItemId(null);
    setOriginalProductStock(null);
    setSharedEstimateMode(false);
    setNewProductName('');
    setNewProductItemCode('');
    setNewProductBarcode('');
    setNewProductBrand('');
    setNewProductCategory('');
    setNewProductUom('Pcs');
    setNewProductPurchasePrice('');
    setNewProductBasePrice('');
    setNewProductStock('');
    setNewProductReorderLevel('');
    setNewProductHsn('');
    setNewProductTaxRate(18);
    setNewProductDiscountPercent('');
    setNewProductDiscountFlat('');
    setNewProductOfferPrice('');
    setNewProductIsGstApplicable(true);
    setNewProductIsDummy(false);
    setNewProductIsCustomCategory(false);
    setNewProductGradeId('');
    setNewProductIsAddingGrade(false);
    setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
    setNewProductPcs('');
    setTierPrices({});
    setPaymentType('CASH');
  };

  const handleCreateNewGrade = async () => {
    if (!isDesktopRuntime() || !tenantId || !newProductCategory.trim() || !newProductGradeForm.grade_name.trim()) return;
    setNewProductSavingGrade(true);
    const gradeId = uuidv4();
    const res = await gradesApi.addGrade({
      grade_id: gradeId,
      tenant_id: tenantId,
      category: newProductCategory.trim(),
      grade_name: newProductGradeForm.grade_name.trim(),
      rate: Number(newProductGradeForm.rate) || 0,
      purchase_price: Number(newProductGradeForm.purchase_price) || 0,
      offer_price: Number(newProductGradeForm.offer_price) || 0,
    });
    if (res.success) {
      const fresh = await gradesApi.getGrades(tenantId);
      if (Array.isArray(fresh)) setNewProductGrades(fresh);
      setNewProductGradeId(gradeId);
      if (!newProductBasePrice && newProductGradeForm.rate) setNewProductBasePrice(newProductGradeForm.rate);
      setNewProductIsAddingGrade(false);
      setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
    } else {
      onStatusMessage({ text: 'Failed to create grade: ' + (res.error || ''), type: 'error' });
      setTimeout(() => onStatusMessage(null), 3000);
    }
    setNewProductSavingGrade(false);
  };

  return { openProductEditor, resetProductForm, handleCreateNewGrade };
}
