import clsx from 'clsx';

export interface DensityScaleSectionProps {
  decreaseFontScale: () => void;
  fontScale: number;
  increaseFontScale: () => void;
  scalePresets: number[];
  setFontScale: (scale: number) => void;
}

/** Section 4: UI reading density and font scale. */
export function DensityScaleSection({
  decreaseFontScale, fontScale, increaseFontScale, scalePresets, setFontScale,
}: DensityScaleSectionProps) {
  return (
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
  );
}
