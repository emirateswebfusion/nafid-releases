import { useState, useRef, useEffect } from 'react';
import { addCalendarDays, storeWallClockToUtcIso, toStoreWallClock } from '../../utils/time/timezoneHelper';
import { Calendar, X, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import clsx from 'clsx';

interface SingleDatePickerProps {
  /** ISO string or YYYY-MM-DD, or null/undefined for live current time */
  value?: string | null;
  /** Callback fired when date is confirmed or reset */
  onChange: (isoString: string | null) => void;
  align?: 'left' | 'right';
  triggerClassName?: string;
  isEditing?: boolean;
}

interface CalendarDay {
  dayNum: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
  dateStr: string;
}

const generateCalendarDays = (year: number, month: number): CalendarDay[] => {
  const firstDay = new Date(year, month, 1);
  const dayOfWeek = firstDay.getDay();
  const startOffset = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  const totalDaysInPrevMonth = new Date(year, month, 0).getDate();
  
  const days: CalendarDay[] = [];
  
  // Previous month leading days
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = totalDaysInPrevMonth - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    days.push({
      dayNum: d,
      month: m,
      year: y,
      isCurrentMonth: false,
      dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    });
  }
  
  // Current month days
  for (let d = 1; d <= totalDaysInMonth; d++) {
    days.push({
      dayNum: d,
      month: month,
      year: year,
      isCurrentMonth: true,
      dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    });
  }
  
  // Next month trailing days to pad up to 42 items (6 rows * 7 columns)
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    days.push({
      dayNum: d,
      month: m,
      year: y,
      isCurrentMonth: false,
      dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    });
  }
  
  return days;
};

function formatHeaderDate(dateStr: string) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayStr = String(day).padStart(2, '0');
  
  return `${weekdays[d.getDay()]}, ${dayStr} ${months[month]} ${year}`;
}

