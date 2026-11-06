import { FloatToast } from '../../ui/FloatToast';
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
        <FloatToast message={statusMessage} onClose={() => setStatusMessage(null)} title={statusMessage?.type === 'success' ? 'COMBO STATUS' : 'COMBO ERROR'} duration={0} />
      )}
    </>
  );
}
