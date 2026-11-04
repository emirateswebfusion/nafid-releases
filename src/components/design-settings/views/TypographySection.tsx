import { FONT_PRESETS, type FontPreset } from '../../../store/themeStore';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { getSampleBarcode } from '../../../utils/localization/storeProfile';
import { formatCurrency } from '../../../utils/pricing/money';

export interface TypographySectionProps {
  activeFontPreset: FontPreset;
  fontFamily: string;
  setFontFamily: (fontId: string) => void;
  showNotice: (msg: string) => void;
}

/** Section 3: font family presets. */
export function TypographySection({
  activeFontPreset, fontFamily, setFontFamily, showNotice,
}: TypographySectionProps) {
  return (
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
                  {formatCurrency(4890)} • {getSampleBarcode()} • #1042
                </p>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">{preset.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
