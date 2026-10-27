import { extractDateFromText } from './dates';
import { normalizeInput } from './format';
import type { AiHistoryMessage, ParsedOfflineIntent } from './types';
import { parseGeneralIntent } from './intentRulesGeneral';
import { parseModuleIntent } from './intentRulesModules';
import { parseSalesIntent } from './intentRulesSales';

/** What every rule group sees: the message as typed, normalised text, recent history and any date in it. */
export interface IntentParseContext {
  message: string;
  history: AiHistoryMessage[];
  raw: string;
  text: string;
  lastUserMsg: string;
  dateExtraction: ReturnType<typeof extractDateFromText>;
}

/**
 * Offline AI Assistant Intent Parser
 */
export class OfflineAiIntentParser {
  static parse(message: string, history: AiHistoryMessage[] = []): ParsedOfflineIntent {
    const raw = message.trim();
    const text = normalizeInput(message);
    const lastUserMsg = [...history].reverse().find(m => m.role === 'user')?.content?.toLowerCase() || '';

    // Extract extracted date if present
    const dateExtraction = extractDateFromText(raw);

    // Rule groups run in their original order; the first match wins.
    const ctx: IntentParseContext = { message, history, raw, text, lastUserMsg, dateExtraction };
    return parseGeneralIntent(ctx) ?? parseModuleIntent(ctx) ?? parseSalesIntent(ctx);
  }
}
