import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import { Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import { Modal } from '../../ui/Modal';

export interface DeleteTxModalProps {
  isOpen: boolean;
  onClose: () => void;
  deleteTxSaving: boolean;
  txToDelete: import('../hooks/usePartyManagerState').PartyManagerState['txToDelete'];
  selectedPartyName?: string;
  onConfirm: () => void;
}

export const DeleteTxModal: React.FC<DeleteTxModalProps> = ({
  isOpen,
  onClose,
  deleteTxSaving,
  txToDelete,
  selectedPartyName,
  onConfirm,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeButton={null}
      title={
        <div className="flex items-center gap-2.5 font-bold text-foreground">
          <Trash2 className="w-5 h-5 text-red-500" />
          <span>Delete Ledger Entry</span>
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
            This will permanently delete this transaction of <strong>{getCurrencyPrefix()}{(txToDelete ? (txToDelete.credit_amount > 0 ? txToDelete.credit_amount : txToDelete.debit_amount) : 0).toFixed(2)}</strong>
            {txToDelete?.description ? <> (<strong>{txToDelete.description}</strong>)</> : ''} for <strong>{selectedPartyName}</strong>.
            The party balance will be recalculated.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleteTxSaving}
            className="px-5 py-2.5 text-sm font-black bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer flex items-center gap-2"
          >
            {deleteTxSaving ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting...</>
            ) : (
              <><Trash2 className="w-3.5 h-3.5" /> Delete Entry</>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
