export function parseUTCDate(dateInput: Date | string | number | null | undefined): Date {
  if (dateInput === null || dateInput === undefined || dateInput === '') return new Date();
  if (dateInput instanceof Date) return dateInput;
  if (typeof dateInput === 'number') return new Date(dateInput);

  const dateStr = String(dateInput).trim();
  if (!dateStr) return new Date();

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  // If string explicitly contains UTC 'Z' or offset like +04:00, let Date parse absolute instant
  if (/Z$/i.test(dateStr) || /[+-]\d{2}:?\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
  }

  // Standard SQL / SQLite datetime stored in UTC (e.g. "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss")
  const match = dateStr.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?/);
  if (match) {
    const [_, y, m, d, hh, mm, ss, ms] = match;
    return new Date(Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss || 0),
      Number((ms || '0').padEnd(3, '0').substring(0, 3))
    ));
  }

  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date(dateInput as string) : d;
}

/** Resolve an entered shop clock; overlaps choose the earlier instant, DST gaps move forward. */
export function utcForWallClock(date: string, time: string, timeZone: string): Date {
  const wanted = Date.parse(`${date}T${time.length === 5 ? time + ':00' : time}Z`);
  if (!Number.isFinite(wanted)) throw new RangeError('Invalid shop date/time');
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const wall = (ms: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(ms).map(p => [p.type, p.value]));
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  };
  const offsets = [-86400000, 0, 86400000].map(delta => wall(wanted + delta) - (wanted + delta));
  const candidates = offsets.map(offset => wanted - offset);
  const matches = candidates.filter(candidate => wall(candidate) === wanted);
  const resolved = matches.length ? matches : candidates.filter(candidate => wall(candidate) > wanted);
  if (!resolved.length) throw new RangeError('Invalid shop date/time');
  return new Date(Math.min(...resolved));
}

