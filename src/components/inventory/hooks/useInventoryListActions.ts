import type React from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { deleteProduct, bulkDeleteProducts } from '../../../data/products';
import type { Product } from '../inventoryHelpers';
import type { InventoryState } from './useInventoryState';

export interface UseInventoryListActionsContext {
  adjustCurrentPcs: number;
  applyStockAdjust: (product: Product, delta: number, pcsDelta?: number) => Promise<boolean>;
  encodePurchasePriceCode: (price: any) => string;
  handleInputChange: (field: string, value: any) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  inv: InventoryState;
}

/**
 * List actions: delete one / several products, adjust stock, and generate a barcode for the form.
 */
export function useInventoryListActions(ctx: UseInventoryListActionsContext) {
  const { adjustCurrentPcs, applyStockAdjust, encodePurchasePriceCode, handleInputChange, searchInputRef } = ctx;
  const { adjustAmount, adjustModal, adjustPcs, deleteConfirmProduct, formData, priceCoding, selectedProductIds, setAdjustModal, setDeleteConfirmProduct, setIsBulkDeleting, setIsDeleting, setProducts, setSelectedProductIds, setShowBulkDeleteConfirm, setStatusMessage, setTotalCount } = ctx.inv;
  const handleConfirmDelete = async () => {
    if (!deleteConfirmProduct) return;
    setIsDeleting(true);
    try {
      if (isDesktopRuntime()) {
        const res = await deleteProduct(deleteConfirmProduct.product_id);
        if (res.success) {
          setProducts(prev => prev.filter(p => p.product_id !== deleteConfirmProduct.product_id));
          setTotalCount(prev => prev !== null ? Math.max(0, prev - 1) : null);
          setStatusMessage({ text: `Product "${deleteConfirmProduct.name}" deleted successfully`, type: 'success' });
        } else {
          setStatusMessage({ text: 'Delete failed: ' + res.error, type: 'error' });
        }
      }
    } catch (err) {
      console.error('Delete product error:', err);
      setStatusMessage({ text: 'Failed to delete product', type: 'error' });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmProduct(null);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  };

  const handleConfirmBulkDelete = async () => {
    const ids = Array.from(selectedProductIds);
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    try {
      if (isDesktopRuntime()) {
        const res = await bulkDeleteProducts(ids);
        if (res.success) {
          const deleteSet = new Set(ids);
          setProducts(prev => prev.filter(p => !deleteSet.has(p.product_id)));
          setTotalCount(prev => prev !== null ? Math.max(0, prev - ids.length) : null);
          setSelectedProductIds(new Set());
          setStatusMessage({ text: `Successfully deleted ${ids.length} product(s)`, type: 'success' });
        } else {
          setStatusMessage({ text: 'Bulk delete failed: ' + res.error, type: 'error' });
        }
      }
    } catch (err) {
      console.error('Bulk delete product error:', err);
      setStatusMessage({ text: 'Failed to delete selected products', type: 'error' });
    } finally {
      setIsBulkDeleting(false);
      setShowBulkDeleteConfirm(false);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  };

  const confirmAdjustStock = async () => {
    const modal = adjustModal;
    if (!modal) return;
    const kgAmt = parseFloat(adjustAmount);
    const pcsAmt = parseFloat(adjustPcs);
    const hasKg = !isNaN(kgAmt) && kgAmt > 0;
    const hasPcs = !isNaN(pcsAmt) && pcsAmt > 0;
    if (!hasKg && !hasPcs) {
      setStatusMessage({ text: 'Enter a valid amount in weight or pcs', type: 'error' });
      return;
    }
    if (hasKg && modal.mode === 'reduce' && kgAmt > Number(modal.product.current_stock)) {
      setStatusMessage({ text: 'Cannot reduce more than the current stock', type: 'error' });
      return;
    }
    if (hasPcs && modal.mode === 'reduce' && pcsAmt > adjustCurrentPcs) {
      setStatusMessage({ text: 'Cannot reduce more than the current pcs', type: 'error' });
      return;
    }
    const sign = modal.mode === 'add' ? 1 : -1;
    const ok = await applyStockAdjust(modal.product, hasKg ? sign * kgAmt : 0, hasPcs ? sign * pcsAmt : undefined);
    if (ok) {
      setAdjustModal(null);
      const parts: string[] = [];
      if (hasKg) parts.push(`${kgAmt} ${modal.product.uom}`);
      if (hasPcs) parts.push(`${pcsAmt} Pcs`);
      setStatusMessage({ text: `${modal.mode === 'add' ? 'Added' : 'Reduced'} ${parts.join(' + ')} — ${modal.product.name}`, type: 'success' });
    }
  };

  const generateBarcode = () => {
    let prefix = formData.item_code || '';
    let priceCode = '';
    
    if (priceCoding && formData.purchase_price) {
      priceCode = encodePurchasePriceCode(formData.purchase_price);
    }

    if (prefix.length + priceCode.length > 10) {
      prefix = prefix.substring(0, Math.max(0, 10 - priceCode.length));
    }
    
    const remainingLength = 10 - prefix.length - priceCode.length;
    let randomPart = '';
    if (remainingLength > 0) {
      const min = Math.pow(10, remainingLength - 1);
      const max = Math.pow(10, remainingLength) - 1;
      randomPart = Math.floor(min + Math.random() * (max - min + 1)).toString();
    }
    
    handleInputChange('sku_barcode', prefix + randomPart + priceCode);
  };

  return { handleConfirmDelete, handleConfirmBulkDelete, confirmAdjustStock, generateBarcode };
}
