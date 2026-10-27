import { useAuthStore } from '../../../store/authStore';
import { useCartStore } from '../../../store/cartStore';
import { isHeaderButtonVisible, useBillingUIStore } from '../../../store/billingUIStore';
import { useTabStore } from '../../../store/tabStore';
import { useFilingSettings } from '../hooks/useFilingSettings';
export function FilingOnlyButton() {
  const tenantId = useAuthStore(s => s.tenantId);
  const options = useFilingSettings(tenantId);
  const active = useCartStore(s => s.isFilingOnly);
  const editing = useCartStore(s => s.editingInvoiceId);
  const config = useBillingUIStore(s => s.config);
  if (!options.enabled || !isHeaderButtonVisible(config, 'showFilingOnly')) return null;
  return <button type="button" disabled={Boolean(editing)} aria-pressed={active} className={`px-3 py-2 rounded-xl border ${active ? 'bg-primary text-primary-foreground' : 'bg-card'}`} onClick={() => {
    const cart = useCartStore.getState();
    useCartStore.setState({ isFilingOnly: !active, ...(!active ? { filingPreviousInvoiceType: cart.invoiceType, isScrapMode: false, isReturnMode: false, isQuotationMode: false, invoiceType: 'GST' as const } : { invoiceType: cart.filingPreviousInvoiceType || 'BILL_OF_SUPPLY' }) });
    useTabStore.getState().syncActiveSnapshot();
  }}>Filing-only</button>;
}
