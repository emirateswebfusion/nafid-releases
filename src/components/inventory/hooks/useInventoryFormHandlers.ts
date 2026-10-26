import { type Product } from '../inventoryHelpers';
import { isDesktopRuntime } from '../../../data/client';
import { adjustStock } from '../../../data/products';
import { v4 as uuidv4 } from 'uuid';
import { partiesApi } from '../../../data/parties';
import { useAuthStore } from '../../../store/authStore';
import { createGrade, listGrades } from '../../../data/grades';
import type { InventoryState } from './useInventoryState';

export interface UseInventoryFormHandlersContext {
  encodePurchasePriceCode: (price: unknown) => string;
  getEffectiveMrp: (data?: unknown) => number;
  stripPurchasePriceCode: (barcode: string, price: unknown) => string;
  tenantId: string | null;
  inv: InventoryState;
}

/**
 * Product form handlers: field changes (with price coding / MRP rules), stock adjustment, and creating a supplier or a grade
 * from the form.
 */
export function useInventoryFormHandlers(ctx: UseInventoryFormHandlersContext) {
  const { encodePurchasePriceCode, getEffectiveMrp, stripPurchasePriceCode, tenantId } = ctx;
  const { formData, grades, newGradeForm, newSupplierAddress, newSupplierName, newSupplierPhone, priceCoding, setAdjustingStockId, setFormData, setGrades, setIsAddingGrade, setNewGradeForm, setNewSupplierAddress, setNewSupplierName, setNewSupplierPhone, setPrintQuantity, setProducts, setSavingGrade, setShowSupplierCreate, setStatusMessage, setSuppliers, view } = ctx.inv;
  const applyStockAdjust = async (product: Product, delta: number, pcsDelta?: number): Promise<boolean> => {
    if (!isDesktopRuntime()) return false;
    setAdjustingStockId(product.product_id);
    try {
      const res = await adjustStock({ product_id: product.product_id, delta, pcsDelta });
      if (res.success) {
        setProducts(prev => prev.map(p => {
          if (p.product_id !== product.product_id) return p;
          const next = { ...p, current_stock: Number(p.current_stock) + delta };
          if (pcsDelta !== undefined) {
            try {
              const da = JSON.parse(p.domain_attributes || '{}');
              const cur = Number(da.pcs_stock ?? da.pcs ?? 0) || 0;
              const nextPcs = Math.max(0, cur + pcsDelta);
              da.pcs_stock = nextPcs;
              da.pcs = nextPcs;
              next.domain_attributes = JSON.stringify(da);
            } catch { /* keep as is */ }
          }
          return next;
        }));
        return true;
      }
      setStatusMessage({ text: 'Failed to adjust stock: ' + res.error, type: 'error' });
      return false;
    } catch (err) {
      console.error('Adjust stock error:', err);
      setStatusMessage({ text: 'Failed to adjust stock. Please try again.', type: 'error' });
      return false;
    } finally {
      setAdjustingStockId(null);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      if (field === 'is_gst_applicable' && !value && String(prev.hsn_sac_code || '').trim()) {
        return prev;
      }
      const next = { ...prev, [field]: value };
      
      if (field === 'purchase_price' && priceCoding) {
        const newCode = encodePurchasePriceCode(value);

        let currentBarcode = prev.sku_barcode || '';
        
        currentBarcode = stripPurchasePriceCode(currentBarcode, prev.purchase_price);
        
        if (newCode) {
           currentBarcode = currentBarcode + newCode;
        }
        
        next.sku_barcode = currentBarcode;
      }

      if (field === 'grade_id') {
        next.pricing_mode = value ? 'GRADE_RATE' : 'FIXED_PRICE';
        if (value) {
          const selectedGrade = grades.find(g => g.grade_id === value);
          if (selectedGrade) {
            next.base_price = Number(selectedGrade.rate);
            next.purchase_price = Number(selectedGrade.purchase_price || 0);
          }
        }
      }

      if (field === 'uom') {
        const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs'];
        next.billing_type = weightUoms.includes(value) ? 'WEIGHT' : 'PIECE';
        setPrintQuantity(1);
      }

      if (field === 'current_stock' && view === 'add' && !['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(prev.uom)) {
        setPrintQuantity(value === '' ? '' : value);
      }

      if (field === 'gst_same_as_current' && value) {
        next.gst_purchase_price = next.purchase_price;
        next.gst_purchase_quantity = next.current_stock;
      }

      if ((field === 'base_price' || field === 'grade_id') && next.discount_percent !== undefined && next.discount_percent !== '') {
        const pct = parseFloat(next.discount_percent as string);
        if (!isNaN(pct)) {
          const base = getEffectiveMrp(next);
          next.discount_flat = base ? ((base * pct) / 100).toFixed(2) : '';
        }
      }
      return next;
    });
  };

  const handleCreateSupplier = async () => {
    if (!newSupplierName.trim()) return;
    if (isDesktopRuntime()) {
      const partyId = uuidv4();
      const res = await partiesApi.addParty({
        party_id: partyId,
        tenant_id: tenantId,
        name: newSupplierName.trim(),
        phone: newSupplierPhone.trim() || null,
        address: newSupplierAddress.trim() || null,
        balance: 0,
        balance_type: 'PAYABLE',
        notes: 'Purchase Supplier',
        created_by: useAuthStore.getState().userId,
        created_by_name: useAuthStore.getState().userName,
      });
      if (res.success) {
        const newParty = { party_id: partyId, tenant_id: tenantId, name: newSupplierName.trim(), phone: newSupplierPhone.trim() || null, address: newSupplierAddress.trim() || null, balance: 0, balance_type: 'PAYABLE' };
        setSuppliers(prev => [...prev, newParty]);
        setFormData(prev => ({ ...prev, gst_supplier_id: partyId, gst_supplier_name: newSupplierName.trim() }));
        setShowSupplierCreate(false);
        setNewSupplierName('');
        setNewSupplierPhone('');
        setNewSupplierAddress('');
      } else {
        setStatusMessage({ text: 'Failed to create supplier: ' + (res.error || ''), type: 'error' });
        setTimeout(() => setStatusMessage(null), 3000);
      }
    }
  };

  const handleCreateGrade = async () => {
    if (!formData.category.trim() || !newGradeForm.grade_name.trim()) return;
    setSavingGrade(true);
    const { tenantId } = useAuthStore.getState();
    const gradeId = uuidv4();
    const res = await createGrade({
      grade_id: gradeId,
      tenant_id: tenantId || '',
      category: formData.category.trim(),
      grade_name: newGradeForm.grade_name.trim(),
      rate: Number(newGradeForm.rate) || 0,
      purchase_price: Number(newGradeForm.purchase_price) || 0,
      offer_price: newGradeForm.offer_price === '' ? null : Number(newGradeForm.offer_price),
    });
    if (res.success) {
      const fresh = await listGrades(tenantId || 'global');
      if (Array.isArray(fresh)) setGrades(fresh);
      handleInputChange('grade_id', gradeId);
      handleInputChange('base_price', Number(newGradeForm.rate) || 0);
      handleInputChange('purchase_price', Number(newGradeForm.purchase_price) || 0);
      handleInputChange('offer_price', newGradeForm.offer_price === '' ? '' : Number(newGradeForm.offer_price));
      setIsAddingGrade(false);
      setNewGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
      setStatusMessage({ text: `Grade "${newGradeForm.grade_name.trim()}" created and applied.`, type: 'success' });
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ text: 'Failed to create grade: ' + (res.error || 'Operation failed'), type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
    }
    setSavingGrade(false);
  };

  return { applyStockAdjust, handleInputChange, handleCreateSupplier, handleCreateGrade };
}
