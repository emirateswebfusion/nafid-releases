import { expect, it } from 'vitest';
import { syncNeedsAttention } from '../../src/utils/sync/syncOutcome';
it.each(['2 account changes need review; local data retained', '0 account changes need review; 1 datasets still downloading', '3 operations stopped after 10 attempts', 'Upload failed'])('keeps the actionable outcome visible: %s', label => {
  expect(syncNeedsAttention(label)).toBe(true);
});
it('allows a genuinely completed cycle to hide normally', () => {
  expect(syncNeedsAttention('Sync completed')).toBe(false);
});
