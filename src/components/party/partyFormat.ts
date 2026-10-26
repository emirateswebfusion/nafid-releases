
export { formatDateTime } from '../../utils/dateDisplay';

// Converts a naive local datetime-local value (e.g. "2026-08-16T23:25") into a
// timezone-aware UTC ISO string so Postgres stores the true instant, not local
// wall time misread as UTC. Returns undefined for empty/invalid input.
export const toUtcIso = (naive: string): string | undefined => {
  if (!naive) return undefined;
  const d = new Date(naive);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
};
