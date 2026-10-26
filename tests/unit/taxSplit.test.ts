import { describe, expect, it } from 'vitest';
import { splitTaxAmount as splitRendererTaxAmount } from '../../src/utils/checkoutLines';
import { splitTaxAmount as splitMainTaxAmount } from '../../electron/utils/taxSplit';

describe('CGST/SGST tax split', () => {
  it('assigns an odd paisa to the remainder and preserves the tax', () => {
    expect(splitRendererTaxAmount(1.05)).toEqual({ cgst: 0.53, sgst: 0.52 });
    expect(splitMainTaxAmount(1.05)).toEqual({ cgst: 0.53, sgst: 0.52 });
  });
  // The main process cannot import src/ (tsconfig.electron rootDir), so the two copies must stay identical.
  it('main-process and renderer splits agree and always add up to the tax', () => {
    for (let paise = 0; paise <= 100000; paise += 7) {
      const tax = paise / 100;
      const r = splitRendererTaxAmount(tax);
      expect(splitMainTaxAmount(tax)).toEqual(r);
      expect(Math.round((r.cgst + r.sgst) * 100)).toBe(paise);
    }
  });
});
