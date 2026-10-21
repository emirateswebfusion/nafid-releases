import React from 'react';
import { AlertTriangle, Loader2, Trash } from 'lucide-react';
import { Modal } from '../../ui/Modal';

export interface BulkDeleteProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  onConfirm: () => void;
  isBulkDeleting: boolean;
}

export const BulkDeleteProductsModal: React.FC<BulkDeleteProductsModalProps> = ({
  isOpen,
  onClose,
  selectedCount,
  onConfirm,
  isBulkDeleting,
}) => {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isBulkDeleting && onClose()}
      title={`Confirm Bulk Delete (${selectedCount})`}
      className="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3.5 bg-destructive/10 text-destructive rounded-xl border border-destructive/20">
          <AlertTriangle className="w-6 h-6 shrink-0" />
          <div>
            <p className="font-bold text-sm">Delete {selectedCount} Products?</p>
            <p className="text-xs text-muted-foreground mt-0.5">This action will remove all selected products from inventory.</p>
          </div>
        </div>
        <p className="text-sm text-foreground">
          Are you sure you want to permanently delete <span className="font-bold text-destructive">{selectedCount}</span> selected product(s)? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBulkDeleting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            {isBulkDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Deleting {selectedCount}...</span>
              </>
            ) : (
              <>
                <Trash className="w-4 h-4" />
                <span>Delete {selectedCount} Items</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
