import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useUpdateStore } from '../../../store/updateStore';

/** Read the canonical update snapshot directly; Settings never mirrors it into local state. */
export function useSettingsUpdater() {
  const state = useUpdateStore(useShallow(({ updateInfo, updateReady, isDownloading, downloadProgress, lastChecked, isInstalling, installError, checkError, isChecking }) => ({ updateInfo, updateReady, isDownloading, downloadProgress, lastChecked, isInstalling, installError, checkError, isChecking })));
  useEffect(() => { useUpdateStore.getState().init(); }, []);
  const updateStatus = state.isInstalling ? 'Starting installer...'
    : state.installError ? (state.updateReady ? 'Installation failed — retry' : 'Download failed')
    : state.updateReady ? 'Update ready'
    : state.isDownloading ? 'Downloading...'
    : state.checkError ? 'Download failed'
    : state.isChecking ? 'Checking...'
    : state.updateInfo ? 'Update available'
    : state.lastChecked ? 'Up to date' : null;
  return { updateInfo: state.updateInfo, updateReady: state.updateReady, isDownloading: state.isDownloading,
    downloadProgress: state.downloadProgress ? { ...state.downloadProgress, bytesPerSecond: state.downloadProgress.bytesPerSecond ?? 0 } : null,
    lastChecked: state.lastChecked, updateStatus };
}
