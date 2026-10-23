import type React from 'react';
import { hasBridge, isDesktopRuntime } from '../../../data/client';
import { customersApi } from '../../../data/customers';
import { type InvoiceRecord, type InvoiceItemRow } from '../customerTypes';
import { invoicesApi } from '../../../data/invoices';
import { useAuthStore } from '../../../store/authStore';
import { hasPermission, isAdminRole } from '../../../utils/permissions';
import { useCartStore } from '../../../store/cartStore';
import type { Customer, Party, LoyaltyTx, View } from '../customerTypes';

export interface UseCustomerActionsContext {
  customerToDelete: Customer | null;
  invoiceItems: InvoiceItemRow[];
  loadCustomers: (isInitialLoad?: boolean) => Promise<void>;
  matchedParty: Party | null;
  onClose: () => void;
  onOpenParty: ((partyIdOrQuery?: string, customerIdOrQuery?: string) => void) | undefined;
  selectedCustomer: Customer | null;
  setCleaningDuplicates: React.Dispatch<React.SetStateAction<boolean>>;
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  setCustomerToDelete: React.Dispatch<React.SetStateAction<Customer | null>>;
  setDeleteModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDeleteSaving: React.Dispatch<React.SetStateAction<boolean>>;
  setInvoiceItems: React.Dispatch<React.SetStateAction<InvoiceItemRow[]>>;
  setItemsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLoyaltyTxs: React.Dispatch<React.SetStateAction<LoyaltyTx[]>>;
  setMatchedPartyToDelete: React.Dispatch<React.SetStateAction<Party | null>>;
  setRecalculatingPoints: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedCustomer: React.Dispatch<React.SetStateAction<Customer | null>>;
  setView: React.Dispatch<React.SetStateAction<View>>;
  setViewingInvoice: React.Dispatch<React.SetStateAction<InvoiceRecord | null>>;
  showStatus: (text: string, type: "success" | "error") => void;
  tenantId: string | null;
  viewingInvoice: InvoiceRecord | null;
}

/**
 * Customer actions of the customers screen: delete, clean duplicates, recalculate points, open an invoice, edit a bill
 * and go to the linked party. (No React state of its own.)
 */
