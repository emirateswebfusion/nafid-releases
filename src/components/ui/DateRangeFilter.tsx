import { useState, useRef, useEffect } from 'react';
import { Calendar, X, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
  align?: 'left' | 'right';
  triggerClassName?: string;
}

function toDisplay(d: string) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

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
  
  return `${weekdays[d.getDay()]}, ${dayStr} ${months[month]}`;
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

export function DateRangeFilter({ startDate, endDate, onChange, align = 'left', triggerClassName }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(startDate);
  const [tempEndDate, setTempEndDate] = useState(endDate);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [effectiveAlign, setEffectiveAlign] = useState<'left' | 'right'>(align);
  const containerRef = useRef<HTMLDivElement>(null);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- align requires measuring the mounted container to preserve the popup's existing position.
    updateAlignment();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateAlignment excluded: align remains the original alignment recalculation trigger.
  }, [align]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open positions the popup before attaching resize updates, preserving its current opening layout.
      updateAlignment();
      window.addEventListener('resize', updateAlignment);
      return () => window.removeEventListener('resize', updateAlignment);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateAlignment excluded: open and align remain the original popup listener triggers.
  }, [open, align]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- startDate and endDate initialize the draft on open; excluding later changes preserves edits made while the picker stays open.
      setTempStartDate(startDate);
      setTempEndDate(endDate);
      
      let initialDate = new Date();
      if (startDate) {
        const parts = startDate.split('-');
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const d = parseInt(parts[2], 10);
          initialDate = new Date(y, m, d);
        }
      }
      setCurrentMonth(initialDate.getMonth());
      setCurrentYear(initialDate.getFullYear());
    }
  }, [open, startDate, endDate]);

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

  const handleDayClick = (dateStr: string) => {
    if (!tempStartDate || (tempStartDate && tempEndDate)) {
      setTempStartDate(dateStr);
      setTempEndDate('');
    } else {
      if (dateStr < tempStartDate) {
        setTempStartDate(dateStr);
      } else {
        setTempEndDate(dateStr);
      }
    }
  };

  const handleApply = () => {
    onChange(tempStartDate, tempEndDate);
    setOpen(false);
  };

  const handleCancel = () => {
    setOpen(false);
  };

  const clear = () => {
    setTempStartDate('');
    setTempEndDate('');
    onChange('', '');
    setOpen(false);
  };

  const hasSelection = startDate || endDate;
  const rangeText = startDate && endDate
    ? `${toDisplay(startDate)} - ${toDisplay(endDate)}`
    : startDate
      ? toDisplay(startDate)
      : 'Select dates';

  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const days = generateCalendarDays(currentYear, currentMonth);
  const fromText = tempStartDate ? formatHeaderDate(tempStartDate) : '—';
  const toText = tempEndDate ? formatHeaderDate(tempEndDate) : '—';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          updateAlignment();
          setOpen(o => !o);
        }}
        className={clsx(
          'flex items-center gap-2 border rounded-xl transition-all select-none cursor-pointer active:scale-[0.98]',
          triggerClassName || 'px-4 py-2.5 text-sm bg-background',
          open
            ? 'border-primary ring-2 ring-primary/20 shadow-xs'
            : 'border-border hover:border-muted-foreground/30 hover:bg-muted/20'
        )}
      >
        <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className={clsx(hasSelection ? 'text-foreground font-semibold' : 'text-muted-foreground font-medium')}>
          {rangeText}
        </span>
        {hasSelection && (
          <span
            role="button"
            className="p-0.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground ml-auto transition-colors cursor-pointer"
            onClick={e => { e.stopPropagation(); clear(); }}
            title="Clear date filter"
          >
            <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
          </span>
        )}
      </button>

      {open && (
        <div className={clsx(
          "absolute top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-xl shadow-xl z-50 p-3.5 animate-in fade-in slide-in-from-top-2 max-h-[calc(100vh-180px)] overflow-y-auto",
          effectiveAlign === 'right' ? "right-0" : "left-0"
        )}>
          {/* Header Split */}
          <div className="grid grid-cols-2 border-b border-border pb-2 mb-2">
            <div className="px-1">
              <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">From</span>
              <span className={clsx("text-xs font-semibold", tempStartDate ? "text-foreground" : "text-muted-foreground")}>
                {fromText}
              </span>
            </div>
            <div className="border-l border-border px-3">
              <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">To</span>
              <span className={clsx("text-xs font-semibold", tempEndDate ? "text-foreground" : "text-muted-foreground")}>
                {toText}
              </span>
            </div>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-2 px-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-foreground">
              {monthsList[currentMonth]} {currentYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all"
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
          <div className="grid grid-cols-7 gap-y-0.5">
            {days.map((day, idx) => {
              const isStart = day.dateStr === tempStartDate;
              const isEnd = day.dateStr === tempEndDate;
              const inRange =
                tempStartDate &&
                tempEndDate &&
                day.dateStr > tempStartDate &&
                day.dateStr < tempEndDate;
              const isRangeSelected = tempStartDate && tempEndDate && tempStartDate !== tempEndDate;
              
              const todayStr = new Date().toLocaleDateString('en-CA');
              const isToday = day.dateStr === todayStr;

              return (
                <div
                  key={`${day.dateStr}-${idx}`}
                  className={clsx(
                    "relative py-0 flex items-center justify-center w-full",
                    isRangeSelected && inRange && "bg-primary/10 dark:bg-primary/20",
                    isRangeSelected && isStart && "bg-gradient-to-r from-transparent to-primary/10 dark:to-primary/20 rounded-l-full",
                    isRangeSelected && isEnd && "bg-gradient-to-l from-transparent to-primary/10 dark:to-primary/20 rounded-r-full"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleDayClick(day.dateStr)}
                    className={clsx(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all relative focus:outline-none",
                      !day.isCurrentMonth && "text-muted-foreground/30 hover:text-muted-foreground/60",
                      day.isCurrentMonth && !isStart && !isEnd && "text-foreground hover:bg-muted",
                      (isStart || isEnd) && "bg-primary text-primary-foreground font-semibold shadow-sm",
                      isToday && !isStart && !isEnd && "border border-primary/50 font-medium"
                    )}
                  >
                    {day.dayNum}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center gap-2 pt-2.5 border-t border-border mt-2.5">
            <button
              type="button"
              onClick={handleCancel}
              className="w-full py-1.5 text-xs font-bold rounded-xl border border-destructive/25 text-destructive hover:bg-destructive/10 active:scale-95 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="w-full py-1.5 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
