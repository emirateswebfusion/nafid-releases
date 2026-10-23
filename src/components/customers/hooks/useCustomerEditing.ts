import type React from 'react';
import { hasBridge, isDesktopRuntime } from '../../../data/client';
import { customersApi } from '../../../data/customers';
import { useAuthStore } from '../../../store/authStore';
import type { PricingTier, Customer, LoyaltyTx } from '../customerTypes';

export interface UseCustomerEditingContext {
  addForm: { name: string; phone: string; address: string; pricing_tier_id: string; credit_limit: string; credit_period_enabled: boolean; credit_period_days: string; credit_period_basis: string; restrict_on_credit_expiry: boolean; };
  adjustPointsReason: string;
  adjustPointsType: "ADD" | "DEDUCT";
  adjustPointsValue: number | "";
  editForm: { name: string; phone: string; address: string; pricing_tier_id: string; credit_limit: string; credit_period_enabled: boolean; credit_period_days: string; credit_period_basis: string; restrict_on_credit_expiry: boolean; };
  editingCustomer: Customer | null;
  loadCustomers: (isInitialLoad?: boolean) => Promise<void>;
  pricingTiers: PricingTier[];
  selectedCustomer: Customer | null;
  setAddModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setAdjustPointsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setAdjustPointsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setAdjustPointsReason: React.Dispatch<React.SetStateAction<string>>;
  setAdjustPointsValue: React.Dispatch<React.SetStateAction<number | "">>;
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  setEditingCustomer: React.Dispatch<React.SetStateAction<Customer | null>>;
  setEditModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSavingAdd: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSavingEdit: React.Dispatch<React.SetStateAction<boolean>>;
  setLoyaltyTxs: React.Dispatch<React.SetStateAction<LoyaltyTx[]>>;
  setSelectedCustomer: React.Dispatch<React.SetStateAction<Customer | null>>;
  showStatus: (text: string, type: "success" | "error") => void;
  tenantId: string | null;
}

/**
 * Customer edits from the customers screen: add a customer, save an edited customer and adjust loyalty points.
 * (No React state of its own; the screen passes its state in.)
 */
