import { AlertCircle, X } from 'lucide-react';
import clsx from 'clsx';
import type { QuotationState } from '../hooks/useQuotationState';

export interface QuotationConfirmDialogProps {
  qm: QuotationState;
}

/** Confirmation dialog for editing, deleting or converting a quotation. */
export function QuotationConfirmDialog({ qm }: QuotationConfirmDialogProps) {
  const { confirmDialog, setConfirmDialog } = qm;
  if (!confirmDialog.isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <AlertCircle className={clsx(
              "w-5 h-5",
              confirmDialog.variant === 'red' ? "text-red-500" :
              confirmDialog.variant === 'emerald' ? "text-emerald-500" :
              "text-blue-500"
            )} />
            <span>{confirmDialog.title}</span>
          </h3>
          <button
            onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {confirmDialog.message}
        </p>
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
            className="px-4 py-2 border border-border text-foreground font-bold text-xs rounded-xl hover:bg-muted transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDialog.onConfirm}
            className={clsx(
              "px-4 py-2 text-white font-bold text-xs rounded-xl transition-all active:scale-95 shadow-sm cursor-pointer border-0",
              confirmDialog.variant === 'red' ? "bg-red-500 hover:bg-red-600" :
              confirmDialog.variant === 'emerald' ? "bg-emerald-500 hover:bg-emerald-600" :
              "bg-blue-500 hover:bg-blue-600"
            )}
          >
            {confirmDialog.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
