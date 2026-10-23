import { useState } from 'react';
import { type DeletedCustomer, type DeletedInvoice, type DeletedParty, type DeletedProduct, type InvoiceItemRow, type RecycleBinCategory, type Toast, type ConfirmState } from '../recycleBinTypes';

/**
 * State of the recycle bin screen: filters, per-category deleted rows and loading flags, the inspected bill and its
 * items, toasts and the confirmation dialog.
 */
export function useRecycleBinState() {
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [search, setSearch] = useState('');
  const [billTypeFilter, setBillTypeFilter] = useState<'ALL' | 'GST' | 'BILL_OF_SUPPLY'>('ALL');

  // Category data
  const [invoices, setInvoices] = useState<DeletedInvoice[]>([]);
  const [products, setProducts] = useState<DeletedProduct[]>([]);
  const [customers, setCustomers] = useState<DeletedCustomer[]>([]);
  const [parties, setParties] = useState<DeletedParty[]>([]);

  // Category loading flags
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingParties, setLoadingParties] = useState(false);

  // Loaded categories tracking
  const [, setLoaded] = useState<Set<RecycleBinCategory>>(new Set());

  // Invoice item inspection
  const [inspectingInvoice, setInspectingInvoice] = useState<DeletedInvoice | null>(null);
  const [inspectingItems, setInspectingItems] = useState<InvoiceItemRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Toasts & Dialogs
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  return {
    viewMode, setViewMode, search, setSearch, billTypeFilter, setBillTypeFilter,
    invoices, setInvoices, products, setProducts, customers, setCustomers, parties, setParties,
    loadingInvoices, setLoadingInvoices, loadingProducts, setLoadingProducts, loadingCustomers, setLoadingCustomers,
    loadingParties, setLoadingParties, setLoaded, inspectingInvoice, setInspectingInvoice, inspectingItems,
    setInspectingItems, loadingItems, setLoadingItems, toasts, setToasts, confirm, setConfirm,
  };
}

export type RecycleBinState = ReturnType<typeof useRecycleBinState>;
