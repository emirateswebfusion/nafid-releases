import { create } from 'zustand';
import { appApi, type UpdateInfoPayload } from '../data/app';
import { bridgeEvents } from '../data/events';
import { isDesktopRuntime } from '../data/client';

export interface UpdateState {
  updateInfo: UpdateInfoPayload | null;
  updateReady: boolean;
  isDownloading: boolean;
  downloadProgress: { percent: number; transferred: number; total: number } | null;
  initialized: boolean;
  init: () => void;
  installUpdate: () => void;
  checkForUpdates: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  updateInfo: null,
  updateReady: false,
  isDownloading: false,
  downloadProgress: null,
  initialized: false,

  init: () => {
    if (get().initialized || !isDesktopRuntime()) return;
    set({ initialized: true });

    bridgeEvents.onUpdateStatus((status: string) => {
      if (status === 'ready-to-install' || status === 'downloaded') {
        set({ updateReady: true, isDownloading: false });
      } else if (status === 'downloading') {
        set({ isDownloading: true });
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

  installUpdate: () => {
    appApi.installUpdate();
  },

  checkForUpdates: async () => {
    try {
      const res = await appApi.checkForUpdates();
      if (res && 'updateInfo' in res && res.updateInfo) {
        set({ updateInfo: res.updateInfo });
      }
    } catch (_) {
      /* ignore */
    }
  },
}));
