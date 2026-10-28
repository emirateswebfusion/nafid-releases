// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type React from 'react';
import { usePartyTransactionSave, type UsePartyTransactionSaveContext } from '../../src/components/party/hooks/usePartyTransactionSave';

vi.mock('../../src/data/parties', () => ({ partiesApi: {
  addPartyLedgerEntry: async () => ({ success: false, error: 'Storage unavailable' }),
  updatePartyLedgerEntry: async () => ({ success: false, error: 'Storage unavailable' }),
} }));

it.each([false, true])('keeps a failed repayment open and never reports success (editing=%s)', async editing => {
  const showStatus = vi.fn(), setView = vi.fn(), loadLedger = vi.fn(), loadParties = vi.fn();
  const ctx = {
    getPartyBalance: () => 7510, isOwner: true, loadLedger, loadParties, shopName: 'QA', showStatus,
    tenantId: 't', userId: 'u', userName: 'QA',
    pm: { editingTx: editing ? { ledger_id: 'l' } : null, selectedParty: { party_id: 'p', name: 'QA' },
      txForm: { amount: '2000', transaction_type: 'DEBIT', description: '', transaction_date: '', reference_number: '', payment_method: 'CASH' },
      enablePartyGst: true, enablePartyEstimate: false, setIsSavingTx: vi.fn(), setSelectedParty: vi.fn(), setView },
  } as unknown as UsePartyTransactionSaveContext;
  const { result } = renderHook(() => usePartyTransactionSave(ctx));
  await act(() => result.current.handleSaveTx({ preventDefault() {} } as React.FormEvent));
  expect(showStatus).toHaveBeenCalledWith('Operation failed', 'error');
  expect(showStatus).not.toHaveBeenCalledWith(expect.anything(), 'success');
  expect(setView).not.toHaveBeenCalled();
  expect(loadLedger).not.toHaveBeenCalled();
  expect(loadParties).not.toHaveBeenCalled();
});
