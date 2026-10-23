import { Modal } from '../../ui/Modal';
import { RedCrossButton } from '../../ui/RedCrossButton';
import { Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import type { PaymentMethodsState } from '../hooks/usePaymentMethodsState';

export interface DeletePaymentSourceDialogProps {
  confirmDeleteSource: () => Promise<void>;
  pmState: PaymentMethodsState;
}

/** Confirmation dialog for deleting a payment method. */
export function DeletePaymentSourceDialog({
  confirmDeleteSource, pmState,
}: DeletePaymentSourceDialogProps) {
  const { deleteConfirmOpen, deleteSaving, setDeleteConfirmOpen, setSourceToDelete, sourceToDelete } = pmState;
  return (
    <Modal
      isOpen={deleteConfirmOpen}
      onClose={() => { if (!deleteSaving) { setDeleteConfirmOpen(false); setSourceToDelete(null); } }}
      closeButton={<RedCrossButton onClick={() => { setDeleteConfirmOpen(false); setSourceToDelete(null); }} />}
      title={
        <div className="flex items-center gap-2.5 font-bold text-foreground">
          <Trash2 className="w-5 h-5 text-red-500" />
          <span>Delete Payment Method</span>
        </div>
      }
    >
      <div className="space-y-4 min-w-[400px] text-foreground">
        <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl">
          <p className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Are you sure?
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            This will permanently delete payment method <strong>"{sourceToDelete?.name}"</strong>. Existing transaction history will be preserved.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button
            onClick={confirmDeleteSource}
            disabled={deleteSaving}
            className="px-5 py-2.5 text-sm font-black bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer flex items-center gap-2"
          >
            {deleteSaving ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting...</>
            ) : (
              <><Trash2 className="w-3.5 h-3.5" /> Delete Method</>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