export function useCustomerActions(ctx: UseCustomerActionsContext) {
  const { customerToDelete, invoiceItems, loadCustomers, matchedParty, onClose, onOpenParty, selectedCustomer, setCleaningDuplicates, setCustomers, setCustomerToDelete, setDeleteModalOpen, setDeleteSaving, setInvoiceItems, setItemsLoading, setLoyaltyTxs, setMatchedPartyToDelete, setRecalculatingPoints, setSelectedCustomer, setView, setViewingInvoice, showStatus, tenantId, viewingInvoice } = ctx;
  const handleConfirmDeleteCustomer = async () => {
    if (!customerToDelete || !tenantId || !hasBridge('dbDeleteCustomer')) return;
    setDeleteSaving(true);
    try {
      const res = await customersApi.deleteCustomer({
        customer_id: customerToDelete.customer_id,
        tenant_id: tenantId,
      });
      if (res?.success) {
        showStatus('Customer and associated party ledger deleted successfully', 'success');
        setDeleteModalOpen(false);
        setCustomerToDelete(null);
        setMatchedPartyToDelete(null);
        if (selectedCustomer?.customer_id === customerToDelete.customer_id) {
          setSelectedCustomer(null);
          setView('list');
        }
        await loadCustomers();
      } else {
        showStatus(res?.error || 'Failed to delete customer', 'error');
      }
    } catch {
      showStatus('Failed to delete customer', 'error');
    } finally {
      setDeleteSaving(false);
    }
  };

  const handleCleanDuplicates = async () => {
    if (!tenantId || !hasBridge('dbDeduplicateCustomers')) return;
    try {
      setCleaningDuplicates(true);
      const res = await customersApi.deduplicateCustomers(tenantId);
      if (res.success) {
        showStatus(`Merged ${res.merged_customers || 0} duplicate customer(s) & ${res.merged_parties || 0} duplicate ledger record(s)`, 'success');
        await loadCustomers(false);
      } else {
        showStatus(res.error || 'Failed to merge duplicates', 'error');
      }
    } catch {
      showStatus('Failed to merge duplicates', 'error');
    } finally {
      setCleaningDuplicates(false);
    }
  };

  const handleRecalculateCustomerPoints = async () => {
    if (!selectedCustomer || !isDesktopRuntime()) return;
    setRecalculatingPoints(true);
    try {
      const res = await customersApi.recalculateCustomerLoyaltyPoints({
        tenant_id: tenantId || 'global',
      });
      if (res.success) {
        showStatus(`Points recalculated successfully! (${res.updatedCount || 0} customers updated)`, 'success');
        const [updatedCustList, updatedTxs] = await Promise.all([
          customersApi.getCustomers({ tenant_id: tenantId as string }),
          customersApi.getCustomerLoyaltyTransactions({ customer_id: selectedCustomer.customer_id, tenant_id: tenantId as string }),
        ]);
        if (Array.isArray(updatedCustList)) {
          setCustomers(updatedCustList);
          const found = updatedCustList.find(c => c.customer_id === selectedCustomer.customer_id);
          if (found) setSelectedCustomer(found);
        }
        if (Array.isArray(updatedTxs)) setLoyaltyTxs(updatedTxs);
      } else {
        showStatus(res.error || 'Failed to recalculate points', 'error');
      }
    } catch (e: any) {
      showStatus(e?.message || 'Error recalculating points', 'error');
    } finally {
      setRecalculatingPoints(false);
    }
  };

  const handleOpenInvoiceDetail = async (inv: InvoiceRecord) => {
    setViewingInvoice(inv);
    setItemsLoading(true);
    try {
      if (hasBridge('dbGetInvoiceItems')) {
        const items = await invoicesApi.getInvoiceItems(inv.invoice_id);
        setInvoiceItems(Array.isArray(items) ? items : []);
      } else {
        setInvoiceItems([]);
      }
    } catch {
      showStatus('Failed to load invoice items', 'error');
    } finally {
      setItemsLoading(false);
    }
  };

  const handleEditBillFromCustomerModal = async () => {
    if (!viewingInvoice) return;
    const { role, permissions } = useAuthStore.getState();
    if (!hasPermission({ role, permissions }, 'sales.edit')) {
      showStatus('Permission Denied: You do not have permission to edit bills', 'error');
      return;
    }
    try {
      let itemsToEdit = invoiceItems;
      if (!itemsToEdit || itemsToEdit.length === 0) {
        if (hasBridge('dbGetInvoiceItems')) {
          const data = await invoicesApi.getInvoiceItems(viewingInvoice.invoice_id);
          itemsToEdit = Array.isArray(data) ? data : [];
        }
      }
      localStorage.setItem('editBillData', JSON.stringify({
        invoice: viewingInvoice,
        items: itemsToEdit,
        originalRole: useAuthStore.getState().role || 'OWNER',
      }));
      setViewingInvoice(null);
      onClose?.();
      if (isAdminRole(useAuthStore.getState().role)) {
        useCartStore.getState().setRole('BILLER');
      }
      setTimeout(() => window.dispatchEvent(new CustomEvent('open-edit-bill')), 50);
    } catch (e) {
      console.error('Error starting bill edit from customer modal:', e);
      showStatus('Failed to open bill editor', 'error');
    }
  };

  const handleNavigateToParty = () => {
    if (!selectedCustomer) return;
    const target = matchedParty?.party_id || selectedCustomer.phone || selectedCustomer.name;
    if (onOpenParty) {
      onOpenParty(target, selectedCustomer.customer_id);
    } else {
      showStatus(`Party ledger for "${selectedCustomer.name}" is accessible via the Ledger menu.`, 'success');
    }
  };

  return { handleConfirmDeleteCustomer, handleCleanDuplicates, handleRecalculateCustomerPoints, handleOpenInvoiceDetail, handleEditBillFromCustomerModal, handleNavigateToParty };
}
