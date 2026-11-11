import { storeDate } from '../../../utils/time/dateDisplay';
import { parseAmount } from '../../../utils/pricing/money';
import { getDefaultTaxRate, isVatStore } from '../../../utils/localization/storeProfile';
import type * as B from '../billingTypes';
import type React from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { productsApi, getProductsByIds } from '../../../data/products';
import { v4 as uuidv4 } from 'uuid';
import { gradesApi } from '../../../data/grades';
import { type CartItem, useCartStore } from '../../../store/cartStore';
import { pricingTiersApi } from '../../../data/pricingTiers';
import { purchasesApi } from '../../../data/purchases';
import { printingApi } from '../../../data/printing';
import type { InvoiceType } from '../../../store/cartStore';
import type { ProductSearchState } from './useProductSearchState';
import type { ProductFormState } from './useProductFormState';
import type { useSearchSelection } from './useSearchSelection';
import type { QuickProductItemInput } from '../modals/quick-product/types';

export interface UseProductFormHandlersContext {
  productForm: ProductFormState;
  productSearch: ProductSearchState;
  handleSelectProduct: ReturnType<typeof useSearchSelection>['handleSelectProduct'];
  invoiceType: InvoiceType;
  setHardwareError: React.Dispatch<React.SetStateAction<string | null>>;
  setProductPricingMap: React.Dispatch<React.SetStateAction<Record<string, Record<string, number>>>>;
  syncActiveSnapshot: () => void;
  tenantId: string | null;
  updateQuantity: (productId: string, quantity: number | string) => void;
}

/**
 * Actions of the billing "create / edit product" form: open it for a cart line, reset it, price/grade/barcode helpers,
 * create a grade, and save the product (create or update, optionally as a temp item) and add it to the cart.
 */
