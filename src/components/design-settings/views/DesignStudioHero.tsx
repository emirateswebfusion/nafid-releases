import React from 'react';
import { Palette, RotateCcw, Sun, Moon } from 'lucide-react';
import { DEFAULT_PRIMARY_COLOR } from '../../../store/themeStore';

export interface DesignStudioHeroProps {
  primaryColor: string;
  resetDesignDefaults: () => void;
  setCustomDarkBgInput: React.Dispatch<React.SetStateAction<string>>;
  setCustomHexInput: React.Dispatch<React.SetStateAction<string>>;
  setCustomLightBgInput: React.Dispatch<React.SetStateAction<string>>;
  showNotice: (msg: string) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

/** Design studio hero banner with theme toggle and reset. */
export function DesignStudioHero({
  primaryColor, resetDesignDefaults, setCustomDarkBgInput, setCustomHexInput, setCustomLightBgInput, showNotice,
  theme, toggleTheme,
}: DesignStudioHeroProps) {
  return (
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
  );
}
