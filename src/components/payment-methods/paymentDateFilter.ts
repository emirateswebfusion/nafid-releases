import { calendarDateKey, storeCalendarDate } from '../../utils/time/timezoneHelper';

/** Inclusive shop-calendar range; an unset range preserves undated rows. */
export function matchesPaymentDateRange(value: string | null | undefined, start: string, end: string): boolean {
  if (!start && !end) return true;
  if (!value) return false;
  try {
    const date = storeCalendarDate(value);
    if (Number.isNaN(date.getTime())) return false;
    const day = calendarDateKey(date);
    return (!start || day >= start) && (!end || day <= end);
  } catch {
    return false;
  }
}
