import { AlertCircle, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { RedCrossButton } from '../../ui/RedCrossButton';
import type { ComboManagerState } from '../hooks/useComboManagerState';

export interface ComboStatusToastProps {
  cm: ComboManagerState;
}

/** Floating status toast for combo success and error messages. */
export function ComboStatusToast({ cm }: ComboStatusToastProps) {
  const { statusMessage, setStatusMessage } = cm;
  return (
    <>
      {statusMessage && (
        <div className="fixed bottom-5 right-5 z-[9999] px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto max-w-md">
          <div className={clsx("p-2 rounded-xl shrink-0", statusMessage.type === 'success' ? "bg-emerald-500/25 text-emerald-400" : "bg-red-500/25 text-red-400")}>
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0 leading-snug">
            <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">
              {statusMessage.type === 'success' ? 'COMBO STATUS' : 'COMBO ERROR'}
            </span>
            <span className="text-white font-bold text-xs block leading-tight">{statusMessage.text}</span>
          </div>
          <RedCrossButton onClick={() => setStatusMessage(null)} size="sm" />
        </div>
      )}
    </>
  );
}
