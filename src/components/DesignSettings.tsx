import { useState, useId } from 'react';
import {
  Palette, Type, RotateCcw, Check, Sun, Moon,
  Sliders, Eye, Tag, CreditCard, Sparkles,
  Barcode, CheckCircle2, Shield, Lock, Layers
} from 'lucide-react';
import {
  useThemeStore,
  COLOR_PRESETS,
  FONT_PRESETS,
  LIGHT_THEME_PRESETS,
  DARK_THEME_PRESETS,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SCALE,
  getForegroundForColor,
  type ColorPreset,
  type FontPreset,
  type SurfaceThemePreset
} from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import { isAdminRole } from '../utils/permissions';
import clsx from 'clsx';

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
      <div className="bg-card border border-border/80 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 max-w-2xl relative z-10">
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-2xl bg-primary text-primary-foreground shadow-sm inline-flex items-center justify-center">
              <Palette className="w-5 h-5" />
            </span>
            <span className="text-[11px] font-black tracking-widest uppercase text-primary">System Appearance Studio</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">Theme & Typography Architecture</h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed font-normal">
            Calibrate system-wide primary accents, Light & Dark theme surface base tones (replacing default white or bluish shades), and tactile typography.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 relative z-10">
          <button
            type="button"
            onClick={() => {
              resetDesignDefaults();
              setCustomHexInput(DEFAULT_PRIMARY_COLOR);
              setCustomLightBgInput('#f4f4f5');
              setCustomDarkBgInput('#09090b');
              showNotice('Design reset to default');
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold text-muted-foreground hover:text-foreground bg-background border border-border hover:border-border/80 shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold text-foreground bg-secondary/80 hover:bg-secondary border border-border/60 shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span>Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-500" />
                <span>Dark Mode</span>
              </>
            )}
          </button>
        </div>

        {/* Ambient subtle background glow */}
        <div
          className="absolute -right-24 -bottom-24 w-72 h-72 rounded-full blur-3xl opacity-15 pointer-events-none transition-colors duration-500"
          style={{ backgroundColor: primaryColor }}
        />
      </div>

      {copiedNotification && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-foreground text-background text-xs font-bold shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{copiedNotification}</span>
        </div>
      )}

      {/* ─── LIVE POS SIMULATION BENTO (Tactile Feedback & Real-Time Validation) ─── */}
      <div className="bg-card border border-border/80 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-xl bg-primary/10 text-primary">
              <Eye className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-black text-foreground uppercase tracking-wider">Live POS Component Simulation</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Real-time simulation of POS buttons, badges, inputs, and INR currency typography</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active:</span>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 font-mono">
              {activePreset ? activePreset.name : 'Custom'} ({primaryColor})
            </span>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-secondary text-secondary-foreground border border-border/80">
              {theme === 'dark' ? (activeDarkPreset ? activeDarkPreset.name : 'Custom Dark') : (activeLightPreset ? activeLightPreset.name : 'Custom Light')}
            </span>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-secondary text-secondary-foreground border border-border/80">
              {activeFontPreset.name}
            </span>
          </div>
        </div>

        {/* Simulation Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Tile A: Checkout Button Simulation */}
          <div className="bg-background border border-border/60 rounded-2xl p-5 space-y-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">Action Element</span>
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            </div>
            <div className="space-y-2">
              <button
                type="button"
                className="w-full py-3 px-4 rounded-xl font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.98] cursor-pointer"
                style={{
                  backgroundColor: primaryColor,
                  color: getForegroundForColor(primaryColor),
                }}
              >
                <CreditCard className="w-4 h-4" />
                <span>Complete Checkout</span>
              </button>
              <p className="text-[10px] text-muted-foreground text-center font-medium">Click to test tactile responsiveness</p>
            </div>
            <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
              <span>Text Contrast</span>
              <span className="font-bold">{getForegroundForColor(primaryColor) === '#ffffff' ? 'Light on Dark' : 'Dark on Light'}</span>
            </div>
          </div>

          {/* Tile B: Badges & Tags Simulation */}
          <div className="bg-background border border-border/60 rounded-2xl p-5 space-y-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">Metadata Tags</span>
              <Tag className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                Invoice #1048
              </span>
              <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Paid in Full
              </span>
              <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-secondary text-secondary-foreground border border-border">
                GST 18%
              </span>
            </div>
            <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Dynamic Alpha Tint</span>
              <span className="font-mono font-bold text-primary">bg-primary/10</span>
            </div>
          </div>

          {/* Tile C: Input & Focus Ring Simulation */}
          <div className="bg-background border border-border/60 rounded-2xl p-5 space-y-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">Touch Input Field</span>
              <Barcode className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Scan barcode or type item..."
                  defaultValue="8901030382910"
                  className="w-full h-10 px-3.5 rounded-xl text-xs font-medium bg-card border border-border text-foreground transition-all duration-200 outline-none"
                  style={{
                    borderColor: primaryColor,
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground font-medium">Border & focus ring dynamically match theme</p>
            </div>
            <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
              <span>Focus Ring</span>
              <span className="font-bold">{primaryColor}</span>
            </div>
          </div>
        </div>

        {/* Live Typographic Sample Strip (INR Currency) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-muted/30 border border-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Typography & Currency Render ({activeFontPreset.name})</span>
            <p className="text-base sm:text-lg font-bold text-foreground leading-snug">
              Nafid Retail Point-of-Sale System • Daily Revenue INR 14,892.50
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-2xl font-black font-mono text-primary tabular-nums">INR 1,489.50</span>
            <p className="text-[10px] text-muted-foreground">Tabular numeric currency alignment</p>
          </div>
        </div>
      </div>

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
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-foreground">Light Theme Surface (Non-Bluish / Neutral / Warm)</h3>
            </div>
            <span className="text-xs font-mono text-muted-foreground font-bold">
              Active: {activeLightPreset ? activeLightPreset.name : 'Custom'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {LIGHT_THEME_PRESETS.map((preset: SurfaceThemePreset) => {
              const isSelected = lightThemeBase.toLowerCase() === preset.id.toLowerCase() || lightThemeBase.toLowerCase() === preset.bg.toLowerCase();

              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => {
                    setLightThemeBase(preset.id);
                    setCustomLightBgInput(preset.bg);
                    showNotice(`Light theme base set to ${preset.name}`);
                  }}
                  className={clsx(
                    "p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 group active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70",
                    isSelected
                      ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/30"
                      : "bg-background border-border/70 hover:border-border hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Dual Swatch (Bg + Card) */}
                    <div className="w-10 h-10 rounded-xl border border-black/10 dark:border-white/10 shrink-0 p-1 flex flex-col justify-between shadow-xs" style={{ backgroundColor: preset.bg }}>
                      <div className="w-full h-3.5 rounded border border-black/5" style={{ backgroundColor: preset.card }} />
                      <div className="w-full h-2 rounded bg-black/10" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground truncate">{preset.name}</span>
                        <span className="text-[9px] font-semibold text-muted-foreground/80 px-1.5 py-0.2 rounded bg-muted border border-border/40">
                          {preset.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{preset.description}</p>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom Light Surface Hex Picker */}
          {isAdmin && (
            <div className="p-4 rounded-2xl bg-muted/20 border border-border/70 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-foreground">Custom Light Background</span>
                <p className="text-[11px] text-muted-foreground">Admin can specify any custom soft light background hex</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative shrink-0 flex items-center">
                  <label
                    htmlFor={lightBgPickerId}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border hover:border-foreground/30 shadow-xs cursor-pointer transition-all active:scale-[0.98]"
                  >
                    <div className="w-4 h-4 rounded-md border border-black/10 shrink-0" style={{ backgroundColor: isValidLightBgHex ? customLightBgInput : '#f4f4f5' }} />
                    <span className="text-xs font-bold text-foreground">Picker</span>
                  </label>
                  <input
                    id={lightBgPickerId}
                    type="color"
                    value={isValidLightBgHex ? customLightBgInput : '#f4f4f5'}
                    onChange={(e) => {
                      setCustomLightBgInput(e.target.value);
                      setLightThemeBase(e.target.value);
                    }}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer pointer-events-auto"
                  />
                </div>
                <div className="relative w-28">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-muted-foreground">#</span>
                  <input
                    type="text"
                    value={customLightBgInput.replace('#', '')}
                    maxLength={6}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^0-9a-fA-F]/g, '');
                      setCustomLightBgInput(`#${cleaned}`);
                    }}
                    className="w-full h-9 pl-6 pr-2 rounded-xl text-xs font-mono font-bold bg-card border border-border text-foreground uppercase outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleApplyCustomLightBg(customLightBgInput)}
                  disabled={!isValidLightBgHex}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-foreground text-background hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer shrink-0"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Subsection B: Dark Theme Base Colors */}
        <div className="space-y-4 pt-4 border-t border-border/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-bold text-foreground">Dark Theme Surface (Non-Bluish / Charcoal / Pure Black)</h3>
            </div>
            <span className="text-xs font-mono text-muted-foreground font-bold">
              Active: {activeDarkPreset ? activeDarkPreset.name : 'Custom'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {DARK_THEME_PRESETS.map((preset: SurfaceThemePreset) => {
              const isSelected = darkThemeBase.toLowerCase() === preset.id.toLowerCase() || darkThemeBase.toLowerCase() === preset.bg.toLowerCase();

              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => {
                    setDarkThemeBase(preset.id);
                    setCustomDarkBgInput(preset.bg);
                    showNotice(`Dark theme base set to ${preset.name}`);
                  }}
                  className={clsx(
                    "p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 group active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70",
                    isSelected
                      ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/30"
                      : "bg-background border-border/70 hover:border-border hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Dual Swatch (Bg + Card) */}
                    <div className="w-10 h-10 rounded-xl border border-white/10 shrink-0 p-1 flex flex-col justify-between shadow-xs" style={{ backgroundColor: preset.bg }}>
                      <div className="w-full h-3.5 rounded border border-white/10" style={{ backgroundColor: preset.card }} />
                      <div className="w-full h-2 rounded bg-white/10" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground truncate">{preset.name}</span>
                        <span className="text-[9px] font-semibold text-muted-foreground/80 px-1.5 py-0.2 rounded bg-muted border border-border/40">
                          {preset.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{preset.description}</p>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom Dark Surface Hex Picker */}
          {isAdmin && (
            <div className="p-4 rounded-2xl bg-muted/20 border border-border/70 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-foreground">Custom Dark Background</span>
                <p className="text-[11px] text-muted-foreground">Admin can specify any custom deep dark background hex</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative shrink-0 flex items-center">
                  <label
                    htmlFor={darkBgPickerId}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border hover:border-foreground/30 shadow-xs cursor-pointer transition-all active:scale-[0.98]"
                  >
                    <div className="w-4 h-4 rounded-md border border-white/10 shrink-0" style={{ backgroundColor: isValidDarkBgHex ? customDarkBgInput : '#09090b' }} />
                    <span className="text-xs font-bold text-foreground">Picker</span>
                  </label>
                  <input
                    id={darkBgPickerId}
                    type="color"
                    value={isValidDarkBgHex ? customDarkBgInput : '#09090b'}
                    onChange={(e) => {
                      setCustomDarkBgInput(e.target.value);
                      setDarkThemeBase(e.target.value);
                    }}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer pointer-events-auto"
                  />
                </div>
                <div className="relative w-28">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-muted-foreground">#</span>
                  <input
                    type="text"
                    value={customDarkBgInput.replace('#', '')}
                    maxLength={6}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^0-9a-fA-F]/g, '');
                      setCustomDarkBgInput(`#${cleaned}`);
                    }}
                    className="w-full h-9 pl-6 pr-2 rounded-xl text-xs font-mono font-bold bg-card border border-border text-foreground uppercase outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleApplyCustomDarkBg(customDarkBgInput)}
                  disabled={!isValidDarkBgHex}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-foreground text-background hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer shrink-0"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── SECTION 2: BRAND ACCENT COLOR ENGINE ─── */}
      <div className="bg-card border border-border/80 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-primary uppercase tracking-widest">Section 2</span>
              <span className="text-xs text-muted-foreground/40">•</span>
              <span className="text-xs font-bold text-muted-foreground">Accent Engine</span>
            </div>
            <h2 className="text-lg font-black text-foreground mt-0.5">Primary Brand Accent Color</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select a calibrated commercial palette or input a custom brand hex code.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs text-muted-foreground font-mono">Hex:</span>
            <span className="px-3 py-1 rounded-xl bg-background border border-border font-mono font-bold text-xs text-foreground">
              {primaryColor.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Preset Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {COLOR_PRESETS.map((preset: ColorPreset) => {
            const isSelected = primaryColor.toLowerCase() === preset.hex.toLowerCase();
            const fg = getForegroundForColor(preset.hex);

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setPrimaryColor(preset.hex);
                  setCustomHexInput(preset.hex);
                  showNotice(`Applied ${preset.name}`);
                }}
                className={clsx(
                  "p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 group active:scale-[0.98]",
                  isSelected
                    ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/30"
                    : "bg-background border-border/70 hover:border-border hover:bg-muted/30"
                )}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl shadow-xs shrink-0 flex items-center justify-center transition-transform group-hover:scale-105"
                    style={{ backgroundColor: preset.hex, color: fg }}
                  >
                    {isSelected && <Check className="w-5 h-5 stroke-[2.5]" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-foreground truncate">{preset.name}</span>
                      <span className="text-[9px] font-semibold text-muted-foreground/75 px-1.5 py-0.2 rounded bg-muted">
                        {preset.category}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{preset.description}</p>
                  </div>
                </div>

                <span className="text-[11px] font-mono font-bold text-muted-foreground shrink-0 uppercase">
                  {preset.hex}
                </span>
              </button>
            );
          })}
        </div>

        {/* Custom Hex Color Picker Card */}
        <div className="p-5 rounded-2xl bg-muted/20 border border-border/70 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-foreground">Custom Brand Hex Color</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Exact brand matching for franchises and bespoke store identities
              </p>
            </div>
            {isCustomPrimary && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                Custom Color Active
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
            <div className="relative shrink-0 flex items-center">
              <label
                htmlFor={primaryPickerId}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-border hover:border-foreground/30 shadow-xs cursor-pointer transition-all active:scale-[0.98]"
              >
                <div
                  className="w-5 h-5 rounded-lg border border-black/10 dark:border-white/10 shrink-0 shadow-inner"
                  style={{ backgroundColor: isValidPrimaryHex ? customHexInput : primaryColor }}
                />
                <span className="text-xs font-bold text-foreground">Pick Swatch</span>
              </label>
              <input
                id={primaryPickerId}
                type="color"
                value={isValidPrimaryHex ? customHexInput : primaryColor}
                onChange={(e) => {
                  setCustomHexInput(e.target.value);
                  setPrimaryColor(e.target.value);
                }}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer pointer-events-auto"
              />
            </div>

            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-muted-foreground">#</span>
              <input
                type="text"
                value={customHexInput.replace('#', '')}
                maxLength={6}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9a-fA-F]/g, '');
                  setCustomHexInput(`#${cleaned}`);
                }}
                placeholder="2563EB"
                className="w-full h-10 pl-7 pr-4 rounded-xl text-xs font-mono font-bold bg-card border border-border text-foreground outline-none focus:border-primary transition-all uppercase"
              />
            </div>

            <button
              type="button"
              onClick={() => handleApplyCustomPrimary(customHexInput)}
              disabled={!isValidPrimaryHex || customHexInput.toLowerCase() === primaryColor.toLowerCase()}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-primary-foreground bg-primary hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98] cursor-pointer shadow-xs shrink-0"
              style={{
                backgroundColor: isValidPrimaryHex ? customHexInput : undefined,
                color: isValidPrimaryHex ? getForegroundForColor(customHexInput) : undefined,
              }}
            >
              Apply Color
            </button>
          </div>
        </div>
      </div>

      {/* ─── SECTION 3: TYPOGRAPHY ENGINE ─── */}
      <div className="bg-card border border-border/80 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-primary uppercase tracking-widest">Section 3</span>
              <span className="text-xs text-muted-foreground/40">•</span>
              <span className="text-xs font-bold text-muted-foreground">Typography Engine</span>
            </div>
            <h2 className="text-lg font-black text-foreground mt-0.5">Interface Font Stack</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select geometric grotesques and technical typefaces calibrated for readability on billing screens.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs text-muted-foreground">Active:</span>
            <span className="px-3 py-1 rounded-xl bg-background border border-border font-bold text-xs text-foreground">
              {activeFontPreset.name}
            </span>
          </div>
        </div>

        {/* Font Presets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FONT_PRESETS.map((preset: FontPreset) => {
            const isSelected = fontFamily === preset.id || fontFamily === preset.name;

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setFontFamily(preset.id);
                  showNotice(`Font set to ${preset.name}`);
                }}
                className={clsx(
                  "p-5 rounded-2xl border text-left transition-all duration-200 cursor-pointer space-y-3 active:scale-[0.98]",
                  isSelected
                    ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/30"
                    : "bg-background border-border/70 hover:border-border hover:bg-muted/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-black text-foreground tracking-tight">{preset.name}</span>
                    <span className="text-[10px] font-bold text-muted-foreground/80 px-2 py-0.5 rounded-full bg-muted border border-border/40">
                      {preset.category}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </span>
                  )}
                </div>

                {/* Sample Line rendered directly in that font */}
                <div
                  className="p-3 rounded-xl bg-card border border-border/50 text-foreground"
                  style={{ fontFamily: preset.cssValue }}
                >
                  <p className="text-sm font-semibold leading-normal">
                    The quick brown fox jumps over the lazy dog.
                  </p>
                  <p className="text-xs font-mono font-bold text-primary mt-1">
                    INR 4,890.00 • 890103000213 • #1042
                  </p>
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── SECTION 4: UI READING DENSITY & SCALE ─── */}
      <div className="bg-card border border-border/80 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-primary uppercase tracking-widest">Section 4</span>
              <span className="text-xs text-muted-foreground/40">•</span>
              <span className="text-xs font-bold text-muted-foreground">Density & Accessibility</span>
            </div>
            <h2 className="text-lg font-black text-foreground mt-0.5">UI Scale & Touchscreen Density</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Adjust global interface scaling to optimize for POS touchscreens, tablets, or compact monitors.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <span className="text-2xl font-black font-mono text-foreground">{fontScale}%</span>
            <span className={clsx(
              "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
              fontScale <= 85 ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
              fontScale <= 105 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
              fontScale <= 120 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
              "bg-red-500/10 text-red-600 dark:text-red-400"
            )}>
              {fontScale <= 85 ? 'Compact' : fontScale <= 105 ? 'Standard' : fontScale <= 120 ? 'Comfort' : 'Maximum'}
            </span>
          </div>
        </div>

        {/* Stepper & Slider Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={decreaseFontScale}
                disabled={fontScale <= 70}
                className="w-11 h-11 rounded-2xl bg-background border border-border flex items-center justify-center text-foreground hover:bg-muted transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-xs"
              >
                <span className="text-lg font-bold">−</span>
              </button>

              <input
                type="range"
                min={70}
                max={140}
                step={5}
                value={fontScale}
                onChange={(e) => setFontScale(parseInt(e.target.value, 10))}
                className="flex-1 accent-primary h-2 bg-muted rounded-lg cursor-pointer"
              />

              <button
                type="button"
                onClick={increaseFontScale}
                disabled={fontScale >= 140}
                className="w-11 h-11 rounded-2xl bg-background border border-border flex items-center justify-center text-foreground hover:bg-muted transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-xs"
              >
                <span className="text-lg font-bold">+</span>
              </button>
            </div>

            {/* Quick Step Buttons */}
            <div className="grid grid-cols-6 gap-2">
              {scalePresets.map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setFontScale(sc)}
                  className={clsx(
                    "py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border active:scale-95",
                    fontScale === sc
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {sc}%
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Density Preview */}
          <div className="p-5 rounded-2xl bg-muted/20 border border-border/60 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
              <span>Dynamic Scale Preview</span>
              <span className="font-mono">{fontScale}% Actual</span>
            </div>
            <p className="text-sm font-semibold text-foreground leading-snug">
              Receipts, touch cart lists, invoice tables, and product search results scale harmoniously with this setting.
            </p>
            <p className="text-[11px] text-muted-foreground font-mono">
              Sample Barcode: 8901234567890 • Quantity: 4 • Price: INR 25.00
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
