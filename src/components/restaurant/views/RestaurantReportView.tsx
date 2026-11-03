import { useEffect, useState } from 'react';
import { restaurantApi, type RestaurantReport } from '../../../data/restaurant';
import { formatCurrency } from '../../../utils/pricing/money';

interface RestaurantReportViewProps {
  tenantId: string;
}

const TYPE_LABEL: Record<string, string> = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };
const today = () => new Date().toLocaleDateString('en-CA');

/** Settled restaurant sales by order type / delivery app and by waiter, and voids by reason, for business dates. */
export function RestaurantReportView({ tenantId }: RestaurantReportViewProps) {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<RestaurantReport>({ byType: [], byWaiter: [], voids: [] });
  useEffect(() => {
    restaurantApi.report({ tenant_id: tenantId, from, to }).then(setReport).catch(() => undefined);
  }, [tenantId, from, to]);

  const table = (title: string, head: string[], rows: (string | number)[][]) => (
    <section className="rounded-2xl border border-border p-3">
      <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">{title}</h3>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground">{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="py-1">{c}</td>)}</tr>)}</tbody>
      </table>
      {rows.length === 0 && <div className="py-3 text-center text-sm text-muted-foreground">Nothing in this period</div>}
    </section>
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-3 text-xs font-bold">
        <label>From <input type="date" className="ml-1 rounded-lg border border-border bg-background px-2 py-1" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>To <input type="date" className="ml-1 rounded-lg border border-border bg-background px-2 py-1" value={to} onChange={e => setTo(e.target.value)} /></label>
      </div>
      {table('Sales by order type', ['Type', 'From', 'Orders', 'Guests', 'Sales'],
        report.byType.map(r => [TYPE_LABEL[r.order_type] ?? r.order_type, r.order_type === 'DELIVERY' ? (r.channel === 'OWN' ? 'Own delivery' : r.channel) : '—', r.orders, r.covers, formatCurrency(r.total)]))}
      {table('Sales by waiter', ['Waiter', 'Orders', 'Guests', 'Sales'],
        report.byWaiter.map(r => [r.waiter_name || '—', r.orders, r.covers, formatCurrency(r.total)]))}
      {table('Voids', ['Reason', 'Items', 'Value'], report.voids.map(r => [r.reason || '—', r.lines, formatCurrency(r.value)]))}
    </div>
  );
}
