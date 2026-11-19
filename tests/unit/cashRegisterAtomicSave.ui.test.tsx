// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi, beforeEach } from 'vitest';
import { useCashDrawerActions, type UseCashDrawerActionsContext } from '../../src/components/cashier/hooks/useCashDrawerActions';
const mocks = vi.hoisted(() => ({ save: vi.fn(), ledger: vi.fn() }));
vi.mock('../../src/data/cashier', () => ({ cashierApi: { addTransaction: mocks.save } }));
vi.mock('../../src/data/parties', () => ({ partiesApi: { addPartyLedgerEntry: mocks.ledger } }));
vi.mock('../../src/data/client', () => ({ hasBridge: () => false }));
beforeEach(() => vi.clearAllMocks());
function context() {
  return { tenantId: 'shop', userId: 'owner', userName: 'Owner', txnType: 'CASH_OUT', txnAmt: 500,
    txnCat: 'Monthly Savings', txnNote: 'November', txnPartyId: 'chitty', txnPartyName: 'KSFE',
    drawer: { status: 'OPEN' }, load: vi.fn(async () => {}), setTxnError: vi.fn(), setTxnSubmitting: vi.fn(),
    setTxnAmt: vi.fn(), setTxnCat: vi.fn(), setTxnNote: vi.fn(), setTxnPartyId: vi.fn(), setTxnPartyName: vi.fn(),
    setPartySearch: vi.fn(), setShowAddCatForm: vi.fn(), setNewCatName: vi.fn(), setShowTxnModal: vi.fn(),
  };
}
it('submits one atomic operation instead of a second independent ledger save', async () => {
  const ctx = context(); mocks.save.mockResolvedValue({ success: true });
  const { result } = renderHook(() => useCashDrawerActions(ctx as unknown as UseCashDrawerActionsContext));
  await act(() => result.current.handleAddTransaction());
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    amount: 500, party: { party_id: 'chitty', ledger_id: expect.any(String), description: 'Cash paid (Monthly Savings): November' },
  }));
  expect(mocks.ledger).not.toHaveBeenCalled(); expect(ctx.setShowTxnModal).toHaveBeenCalledWith(false);
});
it.each(['result', 'transport'])('retains a retryable form and reports %s failure', async failure => {
  const ctx = context();
  if (failure === 'result') mocks.save.mockResolvedValue({ success: false, error: 'Storage unavailable' });
  else mocks.save.mockRejectedValue(new Error('Storage unavailable'));
  const { result } = renderHook(() => useCashDrawerActions(ctx as unknown as UseCashDrawerActionsContext));
  await act(() => result.current.handleAddTransaction());
  expect(ctx.setTxnError).toHaveBeenCalledWith('Storage unavailable');
  expect(ctx.setShowTxnModal).not.toHaveBeenCalled(); expect(ctx.setTxnAmt).not.toHaveBeenCalled();
  expect(ctx.setTxnSubmitting).toHaveBeenLastCalledWith(false); expect(ctx.load).not.toHaveBeenCalled();
});
