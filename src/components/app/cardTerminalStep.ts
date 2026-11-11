import { moneyScale } from '../../utils/pricing/moneyRounding';
import { cardTerminalApi, hasCardTerminal, type CardTerminalBillDetails, type CardTerminalPayment } from '../../data/cardTerminal';
import { useCardTerminalStore, type CardTerminalPrompt } from '../../store/cardTerminalStore';
import { getStoreProfile } from '../../utils/localization/storeProfile';

/**
 * Card machine steps around bill documents (design: docs/architecture/card-terminal-design.md). Every function is a
 * no-op unless the card terminal is enabled in Hardware settings, so checkout behaves exactly as before when it is off.
 * The approved payment is stored on the bill as `split_details.card_terminal`; ledger and amount rules do not change.
 */

export type CardStepResult = { ok: true; details: CardTerminalBillDetails | null } | { ok: false; message: string };

/** A card payment charged for a bill that is not saved yet; voided if the save fails (`settleCardTerminalStep`). */
let pendingCharge: CardTerminalBillDetails | null = null;

export interface CardStepInput {
  tenantId: string;
  invoiceId: string;
  paymentMethod: string;
  cardAmount: number;
  /** Quotation, return, save-only or scrap: nothing is charged. */
  skip?: boolean;
  /** Editing a saved bill: its earlier terminal payment is kept, not charged again. */
  isEditing?: boolean;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * moneyScale()) / moneyScale();
const ui = () => useCardTerminalStore.getState();

/** The card part of a bill: the whole total for CARD, the Card tile for SPLIT, nothing otherwise. */
export function cardAmountOf(paymentMethod: string, grandTotal: number, splitCard: unknown): number {
  if (paymentMethod === 'CARD') return round2(grandTotal);
  if (paymentMethod === 'SPLIT') return round2(Number(splitCard) || 0);
  return 0;
}

/** `split_details.card_terminal` of a stored bill (object or JSON string, possibly encoded twice). */
export function readBillCardDetails(splitDetails: unknown): CardTerminalBillDetails | null {
  let value = splitDetails;
  for (let i = 0; i < 3 && typeof value === 'string'; i++) {
    try { value = JSON.parse(value); } catch { return null; }
  }
  const details = value && typeof value === 'object' ? (value as Record<string, unknown>).card_terminal : null;
  if (!details || typeof details !== 'object') return null;
  const amount = Number((details as Record<string, unknown>).amount);
  return Number.isFinite(amount) ? details as CardTerminalBillDetails : null;
}

function toDetails(payment: Pick<CardTerminalPayment, 'provider' | 'ecr_ref' | 'auth_code' | 'rrn' | 'terminal_id' | 'masked_pan' | 'scheme'>, amount: number, manual: boolean): CardTerminalBillDetails {
  return {
    provider: payment.provider, ecr_ref: payment.ecr_ref || null, auth_code: payment.auth_code || null, rrn: payment.rrn || null,
    terminal_id: payment.terminal_id || null, masked_pan: payment.masked_pan || null, scheme: payment.scheme || null,
    amount, approved_at: new Date().toISOString(), manual,
  };
}

async function terminalStatus() {
  if (!hasCardTerminal()) return null;
  try {
    const status = await cardTerminalApi.getStatus();
    return status.config.enabled ? status : null;
  } catch {
    return null;
  }
}

const waiting = (title: string, amount: number, message: string, cancellable = false): CardTerminalPrompt =>
  ({ title, amount, message, tone: 'waiting', cancellable, actions: [] });

async function notice(title: string, amount: number, message: string, tone: CardTerminalPrompt['tone']) {
  await ui().ask({ title, amount, message, tone, actions: [{ id: 'ok', label: 'OK', tone: 'primary' }] });
  ui().close();
}

