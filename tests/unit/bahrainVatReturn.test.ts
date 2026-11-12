import { afterEach, describe, expect, it } from 'vitest';
import { setStoreCountry } from '../../src/utils/localization/storeProfile';
import { buildBahrainVatReturn } from '../../src/utils/pricing/bahrainVatReturn';

afterEach(() => setStoreCountry('IN'));

const box = (amount = 0, vatAmount = 0, adjustment = 0, adjustmentVat = 0) => ({ boxNo: '', description: '', amount, vatAmount, adjustment, adjustmentVat });
/** A quarter: 1,000.500 standard-rated sales (VAT 100.050), a 10.000 credit note (VAT 1.000), 50.250 zero-rated, 20 exempt, 400.400 purchases (VAT 40.040). */
const report = {
  section1Output: {
    standardRatedSupplies: { abuDhabi: box(), dubai: box(), sharjah: box(), ajman: box(), ummAlQuwain: box(), rasAlKhaimah: box(), fujairah: box() },
    touristRefunds: box(), reverseChargeSupplies: box(), zeroRatedSupplies: box(50.25), exemptSupplies: box(20), goodsImported: box(), adjustmentsImported: box(),
    totalOutputTax: { totalAmount: 1000.5, totalVat: 100.05, totalAdjustment: 10, totalAdjustmentVat: 1, netOutputVatDue: 99.05 },
  },
  section2Input: {
    standardRatedExpenses: { ...box(400.4, 40.04), recoverableVat: 40.04 }, reverseChargeExpenses: box(),
    totalInputTax: { totalAmount: 400.4, totalRecoverableVat: 40.04, totalAdjustment: 0, totalAdjustmentVat: 0, netInputVatRecoverable: 40.04 },
  },
};

describe('Bahrain NBR VAT return', () => {
  it('puts the period on the NBR lines, to the fils', () => {
    setStoreCountry('BH');
    const vat = buildBahrainVatReturn(report);
    const byBox = Object.fromEntries([...vat.sales, ...vat.purchases, ...vat.totals].map(row => [row.box, row]));
    expect([...vat.sales, ...vat.purchases, ...vat.totals].map(row => row.box)).toEqual(['1(a)', '1(b)', '2', '3', '4', '5', '6', '7', '8(a)', '8(b)', '9', '10', '11(a)', '11(b)', '12', '13', '14', '15', '16', '17', '18']);
    expect(byBox['1(b)']).toMatchObject({ amount: 990.5, vat: 99.05, recorded: true });      // sales less the credit note
    expect(byBox['4']).toMatchObject({ amount: 50.25, vat: 0 });
    expect(byBox['6']).toMatchObject({ amount: 20, vat: 0 });
    expect(byBox['7']).toMatchObject({ amount: 1060.75, vat: 99.05, total: true });          // 990.500 + 50.250 + 20.000
    expect(byBox['8(b)']).toMatchObject({ amount: 400.4, vat: 40.04 });
    expect(byBox['14']).toMatchObject({ amount: 400.4, vat: 40.04, total: true });
    expect(byBox['15'].vat).toBe(59.01);                                                      // 99.050 - 40.040
    expect(byBox['18'].vat).toBe(59.01);
    expect(vat).toMatchObject({ netVat: 59.01, status: 'PAYABLE' });
  });

  it('marks the lines Nafid does not record, so they are completed on the NBR portal', () => {
    setStoreCountry('BH');
    const vat = buildBahrainVatReturn(report);
    const unrecorded = [...vat.sales, ...vat.purchases, ...vat.totals].filter(row => !row.recorded).map(row => row.box);
    expect(unrecorded).toEqual(['1(a)', '2', '3', '5', '8(a)', '9', '10', '11(a)', '11(b)', '12', '13', '16', '17']);
  });

  it('reports a reclaim when input VAT exceeds output VAT', () => {
    setStoreCountry('BH');
    const vat = buildBahrainVatReturn({ ...report, section1Output: { ...report.section1Output, totalOutputTax: { totalAmount: 100, totalVat: 10, totalAdjustment: 0, totalAdjustmentVat: 0, netOutputVatDue: 10 } } });
    expect(vat).toMatchObject({ netVat: -30.04, status: 'RECLAIMABLE' });
  });
});
