import { create } from 'zustand';

const FONT_SCALE_KEY = 'vendora-font-scale';
const MIN_FONT_SCALE = 70;
const MAX_FONT_SCALE = 140;
const DEFAULT_FONT_SCALE = 100;

function applyFontScale(scale: number) {
  const factor = scale / 100;
  document.documentElement.style.setProperty('--font-scale', factor.toString());
}

function loadFontScale(): number {
  try {
    const stored = localStorage.getItem(FONT_SCALE_KEY);
    if (stored !== null) {
      const val = parseInt(stored, 10);
      if (!isNaN(val) && val >= MIN_FONT_SCALE && val <= MAX_FONT_SCALE) {
        return val;
      }
    }
  } catch {}
  return DEFAULT_FONT_SCALE;
}

interface ThemeState {
  theme: 'light' | 'dark';
  fontScale: number;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setFontScale: (scale: number) => void;
  increaseFontScale: () => void;
  decreaseFontScale: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: (localStorage.getItem('vendora-theme') as 'light' | 'dark') || 'light',
  fontScale: loadFontScale(),

  setTheme: (theme) => {
    localStorage.setItem('vendora-theme', theme);
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    set({ theme });
  },

  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('vendora-theme', newTheme);
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(newTheme);
    return { theme: newTheme };
  }),

  setFontScale: (scale) => {
    const clamped = Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, scale));
    localStorage.setItem(FONT_SCALE_KEY, clamped.toString());
    applyFontScale(clamped);
    set({ fontScale: clamped });
  },

  increaseFontScale: () => {
    const current = get().fontScale;
    const next = Math.min(MAX_FONT_SCALE, current + 10);
    localStorage.setItem(FONT_SCALE_KEY, next.toString());
    applyFontScale(next);
    set({ fontScale: next });
  },

  decreaseFontScale: () => {
    const current = get().fontScale;
    const next = Math.max(MIN_FONT_SCALE, current - 10);
    localStorage.setItem(FONT_SCALE_KEY, next.toString());
    applyFontScale(next);
    set({ fontScale: next });
  },
}));

// Apply font scale on load
applyFontScale(loadFontScale());
