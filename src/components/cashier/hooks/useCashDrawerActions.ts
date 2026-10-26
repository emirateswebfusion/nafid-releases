import type React from 'react';
import { cashierApi } from '../../../data/cashier';
import { hasBridge } from '../../../data/client';
import { partiesApi } from '../../../data/parties';
import type { DialogVariant } from '../../ui/CustomDialog';
import type { CashDrawerRow, CashTransactionRow, DayCloseResult } from '../cashierTypes';

export interface UseCashDrawerActionsContext {
  actualCash: number;
  closeRemarks: string;
  closingDate: string | null;
  deleteConfirmTx: CashTransactionRow | null;
  drawer: CashDrawerRow | null;
  expandedDay: string | null;
  isOwner: boolean;
  load: () => Promise<void>;
  loadDaySettlements: (businessDate: string) => Promise<void>;
  reopenConfirmDrawer: CashDrawerRow | null;
  setAlertDialog: React.Dispatch<React.SetStateAction<{ title: string; message: string; variant?: DialogVariant; } | null>>;
  setCloseResult: React.Dispatch<React.SetStateAction<DayCloseResult | null>>;
  setCloseSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  setDeleteConfirmTx: React.Dispatch<React.SetStateAction<CashTransactionRow | null>>;
  setHistory: React.Dispatch<React.SetStateAction<CashDrawerRow[]>>;
  setIsDeletingTx: React.Dispatch<React.SetStateAction<boolean>>;
  setIsReopeningDrawer: React.Dispatch<React.SetStateAction<boolean>>;
  setNewCatName: React.Dispatch<React.SetStateAction<string>>;
  setPartySearch: React.Dispatch<React.SetStateAction<string>>;
  setReopenConfirmDrawer: React.Dispatch<React.SetStateAction<CashDrawerRow | null>>;
  setShowAddCatForm: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTxnModal: React.Dispatch<React.SetStateAction<boolean>>;
  setTxnAmt: React.Dispatch<React.SetStateAction<number>>;
  setTxnCat: React.Dispatch<React.SetStateAction<string>>;
  setTxnError: React.Dispatch<React.SetStateAction<string>>;
  setTxnNote: React.Dispatch<React.SetStateAction<string>>;
  setTxnPartyId: React.Dispatch<React.SetStateAction<string>>;
  setTxnPartyName: React.Dispatch<React.SetStateAction<string>>;
  setTxnSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  tenantId: string | null;
  txnAmt: number;
  txnCat: string;
  txnNote: string;
  txnPartyId: string;
  txnPartyName: string;
  txnType: "CASH_IN" | "CASH_OUT";
  userId: string | null;
  userName: string | null;
}

/**
 * Cash drawer actions of the cashier screen: re-open a closed drawer, delete a transaction, add a cash-in / cash-out
 * transaction and close the day. (No React state of its own; the screen passes its state in.)
 */
