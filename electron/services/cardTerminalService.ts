import { randomBytes, randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import log from 'electron-log/main';
import { getDb } from '../db/localDb.js';
import * as cardTerminalSql from '../db/statements/cardTerminal.js';
import { createTerminal, INSTALLED_PROVIDERS } from '../hardware/cardTerminal/registry.js';
import { checkConnection, listSerialPorts } from '../hardware/cardTerminal/transport.js';
import {
  DEFAULT_CARD_TERMINAL_CONFIG, maskPan, toMinor,
  type CardTerminalConfig, type PaymentTerminal, type TerminalOutcome, type TerminalRequest, type TerminalResult,
} from '../hardware/cardTerminal/types.js';

/**
 * Card machine use-cases (called by electron/ipc/cardTerminalHandlers.ts). One request at a time per POS PC; every
 * request is journaled in `card_terminal_transactions` before it is sent. An answer that never arrives is resolved by
 * an inquiry, never by sending the payment again. Only the last 4 card digits are stored or logged.
 */

type Kind = 'SALE' | 'VOID' | 'REFUND';

export interface CardTerminalPayment {
  outcome: TerminalOutcome;
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

export interface CardTerminalTransactionRow {
  id: string; tenant_id: string; invoice_id: string | null; ecr_ref: string; kind: string; amount_minor: number;
  currency: string; provider: string; status: string; auth_code: string | null; rrn: string | null;
  terminal_id: string | null; masked_pan: string | null; scheme: string | null; response_code: string | null;
  message: string | null; original_ecr_ref: string | null; resolved_by: string | null; created_at: string; updated_at: string;
}

const MAX_AMOUNT_MINOR = 100_000_000; // AED 1,000,000: guards against a mistyped amount reaching the machine
let terminal: PaymentTerminal | null = null;
let terminalKey = '';
let active: { controller: AbortController; ecrRef: string; cancelled: boolean } | null = null;

const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? value as Record<string, unknown> : {});
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** The saved device configuration, completed with defaults; an adapter not installed in this build falls back to the default. */
export function getConfig(): CardTerminalConfig {
  let saved: Record<string, unknown> = {};
  try {
    const row = cardTerminalSql.findConfig(getDb()).get() as { value?: string } | undefined;
    saved = record(row?.value ? JSON.parse(row.value) : {});
  } catch { /* unreadable setting: defaults */ }
  const connection = record(saved.connection);
  const timeout = Number(saved.timeoutSeconds);
  return {
    enabled: saved.enabled === true,
    provider: INSTALLED_PROVIDERS.includes(saved.provider as CardTerminalConfig['provider'])
      ? saved.provider as CardTerminalConfig['provider'] : DEFAULT_CARD_TERMINAL_CONFIG.provider,
    connection: connection.type === 'TCP'
      ? { type: 'TCP', host: String(connection.host || ''), port: Number(connection.port) || 0 }
      : { type: 'SERIAL', path: String(connection.path || 'COM3'), baudRate: Number(connection.baudRate) || 9600 },
    timeoutSeconds: Number.isFinite(timeout) && timeout >= 30 && timeout <= 300 ? timeout : DEFAULT_CARD_TERMINAL_CONFIG.timeoutSeconds,
    allowManualFallback: saved.allowManualFallback !== false,
  };
}

/** IPC `cardTerminal:getStatus`: configuration, installed adapters, and whether a request is running. */
export function getStatus() {
  return { config: getConfig(), providers: INSTALLED_PROVIDERS, busy: Boolean(active) };
}

function terminalFor(config: CardTerminalConfig): PaymentTerminal {
  const key = JSON.stringify([config.provider, config.connection]);
  if (!terminal || key !== terminalKey) {
    void terminal?.close().catch(() => undefined);
    terminal = createTerminal(config);
    terminalKey = key;
  }
  return terminal;
}

function emitStatus(ecrRef: string, message: string) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('cardTerminal:status', { ecr_ref: ecrRef, message });
  }
}

const newEcrRef = () => `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`.toUpperCase();
const nowIso = () => new Date().toISOString();

function failure(message: string, provider = ''): CardTerminalPayment {
  return { outcome: 'ERROR', ecr_ref: '', amount: 0, provider, auth_code: null, rrn: null, terminal_id: null, masked_pan: null, scheme: null, message };
}

function toPayment(result: TerminalResult, provider: string): CardTerminalPayment {
  return {
    outcome: result.outcome, ecr_ref: result.ecrRef, amount: result.amountMinor / 100, provider,
    auth_code: result.authCode ?? null, rrn: result.rrn ?? null, terminal_id: result.terminalId ?? null,
    masked_pan: maskPan(result.maskedPan), scheme: result.scheme ?? null, message: result.message ?? null,
  };
}

