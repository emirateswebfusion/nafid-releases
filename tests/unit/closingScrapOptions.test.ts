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
