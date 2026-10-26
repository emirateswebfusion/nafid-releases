import { Eye, CreditCard, Tag, Barcode } from 'lucide-react';
import { getForegroundForColor } from '../../../store/themeStore';
import type { ColorPreset, SurfaceThemePreset, FontPreset } from '../../../store/themeStore';

export interface LivePosPreviewProps {
  activeDarkPreset: SurfaceThemePreset | undefined;
  activeFontPreset: FontPreset;
  activeLightPreset: SurfaceThemePreset | undefined;
  activePreset: ColorPreset | undefined;
  primaryColor: string;
  theme: "light" | "dark";
}

/** Live POS simulation preview of the current theme, colours and font. */
export function LivePosPreview({
  activeDarkPreset, activeFontPreset, activeLightPreset, activePreset, primaryColor, theme,
}: LivePosPreviewProps) {
  return (
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
  );
}
