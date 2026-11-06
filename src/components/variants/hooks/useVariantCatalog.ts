import { useEffect, useState } from 'react';
import type { Product } from '../../../data/products';
import { loadVariantCatalog } from '../../inventory/variantProducts';

/** A cancelled/previous-tenant read must never replace the visible catalog. */
export function useVariantCatalog(tenantId: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ tenantId: string; products: Product[]; loading: boolean; error: string }>({ tenantId, products: [], loading: true, error: '' });
  useEffect(() => {
    let active = true;
    loadVariantCatalog(tenantId).then(products => {
      if (active) setState({ tenantId, products, loading: false, error: '' });
    }).catch(cause => {
      if (active) setState({ tenantId, products: [], loading: false, error: cause instanceof Error ? cause.message : 'Could not load variants.' });
    });
    return () => { active = false; };
  }, [tenantId, attempt]);
  const refresh = () => {
    setState(previous => ({ ...previous, loading: true, error: '' }));
    setAttempt(value => value + 1);
  };
  return { products: state.tenantId === tenantId ? state.products : [], loading: state.tenantId !== tenantId || state.loading, error: state.tenantId === tenantId ? state.error : '', refresh };
}
