// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePartyManagerState } from '../../src/components/party/hooks/usePartyManagerState';
import { PartyTransactionForm } from '../../src/components/party/views/PartyTransactionForm';
import type { Party } from '../../src/components/party/partyTypes';

afterEach(cleanup);
it('selects Purchase without showing a cash drawer movement and submits the selected method', () => {
  const save = vi.fn();
  function Form() {
    const state = usePartyManagerState();
    return <PartyTransactionForm {...state}
      selectedParty={{ party_id: 'p', name: 'QA' } as Party}
      ledgerWhatsappEnabled={false} getPartyBalance={() => 0}
      handleSaveTx={event => { event.preventDefault(); save(state.txForm.payment_method); }}
      handleFormKeyDown={vi.fn()} onCancel={vi.fn()} />;
  }
  const { container } = render(<Form />);
  expect(screen.getByText('This will deduct cash from the drawer')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Purchase' }));
  expect(screen.queryByText('This will deduct cash from the drawer')).toBeNull();
  fireEvent.submit(container.querySelector('form')!);
  expect(save).toHaveBeenCalledWith('PURCHASE');
});
