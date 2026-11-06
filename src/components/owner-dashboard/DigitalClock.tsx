import { storeDate, storeTime } from '../../utils/time/dateDisplay';
import { useState, useEffect, useCallback } from 'react';
import { Clock, Globe } from 'lucide-react';
import { getStoreTimezone, SUPPORTED_TIMEZONES } from '../../utils/time/timezoneHelper';
import { getAppTimeFormat } from '../../utils/print/receiptGenerator';
import clsx from 'clsx';

interface DigitalClockProps {
  className?: string;
  variant?: 'card' | 'pill' | 'footer';
}

export function DigitalClock({ className, variant = 'pill' }: DigitalClockProps) {
  const [now, setNow] = useState<Date>(new Date());
  const [storeTz, setStoreTz] = useState<string>(getStoreTimezone());
  const [timeFmt, setTimeFmt] = useState<'12h' | '24h'>(getAppTimeFormat());

  const refreshSettings = useCallback(() => {
    setStoreTz(getStoreTimezone());
    setTimeFmt(getAppTimeFormat());
  }, []);

  useEffect(() => {
    // Timer tick every 1000ms
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    // Listen to settings updates
    const handleSettingsUpdated = () => {
      refreshSettings();
    };

    window.addEventListener('settings:updated', handleSettingsUpdated);
    window.addEventListener('storage', handleSettingsUpdated);

    return () => {
      clearInterval(timer);
      window.removeEventListener('settings:updated', handleSettingsUpdated);
      window.removeEventListener('storage', handleSettingsUpdated);
    };
  }, [refreshSettings]);

  // Find timezone display label
  const tzMatch = SUPPORTED_TIMEZONES.find((t) => t.value === storeTz);
  const tzShortLabel = tzMatch
    ? tzMatch.label.split('(')[1]?.replace(')', '') || storeTz
    : storeTz;

  const is12h = timeFmt !== '24h';

  // Format time
  let timeMain: string;
  let amPmStr = '';

  try {
    const rawTimeString = now.toLocaleTimeString(is12h ? 'en-US' : 'en-GB', {
      timeZone: storeTz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: is12h,
    });

    if (is12h) {
      const parts = rawTimeString.split(' ');
      timeMain = parts[0] || rawTimeString;
      amPmStr = parts[1] || '';
    } else {
      timeMain = rawTimeString;
    }
  } catch {
    // Fallback if invalid timezone string
    const rawTimeString = storeTime(now, is12h ? 'en-US' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    timeMain = rawTimeString;
  }

  // Format date
  let dateStr: string;
  try {
    dateStr = now.toLocaleDateString('en-US', {
      timeZone: storeTz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    dateStr = storeDate(now, 'en-US');
  }

  if (variant === 'card') {
    return (
      <div
        className={clsx(
          'flex flex-col p-4 rounded-2xl bg-card border border-border/80 shadow-sm relative overflow-hidden',
          className
        )}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold">
            <Clock className="w-4 h-4 text-primary animate-pulse" />
            <span>Digital Clock</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
            <Globe className="w-3 h-3" />
            <span className="truncate max-w-[120px]">{tzShortLabel}</span>
          </div>
        </div>

        <div className="flex items-baseline gap-2 my-1">
          <span className="text-3xl font-black font-mono tracking-tight text-foreground">
            {timeMain}
          </span>
          {is12h && amPmStr && (
            <span className="text-sm font-extrabold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md uppercase">
              {amPmStr}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium mt-1">
          <span>{dateStr}</span>
          <span className="text-[10px] bg-muted px-2 py-0.5 rounded-md font-semibold">
            {is12h ? '12-Hour' : '24-Hour'}
          </span>
        </div>
      </div>
    );
  }

  if (variant === 'footer') {
    return (
      <div
        className={clsx(
          'flex items-center gap-2 text-xs text-muted-foreground select-none flex-wrap',
          className
        )}
        title={`Store Timezone: ${tzMatch?.label || storeTz} (${is12h ? '12h format' : '24h format'})`}
      >
        <div className="flex items-center gap-1.5 font-mono font-extrabold text-foreground bg-card px-2.5 py-1 rounded-lg border border-border/80 shadow-2xs">
          <Clock className="w-3.5 h-3.5 text-primary animate-pulse shrink-0" />
          <span>{timeMain}</span>
          {is12h && amPmStr && (
            <span className="text-[10px] font-extrabold text-primary uppercase">
              {amPmStr}
            </span>
          )}
        </div>
        <span className="hidden sm:inline text-muted-foreground/60">•</span>
        <span className="hidden sm:inline font-medium text-[11px]">{dateStr}</span>
        <span className="hidden md:inline px-1.5 py-0.5 rounded bg-muted text-[9px] font-bold text-muted-foreground/80 uppercase">
          {tzShortLabel.split(' ')[0]}
        </span>
        <span className="text-muted-foreground/60">•</span>
        <span className="font-semibold text-foreground/80">© {now.getFullYear()} Nafid</span>
      </div>
    );
  }

  // Default 'pill' layout for top header bar
  return (
    <div
      className={clsx(
        'flex items-center gap-2.5 px-3 py-1.5 bg-card dark:bg-card/90 border border-border/80 rounded-xl shadow-sm text-foreground select-none',
        className
      )}
      title={`Store Timezone: ${tzMatch?.label || storeTz} (${is12h ? '12h format' : '24h format'})`}
    >
      <div className="relative flex items-center justify-center shrink-0">
        <Clock className="w-4 h-4 text-primary" />
        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-xs md:text-sm font-black font-mono tracking-tight text-foreground">
          {timeMain}
        </span>
        {is12h && amPmStr && (
          <span className="text-[10px] font-extrabold text-primary uppercase">
            {amPmStr}
          </span>
        )}
      </div>

      <span className="hidden xl:inline text-border/60">|</span>

      <div className="hidden xl:flex items-center gap-1.5 text-[10px] text-muted-foreground font-semibold">
        <span className="truncate max-w-[100px]">{dateStr}</span>
        <span className="px-1.5 py-0.2 rounded bg-muted text-[9px] font-bold text-muted-foreground/80 uppercase">
          {tzShortLabel.split(' ')[0]}
        </span>
      </div>
    </div>
  );
}
