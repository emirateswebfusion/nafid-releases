import { v4 as uuidv4 } from 'uuid';
import { isDesktopRuntime } from '../../../data/client';
import { updateProduct, createProduct, setProductPricing } from '../../../data/products';
import { purchasesApi } from '../../../data/purchases';
import { type Product } from '../inventoryUtils';
import { listGrades, createGrade } from '../../../data/grades';
import type { InventoryState } from './useInventoryState';

export interface UseInventorySaveContext {
  encodePurchasePriceCode: (price: unknown) => string;
  existingCategories: string[];
  loadProducts: (reset?: boolean) => Promise<void>;
  tenantId: string | null;
  inv: InventoryState;
}

/**
 * Save the add / edit product form (`handleSave`), including the optional GST purchase entry it records as a purchase bill.
 */
export function useInventorySave(ctx: UseInventorySaveContext) {
  const { encodePurchasePriceCode, existingCategories, loadProducts, tenantId } = ctx;
  const { editingProduct, formData, priceCoding, setFormData, setGrades, setLoading, setProducts, setStatusMessage, setTotalCount, setView, suppliers, tierPrices, view } = ctx.inv;
  const handleSave = async (retries = 3) => {
    if (!formData.name) {
      setStatusMessage({ text: 'Please fill in material Name. Purchase, MRP, and Offer are optional.', type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    let finalBarcode = formData.sku_barcode;
    if (!finalBarcode) {
      let prefix = formData.item_code || '';
      if (prefix.length > 12) {
        prefix = prefix.substring(0, 12);
      }
      const remainingLength = 12 - prefix.length;
      let code = prefix;
      if (remainingLength > 0) {
        const min = Math.pow(10, remainingLength - 1);
        const max = Math.pow(10, remainingLength) - 1;
        const randomPart = Math.floor(min + Math.random() * (max - min + 1)).toString();
        code += randomPart;
      }
      
      let priceCode = '';
      if (priceCoding && formData.purchase_price) {
        priceCode = encodePurchasePriceCode(formData.purchase_price);
      }
      finalBarcode = code + priceCode;
      // Don't just setFormData, pass it directly to payload since state update is async
      setFormData(prev => ({ ...prev, sku_barcode: finalBarcode }));
      setStatusMessage({ text: 'Barcode auto-generated.', type: 'success' });
      setTimeout(() => setStatusMessage(null), 3000);
    }
    
    setLoading(true);

    // Normalize category: clean whitespace and resolve canonical casing from existing categories
    let normalizedCategory = (formData.category || '').trim().replace(/\s+/g, ' ');
    if (normalizedCategory) {
      const match = existingCategories.find(c => c.toLowerCase() === normalizedCategory.toLowerCase());
      if (match) {
        normalizedCategory = match;
      }
    }

    const userEnteredStock = Number(formData.current_stock) || 0;
    const userEnteredPaperStock = formData.gst_purchase_quantity !== '' && formData.gst_purchase_quantity !== null
      ? (Number(formData.gst_purchase_quantity) || 0)
      : (Number(formData.domain_attributes?.paper_stock) || 0);

    const payload = {
      ...(editingProduct ?? { product_id: uuidv4(), tenant_id: tenantId || 'unset', sync_status: 'pending', created_at: new Date().toLocaleString('en-CA', { hour12: false }).replace(', ', 'T') }),
      ...formData,
      category: normalizedCategory,
      sku_barcode: finalBarcode,
      purchase_price: Number(formData.purchase_price) || 0,
      base_price: Number(formData.base_price) || 0,
      current_stock: userEnteredStock,
      paper_stock: userEnteredPaperStock,
      reorder_level: Number(formData.reorder_level) || 0,
      is_gst_applicable: formData.is_gst_applicable || String(formData.hsn_sac_code || '').trim() !== '' ? 1 : 0,
      domain_attributes: (() => {
        const da = { ...formData.domain_attributes };
        const rawPcs = Number(da?.pcs !== undefined ? da.pcs : da?.pcs_stock) || 0;
        const rawStock = userEnteredStock;
        if (rawPcs > 0) {
          da.pcs_per_kg = rawStock > 0 ? rawPcs / rawStock : rawPcs;
        } else {
          delete da.pcs_per_kg;
        }
        const hasPaperData = (formData.gst_purchase_price !== '' && Number(formData.gst_purchase_price) > 0) ||
                             (da.paper_mrp !== undefined && da.paper_mrp !== '' && Number(da.paper_mrp) > 0) ||
                             (formData.gst_purchase_quantity !== '' && Number(formData.gst_purchase_quantity) > 0);
        const hasRealData = (formData.purchase_price !== '' && Number(formData.purchase_price) > 0) ||
                            (formData.current_stock !== '' && Number(formData.current_stock) > 0);

        if (formData.gst_purchase_quantity !== '' && formData.gst_purchase_quantity !== null) {
          da.paper_stock = Number(formData.gst_purchase_quantity) || 0;
        }

        if (formData.gst_purchase_price !== '' && formData.gst_purchase_price !== null && formData.gst_purchase_price !== undefined) {
          da.gst_purchase_price = Number(formData.gst_purchase_price) || 0;
          da.paper_purchase_price = da.gst_purchase_price;
        }

        const hasRealStockOrPricing = hasRealData || (formData.base_price !== '' && Number(formData.base_price) > 0) || Number(formData.current_stock || 0) > 0;
        const isPaperChosen = !hasRealStockOrPricing && (
          (formData.gst_type === 'PAPER') ||
          (hasPaperData && !hasRealData) ||
          (Number(formData.current_stock) <= 0 && Number(da.paper_stock || 0) > 0) ||
          (formData.show_gst_purchase && (formData.gst_purchase_is_dummy || Number(formData.gst_purchase_quantity) > 0))
        );

        da.gst_type = isPaperChosen ? 'PAPER' : 'REAL';
        if (da.paper_mrp !== undefined && da.paper_mrp !== '' && da.paper_mrp !== null) {
          da.paper_mrp = Number(da.paper_mrp);
          da.paper_base_price = Number(da.paper_mrp);
        } else {
          delete da.paper_mrp;
          delete da.paper_base_price;
        }
        return JSON.stringify(da);
      })(),
      discount_percent: formData.discount_percent === '' ? null : Number(formData.discount_percent),
      discount_flat: formData.discount_flat === '' ? null : Number(formData.discount_flat),
      offer_price: formData.offer_price === '' ? null : Number(formData.offer_price),
      billing_type: formData.billing_type,
      grade_id: formData.grade_id || null,
      pricing_mode: formData.grade_id ? 'GRADE_RATE' : 'FIXED_PRICE',
    };

    if (isDesktopRuntime()) {
      const res = view === 'edit'
        ? await updateProduct(payload)
        : await createProduct(payload);

      if (res.success) {
        // If GST Purchase details provided, create a purchase bill entry
        if (view === 'add' && formData.show_gst_purchase && formData.gst_purchase_price !== '' && Number(formData.gst_purchase_price) > 0) {
          const purchaseBillId = uuidv4();
          const itemId = uuidv4();
          const gstQty = Number(formData.gst_purchase_quantity) || 0;
          const gstPrice = Number(formData.gst_purchase_price) || 0;
          const gstTotal = gstQty * gstPrice;
          const supplierName = formData.gst_supplier_name || (suppliers.find(s => s.party_id === formData.gst_supplier_id)?.name) || 'Unknown Supplier';

          await purchasesApi.addPurchaseBill({
            purchase_bill_id: purchaseBillId,
            tenant_id: tenantId,
            bill_number: formData.gst_bill_number || `TEMP-${Date.now()}`,
            supplier_id: formData.gst_supplier_id || null,
            supplier_name: supplierName,
            bill_date: formData.gst_bill_date || new Date().toLocaleDateString('en-CA'),
            invoice_number: null,
            notes: `Auto-created from product: ${formData.name}`,
            total_amount: gstTotal,
            bill_type: 'GST',
            items: [{
              item_id: itemId,
              product_id: payload.product_id,
              name: formData.name,
              quantity: gstQty,
              purchase_price: gstPrice,
              total_amount: gstTotal,
              is_gst_applicable: payload.is_gst_applicable,
              tax_rate_percent: payload.tax_rate_percent,
              hsn_sac_code: payload.hsn_sac_code,
              skip_stock_update: 1, // Paper purchase bills must have skip_stock_update = 1 so real stock is not modified
            }],
          });
        }

        if (view === 'edit') {
          // Optimistic update for edit
          setProducts(prev => prev.map(p => p.product_id === payload.product_id ? { ...p, ...payload, current_stock: userEnteredStock, paper_stock: userEnteredPaperStock } as Product : p));
        } else {
          // Optimistic update for add
          setProducts(prev => [{ ...payload, current_stock: userEnteredStock, paper_stock: userEnteredPaperStock } as Product, ...prev]);
          setTotalCount(prev => prev !== null ? prev + 1 : null);
        }

        // Persist per-tier prices (blank = use MRP / clear stored price)
        const tierRows = Object.entries(tierPrices).map(([pricing_tier_id, price]) => ({
          pricing_tier_id,
          price: price === '' ? null : Number(price),
        }));
        if (tierRows.length > 0) {
          await setProductPricing({
            tenant_id: tenantId || 'unset',
            product_id: payload.product_id,
            pricing: tierRows,
          });
        }

        // Auto-register custom categories in the Categories & Grades page so they can be managed there
        if (normalizedCategory && !existingCategories.some(c => c.toLowerCase() === normalizedCategory.toLowerCase())) {
          const cat = normalizedCategory;
          const existing = await listGrades(tenantId || 'global');
          if (Array.isArray(existing) && !existing.some(g => (g.category || '').trim().toLowerCase() === cat.toLowerCase() && !String(g.grade_name || '').trim())) {
            const gradeRes = await createGrade({
              grade_id: uuidv4(),
              tenant_id: tenantId || '',
              category: cat,
              grade_name: '',
              rate: Number(formData.base_price) || 0,
              purchase_price: Number(formData.purchase_price) || 0,
              offer_price: formData.offer_price === '' || formData.offer_price === null || formData.offer_price === undefined ? null : Number(formData.offer_price),
            });
            if (gradeRes.success) {
              const fresh = await listGrades(tenantId || 'global');
              if (Array.isArray(fresh)) setGrades(fresh);
            }
          }
        }

        setView('list');
        loadProducts(true);
      } else if (!formData.sku_barcode && res.error?.includes('sku_barcode') && retries > 0) {
        setLoading(false);
        setFormData(prev => ({ ...prev, sku_barcode: '' }));
        setTimeout(() => handleSave(retries - 1), 100);
      } else {
        let errorMessage = res.error || 'Unknown error occurred';
        if (errorMessage.includes('UNIQUE constraint failed')) {
          if (errorMessage.includes('sku_barcode')) {
            errorMessage = 'A product with this barcode already exists.';
          } else {
            errorMessage = 'A product with this exact Name and Brand already exists.';
          }
        }
        setStatusMessage({ text: 'Failed to save: ' + errorMessage, type: 'error' });
        setTimeout(() => setStatusMessage(null), 3000);
      }
    }
    setLoading(false);
  };

  return { handleSave };
}
