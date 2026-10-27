import { describe, it, expect } from 'vitest';
import { parseBillFormats, getPartyMessageTypes, allowsPartyMessage, buildBillShares, formatPurchaseLedgerMessage } from '../../src/utils/print/whatsappSharing';

describe('WhatsApp sharing preferences', () => {
  it('preserves text and A4 defaults and accepts each available format', () => {
    expect(parseBillFormats(null)).toEqual(['text', 'a4']);
    for (const format of ['text', 'a4', 'thermal']) expect(parseBillFormats([format])).toEqual([format]);
    expect(parseBillFormats([])).toEqual(['text', 'a4']);
  });
  it('loads distinct types and custom categories from party data', () => {
    expect(getPartyMessageTypes([{ party_type: 'SUPPLIER' }, { party_type: 'OTHER', custom_category: 'Workshop' }, { party_type: 'SUPPLIER' }])).toEqual(['SUPPLIER', 'Workshop']);
  });
  it('defaults to all types; an explicit empty selection excludes everyone', () => {
    expect(allowsPartyMessage(null, { party_type: 'STAFF' })).toBe(true);
    expect(allowsPartyMessage([], { party_type: 'STAFF' })).toBe(false);
    expect(allowsPartyMessage(['Workshop'], { party_type: 'OTHER', custom_category: 'Workshop' })).toBe(true);
    expect(allowsPartyMessage(['CUSTOMER'], { party_type: 'SUPPLIER' })).toBe(false);
  });
  it('shares only selected content and does not promise a missing attachment', () => {
    const input = { phone: '123', message: 'Summary\n📄 Detailed PDF invoice is attached below.', a4Html: '<h1>Invoice</h1>', receiptText: '<Shop>\nTotal 10', invoiceNumber: 'B1' };
    expect(buildBillShares(input, ['text'])).toEqual([{ phone: '123', message: 'Summary' }]);
    const shares = buildBillShares(input, ['a4', 'thermal']);
    expect(shares).toHaveLength(2);
    expect(shares[0].htmlContent).toBe(input.a4Html);
    expect(shares[0].message).not.toContain('Summary');
    expect(shares[1].receiptText).toBe(input.receiptText);
    expect(shares[1].receiptWidthMm).toBe(80);
    expect(shares[1].fileName).toContain('Receipt');
  });
});
describe('supplier purchase WhatsApp message', () => {
  it('uses signed ledger figures for the reported example', () => {
    expect(formatPurchaseLedgerMessage({ credit_amount: 0, debit_amount: 1308, running_balance: -32371 })).toBe('OB: ₹ -31,063/-\nPurchase: ₹ 1,308/-\nBalance: ₹ -32,371/-');
  });
  it('keeps fractional amounts and does not replace historical balances with current balances', () => {
    expect(formatPurchaseLedgerMessage({ credit_amount: 0, debit_amount: 10.25, running_balance: -15.5 })).toBe('OB: ₹ -5.25/-\nPurchase: ₹ 10.25/-\nBalance: ₹ -15.50/-');
  });
});
