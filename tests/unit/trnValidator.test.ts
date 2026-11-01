import { describe, expect, it } from 'vitest';
import { validateTRN, normalizeEmirate } from '../../electron/utils/trnValidator';

describe('UAE TRN Validator', () => {
  it('accepts valid 15-digit UAE TRNs starting with 100', () => {
    const validTrn = '100123456789003';
    const result = validateTRN(validTrn);
    expect(result.isValid).toBe(true);
    expect(result.trn).toBe('100123456789003');
    expect(result.error).toBeUndefined();
  });

  it('rejects TRNs that do not have 15 digits', () => {
    expect(validateTRN('10012345678').isValid).toBe(false);
    expect(validateTRN('10012345678900399').isValid).toBe(false);
  });

  it('rejects TRNs with non-numeric characters', () => {
    const res = validateTRN('10012345678900A');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('digits only');
  });

  it('rejects TRNs that do not begin with 100', () => {
    const res = validateTRN('200123456789003');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('begin with 100');
  });

  it('handles empty or null TRNs gracefully', () => {
    expect(validateTRN('').isValid).toBe(false);
    expect(validateTRN(null).isValid).toBe(false);
    expect(validateTRN(undefined).isValid).toBe(false);
  });

  it('normalizes Emirate strings correctly', () => {
    expect(normalizeEmirate('Dubai')).toBe('DUBAI');
    expect(normalizeEmirate('Abu Dhabi')).toBe('ABU_DHABI');
    expect(normalizeEmirate('abu_dhabi')).toBe('ABU_DHABI');
    expect(normalizeEmirate('Sharjah')).toBe('SHARJAH');
    expect(normalizeEmirate('Ras Al Khaimah')).toBe('RAS_AL_KHAIMAH');
    expect(normalizeEmirate(null)).toBe('DUBAI');
    expect(normalizeEmirate('unknown')).toBe('DUBAI');
  });
});
