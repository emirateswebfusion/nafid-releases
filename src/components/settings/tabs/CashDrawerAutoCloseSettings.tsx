import React from 'react';
import clsx from 'clsx';

export interface CashDrawerAutoCloseSettingsProps {
  autoCloseEnabled: boolean;
  setAutoCloseEnabled: (v: boolean) => void;
  autoCloseTime: string;
  setAutoCloseTime: (v: string) => void;
}

/** "11:30 PM on the same day" / "01:30 AM the next morning" for an HH:MM value (before 12:00 = after midnight). */
function describeCloseTime(value: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return '';
  const h = Number(m[1]);
  const label = `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0')}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
  return h < 12 ? `Closes at ${label} the next morning` : `Closes at ${label} on the same day`;
}

export const CashDrawerAutoCloseSettings: React.FC<CashDrawerAutoCloseSettingsProps> = ({
  autoCloseEnabled,
  setAutoCloseEnabled,
  autoCloseTime,
  setAutoCloseTime,
}) => {
  return (
    <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setAutoCloseEnabled(!autoCloseEnabled)}>
            Auto close cash drawer
          </label>
          <p className="text-[10px] text-muted-foreground/75 mt-0.5">
            Ask to close the cash drawer automatically at the configured time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAutoCloseEnabled(!autoCloseEnabled)}
          className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', autoCloseEnabled ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}
        >
          <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', autoCloseEnabled ? 'translate-x-5' : 'translate-x-0')} />
        </button>
      </div>

      {autoCloseEnabled && (
        <div>
          <label className="text-xs font-bold text-foreground mb-1 block">Auto close time</label>
          <input
            type="time"
            value={autoCloseTime}
            onChange={(e) => setAutoCloseTime(e.target.value)}
            className="w-full max-w-xs h-9 px-3 text-xs font-semibold bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="text-[11px] font-bold text-primary mt-1.5">{describeCloseTime(autoCloseTime)}</p>
          <p className="text-[10px] text-muted-foreground/75 mt-1 leading-relaxed">
            Off: the drawer stays open until you close it. On: at this time you are asked to close it (you can ask for more time). A time before 12:00 means after midnight.
          </p>
        </div>
      )}
    </div>
  );
};
