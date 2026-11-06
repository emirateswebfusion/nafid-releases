// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useVariantCatalog } from '../../src/components/variants/hooks/useVariantCatalog';
import { loadVariantCatalog } from '../../src/components/inventory/variantProducts';
import type { Product } from '../../src/data/products';
vi.mock('../../src/components/inventory/variantProducts', () => ({ loadVariantCatalog: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const rows = (name: string): Product[] => [{ product_id: name, name } as Product];
it('ignores a late previous-tenant catalog and hides old data during the new read', async () => {
  let finishOld!: (value: Product[]) => void;
  vi.mocked(loadVariantCatalog).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockResolvedValueOnce(rows('new'));
  const { result, rerender } = renderHook(({ tenant }) => useVariantCatalog(tenant), { initialProps: { tenant: 'old' } });
  rerender({ tenant: 'new' });
  await waitFor(() => expect(result.current.products).toEqual(rows('new')));
  await act(async () => finishOld(rows('old')));
  expect(result.current.products).toEqual(rows('new'));
});
it('lets a refresh supersede an earlier read and reports retryable failures', async () => {
  let finishOld!: (value: Product[]) => void;
  vi.mocked(loadVariantCatalog).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(rows('fresh'));
  const { result } = renderHook(() => useVariantCatalog('tenant'));
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.error).toBe('Unavailable'));
  await act(async () => finishOld(rows('old')));
  expect(result.current.products).toEqual([]);
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.products).toEqual(rows('fresh')));
  expect(result.current.error).toBe('');
});