/** Charge `amount` until approved, recorded manually, or the cashier goes back to the bill. */
async function charge(input: CardStepInput, amount: number, allowManual: boolean): Promise<CardStepResult> {
  const title = 'Card payment';
  for (;;) {
    ui().show(waiting(title, amount, 'Sending the amount to the card terminal…', true));
    const res = await cardTerminalApi.sale({ tenant_id: input.tenantId, invoice_id: input.invoiceId, amount, currency: getStoreProfile().currency });
    if (res.outcome === 'APPROVED') {
      ui().close();
      return { ok: true, details: toDetails(res, amount, false) };
    }
    let failure = res.message || 'The card payment was not completed.';
    if (res.outcome === 'UNKNOWN' || res.outcome === 'TIMEOUT') {
      const slip = await ui().ask({
        title, amount, tone: 'warning', message: `${failure} Was the payment approved?`,
        input: { label: 'Auth code from the slip', placeholder: 'e.g. 123456' },
        actions: [
          { id: 'approved', label: 'Approved on slip', tone: 'primary', requiresInput: true },
          { id: 'declined', label: 'Not charged', tone: 'neutral' },
        ],
      });
      if (slip.action === 'approved') {
        await cardTerminalApi.resolve({ ecr_ref: res.ecr_ref, outcome: 'APPROVED', auth_code: slip.input });
        ui().close();
        return { ok: true, details: toDetails({ ...res, auth_code: slip.input.trim() }, amount, true) };
      }
      if (slip.action !== 'declined') {
        ui().close();
        return { ok: false, message: 'Card payment not confirmed. Check it under Settings → Hardware → Card terminal.' };
      }
      await cardTerminalApi.resolve({ ecr_ref: res.ecr_ref, outcome: 'DECLINED' });
      failure = 'Not charged.';
    }
    const choice = await ui().ask({
      title, amount, tone: 'error', message: failure,
      input: allowManual ? { label: 'Auth code (only for a manual entry)', placeholder: 'optional' } : undefined,
      actions: [
        { id: 'retry', label: 'Try again', tone: 'primary' },
        ...(allowManual ? [{ id: 'manual', label: 'Card paid on terminal, record manually', tone: 'neutral' as const }] : []),
        { id: 'back', label: 'Back to bill', tone: 'neutral' },
      ],
    });
    if (choice.action === 'retry') continue;
    ui().close();
    if (choice.action === 'manual') {
      return { ok: true, details: toDetails({ provider: res.provider, ecr_ref: '', auth_code: choice.input.trim(), rrn: null, terminal_id: null, masked_pan: null, scheme: null }, amount, true) };
    }
    return { ok: false, message: failure };
  }
}

/** Before saving a bill: send its card part to the terminal and return the details to store on the bill. */
export async function runCardTerminalStep(input: CardStepInput): Promise<CardStepResult> {
  pendingCharge = null;
  const amount = round2(input.cardAmount);
  if (input.skip || !hasCardTerminal()) return { ok: true, details: null };
  let existing: CardTerminalBillDetails | null = null;
  if (input.isEditing) {
    try { existing = readBillCardDetails((await cardTerminalApi.billSplitDetails({ invoice_id: input.invoiceId })).split_details); } catch { existing = null; }
  }
  // An edit that keeps the card amount keeps the payment record, whether or not the terminal is on now.
  if (existing && amount > 0 && Math.abs(Number(existing.amount) - amount) < 0.005) return { ok: true, details: existing };
  const status = amount > 0 ? await terminalStatus() : null;
  if (!status) return { ok: true, details: null };
  if (existing) {
    const canVoid = !existing.manual && !!existing.ecr_ref;
    const choice = await ui().ask({
      title: 'Card amount changed', amount, tone: 'warning',
      message: `This bill was already paid ${getStoreProfile().currencyPrefix}${Number(existing.amount).toFixed(2)} by card. `
        + (canVoid ? 'Void that payment on the terminal and charge the new amount?' : 'Charge the new amount on the terminal?'),
      actions: [
        { id: 'charge', label: canVoid ? 'Void and charge new amount' : 'Charge new amount', tone: 'primary' },
        { id: 'back', label: 'Back to bill', tone: 'neutral' },
      ],
    });
    if (choice.action !== 'charge') { ui().close(); return { ok: false, message: 'Bill not saved: the card amount changed.' }; }
    if (canVoid && existing.ecr_ref) {
      ui().show(waiting('Voiding card payment', Number(existing.amount), 'Voiding the earlier payment on the terminal…'));
      const voided = await cardTerminalApi.voidSale({ ecr_ref: existing.ecr_ref });
      if (voided.outcome !== 'APPROVED') {
        await notice('Void failed', Number(existing.amount), voided.message || 'The terminal did not void the payment.', 'error');
        return { ok: false, message: 'Bill not saved: the earlier card payment could not be voided.' };
      }
    }
  }
  const result = await charge(input, amount, status.config.allowManualFallback);
  if (result.ok && result.details && !result.details.manual) pendingCharge = result.details;
  return result;
}

