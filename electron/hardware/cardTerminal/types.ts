/**
 * Card terminal (ECR, semi-integrated) contract of the main process. The POS sends an amount to the shop's bank card
 * machine; the machine reads and authorises the card and answers with the result. The POS never sees full card data.
 * Design: docs/architecture/card-terminal-design.md.
 */

/** Adapters installed in this build. Add an acquirer by adding its adapter in `adapters/` and its id here. */
export type TerminalProvider = 'UNCONFIGURED' | 'NETWORK' | 'MAGNATI' | 'GEIDEA' | 'NEOPAY' | 'PINE_LABS' | 'MOCK';

export type TerminalOutcome = 'APPROVED' | 'DECLINED' | 'CANCELLED' | 'TIMEOUT' | 'ERROR' | 'UNKNOWN';

export type TerminalConnection =
  | { type: 'SERIAL'; path: string; baudRate: number }
  | { type: 'TCP'; host: string; port: number };

/** Device-local setting `card_terminal_config` (never synced: each POS PC has its own machine). */
export interface CardTerminalConfig {
  enabled: boolean;
  provider: TerminalProvider;
  connection: TerminalConnection;
  timeoutSeconds: number;
  allowManualFallback: boolean;
  merchantId?: string;
  terminalId?: string;
}

export interface TerminalRequest {
  /** Unique per attempt; the terminal echoes it and inquiries look it up. */
  ecrRef: string;
  /** Integer minor units (fils / paise). Never a float. */
  amountMinor: number;
  currency: string;
}

export interface TerminalResult {
  outcome: TerminalOutcome;
  ecrRef: string;
  amountMinor: number;
  authCode?: string;
  rrn?: string;
  terminalId?: string;
  /** Raw masked PAN from the device; the service keeps only the last 4 digits (`maskPan`). */
  maskedPan?: string;
  scheme?: string;
  responseCode?: string;
  message?: string;
}

export type StatusListener = (message: string) => void;

export interface PaymentTerminal {
  readonly provider: TerminalProvider;
  ping(): Promise<{ ok: boolean; message?: string }>;
  sale(req: TerminalRequest, signal: AbortSignal, onStatus: StatusListener): Promise<TerminalResult>;
  voidSale(req: TerminalRequest & { original: TerminalResult }, signal: AbortSignal): Promise<TerminalResult>;
  refund(req: TerminalRequest & { original?: TerminalResult }, signal: AbortSignal): Promise<TerminalResult>;
  /** Status of an earlier request; `UNKNOWN` when the device cannot tell. */
  inquire(ecrRef: string): Promise<TerminalResult>;
  /** Ask the device to abort the prompt it is showing. */
  cancel(): Promise<void>;
  close(): Promise<void>;
}

export const DEFAULT_CARD_TERMINAL_CONFIG: CardTerminalConfig = {
  enabled: false,
  provider: 'UNCONFIGURED',
  connection: { type: 'SERIAL', path: 'COM3', baudRate: 9600 },
  timeoutSeconds: 120,
  allowManualFallback: true,
};

/** Keep only the last 4 digits of whatever the device sent; anything without 4 trailing digits is dropped. */
export function maskPan(raw: string | undefined | null): string | null {
  const match = /(\d{4})\D*$/.exec(String(raw ?? ''));
  return match ? `****${match[1]}` : null;
}

/** Major units → minor units (AED → fils, INR → paise), rounded half away from zero on the cent. */
export function toMinor(amount: number): number {
  return Math.round(Math.abs(amount) * 100 + 1e-7) * Math.sign(amount);
}
