// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
let badges = true;
let paper = true;
let zeroPaper = false;
const product = { product_id: 'p', tenant_id: 't', name: 'Paper Widget', base_price: 10, purchase_price: 5, current_stock: 3, paper_stock: 2, uom: 'Pcs', domain_attributes: '{"gst_type":"PAPER"}', is_gst_applicable: 1 };
(window as unknown as { electronAPI: unknown }).electronAPI = new Proxy({}, { get: (_t, name: string) => {
  if (name.startsWith('on')) return () => () => {};
  return async (payload: { key?: string }) => {
    if (name === 'settingsGet' && payload.key === 'show_zero_paper_stock') return zeroPaper;
    if (name === 'settingsGet') return payload.key === 'show_product_gst_badge' ? badges : payload.key === 'enable_real_paper_stock' ? paper : null;
    if (name === 'dbGetProducts') return [product, { ...product, product_id: 'zero', name: 'Real Widget', is_gst_applicable: 0, paper_stock: 0, domain_attributes: '{}' }];
    if (name === 'dbCountProducts') return 1;
    return [];
  };
}});
Element.prototype.scrollIntoView = () => {};
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof IntersectionObserver;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
const { useAuthStore } = await import('../../src/store/authStore');
const { InventoryManager } = await import('../../src/components/inventory/InventoryManager');
beforeEach(() => { badges=true; paper=true; useAuthStore.setState({ tenantId:'t', role:'ADMIN', permissions:['*'] }); });
afterEach(cleanup);
it('applies the persisted inventory badge setting on load and after settings updates', async () => {
  render(<InventoryManager onClose={() => {}} />);
  await screen.findByText('Paper Widget');
  expect(await screen.findByText('Paper', { selector: '[data-product-type-badge]' })).toBeTruthy();
  badges = false;
  fireEvent(window,new CustomEvent('settings:updated'));
  await waitFor(() => expect(document.querySelector('[data-product-type-badge]')).toBeNull());
  badges = true; paper = false;
  fireEvent(window,new CustomEvent('settings:updated'));
  expect(await screen.findByText('GST', { selector: '[data-product-type-badge]' })).toBeTruthy();
});

it('shows zero paper stock tags only when enabled', async () => {
  zeroPaper = false;
  render(<InventoryManager onClose={() => {}} />);
  await screen.findByText('Real Widget');
  expect(screen.queryByText('Paper: 0')).toBeNull();
  zeroPaper = true;
  fireEvent(window,new CustomEvent('settings:updated'));
  expect(await screen.findByText('Paper: 0')).toBeTruthy();
  zeroPaper = false;
  fireEvent(window,new CustomEvent('settings:updated'));
  await waitFor(() => expect(screen.queryByText('Paper: 0')).toBeNull());
});