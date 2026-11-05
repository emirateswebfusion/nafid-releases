import { useCallback, useEffect, useState } from 'react';
import { Clock, Maximize2, Minimize2 } from 'lucide-react';
import { restaurantApi, lineModifiers, type KdsData, type KdsStatus, type KitchenStation } from '../../../data/restaurant';
import { bridgeEvents } from '../../../data/events';
import { minutesSince } from '../restaurantRules';
import { KDS_COLUMN_STYLE } from '../ui/restaurantStyle';

const NEXT: Record<KdsStatus, KdsStatus | null> = { NEW: 'PREPARING', PREPARING: 'READY', READY: 'SERVED', SERVED: null };
const COLUMNS: Exclude<KdsStatus, 'SERVED'>[] = ['NEW', 'PREPARING', 'READY'];

interface KitchenDisplayProps {
  tenantId: string;
  stations: KitchenStation[];
}

/**
 * Kitchen display (KDS): tickets per station, oldest first, in three columns. One tap moves a ticket forward
 * (NEW → PREPARING → READY → SERVED). Ticket borders turn amber after 10 minutes and red after 20.
 */
export function KitchenDisplay({ tenantId, stations }: KitchenDisplayProps) {
  const [data, setData] = useState<KdsData>({ tickets: [], lines: [], tables: [] });
  const [station, setStation] = useState('');
  const [focus, setFocus] = useState(false);
  const [, setTick] = useState(0);
  const load = useCallback(async () => {
    try { setData(await restaurantApi.listKds({ tenant_id: tenantId })); } catch { /* keep the last view */ }
  }, [tenantId]);
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => { void load(); setTick(t => t + 1); }, 5000);
    const off = bridgeEvents.onSyncDataUpdated(() => void load());
    return () => { window.clearTimeout(first); window.clearInterval(timer); off(); };
  }, [load]);

  const bump = async (kotId: string, status: KdsStatus) => {
    const next = NEXT[status];
    if (!next) return;
    await restaurantApi.setKdsStatus({ kot_id: kotId, status: next });
    void load();
  };

  const tickets = data.tickets.filter(t => !station || t.station_id === station);
  return (
    <div className={`flex min-h-0 flex-col bg-background text-foreground ${focus ? 'fixed inset-0 z-50' : 'h-full'}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        {[{ station_id: '', name: 'All stations' }, ...stations].map(s => (
          <button key={s.station_id || 'all'} type="button" onClick={() => setStation(s.station_id)}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${station === s.station_id ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>{s.name}</button>
        ))}
        <span className="ml-auto text-sm font-semibold text-muted-foreground">{tickets.length} open ticket{tickets.length === 1 ? '' : 's'}</span>
        <button type="button" onClick={() => setFocus(f => !f)} title={focus ? 'Exit full screen' : 'Full screen'}
          className="rounded-xl border border-border bg-card p-2 text-muted-foreground hover:bg-muted hover:text-foreground">{focus ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-3">
        {COLUMNS.map(status => {
          const style = KDS_COLUMN_STYLE[status];
          const column = tickets.filter(t => t.kds_status === status);
          return (
            <section key={status} className="flex min-h-0 flex-col overflow-hidden rounded-[20px] bg-card border border-border shadow-sm">
              <header className={`flex items-center justify-between px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white ${style.header}`}>
                <span>{style.title}</span><span className="rounded-full bg-black/25 px-2.5">{column.length}</span>
              </header>
              <div className="min-h-[180px] flex-1 space-y-3 overflow-y-auto p-3">
                {column.map(t => {
                  const age = minutesSince(t.created_at);
                  const table = data.tables.find(x => x.table_id === t.table_id);
                  const border = age >= 20 ? 'border-rose-500' : age >= 10 ? 'border-amber-400' : 'border-border';
                  const lines = data.lines.filter(l => l.kot_id === t.kot_id);
                  return (
                    <article key={t.kot_id} className={`overflow-hidden rounded-xl border-2 bg-background ${border}`}>
                      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
                        <div>
                          <div className="text-xl font-black leading-tight">{t.order_type === 'DINE_IN' ? `Table ${table?.label ?? '?'}` : `${t.order_type === 'DELIVERY' ? 'Delivery' : 'Takeaway'} ${t.order_no}`}</div>
                          <div className="text-xs text-muted-foreground">KOT {t.kot_no} · {t.station_name}{t.waiter_name ? ` · ${t.waiter_name}` : ''}</div>
                        </div>
                        <span className={`flex items-center gap-1 text-sm font-black ${age >= 20 ? 'text-rose-600 dark:text-rose-400' : age >= 10 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}><Clock className="h-4 w-4" />{age}′</span>
                      </div>
                      <ul className="space-y-1 px-3 py-2">
                        {lines.map(l => (
                          <li key={l.line_id} className={l.status === 'VOIDED' ? 'text-rose-600 dark:text-rose-400 line-through' : ''}>
                            <div className="text-lg font-bold leading-snug"><span className="mr-2 font-black">{l.quantity}×</span>{l.name}{l.seat ? <span className="ml-1 text-xs text-muted-foreground">S{l.seat}</span> : null}</div>
                            {lineModifiers(l).map((m, i) => <div key={i} className="pl-8 text-base text-primary">+ {m.name}</div>)}
                            {l.note && <div className="pl-8 text-base italic text-amber-700 dark:text-amber-300">“{l.note}”</div>}
                          </li>
                        ))}
                      </ul>
                      {t.order_note && <div className="mx-3 mb-2 rounded-lg bg-amber-400/15 px-2 py-1 text-sm font-semibold text-amber-800 dark:text-amber-200">Note: {t.order_note}</div>}
                      <button type="button" onClick={() => void bump(t.kot_id, t.kds_status)}
                        className={`w-full py-3 text-base font-black uppercase tracking-wider text-white transition active:scale-[0.99] ${style.action}`}>{style.next}</button>
                    </article>
                  );
                })}
                {column.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">Nothing here</div>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
