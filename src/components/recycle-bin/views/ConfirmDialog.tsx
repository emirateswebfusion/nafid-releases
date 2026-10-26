import { AlertTriangle } from 'lucide-react';
import type { RecycleBinState } from '../hooks/useRecycleBinState';

export interface ConfirmDialogProps {
  rb: RecycleBinState;
}

/** Confirmation dialog for irreversible recycle bin actions. */
export function ConfirmDialog({ rb }: ConfirmDialogProps) {
  const { confirm, setConfirm } = rb;
  return (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4 text-foreground">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">{confirm.title}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{confirm.message}</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setConfirm((p) => ({ ...p, visible: false }))}
                className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirm.onConfirm();
                  setConfirm((p) => ({ ...p, visible: false }));
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors cursor-pointer active:scale-[0.98]"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
  );
}