export function useCashDrawerActions(ctx: UseCashDrawerActionsContext) {
  const { actualCash, closeRemarks, closingDate, deleteConfirmTx, drawer, expandedDay, isOwner, load, loadDaySettlements, reopenConfirmDrawer, setAlertDialog, setCloseResult, setCloseSubmitting, setDeleteConfirmTx, setHistory, setIsDeletingTx, setIsReopeningDrawer, setNewCatName, setPartySearch, setReopenConfirmDrawer, setShowAddCatForm, setShowTxnModal, setTxnAmt, setTxnCat, setTxnError, setTxnNote, setTxnPartyId, setTxnPartyName, setTxnSubmitting, tenantId, txnAmt, txnCat, txnNote, txnPartyId, txnPartyName, txnType, userId, userName } = ctx;
  const confirmReopenDrawer = async () => {
    if (!reopenConfirmDrawer || !isOwner) return;
    const targetId = reopenConfirmDrawer.drawer_id || reopenConfirmDrawer;
    setIsReopeningDrawer(true);
    try {
      const res = await cashierApi.reopenDrawer({
        tenant_id: tenantId!,
        drawer_id: targetId as string,
        user_id: userId!,
        user_name: userName as string | undefined, // type-only: same value the screen passed
      });
      if (res.success) {
        setReopenConfirmDrawer(null);
        await load();
        if (hasBridge('dbCashierGetHistory')) {
          const hist = await cashierApi.getHistory({ tenant_id: tenantId! });
          if (Array.isArray(hist)) setHistory(hist);
        }
      } else {
        setAlertDialog({
          title: 'Action Failed',
          message: res.error || 'Failed to reopen cash drawer',
          variant: 'danger'
        });
      }
    } catch (err) {
      console.error('Reopen drawer error:', err);
      setAlertDialog({
        title: 'System Error',
        message: 'Failed to reopen cash drawer: ' + ((err as Error).message || err),
        variant: 'danger'
      });
    } finally {
      setIsReopeningDrawer(false);
    }
  };

  const confirmDeleteTransaction = async () => {
    if (!deleteConfirmTx || !isOwner) return;
    setIsDeletingTx(true);
    try {
      const res = await cashierApi.deleteTransaction({
        tenant_id: tenantId!,
        transaction_id: deleteConfirmTx.transaction_id,
        user_id: userId!,
        user_name: userName as string | undefined, // type-only: same value the screen passed
      });
      if (res.success) {
        setDeleteConfirmTx(null);
        await load();
        if (hasBridge('dbCashierGetHistory')) {
          const hist = await cashierApi.getHistory({ tenant_id: tenantId! });
          if (Array.isArray(hist)) setHistory(hist);
        }
        if (expandedDay) {
          loadDaySettlements(expandedDay);
        }
      } else {
        setAlertDialog({
          title: 'Action Failed',
          message: res.error || 'Failed to delete transaction',
          variant: 'danger'
        });
      }
    } catch (err) {
      console.error('Delete transaction error:', err);
      setAlertDialog({
        title: 'System Error',
        message: 'Failed to delete transaction: ' + ((err as Error).message || err),
        variant: 'danger'
      });
    } finally {
      setIsDeletingTx(false);
    }
  };

  const handleAddTransaction = async () => {
    setTxnError('');
    if (!tenantId || !userId || txnAmt <= 0) return;
    if (drawer?.status === 'CLOSED') {
      setTxnError('Cash Register is closed for today. Entries are locked.');
      return;
    }
    setTxnSubmitting(true);
    const finalNotes = txnPartyName
      ? (txnNote ? `Party: ${txnPartyName} | ${txnNote}` : `Party: ${txnPartyName}`)
      : (txnNote || undefined);

    const r = await cashierApi.addTransaction({
      tenant_id: tenantId, type: txnType, amount: txnAmt,
      category: txnCat || undefined, notes: finalNotes,
      user_id: userId, user_name: userName || undefined,
    });
    if (r.success && txnPartyId) {
      const partyTxnType = txnType === 'CASH_IN' ? 'DEBIT' : 'CREDIT';
      await partiesApi.addPartyLedgerEntry({
        party_id: txnPartyId,
        tenant_id: tenantId,
        transaction_type: partyTxnType,
        amount: txnAmt,
        description: `${txnType === 'CASH_IN' ? 'Cash received' : 'Cash paid'} - ${txnCat || 'Manual'}${txnNote ? ': ' + txnNote : ''}`,
        reference_number: null,
        created_by: userId,
        created_by_name: userName || undefined,
        ledger_id: crypto.randomUUID(),
      });
    }
    setTxnSubmitting(false);
    if (r.success) {
      setTxnAmt(0); setTxnCat(''); setTxnNote(''); setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); setShowAddCatForm(false); setNewCatName(''); setShowTxnModal(false); await load();
    } else {
      // Show the error returned by the IPC handler so the user knows what went wrong
      const errMsg = r.error || 'Failed to record entry. Please ensure the cash register is open.';
      setTxnError(errMsg);
    }
  };

  const handleDayClose = async () => {
    if (!tenantId || !userId || actualCash < 0) return;
    setCloseSubmitting(true);
    const r = await cashierApi.dayClosing({
      tenant_id: tenantId, actual_cash: actualCash,
      closing_remarks: closeRemarks || undefined,
      user_id: userId, user_name: userName || undefined,
      business_date: closingDate || undefined,
    });
    setCloseSubmitting(false);
    if (r.success) { 
      setCloseResult(r); 
      await load(); 
      window.dispatchEvent(new Event('checkout:completed'));
      window.dispatchEvent(new Event('cashier:closed'));
    }
  };

  return { confirmReopenDrawer, confirmDeleteTransaction, handleAddTransaction, handleDayClose };
}