function saveResult(result: TerminalResult, resolvedBy: string) {
  cardTerminalSql.updateResult(getDb()).run({
    ecr_ref: result.ecrRef, status: result.outcome, auth_code: result.authCode ?? null, rrn: result.rrn ?? null,
    terminal_id: result.terminalId ?? null, masked_pan: maskPan(result.maskedPan), scheme: result.scheme ?? null,
    response_code: result.responseCode ?? null, message: result.message ?? null, resolved_by: resolvedBy, now: nowIso(),
  });
}

async function run(
  kind: Kind,
  args: { tenantId: string; invoiceId: string | null; amountMinor: number; currency?: string; originalEcrRef?: string | null },
  op: (device: PaymentTerminal, req: TerminalRequest, signal: AbortSignal) => Promise<TerminalResult>,
): Promise<CardTerminalPayment> {
  const config = getConfig();
  if (!config.enabled) return failure('The card terminal is turned off in Hardware settings');
  if (active) return failure('Another card payment is in progress on this terminal', config.provider);
  if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0 || args.amountMinor > MAX_AMOUNT_MINOR) return failure('Invalid card amount', config.provider);

  let device: PaymentTerminal;
  try { device = terminalFor(config); } catch (err) { return failure((err as Error).message, config.provider); }
  const req: TerminalRequest = { ecrRef: newEcrRef(), amountMinor: args.amountMinor, currency: args.currency || 'AED' };
  cardTerminalSql.insertTransaction(getDb()).run({
    id: randomUUID(), tenant_id: args.tenantId, invoice_id: args.invoiceId, ecr_ref: req.ecrRef, kind,
    amount_minor: req.amountMinor, currency: req.currency, provider: config.provider,
    original_ecr_ref: args.originalEcrRef ?? null, now: nowIso(),
  });

  const controller = new AbortController();
  active = { controller, ecrRef: req.ecrRef, cancelled: false };
  const current = active;
  const timer = setTimeout(() => controller.abort(), config.timeoutSeconds * 1000);
  let result: TerminalResult;
  let resolvedBy = 'DEVICE';
  try {
    result = await op(device, req, controller.signal);
  } catch (err) {
    // No answer (timeout, cancel, lost link): ask the device what happened instead of guessing or resending.
    resolvedBy = 'INQUIRY';
    log.warn(`[CardTerminal] ${kind} ${req.ecrRef}: no answer (${controller.signal.aborted ? (current.cancelled ? 'cancelled' : 'timeout') : (err as Error).message}); inquiring`);
    try { result = await device.inquire(req.ecrRef); } catch { result = { outcome: 'UNKNOWN', ecrRef: req.ecrRef, amountMinor: req.amountMinor }; }
    if (result.outcome === 'UNKNOWN') {
      result = { ...result, ecrRef: req.ecrRef, amountMinor: req.amountMinor, message: current.cancelled
        ? 'Cancelled, but the terminal did not confirm. Check the terminal screen or slip.'
        : 'No answer from the terminal. Check the terminal screen or slip.' };
    }
  } finally {
    clearTimeout(timer);
    active = null;
  }
  if (result.ecrRef !== req.ecrRef || result.amountMinor !== req.amountMinor) {
    // An answer for another request or another amount is never accepted as this payment.
    result = { outcome: 'UNKNOWN', ecrRef: req.ecrRef, amountMinor: req.amountMinor, message: 'The terminal answered for a different payment. Check the terminal slip.' };
  }
  saveResult(result, resolvedBy);
  log.info(`[CardTerminal] ${kind} ${req.ecrRef} ${req.amountMinor} → ${result.outcome}`);
  emitStatus(req.ecrRef, result.message || result.outcome);
  return toPayment(result, config.provider);
}

const currencyOf = (value: unknown) => (typeof value === 'string' && /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : 'AED');

function amountMinorOf(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? toMinor(amount) : NaN;
}

/** IPC `cardTerminal:sale`: send a bill's card amount (AED) to the machine. */
export function sale(payload: unknown): Promise<CardTerminalPayment> {
  const p = record(payload);
  return run('SALE', { tenantId: text(p.tenant_id) || 'global', invoiceId: text(p.invoice_id), amountMinor: amountMinorOf(p.amount), currency: currencyOf(p.currency) },
    (device, req, signal) => device.sale(req, signal, message => emitStatus(req.ecrRef, message)));
}

function approvedOriginal(ecrRef: string | null): CardTerminalTransactionRow | null {
  if (!ecrRef) return null;
  const row = cardTerminalSql.findByEcrRef(getDb()).get(ecrRef) as CardTerminalTransactionRow | undefined;
  return row && row.kind === 'SALE' && row.status === 'APPROVED' ? row : null;
}

