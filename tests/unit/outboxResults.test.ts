import { describe, expect, it } from 'vitest';
import { resultAction, usesOutbox } from '../../electron/sync/outboxResults';
describe('outbox result decisions', () => {
  it('acknowledges applied and duplicate, retains conflict server copy', () => {
    for (const status of ['applied', 'duplicate']) expect(resultAction({ status })).toEqual({ done: true, error: null });
    const current = { name: 'Server' };
    expect(resultAction({ status: 'conflict', current })).toEqual({ done: true, error: 'conflict', current });
  });
  it('retries errors and malformed replies, including missing conflict data', () => {
    for (const value of [undefined, {}, { status: 'conflict' }, { status: 'error' }, { status: 'forbidden' }, { status: 'unknown_entity' }]) {
      expect(resultAction(value).done).toBe(false); expect(resultAction(value).error).toBeTruthy();
    }
  });
  it('defaults off and ignores outbox on both LAN roles including hybrid cloud primaries', () => {
    expect(usesOutbox(null, null)).toBe(false); expect(usesOutbox('legacy', null)).toBe(false);
    expect(usesOutbox('outbox', null)).toBe(true);
    for (const syncMode of ['LAN', 'HYBRID']) for (const lanRole of ['PRIMARY', 'SECONDARY']) {
      expect(usesOutbox('outbox', { syncMode, lanRole })).toBe(false);
    }
  });
});
