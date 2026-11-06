import { expect, it } from 'vitest';
import { generateReceiptText } from '../../src/utils/print/receiptGenerator';
it.each(['boxed', 'standard', 'compact', 'modern', 'classic', 'clean', 'dot', 'slim', 'luxe'])('prints point debt on %s receipts', style => {
  const receipt = generateReceiptText({ shopName: 'Shop', invoiceNumber: '1', date: '2026-11-06', items: [], subtotal: 0, tax: 0, discount: 0, grandTotal: 0, previousPointsBalance: -10, remainingPointsBalance: -10 }, 8, 42, style);
  expect(receipt).toContain('-10');
  expect(receipt).toMatch(/Balance/i);
});
