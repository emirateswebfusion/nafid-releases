import { useCallback } from 'react';
import { hasBridge } from '../../../data/client';
import { invoicesApi } from '../../../data/invoices';
import { partiesApi } from '../../../data/parties';
import { recycleBinApi } from '../../../data/recycleBin';
import { CATEGORIES, type DeletedCustomer, type DeletedInvoice, type DeletedParty, type DeletedProduct, type RecycleBinCategory } from '../recycleBinTypes';
import type { RecycleBinState } from './useRecycleBinState';

export interface UseRecycleBinActionsContext {
  activeCategory: RecycleBinCategory;
  addToast: (message: string, type: 'success' | 'error', actionLabel?: string, onAction?: () => void) => void;
  counts: Record<RecycleBinCategory, number>;
  loadCustomers: () => Promise<void>;
  loadInvoices: () => Promise<void>;
  loadParties: () => Promise<void>;
  loadProducts: () => Promise<void>;
  onNavigateToSalesHistory?: () => void;
  rb: RecycleBinState;
  reloadActive: () => void;
  tid: string;
}

/** Recycle bin actions: inspect a deleted bill, restore or permanently delete a record, and empty a category. */
export function useRecycleBinActions(ctx: UseRecycleBinActionsContext) {
  const {
    activeCategory, addToast, counts, loadCustomers, loadInvoices, loadParties, loadProducts,
    onNavigateToSalesHistory, reloadActive, tid,
  } = ctx;
  const { setConfirm, setInspectingInvoice, setInspectingItems, setLoadingItems } = ctx.rb;

  // ─── Inspect Invoice ───────────────────────────────────────────────────────
  const handleInspectInvoice = useCallback(async (inv: DeletedInvoice) => {
    setInspectingInvoice(inv);
    setLoadingItems(true);
    try {
      if (hasBridge('dbGetInvoiceItems')) {
        const items = await invoicesApi.getInvoiceItems(inv.invoice_id);
        setInspectingItems(Array.isArray(items) ? items : []);
      } else {
        setInspectingItems([]);
      }
    } catch {
      setInspectingItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [setInspectingInvoice, setLoadingItems, setInspectingItems]);

  // ─── Restore Handlers ──────────────────────────────────────────────────────
  const restoreInvoice = useCallback(async (invoice_id: string, invoice_number: string | null) => {
    if (!hasBridge('dbRestoreInvoice')) return;
    const res = await recycleBinApi.restoreInvoice(invoice_id);
    if (res?.success) {
      addToast(
        `Invoice ${invoice_number} restored to Sales History`,
        'success',
        onNavigateToSalesHistory ? 'View in History' : undefined,
        onNavigateToSalesHistory
      );
      loadInvoices();
    } else {
      addToast(res?.error || 'Failed to restore invoice', 'error');
    }
  }, [addToast, loadInvoices, onNavigateToSalesHistory]);

  const restoreProduct = useCallback(async (product_id: string, name: string) => {
    if (!hasBridge('dbRestoreProduct')) return;
    const res = await recycleBinApi.restoreProduct(product_id);
    if (res?.success) {
      addToast(`Product "${name}" restored successfully`, 'success');
      loadProducts();
    } else {
      addToast(res?.error || 'Failed to restore product', 'error');
    }
  }, [addToast, loadProducts]);

  const restoreCustomer = useCallback(async (customer_id: string, name: string) => {
    if (!hasBridge('dbRestoreCustomer')) return;
    const res = await recycleBinApi.restoreCustomer({ customer_id, tenant_id: tid });
    if (res?.success) {
      addToast(`Customer "${name}" restored successfully`, 'success');
      loadCustomers();
    } else {
      addToast(res?.error || 'Failed to restore customer', 'error');
    }
  }, [addToast, loadCustomers, tid]);

  const restoreParty = useCallback(async (party_id: string, name: string) => {
    if (!hasBridge('dbRestoreParty')) return;
    const res = await partiesApi.restoreParty(party_id);
    if (res?.success) {
      addToast(`Supplier "${name}" restored successfully`, 'success');
      loadParties();
    } else {
      addToast(res?.error || 'Failed to restore party', 'error');
    }
  }, [addToast, loadParties]);

  // ─── Permanent Delete Handlers ─────────────────────────────────────────────
  const hardDeleteInvoice = useCallback(async (invoice_id: string, invoice_number: string | null) => {
    if (!hasBridge('dbHardDeleteInvoice')) return;
    const res = await recycleBinApi.hardDeleteInvoice(invoice_id);
    if (res?.success) {
      addToast(`Invoice ${invoice_number} permanently wiped`, 'success');
      loadInvoices();
    } else {
      addToast(res?.error || 'Failed to permanently delete invoice', 'error');
    }
  }, [addToast, loadInvoices]);

  const hardDeleteProduct = useCallback(async (product_id: string, name: string) => {
    if (!hasBridge('dbHardDeleteProduct')) return;
    const res = await recycleBinApi.hardDeleteProduct(product_id);
    if (res?.success) {
      addToast(`"${name}" permanently removed`, 'success');
      loadProducts();
    } else {
      addToast(res?.error || 'Failed to permanently delete product', 'error');
    }
  }, [addToast, loadProducts]);

  const hardDeleteCustomer = useCallback(async (customer_id: string, name: string) => {
    if (!hasBridge('dbHardDeleteCustomer')) return;
    const res = await recycleBinApi.hardDeleteCustomer({ customer_id, tenant_id: tid });
    if (res?.success) {
      addToast(`Customer "${name}" permanently removed`, 'success');
      loadCustomers();
    } else {
      addToast(res?.error || 'Failed to permanently delete customer', 'error');
    }
  }, [addToast, loadCustomers, tid]);

  const hardDeleteParty = useCallback(async (party_id: string, name: string) => {
    if (!hasBridge('dbHardDeleteParty')) return;
    const res = await recycleBinApi.hardDeleteParty(party_id);
    if (res?.success) {
      addToast(`Supplier "${name}" permanently removed`, 'success');
      loadParties();
    } else {
      addToast(res?.error || 'Failed to permanently delete supplier', 'error');
    }
  }, [addToast, loadParties]);

  const askHardDeleteCustomer = useCallback((cust: DeletedCustomer) => {
    setConfirm({
      visible: true,
      title: `Permanently delete "${cust.name}"?`,
      message: 'This action is irreversible. The customer profile will be completely erased from the local database.',
      onConfirm: () => hardDeleteCustomer(cust.customer_id, cust.name),
    });
  }, [hardDeleteCustomer, setConfirm]);

  const askHardDeleteParty = useCallback((party: DeletedParty) => {
    setConfirm({
      visible: true,
      title: `Permanently delete "${party.name}"?`,
      message: 'This action is irreversible. The supplier/party and ledger transactions will be completely erased.',
      onConfirm: () => hardDeleteParty(party.party_id, party.name),
    });
  }, [hardDeleteParty, setConfirm]);

  const askHardDeleteInvoice = useCallback((inv: DeletedInvoice) => {
    setConfirm({
      visible: true,
      title: `Permanently delete ${inv.invoice_number}?`,
      message: 'This action is irreversible. The invoice record and its associated data will be completely erased from the local database.',
      onConfirm: () => hardDeleteInvoice(inv.invoice_id, inv.invoice_number),
    });
  }, [hardDeleteInvoice, setConfirm]);

  const askHardDeleteProduct = useCallback((prod: DeletedProduct) => {
    setConfirm({
      visible: true,
      title: `Permanently delete "${prod.name}"?`,
      message: 'This action is irreversible. The product item and barcode index will be completely removed.',
      onConfirm: () => hardDeleteProduct(prod.product_id, prod.name),
    });
  }, [hardDeleteProduct, setConfirm]);

  const handleEmptyCategory = useCallback(() => {
    const count = counts[activeCategory];
    if (count === 0) return;
    const catLabel = CATEGORIES.find((c) => c.id === activeCategory)?.label || 'items';
    setConfirm({
      visible: true,
      title: `Empty ${catLabel}?`,
      message: `Permanently delete all ${count} records in ${catLabel}? This action is irreversible.`,
      onConfirm: async () => {
        if (!hasBridge('dbEmptyRecycleBin')) return;
        const res = await recycleBinApi.emptyRecycleBin({ category: activeCategory, tenant_id: tid });
        if (res?.success) {
          addToast(`Recycle bin cleared for ${catLabel}`, 'success');
          reloadActive();
        } else {
          addToast(res?.error || 'Failed to empty recycle bin', 'error');
        }
      },
    });
  }, [activeCategory, counts, tid, addToast, reloadActive, setConfirm]);

  return {
    handleInspectInvoice, restoreInvoice, restoreProduct, restoreCustomer, restoreParty,
    askHardDeleteInvoice, askHardDeleteProduct, askHardDeleteCustomer, askHardDeleteParty, handleEmptyCategory,
  };
}
