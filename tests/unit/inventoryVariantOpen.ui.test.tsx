// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { useInventoryState } from '../../src/components/inventory/hooks/useInventoryState';
import { useInventoryFormOpen } from '../../src/components/inventory/hooks/useInventoryFormOpen';
import { listGrades, type Grade } from '../../src/data/grades';
import type { Product } from '../../src/data/products';
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => false, hasBridge: () => false }));
vi.mock('../../src/data/grades', () => ({ listGrades: vi.fn() }));
vi.mock('../../src/components/inventory/variantProducts', () => ({ loadProductVariants: vi.fn().mockResolvedValue([]) }));
vi.mock('../../src/data/products', () => ({ listProducts: vi.fn(), getProductPricing: vi.fn() }));
vi.mock('../../src/data/purchases', () => ({ purchasesApi: {} }));
it('preserves a grade-priced parent opened directly before inventory lookups finish', async () => {
  vi.mocked(listGrades).mockResolvedValue([{ grade_id: 'grade', rate: 125 } as Grade]);
  const { result } = renderHook(() => {
    const inv = useInventoryState();
    const lastInteractedProductId = useRef<string | null>(null);
    const listScrollRef = useRef<HTMLDivElement | null>(null);
    const savedScrollTop = useRef(0);
    return { inv, ...useInventoryFormOpen({ inv, lastInteractedProductId, listScrollRef, savedScrollTop, tenantId: 'tenant' }) };
  });
  await act(async () => { await result.current.openEdit({ product_id: 'parent', name: 'Shirt', grade_id: 'grade', pricing_mode: 'GRADE_RATE', base_price: 100, domain_attributes: '{}' } as Product); });
  expect(result.current.inv.formData.grade_id).toBe('grade');
  expect(result.current.inv.formData.base_price).toBe(125);
  expect(result.current.inv.grades).toHaveLength(1);
  expect(result.current.inv.view).toBe('edit');
});
