import { create } from 'zustand';

interface ScaleState {
  liveWeight: number;
  reading: boolean;
  lastStableWeight: number;
  setLiveWeight: (weight: number) => void;
  setReading: (reading: boolean) => void;
  lockWeight: () => void;
}

export const useScaleStore = create<ScaleState>((set) => ({
  liveWeight: 0,
  reading: false,
  lastStableWeight: 0,
  setLiveWeight: (weight) => set({ liveWeight: weight }),
  setReading: (reading) => set({ reading }),
  lockWeight: () => set((state) => ({ reading: false, lastStableWeight: state.liveWeight })),
}));
