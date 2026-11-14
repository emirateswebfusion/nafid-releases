import { expect, it } from 'vitest';
import { OfflineAiIntentParser as Parser } from '../../src/services/offlineAi/intentParser';

const reports = [
  ['Sales today', 'SALES_PERIOD'],
  ['Cash sales today', 'SALES_PAYMENT_METHODS', 'CASH'],
  ['Card sales today', 'SALES_PAYMENT_METHODS', 'CARD'],
  ['Credit sales today', 'SALES_PAYMENT_METHODS', 'CREDIT'],
  ['Count today\'s invoices', 'SALES_INVOICE_COUNT'],
  ['Show today\'s shop expenses', 'EXPENSES_SUMMARY'],
  ['Show today\'s purchases', 'PURCHASES_SUMMARY'],
  ['Show sales returns this month', 'RETURNS_SUMMARY'],
  ['List returned products this month', 'RETURNS_ITEMS'],
  ['Show refunds by payment method this month', 'RETURNS_BY_METHOD'],
  ['Show this month\'s expenses by category', 'EXPENSES_BY_CATEGORY'],
  ['Show the biggest expenses this month', 'EXPENSES_LARGEST'],
  ['Show top 5 selling products today', 'TOP_SELLING_PRODUCTS'],
  ['Show today\'s sales by biller', 'SALES_BILLER_STAFF'],
] as const;

const periods = [
  ['today', 'today'], ['yesterday', 'yesterday'], ['this week', 'this_week'],
  ['last week', 'last_week'], ['this month', 'this_month'], ['last month', 'last_month'],
] as const;

const phrase = [
  (p: string) => p,
  (p: string) => `and ${p}?`,
  (p: string) => `what about ${p}?`,
  (p: string) => `how about ${p}?`,
  (p: string) => `${p} then?`,
  (p: string) => `and ${p} then?`,
];

const followUps = reports.flatMap(([first, intent, method]) => periods.flatMap(([period, rangeType]) =>
  phrase.map(format => ({ first, intent, method, rangeType, question: format(period) }))));

it.each(followUps)('$first -> $question', ({ first, intent, method, rangeType, question }) => {
  const previous = Parser.parse(first);
  const actual = Parser.parse(question, [
    { role: 'user', content: first },
    { role: 'assistant', content: 'Previous shop report', parsedIntent: previous },
  ]);
  expect(actual).toMatchObject({ intent, params: { rangeType, ...(method && { method }) } });
});

it.each([
  ['ഈ മാസം നമ്മൾ സാധനം വാങ്ങിയ വകയിൽ എത്ര രൂപ പോയി?', 'PURCHASES_SUMMARY', 'this_month'],
  ['കഴിഞ്ഞ ആഴ്ച കസ്റ്റമർമാർ എന്തൊക്കെ തിരിച്ചു തന്നു?', 'RETURNS_ITEMS', 'last_week'],
  ['Give me the number of invoices issued last week.', 'SALES_INVOICE_COUNT', 'last_week'],
  ['ഇന്നലെ കടയിൽ എത്ര ബിൽ എഴുതി?', 'SALES_INVOICE_COUNT', 'yesterday'],
  ['kazhinja masam ethra chelavu vannu?', 'EXPENSES_SUMMARY', 'last_month'],
  ['List the items that customers brought back today.', 'RETURNS_ITEMS', 'today'],
  ['ഇപ്പോൾ പെട്ടിയിൽ എത്ര കാശുണ്ട്?', 'CASH_DRAWER_CURRENT', undefined],
  ['innu counteril ethra cash undu?', 'CASH_DRAWER_CURRENT', undefined],
  ['How can I find a bill that I deleted?', 'SALES_CANCELLED_INVOICES', undefined],
])('recognizes conversational shop questions: %s', (question, intent, rangeType) => {
  expect(Parser.parse(question)).toMatchObject({ intent, ...(rangeType && { params: { rangeType } }) });
});

it.each([
  ['How much was charged to cards last month?', 'SALES_PAYMENT_METHODS', 'last_month', { method: 'CARD' }],
  ['How much was charged to cards in the last 7 days?', 'SALES_PAYMENT_METHODS', 'last_7_days', { method: 'CARD' }],
  ['Which items did we sell most yesterday?', 'TOP_SELLING_PRODUCTS', 'yesterday', { limit: 5 }],
  ['Give me a breakdown of sales by cashier last week.', 'SALES_BILLER_STAFF', 'last_week', {}],
] as const)('recognizes indirect report requests: %s', (question, intent, rangeType, params) => {
  expect(Parser.parse(question)).toMatchObject({ intent, params: { rangeType, ...params } });
});

it('classifies spending on purchases as a purchase report', () => {
  expect(Parser.parse('How much did we spend on purchases yesterday?'))
    .toMatchObject({ intent: 'PURCHASES_SUMMARY', params: { rangeType: 'yesterday' } });
});
