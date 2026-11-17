// @vitest-environment jsdom
import { createRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { ItemRateInput } from '../../src/components/billing/ui/ItemRateInput';
import { ItemTotalInput } from '../../src/components/billing/ui/ItemTotalInput';
import { DiscountRow, type DiscountRowProps } from '../../src/components/billing/views/totals/DiscountRow';
import { useAuthStore } from '../../src/store/authStore';
import { PERMISSION_LOCK_HINTS } from '../../src/utils/security/permissions';

import { useGrandTotalOverride, type UseGrandTotalOverrideContext } from '../../src/components/billing/hooks/useGrandTotalOverride';

const initialAuth = useAuthStore.getState();
afterEach(() => { cleanup(); useAuthStore.setState(initialAuth); });

it('ignores typed prices while permitting configured tier selection', () => {
  useAuthStore.setState({ role: 'STAFF', permissions: [], restrictedPage: null });
  const update = vi.fn();
  const selectTier = vi.fn();
  const sync = vi.fn();
  render(<ItemRateInput productId="p" rate={100} qty={1} unitLabel="Pc" priceLocked
    lockHint={PERMISSION_LOCK_HINTS.editPrice} onUpdateOfferPrice={update} syncActiveSnapshot={sync}
    pricingTiers={[{ pricing_tier_id: 'wholesale', name: 'Wholesale' }]}
    tierPricesMap={{ wholesale: 80 }} onSelectTier={selectTier} />);
  const input = screen.getByRole('textbox') as HTMLInputElement;
  expect(input.readOnly).toBe(true);
  expect(input.title).toBe(PERMISSION_LOCK_HINTS.editPrice);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '150' } });
  expect(update).not.toHaveBeenCalled();
  expect(input.value).toBe('100');
  fireEvent.mouseDown(screen.getByRole('button', { name: /Wholesale/ }));
  expect(selectTier).toHaveBeenCalledWith('p', 'wholesale', 'Wholesale', 80);
  expect(sync).toHaveBeenCalledOnce();
});

it('keeps a locked line total read-only through change, Enter and blur', () => {
  const update = vi.fn();
  const remove = vi.fn();
  const clear = vi.fn();
  const sync = vi.fn();
  render(<ItemTotalInput productId="p" total={200} rate={100} qty={2} hasDiscount={false} locked
    lockHint={PERMISSION_LOCK_HINTS.editPrice} onUpdateOfferPrice={update} onRemoveDiscount={remove}
    onClearLocalDiscounts={clear} syncActiveSnapshot={sync} />);
  const input = screen.getByRole('textbox') as HTMLInputElement;
  expect(input.readOnly).toBe(true);
  expect(input.title).toBe(PERMISSION_LOCK_HINTS.editPrice);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '300' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.blur(input);
  expect(input.value).toBe('200');
  for (const callback of [update, remove, clear, sync]) expect(callback).not.toHaveBeenCalled();
});

function discountProps(isScrapMode = false): DiscountRowProps {
  return {
    activeDiscField: null, activeTab: undefined, descriptionInputRef: createRef<HTMLInputElement>(),
    discount: 10, discountPercentRef: createRef<HTMLInputElement>(), discountRef: createRef<HTMLInputElement>(),
    discountType: 'FIXED', discountValue: 10, extraBonus: 0, handleCheckout: vi.fn(),
    isReturnMode: false, isScrapMode, items: [], localDiscText: '', paymentMethod: 'CASH',
    paymentOptionRefs: { current: {} }, qtyRefs: { current: {} }, receivedInputRef: createRef<HTMLInputElement>(),
    scrapTotal: 100, searchRef: createRef<HTMLInputElement>(), setActiveDiscField: vi.fn(),
    setDiscount: vi.fn(), setLocalDiscText: vi.fn(), showDescriptionState: false, subtotal: 100,
    updateActiveTab: vi.fn(),
  };
}

it('locks staff bill discounts including Delete/Backspace clearing', () => {
  useAuthStore.setState({ role: 'STAFF', permissions: [], restrictedPage: null });
  const props = discountProps();
  render(<DiscountRow {...props} />);
  for (const input of screen.getAllByRole('spinbutton') as HTMLInputElement[]) {
    expect(input.readOnly).toBe(true);
    expect(input.title).toBe(PERMISSION_LOCK_HINTS.discount);
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.keyDown(input, { key: 'Delete' });
    fireEvent.keyDown(input, { key: 'Backspace' });
  }
  expect(props.setDiscount).not.toHaveBeenCalled();
});

it.each([
  ['STAFF', [], true], ['STAFF', ['sales.discount'], false], ['ADMIN', [], false],
] as const)('allows %s discount entry (scrap=%s)', (role, permissions, scrap) => {
  useAuthStore.setState({ role, permissions: [...permissions], restrictedPage: null });
  const props = discountProps(scrap);
  render(<DiscountRow {...props} />);
  const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
  expect(inputs.every(input => !input.readOnly)).toBe(true);
  fireEvent.change(inputs[0], { target: { value: '15' } });
  expect(props.setDiscount).toHaveBeenCalledWith(15, 'PERCENTAGE');
});

function overrideProps(input: string): UseGrandTotalOverrideContext {
  return {
    discount: 0, displayGrandTotal: 100, isReturnMode: false, isScrapMode: false, items: [],
    overrideTotalInput: input, setDiscount: vi.fn(), setInfoToast: vi.fn(), setIsEditingTotal: vi.fn(),
    setOverrideTotalInput: vi.fn(), storeReturnDeduction: 0, storeScrapDeduction: 0,
    subtotal: 100, totalTax: 0, totalOverrideInputRef: createRef<HTMLInputElement>(), updateActiveTab: vi.fn(),
  };
}

it('rejects commits and resets after discount permission is revoked, including an empty draft', () => {
  useAuthStore.setState({ role: 'STAFF', permissions: ['sales.discount'], restrictedPage: null });
  const props = overrideProps('');
  const { result } = renderHook(() => useGrandTotalOverride(props));
  act(() => useAuthStore.setState({ permissions: [] }));
  act(() => { result.current.commitTotalOverride(); result.current.handleResetGrandTotalOverride(); });
  expect(props.setDiscount).not.toHaveBeenCalled();
  expect(props.updateActiveTab).not.toHaveBeenCalled();
  expect(props.setInfoToast).toHaveBeenCalledWith(PERMISSION_LOCK_HINTS.discount);
});

it('requires manual-price permission to raise the total while allowing a discount-only reduction', () => {
  useAuthStore.setState({ role: 'STAFF', permissions: ['sales.discount'], restrictedPage: null });
  const props = overrideProps('150');
  const { result, rerender } = renderHook(({ input }) => useGrandTotalOverride({ ...props, overrideTotalInput: input }), {
    initialProps: { input: '150' },
  });
  act(() => result.current.commitTotalOverride());
  expect(props.updateActiveTab).not.toHaveBeenCalled();
  expect(props.setInfoToast).toHaveBeenCalledWith(PERMISSION_LOCK_HINTS.editPrice);
  rerender({ input: '80' });
  act(() => result.current.commitTotalOverride());
  expect(props.setDiscount).toHaveBeenCalledWith(20, 'FIXED');
  expect(props.updateActiveTab).toHaveBeenCalledWith({ manualTotalOverride: 80 });
  act(() => useAuthStore.setState({ permissions: ['sales.discount', 'sales.edit_price'] }));
  rerender({ input: '150' });
  act(() => result.current.commitTotalOverride());
  expect(props.updateActiveTab).toHaveBeenCalledWith({ manualTotalOverride: 150 });
});
