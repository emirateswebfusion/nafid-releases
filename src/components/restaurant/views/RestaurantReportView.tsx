import { useEffect, useState } from 'react';
import { Ban, Receipt, TrendingUp, Users, Wallet } from 'lucide-react';
import { restaurantApi, type RestaurantReport } from '../../../data/restaurant';
import { formatCurrency } from '../../../utils/pricing/money';
import { channelStyle } from '../ui/restaurantStyle';

interface RestaurantReportViewProps {
  tenantId: string;
}

const TYPE_LABEL: Record<string, string> = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };
const today = () => new Date().toLocaleDateString('en-CA');
const RANGES: { label: string; days: number }[] = [{ label: 'Today', days: 0 }, { label: '7 days', days: 6 }, { label: '30 days', days: 29 }];

/** Settled restaurant sales by order type / delivery app and by waiter, and voids by reason, for business dates. */
export function RestaurantReportView({ tenantId }: RestaurantReportViewProps) {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [range, setRange] = useState('Today');
  const [report, setReport] = useState<RestaurantReport>({ byType: [], byWaiter: [], voids: [] });
  useEffect(() => {
    restaurantApi.report({ tenant_id: tenantId, from, to }).then(setReport).catch(() => undefined);
  }, [tenantId, from, to]);

  const sales = report.byType.reduce((s, r) => s + r.total, 0);
  const orders = report.byType.reduce((s, r) => s + r.orders, 0);
  const covers = report.byType.reduce((s, r) => s + r.covers, 0);
  const voids = report.voids.reduce((s, r) => s + r.value, 0);
  const tile = (label: string, value: string, Icon: typeof Wallet, tone: string) => (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4">
      <div className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-5 w-5" /></div>
      <div><div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div><div className="text-xl font-black tabular-nums">{value}</div></div>
    </div>
  );
  const bar = (value: number) => (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${sales > 0 ? Math.max(2, (value / sales) * 100) : 0}%` }} /></div>
  );

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-border bg-card p-1">
          {RANGES.map(r => (
            <button key={r.label} type="button"
              onClick={() => { setFrom(new Date(Date.now() - r.days * 86_400_000).toLocaleDateString('en-CA')); setTo(today()); setRange(r.label); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold ${range === r.label ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{r.label}</button>
          ))}
        </div>
        <label className="text-xs font-bold text-muted-foreground">From <input type="date" className="ml-1 rounded-lg border border-border bg-card px-2 py-1.5 text-foreground" value={from} onChange={e => { setFrom(e.target.value); setRange(''); }} /></label>
        <label className="text-xs font-bold text-muted-foreground">To <input type="date" className="ml-1 rounded-lg border border-border bg-card px-2 py-1.5 text-foreground" value={to} onChange={e => { setTo(e.target.value); setRange(''); }} /></label>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {tile('Sales', formatCurrency(sales), Wallet, 'bg-primary/10 text-primary')}
        {tile('Bills', String(orders), Receipt, 'bg-sky-500/10 text-sky-600')}
        {tile('Guests', String(covers), Users, 'bg-violet-500/10 text-violet-600')}
        {tile('Per guest', covers > 0 ? formatCurrency(sales / covers) : '–', TrendingUp, 'bg-emerald-500/10 text-emerald-600')}
        {tile('Voided', formatCurrency(voids), Ban, 'bg-rose-500/10 text-rose-600')}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Sales by order type</h3>
          <div className="space-y-3">
            {report.byType.map((r, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-bold">{TYPE_LABEL[r.order_type] ?? r.order_type}
                    {r.order_type === 'DELIVERY' && <span className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-black ${channelStyle(r.channel).className}`}>{channelStyle(r.channel).label}</span>}
                  </span>
                  <span className="text-muted-foreground">{r.orders} bills{r.order_type === 'DINE_IN' ? ` · ${r.covers} guests` : ''}</span>
                  <span className="font-black tabular-nums">{formatCurrency(r.total)}</span>
                </div>
                {bar(r.total)}
              </div>
            ))}
            {report.byType.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">No settled restaurant bills in this period</div>}
          </div>
        </section>
        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Sales by waiter</h3>
          <div className="space-y-3">
            {report.byWaiter.map((r, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold">{r.waiter_name || 'No waiter'}</span>
                  <span className="text-muted-foreground">{r.orders} bills · {r.covers} guests</span>
                  <span className="font-black tabular-nums">{formatCurrency(r.total)}</span>
                </div>
                {bar(r.total)}
              </div>
            ))}
            {report.byWaiter.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">No data</div>}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border/70 bg-card p-4">
        <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Voids by reason</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-2">Reason</th><th className="pb-2 text-right">Items</th><th className="pb-2 text-right">Value</th></tr></thead>
          <tbody>
            {report.voids.map((r, i) => (
              <tr key={i} className="border-t border-border/60"><td className="py-2 font-semibold">{r.reason || '—'}</td><td className="py-2 text-right">{r.lines}</td><td className="py-2 text-right font-bold tabular-nums">{formatCurrency(r.value)}</td></tr>
            ))}
          </tbody>
        </table>
        {report.voids.length === 0 && <div className="py-4 text-center text-sm text-muted-foreground">No voids in this period</div>}
      </section>
    </div>
  );
}
