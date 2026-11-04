import React from 'react';
import { Power, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { FEATURE_LIST, type FeatureFlags, useFeatureFlagsStore, sanitizeFeatureFlags } from '../../../config/featureFlags';

export interface FeaturesTabProps {
  featureFlags: FeatureFlags | null;
  handleToggleFeatureFlag: (key: keyof FeatureFlags, nextVal?: boolean) => void;
  setConfirmTurnOffAllModalOpen: (v: boolean) => void;
  setShowCashRegister: (v: boolean) => void;
}

/** Features & Modules: turn whole modules on or off. Module-specific rules live on their own settings pages. */
export const FeaturesTab: React.FC<FeaturesTabProps> = ({
  featureFlags,
  handleToggleFeatureFlag,
  setConfirmTurnOffAllModalOpen,
  setShowCashRegister,
}) => {
  return (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-card/45 dark:bg-card/25 border border-border/50 rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 hover:bg-card/65 transition-all duration-300 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/40">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Power className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Features &amp; Modules</span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmTurnOffAllModalOpen(true)}
                    className="px-3 py-1.5 text-[10px] font-bold text-destructive bg-destructive/10 hover:bg-destructive/15 border border-destructive/25 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
                  >
                    Turn Off All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      useFeatureFlagsStore.getState().setFlags(sanitizeFeatureFlags(Object.fromEntries(FEATURE_LIST.map(f => [f.key, f.key === 'restaurant_mode' ? Boolean(useFeatureFlagsStore.getState().flags?.restaurant_mode) : true])) as FeatureFlags)); // restaurant mode changes the shop type: only its own toggle
                      setShowCashRegister(true);
                    }}
                    className="px-3 py-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
                  >
                    Turn On All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FEATURE_LIST.map(def => {
                  const enabled = featureFlags?.[def.key];
                  return (
                    <div
                      key={def.key}
                      className={clsx(
                        'flex items-center justify-between gap-4 p-4.5 rounded-2xl border transition-all duration-300',
                        enabled ? 'bg-muted/20 dark:bg-muted/10 border-border/60 hover:border-primary/25' : 'bg-background border-border/40 opacity-75 hover:border-destructive/25'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => handleToggleFeatureFlag(def.key)}>{def.label}</label>
                        <p className="text-[10px] text-muted-foreground/75 mt-0.5 leading-relaxed">{def.desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleFeatureFlag(def.key)}
                        className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', enabled ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}
                        title={enabled ? 'Enabled' : 'Disabled'}
                      >
                        <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', enabled ? 'translate-x-5' : 'translate-x-0')} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 p-4 bg-blue-500/[0.04] border border-blue-500/20 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
                  Disabled features are hidden everywhere — dashboards, billing page buttons, and manager screens. Existing data is never deleted; re-enabling a feature restores it. Changes apply after saving.
                </p>
              </div>
            </div>
          </div>
  );
};
