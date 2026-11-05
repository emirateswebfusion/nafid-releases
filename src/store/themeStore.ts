import { create } from 'zustand';
import { hasBridge } from '../data/client';
import { setSetting, settingsApi } from '../data/settings';

const FONT_SCALE_KEY = 'vendora-font-scale';
const PRIMARY_COLOR_KEY = 'vendora-primary-color';
const FONT_FAMILY_KEY = 'vendora-font-family';
const LIGHT_THEME_BASE_KEY = 'vendora-light-theme-base';
const DARK_THEME_BASE_KEY = 'vendora-dark-theme-base';

const MIN_FONT_SCALE = 70;
const MAX_FONT_SCALE = 140;
export const DEFAULT_FONT_SCALE = 100;
export const DEFAULT_PRIMARY_COLOR = '#2563eb';
export const DEFAULT_FONT_FAMILY = 'Plus Jakarta Sans';
const DEFAULT_LIGHT_THEME_BASE = 'neutral-zinc';
const DEFAULT_DARK_THEME_BASE = 'charcoal-zinc';

export interface ColorPreset {
  id: string;
  name: string;
  hex: string;
  category: string;
  description: string;
}

export const COLOR_PRESETS: ColorPreset[] = [
  { id: 'sapphire', name: 'Sapphire Royal', hex: '#2563eb', category: 'Standard', description: 'Default Nafid Blue, calibrated and sharp' },
  { id: 'emerald', name: 'Emerald Retail', hex: '#059669', category: 'Retail', description: 'Fresh organic and grocery commerce accent' },
  { id: 'indigo', name: 'Indigo Core', hex: '#4f46e5', category: 'Fintech', description: 'Modern high-tech and payment terminal tone' },
  { id: 'violet', name: 'Royal Violet', hex: '#7c3aed', category: 'Luxury', description: 'Refined deep luxury and lifestyle tone' },
  { id: 'rose', name: 'Crimson Rose', hex: '#e11d48', category: 'Apparel', description: 'Energetic boutique and fashion palette' },
  { id: 'amber', name: 'Warm Amber', hex: '#d97706', category: 'Artisan', description: 'Warm golden tone for cafes, bakeries, and roasteries' },
  { id: 'teal', name: 'Nordic Teal', hex: '#0d9488', category: 'Healthcare', description: 'Clean, balanced Scandinavian medical and wellness' },
  { id: 'cyan', name: 'Ocean Cyan', hex: '#0284c7', category: 'Coastal', description: 'Crisp open-air coastal contrast' },
  { id: 'slate', name: 'Obsidian Slate', hex: '#334155', category: 'Minimalist', description: 'Sophisticated neutral high-contrast slate' },
];

export interface SurfaceThemePreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  bg: string;
  card: string;
  border: string;
  foreground: string;
  secondary: string;
  muted: string;
  mutedForeground: string;
}

export const LIGHT_THEME_PRESETS: SurfaceThemePreset[] = [
  {
    id: 'neutral-zinc',
    name: 'Neutral Zinc',
    badge: 'Zero Blue',
    description: 'Clean modern architectural gray with zero bluish cast',
    bg: '#f4f4f5',
    card: '#ffffff',
    border: '#e4e4e7',
    foreground: '#18181b',
    secondary: '#f0f0f2',
    muted: '#f4f4f5',
    mutedForeground: '#71717a',
  },
  {
    id: 'warm-cream',
    name: 'Warm Cream / Sand',
    badge: 'Soft Paper',
    description: 'Gentle organic paper tone, low eye strain and warm aesthetic',
    bg: '#fbf9f5',
    card: '#ffffff',
    border: '#ebe6dd',
    foreground: '#23201a',
    secondary: '#f5f0e6',
    muted: '#f6f2e9',
    mutedForeground: '#78716c',
  },
  {
    id: 'pure-snow',
    name: 'Pure Minimalist Snow',
    badge: 'High Contrast',
    description: 'Ultra-crisp high-contrast pure white surfaces',
    bg: '#fafafa',
    card: '#ffffff',
    border: '#e5e5e5',
    foreground: '#0a0a0a',
    secondary: '#f5f5f5',
    muted: '#f5f5f5',
    mutedForeground: '#737373',
  },
  {
    id: 'muted-linen',
    name: 'Natural Linen',
    badge: 'Warm Earth',
    description: 'Muted natural linen texture, artisanal boutique tone',
    bg: '#f6f5f1',
    card: '#ffffff',
    border: '#e5e3db',
    foreground: '#262420',
    secondary: '#eeece2',
    muted: '#f0eee6',
    mutedForeground: '#78716c',
  },
  {
    id: 'classic-slate',
    name: 'Classic Slate',
    badge: 'Default',
    description: 'Original cool slate with light bluish tint',
    bg: '#f8fafc',
    card: '#ffffff',
    border: '#e2e8f0',
    foreground: '#0f172a',
    secondary: '#f1f5f9',
    muted: '#f1f5f9',
    mutedForeground: '#64748b',
  },
];

