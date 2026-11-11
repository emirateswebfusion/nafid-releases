import { useCallback, useEffect, useState } from 'react';
import { Inbox, Loader2, RotateCcw } from 'lucide-react';
import { einvoiceCloud, type EinvoiceInboundItem } from '../../../data/cloud/einvoiceCloud';
import { formatCurrency } from '../../../utils/pricing/money';
import { SettingsCard } from './SettingsControls';
import { PinCloudBanner } from '../../ui/PinCloudBanner';
import { useAuthStore } from '../../../store/authStore';
import { hasPermission } from '../../../utils/security/permissions';

/** Supplier e-invoices received through the shop's ASP. The owner enters each one as a purchase bill, then marks it. */
export function EinvoiceInboundList() {
  const { role, permissions } = useAuthStore();
  const canRecord = hasPermission({ role, permissions }, 'purchases.create');
  const [items, setItems] = useState<EinvoiceInboundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchItems = useCallback(() => einvoiceCloud.listInbound()
    .then(rows => { setItems(rows); setError(''); })
    .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load received e-invoices (online only)'))
    .finally(() => setLoading(false)), []);

  const load = useCallback(() => { setLoading(true); void fetchItems(); }, [fetchItems]);

  useEffect(() => { void fetchItems(); }, [fetchItems]);

  const mark = async (item: EinvoiceInboundItem, status: 'RECORDED' | 'IGNORED' | 'NEW') => {
    try {
      await einvoiceCloud.setInboundStatus(item.inbound_id, status);
      setItems(prev => prev.map(i => (i.inbound_id === item.inbound_id ? { ...i, status } : i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update');
    }
  };

  return (
    <SettingsCard icon={Inbox} title="Received e-invoices" subtitle="Supplier invoices delivered to you through Peppol. Enter each as a purchase bill, then mark it recorded."
      actions={<button type="button" onClick={load} title="Refresh" className="p-2 rounded-xl hover:bg-muted cursor-pointer">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}</button>}>
      <PinCloudBanner feature="loading received cloud e-invoices" className="mb-3" />
      {error && <p className="text-[11px] text-red-600 mb-3">{error}</p>}
      {!loading && items.length === 0 && !error && <p className="text-[11px] text-muted-foreground">No supplier e-invoices received yet.</p>}
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.inbound_id} className="border border-border rounded-2xl p-3">
            <div className="flex items-center gap-3 text-xs">
              <button type="button" onClick={() => setExpanded(e => (e === item.inbound_id ? null : item.inbound_id))} className="flex-1 text-left cursor-pointer min-w-0">
                <span className="font-bold">{item.supplier_name || 'Supplier'}</span>
                <span className="text-muted-foreground"> · {item.document_kind === 'CREDIT_NOTE' ? 'Credit note' : 'Invoice'} {item.document_number} · {item.issue_date ?? ''}</span>
                {item.supplier_trn && <span className="text-muted-foreground font-mono"> · TRN {item.supplier_trn}</span>}
              </button>
              <span className="font-mono font-bold">{formatCurrency(Number(item.payable_amount) || 0)}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted">{item.status}</span>
              {!canRecord ? null : item.status === 'NEW'
                ? <>
                  <button type="button" onClick={() => void mark(item, 'RECORDED')} className="text-[11px] font-bold text-primary cursor-pointer">Mark recorded</button>
                  <button type="button" onClick={() => void mark(item, 'IGNORED')} className="text-[11px] text-muted-foreground cursor-pointer">Ignore</button>
                </>
                : <button type="button" onClick={() => void mark(item, 'NEW')} className="text-[11px] text-muted-foreground cursor-pointer">Reopen</button>}
            </div>
            {expanded === item.inbound_id && (
              <table className="w-full mt-2 text-[11px]">
                <thead><tr className="text-muted-foreground"><th className="text-left">Item</th><th className="text-right">Qty</th><th className="text-right">Net</th><th className="text-right">VAT %</th></tr></thead>
                <tbody>{item.lines.map((l, i) => (
                  <tr key={i}><td>{l.name}</td><td className="text-right">{l.quantity} {l.unitCode}</td><td className="text-right">{formatCurrency(l.netAmount)}</td><td className="text-right">{l.vatRate}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}
