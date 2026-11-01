import { describe, expect, it } from 'vitest';
import {
  normalizeState,
  resolvePlaceOfSupply,
  validateGSTIN,
} from '../../src/utils/pricing/gstinValidator';

describe('gstinValidator - validateGSTIN', () => {
  it('accepts valid 15-character Indian GSTIN with correct Luhn Mod-36 check digit', () => {
    // 32CEFPK8504N2ZA is a valid Kerala GSTIN
    const result = validateGSTIN('32CEFPK8504N2ZA');
    expect(result.isValid).toBe(true);
    expect(result.stateCode).toBe('32');
    expect(result.stateName).toBe('Kerala');
    expect(result.pan).toBe('CEFPK8504N');
  });

  it('rejects GSTIN with invalid checksum', () => {
    // Changing last char from 'A' to 'Z'
    const result = validateGSTIN('32CEFPK8504N2ZZ');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Invalid check digit');
  });

  it('rejects GSTIN with invalid state code', () => {
    // 98 is not a valid state code
    const result = validateGSTIN('98CEFPK8504N2ZA');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Invalid GST state code');
  });

  it('rejects malformed lengths or empty string', () => {
    expect(validateGSTIN('').isValid).toBe(false);
    expect(validateGSTIN('123').isValid).toBe(false);
    expect(validateGSTIN('32CEFPK8504N2ZAA').isValid).toBe(false);
  });
});

describe('gstinValidator - normalizeState', () => {
  it('normalizes 2-digit TIN codes', () => {
    expect(normalizeState('32')?.name).toBe('Kerala');
    expect(normalizeState('29')?.name).toBe('Karnataka');
    expect(normalizeState('27')?.name).toBe('Maharashtra');
  });

  it('normalizes state names with varying case and spaces', () => {
    expect(normalizeState('kerala')?.code).toBe('32');
    expect(normalizeState('Tamil Nadu')?.code).toBe('33');
    expect(normalizeState('TAMILNADU')?.code).toBe('33');
    expect(normalizeState('UTTAR PRADESH')?.code).toBe('09');
  });

  it('normalizes abbreviations', () => {
    expect(normalizeState('KL')?.code).toBe('32');
    expect(normalizeState('KA')?.code).toBe('29');
    expect(normalizeState('DL')?.code).toBe('07');
  });

  it('returns null for unknown state', () => {
    expect(normalizeState('Atlantis')).toBeNull();
    expect(normalizeState('')).toBeNull();
  });
});

describe('gstinValidator - resolvePlaceOfSupply', () => {
  it('resolves INTRA for same state shop and customer', () => {
    const pos = resolvePlaceOfSupply({
      shopState: 'Kerala',
      customerState: 'Kerala',
    });
    expect(pos.supplyType).toBe('INTRA');
    expect(pos.posStateCode).toBe('32');
  });

  it('resolves INTER for customer in different state even with varied casing/abbreviation', () => {
    const pos = resolvePlaceOfSupply({
      shopState: 'Kerala',
      customerState: 'KA', // Karnataka
    });
    expect(pos.supplyType).toBe('INTER');
    expect(pos.posStateCode).toBe('29');
    expect(pos.posStateName).toBe('Karnataka');
  });

  it('resolves B2B Place of Supply from customer GSTIN state code automatically', () => {
    const pos = resolvePlaceOfSupply({
      shopState: 'Kerala', // 32
      customerGstin: '29AABCB1234F1Z4', // Karnataka 29
    });
    expect(pos.supplyType).toBe('INTER');
    expect(pos.posStateCode).toBe('29');
  });

  it('defaults to shop state for over-the-counter walk-in B2C when customer state is omitted', () => {
    const pos = resolvePlaceOfSupply({
      shopState: 'Kerala',
      customerState: '',
    });
    expect(pos.supplyType).toBe('INTRA');
    expect(pos.posStateCode).toBe('32');
  });
});