export const DARK_THEME_PRESETS: SurfaceThemePreset[] = [
  {
    id: 'charcoal-zinc',
    name: 'Charcoal Zinc',
    badge: 'Zero Blue',
    description: 'True neutral deep graphite without any blue or violet tint',
    bg: '#09090b',
    card: '#18181b',
    border: '#27272a',
    foreground: '#fafafa',
    secondary: '#27272a',
    muted: '#1f1f23',
    mutedForeground: '#a1a1aa',
  },
  {
    id: 'pitch-black',
    name: 'Pitch Black OLED',
    badge: 'Pure Black',
    description: 'Absolute pure black for maximum contrast and battery life',
    bg: '#000000',
    card: '#121212',
    border: '#222222',
    foreground: '#ffffff',
    secondary: '#1a1a1a',
    muted: '#161616',
    mutedForeground: '#999999',
  },
  {
    id: 'neutral-carbon',
    name: 'Neutral Carbon',
    badge: 'Zero Blue',
    description: 'Industrial matte carbon dark gray with zero blue cast',
    bg: '#121212',
    card: '#1e1e1e',
    border: '#2d2d2d',
    foreground: '#f5f5f5',
    secondary: '#252525',
    muted: '#202020',
    mutedForeground: '#9e9e9e',
  },
  {
    id: 'warm-espresso',
    name: 'Warm Espresso',
    badge: 'Night Shift',
    description: 'Rich dark coffee tones with soft contrast for night billing',
    bg: '#141210',
    card: '#1c1917',
    border: '#292524',
    foreground: '#fafaf9',
    secondary: '#262320',
    muted: '#201d1a',
    mutedForeground: '#a8a29e',
  },
  {
    id: 'midnight-navy',
    name: 'Midnight Navy',
    badge: 'Default',
    description: 'Original deep navy and twilight blue dark theme',
    bg: '#0a0e17',
    card: '#111827',
    border: '#1f293d',
    foreground: '#f8fafc',
    secondary: '#1a2234',
    muted: '#172033',
    mutedForeground: '#94a3b8',
  },
];

export interface FontPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  cssValue: string;
}

