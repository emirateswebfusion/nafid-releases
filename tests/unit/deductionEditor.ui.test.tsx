// @vitest-environment jsdom
import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DeductionEditor, type DeductionState } from '../../src/components/billing/views/DeductionEditor';
import { useCartStore } from '../../src/store/cartStore';
afterEach(cleanup);
function setup(mode: 'scrap' | 'return' | 'points' = 'scrap') {
  useCartStore.setState({ isScrapMode: false, isQuotationMode: false, isReturnMode: false, scrapDeduction: 2130, scrapInvoiceNumber: 'SCR-008', returnDeduction: 240.95, returnInvoiceNumber: 'RTN-003' });
  const deductions: DeductionState = {
    customerPointsBalance: 9, effectiveDeductionMode: mode, isLoyaltyModuleEnabled: true, isReturnModuleEnabled: true, isScrapModuleEnabled: true,
    pointsDeductionInputRef: createRef(), returnDeductionInputRef: createRef(), scrapDeductionInputRef: createRef(),
    pointsRedeemedCalc: 5, pointsRedeemedDiscountCalc: 5, pointsToRedeem: 5,
    returnDeductionSearchQuery: '', scrapDeductionSearchQuery: '', tenantId: 'shop',
    setDeductionTabMode: vi.fn(), setHardwareError: vi.fn(), setPointsToRedeem: vi.fn(),
    setReturnDeductionDropdownStyle: vi.fn(), setReturnDeductionResults: vi.fn(), setReturnDeductionSearchMode: vi.fn(), setReturnDeductionSearchQuery: vi.fn(),
    setScrapDeductionDropdownStyle: vi.fn(), setScrapDeductionResults: vi.fn(), setScrapDeductionSearchQuery: vi.fn(),
  };
  return { ...render(<DeductionEditor deductions={deductions} />), deductions };
}
it('shows all applied amounts on their buttons without duplicate summary cards, and opens removable details', () => {
  setup();
  expect(screen.queryByText('Applied Credits')).toBeNull();
  for (const name of [/Scrap.*2130/, /Return.*240.95/, /Points.*5.00/]) expect(screen.getByRole('button', { name })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: /Scrap.*2130/ }));
  expect(screen.getByText(/SCR-008/)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Scrap Credit' }));
  expect(useCartStore.getState().scrapDeduction).toBe(0);
  expect(useCartStore.getState().returnDeduction).toBe(240.95);
});
it('keeps applied points editable after Enter, Max and remount', () => {
  const { unmount, deductions } = setup('points');
  expect(screen.getByRole('textbox')).toBeDefined();
  fireEvent.focus(screen.getByRole('textbox'));
  expect(screen.getByRole('textbox')).toBeDefined();
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  expect(screen.getByRole('textbox')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Max' }));
  expect(deductions.setPointsToRedeem).toHaveBeenCalledWith(9);
  expect(screen.getByRole('textbox')).toBeDefined();
  unmount();
  render(<DeductionEditor deductions={deductions} />);
  expect(screen.getByRole('textbox')).toBeDefined();

});

it('shows selected applied credit after returning to billing and on repeated tab clicks', () => {
  const { unmount, deductions } = setup();
  expect(screen.getByRole('button', { name: 'Remove Scrap Credit' })).toBeDefined();
  unmount();
  const { rerender } = render(<DeductionEditor deductions={deductions} />);
  fireEvent.click(screen.getByRole('button', { name: /Scrap.*2130/ }));
  fireEvent.click(screen.getByRole('button', { name: /Scrap.*2130/ }));
  expect(screen.getByRole('button', { name: 'Remove Scrap Credit' })).toBeDefined();
  rerender(<DeductionEditor deductions={{ ...deductions, effectiveDeductionMode: 'return' }} />);
  expect(screen.getByRole('button', { name: 'Remove Return Credit' })).toBeDefined();
});
