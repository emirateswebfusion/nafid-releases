import React from 'react';
import { Moon, Check } from 'lucide-react';
import { DARK_THEME_PRESETS, type SurfaceThemePreset } from '../../../store/themeStore';
import clsx from 'clsx';

export interface DarkThemeBaseColorsProps {
  activeDarkPreset: SurfaceThemePreset | undefined;
  customDarkBgInput: string;
  darkBgPickerId: string;
  darkThemeBase: string;
  handleApplyCustomDarkBg: (hex: string) => void;
  isAdmin: boolean;
  isValidDarkBgHex: boolean;
  setCustomDarkBgInput: React.Dispatch<React.SetStateAction<string>>;
  setDarkThemeBase: (presetIdOrHex: string) => void;
  showNotice: (msg: string) => void;
}

/** Dark theme surface presets and (admin) custom dark background. */
export function DarkThemeBaseColors({
  activeDarkPreset, customDarkBgInput, darkBgPickerId, darkThemeBase, handleApplyCustomDarkBg, isAdmin,
  isValidDarkBgHex, setCustomDarkBgInput, setDarkThemeBase, showNotice,
}: DarkThemeBaseColorsProps) {
  return (
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
  );
}
