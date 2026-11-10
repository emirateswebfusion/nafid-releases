import { afterAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { OfflineAiIntentParser } from '../../src/services/offlineAi/intentParser';
import { merchantCases, merchantScenarios } from './fixtures/mindMerchantScenarios';

const observed: unknown[] = [];
afterAll(() => {
  if (process.env.MIND_REPORT_PATH) writeFileSync(process.env.MIND_REPORT_PATH, JSON.stringify(observed, null, 2), 'utf8');
});

describe('independent merchant acceptance questions', () => {
  it('contains at least 500 unique complete questions across all three languages', () => {
    expect(merchantCases.length).toBeGreaterThanOrEqual(500);
    expect(new Set(merchantCases.map(c => c.question.toLowerCase())).size).toBe(merchantCases.length);
    expect(merchantScenarios.length).toBeGreaterThanOrEqual(80);
  });
  it.each(merchantCases)('$id [$language] $question', test => {
    const actual = OfflineAiIntentParser.parse(test.question);
    observed.push({ ...test, actual });
    expect(actual.intent).toBe(test.expectedIntent);
    for (const [key, expected] of Object.entries(test.expectedParams || {})) {
      const actualValue = actual.params[key as keyof typeof actual.params];
      expect(typeof actualValue === 'string' ? actualValue.toLowerCase() : actualValue, key).toBe(typeof expected === 'string' ? expected.toLowerCase() : expected);
    }
  });
});
