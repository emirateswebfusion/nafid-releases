import { useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { getUpiPageConfig } from '../utils/upiConfig';
import { FloatToast } from './ui/FloatToast';
import { hasBridge } from '../data/client';
import { paymentSourcesApi } from '../data/paymentSources';
import { usePaymentMethodsState } from './payment-methods/hooks/usePaymentMethodsState';
import { usePaymentSourceActions } from './payment-methods/hooks/usePaymentSourceActions';
import { usePaymentTransactionActions } from './payment-methods/hooks/usePaymentTransactionActions';
import { DeletePaymentSourceDialog } from './payment-methods/views/DeletePaymentSourceDialog';
import { PaymentTransactionsView } from './payment-methods/views/PaymentTransactionsView';
import { PaymentSourceCardPreview } from './payment-methods/views/PaymentSourceCardPreview';
import { PaymentSourceFormFields } from './payment-methods/views/PaymentSourceFormFields';
import { PaymentTypeSelector } from './payment-methods/views/PaymentTypeSelector';
import { UpiPageSettings } from './payment-methods/views/UpiPageSettings';
import { PaymentSourceGrid } from './payment-methods/views/PaymentSourceGrid';
import { PaymentSourceFilters } from './payment-methods/views/PaymentSourceFilters';
import { PaymentMetricsStrip } from './payment-methods/views/PaymentMetricsStrip';
import { PaymentMethodsHeader } from './payment-methods/views/PaymentMethodsHeader';

export function PaymentMethods({ onClose, isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { tenantId, userId, userName } = useAuthStore();
  const isOwner = !isRestricted;

  const pmState = usePaymentMethodsState();
  const {
    view, sources, setSources, setLoading, search, typeFilter,
    statusMessage, setStatusMessage, form, selectedSource, transactions, txSearch,
    setUpiPageConfig,
  } = pmState;

  const loadSources = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (hasBridge('dbPaymentGetSources')) {
        const res = await paymentSourcesApi.getSources(tenantId || '');
        if (Array.isArray(res)) setSources(res);
      }
      const config = await getUpiPageConfig(tenantId || '');
      setUpiPageConfig(config);
    } catch {
      if (!silent) setSources([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tenantId, setLoading, setSources, setUpiPageConfig]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const { handleToggleUpiPage, copyToClipboard, openAdd, openEdit, saveSource, toggleSourceDefault, toggleSourceEnabled, deleteSource, confirmDeleteSource } = usePaymentSourceActions({
    pmState, loadSources, showMessage, tenantId, userId, userName,
  });

  const { openTransactions, saveTransaction } = usePaymentTransactionActions({
    pmState, loadSources, showMessage, tenantId, userId, userName,
  });

  const filteredSources = sources.filter(s => {
    const matchesSearch = !search.trim() ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.bank_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.account_number || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.upi_id || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.holder_name || '').toLowerCase().includes(search.toLowerCase());

    const matchesFilter = typeFilter === 'ALL' || s.type === typeFilter;
    return matchesSearch && matchesFilter;
  });

  const safeSources = Array.isArray(sources) ? sources : [];
  const totalLiquidity = safeSources.filter(s => s.is_enabled === 1).reduce((sum, s) => sum + (Number(s.current_balance) || 0), 0);
  const totalAccounts = safeSources.length;
  const activeAccounts = safeSources.filter(s => s.is_enabled === 1).length;
  const defaultSource = safeSources.find(s => s.is_default === 1);
  const totalTxnCount = safeSources.reduce((sum, s) => sum + (Number(s.transaction_count) || 0), 0);

  const filteredTransactions = transactions.filter(t => {
    if (!txSearch.trim()) return true;
    const query = txSearch.toLowerCase();
    return (
      (t.category || '').toLowerCase().includes(query) ||
      (t.reference_number || '').toLowerCase().includes(query) ||
      (t.notes || '').toLowerCase().includes(query) ||
      (t.entered_by_name || '').toLowerCase().includes(query)
    );
  });

  const txTotalIn = transactions.filter(t => t.type === 'CASH_IN').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const txTotalOut = transactions.filter(t => t.type === 'CASH_OUT').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl animate-in fade-in duration-300 overflow-hidden">
      {/* Background ambient lighting effects */}
      <div className="absolute -top-24 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Header */}
      <PaymentMethodsHeader
        isOwner={isOwner} onClose={onClose} openAdd={openAdd} pmState={pmState}
      />

      {/* Floating Status Toast Notification */}
      {statusMessage && (
        <FloatToast
          message={statusMessage.text}
          type={statusMessage.type}
          onClose={() => setStatusMessage(null)}
        />
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 relative z-10">
        {view === 'list' && (
          <div className="w-full space-y-6">
            
            {/* Top Liquidity Metrics Strip */}
            <PaymentMetricsStrip
              activeAccounts={activeAccounts} defaultSource={defaultSource} sources={sources}
              totalAccounts={totalAccounts} totalLiquidity={totalLiquidity} totalTxnCount={totalTxnCount}
            />

            {/* Filter & Search Bar */}
            <PaymentSourceFilters
              pmState={pmState}
            />

            {/* Methods Card Grid */}
            <PaymentSourceGrid
              copyToClipboard={copyToClipboard} deleteSource={deleteSource} filteredSources={filteredSources}
              isOwner={isOwner} openAdd={openAdd} openEdit={openEdit} openTransactions={openTransactions}
              toggleSourceDefault={toggleSourceDefault} toggleSourceEnabled={toggleSourceEnabled} pmState={pmState}
            />

            {/* ── UPI Details Page-wise Configuration Section ── */}
            <UpiPageSettings
              handleToggleUpiPage={handleToggleUpiPage} pmState={pmState}
            />

          </div>
        )}

        {/* Add / Edit Form View */}
        {view === 'form' && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Step 1: Visual Channel Type Selector */}
            <PaymentTypeSelector
              pmState={pmState}
            />

            {/* Step 2 & Live Preview Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Form Inputs Column */}
              <PaymentSourceFormFields
                saveSource={saveSource} pmState={pmState}
              />

              {/* Ultra-Realistic Digital Wallet Card Preview */}
              <PaymentSourceCardPreview
                form={form}
              />

            </div>

          </div>
        )}

        {/* Transactions & Ledger View */}
        {view === 'transactions' && selectedSource && (
          <PaymentTransactionsView
            filteredTransactions={filteredTransactions} isOwner={isOwner} saveTransaction={saveTransaction}
            txTotalIn={txTotalIn} txTotalOut={txTotalOut} selectedSource={selectedSource} pmState={pmState}
          />
        )}
      </div>
      {/* Delete Payment Source Confirmation Modal */}
      <DeletePaymentSourceDialog
        confirmDeleteSource={confirmDeleteSource} pmState={pmState}
      />
    </div>
  );
}