export const FONT_PRESETS: FontPreset[] = [
  {
    id: 'Plus Jakarta Sans',
    name: 'Plus Jakarta Sans',
    category: 'Geometric Modern',
    description: 'Default clean geometric sans with crisp counterforms',
    cssValue: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  {
    id: 'Geist',
    name: 'Geist Sans',
    category: 'Engineering Clean',
    description: 'Vercel-inspired ultra-clean grotesque for dense interfaces',
    cssValue: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  {
    id: 'Outfit',
    name: 'Outfit',
    category: 'Contemporary Display',
    description: 'Open, balanced geometric letterforms for touch displays',
    cssValue: '"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  {
    id: 'Space Grotesk',
    name: 'Space Grotesk',
    category: 'Editorial Tech',
    description: 'Distinctive proportional grotesque with technical charm',
    cssValue: '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  {
    id: 'DM Sans',
    name: 'DM Sans',
    category: 'High Legibility',
    description: 'Low-fatigue readability optimized for high-volume POS',
    cssValue: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  {
    id: 'JetBrains Mono',
    name: 'JetBrains Mono',
    category: 'Terminal Precision',
    description: 'Monospaced developer aesthetic with tabular numbers',
    cssValue: '"JetBrains Mono", ui-monospace, Menlo, Monaco, Consolas, monospace',
  },
  {
    id: 'System Native',
    name: 'System Native',
    category: 'Zero Latency',
    description: 'Instantaneous native operating system font stack',
    cssValue: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (clean.length === 6) {
    return {
      r: parseInt(clean.substring(0, 2), 16),
      g: parseInt(clean.substring(2, 4), 16),
      b: parseInt(clean.substring(4, 6), 16),
    };
  }
  return null;
}

export function getForegroundForColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  // Standard relative luminance (WCAG YIQ)
  const yiq = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return yiq >= 165 ? '#0f172a' : '#ffffff';
}

function createCustomSurfaceTheme(bgHex: string, isDark: boolean): SurfaceThemePreset {
  const cleanBg = bgHex.startsWith('#') ? bgHex : `#${bgHex}`;
  const rgb = hexToRgb(cleanBg) || (isDark ? { r: 10, g: 10, b: 10 } : { r: 244, g: 244, b: 245 });

  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

  if (isDark) {
    const cardR = clamp(rgb.r + 14);
    const cardG = clamp(rgb.g + 14);
    const cardB = clamp(rgb.b + 14);
    const cardHex = `#${cardR.toString(16).padStart(2, '0')}${cardG.toString(16).padStart(2, '0')}${cardB.toString(16).padStart(2, '0')}`;

    const borderR = clamp(rgb.r + 28);
    const borderG = clamp(rgb.g + 28);
    const borderB = clamp(rgb.b + 28);
    const borderHex = `#${borderR.toString(16).padStart(2, '0')}${borderG.toString(16).padStart(2, '0')}${borderB.toString(16).padStart(2, '0')}`;

    return {
      id: cleanBg,
      name: `Custom Dark (${cleanBg.toUpperCase()})`,
      badge: 'Custom',
      description: 'Admin custom calibrated dark surface',
      bg: cleanBg,
      card: cardHex,
      border: borderHex,
      foreground: '#fafafa',
      secondary: cardHex,
      muted: cardHex,
      mutedForeground: '#a1a1aa',
    };
  } else {
    const borderR = clamp(rgb.r - 20);
    const borderG = clamp(rgb.g - 20);
    const borderB = clamp(rgb.b - 20);
    const borderHex = `#${borderR.toString(16).padStart(2, '0')}${borderG.toString(16).padStart(2, '0')}${borderB.toString(16).padStart(2, '0')}`;

    return {
      id: cleanBg,
      name: `Custom Light (${cleanBg.toUpperCase()})`,
      badge: 'Custom',
      description: 'Admin custom calibrated light surface',
      bg: cleanBg,
      card: '#ffffff',
      border: borderHex,
      foreground: '#18181b',
      secondary: cleanBg,
      muted: cleanBg,
      mutedForeground: '#71717a',
    };
  }
}

function resolveSurfacePreset(idOrHex: string, isDark: boolean): SurfaceThemePreset {
  const presets = isDark ? DARK_THEME_PRESETS : LIGHT_THEME_PRESETS;
  const found = presets.find(p => p.id === idOrHex || p.bg.toLowerCase() === idOrHex.toLowerCase());
  if (found) return found;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(idOrHex.trim())) {
    return createCustomSurfaceTheme(idOrHex.trim(), isDark);
  }
  return presets[0];
}

function applyThemeBases(lightIdOrHex: string, darkIdOrHex: string) {
  if (typeof document === 'undefined') return;
  const light = resolveSurfacePreset(lightIdOrHex, false);
  const dark = resolveSurfacePreset(darkIdOrHex, true);

  let styleTag = document.getElementById('nafid-custom-themes') as HTMLStyleElement | null;
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'nafid-custom-themes';
    document.head.appendChild(styleTag);
  }

  styleTag.textContent = `
    :root {
      --background: ${light.bg};
      --color-background: ${light.bg};
      --card: ${light.card};
      --color-card: ${light.card};
      --border: ${light.border};
      --color-border: ${light.border};
      --input: ${light.border};
      --color-input: ${light.border};
      --foreground: ${light.foreground};
      --color-foreground: ${light.foreground};
      --card-foreground: ${light.foreground};
      --color-card-foreground: ${light.foreground};
      --secondary: ${light.secondary};
      --color-secondary: ${light.secondary};
      --secondary-foreground: ${light.foreground};
      --color-secondary-foreground: ${light.foreground};
      --muted: ${light.muted};
      --color-muted: ${light.muted};
      --muted-foreground: ${light.mutedForeground};
      --color-muted-foreground: ${light.mutedForeground};
    }
    .dark {
      --background: ${dark.bg};
      --color-background: ${dark.bg};
      --card: ${dark.card};
      --color-card: ${dark.card};
      --border: ${dark.border};
      --color-border: ${dark.border};
      --input: ${dark.border};
      --color-input: ${dark.border};
      --foreground: ${dark.foreground};
      --color-foreground: ${dark.foreground};
      --card-foreground: ${dark.foreground};
      --color-card-foreground: ${dark.foreground};
      --secondary: ${dark.secondary};
      --color-secondary: ${dark.secondary};
      --secondary-foreground: ${dark.foreground};
      --color-secondary-foreground: ${dark.foreground};
      --muted: ${dark.muted};
      --color-muted: ${dark.muted};
      --muted-foreground: ${dark.mutedForeground};
      --color-muted-foreground: ${dark.mutedForeground};
    }
  `;

  // Immediately apply current active mode properties to document.documentElement inline style
  const isDark = document.documentElement.classList.contains('dark');
  const active = isDark ? dark : light;
  document.documentElement.style.setProperty('--background', active.bg);
  document.documentElement.style.setProperty('--card', active.card);
  document.documentElement.style.setProperty('--border', active.border);
  document.documentElement.style.setProperty('--input', active.border);
  document.documentElement.style.setProperty('--foreground', active.foreground);
  document.documentElement.style.setProperty('--card-foreground', active.foreground);
  document.documentElement.style.setProperty('--secondary', active.secondary);
  document.documentElement.style.setProperty('--muted', active.muted);
}

function applyFontScale(scale: number) {
  if (typeof document === 'undefined') return;
  const factor = scale / 100;
  document.documentElement.style.setProperty('--font-scale', factor.toString());
}

function applyPrimaryColor(colorHex: string) {
  if (typeof document === 'undefined') return;
  const cleanHex = colorHex.startsWith('#') ? colorHex : `#${colorHex}`;
  const root = document.documentElement;
  const rgb = hexToRgb(cleanHex);
  const fg = getForegroundForColor(cleanHex);

  root.style.setProperty('--primary', cleanHex);
  root.style.setProperty('--color-primary', cleanHex);
  root.style.setProperty('--primary-foreground', fg);
  root.style.setProperty('--color-primary-foreground', fg);
  root.style.setProperty('--ring', cleanHex);
  root.style.setProperty('--color-ring', cleanHex);

  if (rgb) {
    root.style.setProperty('--input-focus-ring', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`);
  }
}

function applyFontFamily(fontIdOrCss: string) {
  if (typeof document === 'undefined') return;
  const preset = FONT_PRESETS.find(f => f.id === fontIdOrCss || f.name === fontIdOrCss);
  const cssValue = preset ? preset.cssValue : fontIdOrCss;

  const root = document.documentElement;
  root.style.setProperty('--app-font-family', cssValue);
  root.style.setProperty('--font-sans', cssValue);
  if (document.body) {
    document.body.style.fontFamily = cssValue;
  }
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
  } catch { /* ignore */ }
  return DEFAULT_FONT_SCALE;
}

function loadPrimaryColor(): string {
  try {
    const stored = localStorage.getItem(PRIMARY_COLOR_KEY);
    if (stored && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(stored.trim())) {
      return stored.trim();
    }
  } catch { /* ignore */ }
  return DEFAULT_PRIMARY_COLOR;
}

function loadFontFamily(): string {
  try {
    const stored = localStorage.getItem(FONT_FAMILY_KEY);
    if (stored && stored.trim()) {
      return stored.trim();
    }
  } catch { /* ignore */ }
  return DEFAULT_FONT_FAMILY;
}

function loadLightThemeBase(): string {
  try {
    const stored = localStorage.getItem(LIGHT_THEME_BASE_KEY);
    if (stored && stored.trim()) {
      return stored.trim();
    }
  } catch { /* ignore */ }
  return DEFAULT_LIGHT_THEME_BASE;
}

function loadDarkThemeBase(): string {
  try {
    const stored = localStorage.getItem(DARK_THEME_BASE_KEY);
    if (stored && stored.trim()) {
      return stored.trim();
    }
  } catch { /* ignore */ }
  return DEFAULT_DARK_THEME_BASE;
}

interface ThemeState {
  theme: 'light' | 'dark';
  fontScale: number;
  primaryColor: string;
  fontFamily: string;
  lightThemeBase: string;
  darkThemeBase: string;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setFontScale: (scale: number) => void;
  increaseFontScale: () => void;
  decreaseFontScale: () => void;
  setPrimaryColor: (color: string) => void;
  setFontFamily: (fontId: string) => void;
  setLightThemeBase: (presetIdOrHex: string) => void;
  setDarkThemeBase: (presetIdOrHex: string) => void;
  resetDesignDefaults: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: (localStorage.getItem('vendora-theme') as 'light' | 'dark') || 'light',
  fontScale: loadFontScale(),
  primaryColor: loadPrimaryColor(),
  fontFamily: loadFontFamily(),
  lightThemeBase: loadLightThemeBase(),
  darkThemeBase: loadDarkThemeBase(),

  setTheme: (theme) => {
    localStorage.setItem('vendora-theme', theme);
    if (typeof window !== 'undefined' && hasBridge('settingsSet')) {
      settingsApi.set({ tenant_id: 'global', key: 'vendora-theme', value: theme }).catch(() => {});
    }
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    applyThemeBases(get().lightThemeBase, get().darkThemeBase);
    set({ theme });
  },

  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('vendora-theme', newTheme);
    if (typeof window !== 'undefined' && hasBridge('settingsSet')) {
      settingsApi.set({ tenant_id: 'global', key: 'vendora-theme', value: newTheme }).catch(() => {});
    }
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(newTheme);
    applyThemeBases(state.lightThemeBase, state.darkThemeBase);
    return { theme: newTheme };
  }),

  setFontScale: (scale) => {
    const clamped = Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, scale));
    localStorage.setItem(FONT_SCALE_KEY, clamped.toString());
    if (typeof window !== 'undefined' && hasBridge('settingsSet')) {
      settingsApi.set({ tenant_id: 'global', key: FONT_SCALE_KEY, value: clamped }).catch(() => {});
    }
    applyFontScale(clamped);
    set({ fontScale: clamped });
  },

  increaseFontScale: () => {
    const current = get().fontScale;
    const next = Math.min(MAX_FONT_SCALE, current + 10);
    get().setFontScale(next);
  },

  decreaseFontScale: () => {
    const current = get().fontScale;
    const next = Math.max(MIN_FONT_SCALE, current - 10);
    get().setFontScale(next);
  },

  setPrimaryColor: (color) => {
    const clean = color.startsWith('#') ? color : `#${color}`;
    localStorage.setItem(PRIMARY_COLOR_KEY, clean);
    if (typeof window !== 'undefined' && hasBridge('settingsSet')) {
      settingsApi.set({ tenant_id: 'global', key: PRIMARY_COLOR_KEY, value: clean }).catch(() => {});
    }
    applyPrimaryColor(clean);
    set({ primaryColor: clean });
  },

  setFontFamily: (font) => {
    localStorage.setItem(FONT_FAMILY_KEY, font);
    if (typeof window !== 'undefined' && hasBridge('settingsSet')) {
      settingsApi.set({ tenant_id: 'global', key: FONT_FAMILY_KEY, value: font }).catch(() => {});
    }
    applyFontFamily(font);
    set({ fontFamily: font });
  },

  setLightThemeBase: (presetIdOrHex) => {
    const val = presetIdOrHex.trim();
    localStorage.setItem(LIGHT_THEME_BASE_KEY, val);
    if (typeof window !== 'undefined' && hasBridge('settingsSet')) {
      settingsApi.set({ tenant_id: 'global', key: LIGHT_THEME_BASE_KEY, value: val }).catch(() => {});
    }
    applyThemeBases(val, get().darkThemeBase);
    set({ lightThemeBase: val });
  },

  setDarkThemeBase: (presetIdOrHex) => {
    const val = presetIdOrHex.trim();
    localStorage.setItem(DARK_THEME_BASE_KEY, val);
    if (typeof window !== 'undefined' && hasBridge('settingsSet')) {
      settingsApi.set({ tenant_id: 'global', key: DARK_THEME_BASE_KEY, value: val }).catch(() => {});
    }
    applyThemeBases(get().lightThemeBase, val);
    set({ darkThemeBase: val });
  },

  resetDesignDefaults: () => {
    get().setPrimaryColor(DEFAULT_PRIMARY_COLOR);
    get().setFontFamily(DEFAULT_FONT_FAMILY);
    get().setFontScale(DEFAULT_FONT_SCALE);
    get().setLightThemeBase(DEFAULT_LIGHT_THEME_BASE);
    get().setDarkThemeBase(DEFAULT_DARK_THEME_BASE);
  },
}));

