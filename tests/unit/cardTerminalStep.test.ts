import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardTerminalPayment } from '../../src/data/cardTerminal';

const api = vi.hoisted(() => ({
  enabled: true,
  allowManual: true,
  available: true,
  splitDetails: null as string | null,
  sales: [] as CardTerminalPayment[],
  calls: [] as string[],
}));
vi.mock('../../src/data/cardTerminal', () => ({
  hasCardTerminal: () => api.available,
  cardTerminalApi: {
    getStatus: async () => ({ config: { enabled: api.enabled, allowManualFallback: api.allowManual }, providers: ['MOCK'], busy: false }),
    sale: async () => { api.calls.push('sale'); return api.sales.shift(); },
    voidSale: async ({ ecr_ref }: { ecr_ref: string }) => { api.calls.push(`void:${ecr_ref}`); return payment('APPROVED', { ecr_ref: 'V1' }); },
    refund: async () => { api.calls.push('refund'); return payment('APPROVED'); },
    resolve: async ({ outcome }: { outcome: string }) => { api.calls.push(`resolve:${outcome}`); return { success: true }; },
    billSplitDetails: async () => ({ split_details: api.splitDetails }),
  },
}));
import { useCardTerminalStore } from '../../src/store/cardTerminalStore';
import { cardAmountOf, readBillCardDetails, runCardTerminalStep, settleCardTerminalStep } from '../../src/components/billing/checkout/cardTerminalStep';

function payment(outcome: CardTerminalPayment['outcome'], extra: Partial<CardTerminalPayment> = {}): CardTerminalPayment {
  return { outcome, ecr_ref: 'R1', amount: 50, provider: 'MOCK', auth_code: '000123', rrn: 'RRN', terminal_id: 'T1', masked_pan: '****0010', scheme: 'VISA', message: outcome === 'APPROVED' ? 'Approved' : 'Do not honour', ...extra };
}

/** Answers each dialog prompt with the next scripted choice. */
function script(...choices: { action: string; input?: string }[]) {
  const unsubscribe = useCardTerminalStore.subscribe(s => {
    if (s.prompt && s.resolver) {
      const next = choices.shift();
      if (next) queueMicrotask(() => useCardTerminalStore.getState().answer({ action: next.action, input: next.input ?? '' }));
    }
  });
  return unsubscribe;
}

const input = { tenantId: 't', invoiceId: 'inv', paymentMethod: 'CARD', cardAmount: 50 };

beforeEach(() => {
  Object.assign(api, { enabled: true, allowManual: true, available: true, splitDetails: null, sales: [], calls: [] });
  useCardTerminalStore.getState().close();
});

describe('card terminal checkout step', () => {
  it('takes the card part of the bill', () => {
    expect(cardAmountOf('CARD', 120.456, 0)).toBe(120.46);
    expect(cardAmountOf('SPLIT', 120, 45.5)).toBe(45.5);
    expect(cardAmountOf('CASH', 120, 45)).toBe(0);
  });

  it('reads the stored card payment of a bill', () => {
    const details = { amount: 10, ecr_ref: 'X', manual: false };
    expect(readBillCardDetails(JSON.stringify(JSON.stringify({ card_terminal: details })))).toMatchObject(details);
    expect(readBillCardDetails({ card: 10 })).toBeNull();
    expect(readBillCardDetails('{bad')).toBeNull();
  });

  it('changes nothing while the terminal is off', async () => {
    api.enabled = false;
    expect(await runCardTerminalStep(input)).toEqual({ ok: true, details: null });
    expect(api.calls).toEqual([]);
  });

  it('skips quotations, returns and filing copies', async () => {
    expect(await runCardTerminalStep({ ...input, skip: true })).toEqual({ ok: true, details: null });
    expect(api.calls).toEqual([]);
  });

  it('returns the approved payment for the bill', async () => {
    api.sales.push(payment('APPROVED'));
    const res = await runCardTerminalStep(input);
    expect(res).toMatchObject({ ok: true, details: { ecr_ref: 'R1', auth_code: '000123', masked_pan: '****0010', amount: 50, manual: false } });
    expect(useCardTerminalStore.getState().prompt).toBeNull();
  });

  it('retries after a decline, then goes back to the bill', async () => {
    api.sales.push(payment('DECLINED'), payment('DECLINED'));
    const stop = script({ action: 'retry' }, { action: 'back' });
    const res = await runCardTerminalStep(input);
    stop();
    expect(res).toEqual({ ok: false, message: 'Do not honour' });
    expect(api.calls).toEqual(['sale', 'sale']);
  });

  it('records a manual card payment when the cashier chooses it', async () => {
    api.sales.push(payment('ERROR', { message: 'Port not found' }));
    const stop = script({ action: 'manual', input: '777' });
    const res = await runCardTerminalStep(input);
    stop();
    expect(res).toMatchObject({ ok: true, details: { manual: true, auth_code: '777', ecr_ref: null } });
  });

  it('resolves an unanswered payment from the slip', async () => {
    api.sales.push(payment('UNKNOWN', { message: 'No answer from the terminal.' }));
    const stop = script({ action: 'approved', input: 'AB12' });
    const res = await runCardTerminalStep(input);
    stop();
    expect(res).toMatchObject({ ok: true, details: { auth_code: 'AB12', manual: true } });
    expect(api.calls).toEqual(['sale', 'resolve:APPROVED']);
  });

  it('keeps an earlier payment when an edit keeps the card amount', async () => {
    api.splitDetails = JSON.stringify({ card_terminal: { amount: 50, ecr_ref: 'OLD', manual: false } });
    const res = await runCardTerminalStep({ ...input, isEditing: true });
    expect(res).toMatchObject({ ok: true, details: { ecr_ref: 'OLD' } });
    expect(api.calls).toEqual([]);
    await settleCardTerminalStep(false);
    expect(api.calls).toEqual([]); // a kept payment is never voided by a failed save
  });

  it('voids the earlier payment and charges the new amount when an edit changes it', async () => {
    api.splitDetails = JSON.stringify({ card_terminal: { amount: 40, ecr_ref: 'OLD', manual: false } });
    api.sales.push(payment('APPROVED', { ecr_ref: 'NEW' }));
    const stop = script({ action: 'charge' });
    const res = await runCardTerminalStep({ ...input, isEditing: true });
    stop();
    expect(res).toMatchObject({ ok: true, details: { ecr_ref: 'NEW', amount: 50 } });
    expect(api.calls).toEqual(['void:OLD', 'sale']);
  });

  it('voids the payment when the bill cannot be saved', async () => {
    api.sales.push(payment('APPROVED', { ecr_ref: 'PAID' }));
    await runCardTerminalStep(input);
    await settleCardTerminalStep(false);
    expect(api.calls).toEqual(['sale', 'void:PAID']);
    await settleCardTerminalStep(false);
    expect(api.calls).toEqual(['sale', 'void:PAID']);
  });

  it('keeps the payment when the bill is saved', async () => {
    api.sales.push(payment('APPROVED'));
    await runCardTerminalStep(input);
    await settleCardTerminalStep(true);
    expect(api.calls).toEqual(['sale']);
  });
});
