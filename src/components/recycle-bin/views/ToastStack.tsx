import { FloatToast } from '../../ui/FloatToast';
import type { RecycleBinState } from '../hooks/useRecycleBinState';

export interface ToastStackProps {
  dismissToast: (id: string) => void;
  rb: RecycleBinState;
}

/** Floating toast notifications with an optional action and dismiss button. */
export function ToastStack({ dismissToast, rb }: ToastStackProps) {
  const { toasts } = rb;
  return (
    <div className="fixed bottom-5 right-5 z-[999999] flex flex-col gap-2 pointer-events-none max-w-md">
      {toasts.map(t => <FloatToast key={t.id} message={{ text: t.message, type: t.type }} onClose={() => dismissToast(t.id)} duration={0} actionLabel={t.actionLabel} onAction={t.onAction} stackItem />)}
    </div>
  );
}
