import clsx from 'clsx';
import { X, AlertTriangle, RotateCcw, ExternalLink } from 'lucide-react';
import type { RecycleBinState } from '../hooks/useRecycleBinState';

export interface ToastStackProps {
  dismissToast: (id: string) => void;
  rb: RecycleBinState;
}

/** Floating toast notifications with an optional action and dismiss button. */
export function ToastStack({ dismissToast, rb }: ToastStackProps) {
  const { toasts } = rb;
  return (
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold border transition-all animate-in slide-in-from-bottom-2',
              t.type === 'success'
                ? 'bg-card border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-card border-rose-500/30 text-rose-600 dark:text-rose-400'
            )}
          >
            {t.type === 'success' ? <RotateCcw size={14} /> : <AlertTriangle size={14} />}
            <span>{t.message}</span>
            {t.actionLabel && t.onAction && (
              <button
                onClick={t.onAction}
                className="ml-2 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold hover:opacity-90 flex items-center gap-1 cursor-pointer"
              >
                <span>{t.actionLabel}</span>
                <ExternalLink size={10} />
              </button>
            )}
            <button onClick={() => dismissToast(t.id)} className="ml-1 opacity-60 hover:opacity-100 cursor-pointer">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
  );
}
