import clsx from 'clsx';
import { Clock, Layers } from 'lucide-react';
import { type ShopClosingSendTiming } from '../../../utils/time/shopClosingHelper';
import type { ShopClosingOverviewConfig } from '../../../utils/time/shopClosingHelper';

export interface ClosingTimingSectionProps {
  closingConfig: ShopClosingOverviewConfig;
  handleMultiCounterToggle: (include: boolean) => void;
  handleScheduledTimeChange: (time: string) => void;
  handleTimingChange: (timing: ShopClosingSendTiming) => void;
  isAdmin: boolean;
}

/** Shop closing report dispatch timing: on day close or at a scheduled time, multi-counter option. */
export function ClosingTimingSection({
  closingConfig, handleMultiCounterToggle, handleScheduledTimeChange, handleTimingChange, isAdmin,
}: ClosingTimingSectionProps) {
  return (
    <div
      className={clsx(
        'p-6 rounded-2xl bg-muted/20 border border-border/80 space-y-4 transition-all',
        !closingConfig.enabled && 'opacity-60'
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Clock className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
            Report Dispatch Timing
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Choose when reports are generated and sent to the owner
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            id: 'IMMEDIATELY',
            label: 'On Settlement Close',
            desc: 'Immediately after Cash Settlement closes',
          },
          {
            id: 'SCHEDULED',
            label: 'At Closing Time',
            desc: 'At configured daily closing hour',
          },
          {
            id: 'BOTH',
            label: 'Both Triggers',
            desc: 'On settlement & at scheduled time',
          },
        ].map((option) => {
          const isSelected = closingConfig.sendTiming === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={!isAdmin || !closingConfig.enabled}
              onClick={() => handleTimingChange(option.id as ShopClosingSendTiming)}
              className={clsx(
                'p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-1',
                isSelected
                  ? 'bg-primary/5 border-primary/40 ring-1 ring-primary/20'
                  : 'bg-card border-border/60 hover:border-border'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">{option.label}</span>
                <span
                  className={clsx(
                    'w-3.5 h-3.5 rounded-full border flex items-center justify-center',
                    isSelected ? 'border-primary bg-primary text-white' : 'border-muted-foreground/40'
                  )}
                >
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">{option.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Scheduled Time Config */}
      {(closingConfig.sendTiming === 'SCHEDULED' || closingConfig.sendTiming === 'BOTH') && (
        <div className="p-4 rounded-xl bg-card border border-border/60 flex items-center justify-between gap-4 animate-in fade-in duration-150">
          <div className="space-y-0.5 text-left">
            <span className="text-xs font-bold text-foreground block">Daily Scheduled Closing Time</span>
            <span className="text-[10px] text-muted-foreground block">
              Using store local timezone. Report checks automatically in the background.
            </span>
          </div>
          <input
            type="time"
            disabled={!isAdmin || !closingConfig.enabled}
            value={closingConfig.scheduledTime}
            onChange={(e) => handleScheduledTimeChange(e.target.value)}
            className="bg-background border border-border rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-foreground focus:border-primary focus:outline-none"
          />
        </div>
      )}

      {/* Multi-counter Breakdown Option */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/60">
        <div className="space-y-0.5 pr-4 text-left">
          <span className="text-xs font-bold text-foreground block flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-primary" />
            Consolidate Multi-Counter Performance
          </span>
          <span className="text-[11px] text-muted-foreground block leading-snug">
            When multiple counters/drawers operate, includes individual breakdown for each terminal.
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0 select-none">
          <input
            type="checkbox"
            checked={closingConfig.includeMultiCounterBreakdown}
            disabled={!isAdmin || !closingConfig.enabled}
            onChange={(e) => handleMultiCounterToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-muted/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
        </label>
      </div>
    </div>
  );
}
