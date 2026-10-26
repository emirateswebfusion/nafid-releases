import type React from 'react';
import type { RefObject } from 'react';
import { combosApi } from '../../../data/combos';
import { getEffectiveOfferPrice, type ComboOffer, type Product } from '../comboTypes';
import type { ComboManagerState } from './useComboManagerState';

export interface UseComboActionsContext {
  loadCombos: () => Promise<void>;
  productSearchRef: RefObject<HTMLInputElement | null>;
  tenantId: string | null;
  cm: ComboManagerState;
}

/** Combo actions: open add / edit, generate barcode, edit the item list, save, toggle active, delete and copy. */
export function useComboActions(ctx: UseComboActionsContext) {
  const { loadCombos, productSearchRef, tenantId } = ctx;
  const {
    editingCombo, setEditingCombo, setFormData, selectedItems, setSelectedItems, setProductSearch, setProductResults,
    setShowFormModal, formData, setSaving, setStatusMessage, setCombos, setComboToDelete, setDeleteConfirmOpen,
    comboToDelete, setDeleteSaving, setCopiedBarcode,
  } = ctx.cm;

  // Handle open add modal
  const handleOpenAdd = () => {
    setEditingCombo(null);
    setFormData({
      name: '',
      sku_barcode: `CMB-${Math.floor(100000 + Math.random() * 900000)}`,
      combo_price: '',
      description: '',
      is_active: 1,
    });
    setSelectedItems([]);
    setProductSearch('');
    setProductResults([]);
    setShowFormModal(true);
    setTimeout(() => productSearchRef.current?.focus(), 150);
  };

  // Handle open edit modal
  const handleOpenEdit = (combo: ComboOffer) => {
    setEditingCombo(combo);
    setFormData({
      name: combo.name,
      sku_barcode: combo.sku_barcode || '',
      combo_price: String(combo.combo_price),
      description: combo.description || '',
      is_active: combo.is_active as number,
    });
    setSelectedItems(combo.items.map(i => ({ ...i })));
    setProductSearch('');
    setProductResults([]);
    setShowFormModal(true);
  };

  // Auto generate barcode
  const handleGenerateBarcode = () => {
    setFormData(prev => ({
      ...prev,
      sku_barcode: `CMB-${Math.floor(100000 + Math.random() * 900000)}`,
    }));
  };

  // Add product to combo list
  const handleAddProductToCombo = (product: Product) => {
    const existingIndex = selectedItems.findIndex(i => i.product_id === product.product_id);
    const effOffer = getEffectiveOfferPrice(product);
    if (existingIndex > -1) {
      const updated = [...selectedItems];
      updated[existingIndex].quantity += 1;
      setSelectedItems(updated);
    } else {
      setSelectedItems(prev => [
        ...prev,
        {
          product_id: product.product_id,
          quantity: 1,
          product_name: product.name,
          product_price: product.base_price,
          offer_price: effOffer,
          product_stock: product.current_stock,
          sku_barcode: product.sku_barcode,
          uom: product.uom,
        },
      ]);
    }
    setProductSearch('');
    setProductResults([]);
  };

  // Update item quantity in bundle
  const handleUpdateItemQty = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setSelectedItems(prev => prev.filter(i => i.product_id !== productId));
    } else {
      setSelectedItems(prev =>
        prev.map(i => i.product_id === productId ? { ...i, quantity } : i)
      );
    }
  };
  // Handle Save Combo
  const handleSaveCombo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setStatusMessage({ text: 'Please enter a combo name', type: 'error' });
      return;
    }
    const comboPriceNum = parseFloat(formData.combo_price);
    if (isNaN(comboPriceNum) || comboPriceNum <= 0) {
      setStatusMessage({ text: 'Please enter a valid combo price', type: 'error' });
      return;
    }
    if (selectedItems.length === 0) {
      setStatusMessage({ text: 'Please add at least one product to the combo', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        combo_id: editingCombo ? editingCombo.combo_id : undefined,
        tenant_id: tenantId || 'global',
        name: formData.name.trim(),
        sku_barcode: formData.sku_barcode.trim() || null,
        combo_price: comboPriceNum,
        is_active: formData.is_active,
        description: formData.description.trim() || null,
        items: selectedItems.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
        })),
      };

      const res = await combosApi.saveComboOffer(payload);
      if (res.success) {
        setStatusMessage({ text: editingCombo ? 'Combo offer updated successfully!' : 'New combo offer created successfully!', type: 'success' });
        setShowFormModal(false);
        loadCombos();
      } else {
        setStatusMessage({ text: res.error || 'Failed to save combo offer', type: 'error' });
      }
    } catch (err) {
      console.error('[ComboManager] Error saving combo:', err);
      setStatusMessage({ text: (err as Error).message || 'Operation failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Toggle Active/Inactive
  const handleToggleActive = async (combo: ComboOffer) => {
    const nextState = combo.is_active ? 0 : 1;
    try {
      const res = await combosApi.toggleComboOfferActive({ combo_id: combo.combo_id, tenant_id: tenantId || 'global', is_active: Boolean(nextState) });
      if (res.success) {
        setCombos(prev => prev.map(c => c.combo_id === combo.combo_id ? { ...c, is_active: nextState } : c));
        setStatusMessage({ text: `Combo "${combo.name}" ${nextState ? 'activated' : 'deactivated'}`, type: 'success' });
      }
    } catch (err) {
      console.error('[ComboManager] Error toggling active:', err);
    }
  };

  // Delete Combo
  const handleDeleteCombo = (combo: ComboOffer) => {
    setComboToDelete(combo);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteCombo = async () => {
    if (!comboToDelete) return;
    setDeleteSaving(true);
    try {
      const res = await combosApi.deleteComboOffer({ combo_id: comboToDelete.combo_id, tenant_id: tenantId || 'global' });
      if (res.success) {
        setCombos(prev => prev.filter(c => c.combo_id !== comboToDelete.combo_id));
        setStatusMessage({ text: 'Combo offer deleted', type: 'success' });
        setDeleteConfirmOpen(false);
        setComboToDelete(null);
      }
    } catch (err) {
      console.error('[ComboManager] Error deleting combo:', err);
    } finally {
      setDeleteSaving(false);
    }
  };

  // Copy barcode helper
  const copyBarcodeToClipboard = (barcode: string) => {
    navigator.clipboard.writeText(barcode);
    setCopiedBarcode(barcode);
    setTimeout(() => setCopiedBarcode(null), 2000);
  };
  return {
    handleOpenAdd, handleOpenEdit, handleGenerateBarcode, handleAddProductToCombo, handleUpdateItemQty, handleSaveCombo,
    handleToggleActive, handleDeleteCombo, confirmDeleteCombo, copyBarcodeToClipboard,
  };
}
