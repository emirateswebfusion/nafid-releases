import { type PaymentSource } from '../paymentMethodsTypes';
import { paymentSourcesApi } from '../../../data/paymentSources';
import type { PaymentMethodsState } from './usePaymentMethodsState';

export interface UsePaymentTransactionActionsContext {
  loadSources: (silent?: boolean) => Promise<void>;
  showMessage: (text: string, type?: "success" | "error") => void;
  tenantId: string | null;
  userId: string | null;
  userName: string | null;
  pmState: PaymentMethodsState;
}

/** Open the selected payment method's ledger and record a manual cash in / out entry on it. */
export function usePaymentTransactionActions(ctx: UsePaymentTransactionActionsContext) {
  const { loadSources, showMessage, tenantId, userId, userName } = ctx;
  const { selectedSource, setIsSavingTx, setLoadingTx, setSelectedSource, setShowNotes, setTransactions, setTxForm, setTxSearch, setView, txForm } = ctx.pmState;
  const openTransactions = async (s: PaymentSource) => {
    setSelectedSource(s);
    setView('transactions');
    setTxSearch('');
    setShowNotes(false);
    setTxForm({ type: 'CASH_IN', amount: '', category: '', notes: '', reference_number: '' });
    setLoadingTx(true);
    try {
      const res = await paymentSourcesApi.getTransactions({ source_id: s.source_id, tenant_id: tenantId || '' });
      setTransactions(Array.isArray(res) ? res : []);
    } catch {
      setTransactions([]);
    } finally {
      setLoadingTx(false);
    }
  };

  const saveTransaction = async () => {
    if (!selectedSource) return;
    const amount = parseFloat(txForm.amount);
    if (!isFinite(amount) || amount <= 0) {
      showMessage('Please enter a valid positive amount', 'error');
      return;
    }
    setIsSavingTx(true);
    try {
      const res = await paymentSourcesApi.addTransaction({
        tenant_id: tenantId,
        source_id: selectedSource.source_id,
        type: txForm.type,
        amount,
        category: txForm.category.trim() || null,
        notes: txForm.notes.trim() || null,
        reference_number: txForm.reference_number.trim() || null,
        entered_by: userId,
        entered_by_name: userName,
      });
      if (!res.success) {
        showMessage(res.error || 'Failed to record transaction', 'error');
        return;
      }
      showMessage(txForm.type === 'CASH_IN' ? 'Funds added to account' : 'Funds withdrawn from account');
      setTxForm({ type: 'CASH_IN', amount: '', category: '', notes: '', reference_number: '' });
      await openTransactions(selectedSource);
      await loadSources(true);
    } catch (e) {
      showMessage((e as { message?: string } | null)?.message || 'Operation failed', 'error');
    } finally {
      setIsSavingTx(false);
    }
  };

  return { openTransactions, saveTransaction };
}
