import { describe, expect, it } from 'vitest';
import { DEFAULT_CHECKLIST, generateWhatsAppClosingMessage, getSampleClosingSummary } from '../../src/utils/time/shopClosingHelper';
import { formatClosingWhatsAppMessage } from '../../electron/whatsapp/shopClosingMessage';

const sample = getSampleClosingSummary();
sample.scrapSummary = { totalAmount: 60, count: 3, items: [
  { type: 'PURCHASE', categoryName: 'Iron', quantity: 1, rate: 10, totalAmount: 10 },
  { type: 'PURCHASE', categoryName: 'Iron', quantity: 2, rate: 10, totalAmount: 20 },
  { type: 'SALE', categoryName: 'Copper', quantity: 1, rate: 30, totalAmount: 30 },
] };

for (const [name, format] of [['preview', generateWhatsAppClosingMessage], ['sent report', formatClosingWhatsAppMessage]] as const) {
  describe(name + ' scrap options', () => {
    it('shows purchase total only when details and sales are off', () => {
      const text = format(sample, { ...DEFAULT_CHECKLIST, scrapSales: false, scrapCategories: false });
      expect(text).toContain('Scrap Purchase Total:* ₹30.00');
      expect(text).not.toContain('Copper');
      expect(text).not.toContain('Scrap Sales Total');
    });
    it('adds sales independently and aggregates each category', () => {
      const text = format(sample, { ...DEFAULT_CHECKLIST, scrapSales: true, scrapCategories: true });
      expect(text).toContain('Scrap Sales Total:* ₹30.00');
      expect(text).toContain('Iron (Purchase): *₹30.00*');
      expect(text).toContain('Copper (Sale): *₹30.00*');
    });
    it('hides all scrap information when the master option is off', () => {
      const text = format(sample, { ...DEFAULT_CHECKLIST, scrap: false });
      expect(text).not.toContain('SCRAP ENTRIES');
    });
  });
}

import { buildShopClosingSummaryData } from '../../electron/whatsapp/shopClosingSummary';
import { salesHistoryDb } from './fixtures/salesHistoryDb';

describe('Shop closing scrap reconciliation', () => {
  it('does not double count scrap purchase when scrap is redeemed as a bill deduction', () => {
    const { db, memory } = salesHistoryDb();
    try {
      memory.exec("INSERT INTO scrap_categories(scrap_category_id, tenant_id, name, unit) VALUES('cat1', 't1', 'Old Vessels', 'KG')");
      memory.exec("INSERT INTO scrap_transactions(transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, transaction_date) VALUES('st1', 't1', 'PURCHASE', 'cat1', 2, 336.5, 673, '2026-10-29 10:00:00')");
      memory.exec("INSERT INTO invoices(invoice_id, invoice_number, tenant_id, invoice_type, subtotal, tax_total, discount_total, points_redeemed_discount, scrap_deduction, return_deduction, grand_total, payment_method, received_amount, created_at, settled_at) VALUES('inv1', 'INV-001', 't1', 'GST', 1200, 0, 0, 0, 673, 0, 527, 'CASH', 527, '2026-10-29T10:30:00.000Z', '2026-10-29T10:30:00.000Z')");

      const summary = buildShopClosingSummaryData(db, 't1', '2026-10-29', { status: 'OPEN', opening_balance: 0 });
      expect(summary.scrapSummary.totalAmount).toBe(673);
      expect(summary.scrapSummary.count).toBe(1);
      expect(summary.scrapSummary.items.length).toBe(1);
      expect(summary.scrapSummary.items[0].totalAmount).toBe(673);

      const message = formatClosingWhatsAppMessage(summary, { ...DEFAULT_CHECKLIST, scrapSales: true, scrapCategories: false });
      expect(message).toContain('*Scrap Purchase Total:* ₹673.00');
      expect(message).toContain('*Scrap Sales Total:* ₹0.00');
      expect(message).not.toContain('1,346');
    } finally {
      memory.close();
    }
  });
});
