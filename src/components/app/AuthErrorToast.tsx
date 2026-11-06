import { useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import { FloatToast } from '../ui/FloatToast';

/** Authentication failures use the same transient notification component as the rest of the POS. */
export function AuthErrorToast() {
  const error = useAuthStore(state => state.authError);
  const close = useCallback(() => useAuthStore.setState({ authError: null }), []);
  return <FloatToast message={error} type="error" onClose={close} duration={8000} />;
}
