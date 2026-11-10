import { formatAiTaxLabels } from './offlineAi/presentation';
import { isDesktopRuntime } from '../data/client';
import { handleSalesSummaryIntent } from './offlineAi/handlers/salesSummary';
import { handleSalesDetailIntent } from './offlineAi/handlers/salesDetail';
import { handleExpensesAndPurchasesIntent } from './offlineAi/handlers/expensesAndPurchases';
import { handleInventoryIntent } from './offlineAi/handlers/inventory';
import { handlePartiesIntent } from './offlineAi/handlers/parties';
import { handleCashierIntent } from './offlineAi/handlers/cashier';
import { handleReturnsAndPricingIntent } from './offlineAi/handlers/returnsAndPricing';
import { handleDiagnosticsIntent } from './offlineAi/handlers/diagnostics';
import { handleAssistantIntent } from './offlineAi/handlers/assistant';
import { isMalayalam } from './offlineAi/format';
import { OfflineAiIntentParser } from './offlineAi/intentParser';
import { createAiQueryContext, NOT_HANDLED } from './offlineAi/queryContext';
import type { AiHistoryMessage, OfflineAiResponse } from './offlineAi/types';
/**
 * Nafid POS Offline AI Assistant — Complete Unified Intelligence Engine
 * 100% Offline-First, Zero External API Dependency, Deterministic Local Database Execution.
 * Fully supports English, Malayalam (\u0D00-\u0D7F), and Manglish queries across all POS modules:
 * Sales, Expenses, Inventory, Purchases, Party Ledger, Cash Drawer, Returns, Discounts, Pricing, and Diagnostics.
 *
 * Pipeline: offlineAi/intentParser (question -> intent) -> offlineAi/handlers/* (intent -> answer from local data).
 */

export type { CapabilityDefinition, OfflineAiResponse, OfflineDateRange, ParsedOfflineIntent } from './offlineAi/types';

/** Handlers tried in order; each answers its own intents and returns NOT_HANDLED for the rest. */
const INTENT_HANDLERS = [
  handleSalesSummaryIntent,
  handleSalesDetailIntent,
  handleExpensesAndPurchasesIntent,
  handleInventoryIntent,
  handlePartiesIntent,
  handleCashierIntent,
  handleReturnsAndPricingIntent,
  handleDiagnosticsIntent,
];

/**
 * Offline AI Query Processor
 * Executes against local SQLite database via isDesktopRuntime()
 */
export async function processOfflineAiQuery(
  queryText: string,
  tenantId: string,
  history: AiHistoryMessage[] = []
): Promise<OfflineAiResponse> {
  if (!isDesktopRuntime() || !tenantId) {
    throw new Error('Local SQLite database connection is unavailable.');
  }

  const isMal = isMalayalam(queryText);
  const parsed = OfflineAiIntentParser.parse(queryText, history);

  const ctx = createAiQueryContext(queryText, tenantId, history, isMal);

  try {
    for (const handle of INTENT_HANDLERS) {
      const answer = await handle(parsed, ctx);
      if (answer !== NOT_HANDLED) return { ...answer, content: formatAiTaxLabels(answer.content), parsedIntent: answer.parsedIntent ?? parsed };
    }
    const answer = await handleAssistantIntent(parsed, ctx);
    return { ...answer, content: formatAiTaxLabels(answer.content), parsedIntent: answer.parsedIntent ?? parsed };
  } catch (err) {
    console.error('[OfflineAiService] Error processing offline query:', err);
    return {
      content: isMal
        ? `ക്ഷമിക്കണം, ഓഫ്‌ലൈൻ ചോദ്യം പരിശോധിക്കുന്നതിൽ തടസ്സം നേരിട്ടു: ${(err as Error).message || 'Error executing query'}`
        : `An error occurred while evaluating the offline query: ${(err as Error).message || 'Error executing query'}`,
    };
  }
}
