import { AlertCircle, RefreshCw, Trash2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import type { ComboManagerState } from '../hooks/useComboManagerState';

export interface DeleteComboDialogProps {
  confirmDeleteCombo: () => Promise<void>;
  cm: ComboManagerState;
}

/** Delete combo offer confirmation modal. */
export function DeleteComboDialog({ confirmDeleteCombo, cm }: DeleteComboDialogProps) {
  const { deleteConfirmOpen, setDeleteConfirmOpen, deleteSaving, comboToDelete, setComboToDelete } = cm;
  return (
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => { if (!deleteSaving) { setDeleteConfirmOpen(false); setComboToDelete(null); } }}
        closeButton={null}
        title={
          <div className="flex items-center gap-2.5 font-bold text-foreground">
            <Trash2 className="w-5 h-5 text-red-500" />
            <span>Delete Combo Offer</span>
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
              This will permanently delete combo offer <strong>"{comboToDelete?.name}"</strong>.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              onClick={confirmDeleteCombo}
              disabled={deleteSaving}
              className="px-5 py-2.5 text-sm font-black bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer flex items-center gap-2"
            >
              {deleteSaving ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting...</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5" /> Delete Combo</>
              )}
            </button>
          </div>
        </div>
      </Modal>
  );
}
