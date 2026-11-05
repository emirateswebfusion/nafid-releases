import { bindBridge, hasBridge } from './client';

/** Bank card machine (ECR) shapes returned by the main process. Mirrors electron/hardware/cardTerminal/types.ts. */
export type CardTerminalProvider = 'UNCONFIGURED' | 'NETWORK' | 'MAGNATI' | 'GEIDEA' | 'NEOPAY' | 'PINE_LABS' | 'MOCK';
export type CardTerminalOutcome = 'APPROVED' | 'DECLINED' | 'CANCELLED' | 'TIMEOUT' | 'ERROR' | 'UNKNOWN';

export type CardTerminalConnection =
  | { type: 'SERIAL'; path: string; baudRate: number }
  | { type: 'TCP'; host: string; port: number };

/** Device-local setting `card_terminal_config`. */
export interface CardTerminalConfig {
  enabled: boolean;
  provider: CardTerminalProvider;
  connection: CardTerminalConnection;
  timeoutSeconds: number;
  allowManualFallback: boolean;
  merchantId?: string;
  terminalId?: string;
}

export interface CardTerminalStatus {
  config: CardTerminalConfig;
  providers: CardTerminalProvider[];
  busy: boolean;
}

/** Answer of the machine for a sale / void / refund. `masked_pan` holds only the last 4 digits (`****1234`). */
export interface CardTerminalPayment {
  outcome: CardTerminalOutcome;
  ecr_ref: string;
  amount: number;
  provider: string;
  auth_code: string | null;
  rrn: string | null;
  terminal_id: string | null;
  masked_pan: string | null;
  scheme: string | null;
  message: string | null;
}

/** One journal row (`card_terminal_transactions`, device-local). */
export interface CardTerminalTransaction {
  id: string; tenant_id: string; invoice_id: string | null; ecr_ref: string; kind: string; amount_minor: number;
  currency: string; provider: string; status: string; auth_code: string | null; rrn: string | null;
  terminal_id: string | null; masked_pan: string | null; scheme: string | null; response_code: string | null;
  message: string | null; original_ecr_ref: string | null; resolved_by: string | null; created_at: string; updated_at: string;
}

/** Stored on the bill as `split_details.card_terminal`. */
export interface CardTerminalBillDetails {
  provider: string;
  ecr_ref: string | null;
  auth_code: string | null;
  rrn: string | null;
  terminal_id: string | null;
  masked_pan: string | null;
  scheme: string | null;
  amount: number;
  approved_at: string;
  manual: boolean;
}

export const CARD_TERMINAL_PROVIDER_LABELS: Record<CardTerminalProvider, string> = {
  UNCONFIGURED: 'Choose your bank / provider',
  NETWORK: 'Network / N-Genius',
  MAGNATI: 'Magnati',
  GEIDEA: 'Geidea',
  NEOPAY: 'NEOPAY',
  PINE_LABS: 'Pine Labs',
  MOCK: 'Training terminal (simulated, no real charge)',
};

/** Card machine channel catalog — the only way UI code reaches these IPC channels. */
export const cardTerminalApi = bindBridge({
  getStatus: 'cardTerminalGetStatus',
  sale: 'cardTerminalSale',
  voidSale: 'cardTerminalVoid',
  refund: 'cardTerminalRefund',
  cancel: 'cardTerminalCancel',
  resolve: 'cardTerminalResolve',
  test: 'cardTerminalTest',
  billSplitDetails: 'cardTerminalBillSplitDetails',
  listPorts: 'cardTerminalListPorts',
  listTransactions: 'cardTerminalListTransactions',
  listUnresolved: 'cardTerminalListUnresolved',
});

/** Older desktop builds have no card terminal channels. */
export const hasCardTerminal = () => hasBridge('cardTerminalGetStatus');
