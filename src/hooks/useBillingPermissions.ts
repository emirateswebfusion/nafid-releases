import { useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { getBillingPermissions, type BillingPermissions } from '../utils/security/permissions';

/** Signed-in user's billing price/discount/cost rights (see `getBillingPermissions`). */
export function useBillingPermissions(): BillingPermissions {
  const role = useAuthStore(s => s.role);
  const permissions = useAuthStore(s => s.permissions);
  const restrictedPage = useAuthStore(s => s.restrictedPage);
  return useMemo(
    () => getBillingPermissions({ role, permissions, restrictedPage }),
    [role, permissions, restrictedPage],
  );
}
