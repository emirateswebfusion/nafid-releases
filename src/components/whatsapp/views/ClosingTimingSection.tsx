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

function formatScheduledTime12h(time24: string): { formatted: string; isAm: boolean } {
  if (!time24 || !time24.includes(':')) return { formatted: '', isAm: false };
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return { formatted: '', isAm: false };
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mPad = m < 10 ? `0${m}` : `${m}`;
  return { formatted: `${h12}:${mPad} ${period}`, isAm: h < 12 };
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
      {(closingConfig.sendTiming === 'SCHEDULED' || closingConfig.sendTiming === 'BOTH') && (() => {
        const time12 = formatScheduledTime12h(closingConfig.scheduledTime);
        return (
          <div className="p-4 rounded-xl bg-card border border-border/60 space-y-2 animate-in fade-in duration-150">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 text-left">
                <span className="text-xs font-bold text-foreground block">Daily Scheduled Closing Time</span>
                <span className="text-[10px] text-muted-foreground block">
                  Using store local timezone. Report checks automatically in the background.
                </span>
              </div>
              <div className="flex items-center gap-2">
                {time12.formatted && (
                  <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${time12.isAm ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' : 'bg-primary/10 text-primary border border-primary/20'}`}>
                    {time12.formatted}
                  </span>
                )}
                <input
                  type="time"
                  disabled={!isAdmin || !closingConfig.enabled}
                  value={closingConfig.scheduledTime}
                  onChange={(e) => handleScheduledTimeChange(e.target.value)}
                  className="bg-background border border-border rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-foreground focus:border-primary focus:outline-none"
                />
              </div>
            </div>
            {time12.isAm && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-snug">
                ⚠️ <strong>{time12.formatted}</strong> is morning time (AM). For evening closing time, select PM (e.g. 22:50 for 10:50 PM).
              </p>
            )}
          </div>
        );
      })()}

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
