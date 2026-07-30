import { useEffect } from 'react';

/**
 * Closes the component when the Escape key is pressed.
 * Pass the onClose callback from the page/component props.
 */
export function useCloseOnEscape(onClose?: (() => void) | null) {
  useEffect(() => {
    if (!onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
}
