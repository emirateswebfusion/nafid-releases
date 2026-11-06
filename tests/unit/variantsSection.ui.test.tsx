// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/store/authStore';
import { VariantsSection, type ProductVariantItem } from '../../src/components/inventory/views/form/VariantsSection';
import { DEFAULT_FORM } from '../../src/components/inventory/inventoryUtils';
vi.mock('../../src/components/inventory/views/form/PricingSection', () => ({ PricingSection: ({ tierPrices, setTierPrices }: { tierPrices: Record<string, string>; setTierPrices: (prices: Record<string, string>) => void }) => <input aria-label="Wholesale price" value={tierPrices.wholesale || ''} onChange={event => setTierPrices({ wholesale: event.target.value })} /> }));
afterEach(cleanup);
function Form() {
  const [variants, setVariants] = useState<ProductVariantItem[]>([]);
  return <VariantsSection variants={variants} setVariants={setVariants} formData={DEFAULT_FORM} enableRealPaperStock={false} activePricingTiers={[]} />;
}
it('adds repeated sections with independent names, prices and tiers; removal retains the other draft', () => {
  useAuthStore.setState({ role: 'ADMIN', permissions: ['*'] });
  render(<Form />);
  fireEvent.click(screen.getByText('Add Variant'));
  fireEvent.click(screen.getByText('Add Variant'));
  fireEvent.change(screen.getByLabelText('Variant 1 name'), { target: { value: 'S' } });
  fireEvent.change(screen.getByLabelText('Variant 2 name'), { target: { value: 'XL' } });
  fireEvent.change(within(screen.getByRole('group', { name: 'Variant 1' })).getByLabelText('Wholesale price'), { target: { value: '50' } });
  expect((screen.getByLabelText('Variant 2 name') as HTMLInputElement).value).toBe('XL');
  expect((within(screen.getByRole('group', { name: 'Variant 2' })).getByLabelText('Wholesale price') as HTMLInputElement).value).toBe('');
  fireEvent.click(screen.getByLabelText('Remove variant 1'));
  expect((screen.getByLabelText('Variant 1 name') as HTMLInputElement).value).toBe('XL');
});
it('does not expose creation with edit-only access', () => {
  useAuthStore.setState({ role: 'STAFF', permissions: ['products.view', 'products.edit'] });
  render(<Form />);
  expect(screen.queryByText('Add Variant')).toBeNull();
});
