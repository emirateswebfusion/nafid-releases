import { describe, expect, it } from 'vitest';
import { splitTaxAmount as splitRendererTaxAmount } from '../../src/utils/checkoutLines';
import { splitTaxAmount as splitMainTaxAmount } from '../../electron/utils/taxSplit';

describe('CGST/SGST tax split', () => {
  it('assigns an odd paisa to the remainder and preserves the tax', () => {
    expect(splitRendererTaxAmount(1.05)).toEqual({ cgst: 0.53, sgst: 0.52 });
    expect(splitMainTaxAmount(1.05)).toEqual({ cgst: 0.53, sgst: 0.52 });
  });
});
