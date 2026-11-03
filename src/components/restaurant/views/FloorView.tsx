import { Clock, Users } from 'lucide-react';
import type { ActiveOrders, DiningTable, RestaurantOrder } from '../../../data/restaurant';
import { formatCurrency } from '../../../utils/pricing/money';
import { minutesSince, orderValue } from '../restaurantRules';

interface FloorViewProps {
  tables: DiningTable[];
  active: ActiveOrders;
  onFreeTable: (table: DiningTable) => void;
  onOpenOrder: (order: RestaurantOrder) => void;
}

/** Tables grouped by area: free, occupied (order value, minutes open) or being billed; ready kitchen tickets flagged. */
export function FloorView({ tables, active, onFreeTable, onOpenOrder }: FloorViewProps) {
  const visible = tables.filter(t => t.is_active);
  if (visible.length === 0) {
    return <div className="p-10 text-center text-muted-foreground">No tables yet. Add tables in Setup → Tables.</div>;
  }
  const areas = [...new Set(visible.map(t => t.area || 'Main'))];
  return (
    <div className="space-y-6 p-4">
      {areas.map(area => (
        <section key={area}>
          <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">{area}</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {visible.filter(t => (t.area || 'Main') === area).map(table => {
              const orders = active.orders.filter(o => o.table_id === table.table_id);
              const first = orders[0];
              const lines = active.lines.filter(l => orders.some(o => o.order_id === l.order_id));
              const ready = active.kots.some(k => orders.some(o => o.order_id === k.order_id) && k.kind === 'NEW' && k.kds_status === 'READY');
              const billing = orders.some(o => o.status === 'BILLING');
              const tone = !first ? 'border-border bg-card hover:bg-muted'
                : billing ? 'border-amber-500 bg-amber-500/10' : 'border-primary bg-primary/10';
              return (
                <button key={table.table_id} type="button"
                  onClick={() => (first ? onOpenOrder(first) : onFreeTable(table))}
                  className={`relative flex min-h-[110px] flex-col rounded-2xl border-2 p-3 text-left transition active:scale-95 ${tone}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black">{table.label}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3" />{first ? orders.reduce((s, o) => s + o.covers, 0) || '-' : table.seats}</span>
                  </div>
                  {first ? (
                    <div className="mt-auto space-y-0.5 text-xs">
                      <div className="font-bold">{formatCurrency(orderValue(lines))}{orders.length > 1 ? ` · ${orders.length} bills` : ''}</div>
                      <div className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{minutesSince(first.opened_at)} min{first.waiter_name ? ` · ${first.waiter_name}` : ''}</div>
                      {billing && <div className="font-bold text-amber-600">Billing…</div>}
                    </div>
                  ) : <div className="mt-auto text-xs text-muted-foreground">Free</div>}
                  {ready && <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-white">READY</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
