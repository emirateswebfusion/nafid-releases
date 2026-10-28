// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePartyManagerState } from '../../src/components/party/hooks/usePartyManagerState';
import { PartyFormView } from '../../src/components/party/views/PartyFormView';
afterEach(cleanup);
function Form() {
  const state = usePartyManagerState();
  return <PartyFormView {...state} handleSaveParty={vi.fn()} handleFormKeyDown={vi.fn()} allCustomCategories={[]} resetPartyForm={vi.fn()} fieldCls="" />;
}
it('adapts customer credit and pricing fields to each party type', () => {
  render(<Form />);
  expect(screen.getByText('Credit Limit (₹)')).toBeTruthy();
  for (const type of ['Supplier', 'Staff', 'Custom']) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(type + ' ') }));
    expect(screen.queryByText('Credit Limit (₹)')).toBeNull();
    expect(screen.queryByText('Default Pricing Tier')).toBeNull();
    expect(screen.queryByText('Credit Period Management')).toBeNull();
  }
  fireEvent.click(screen.getByText('🛒 Customer'));
  expect(screen.getByText('Credit Limit (₹)')).toBeTruthy();
});

it('reveals customer credit fields when supplier also enables customer billing (dual-role)', () => {
  render(<Form />);
  fireEvent.click(screen.getByRole('button', { name: /Supplier / }));
  expect(screen.queryByText('Credit Limit (₹)')).toBeNull();

  // Toggle dual role customer billing
  const dualCheckbox = screen.getByLabelText(/Also allow Customer Billing/);
  fireEvent.click(dualCheckbox);
  expect(screen.getByText('Credit Limit (₹)')).toBeTruthy();
  expect(screen.getByText('Default Pricing Tier')).toBeTruthy();
});
