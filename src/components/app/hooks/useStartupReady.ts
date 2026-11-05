import { useEffect } from 'react';
import { appApi, logError } from '../../../data/app';
import { hasBridge, isDesktopRuntime } from '../../../data/client';

/** Release the installer's starting screen only after the initial app view can be painted. */
export function useStartupReady(ready: boolean): void {
  useEffect(() => {
    if (!ready || !isDesktopRuntime() || !hasBridge('appRendererReady')) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => { void appApi.rendererReady().catch(error => { logError('Could not notify installer that Nafid is ready', error); }); });
    });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, [ready]);
}
