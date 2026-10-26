import React from 'react';
import { Modal } from '../../ui/Modal';
import { isDesktopRuntime, hasBridge } from '../../../data/client';
import { productsApi } from '../../../data/products';

export interface PurchaseCleanupDialogProps {
  createdProductIds: string[];
  pendingCloseAction: (() => void) | null;
  setCreatedProductIds: React.Dispatch<React.SetStateAction<string[]>>;
  setShowCleanupModal: React.Dispatch<React.SetStateAction<boolean>>;
  showCleanupModal: boolean;
}

/** Dialog in the purchase bill form for cleaning up (removing) newly created products before leaving. */
export function PurchaseCleanupDialog({
  createdProductIds, pendingCloseAction, setCreatedProductIds, setShowCleanupModal, showCleanupModal,
}: PurchaseCleanupDialogProps) {
  return (
    <Modal
      isOpen={showCleanupModal}
      onClose={() => setShowCleanupModal(false)}
      title="Delete Unsaved Created Products?"
    >
      <div className="p-4 space-y-4">
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-700 dark:text-amber-300 text-xs leading-relaxed space-y-1.5">
          <p className="font-bold flex items-center gap-1.5 text-sm">
            <span>⚠️</span> Attention:
          </p>
          <p>
            You created <strong>{createdProductIds.length}</strong> new product(s) in inventory while drafting this purchase bill.
          </p>
          <p>
            When discarding without saving, would you like to delete these product(s) from your inventory catalog or keep them (with 0 stock)?
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <button
            type="button"
            onClick={async () => {
              if (isDesktopRuntime() && createdProductIds.length > 0) {
                try {
                  if (hasBridge('dbBulkDeleteProducts')) {
                    await productsApi.bulkDeleteProducts(createdProductIds);
                  } else if (hasBridge('dbDeleteProduct')) {
                    for (const pid of createdProductIds) {
                      await productsApi.deleteProduct(pid);
                    }
                  }
                } catch (e) {
                  console.error('[PurchaseBillManager] Product cleanup error:', e);
                }
              }
              setCreatedProductIds([]);
              setShowCleanupModal(false);
              if (pendingCloseAction) pendingCloseAction();
            }}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
          >
            Delete from Inventory
          </button>

          <button
            type="button"
            onClick={() => {
              setCreatedProductIds([]);
              setShowCleanupModal(false);
              if (pendingCloseAction) pendingCloseAction();
            }}
            className="flex-1 px-4 py-2.5 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-xl font-bold text-xs transition-all cursor-pointer active:scale-95"
          >
            Keep in Inventory (0 Stock)
          </button>
        </div>
      </div>
    </Modal>
  );
}
