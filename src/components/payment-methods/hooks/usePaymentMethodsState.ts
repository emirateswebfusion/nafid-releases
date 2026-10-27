import { useState } from 'react';
import { type View, type PaymentSource, defaultForm, type SourceTransaction } from '../paymentMethodsTypes';
import { type UpiPageConfig, DEFAULT_UPI_PAGE_CONFIG } from '../../../utils/print/upiConfig';

/**
 * State of the payment methods screen: view, payment sources and filters, the add / edit form, the selected source's
 * transactions and manual entry form, UPI page settings, delete confirmation, and loading / saving flags.
 */
export function usePaymentMethodsState() {
  const [view, setView] = useState<View>('list');
  const [sources, setSources] = useState<PaymentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'BANK' | 'CARD' | 'UPI'>('ALL');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PaymentSource | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSource, setSelectedSource] = useState<PaymentSource | null>(null);
  const [transactions, setTransactions] = useState<SourceTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [txSearch, setTxSearch] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [txForm, setTxForm] = useState({ type: 'CASH_IN' as 'CASH_IN' | 'CASH_OUT', amount: '', category: '', notes: '', reference_number: '' });
  const [isSavingTx, setIsSavingTx] = useState(false);
  const [upiPageConfig, setUpiPageConfig] = useState<UpiPageConfig>(DEFAULT_UPI_PAGE_CONFIG);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<PaymentSource | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  return {
    view, setView, sources, setSources, loading, setLoading, search, setSearch, typeFilter, setTypeFilter,
    statusMessage, setStatusMessage, copiedId, setCopiedId, editing, setEditing, form, setForm, isSaving,
    setIsSaving, selectedSource, setSelectedSource, transactions, setTransactions, loadingTx, setLoadingTx, txSearch,
    setTxSearch, showNotes, setShowNotes, txForm, setTxForm, isSavingTx, setIsSavingTx, upiPageConfig,
    setUpiPageConfig, togglingId, setTogglingId, deleteConfirmOpen, setDeleteConfirmOpen, sourceToDelete,
    setSourceToDelete, deleteSaving, setDeleteSaving,
  };
}

export type PaymentMethodsState = ReturnType<typeof usePaymentMethodsState>;
