import type React from 'react';
import { scrapApi } from '../../../data/scrap';
import { v4 as uuidv4 } from 'uuid';
import { isDesktopRuntime } from '../../../data/client';
import type { View, ScrapCategory } from '../scrapTypes';

export interface UseScrapStockActionsContext {
  editingCategory: ScrapCategory | null;
  formData: { name: string; purchase_price: string; selling_price: string; current_stock: string; unit: string; };
  isOwner: true;
  loadData: () => Promise<void>;
  loadTransactions: (categoryId?: string) => Promise<void>;
  resetCategoryForm: () => void;
  selectedCategory: ScrapCategory | null;
  sellingSelected: { category: ScrapCategory; qty: number; rate: number; }[];
  setIsSavingCategory: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSavingTx: React.Dispatch<React.SetStateAction<boolean>>;
  setSellingProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  setSellingSelected: React.Dispatch<React.SetStateAction<{ category: ScrapCategory; qty: number; rate: number; }[]>>;
  setView: React.Dispatch<React.SetStateAction<View>>;
  showStatus: (text: string, type: "success" | "error") => void;
  tenantId: string | null;
  txForm: { type: "PURCHASE" | "SALE"; categoryId: string; quantity: string; rate: string; party_name: string; notes: string; };
}

/**
 * Scrap stock actions: save a category (add / update), record a scrap transaction and record a sale of scrap stock.
 */
export function useScrapStockActions(ctx: UseScrapStockActionsContext) {
  const { editingCategory, formData, isOwner, loadData, loadTransactions, resetCategoryForm, selectedCategory, sellingSelected, setIsSavingCategory, setIsSavingTx, setSellingProcessing, setSellingSelected, setView, showStatus, tenantId, txForm } = ctx;
  const handleSaveCategory = async () => {
    if (!formData.name.trim()) { showStatus('Category name is required', 'error'); return; }
    if (!isOwner) { showStatus('Only owners/admins can manage categories', 'error'); return; }
    setIsSavingCategory(true);
    try {
      if (editingCategory) {
        const res = await scrapApi.updateScrapCategory({
          scrap_category_id: editingCategory.scrap_category_id,
          name: formData.name.trim(),
          purchase_price: Number(formData.purchase_price) || 0,
          selling_price: Number(formData.selling_price) || 0,
          current_stock: Number(formData.current_stock) || 0,
          unit: formData.unit || 'Kgs',
        });
        if (res.success) {
          showStatus('Category updated successfully', 'success');
        } else {
          showStatus(res.error || 'Update failed', 'error');
          return;
        }
      } else {
        const res = await scrapApi.addScrapCategory({
          scrap_category_id: uuidv4(),
          tenant_id: tenantId,
          name: formData.name.trim(),
          purchase_price: Number(formData.purchase_price) || 0,
          selling_price: Number(formData.selling_price) || 0,
          current_stock: Number(formData.current_stock) || 0,
          unit: formData.unit || 'Kgs',
        });
        if (res.success) {
          showStatus('Category created successfully', 'success');
        } else {
          showStatus(res.error || 'Create failed', 'error');
          return;
        }
      }
      await loadData();
      setView('list');
      resetCategoryForm();
    } catch {
      showStatus('Operation failed', 'error');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory) return;
    if (!txForm.quantity || !txForm.rate) { showStatus('Quantity and Rate required', 'error'); return; }
    if (!isOwner) { showStatus('Only owners/admins can manage transactions', 'error'); return; }

    const qty = Number(txForm.quantity);
    const rate = Number(txForm.rate);
    if (txForm.type === 'SALE' && qty > Number(selectedCategory.current_stock)) {
      showStatus('Insufficient stock', 'error'); return;
    }

    setIsSavingTx(true);
    try {
      const res = await scrapApi.addScrapTransaction({
        transaction_id: uuidv4(),
        tenant_id: tenantId,
        type: txForm.type,
        scrap_category_id: txForm.categoryId,
        quantity: qty,
        rate,
        total_amount: qty * rate,
        party_name: txForm.party_name || '',
        notes: txForm.notes || '',
      });
      if (res.success) {
        showStatus(`${txForm.type === 'PURCHASE' ? 'Purchase' : 'Sale'} recorded`, 'success');
        await loadTransactions(txForm.categoryId);
        await loadData();
        setView('transaction');
      } else {
        showStatus(res.error || 'Failed', 'error');
      }
    } catch {
      showStatus('Operation failed', 'error');
    } finally {
      setIsSavingTx(false);
    }
  };

  const handleRecordSales = async () => {
    if (sellingSelected.length === 0) return;
    setSellingProcessing(true);
    let successCount = 0;
    for (const entry of sellingSelected) {
      if (entry.qty <= 0 || entry.rate <= 0) continue;
      if (isDesktopRuntime()) {
        const cats = await scrapApi.getScrapCategories(tenantId || '');
        const cat = cats.find((c: ScrapCategory) => c.scrap_category_id === entry.category.scrap_category_id);
        const currentStock = cat ? Number(cat.current_stock) : 0;
        if (entry.qty > currentStock) {
          showStatus(`Insufficient stock for ${entry.category.name}`, 'error');
          continue;
        }
        const res = await scrapApi.addScrapTransaction({
          transaction_id: uuidv4(),
          tenant_id: tenantId,
          type: 'SALE',
          scrap_category_id: entry.category.scrap_category_id,
          quantity: entry.qty,
          rate: entry.rate,
          total_amount: entry.qty * entry.rate,
          party_name: '',
          notes: 'Direct scrap sale',
        });
        if (res.success) {
          successCount++;
        }
      }
    }
    if (successCount > 0) {
      showStatus(`${successCount} item(s) sold successfully!`, 'success');
      setSellingSelected([]);
      await loadData();
    }
    setSellingProcessing(false);
  };

  return { handleSaveCategory, handleSaveTransaction, handleRecordSales };
}
