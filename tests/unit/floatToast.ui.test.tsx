// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FloatToast } from '../../src/components/ui/FloatToast';
import { BillingToasts } from '../../src/components/billing/views/BillingToasts';
import { RestaurantToast } from '../../src/components/restaurant/views/RestaurantChrome';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('keeps state-owned notifications visible and preserves action and dismiss callbacks', () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  const onAction = vi.fn();
  render(<FloatToast message={{ text: 'Invoice restored', type: 'success' }} onClose={onClose} duration={0} actionLabel="View invoice" onAction={onAction} stackItem />);
  act(() => vi.advanceTimersByTime(10000));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('status').classList.contains('fixed')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'View invoice' }));
  expect(onAction).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByTitle('Close'));
  expect(onClose).toHaveBeenCalledOnce();
});

it('cancels an expired message timer when its replacement arrives', () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  const view = render(<FloatToast message="First" onClose={onClose} duration={4000} />);
  act(() => vi.advanceTimersByTime(3000));
  view.rerender(<FloatToast message="Second" onClose={onClose} duration={4000} />);
  act(() => vi.advanceTimersByTime(1000));
  expect(onClose).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(3000));
  expect(onClose).toHaveBeenCalledOnce();
});

it('renders simultaneous billing outcomes without hiding print failures or timing out parent state', () => {
  vi.useFakeTimers();
  render(<BillingToasts checkoutSuccess="saved" hardwareError="Printer offline" infoToast="Sending bill" quotationSuccess={null} returnSuccessToast={null} upiAccountToast="Main account" />);
  expect(screen.getByRole('alert').textContent).toContain('Printer offline');
  expect(screen.getAllByRole('status')).toHaveLength(3);
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.getByText('Invoice saved successfully!')).toBeTruthy();
  expect(screen.getByText('Main account')).toBeTruthy();
});

it('retains restaurant errors until dismissed but expires successful operations', () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  const view = render(<RestaurantToast message={{ tone: 'error', text: 'Order failed' }} onClose={onClose} />);
  act(() => vi.advanceTimersByTime(10000));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('Order failed');
  view.rerender(<RestaurantToast message={{ tone: 'ok', text: 'Order saved' }} onClose={onClose} />);
  act(() => vi.advanceTimersByTime(3500));
  expect(onClose).toHaveBeenCalledOnce();
});
