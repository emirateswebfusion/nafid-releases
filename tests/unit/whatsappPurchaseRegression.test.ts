import { it, expect } from 'vitest';
import { formatWhatsAppLedgerTxMessage } from '../../src/utils/print/whatsappBillHelper';
it('labels purchase ledger entries as Purchase, with signed grouped balances', () => {
  const entry = { openingBalance: -31063, amount: 1308, newBalance: -32371, paymentMethod: 'CREDIT', description: 'Purchase Bill #PUR-1' };
  expect(formatWhatsAppLedgerTxMessage(entry)).toBe('OB: ₹ -31,063/-\nPurchase: ₹ 1,308/-\nBalance: ₹ -32,371/-');
});
