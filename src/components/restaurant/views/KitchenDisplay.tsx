import { useCallback, useEffect, useState } from 'react';
import { restaurantApi, lineModifiers, type KdsData, type KdsStatus, type KitchenStation } from '../../../data/restaurant';
import { bridgeEvents } from '../../../data/events';
import { minutesSince } from '../restaurantRules';

const NEXT: Record<KdsStatus, KdsStatus | null> = { NEW: 'PREPARING', PREPARING: 'READY', READY: 'SERVED', SERVED: null };
const ACTION: Record<KdsStatus, string> = { NEW: 'Start', PREPARING: 'Ready', READY: 'Served', SERVED: '' };
const COLUMNS: { status: KdsStatus; title: string }[] = [
  { status: 'NEW', title: 'New' }, { status: 'PREPARING', title: 'Preparing' }, { status: 'READY', title: 'Ready' },
];

interface KitchenDisplayProps {
  tenantId: string;
  stations: KitchenStation[];
}

/** Kitchen display (KDS): tickets per station, oldest first; tap to move NEW → PREPARING → READY → SERVED. */
export function KitchenDisplay({ tenantId, stations }: KitchenDisplayProps) {
  const [data, setData] = useState<KdsData>({ tickets: [], lines: [], tables: [] });
  const [station, setStation] = useState('');
  const load = useCallback(async () => {
    try { setData(await restaurantApi.listKds({ tenant_id: tenantId })); } catch { /* keep the last view */ }
  }, [tenantId]);
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 5000);
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
    <div className="flex h-full min-h-0 flex-col p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setStation('')} className={`rounded-full px-3 py-1 text-xs font-bold ${!station ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>All stations</button>
        {stations.map(s => (
          <button key={s.station_id} type="button" onClick={() => setStation(s.station_id)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${station === s.station_id ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{s.name}</button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-3">
        {COLUMNS.map(col => (
          <div key={col.status} className="flex min-h-0 flex-col rounded-2xl bg-muted/40 p-2">
            <div className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">{col.title} ({tickets.filter(t => t.kds_status === col.status).length})</div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {tickets.filter(t => t.kds_status === col.status).map(t => {
                const age = minutesSince(t.created_at);
                const table = data.tables.find(x => x.table_id === t.table_id);
                return (
                  <button key={t.kot_id} type="button" onClick={() => void bump(t.kot_id, t.kds_status)}
                    className={`w-full rounded-xl border-2 bg-card p-2 text-left ${age >= 20 ? 'border-destructive' : age >= 10 ? 'border-amber-500' : 'border-border'}`}>
                    <div className="flex justify-between text-sm font-black">
                      <span>{t.order_type === 'DINE_IN' ? `Table ${table?.label ?? '?'}` : `#${t.order_no}`}</span>
                      <span>{age}′</span>
                    </div>
                    <div className="mb-1 text-[11px] text-muted-foreground">KOT {t.kot_no} · {t.station_name}{t.waiter_name ? ` · ${t.waiter_name}` : ''}</div>
                    {data.lines.filter(l => l.kot_id === t.kot_id).map(l => (
                      <div key={l.line_id} className={l.status === 'VOIDED' ? 'text-destructive line-through' : ''}>
                        <div className="text-base font-bold">{l.quantity} × {l.name}{l.seat ? ` [S${l.seat}]` : ''}</div>
                        {lineModifiers(l).map((m, i) => <div key={i} className="pl-4 text-sm">+ {m.name}</div>)}
                        {l.note && <div className="pl-4 text-sm italic text-amber-600">* {l.note}</div>}
                      </div>
                    ))}
                    {t.order_note && <div className="mt-1 text-sm italic">Note: {t.order_note}</div>}
                    <div className="mt-2 rounded-lg bg-primary py-1 text-center text-xs font-black text-primary-foreground">{ACTION[t.kds_status]}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
