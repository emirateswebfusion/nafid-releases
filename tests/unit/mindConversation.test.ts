import { describe, expect, it } from 'vitest';
import { OfflineAiIntentParser as Parser } from '../../src/services/offlineAi/intentParser';
import type { AiHistoryMessage, ParsedOfflineIntent } from '../../src/services/offlineAi/types';

function after(parsedIntent: ParsedOfflineIntent): AiHistoryMessage[] {
  // Persisted metadata, rather than parsing translated assistant prose.
  return JSON.parse(JSON.stringify([{ role: 'assistant', content: 'Report / ചോദ്യം', parsedIntent }]));
}

describe('Mind clarification conversations', () => {
  it('asks for a loyalty customer and accepts the name alone', () => {
    const first = Parser.parse('loyalty');
    expect(first).toMatchObject({ clarificationRequired: true, params: { topic: 'loyalty_customer' } });
    expect(Parser.parse('Ravi Kumar', after(first))).toMatchObject({ intent: 'LOYALTY_POINTS', params: { customerName: 'Ravi Kumar' } });
  });
  it.each(['ഇന്ന് എത്ര കിട്ടി?', 'inn ethra kitti?', 'innu etra kitti', 'How much did we get today?', 'today collection?', 'ഇന്നലെ എത്ര ലഭിച്ചു?', 'how much did we make', 'എത്ര രൂപയുണ്ടായി'])('asks before interpreting money: %s', q => {
    const result = Parser.parse(q);
    expect(result).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', params: { topic: 'financial_metric' } });
    expect(result.choices).toHaveLength(3);
    expect(result.params.message).toContain('cash sales');
  });

  it.each(['2', 'second', 'രണ്ടാമത്തേത്', 'randamathe'])('resolves a short choice across languages: %s', answer => {
    const first = Parser.parse('ഇന്നലെ എത്ര കിട്ടി?');
    expect(Parser.parse(answer, after(first))).toMatchObject({ intent: 'SALES_PAYMENT_METHODS', params: { method: 'CASH', rangeType: 'yesterday' } });
  });

  it.each(['sales', 'സെയിൽസ്'])('keeps the original period when selecting sales: %s', answer => {
    expect(Parser.parse(answer, after(Parser.parse('yesterday collection')))).toMatchObject({ intent: 'SALES_PERIOD', params: { rangeType: 'yesterday' } });
  });

  it.each(['yesterday', 'ഇന്നലെ', 'innale', 'what about yesterday'])('answers the pending sales-period question: %s', answer => {
    expect(Parser.parse(answer, after(Parser.parse('sales')))).toMatchObject({ intent: 'SALES_PERIOD', params: { rangeType: 'yesterday' } });
  });

  it.each(['sales today', 'cash sales today', 'expenses this month'])('changes the period without changing the report: %s', q => {
    const first = Parser.parse(q);
    const result = Parser.parse('ഇന്നലെ', after(first));
    expect(result.params.rangeType).toBe('yesterday');
    expect(result.intent).toBe(first.intent === 'SALES_TODAY' ? 'SALES_PERIOD' : first.intent);
  });

  it.each(['today', 'ഇന്ന്', 'yesterday', 'how much', 'show banana moon today', '2', '???'])('does not invent a sales request: %s', q => {
    expect(Parser.parse(q).clarificationRequired).toBe(true);
  });

  it('does not mistake an ordinary follow-up for a comparison', () => {
    expect(Parser.parse('yesterday', after(Parser.parse('sales today'))).intent).toBe('SALES_PERIOD');
  });

  it('lets a new complete question replace pending clarification', () => {
    expect(Parser.parse('show low stock items', after(Parser.parse('today collection'))).intent).toBe(Parser.parse('show low stock items').intent);
  });

  it('does not resurrect stale context after another user turn', () => {
    expect(Parser.parse('yesterday', [...after(Parser.parse('sales today')), { role: 'user', content: 'new question' }]).clarificationRequired).toBe(true);
  });

  it('keeps choices available after an invalid answer', () => {
    const pending = Parser.parse('today collection');
    expect(Parser.parse('9', after(pending))).toEqual(pending);
    expect(Parser.parse('അതെ', after(pending))).toEqual(pending);
  });

  it('handles an old saved chat without metadata safely', () => {
    expect(Parser.parse('2', [{ role: 'assistant', content: 'Which report?' }]).clarificationRequired).toBe(true);
  });

  it('can cancel a pending question', () => {
    expect(Parser.parse('വേണ്ട', after(Parser.parse('today collection'))).params.topic).toBe('report_module');
  });

  it('asks for a period after choosing an ambiguous metric without a date', () => {
    const metric = Parser.parse('2', after(Parser.parse('how much did we get')));
    expect(metric.params.topic).toBe('cash_period');
    expect(Parser.parse('last month', after(metric))).toMatchObject({ intent: 'SALES_PAYMENT_METHODS', params: { method: 'CASH', rangeType: 'last_month' } });
  });

  it('handles a multi-step report and period selection', () => {
    const module = Parser.parse('report');
    const period = Parser.parse('1', after(module));
    expect(period.params.topic).toBe('sales_period');
    expect(Parser.parse('2', after(period))).toMatchObject({ intent: 'SALES_PERIOD', params: { rangeType: 'yesterday' } });
  });

  it.each(['cash sales last month', 'card sales last month', 'upi sales last month'])('keeps last month distinct from this month: %s', q => {
    expect(Parser.parse(q).params.rangeType).toBe('last_month');
  });

  it.each([
    ['stock of specific product', 'Milk', 'INVENTORY_PRODUCT_STOCK', 'productName'],
    ['balance of someone', 'Ravi Kumar', 'PARTY_LEDGER', 'searchQuery'],
    ['bills containing specific product', 'Mixi Jar', 'SALES_BILLS_CONTAINING_PRODUCT', 'productName'],
  ])('accepts a name after asking for it: %s', (q, answer, intent, key) => {
    const pending = Parser.parse(q);
    expect(pending.clarificationRequired).toBe(true);
    expect(Parser.parse(answer, after(pending))).toMatchObject({ intent, params: { [key]: answer } });
  });

  it.each(['customer', 'supplier', 'cash'])('accepts a short balance type: %s', q => {
    expect(Parser.parse(q, after(Parser.parse('balance'))).clarificationRequired).not.toBe(true);
  });

  it('keeps the sales period when switching payment method', () => {
    expect(Parser.parse('what about cash', after(Parser.parse('sales last month')))).toMatchObject({ intent: 'SALES_PAYMENT_METHODS', params: { rangeType: 'last_month', method: 'CASH' } });
  });

  it('does not attach a new period to a current-state drawer report', () => {
    expect(Parser.parse('yesterday', after(Parser.parse('current cash drawer balance'))).clarificationRequired).toBe(true);
  });

  it('does not treat yes as a product name', () => {
    const pending = Parser.parse('stock of specific product');
    expect(Parser.parse('yes', after(pending))).toEqual(pending);
  });

  it('recognizes a Malayalam collection question as ambiguous money', () => {
    expect(Parser.parse('ഇന്നത്തെ കളക്ഷൻ എത്ര?').params.topic).toBe('financial_metric');
  });
});
