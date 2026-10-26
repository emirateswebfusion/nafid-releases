import { describe, expect, it } from 'vitest';
import { deterministicUUID } from '../../electron/utils/ids';

describe('deterministicUUID', () => {
  it('generates consistent UUID from identical seed', () => {
    const seed = 'tenant-1:item-42:stock';
    const id1 = deterministicUUID(seed);
    const id2 = deterministicUUID(seed);
    expect(id1).toBe(id2);
  });

  it('generates different UUIDs for different seeds', () => {
    const id1 = deterministicUUID('seed-a');
    const id2 = deterministicUUID('seed-b');
    expect(id1).not.toBe(id2);
  });

  it('matches standard UUID format with version 5 indicator', () => {
    const uuid = deterministicUUID('test-seed-123');
    // Format: 8-4-4-4-12 hex chars
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(uuid.charAt(14)).toBe('5');
    expect(uuid.charAt(19)).toBe('a');
  });

  it('handles empty string seed safely', () => {
    const uuid = deterministicUUID('');
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
