import { useState } from 'react';
import { BellRing, Clock, Plus, Receipt, ScrollText, Users } from 'lucide-react';
import type { ActiveOrders, DiningTable, RestaurantOrder } from '../../../data/restaurant';
import { formatCurrency } from '../../../utils/pricing/money';
import { minutesSince, orderValue, tableState, type TableState } from '../restaurantRules';
import { TABLE_STYLE, ageTone, formatElapsed } from '../ui/restaurantStyle';

interface FloorViewProps {
  tables: DiningTable[];
  active: ActiveOrders;
  /** Orders with items added but not sent to the kitchen. */
  unsentOrderIds: string[];
  /** Orders that have had their bill / guest check printed. */
  billedOrderIds?: string[] | Record<string, boolean>;
  onFreeTable: (table: DiningTable) => void;
  onOpenOrder: (order: RestaurantOrder) => void;
  onSetup: () => void;
}

function TableTile({ table, active, unsentOrderIds, billedOrderIds, onFreeTable, onOpenOrder }: { table: DiningTable } & Omit<FloorViewProps, 'tables' | 'onSetup'>) {
  const { state, orders } = tableState(table.table_id, active, billedOrderIds);
  const style = TABLE_STYLE[state];
  const first = orders[0];
  if (!first) {
    return (
      <button type="button" onClick={() => onFreeTable(table)}
        className={`group relative flex min-h-[132px] flex-col overflow-hidden rounded-2xl border p-4 text-left transition-all active:scale-[0.97] ${style.tile}`}>
        <div className="flex items-start justify-between">
          <span className="text-3xl font-black tracking-tight text-foreground/80">{table.label}</span>
          <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground"><Users className="h-3 w-3" />{table.seats}</span>
        </div>
        <span className="mt-auto flex items-center gap-1 text-xs font-bold text-muted-foreground group-hover:text-primary"><Plus className="h-3.5 w-3.5" />Seat guests</span>
      </button>
    );
  }
  const lines = active.lines.filter(l => orders.some(o => o.order_id === l.order_id));
  const minutes = minutesSince(first.opened_at);
  const covers = orders.reduce((s, o) => s + o.covers, 0);
  return (
    <button type="button" onClick={() => onOpenOrder(first)}
      className={`relative flex min-h-[132px] flex-col overflow-hidden rounded-2xl border p-4 pt-5 text-left shadow-sm transition-all active:scale-[0.97] ${style.tile}`}>
      <span className={`absolute inset-x-0 top-0 h-1.5 ${style.stripe}`} />
      <div className="flex items-start justify-between gap-2">
        <span className="text-3xl font-black tracking-tight">{table.label}</span>
        <span className="flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-bold"><Users className="h-3 w-3" />{covers || '–'}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="whitespace-nowrap text-lg font-black tabular-nums">{formatCurrency(orderValue(lines))}</span>
        {state === 'ready' && <span className="flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow animate-pulse"><BellRing className="h-3 w-3" />Ready</span>}
        {orders.some(o => unsentOrderIds.includes(o.order_id)) && <span className="rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow">Unsent</span>}
        {state === 'billed' && <span className="flex items-center gap-1 rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow"><ScrollText className="h-3 w-3" />Billed</span>}
        {state === 'billing' && <span className="flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow"><Receipt className="h-3 w-3" />In payment</span>}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 text-[11px] font-semibold">
        <span className={`flex items-center gap-1 ${ageTone(minutes, 45, 90)}`}><Clock className="h-3 w-3" />{formatElapsed(minutes)}</span>
        <span className="truncate text-muted-foreground">{first.waiter_name ?? ''}{orders.length > 1 ? ` · ${orders.length} bills` : ''}</span>
      </div>
    </button>
  );
}

/** Floor plan: area tabs, a legend with counts, and one tile per table (tap a free table to seat guests). */
export function FloorView({ tables, active, unsentOrderIds, billedOrderIds, onFreeTable, onOpenOrder, onSetup }: FloorViewProps) {
  const visible = tables.filter(t => t.is_active);
  const areas = [...new Set(visible.map(t => t.area || 'Main'))];
  const [area, setArea] = useState<string>('');
  if (visible.length === 0) {
    return (
      <div className="mx-auto my-12 flex max-w-sm flex-col items-center gap-3 p-10 text-center">
        <div className="rounded-3xl bg-primary/10 p-5 text-primary"><Users className="h-10 w-10" /></div>
        <h2 className="text-lg font-black">No tables yet</h2>
        <p className="text-sm text-muted-foreground">Add your tables once (for example T1 to T12, by area) and they appear here for the waiters.</p>
        <button type="button" onClick={onSetup} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Set up tables</button>
      </div>
    );
  }
  const counts = visible.reduce((acc, t) => { acc[tableState(t.table_id, active, billedOrderIds).state]++; return acc; }, { free: 0, occupied: 0, billed: 0, billing: 0, ready: 0 } as Record<TableState, number>);
  const shown = area ? visible.filter(t => (t.area || 'Main') === area) : visible;
  const groups = area ? [area] : areas;
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        {areas.length > 1 && (
          <div className="flex rounded-xl border border-border bg-card p-1">
            {['', ...areas].map(a => (
              <button key={a || 'all'} type="button" onClick={() => setArea(a)}
                className={`rounded-lg px-3 py-1.5 text-sm font-bold ${area === a ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{a || 'All areas'}</button>
            ))}
          </div>
        )}
        <div className="ml-auto flex flex-wrap gap-3 text-xs font-semibold text-muted-foreground">
          {(Object.keys(TABLE_STYLE) as TableState[]).map(s => (
            <span key={s} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${TABLE_STYLE[s].dot}`} />{TABLE_STYLE[s].label} <b className="text-foreground">{counts[s]}</b></span>
          ))}
        </div>
      </div>
      {groups.map(g => (
        <section key={g}>
          {groups.length > 1 && <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">{g}</h3>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {shown.filter(t => (t.area || 'Main') === g).map(table => (
              <TableTile key={table.table_id} table={table} active={active} unsentOrderIds={unsentOrderIds} billedOrderIds={billedOrderIds} onFreeTable={onFreeTable} onOpenOrder={onOpenOrder} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