export function useCustomerEditing(ctx: UseCustomerEditingContext) {
  const { addForm, adjustPointsReason, adjustPointsType, adjustPointsValue, editForm, editingCustomer, loadCustomers, pricingTiers, selectedCustomer, setAddModalOpen, setAdjustPointsLoading, setAdjustPointsModalOpen, setAdjustPointsReason, setAdjustPointsValue, setCustomers, setEditingCustomer, setEditModalOpen, setIsSavingAdd, setIsSavingEdit, setLoyaltyTxs, setSelectedCustomer, showStatus, tenantId } = ctx;
  const handleConfirmAddCustomer = async () => {
    if (!tenantId || !hasBridge('dbCreateCustomer')) return;
    if (!addForm.name.trim()) {
      showStatus('Customer name is required', 'error');
      return;
    }
    setIsSavingAdd(true);
    try {
      const parsedCreditLimit = Math.max(0, parseFloat(addForm.credit_limit) || 0);
      const parsedCreditPeriodDays = Math.max(1, parseInt(addForm.credit_period_days, 10) || 30);
      const res = await customersApi.createCustomer({
        tenant_id: tenantId,
        name: addForm.name.trim(),
        phone: addForm.phone.trim() || null,
        address: addForm.address.trim() || null,
        pricing_tier_id: addForm.pricing_tier_id || null,
        credit_limit: parsedCreditLimit,
        credit_period_enabled: addForm.credit_period_enabled,
        credit_period_days: parsedCreditPeriodDays,
        credit_period_basis: addForm.credit_period_basis,
        restrict_on_credit_expiry: addForm.restrict_on_credit_expiry,
      });
      if (res?.success) {
        showStatus('Customer created successfully', 'success');
        setAddModalOpen(false);
        await loadCustomers();
      } else {
        showStatus(res?.error || 'Failed to create customer', 'error');
      }
    } catch {
      showStatus('Failed to create customer', 'error');
    } finally {
      setIsSavingAdd(false);
    }
  };

  const handleConfirmEditCustomer = async () => {
    if (!editingCustomer || !tenantId || !hasBridge('dbUpdateCustomer')) return;
    if (!editForm.name.trim()) {
      showStatus('Customer name is required', 'error');
      return;
    }
    setIsSavingEdit(true);
    try {
      const parsedCreditLimit = Math.max(0, parseFloat(editForm.credit_limit) || 0);
      const parsedCreditPeriodDays = Math.max(1, parseInt(editForm.credit_period_days, 10) || 30);
      const res = await customersApi.updateCustomer({
        customer_id: editingCustomer.customer_id,
        tenant_id: tenantId,
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || null,
        address: editForm.address.trim() || null,
        pricing_tier_id: editForm.pricing_tier_id || null,
        credit_limit: parsedCreditLimit,
        credit_period_enabled: editForm.credit_period_enabled,
        credit_period_days: parsedCreditPeriodDays,
        credit_period_basis: editForm.credit_period_basis,
        restrict_on_credit_expiry: editForm.restrict_on_credit_expiry,
      });
      if (res?.success) {
        showStatus('Customer updated successfully', 'success');
        setEditModalOpen(false);
        setEditingCustomer(null);
        if (selectedCustomer?.customer_id === editingCustomer.customer_id) {
          setSelectedCustomer({
            ...selectedCustomer,
            ...editForm,
            credit_limit: parsedCreditLimit,
            credit_period_enabled: editForm.credit_period_enabled,
            credit_period_days: parsedCreditPeriodDays,
            credit_period_basis: editForm.credit_period_basis,
            restrict_on_credit_expiry: editForm.restrict_on_credit_expiry,
            pricing_tier_name: pricingTiers.find(t => t.pricing_tier_id === editForm.pricing_tier_id)?.name
          });
        }
        await loadCustomers();
      } else {
        showStatus(res?.error || 'Failed to update customer', 'error');
      }
    } catch {
      showStatus('Failed to update customer', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleAdjustPointsSubmit = async () => {
    if (!selectedCustomer || !isDesktopRuntime()) return;
    const pts = Number(adjustPointsValue);
    if (!pts || pts <= 0) {
      showStatus('Please enter a valid points amount', 'error');
      return;
    }
    const signedPts = adjustPointsType === 'ADD' ? pts : -pts;
    setAdjustPointsLoading(true);
    try {
      const res = await customersApi.adjustCustomerLoyaltyPoints({
        customer_id: selectedCustomer.customer_id,
        tenant_id: tenantId || 'global',
        points: signedPts,
        reason: adjustPointsReason.trim() || `Manual ${adjustPointsType === 'ADD' ? 'bonus' : 'deduction'} adjustment`,
        user_name: useAuthStore.getState().userName || undefined,
      });
      if (res.success) {
        showStatus('Loyalty points adjusted successfully', 'success');
        setAdjustPointsModalOpen(false);
        setAdjustPointsValue('');
        setAdjustPointsReason('');
        const [updatedCustList, updatedTxs] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same call as before the move; fixed in the next change
          customersApi.getCustomers(tenantId as any),
          customersApi.getCustomerLoyaltyTransactions({ customer_id: selectedCustomer.customer_id, tenant_id: tenantId as string }),
        ]);
        if (Array.isArray(updatedCustList)) {
          setCustomers(updatedCustList);
          const found = updatedCustList.find(c => c.customer_id === selectedCustomer.customer_id);
          if (found) setSelectedCustomer(found);
        }
        if (Array.isArray(updatedTxs)) setLoyaltyTxs(updatedTxs);
      } else {
        showStatus(res.error || 'Failed to adjust points', 'error');
      }
    } catch (e: any) {
      showStatus(e?.message || 'Error adjusting points', 'error');
    } finally {
      setAdjustPointsLoading(false);
    }
  };

  return { handleConfirmAddCustomer, handleConfirmEditCustomer, handleAdjustPointsSubmit };
}
