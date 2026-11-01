/** Stock snapshots must advance even when checkout, delete and restore happen in the same millisecond. */
export const stockTimestampSql = `strftime('%Y-%m-%dT%H:%M:%fZ',
  MAX(julianday('now'), COALESCE(julianday(updated_at), 0) + 1.0 / 86400000.0))`;
