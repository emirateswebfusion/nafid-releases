import { useCallback } from 'react';
import type { RecycleBinState } from './useRecycleBinState';

export interface UseRecycleBinToastsContext {
  rb: RecycleBinState;
}

/** Toast queue: push a toast that dismisses itself after 5s, and dismiss one by id. */
export function useRecycleBinToasts(ctx: UseRecycleBinToastsContext) {
  const { setToasts } = ctx.rb;

  const addToast = useCallback((message: string, type: 'success' | 'error', actionLabel?: string, onAction?: () => void) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type, actionLabel, onAction }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, [setToasts]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, [setToasts]);

  return { addToast, dismissToast };
}
