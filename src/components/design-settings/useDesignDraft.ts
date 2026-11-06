import { useState } from 'react';
import { useThemeStore, saveDesignPreferences } from '../../store/themeStore';
import { useSettingsSectionSave } from '../settings/hooks/useSettingsSectionSave';
export function useDesignDraft() {
  const [draft, setDraft] = useState(() => { const s = useThemeStore.getState(); return { theme: s.theme, fontScale: s.fontScale, primaryColor: s.primaryColor, fontFamily: s.fontFamily, lightThemeBase: s.lightThemeBase, darkThemeBase: s.darkThemeBase }; });
  const [saved, setSaved] = useState(draft);
  const patch = (value: Partial<typeof draft>) => setDraft(current => ({ ...current, ...value }));
  useSettingsSectionSave(JSON.stringify(draft) !== JSON.stringify(saved), async () => {
    await saveDesignPreferences(draft);
    setSaved(draft);
  });
  return { ...draft, toggleTheme: () => patch({ theme: draft.theme === 'light' ? 'dark' : 'light' }), setFontScale: (fontScale: number) => patch({ fontScale: Math.max(70, Math.min(140, fontScale)) }), increaseFontScale: () => patch({ fontScale: Math.min(140, draft.fontScale + 10) }), decreaseFontScale: () => patch({ fontScale: Math.max(70, draft.fontScale - 10) }), setPrimaryColor: (primaryColor: string) => patch({ primaryColor }), setFontFamily: (fontFamily: string) => patch({ fontFamily }), setLightThemeBase: (lightThemeBase: string) => patch({ lightThemeBase }), setDarkThemeBase: (darkThemeBase: string) => patch({ darkThemeBase }), resetDesignDefaults: () => patch({ fontScale: 100, primaryColor: '#2563eb', fontFamily: 'Plus Jakarta Sans', lightThemeBase: 'neutral-zinc', darkThemeBase: 'charcoal-zinc' }) };
}
