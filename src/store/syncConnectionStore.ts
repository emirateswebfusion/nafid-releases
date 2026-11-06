import { create } from 'zustand';

type SyncRoute = 'LAN' | 'CLOUD' | 'NONE';
interface SyncConnectionState {
  isOnline: boolean;
  activeRoute: SyncRoute | null;
  setConnection: (online: boolean, route?: SyncRoute) => void;
  reset: () => void;
}

/** Last worker-reported connection for this signed-in shell; screen navigation must not reset it. */
export const useSyncConnectionStore = create<SyncConnectionState>(set => ({
  isOnline: false,
  activeRoute: 'NONE',
  setConnection: (online, route) => set({ isOnline: online, activeRoute: online ? route || null : 'NONE' }),
  reset: () => set({ isOnline: false, activeRoute: 'NONE' }),
}));
