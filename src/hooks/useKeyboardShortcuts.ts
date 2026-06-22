import { useEffect, useRef } from 'react';

type ShortcutMap = {
  [key: string]: (e: KeyboardEvent) => void;
};

export const useKeyboardShortcuts = (shortcuts: ShortcutMap) => {
  // Always point to the latest shortcuts via ref so the effect
  // doesn't have to re-run (and re-register) on every render.
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Create a string representation like 'F2', 'F4', 'Ctrl+S', etc.
      const key = `${e.ctrlKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key}`;

      if (shortcutsRef.current[key]) {
        e.preventDefault();
        shortcutsRef.current[key](e);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []); // empty deps — register once on mount, cleanup on unmount
};
