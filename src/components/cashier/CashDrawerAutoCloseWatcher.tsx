import { Clock } from 'lucide-react';
import { FloatToast } from '../ui/FloatToast';
import { Modal } from '../ui/Modal';
import { useCashDrawerAutoClose } from './hooks/useCashDrawerAutoClose';

export function CashDrawerAutoCloseWatcher() {
  const { dialog, secondsLeft, toast, clearToast, closeNow, snooze } = useCashDrawerAutoClose();

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <>
      <Modal
        isOpen={Boolean(dialog)}
        onClose={() => undefined}
        title="Auto close time"
        closeButton={null}
        className="max-w-md"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-500 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-sm text-foreground leading-relaxed">
              The auto close time is now. Do you need more time? The cash drawer of{' '}
              <span className="font-bold">{dialog?.businessDate}</span> will close automatically in{' '}
              <span className="font-black tabular-nums">{minutes}:{seconds}</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void snooze(30)}
              className="h-9 px-3.5 rounded-xl border border-border bg-background text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              +30 min
            </button>
            <button
              type="button"
              onClick={() => void snooze(60)}
              className="h-9 px-3.5 rounded-xl border border-border bg-background text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              +1 hour
            </button>
            <button
              type="button"
              onClick={closeNow}
              className="h-9 px-3.5 rounded-xl bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
            >
              Close now
            </button>
          </div>
        </div>
      </Modal>
      {toast && <FloatToast message={toast} onClose={clearToast} />}
    </>
  );
}
