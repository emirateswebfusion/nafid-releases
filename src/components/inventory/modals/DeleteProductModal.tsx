import React from 'react';
import { AlertTriangle, Loader2, Trash } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import type { Product } from '../inventoryHelpers';

export interface DeleteProductModalProps {
  deleteConfirmProduct: Product | null;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

export const DeleteProductModal: React.FC<DeleteProductModalProps> = ({
  deleteConfirmProduct,
  onClose,
  onConfirm,
  isDeleting,
}) => {
  if (!deleteConfirmProduct) return null;

  return (
    <Modal
      isOpen={true}
      onClose={() => !isDeleting && onClose()}
      title="Confirm Delete"
      className="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3.5 bg-destructive/10 text-destructive rounded-xl border border-destructive/20">
          <AlertTriangle className="w-6 h-6 shrink-0" />
          <div>
            <p className="font-bold text-sm">Delete Product?</p>
            <p className="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-foreground">
          Are you sure you want to delete <span className="font-bold text-foreground">"{deleteConfirmProduct.name}"</span>?
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash className="w-4 h-4" />
                <span>Delete Product</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
