import { describe, expect, it } from 'vitest';
import { buildShopClosingSummaryData } from '../../electron/whatsapp/shopClosingSummary';
import { formatClosingWhatsAppMessage } from '../../electron/whatsapp/shopClosingMessage';
import { DEFAULT_CHECKLIST, generateWhatsAppClosingMessage } from '../../src/utils/time/shopClosingHelper';
import { salesHistoryDb } from './fixtures/salesHistoryDb';

describe('Shop Closing Gross Sales & Discount Reconciliation', () => {
  it('calculates Gross Sales strictly as Net Sales + Total Discount matching Financial Report', () => {
    const { db, memory } = salesHistoryDb();
    try {
      // Invoice with grand total 1000, discount 150, scrap deduction 200, return deduction 100
      memory.exec(`
        INSERT INTO invoices(
          invoice_id, invoice_number, tenant_id, invoice_type,
          subtotal, tax_total, discount_total, points_redeemed_discount,
          scrap_deduction, return_deduction, grand_total, payment_method,
          received_amount, created_at, settled_at
        ) VALUES(
          'inv-gross-1', 'INV-G01', 't1', 'GST',
          1300, 50, 150, 0,
          200, 100, 1000, 'CASH',
          1000, '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z'
        )
      `);

      const summary = buildShopClosingSummaryData(db, 't1', '2026-11-01', {
        status: 'CLOSED',
        closed_at: '2026-11-01 21:00:00',
        opening_balance: 0,
      });

      // Net Sales is grand total
      expect(summary.netSales).toBe(1000);
      // Total discount is discount_total + points_redeemed_discount
      expect(summary.totalDiscount).toBe(150);
      // Gross sales must equal Net Sales + Discount (1000 + 150 = 1150),
      // and NOT include scrap deductions or return deductions which would inflate it
      expect(summary.grossSales).toBe(1150);

      // Verify message formatting
      const message = formatClosingWhatsAppMessage(summary, DEFAULT_CHECKLIST);
      expect(message).toContain('• Gross Sales: ₹1,150.00');
      expect(message).toContain('• Total Discount: -₹150.00');
      expect(message).toContain('• Net Sales: *₹1,000.00*');

      // Gross sales appears before Net Sales in the sales summary section
      const grossIdx = message.indexOf('Gross Sales: ₹1,150.00');
      const netIdx = message.indexOf('Net Sales: *₹1,000.00*');
      expect(grossIdx).toBeGreaterThan(-1);
      expect(netIdx).toBeGreaterThan(grossIdx);

      // Preview helper in UI matches sent format
      const previewMsg = generateWhatsAppClosingMessage(summary, DEFAULT_CHECKLIST);
      expect(previewMsg).toContain('• Gross Sales: ₹1,150.00');
      expect(previewMsg).toContain('• Total Discount: -₹150.00');
      expect(previewMsg).toContain('• Net Sales: *₹1,000.00*');
    } finally {
      memory.close();
    }
  });

  it('hides Gross Sales line when there are no discounts and gross equals net sales', () => {
    const { db, memory } = salesHistoryDb();
    try {
      memory.exec(`
        INSERT INTO invoices(
          invoice_id, invoice_number, tenant_id, invoice_type,
          subtotal, tax_total, discount_total, points_redeemed_discount,
          scrap_deduction, return_deduction, grand_total, payment_method,
          received_amount, created_at, settled_at
        ) VALUES(
          'inv-gross-2', 'INV-G02', 't1', 'GST',
          500, 0, 0, 0,
          0, 0, 500, 'CASH',
          500, '2026-11-01T11:00:00.000Z', '2026-11-01T11:00:00.000Z'
        )
      `);

      const summary = buildShopClosingSummaryData(db, 't1', '2026-11-01', {
        status: 'CLOSED',
        closed_at: '2026-11-01 21:00:00',
        opening_balance: 0,
      });

      expect(summary.netSales).toBe(500);
      expect(summary.totalDiscount).toBe(0);
      expect(summary.grossSales).toBe(500);

      const message = formatClosingWhatsAppMessage(summary, DEFAULT_CHECKLIST);
      expect(message).toContain('• Net Sales: *₹500.00*');
      expect(message).not.toContain('• Gross Sales:');
      expect(message).not.toContain('• Total Discount:');
    } finally {
      memory.close();
    }
  });
});