async function hydrateThemeFromDB() {
  if (typeof window !== 'undefined' && hasBridge('settingsGet')) {
    try {
      const storedTheme = await settingsApi.get({ tenant_id: 'global', key: 'vendora-theme' });
      if (storedTheme === 'light' || storedTheme === 'dark') {
        useThemeStore.getState().setTheme(storedTheme);
      }
      const storedScale = await settingsApi.get({ tenant_id: 'global', key: FONT_SCALE_KEY });
      if (storedScale !== null && storedScale !== undefined) {
        const val = Number(storedScale);
        if (!isNaN(val) && val >= MIN_FONT_SCALE && val <= MAX_FONT_SCALE) {
          useThemeStore.getState().setFontScale(val);
        }
      }
      const storedColor = await settingsApi.get({ tenant_id: 'global', key: PRIMARY_COLOR_KEY });
      if (storedColor && typeof storedColor === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(storedColor.trim())) {
        useThemeStore.getState().setPrimaryColor(storedColor.trim());
      }
      const storedFont = await settingsApi.get({ tenant_id: 'global', key: FONT_FAMILY_KEY });
      if (storedFont && typeof storedFont === 'string' && storedFont.trim()) {
        useThemeStore.getState().setFontFamily(storedFont.trim());
      }
      const storedLightBase = await settingsApi.get({ tenant_id: 'global', key: LIGHT_THEME_BASE_KEY });
      if (storedLightBase && typeof storedLightBase === 'string' && storedLightBase.trim()) {
        useThemeStore.getState().setLightThemeBase(storedLightBase.trim());
      }
      const storedDarkBase = await settingsApi.get({ tenant_id: 'global', key: DARK_THEME_BASE_KEY });
      if (storedDarkBase && typeof storedDarkBase === 'string' && storedDarkBase.trim()) {
        useThemeStore.getState().setDarkThemeBase(storedDarkBase.trim());
      }
    } catch (e) {
      console.warn('[themeStore] Failed to hydrate theme from DB:', e);
    }
  }
}

