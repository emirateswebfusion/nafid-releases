import { create } from 'zustand';
import { appApi, type UpdateInfoPayload, type AppInstallUpdateResult } from '../data/app';
import { bridgeEvents } from '../data/events';
import { isDesktopRuntime } from '../data/client';

export interface UpdateState {
  updateInfo: UpdateInfoPayload | null;
  updateReady: boolean;
  isDownloading: boolean;
  downloadProgress: { percent: number; transferred: number; total: number } | null;
  initialized: boolean;
  installError: string | null;
  isInstalling: boolean;
  init: () => void;
  installUpdate: () => Promise<AppInstallUpdateResult | undefined>;
  checkForUpdates: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  updateInfo: null,
  updateReady: false,
  isDownloading: false,
  downloadProgress: null,
  initialized: false,
  installError: null,
  isInstalling: false,

  init: () => {
    if (get().initialized || !isDesktopRuntime()) return;
    set({ initialized: true });

    bridgeEvents.onUpdateStatus((status: string) => {
      if (status === 'ready-to-install' || status === 'downloaded') {
        set({ updateReady: true, isDownloading: false });
      } else if (status === 'downloading') {
        set({ isDownloading: true });
      } else if (status === 'error') {
        // The main process only reports 'error' when there is no installable update,
        // so a stale "Restart to update" button must not survive it.
        set({ updateReady: false, isDownloading: false, downloadProgress: null });
      }
    });

    bridgeEvents.onUpdateProgress((progress) => {
      set({ downloadProgress: progress, isDownloading: true });
    });

    bridgeEvents.onUpdateInfo((info) => {
      if (info) {
        set({
          updateInfo: {
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes,
          },
          isDownloading: true,
        });

        // Persist release notes for What's New card display
        if (info.releaseNotes) {
          try {
            localStorage.setItem(`nafid_release_notes_${info.version}`, info.releaseNotes);
            localStorage.setItem('nafid_cached_release_notes', info.releaseNotes);
          } catch (_) {
            /* ignore storage errors */
          }
        }
      }
    });

    appApi.checkForUpdates().catch(() => {});
  },

  installUpdate: async () => {
    if (get().isInstalling) return;
    set({ isInstalling: true, installError: null });
    try {
      const result = await appApi.installUpdate();
      if (result?.success) return result; // Keep progress visible until the app exits.
      set({ updateReady: result?.installerReady === true, isInstalling: false, isDownloading: false, downloadProgress: null,
        installError: result?.error || 'Could not start the installer. Please retry.' });
      return result;
    } catch {
      const error = 'Could not start the update. Nafid is still open. Please retry.';
      set({ isInstalling: false, isDownloading: false, installError: error });
      return { success: false, error };
    }
  },

  checkForUpdates: async () => {
    try {
      const res = await appApi.checkForUpdates();
      if (res && res.success) {
        set(res.updateInfo
          ? { updateInfo: res.updateInfo }
          : { updateInfo: null, updateReady: false, isDownloading: false, downloadProgress: null });
      }
    } catch (_) {
      set({ isDownloading: false });
    }
  },
}));
