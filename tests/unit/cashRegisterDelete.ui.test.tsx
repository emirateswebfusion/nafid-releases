// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CashRegisterPanel, type CashRegisterPanelProps } from '../../src/components/cashier/views/CashRegisterPanel';
import type { CashTransactionRow } from '../../src/components/cashier/cashierTypes';

afterEach(cleanup);

const noop = () => {};
const partyPayment: CashTransactionRow = {
  transaction_id: 'payment', type: 'CASH_OUT', category: 'Party Payment',
  notes: 'Supplier payment', amount: 20, source: 'ledger',
};
const refund: CashTransactionRow = {
  ...partyPayment, transaction_id: 'return:1', category: 'RETURN_REFUND', source: 'return',
};

const props: CashRegisterPanelProps = {
  drawer: null, expandedTxId: null, initiateDeleteTransaction: noop, initiateReopenDrawer: noop,
  isOwner: true, parties: [], setCustomCategories: noop, setExpandedTxId: noop, setNewCatName: noop,
  setParties: noop, setPartySearch: noop, setShowAddCatForm: noop, setShowTxnModal: noop,
  setTxnAmt: noop, setTxnCat: noop, setTxnNote: noop, setTxnPartyId: noop, setTxnPartyName: noop,
  showSettlement: false, tenantId: 'shop', totalIn: 0, totalOut: 40,
  transactions: [partyPayment, refund],
};

it('opens deletion for a party payment directly from its row and hides it for refunds', () => {
  const initiateDeleteTransaction = vi.fn();
  const setExpandedTxId = vi.fn();
  render(<CashRegisterPanel {...props} initiateDeleteTransaction={initiateDeleteTransaction} setExpandedTxId={setExpandedTxId} />);

  fireEvent.click(screen.getByRole('button', { name: 'Delete transaction' }));
  expect(initiateDeleteTransaction).toHaveBeenCalledWith(partyPayment);
  expect(setExpandedTxId).not.toHaveBeenCalled();
});

it('hides deletion for staff without admin access', () => {
  render(<CashRegisterPanel {...props} isOwner={false} />);
  expect(screen.queryByRole('button', { name: 'Delete transaction' })).toBeNull();
});
