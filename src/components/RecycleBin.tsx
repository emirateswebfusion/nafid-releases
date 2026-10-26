import { useState, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { isAdminRole, hasPermission } from '../utils/permissions';
import { type RecycleBinCategory, type RecycleBinProps } from './recycle-bin/recycleBinTypes';
import { useRecycleBinState } from './recycle-bin/hooks/useRecycleBinState';
import { useRecycleBinToasts } from './recycle-bin/hooks/useRecycleBinToasts';
import { useRecycleBinData } from './recycle-bin/hooks/useRecycleBinData';
import { useRecycleBinActions } from './recycle-bin/hooks/useRecycleBinActions';
import { AccessRestrictedView } from './recycle-bin/views/AccessRestrictedView';
import { RecycleBinHeader } from './recycle-bin/views/RecycleBinHeader';
import { RecycleBinToolbar } from './recycle-bin/views/RecycleBinToolbar';
import { RecycleBinContent } from './recycle-bin/views/RecycleBinContent';
import { InvoiceInspectionModal } from './recycle-bin/views/InvoiceInspectionModal';
import { ConfirmDialog } from './recycle-bin/views/ConfirmDialog';
import { ToastStack } from './recycle-bin/views/ToastStack';

export function RecycleBin({ onClose, initialCategory, onNavigateToSalesHistory }: RecycleBinProps) {
  const { tenantId, role, permissions } = useAuthStore();
  const isAdmin = isAdminRole(role);
  const canAccess = isAdmin || hasPermission({ role, permissions }, 'sales.view') || hasPermission({ role, permissions }, 'sales.delete');

  const [activeCategory, setActiveCategory] = useState<RecycleBinCategory>(initialCategory || 'SALES_BILLS');
  const rb = useRecycleBinState();
  const {
    invoices, products, customers, parties, loadingInvoices, loadingProducts, loadingCustomers, loadingParties,
    inspectingInvoice, confirm, search, billTypeFilter,
  } = rb;

  const counts: Record<RecycleBinCategory, number> = useMemo(() => ({
    SALES_BILLS: invoices.length,
    PRODUCTS: products.length,
    CUSTOMERS: customers.length,
    PARTIES: parties.length,
  }), [invoices.length, products.length, customers.length, parties.length]);

  const tid = tenantId || 'global';

  // ─── Toasts ────────────────────────────────────────────────────────────────
  const { addToast, dismissToast } = useRecycleBinToasts({ rb });

  // ─── Data Loaders ──────────────────────────────────────────────────────────
  const { loadInvoices, loadProducts, loadCustomers, loadParties, reloadActive } = useRecycleBinData({ activeCategory, rb, tid });

  const {
    handleInspectInvoice, restoreInvoice, restoreProduct, restoreCustomer, restoreParty,
    askHardDeleteInvoice, askHardDeleteProduct, askHardDeleteCustomer, askHardDeleteParty, handleEmptyCategory,
  } = useRecycleBinActions({
    activeCategory, addToast, counts, loadCustomers, loadInvoices, loadParties, loadProducts,
    onNavigateToSalesHistory, rb, reloadActive, tid,
  });

  // ─── Filtering ─────────────────────────────────────────────────────────────
  const q = search.toLowerCase().trim();

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (billTypeFilter === 'GST' && inv.invoice_type !== 'GST') return false;
      if (billTypeFilter === 'BILL_OF_SUPPLY' && inv.invoice_type === 'GST') return false;
      if (!q) return true;
      return (
        inv.invoice_number?.toLowerCase().includes(q) ||
        inv.customer_name?.toLowerCase().includes(q) ||
        inv.customer_phone?.includes(q) ||
        inv.payment_method?.toLowerCase().includes(q)
      );
    });
  }, [invoices, billTypeFilter, q]);

  const filteredProducts = useMemo(() => {
    if (!q) return products;
    return products.filter((p) =>
      p.name?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q)
    );
  }, [products, q]);

  const filteredCustomers = useMemo(() => {
    if (!q) return customers;
    return customers.filter((c) =>
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  }, [customers, q]);

  const filteredParties = useMemo(() => {
    if (!q) return parties;
    return parties.filter((p) =>
      p.name?.toLowerCase().includes(q) ||
      p.phone?.includes(q) ||
      p.party_type?.toLowerCase().includes(q)
    );
  }, [parties, q]);

  const totalDeletedBillsValue = useMemo(() => {
    return invoices.reduce((s, i) => s + (Number(i.grand_total) || 0), 0);
  }, [invoices]);

  const isCurrentLoading =
    (activeCategory === 'SALES_BILLS' && loadingInvoices) ||
    (activeCategory === 'PRODUCTS' && loadingProducts) ||
    (activeCategory === 'CUSTOMERS' && loadingCustomers) ||
    (activeCategory === 'PARTIES' && loadingParties);

  // Permission Guard
  if (!canAccess) {
    return <AccessRestrictedView onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden text-foreground">

      {/* ─── TOP HEADER ─── */}
      <RecycleBinHeader
        activeCategory={activeCategory}
        counts={counts}
        handleEmptyCategory={handleEmptyCategory}
        isAdmin={isAdmin}
        isCurrentLoading={isCurrentLoading}
        onClose={onClose}
        rb={rb}
        reloadActive={reloadActive}
        setActiveCategory={setActiveCategory}
        totalDeletedBillsValue={totalDeletedBillsValue}
      />

      {/* ─── TOOLBAR (Search & Filters) ─── */}
      <RecycleBinToolbar activeCategory={activeCategory} rb={rb} />

      {/* ─── MAIN CONTENT AREA ─── */}
      <RecycleBinContent
        activeCategory={activeCategory}
        askHardDeleteCustomer={askHardDeleteCustomer}
        askHardDeleteInvoice={askHardDeleteInvoice}
        askHardDeleteParty={askHardDeleteParty}
        askHardDeleteProduct={askHardDeleteProduct}
        filteredCustomers={filteredCustomers}
        filteredInvoices={filteredInvoices}
        filteredParties={filteredParties}
        filteredProducts={filteredProducts}
        handleInspectInvoice={handleInspectInvoice}
        isAdmin={isAdmin}
        isCurrentLoading={isCurrentLoading}
        rb={rb}
        restoreCustomer={restoreCustomer}
        restoreInvoice={restoreInvoice}
        restoreParty={restoreParty}
        restoreProduct={restoreProduct}
      />

      {/* ─── BILL INSPECTION DRAWER/MODAL ─── */}
      {inspectingInvoice && (
        <InvoiceInspectionModal inspectingInvoice={inspectingInvoice} restoreInvoice={restoreInvoice} rb={rb} />
      )}

      {/* ─── CONFIRM DIALOG ─── */}
      {confirm.visible && (
        <ConfirmDialog rb={rb} />
      )}

      {/* ─── TOAST NOTIFICATIONS ─── */}
      <ToastStack dismissToast={dismissToast} rb={rb} />

    </div>
  );
}
