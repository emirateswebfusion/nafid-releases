import { describe, expect, it } from 'vitest';
import {
  formatPrinterError,
  parsePrintFormat,
  type PrintFormatConfig,
} from '../../src/utils/printFormatHelper';

describe('parsePrintFormat', () => {
  it('returns default thermal format when input is null, undefined, or empty', () => {
    const def = { format: 'thermal', thermalStyle: 'standard', a4Style: 'boxed' };
    expect(parsePrintFormat(null)).toEqual(def);
    expect(parsePrintFormat(undefined)).toEqual(def);
    expect(parsePrintFormat('')).toEqual(def);
  });

  it('parses literal format strings', () => {
    expect(parsePrintFormat('a4')).toEqual({ format: 'a4', thermalStyle: 'standard', a4Style: 'boxed' });
    expect(parsePrintFormat('half-a4')).toEqual({ format: 'half-a4', thermalStyle: 'standard', a4Style: 'boxed' });
    expect(parsePrintFormat('thermal')).toEqual({ format: 'thermal', thermalStyle: 'standard', a4Style: 'boxed' });
  });

  it('parses JSON string representation of config', () => {
    const jsonStr = JSON.stringify({ format: 'a4', a4Style: 'compact', showProductOffers: true });
    const parsed = parsePrintFormat(jsonStr);
    expect(parsed.format).toBe('a4');
    expect(parsed.a4Style).toBe('compact');
    expect(parsed.showProductOffers).toBe(true);
  });

  it('handles object input and preserves additional fields', () => {
    const obj: Partial<PrintFormatConfig> = {
      format: 'thermal',
      thermalStyle: 'modern',
      showPriceOverrideMrp: true,
      openCashDrawerOnPending: false,
    };
    const parsed = parsePrintFormat(obj);
    expect(parsed.format).toBe('thermal');
    expect(parsed.thermalStyle).toBe('modern');
    expect(parsed.showPriceOverrideMrp).toBe(true);
    expect(parsed.openCashDrawerOnPending).toBe(false);
  });
});

describe('formatPrinterError', () => {
  it('returns generic error for null, undefined, or empty input', () => {
    expect(formatPrinterError(null)).toContain('Unknown printer error');
    expect(formatPrinterError(undefined)).toContain('Unknown printer error');
    expect(formatPrinterError('')).toContain('Unknown printer error');
  });

  it('strips redundant prefixes if error already has diagnostic instructions', () => {
    expect(formatPrinterError('Print failed: Check printer paper')).toBe('Check printer paper');
    expect(formatPrinterError('Printing issue: Printer not found on network')).toBe('Printer not found on network');
  });

  it('maps device name errors to actionable guidance', () => {
    expect(formatPrinterError('Error: invalid devicename')).toContain('select a valid printer in Settings');
    expect(formatPrinterError('devicename not configured')).toContain('select a valid printer in Settings');
  });

  it('maps unconfigured printer errors', () => {
    expect(formatPrinterError('no printer configured')).toContain('Printer Settings Incomplete');
  });

  it('maps timeout and network errors', () => {
    expect(formatPrinterError('USB connection timeout')).toContain('Printer Timeout');
    expect(formatPrinterError('connect ECONNREFUSED 192.168.1.100')).toContain('Network Printer Error');
  });
});
