import type React from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { productsApi } from '../../../data/products';
import { pricingTiersApi } from '../../../data/pricingTiers';
import { v4 as uuidv4 } from 'uuid';
import type { Product } from '../purchaseTypes';
import type { PurchaseFormItem } from '../purchaseTypes';
import type { PurchaseProductFormState } from './usePurchaseProductFormState';

export interface UsePurchaseQuickProductContext {
  getPriceCode: () => string;
  hsnInputRefs: React.RefObject<(HTMLInputElement | null)[]>;
  onStatusMessage: (msg: { text: string; type: "success" | "error"; } | null) => void;
  resetProductForm: () => void;
  setBillItems: React.Dispatch<React.SetStateAction<PurchaseFormItem[]>>;
  setCreatedProductIds: React.Dispatch<React.SetStateAction<string[]>>;
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  setProductSearch: React.Dispatch<React.SetStateAction<string>>;
  tenantId: string;
  type: "GST" | "ESTIMATE";
  productForm: PurchaseProductFormState;
}

/**
 * Create a product from the purchase bill form (`handleCreateAndAddProduct`) — or update the one being edited — and
 * add it to the bill items with its grade, tier prices and stock.
 */
export function usePurchaseQuickProduct(ctx: UsePurchaseQuickProductContext) {
  const { getPriceCode, hsnInputRefs, onStatusMessage, resetProductForm, setBillItems, setCreatedProductIds, setProducts, setProductSearch, tenantId, type } = ctx;
  const { editingProductItemId, newProductBarcode, newProductBasePrice, newProductBrand, newProductCategory, newProductDiscountFlat, newProductDiscountPercent, newProductGradeId, newProductGrades, newProductHsn, newProductIsDummy, newProductIsGstApplicable, newProductItemCode, newProductName, newProductOfferPrice, newProductPcs, newProductPurchasePrice, newProductReorderLevel, newProductStock, newProductTaxRate, newProductUom, originalProductStock, setNewProductBarcode, tierPrices } = ctx.productForm;
  const handleCreateAndAddProduct = async (retries = 3) => {
    if (!isDesktopRuntime() || !tenantId || !newProductName.trim()) return;

    // EDIT MODE — update existing product
    if (editingProductItemId) {
      const purchasePrice = Number(newProductPurchasePrice) || 0;
      const basePrice = Number(newProductBasePrice) || purchasePrice;
      const selectedGrade = newProductGradeId ? newProductGrades.find(g => g.grade_id === newProductGradeId) : null;
      const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
      const isWeightBilling = weightUoms.includes((newProductUom || '').toLowerCase());
      const billingType: 'WEIGHT' | 'PIECE' = isWeightBilling ? 'WEIGHT' : 'PIECE';
      const rawPcs = Number(newProductPcs) || 0;
      // Use original stock to avoid double stock entry when purchase bill is saved
      const stockToPreserve = originalProductStock ?? 0;
      let domainAttrsObj: Record<string, any> = {};
      try {
        const existingProduct = await productsApi.getProductsByIds({ tenant_id: tenantId, product_ids: [editingProductItemId] });
        if (Array.isArray(existingProduct) && existingProduct[0]?.domain_attributes) {
          domainAttrsObj = typeof existingProduct[0].domain_attributes === 'string'
            ? JSON.parse(existingProduct[0].domain_attributes)
            : existingProduct[0].domain_attributes;
        }
      } catch {}
      if (isWeightBilling && rawPcs > 0) {
        domainAttrsObj.pcs_per_kg = stockToPreserve > 0 ? rawPcs / stockToPreserve : rawPcs;
        domainAttrsObj.pcs_stock = rawPcs;
        domainAttrsObj.pcs = rawPcs;
      }
      if (type === 'GST') {
        domainAttrsObj.gst_type = newProductIsDummy ? 'PAPER' : 'REAL';
        if (newProductIsDummy) {
          if (purchasePrice > 0) {
            domainAttrsObj.gst_purchase_price = purchasePrice;
            domainAttrsObj.paper_purchase_price = purchasePrice;
          }
          if (basePrice > 0) {
            domainAttrsObj.paper_mrp = basePrice;
            domainAttrsObj.paper_base_price = basePrice;
          }
        } else {
          delete domainAttrsObj.paper_purchase_price;
          delete domainAttrsObj.paper_mrp;
          delete domainAttrsObj.paper_base_price;
          delete domainAttrsObj.gst_purchase_price;
        }
      }
      const res = await productsApi.updateProduct({
        product_id: editingProductItemId,
        tenant_id: tenantId,
        name: newProductName.trim(),
        sku_barcode: newProductBarcode,
        item_code: newProductItemCode.toUpperCase(),
        category: newProductCategory,
        brand_manufacturer: newProductBrand,
        uom: newProductUom,
        purchase_price: purchasePrice,
        base_price: basePrice,
        current_stock: stockToPreserve,
        reorder_level: Number(newProductReorderLevel) || 0,
        is_gst_applicable: type === 'GST' ? 1 : 0,
        tax_rate_percent: type === 'GST' ? newProductTaxRate : 0,
        hsn_sac_code: type === 'GST' ? newProductHsn : null,
        discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
        discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
        offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
        billing_type: billingType,
        domain_attributes: JSON.stringify(domainAttrsObj),
        grade_id: selectedGrade?.grade_id || null,
        pricing_mode: selectedGrade ? 'GRADE_RATE' : 'FIXED_PRICE',
      });
      if (res.success) {
        const tierRows = Object.entries(tierPrices).map(([pricing_tier_id, price]) => ({
          pricing_tier_id,
          price: price === '' ? null : Number(price),
        }));
        if (tierRows.length > 0) {
          await pricingTiersApi.setProductPricing({
            tenant_id: tenantId,
            product_id: editingProductItemId,
            pricing: tierRows,
          });
        }
        setBillItems(prev => prev.map(i =>
          i.product_id === editingProductItemId
            ? {
                ...i,
                name: newProductName.trim(),
                quantity: (newProductStock && Number(newProductStock) > 0) ? String(newProductStock) : i.quantity,
                purchase_price: String(purchasePrice),
                selling_price: String(basePrice),
                offer_price: newProductOfferPrice && Number(newProductOfferPrice) > 0 ? String(newProductOfferPrice) : '',
                is_gst_applicable: newProductIsGstApplicable ? 1 : 0,
                tax_rate_percent: newProductIsGstApplicable ? newProductTaxRate : 0,
                hsn_sac_code: newProductIsGstApplicable ? newProductHsn : '',
                skip_stock_update: type === 'GST' ? (newProductIsDummy ? 1 : 0) : 0,
              }
            : i
        ));
        resetProductForm();
        onStatusMessage({ text: 'Product updated successfully!', type: 'success' });
        setTimeout(() => onStatusMessage(null), 3000);
      } else {
        onStatusMessage({ text: 'Failed to update product: ' + (res.error || ''), type: 'error' });
        setTimeout(() => onStatusMessage(null), 3000);
      }
      return;
    }

    // CREATE MODE — add new product
    const productId = uuidv4();
    let finalBarcode = newProductBarcode;
    if (!finalBarcode) {
      const priceCode = getPriceCode();
      const gen = await productsApi.generateBarcode({ tenant_id: tenantId, item_code: newProductItemCode || undefined, strip_suffix: priceCode || undefined });
      finalBarcode = ((gen?.success && gen?.barcode) || `${newProductItemCode || '0'}001`) + priceCode;
    }
    const purchasePrice = Number(newProductPurchasePrice) || 0;
    const basePrice = Number(newProductBasePrice) || purchasePrice;
    const selectedGrade = newProductGradeId ? newProductGrades.find(g => g.grade_id === newProductGradeId) : null;
    const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
    const isWeightBilling = weightUoms.includes((newProductUom || '').toLowerCase());
    const billingType: 'WEIGHT' | 'PIECE' = isWeightBilling ? 'WEIGHT' : 'PIECE';
    const rawPcs = Number(newProductPcs) || 0;
    const domainAttrsObj: Record<string, any> = {};
    if (isWeightBilling && rawPcs > 0) {
      domainAttrsObj.pcs_per_kg = rawPcs;
      domainAttrsObj.pcs_stock = rawPcs;
      domainAttrsObj.pcs = rawPcs;
    }
    if (type === 'GST') {
      domainAttrsObj.gst_type = newProductIsDummy ? 'PAPER' : 'REAL';
      if (newProductIsDummy) {
        if (purchasePrice > 0) {
          domainAttrsObj.gst_purchase_price = purchasePrice;
          domainAttrsObj.paper_purchase_price = purchasePrice;
        }
        if (basePrice > 0) {
          domainAttrsObj.paper_mrp = basePrice;
          domainAttrsObj.paper_base_price = basePrice;
        }
      }
    }
    const res = await productsApi.addProduct({
      product_id: productId,
      tenant_id: tenantId,
      name: newProductName.trim(),
      sku_barcode: finalBarcode,
      item_code: newProductItemCode.toUpperCase(),
      category: newProductCategory,
      brand_manufacturer: newProductBrand,
      uom: newProductUom,
      purchase_price: purchasePrice,
      base_price: basePrice,
      current_stock: 0,
      reorder_level: Number(newProductReorderLevel) || 0,
      is_gst_applicable: type === 'GST' ? 1 : 0,
      tax_rate_percent: type === 'GST' ? newProductTaxRate : 0,
      hsn_sac_code: type === 'GST' ? newProductHsn : null,
      discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
      discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
      offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
      billing_type: billingType,
      domain_attributes: JSON.stringify(domainAttrsObj),
      grade_id: selectedGrade?.grade_id || null,
      pricing_mode: selectedGrade ? 'GRADE_RATE' : 'FIXED_PRICE',
      is_deleted: 0,
      sync_status: 'PENDING',
    });
    if (res.success) {
      setCreatedProductIds(prev => [...prev, productId]);
      const tierRows = Object.entries(tierPrices).map(([pricing_tier_id, price]) => ({
        pricing_tier_id,
        price: price === '' ? null : Number(price),
      }));
      if (tierRows.length > 0) {
        await pricingTiersApi.setProductPricing({
          tenant_id: tenantId,
          product_id: productId,
          pricing: tierRows,
        });
      }
      const initialQty = (newProductStock && Number(newProductStock) > 0) ? String(newProductStock) : '1';
      setBillItems(prev => [...prev, {
        product_id: productId,
        name: newProductName.trim(),
        quantity: initialQty,
        purchase_price: String(purchasePrice),
        selling_price: String(basePrice),
        offer_price: newProductOfferPrice && Number(newProductOfferPrice) > 0 ? String(newProductOfferPrice) : '',
        stock: '0',
        is_gst_applicable: type === 'GST' ? 1 : 0,
        tax_rate_percent: type === 'GST' ? newProductTaxRate : 0,
        hsn_sac_code: type === 'GST' ? newProductHsn : '',
        skip_stock_update: type === 'GST' ? (newProductIsDummy ? 1 : 0) : 0,
      }]);
      setProductSearch('');
      setProducts([]);
      resetProductForm();
      if (type === 'GST') {
        setTimeout(() => { hsnInputRefs.current[hsnInputRefs.current.length - 1]?.focus(); }, 0);
      }
    } else if (res.error?.includes('sku_barcode') && retries > 0 && !newProductBarcode) {
      const priceCode = getPriceCode();
      // Strip priceCode from the end to get the base barcode for proper sequential increment
      const baseBarcode = priceCode && finalBarcode.endsWith(priceCode)
        ? finalBarcode.slice(0, -priceCode.length)
        : finalBarcode;
      const match = baseBarcode.match(/(\d+)$/);
      const numPart = match ? match[1] : '001';
      const nextNum = String(parseInt(numPart, 10) + 1).padStart(numPart.length, '0');
      const newBase = baseBarcode.replace(/(\d+)$/, nextNum);
      setNewProductBarcode(newBase + priceCode);
      setTimeout(() => handleCreateAndAddProduct(retries - 1), 100);
    } else {
      onStatusMessage({ text: 'Failed to create product: ' + (res.error || ''), type: 'error' });
      setTimeout(() => onStatusMessage(null), 3000);
    }
  };

  return { handleCreateAndAddProduct };
}