export function useProductFormHandlers(ctx: UseProductFormHandlersContext) {
  const { handleSelectProduct, invoiceType, setHardwareError, setProductPricingMap, syncActiveSnapshot, tenantId, updateQuantity } = ctx;
  const { setShowProductCreateForm, setEditingProductId, setEditingProductSnapshot, setNewProductName, setNewProductItemCode, setNewProductBarcode, setNewProductBrand, setNewProductCategory, setNewProductGradeId, setNewProductIsAddingGrade, setNewProductGradeForm, setNewProductUom, setNewProductPcs, setNewProductPurchasePrice, setNewProductBasePrice, setNewProductStock, setNewProductReorderLevel, setNewProductHsn, setNewProductTaxRate, setNewProductDiscountPercent, setNewProductDiscountFlat, setNewProductOfferPrice, setNewProductIsGstApplicable, setNewProductIsDummy, setNewProductIsCustomCategory, setProductFormTierPrices, productPriceCoding, newProductBarcode, newProductPurchasePrice, newProductDiscountPercent, newProductGrades, newProductItemCode, newProductCategory, newProductGradeForm, setNewProductSavingGrade, setNewProductGrades, configuredCategories, newProductName, newProductBasePrice, newProductStock, newProductIsGstApplicable, newProductUom, editingProductId, newProductGradeId, editingProductSnapshot, newProductPcs, productFormTierPrices, newProductBrand, newProductReorderLevel, newProductTaxRate, newProductHsn, newProductDiscountFlat, newProductOfferPrice, newProductIsDummy, autoPrintBarcode } = ctx.productForm;
  const { setSearchQuery, setResults } = ctx.productSearch;
  const resetProductForm = () => {
    setShowProductCreateForm(false);
    setEditingProductId(null);
    setEditingProductSnapshot(null);
    setNewProductName('');
    setNewProductItemCode('');
    setNewProductBarcode('');
    setNewProductBrand('');
    setNewProductCategory('');
    setNewProductGradeId('');
    setNewProductIsAddingGrade(false);
    setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
    setNewProductUom('Pcs');
    setNewProductPcs('');
    setNewProductPurchasePrice('');
    setNewProductBasePrice('');
    setNewProductStock('');
    setNewProductReorderLevel('');
    setNewProductHsn('');
    setNewProductTaxRate(getDefaultTaxRate());
    setNewProductDiscountPercent('');
    setNewProductDiscountFlat('');
    setNewProductOfferPrice('');
    setNewProductIsGstApplicable(isVatStore());
    setNewProductIsDummy(false);
    setNewProductIsCustomCategory(false);
    setProductFormTierPrices({});
  };

  const encodeProductPurchasePrice = (price: string | number | null | undefined) => {
    if (!productPriceCoding) return '';
    const numeric = parseAmount(price);
    if (numeric === null || numeric <= 0) return '';
    return String(numeric).split('').map(char => char === '.' ? '.' : (productPriceCoding[char] || '')).join('');
  };

  const stripProductPurchasePriceCode = (barcode: string, price: string | number | null | undefined) => {
    const code = encodeProductPurchasePrice(price);
    for (const candidate of [code, code.replace(/\./g, '')]) {
      if (candidate && barcode.endsWith(candidate)) return barcode.slice(0, -candidate.length);
    }
    return barcode;
  };

  const handleProductPurchasePriceChange = (value: string) => {
    const barcodeWithoutOldPriceCode = stripProductPurchasePriceCode(newProductBarcode, newProductPurchasePrice);
    const barcode = barcodeWithoutOldPriceCode ? `${barcodeWithoutOldPriceCode}${encodeProductPurchasePrice(value)}` : '';
    setNewProductPurchasePrice(value);
    if (barcode !== newProductBarcode) setNewProductBarcode(barcode);
  };

  const handleProductBasePriceChange = (value: string) => {
    setNewProductBasePrice(value);
    if (newProductDiscountPercent !== '') {
      const mrp = parseAmount(value) ?? 0;
      const pct = Number(newProductDiscountPercent);
      setNewProductDiscountFlat(mrp > 0 && Number.isFinite(pct) ? ((mrp * pct) / 100).toFixed(2) : '');
    }
  };

  const handleProductGradeChange = (gradeId: string) => {
    setNewProductGradeId(gradeId);
    if (!gradeId) return;
    const grade = newProductGrades.find(g => g.grade_id === gradeId);
    if (!grade) return;
    setNewProductBasePrice(String(Number(grade.rate) || 0));
    handleProductPurchasePriceChange(String(Number(grade.purchase_price) || 0));
    if (newProductDiscountPercent !== '') {
      const mrp = Number(grade.rate) || 0;
      const pct = Number(newProductDiscountPercent);
      setNewProductDiscountFlat(mrp > 0 && Number.isFinite(pct) ? ((mrp * pct) / 100).toFixed(2) : '');
    }
  };

  const generateProductBarcode = async () => {
    if (!isDesktopRuntime() || !tenantId) return;
    try {
      const result = await productsApi.generateBarcode({ tenant_id: tenantId, item_code: newProductItemCode || undefined });
      if (result.success && result.barcode) {
        setNewProductBarcode(`${result.barcode}${encodeProductPurchasePrice(newProductPurchasePrice)}`);
      }
    } catch (error) {
      setHardwareError('Failed to generate barcode: ' + ((error as Error)?.message || ''));
    }
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
      setNewProductBasePrice(String(Number(newProductGradeForm.rate) || 0));
      handleProductPurchasePriceChange(String(Number(newProductGradeForm.purchase_price) || 0));
      setNewProductOfferPrice(newProductGradeForm.offer_price || '');
      if (newProductDiscountPercent !== '') {
        const mrp = Number(newProductGradeForm.rate) || 0;
        const pct = Number(newProductDiscountPercent);
        setNewProductDiscountFlat(mrp > 0 && Number.isFinite(pct) ? ((mrp * pct) / 100).toFixed(2) : '');
      }
      setNewProductIsAddingGrade(false);
      setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
    } else {
      setHardwareError('Failed to create grade: ' + (res.error || ''));
    }
    setNewProductSavingGrade(false);
  };

  const handleEditProduct = async (item: CartItem) => {
    setEditingProductId(item.product_id);
    let prodDetails: B.BillingProduct | null = null;
    let productPricingRows: B.ProductPricingRow[] = [];
    if (isDesktopRuntime()) {
      const tid = tenantId || 'global';
      const [productResult, pricingResult] = await Promise.allSettled([
        getProductsByIds({ tenant_id: tid, product_ids: [item.product_id] }),
        pricingTiersApi.getProductPricing(tid),
      ]);
      if (productResult.status === 'fulfilled' && Array.isArray(productResult.value) && productResult.value.length > 0) {
        prodDetails = productResult.value[0];
      } else if (productResult.status === 'rejected') {
        console.error('Failed to fetch product for editing', productResult.reason);
      }
      if (pricingResult.status === 'fulfilled' && Array.isArray(pricingResult.value)) {
        productPricingRows = pricingResult.value;
      } else if (pricingResult.status === 'rejected') {
        console.error('Failed to fetch product tier prices for editing', pricingResult.reason);
      }
    }

    const hasProductRecord = Boolean(prodDetails);
    const p: B.BillingProduct = prodDetails || item;
    setEditingProductSnapshot(p);
    setNewProductName(p.name || item.name || '');
    setNewProductItemCode(p.item_code ?? (hasProductRecord ? '' : item.item_code || ''));
    // Keep the barcode attached to this cart item; use the product lookup only when the cart has none.
    const selectedCartBarcode = String(item.sku_barcode ?? '').trim();
    const selectedProductBarcode = selectedCartBarcode || String(p.sku_barcode ?? '').trim();
    setNewProductBarcode(selectedProductBarcode);
    setNewProductBrand(p.brand_manufacturer ?? (hasProductRecord ? '' : item.brand_manufacturer || ''));
    setNewProductCategory(p.category || '');
    setNewProductUom(p.uom || item.uom || 'Pcs');

    if (p.domain_attributes) {
      try {
        const da = typeof p.domain_attributes === 'string' ? JSON.parse(p.domain_attributes) : p.domain_attributes;
        const pcs = da.pcs ?? da.pcs_stock;
        setNewProductPcs(pcs != null && pcs !== 0 ? String(pcs) : '');
      } catch {
        setNewProductPcs('');
      }
    } else {
      setNewProductPcs('');
    }

    setNewProductPurchasePrice(p.purchase_price != null ? String(p.purchase_price) : (!hasProductRecord && item.purchase_price != null ? String(item.purchase_price) : ''));
    const effectiveBasePrice = p.pricing_mode === 'GRADE_RATE' && p.grade_rate != null
      ? p.grade_rate
      : (p.base_price ?? (!hasProductRecord ? item.base_price : undefined));
    setNewProductBasePrice(effectiveBasePrice != null ? String(effectiveBasePrice) : '');
    setNewProductStock(p.current_stock != null ? String(p.current_stock) : (!hasProductRecord && item.quantity != null ? String(item.quantity) : ''));
    setNewProductReorderLevel(p.reorder_level != null ? String(p.reorder_level) : '');
    setNewProductHsn(p.hsn_sac_code || '');
    setNewProductTaxRate(p.tax_rate_percent != null ? Number(p.tax_rate_percent) : (!hasProductRecord && item.tax_rate_percent != null ? Number(item.tax_rate_percent) : 0));
    setNewProductDiscountPercent(p.discount_percent != null ? String(p.discount_percent) : (!hasProductRecord && item.discount_percent != null ? String(item.discount_percent) : ''));
    setNewProductDiscountFlat(p.discount_flat != null ? String(p.discount_flat) : (!hasProductRecord && item.discount_flat != null ? String(item.discount_flat) : ''));
    setNewProductOfferPrice(p.offer_price != null ? String(p.offer_price) : (!hasProductRecord && item.offer_price != null ? String(item.offer_price) : ''));
    setNewProductIsGstApplicable(Boolean(p.is_gst_applicable ?? (!hasProductRecord ? (item as B.CartItem).is_gst_applicable : false)));
    setNewProductGradeId(p.grade_id ?? (!hasProductRecord ? item.grade_id : '') ?? '');
    setNewProductIsCustomCategory(!configuredCategories.includes(p.category || '') && Boolean(p.category));
    const tierPrices: Record<string, string> = {};
    for (const row of productPricingRows) {
      if (row.product_id === item.product_id && row.price != null && row.price !== '') {
        tierPrices[row.pricing_tier_id] = String(row.price);
      }
    }
    setProductFormTierPrices(tierPrices);

    setShowProductCreateForm(true);
  };

  const handleCreateAndAddProduct = async (retries = 3, isAutoGenerated = false, asTemp = false) => {
    if (!isDesktopRuntime() || !tenantId || !newProductName.trim()) return;
    const purchasePrice = parseAmount(newProductPurchasePrice) ?? 0;
    const basePrice = parseAmount(newProductBasePrice) ?? 0;
    const qty = Number(newProductStock) || 0;
    const isGstProduct = (invoiceType === 'GST') || newProductIsGstApplicable;

    const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
    const isWeightBilling = weightUoms.includes((newProductUom || '').toLowerCase());
    const billingType: 'WEIGHT' | 'PIECE' = isWeightBilling ? 'WEIGHT' : 'PIECE';

    if (editingProductId) {
      const selectedGrade = newProductGradeId ? newProductGrades.find(g => g.grade_id === newProductGradeId) : null;
      const selectedGradeRate = selectedGrade?.rate ?? (
        editingProductSnapshot?.grade_id === newProductGradeId ? editingProductSnapshot?.grade_rate : null
      );
      const savedBillingType = isWeightBilling || (
        editingProductSnapshot?.uom === newProductUom && editingProductSnapshot?.billing_type === 'WEIGHT'
      ) ? 'WEIGHT' : 'PIECE';
      const rawPcs = Number(newProductPcs) || 0;
      let domainAttrsObj: Record<string, unknown>;
      try {
        const existingDomainAttributes = editingProductSnapshot?.domain_attributes;
        const parsedAttributes = typeof existingDomainAttributes === 'string'
          ? JSON.parse(existingDomainAttributes || '{}')
          : existingDomainAttributes;
        domainAttrsObj = parsedAttributes && typeof parsedAttributes === 'object' && !Array.isArray(parsedAttributes)
          ? { ...parsedAttributes }
          : {};
      } catch {
        domainAttrsObj = {};
      }
      if (savedBillingType === 'WEIGHT' && rawPcs > 0) {
        domainAttrsObj.pcs_per_kg = qty > 0 ? rawPcs / qty : rawPcs;
        domainAttrsObj.pcs_stock = rawPcs;
        domainAttrsObj.pcs = rawPcs;
      } else {
        delete domainAttrsObj.pcs_per_kg;
        domainAttrsObj.pcs_stock = 0;
        domainAttrsObj.pcs = 0;
      }

      let finalBarcode = newProductBarcode.trim();
      if (!finalBarcode) {
        try {
          const generated = await productsApi.generateBarcode({ tenant_id: tenantId, item_code: newProductItemCode || undefined });
          if (!generated.success || !generated.barcode) throw new Error(generated.error || 'Barcode could not be generated');
          finalBarcode = `${generated.barcode}${encodeProductPurchasePrice(newProductPurchasePrice)}`;
        } catch (error) {
          setHardwareError('Failed to generate barcode: ' + ((error as Error)?.message || ''));
          return;
        }
      }

      const tierRows = Object.entries(productFormTierPrices).map(([pricing_tier_id, price]) => ({
        pricing_tier_id,
        price: price.trim() === '' ? null : Number(price),
      }));

      if (isDesktopRuntime()) {
        const res = await productsApi.updateProduct({
          ...(editingProductSnapshot || {}),
          product_id: editingProductId,
          tenant_id: tenantId,
          name: newProductName.trim(),
          sku_barcode: finalBarcode,
          item_code: newProductItemCode ? newProductItemCode.toUpperCase() : null,
          category: newProductCategory,
          brand_manufacturer: newProductBrand,
          uom: newProductUom,
          purchase_price: purchasePrice,
          base_price: basePrice,
          current_stock: qty,
          reorder_level: Number(newProductReorderLevel) || 0,
          is_gst_applicable: newProductIsGstApplicable ? 1 : 0,
          tax_rate_percent: newProductTaxRate,
          hsn_sac_code: newProductHsn,
          discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
          discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
          offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
          billing_type: savedBillingType,
          domain_attributes: JSON.stringify(domainAttrsObj),
          grade_id: newProductGradeId || null,
          pricing_mode: newProductGradeId ? 'GRADE_RATE' : 'FIXED_PRICE',
          is_deleted: editingProductSnapshot?.is_deleted ?? 0,
          sync_status: 'PENDING',
        });
        if (!res.success) {
          setHardwareError('Failed to update product: ' + (res.error || ''));
          return;
        }

        if (tierRows.length > 0) {
          const pricingResult = await pricingTiersApi.setProductPricing({
            tenant_id: tenantId,
            product_id: editingProductId,
            pricing: tierRows,
          });
          if (!pricingResult.success) {
            setHardwareError('Product updated, but tier prices could not be saved: ' + (pricingResult.error || ''));
            return;
          }
          setProductPricingMap(prev => {
            const nextPrices = { ...(prev[editingProductId] || {}) };
            for (const row of tierRows) {
              if (row.price == null) delete nextPrices[row.pricing_tier_id];
              else nextPrices[row.pricing_tier_id] = row.price;
            }
            return { ...prev, [editingProductId]: nextPrices };
          });
        }
      }

      useCartStore.setState((state) => ({
        items: state.items.map((i) => {
          if (i.product_id === editingProductId) {
            return {
              ...i,
              name: newProductName.trim(),
              base_price: basePrice,
              // Tier synchronization falls back to original_base_price when no tier price is set.
              original_base_price: basePrice,
              purchase_price: purchasePrice,
              tax_rate_percent: newProductIsGstApplicable ? newProductTaxRate : 0,
              hsn_sac_code: newProductHsn,
              uom: newProductUom,
              billing_type: savedBillingType,
              pieces_per_kg: savedBillingType === 'WEIGHT' && rawPcs > 0 ? (qty > 0 ? rawPcs / qty : rawPcs) : undefined,
              sku_barcode: finalBarcode,
              item_code: newProductItemCode.toUpperCase(),
              brand_manufacturer: newProductBrand,
              discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
              discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
              offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
              catalog_discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
              catalog_discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
              catalog_offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
              grade_id: newProductGradeId || undefined,
              pricing_mode: newProductGradeId ? 'GRADE_RATE' : 'FIXED_PRICE',
              grade_rate: selectedGradeRate != null ? Number(selectedGradeRate) : undefined,
              original_pricing_mode: newProductGradeId ? 'GRADE_RATE' : 'FIXED_PRICE',
              original_grade_id: newProductGradeId || null,
              original_grade_rate: selectedGradeRate != null ? Number(selectedGradeRate) : null,
            };
          }
          return i;
        }),
      }));
      syncActiveSnapshot();
      resetProductForm();
      return;
    }

    // TEMP item — billing only: no product row, no barcode, no stock/inventory changes
    if (asTemp) {
      const productId = uuidv4();
      handleSelectProduct({
        product_id: productId,
        name: newProductName.trim(),
        base_price: basePrice,
        purchase_price: purchasePrice,
        tax_rate_percent: isGstProduct ? newProductTaxRate : (newProductIsGstApplicable ? newProductTaxRate : 0),
        uom: newProductUom,
        billing_type: billingType,
        pricing_mode: 'FIXED_PRICE',
        grade_id: null,
        grade_rate: null,
        sku_barcode: null,
        brand_manufacturer: newProductBrand,
        discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
        discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
        offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
        catalog_discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
        catalog_discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
        catalog_offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
        current_stock: 0,
      });
      if (qty > 0) updateQuantity(productId, qty);
      setSearchQuery('');
      setResults([]);
      resetProductForm();
      return;
    }

    const wasAutoGenerated = isAutoGenerated || !newProductBarcode.trim();
    const productId = uuidv4();
    let finalBarcode = newProductBarcode.trim();
    if (!finalBarcode) {
      const gen = await productsApi.generateBarcode({ tenant_id: tenantId, item_code: newProductItemCode || undefined });
      const generatedBarcode = (gen?.success && gen?.barcode) || `${newProductItemCode || '0'}001`;
      finalBarcode = `${generatedBarcode}${encodeProductPurchasePrice(newProductPurchasePrice)}`;
    }
    const selectedGrade = newProductGradeId ? newProductGrades.find(g => g.grade_id === newProductGradeId) : null;
    const initialStock = (isGstProduct && qty > 0) ? 0 : qty;

    const rawPcs = Number(newProductPcs) || 0;
    const domainAttrsObj: Record<string, unknown> = {};
    if (isWeightBilling && rawPcs > 0) {
      domainAttrsObj.pcs_per_kg = initialStock > 0 ? rawPcs / initialStock : rawPcs;
      domainAttrsObj.pcs_stock = rawPcs;
      domainAttrsObj.pcs = rawPcs;
    }
    if (isGstProduct) {
      domainAttrsObj.gst_type = newProductIsDummy ? 'PAPER' : 'REAL';
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
      current_stock: initialStock,
      reorder_level: Number(newProductReorderLevel) || 0,
      is_gst_applicable: isGstProduct ? 1 : (newProductIsGstApplicable ? 1 : 0),
      tax_rate_percent: isGstProduct ? newProductTaxRate : (newProductIsGstApplicable ? newProductTaxRate : 0),
      hsn_sac_code: isGstProduct ? newProductHsn : (newProductIsGstApplicable ? newProductHsn : null),
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
      const tierRows = Object.entries(productFormTierPrices).map(([pricing_tier_id, price]) => ({
        pricing_tier_id,
        price: price.trim() === '' ? null : Number(price),
      }));
      if (tierRows.length > 0) {
        const pricingResult = await pricingTiersApi.setProductPricing({
          tenant_id: tenantId,
          product_id: productId,
          pricing: tierRows,
        });
        if (pricingResult.success) {
          setProductPricingMap(prev => {
            const nextPrices: Record<string, number> = {};
            for (const row of tierRows) if (row.price != null) nextPrices[row.pricing_tier_id] = row.price;
            return { ...prev, [productId]: nextPrices };
          });
        } else {
          setHardwareError('Product created, but tier prices could not be saved: ' + (pricingResult.error || ''));
        }
      }

      // Create a purchase bill if it's a GST product and quantity > 0
      if (isGstProduct && qty > 0) {
        const purchaseBillId = uuidv4();
        const itemId = uuidv4();
        const totalAmt = qty * purchasePrice;
        await purchasesApi.addPurchaseBill({
          purchase_bill_id: purchaseBillId,
          tenant_id: tenantId,
          bill_number: `AUTO-BILL-${Date.now()}`,
          supplier_id: null,
          supplier_name: 'Unknown Supplier',
          bill_date: storeDate(new Date(), 'en-CA'),
          invoice_number: null,
          notes: `Auto-created on fly from billing page for product: ${newProductName.trim()}`,
          total_amount: totalAmt,
          bill_type: 'GST',
          items: [{
            item_id: itemId,
            product_id: productId,
            name: newProductName.trim(),
            quantity: qty,
            purchase_price: purchasePrice,
            total_amount: totalAmt,
            is_gst_applicable: 1,
            tax_rate_percent: newProductTaxRate,
            hsn_sac_code: newProductHsn || '',
            skip_stock_update: newProductIsDummy ? 1 : 0,
          }],
        });
      }

      if (autoPrintBarcode && isDesktopRuntime() && finalBarcode) {
        printingApi.printBarcode(tenantId, finalBarcode, basePrice > 0 ? basePrice : undefined, newProductName.trim(), 1).then((r) => {
          if (!r?.success) console.warn('[BillingPage] Auto barcode print failed:', r?.error || 'No barcode printer configured');
        }).catch((e) => console.warn('[BillingPage] Auto barcode print error:', e?.message || e));
      }
      handleSelectProduct({
        product_id: productId,
        name: newProductName.trim(),
        base_price: basePrice,
        tier_prices: Object.fromEntries(tierRows.filter(row => row.price != null).map(row => [row.pricing_tier_id, row.price])) as Record<string, number>,
        purchase_price: purchasePrice,
        tax_rate_percent: isGstProduct ? newProductTaxRate : (newProductIsGstApplicable ? newProductTaxRate : 0),
        uom: newProductUom,
        billing_type: billingType,
        domain_attributes: isWeightBilling && rawPcs > 0 ? domainAttrsObj : undefined,
        pricing_mode: selectedGrade ? 'GRADE_RATE' : 'FIXED_PRICE',
        grade_id: selectedGrade?.grade_id || null,
        grade_rate: selectedGrade ? Number(selectedGrade.rate) : null,
        sku_barcode: finalBarcode,
        brand_manufacturer: newProductBrand,
        discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
        discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
        offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
        catalog_discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
        catalog_discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
        catalog_offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
        current_stock: newProductIsDummy ? 0 : qty,
      });
      setSearchQuery('');
      setResults([]);
      resetProductForm();
    } else if (res.error?.includes('sku_barcode') && retries > 0 && wasAutoGenerated) {
      const match = finalBarcode.match(/(\d+)(\D*)$/);
      const suffix = match ? match[2] || '' : '';
      const numPart = match ? match[1] : '001';
      const nextNum = String(parseInt(numPart, 10) + 1).padStart(numPart.length, '0');
      const incrementedBarcode = finalBarcode.replace(/(\d+)(\D*)$/, nextNum + suffix);
      setNewProductBarcode(incrementedBarcode);
      setTimeout(() => handleCreateAndAddProduct(retries - 1, true), 100);
    } else {
      setHardwareError('Failed to create product: ' + (res.error || ''));
    }
  };

  const handleBulkCreateAndAddProducts = async (
    items: QuickProductItemInput[],
    asTemp = false
  ) => {
    if (!isDesktopRuntime() || !tenantId || items.length === 0) return;

    const isGst = invoiceType === 'GST';

    if (asTemp) {
      for (const item of items) {
        const productId = uuidv4();
        handleSelectProduct({
          product_id: productId,
          name: item.name.trim(),
          base_price: item.basePrice,
          purchase_price: item.purchasePrice || 0,
          tax_rate_percent: isGst ? (item.taxRate || 0) : 0,
          uom: item.uom || 'Pcs',
          billing_type: 'PIECE',
          pricing_mode: 'FIXED_PRICE',
          grade_id: null,
          grade_rate: null,
          sku_barcode: null,
          current_stock: 0,
        });
        if (item.qty > 0) {
          updateQuantity(productId, item.qty);
        }
      }
      setSearchQuery('');
      setResults([]);
      resetProductForm();
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const productId = uuidv4();
      let finalBarcode = (item.barcode || '').trim();
      if (!finalBarcode) {
        try {
          const gen = await productsApi.generateBarcode({
            tenant_id: tenantId,
            item_code: item.itemCode || undefined,
          });
          const generatedBarcode = (gen?.success && gen?.barcode) || `${item.itemCode || '0'}001`;
          finalBarcode = `${generatedBarcode}${encodeProductPurchasePrice(item.purchasePrice)}`;
        } catch {
          finalBarcode = `${Date.now()}${i}`;
        }
      }

      const initialStock = (isGst && item.qty > 0) ? 0 : item.qty;

      const res = await productsApi.addProduct({
        product_id: productId,
        tenant_id: tenantId,
        name: item.name.trim(),
        sku_barcode: finalBarcode,
        item_code: item.itemCode ? item.itemCode.toUpperCase() : null,
        category: item.category || '',
        uom: item.uom || 'Pcs',
        purchase_price: item.purchasePrice || 0,
        base_price: item.basePrice,
        current_stock: initialStock,
        reorder_level: 0,
        is_gst_applicable: isGst ? 1 : 0,
        tax_rate_percent: isGst ? (item.taxRate || 0) : 0,
        billing_type: 'PIECE',
        pricing_mode: 'FIXED_PRICE',
        is_deleted: 0,
        sync_status: 'PENDING',
      });

      if (res.success) {
        if (isGst && item.qty > 0) {
          const purchaseBillId = uuidv4();
          const itemId = uuidv4();
          const totalAmt = item.qty * (item.purchasePrice || 0);
          await purchasesApi.addPurchaseBill({
            purchase_bill_id: purchaseBillId,
            tenant_id: tenantId,
            bill_number: `AUTO-BILL-${Date.now()}-${i}`,
            supplier_id: null,
            supplier_name: 'Unknown Supplier',
            bill_date: storeDate(new Date(), 'en-CA'),
            invoice_number: null,
            notes: `Auto-created on fly from billing page for product: ${item.name.trim()}`,
            total_amount: totalAmt,
            bill_type: 'GST',
            items: [{
              item_id: itemId,
              product_id: productId,
              name: item.name.trim(),
              quantity: item.qty,
              purchase_price: item.purchasePrice || 0,
              total_amount: totalAmt,
              is_gst_applicable: 1,
              tax_rate_percent: item.taxRate || 0,
              hsn_sac_code: '',
              skip_stock_update: 0,
            }],
          });
        }

        if (autoPrintBarcode && isDesktopRuntime() && finalBarcode) {
          printingApi.printBarcode(tenantId, finalBarcode, item.basePrice > 0 ? item.basePrice : undefined, item.name.trim(), 1).catch(() => {});
        }

        handleSelectProduct({
          product_id: productId,
          name: item.name.trim(),
          base_price: item.basePrice,
          purchase_price: item.purchasePrice || 0,
          tax_rate_percent: isGst ? (item.taxRate || 0) : 0,
          uom: item.uom || 'Pcs',
          billing_type: 'PIECE',
          pricing_mode: 'FIXED_PRICE',
          grade_id: null,
          grade_rate: null,
          sku_barcode: finalBarcode,
          current_stock: item.qty,
        });

        if (item.qty > 0) {
          updateQuantity(productId, item.qty);
        }
      } else {
        setHardwareError('Failed to create product ' + item.name + ': ' + (res.error || ''));
      }
    }

    setSearchQuery('');
    setResults([]);
    resetProductForm();
  };

  return { resetProductForm, encodeProductPurchasePrice, stripProductPurchasePriceCode, handleProductPurchasePriceChange, handleProductBasePriceChange, handleProductGradeChange, generateProductBarcode, handleCreateNewGrade, handleEditProduct, handleCreateAndAddProduct, handleBulkCreateAndAddProducts };
}
