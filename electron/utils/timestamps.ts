/** ISO-8601 UTC timestamp for a Date/string/number; invalid input falls back to now. */

export function toIsoTimestamp(d: Date | string | number = new Date()): string {
  const dateObj = d instanceof Date ? d : new Date(d);
  return isNaN(dateObj.getTime()) ? new Date().toISOString() : dateObj.toISOString();
}
