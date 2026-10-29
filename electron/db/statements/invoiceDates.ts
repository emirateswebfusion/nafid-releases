/** Sales dates follow creation, not later collection. SQLite parses both legacy UTC and ISO timestamps. */
export function invoiceCreatedInRange(alias: 'i' | '' = ''): string {
  const column = `${alias ? `${alias}.` : ''}created_at`;
  return `(julianday(${column}) >= julianday(?) AND julianday(${column}) <= julianday(?))`;
}

/** Old holds used PC-local SQL text; new holds have an explicit UTC ISO marker. */
export const holdExpiryInstant = () => `CASE WHEN instr(held_until, 'T') > 0 THEN julianday(held_until) ELSE julianday(held_until, 'utc') END`;
