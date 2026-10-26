import React from 'react';
import { COLOR_PRESETS, type ColorPreset, getForegroundForColor } from '../../../store/themeStore';
import clsx from 'clsx';
import { Check } from 'lucide-react';

export interface BrandAccentSectionProps {
  customHexInput: string;
  handleApplyCustomPrimary: (hex: string) => void;
  isCustomPrimary: boolean;
  isValidPrimaryHex: boolean;
  primaryColor: string;
  primaryPickerId: string;
  setCustomHexInput: React.Dispatch<React.SetStateAction<string>>;
  setPrimaryColor: (color: string) => void;
  showNotice: (msg: string) => void;
}

/** Section 2: brand accent colour presets and the custom primary colour. */
export function BrandAccentSection({
  customHexInput, handleApplyCustomPrimary, isCustomPrimary, isValidPrimaryHex, primaryColor, primaryPickerId,
  setCustomHexInput, setPrimaryColor, showNotice,
}: BrandAccentSectionProps) {
  return (
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
  );
}
