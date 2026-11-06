// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DiscountSection } from '../../src/components/inventory/views/form/DiscountSection';
import { DEFAULT_FORM } from '../../src/components/inventory/inventoryUtils';
afterEach(cleanup);
it('displays a saved zero offer and keeps discount inputs disabled until it is cleared', () => {
  const callbacks = { handleDiscountFlatChange: vi.fn(), handleDiscountPercentChange: vi.fn(), handleOfferPriceChange: vi.fn() };
  const view = render(<DiscountSection {...callbacks} formData={{ ...DEFAULT_FORM, offer_price: 0 }} />);
  const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
  expect(inputs[2].value).toBe('0');
  expect(inputs[0].disabled).toBe(true);
  expect(inputs[1].disabled).toBe(true);
  view.rerender(<DiscountSection {...callbacks} formData={{ ...DEFAULT_FORM, offer_price: '' }} />);
  expect(inputs[0].disabled).toBe(false);
  expect(inputs[1].disabled).toBe(false);
  view.rerender(<DiscountSection {...callbacks} formData={{ ...DEFAULT_FORM, discount_flat: 5 }} />);
  expect(inputs[2].disabled).toBe(true);
});
