import { MockTerminal } from './adapters/mock.js';
import type { CardTerminalConfig, PaymentTerminal, TerminalProvider } from './types.js';

/** One factory per installed adapter. A real acquirer adapter (from its ECR spec) is registered here. */
const FACTORIES: Record<TerminalProvider, (config: CardTerminalConfig) => PaymentTerminal> = {
  MOCK: () => new MockTerminal(),
};

export const INSTALLED_PROVIDERS = Object.keys(FACTORIES) as TerminalProvider[];

export function createTerminal(config: CardTerminalConfig): PaymentTerminal {
  const factory = FACTORIES[config.provider];
  if (!factory) throw new Error(`Card terminal provider ${String(config.provider)} is not installed`);
  return factory(config);
}