const resultOf = (row: CardTerminalTransactionRow): TerminalResult => ({
  outcome: 'APPROVED', ecrRef: row.ecr_ref, amountMinor: row.amount_minor, authCode: row.auth_code ?? undefined,
  rrn: row.rrn ?? undefined, terminalId: row.terminal_id ?? undefined,
});

/** IPC `cardTerminal:void`: cancel an approved sale (same day, before the terminal settles its batch). */
export async function voidSale(payload: unknown): Promise<CardTerminalPayment> {
  const p = record(payload);
  const original = approvedOriginal(text(p.ecr_ref));
  if (!original) return failure('Only an approved card sale can be voided');
  const result = await run('VOID', { tenantId: original.tenant_id, invoiceId: original.invoice_id, amountMinor: original.amount_minor, currency: original.currency, originalEcrRef: original.ecr_ref },
    (device, req, signal) => device.voidSale({ ...req, original: resultOf(original) }, signal));
  if (result.outcome === 'APPROVED') cardTerminalSql.updateStatus(getDb()).run('VOIDED', nowIso(), original.ecr_ref);
  return result;
}

/** IPC `cardTerminal:refund`: pay money back to a card, linked to the original sale when known. */
export function refund(payload: unknown): Promise<CardTerminalPayment> {
  const p = record(payload);
  const original = approvedOriginal(text(p.original_ecr_ref));
  return run('REFUND', { tenantId: text(p.tenant_id) || 'global', invoiceId: text(p.invoice_id), amountMinor: amountMinorOf(p.amount), currency: currencyOf(p.currency), originalEcrRef: original?.ecr_ref ?? null },
    (device, req, signal) => device.refund({ ...req, original: original ? resultOf(original) : undefined }, signal));
}

/** IPC `cardTerminal:cancel`: abort the running request and ask the device to drop its prompt. */
export async function cancel(): Promise<{ success: boolean }> {
  if (!active) return { success: false };
  active.cancelled = true;
  try { await terminal?.cancel(); } catch { /* the inquiry after abort decides the outcome */ }
  active.controller.abort();
  return { success: true };
}

/** IPC `cardTerminal:resolve`: the cashier records what the terminal slip says for a payment with no answer. */
export function resolve(payload: unknown): { success: boolean; error?: string } {
  const p = record(payload);
  const ecrRef = text(p.ecr_ref);
  const outcome = p.outcome === 'APPROVED' || p.outcome === 'DECLINED' ? p.outcome : null;
  if (!ecrRef || !outcome) return { success: false, error: 'Choose approved or not charged' };
  const row = cardTerminalSql.findByEcrRef(getDb()).get(ecrRef) as CardTerminalTransactionRow | undefined;
  if (!row || !['SENT', 'UNKNOWN'].includes(row.status)) return { success: false, error: 'This payment is already resolved' };
  saveResult({ outcome, ecrRef, amountMinor: row.amount_minor, authCode: text(p.auth_code)?.slice(0, 12), message: 'Confirmed by cashier from the terminal slip' }, 'CASHIER');
  return { success: true };
}

/** IPC `cardTerminal:test`: proves the adapter and the cable / IP answer. */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const config = getConfig();
  try {
    if (config.provider !== 'MOCK') {
      const link = await checkConnection(config.connection);
      if (!link.ok) return link;
    }
    const pong = await terminalFor(config).ping();
    return { ok: pong.ok, message: pong.message || (pong.ok ? 'Terminal ready' : 'Terminal did not answer') };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** IPC `cardTerminal:billSplitDetails`: a saved bill's `split_details`, to keep its card payment when the bill is edited. */
export function billSplitDetails(payload: unknown): { split_details: string | null } {
  const invoiceId = text(record(payload).invoice_id);
  const row = invoiceId ? cardTerminalSql.findInvoiceSplitDetails(getDb()).get(invoiceId) as { split_details?: string | null } | undefined : undefined;
  return { split_details: row?.split_details ?? null };
}

/** IPC `cardTerminal:listPorts` */
export const listPorts = () => listSerialPorts();

/** IPC `cardTerminal:listTransactions` */
export function listTransactions(payload: unknown): CardTerminalTransactionRow[] {
  const p = record(payload);
  const limit = Math.min(Math.max(Number(p.limit) || 20, 1), 200);
  return cardTerminalSql.listRecent(getDb()).all(text(p.tenant_id) || 'global', limit) as CardTerminalTransactionRow[];
}

/** IPC `cardTerminal:listUnresolved`: payments sent with no final answer (crash, timeout), oldest first. */
export function listUnresolved(payload: unknown): CardTerminalTransactionRow[] {
  return cardTerminalSql.listUnresolved(getDb()).all(text(record(payload).tenant_id) || 'global') as CardTerminalTransactionRow[];
}
