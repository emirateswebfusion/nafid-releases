import type { CardTerminalConfig, PaymentTerminal, TerminalProvider } from './types.js';

/** One factory per installed adapter. A real acquirer adapter (from its ECR spec) is registered here. */
const FACTORIES: Partial<Record<TerminalProvider, (config: CardTerminalConfig) => PaymentTerminal>> = {};

export const INSTALLED_PROVIDERS = Object.keys(FACTORIES) as TerminalProvider[];

export function createTerminal(config: CardTerminalConfig): PaymentTerminal {
  const factory = FACTORIES[config.provider];
  if (!factory) throw new Error('Card terminal setup pending. A verified bank connector is required. Use the card machine manually.');
  return factory(config);
}
