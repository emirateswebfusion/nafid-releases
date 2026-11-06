import { useEffect, useState } from 'react';
import { hasBridge, isDesktopRuntime } from '../../../data/client';
import { bridgeEvents } from '../../../data/events';
import { syncApi } from '../../../data/sync';
import { SYNC_QUOTES } from '../../owner-dashboard/syncQuotes';
import { useSyncConnectionStore } from '../../../store/syncConnectionStore';

/** Sync progress bar and quotes for the shell: starts the initial sync after sign-in, follows progress / cycle events
 * from the main process, resets on sign-out and rotates the quotes while syncing. Moved verbatim from App.tsx. */
export function useSyncStatus({ isAuthenticated, isCloudSyncPaused }: { isAuthenticated: boolean; isCloudSyncPaused: boolean }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncChecked, setSyncChecked] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ percent: number; label: string; recordsSynced: number; totalRecords: number } | null>(null);
  const [syncComplete, setSyncComplete] = useState(false);

  const [shuffledQuotes, setShuffledQuotes] = useState<number[]>([]);
  const [quoteIndex, setQuoteIndex] = useState(0);

  // The authenticated shell outlives Sales History and Dashboard. Keep listening while either is open.
  useEffect(() => {
    const connection = useSyncConnectionStore.getState();
    if (!isAuthenticated) { connection.reset(); return; }
    if (hasBridge('onOnlineStatus')) return bridgeEvents.onOnlineStatus(connection.setConnection);
    const update = () => connection.setConnection(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, [isAuthenticated]);

  // Fisher-Yates shuffle
  function shuffleArray(arr: number[]): number[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Pre-shuffle all quotes when syncing starts
  useEffect(() => {
    if (isSyncing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- isSyncing starts a fresh quote permutation; keeping the reset in this effect preserves sync-start timing.
      setShuffledQuotes(shuffleArray(SYNC_QUOTES.map((_, i) => i)));
      setQuoteIndex(0);
    }
  }, [isSyncing]);

  // Reset syncChecked and sync state when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- isAuthenticated becoming false resets transient sync UI after logout, preserving the existing transition timing.
      setSyncChecked(false);
      setIsSyncing(false);
      setSyncProgress(null);
      setSyncComplete(false);
    }
  }, [isAuthenticated]);

  // Auto-hide sync complete bar after 4 seconds
  useEffect(() => {
    if (!syncComplete) return;
    const timer = setTimeout(() => {
      setSyncComplete(false);
      setSyncProgress(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [syncComplete]);

  // Trigger initial sync once on first login — progress events will activate the bar
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#/print')) return;
    if (isAuthenticated && !isCloudSyncPaused && !syncChecked && isDesktopRuntime()) {
      console.log('[App] System authenticated. Starting cloud sync in background...');
      syncApi.runInitialSync().then(result => {
        if (result.success) console.log('[App] Initial sync cycle finished.');
        else console.warn('[App] Initial sync did not run:', result.error);
      }).catch((error) => {
        console.error('[App] Sync failed:', error);
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncChecked locks the initial request before its promise settles to prevent duplicate syncs.
      setSyncChecked(true);
    }
  }, [isAuthenticated, isCloudSyncPaused, syncChecked]);

  // Listen to real sync progress from electron — handles ALL syncs (initial + periodic)
  useEffect(() => {
    if (!hasBridge('onSyncProgress')) return;
    const cleanup = bridgeEvents.onSyncProgress((progress) => {
      setSyncProgress({
        percent: progress.percent ?? 0,
        label: progress.label ?? 'Syncing...',
        recordsSynced: progress.recordsSynced ?? 0,
        totalRecords: progress.totalRecords ?? 0,
      });
      setIsSyncing(true);
      setSyncComplete(false);
    });
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  // Listen to sync cycle complete to mark sync as done
  useEffect(() => {
    if (!hasBridge('onSyncCycleComplete')) return;
    return bridgeEvents.onSyncCycleComplete(() => {
      setSyncComplete(true);
      setIsSyncing(false);
    });
  }, []);

  // Rotate through shuffled quotes while syncing
  useEffect(() => {
    if (!isSyncing || shuffledQuotes.length === 0) return;
    const interval = setInterval(() => {
      setQuoteIndex(prev => {
        const next = prev + 1;
        if (next >= shuffledQuotes.length) {
          setShuffledQuotes(shuffleArray(SYNC_QUOTES.map((_, i) => i)));
          return 0;
        }
        return next;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isSyncing, shuffledQuotes]);

  return { isSyncing, syncProgress, syncComplete, shuffledQuotes, quoteIndex };
}
