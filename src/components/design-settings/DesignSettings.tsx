import { useState, useId } from 'react';
import { CheckCircle2, Shield, Lock } from 'lucide-react';
import { useThemeStore, COLOR_PRESETS, FONT_PRESETS, LIGHT_THEME_PRESETS, DARK_THEME_PRESETS } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { isAdminRole } from '../../utils/security/permissions';
import { DensityScaleSection } from './views/DensityScaleSection';
import { TypographySection } from './views/TypographySection';
import { BrandAccentSection } from './views/BrandAccentSection';
import { DarkThemeBaseColors } from './views/DarkThemeBaseColors';
import { LightThemeBaseColors } from './views/LightThemeBaseColors';
import { LivePosPreview } from './views/LivePosPreview';
import { DesignStudioHero } from './views/DesignStudioHero';

export function DesignSettings() {
  const {
    theme,
    toggleTheme,
    fontScale,
    setFontScale,
    increaseFontScale,
    decreaseFontScale,
    primaryColor,
    setPrimaryColor,
    fontFamily,
    setFontFamily,
    lightThemeBase,
    setLightThemeBase,
    darkThemeBase,
    setDarkThemeBase,
    resetDesignDefaults,
  } = useThemeStore();

  const { role } = useAuthStore();
  const isAdmin = isAdminRole(role);

  const [customHexInput, setCustomHexInput] = useState(primaryColor);
  const [customLightBgInput, setCustomLightBgInput] = useState(
    lightThemeBase.startsWith('#') ? lightThemeBase : '#f4f4f5'
  );
  const [customDarkBgInput, setCustomDarkBgInput] = useState(
    darkThemeBase.startsWith('#') ? darkThemeBase : '#09090b'
  );
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  const primaryPickerId = useId();
  const lightBgPickerId = useId();
  const darkBgPickerId = useId();

  const isCustomPrimary = !COLOR_PRESETS.some(p => p.hex.toLowerCase() === primaryColor.toLowerCase());
  const isValidPrimaryHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(customHexInput.trim());

  const isValidLightBgHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(customLightBgInput.trim());
  const isValidDarkBgHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(customDarkBgInput.trim());

  const showNotice = (msg: string) => {
    setCopiedNotification(msg);
    setTimeout(() => setCopiedNotification(null), 2500);
  };

  const handleApplyCustomPrimary = (hex: string) => {
    let clean = hex.trim();
    if (!clean.startsWith('#')) clean = `#${clean}`;
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(clean)) {
      setPrimaryColor(clean);
      setCustomHexInput(clean);
      showNotice('Custom accent color applied');
    }
  };

  const handleApplyCustomLightBg = (hex: string) => {
    let clean = hex.trim();
    if (!clean.startsWith('#')) clean = `#${clean}`;
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(clean)) {
      setLightThemeBase(clean);
      setCustomLightBgInput(clean);
      showNotice('Custom light surface applied');
    }
  };

  const handleApplyCustomDarkBg = (hex: string) => {
    let clean = hex.trim();
    if (!clean.startsWith('#')) clean = `#${clean}`;
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(clean)) {
      setDarkThemeBase(clean);
      setCustomDarkBgInput(clean);
      showNotice('Custom dark surface applied');
    }
  };

  const activePreset = COLOR_PRESETS.find(p => p.hex.toLowerCase() === primaryColor.toLowerCase());
  const activeFontPreset = FONT_PRESETS.find(f => f.id === fontFamily || f.name === fontFamily) || FONT_PRESETS[0];

  const activeLightPreset = LIGHT_THEME_PRESETS.find(p => p.id === lightThemeBase || p.bg.toLowerCase() === lightThemeBase.toLowerCase());
  const activeDarkPreset = DARK_THEME_PRESETS.find(p => p.id === darkThemeBase || p.bg.toLowerCase() === darkThemeBase.toLowerCase());

  const scalePresets = [80, 90, 100, 110, 120, 130];
  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12 animate-in fade-in duration-300">

      {/* ─── STUDIO HERO BANNER ─── */}
      <DesignStudioHero
        primaryColor={primaryColor} resetDesignDefaults={resetDesignDefaults}
        setCustomDarkBgInput={setCustomDarkBgInput} setCustomHexInput={setCustomHexInput}
        setCustomLightBgInput={setCustomLightBgInput} showNotice={showNotice} theme={theme} toggleTheme={toggleTheme}
      />

      {copiedNotification && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-foreground text-background text-xs font-bold shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{copiedNotification}</span>
        </div>
      )}

      {/* ─── LIVE POS SIMULATION BENTO (Tactile Feedback & Real-Time Validation) ─── */}
      <LivePosPreview
        activeDarkPreset={activeDarkPreset} activeFontPreset={activeFontPreset} activeLightPreset={activeLightPreset}
        activePreset={activePreset} primaryColor={primaryColor} theme={theme}
      />

      {/* ─── SECTION 1: ADMIN SURFACE BASE CALIBRATION (LIGHT & DARK THEMES) ─── */}
      <div className="bg-card border border-border/80 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-primary uppercase tracking-widest">Section 1</span>
              <span className="text-xs text-muted-foreground/40">•</span>
              <span className="text-xs font-bold text-muted-foreground">Admin Surface Calibration</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                ADMIN CONTROL
              </span>
            </div>
            <h2 className="text-lg font-black text-foreground mt-0.5">Light & Dark Theme Surface Base Tones</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Admin can set base surface colors for Light and Dark modes instead of default white or bluish/navy tones.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {isAdmin ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20">
                <Shield className="w-3.5 h-3.5" />
                <span>Admin Unlocked</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-muted text-muted-foreground text-xs font-bold border border-border">
                <Lock className="w-3.5 h-3.5" />
                <span>Managed by Admin</span>
              </span>
            )}
          </div>
        </div>

        {/* Subsection A: Light Theme Base Colors */}
        <LightThemeBaseColors
          activeLightPreset={activeLightPreset} customLightBgInput={customLightBgInput}
          handleApplyCustomLightBg={handleApplyCustomLightBg} isAdmin={isAdmin} isValidLightBgHex={isValidLightBgHex}
          lightBgPickerId={lightBgPickerId} lightThemeBase={lightThemeBase}
          setCustomLightBgInput={setCustomLightBgInput} setLightThemeBase={setLightThemeBase} showNotice={showNotice}
        />

        {/* Subsection B: Dark Theme Base Colors */}
        <DarkThemeBaseColors
          activeDarkPreset={activeDarkPreset} customDarkBgInput={customDarkBgInput} darkBgPickerId={darkBgPickerId}
          darkThemeBase={darkThemeBase} handleApplyCustomDarkBg={handleApplyCustomDarkBg} isAdmin={isAdmin}
          isValidDarkBgHex={isValidDarkBgHex} setCustomDarkBgInput={setCustomDarkBgInput}
          setDarkThemeBase={setDarkThemeBase} showNotice={showNotice}
        />
      </div>

      {/* ─── SECTION 2: BRAND ACCENT COLOR ENGINE ─── */}
      <BrandAccentSection
        customHexInput={customHexInput} handleApplyCustomPrimary={handleApplyCustomPrimary}
        isCustomPrimary={isCustomPrimary} isValidPrimaryHex={isValidPrimaryHex} primaryColor={primaryColor}
        primaryPickerId={primaryPickerId} setCustomHexInput={setCustomHexInput} setPrimaryColor={setPrimaryColor}
        showNotice={showNotice}
      />

      {/* ─── SECTION 3: TYPOGRAPHY ENGINE ─── */}
      <TypographySection
        activeFontPreset={activeFontPreset} fontFamily={fontFamily} setFontFamily={setFontFamily}
        showNotice={showNotice}
      />

      {/* ─── SECTION 4: UI READING DENSITY & SCALE ─── */}
      <DensityScaleSection
        decreaseFontScale={decreaseFontScale} fontScale={fontScale} increaseFontScale={increaseFontScale}
        scalePresets={scalePresets} setFontScale={setFontScale}
      />

    </div>
  );
}