export function SingleDatePicker({
  value,
  onChange,
  align = 'right',
  triggerClassName,
  isEditing = false,
}: SingleDatePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Extract initial date (YYYY-MM-DD) and time (HH:mm)
  // Dates and times are the shop's wall clock (store timezone), whatever zone this PC is set to.
  const parseValue = (val?: string | null): { dateStr: string; timeStr: string; isCustom: boolean } => {
    const valid = Boolean(val) && !isNaN(Date.parse(String(val).replace(' ', 'T')));
    const w = toStoreWallClock(valid ? (val as string) : new Date());
    return { dateStr: w.date, timeStr: w.time, isCustom: valid };
  };

  const parsed = parseValue(value);
  const [selectedDate, setSelectedDate] = useState(parsed.dateStr);
  const [selectedTime, setSelectedTime] = useState(parsed.timeStr);
  const [currentMonth, setCurrentMonth] = useState(() => parseInt(parsed.dateStr.slice(5, 7), 10) - 1);
  const [currentYear, setCurrentYear] = useState(() => parseInt(parsed.dateStr.slice(0, 4), 10));
  const [effectiveAlign, setEffectiveAlign] = useState<'left' | 'right'>(align);

  const updateAlignment = () => {
    if (align === 'right') {
      setEffectiveAlign('right');
      return;
    }
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.left + 336 > window.innerWidth) {
        setEffectiveAlign('right');
      } else {
        setEffectiveAlign('left');
      }
    }
  };

  useEffect(() => {
    if (open) {
      const p = parseValue(value);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- value initializes the editable date draft when open becomes true, preserving the current picker timing.
      setSelectedDate(p.dateStr);
      setSelectedTime(p.timeStr);
      const parts = p.dateStr.split('-');
      if (parts.length === 3) {
        setCurrentYear(parseInt(parts[0], 10));
        setCurrentMonth(parseInt(parts[1], 10) - 1);
      }
      updateAlignment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateAlignment excluded: the date draft continues to initialize only when open or value changes.
  }, [open, value]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const handleSelectToday = () => {
    const now = toStoreWallClock();
    setSelectedDate(now.date);
    setSelectedTime(now.time);
    setCurrentMonth(parseInt(now.date.slice(5, 7), 10) - 1);
    setCurrentYear(parseInt(now.date.slice(0, 4), 10));
    // Directly apply Today (Live)
    onChange(null);
    setOpen(false);
  };

  const handleSelectYesterday = () => {
    const now = toStoreWallClock();
    const yStr = addCalendarDays(now.date, -1);
    setSelectedDate(yStr);
    setSelectedTime(now.time);
    setCurrentMonth(parseInt(yStr.slice(5, 7), 10) - 1);
    setCurrentYear(parseInt(yStr.slice(0, 4), 10));
    // Commit the instant of yesterday at this time of day, on the shop's clock
    onChange(storeWallClockToUtcIso(yStr, now.time));
    setOpen(false);
  };

  const handleDayClick = (day: CalendarDay) => {
    setSelectedDate(day.dateStr);
    if (!day.isCurrentMonth) {
      setCurrentMonth(day.month);
      setCurrentYear(day.year);
    }
  };

  const handleApply = () => {
    if (!selectedDate) {
      onChange(null);
      setOpen(false);
      return;
    }
    onChange(storeWallClockToUtcIso(selectedDate, selectedTime || '00:00'));
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setOpen(false);
  };

  // Determine button text and styling
  const todayStr = toStoreWallClock().date;
  const yestStr = addCalendarDays(todayStr, -1);

  const isCustomSet = Boolean(value);
  const isSelectedToday = parsed.dateStr === todayStr;
  const isSelectedYesterday = parsed.dateStr === yestStr;

  let displayLabel: string;
  if (!isCustomSet) {
    displayLabel = `Today, ${todayStr.slice(8, 10)}/${todayStr.slice(5, 7)}/${todayStr.slice(0, 4)}`;
  } else if (isSelectedYesterday) {
    displayLabel = `Yesterday, ${yestStr.slice(8, 10)}/${yestStr.slice(5, 7)} (${parsed.timeStr})`;
  } else if (isSelectedToday) {
    displayLabel = `Today, ${todayStr.slice(8, 10)}/${todayStr.slice(5, 7)} (${parsed.timeStr})`;
  } else {
    const parts = parsed.dateStr.split('-');
    if (parts.length === 3) {
      displayLabel = `${parts[2]}/${parts[1]}/${parts[0]} (${parsed.timeStr})`;
    } else {
      displayLabel = `${parsed.dateStr} (${parsed.timeStr})`;
    }
  }

  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const days = generateCalendarDays(currentYear, currentMonth);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          updateAlignment();
          setOpen(o => !o);
        }}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all select-none cursor-pointer border shadow-2xs active:scale-[0.98]',
          triggerClassName,
          isCustomSet
            ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 shadow-xs'
            : isEditing
              ? 'border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20'
              : 'border-border bg-muted/40 hover:bg-muted text-foreground'
        )}
        title="Click to select bill date/time"
      >
        <Calendar className={clsx(
          "w-3.5 h-3.5 shrink-0",
          isCustomSet ? "text-amber-600 dark:text-amber-400" : isEditing ? "text-blue-600 dark:text-blue-400" : "text-primary"
        )} />
        <span className="font-mono text-[11px] whitespace-nowrap">
          {displayLabel}
        </span>
        {isCustomSet && (
          <span
            role="button"
            className="p-0.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground ml-0.5 transition-colors cursor-pointer"
            onClick={e => {
              e.stopPropagation();
              handleClear();
            }}
            title="Reset to Today (Live)"
          >
            <X className="w-3 h-3 hover:text-destructive" />
          </span>
        )}
      </button>

      {open && (
        <div className={clsx(
          "absolute top-full mt-1.5 w-80 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-xl shadow-2xl z-50 p-3.5 animate-in fade-in slide-in-from-top-2",
          effectiveAlign === 'right' ? "right-0" : "left-0"
        )}>
          {/* Header Preview */}
          <div className="border-b border-border pb-2.5 mb-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                Selected Invoice Date
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-sm font-bold text-foreground font-mono mt-0.5">
              {formatHeaderDate(selectedDate)}
            </div>
          </div>

          {/* Quick Preset Buttons (Today / Yesterday) */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              type="button"
              onClick={handleSelectToday}
              className={clsx(
                "py-1.5 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer text-center flex items-center justify-center gap-1.5",
                selectedDate === todayStr && !value
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-muted/50 hover:bg-muted text-foreground border-border"
              )}
            >
              <span>Today (Live)</span>
            </button>
            <button
              type="button"
              onClick={handleSelectYesterday}
              className={clsx(
                "py-1.5 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer text-center flex items-center justify-center gap-1.5",
                selectedDate === yestStr
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-muted/50 hover:bg-muted text-foreground border-border"
              )}
            >
              <span>Yesterday</span>
            </button>
          </div>

          {/* Month & Year Navigation */}
          <div className="flex items-center justify-between mb-2 px-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-foreground">
              {monthsList[currentMonth]} {currentYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Row */}
          <div className="grid grid-cols-7 gap-y-1 mb-1 text-center">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <span key={day} className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                {day}
              </span>
            ))}
          </div>

          {/* Day Grid */}
          <div className="grid grid-cols-7 gap-y-1">
            {days.map((day, idx) => {
              const isSelected = day.dateStr === selectedDate;
              const isToday = day.dateStr === todayStr;

              return (
                <div key={`${day.dateStr}-${idx}`} className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => handleDayClick(day)}
                    className={clsx(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all relative focus:outline-none cursor-pointer",
                      !day.isCurrentMonth && "text-muted-foreground/30 hover:text-muted-foreground/60",
                      day.isCurrentMonth && !isSelected && "text-foreground hover:bg-muted font-semibold",
                      isSelected && "bg-primary text-primary-foreground font-black shadow-md scale-105",
                      isToday && !isSelected && "border border-primary font-bold text-primary"
                    )}
                  >
                    {day.dayNum}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Time Picker */}
          <div className="flex items-center justify-between pt-2.5 border-t border-border mt-3 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-primary" />
              Time:
            </span>
            <input
              type="time"
              value={selectedTime}
              onChange={e => setSelectedTime(e.target.value)}
              className="px-2 py-1 bg-background border border-border rounded-md font-mono text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center gap-2 pt-2.5 border-t border-border mt-2.5">
            <button
              type="button"
              onClick={handleClear}
              className="w-full py-1.5 text-xs font-bold rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all cursor-pointer"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="w-full py-1.5 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              Apply Date
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
