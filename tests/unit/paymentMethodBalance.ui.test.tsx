// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PaymentMethods } from '../../src/components/payment-methods/PaymentMethods';
import type { PaymentSource } from '../../src/data/paymentSources';

const state = vi.hoisted(() => ({ balance: 100, movements: [] as Array<{ type: string; amount: number; running_balance: number }> }));
vi.mock('../../src/data/client', async original => ({ ...await original<typeof import('../../src/data/client')>(), hasBridge: () => true }));
vi.mock('../../src/utils/print/upiConfig', async original => { const actual = await original<typeof import('../../src/utils/print/upiConfig')>(); return { ...actual, getUpiPageConfig: async () => actual.DEFAULT_UPI_PAGE_CONFIG }; });
vi.mock('../../src/data/paymentSources', () => ({ paymentSourcesApi: {
  getSources: async () => [{ source_id: 'upi', name: 'QA UPI', type: 'UPI', current_balance: state.balance,
    opening_balance: 100, is_enabled: 1, is_default: 1, transaction_count: state.movements.length } as PaymentSource],
  getTransactions: async () => state.movements.map((row, i) => ({ ...row, transaction_id: String(i) })),
  addTransaction: async (args: { type: string; amount: number }) => {
    state.balance += args.type === 'CASH_IN' ? args.amount : -args.amount;
    state.movements.unshift({ ...args, running_balance: state.balance });
    return { success: true };
  },
} }));
afterEach(() => { cleanup(); state.balance = 100; state.movements = []; });

it('refreshes the open ledger header after deposits and withdrawals without reopening the source', async () => {
  render(<PaymentMethods onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: /Ledger \(0\)/ }));
  const balance = () => screen.getByText('Current Balance').parentElement?.textContent;
  expect(balance()).toContain('₹100.00');
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '25.25' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post Entry' }));
  await waitFor(() => expect(balance()).toContain('₹125.25'));
  fireEvent.click(screen.getByRole('button', { name: /Money Out/ }));
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10.25' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post Entry' }));
  await waitFor(() => expect(balance()).toContain('₹115.00'));
});
