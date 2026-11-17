import { useState } from 'react';
import { ShoppingBasket } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { hasPermission, isAdminRole } from '../../utils/security/permissions';
import { FloatToast } from '../ui/FloatToast';
import { CustomerCartsPanel } from './CustomerCartsPanel';
import { useCustomerCarts } from './useCustomerCarts';

/**
 * Billing header button for Scan & Go "Customer carts". Shown when the shop has Scan & Go on (to everyone who bills)
 * or to the owner (to turn it on). The count is the number of carts waiting.
 */
function CustomerCartsForShop() {
  const role = useAuthStore(s => s.role);
  const permissions = useAuthStore(s => s.permissions);
  const state = useCustomerCarts();
  const [open, setOpen] = useState(false);
  const isAdmin = isAdminRole(role);
  if (!hasPermission({ role, permissions }, 'sales.create') || !state.available || !state.config || (!state.config.enabled && !isAdmin)) {
    return state.toast ? <FloatToast message={state.toast} onClose={() => state.setToast(null)} /> : null;
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); void state.refresh(); }}
        className="relative flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
        title="Customer carts (Scan & Go)"
      >
        <ShoppingBasket className="w-4 h-4 text-primary" />
        <span>Carts</span>
        {state.openCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[20px] h-4.5 px-1.5 text-[10px] font-black rounded-full leading-none shadow-sm border-2 border-background bg-primary text-primary-foreground">
            {state.openCount}
          </span>
        )}
      </button>
      {open && <CustomerCartsPanel state={state} isAdmin={isAdmin} onClose={() => setOpen(false)} />}
      {state.toast && <FloatToast message={state.toast} onClose={() => state.setToast(null)} />}
    </>
  );
}

export function CustomerCartsButton() {
  const tenantId = useAuthStore(s => s.tenantId);
  return <CustomerCartsForShop key={tenantId} />;
}
