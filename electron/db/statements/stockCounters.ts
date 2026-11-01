/** Monotone per-origin add/remove counters. Sync merges by maximum, never by arrival time. */
export function mergeCountersSql(left: string, right: string): string {
  return `(SELECT COALESCE(json_group_object(key, value), '{}') FROM
    (SELECT key, MAX(value) AS value FROM
      (SELECT key, value FROM json_each(COALESCE(${left}, '{}')) UNION ALL
       SELECT key, value FROM json_each(COALESCE(${right}, '{}'))) GROUP BY key))`;
}
export function counterTotalSql(state: string): string {
  return `(SELECT COALESCE(SUM(CASE WHEN substr(key, -2) = ':a' THEN value ELSE -value END), 0)
    FROM json_each(COALESCE(${state}, '{}')))`;
}
export function counterDeltaSql(old: string, incoming: string): string {
  return `(${counterTotalSql(mergeCountersSql(old, incoming))} - ${counterTotalSql(old)})`;
}
