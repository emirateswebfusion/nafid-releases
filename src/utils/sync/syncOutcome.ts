/** Preserve an actionable outcome instead of replacing it with a generic completion badge. */
export const syncNeedsAttention = (label: string | undefined): boolean =>
  /needs? review|still downloading|waiting to upload|stopped after|failed/i.test(label ?? '');