if (typeof window !== 'undefined') {
  setTimeout(() => {
    hydrateThemeFromDB();
  }, 100);
}

// Immediate initial application
applyFontScale(loadFontScale());
applyPrimaryColor(loadPrimaryColor());
applyFontFamily(loadFontFamily());
applyThemeBases(loadLightThemeBase(), loadDarkThemeBase());


export type DesignPreferences = Pick<ThemeState, 'theme' | 'fontScale' | 'primaryColor' | 'fontFamily' | 'lightThemeBase' | 'darkThemeBase'>;
/** Settings drafts persist fully before changing the app's theme or local cache. */
export async function saveDesignPreferences(preferences: DesignPreferences) {
  const keys: Record<keyof DesignPreferences, string> = { theme: 'vendora-theme', fontScale: FONT_SCALE_KEY, primaryColor: PRIMARY_COLOR_KEY, fontFamily: FONT_FAMILY_KEY, lightThemeBase: LIGHT_THEME_BASE_KEY, darkThemeBase: DARK_THEME_BASE_KEY };
  for (const key of Object.keys(keys) as (keyof DesignPreferences)[]) await setSetting({ tenant_id: 'global', key: keys[key], value: preferences[key] });
  for (const key of Object.keys(keys) as (keyof DesignPreferences)[]) localStorage.setItem(keys[key], String(preferences[key]));
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(preferences.theme);
  applyFontScale(preferences.fontScale); applyPrimaryColor(preferences.primaryColor); applyFontFamily(preferences.fontFamily); applyThemeBases(preferences.lightThemeBase, preferences.darkThemeBase);
  useThemeStore.setState(preferences);
}
