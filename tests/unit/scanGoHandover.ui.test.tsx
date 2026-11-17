// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ tenantId: 'shop', tabs: [] as { id: string; scanGoCartId: string }[], switchTab: vi.fn(), renameTab: vi.fn() }));
vi.mock('../../src/store/authStore', () => ({ useAuthStore: { getState: () => ({ tenantId: state.tenantId }) } }));
vi.mock('../../src/store/tabStore', () => ({ useTabStore: { getState: () => ({ tabs: state.tabs, activeTabId: 'bill', switchTab: state.switchTab, renameTab: state.renameTab }) } }));
vi.mock('../../src/data/cloud/scanGo', () => ({ scanGoCloud: { complete: vi.fn() } }));
import { scanGoCloud } from '../../src/data/cloud/scanGo';
import { completeScanGoCart, flushScanGoCompletions, sendCartToBilling, useScanGoBillHandover } from '../../src/components/scanGo/scanGoBillHandover';

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); state.tenantId = 'shop'; state.tabs = []; });
afterEach(cleanup);
const pending = (shop = 'shop') => JSON.parse(localStorage.getItem(`scanGoPendingCompletions:${shop}`) || '[]') as unknown[];

it('saves confirmation before sending, keeps failures across restart and removes only server-confirmed work', async () => {
  vi.mocked(scanGoCloud.complete).mockImplementationOnce(async () => { expect(pending()).toHaveLength(1); throw new Error('offline'); });
  expect(await completeScanGoCart('cart', 'invoice', '1', 'shop')).toBe(false);
  expect(pending()).toHaveLength(1);
  vi.mocked(scanGoCloud.complete).mockResolvedValueOnce({} as Awaited<ReturnType<typeof scanGoCloud.complete>>);
  await flushScanGoCompletions('shop');
  expect(pending()).toHaveLength(0);
});
it('does not send another shop’s pending confirmations or discard refused confirmations', async () => {
  state.tenantId = 'other';
  expect(await completeScanGoCart('cart', 'invoice', null, 'shop')).toBe(false);
  expect(scanGoCloud.complete).not.toHaveBeenCalled();
  state.tenantId = 'shop';
  vi.mocked(scanGoCloud.complete).mockRejectedValue(new Error('Cart not found'));
  await flushScanGoCompletions('shop');
  expect(pending()).toHaveLength(1);
});
it('keeps completions added while an earlier refresh is in flight', async () => {
  let finish!: (value: Awaited<ReturnType<typeof scanGoCloud.complete>>) => void;
  vi.mocked(scanGoCloud.complete).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const first = completeScanGoCart('first', 'i1', null, 'shop');
  const second = completeScanGoCart('second', 'i2', null, 'shop');
  finish({} as Awaited<ReturnType<typeof scanGoCloud.complete>>);
  await Promise.all([first, second]);
  expect(pending()).toEqual([{ cartId: 'second', invoice_id: 'i2', invoice_number: null }]);
});
it('reopens the cashier’s edited bill without replacing its items and rejects another shop’s handover', () => {
  const context = { addItem: vi.fn(), addTab: vi.fn(() => 'bill'), clearCart: vi.fn(), syncActiveSnapshot: vi.fn(), updateActiveTab: vi.fn() };
  state.tabs = [{ id: 'edited', scanGoCartId: 'cart' }];
  renderHook(() => useScanGoBillHandover(context));
  const data = { cartId: 'cart', tenantId: 'shop', title: 'Cart', items: [{ product_id: 'p', name: 'Product', base_price: 10, quantity: 1 }] };
  act(() => sendCartToBilling(data));
  expect(state.switchTab).toHaveBeenCalledWith('edited');
  expect(context.clearCart).not.toHaveBeenCalled();
  expect(context.addItem).not.toHaveBeenCalled();
  act(() => sendCartToBilling({ ...data, tenantId: 'other' }));
  expect(state.switchTab).toHaveBeenCalledTimes(1);
});