/** After the save: success keeps the payment; a failed or thrown save voids a payment charged by this checkout. */
export async function settleCardTerminalStep(saved: boolean): Promise<void> {
  const charged = pendingCharge;
  pendingCharge = null;
  if (!saved && charged) await voidAfterFailedSave(charged);
}

/** The bill could not be saved after the card was charged: give the money back. */
export async function voidAfterFailedSave(details: CardTerminalBillDetails | null): Promise<void> {
  if (!details || details.manual || !details.ecr_ref) return;
  ui().show(waiting('Bill not saved', details.amount, 'Voiding the card payment on the terminal…'));
  const res = await cardTerminalApi.voidSale({ ecr_ref: details.ecr_ref });
  if (res.outcome === 'APPROVED') { ui().close(); return; }
  await notice('Void the card payment on the terminal', details.amount,
    `The bill was not saved and the terminal did not void the card payment (${res.message || res.outcome}). Void it on the terminal, auth code ${details.auth_code || '—'}.`, 'error');
}

/** After a bill is deleted: offer to void its terminal card payment. */
export async function offerCardTerminalVoid(splitDetails: unknown): Promise<void> {
  const details = readBillCardDetails(splitDetails);
  if (!details || details.manual || !details.ecr_ref || !(await terminalStatus())) return;
  const choice = await ui().ask({
    title: 'Void card payment?', amount: details.amount, tone: 'warning',
    message: `This bill was paid by card${details.masked_pan ? ` ${details.masked_pan}` : ''}. Void the payment on the terminal? (Only possible before the terminal settles today's batch; otherwise refund it.)`,
    actions: [{ id: 'void', label: 'Void on terminal', tone: 'danger' }, { id: 'skip', label: 'Skip', tone: 'neutral' }],
  });
  if (choice.action !== 'void') { ui().close(); return; }
  ui().show(waiting('Voiding card payment', details.amount, 'Voiding on the terminal…'));
  const res = await cardTerminalApi.voidSale({ ecr_ref: details.ecr_ref });
  await notice(res.outcome === 'APPROVED' ? 'Card payment voided' : 'Void failed', details.amount,
    res.outcome === 'APPROVED' ? 'The card payment was voided.' : (res.message || 'The terminal did not void the payment.'),
    res.outcome === 'APPROVED' ? 'success' : 'error');
}

/** After a return refunded by card: offer to refund the amount to the customer's card on the terminal. */
export async function offerCardTerminalRefund(args: { tenantId: string; invoiceId?: string | null; amount: number; originalSplitDetails: unknown }): Promise<void> {
  const amount = round2(args.amount);
  if (amount <= 0 || !(await terminalStatus())) return;
  const original = readBillCardDetails(args.originalSplitDetails);
  const choice = await ui().ask({
    title: 'Refund to card?', amount, tone: 'warning',
    message: 'Refund this amount to the customer\'s card on the terminal? Choose Skip if it was already refunded on the terminal.',
    actions: [{ id: 'refund', label: 'Refund on terminal', tone: 'primary' }, { id: 'skip', label: 'Skip', tone: 'neutral' }],
  });
  if (choice.action !== 'refund') { ui().close(); return; }
  ui().show(waiting('Card refund', amount, 'Present the customer\'s card on the terminal…', true));
  const res = await cardTerminalApi.refund({ tenant_id: args.tenantId, invoice_id: args.invoiceId ?? null, amount, original_ecr_ref: original?.ecr_ref ?? null, currency: getStoreProfile().currency });
  await notice(res.outcome === 'APPROVED' ? 'Card refund approved' : 'Card refund not completed', amount,
    res.outcome === 'APPROVED' ? `Refunded${res.masked_pan ? ` to ${res.masked_pan}` : ''}, auth ${res.auth_code || '—'}.` : (res.message || res.outcome),
    res.outcome === 'APPROVED' ? 'success' : 'error');
}
