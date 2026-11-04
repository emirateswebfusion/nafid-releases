import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { restaurantApi, type DiningTable } from '../../../data/restaurant';

interface TablesSetupProps {
  tenantId: string;
  tables: DiningTable[];
  onChanged: () => void;
  onError: (message: string) => void;
}

const input = 'rounded-lg border border-border bg-background px-2 py-1 text-sm';

/** Dining tables: label, area, seats; quick add of a numbered range ("T1–T12"). */
export function TablesSetup({ tenantId, tables, onChanged, onError }: TablesSetupProps) {
  const [prefix, setPrefix] = useState('T');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('10');
  const [area, setArea] = useState('Main');
  const [seats, setSeats] = useState('4');

  const save = async (table: Partial<DiningTable>) => {
    const result = await restaurantApi.saveTable({ tenant_id: tenantId, ...table });
    if (!result.success) onError(result.error);
  };

  const addRange = async () => {
    const a = Number(from), b = Number(to);
    if (!Number.isInteger(a) || !Number.isInteger(b) || b < a || b - a > 200) { onError('Enter a valid number range (max 200 tables)'); return; }
    const existing = new Set(tables.map(t => t.label.toLowerCase()));
    for (let n = a; n <= b; n++) {
      const label = `${prefix}${n}`;
      if (!existing.has(label.toLowerCase())) await save({ label, area: area || null, seats: Number(seats) || 4, sort_order: n });
    }
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-3">
        <label className="text-xs font-bold">Prefix<br /><input className={`${input} w-16`} value={prefix} onChange={e => setPrefix(e.target.value)} /></label>
        <label className="text-xs font-bold">From<br /><input className={`${input} w-16`} value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="text-xs font-bold">To<br /><input className={`${input} w-16`} value={to} onChange={e => setTo(e.target.value)} /></label>
        <label className="text-xs font-bold">Area<br /><input className={`${input} w-32`} value={area} onChange={e => setArea(e.target.value)} /></label>
        <label className="text-xs font-bold">Seats<br /><input className={`${input} w-16`} value={seats} onChange={e => setSeats(e.target.value)} /></label>
        <Button onClick={() => void addRange()}><Plus className="mr-1 h-4 w-4" />Add tables</Button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs uppercase text-muted-foreground"><th>Label</th><th>Area</th><th>Seats</th><th>Order</th><th>Active</th><th /></tr></thead>
        <tbody>
          {tables.map(t => (
            <tr key={t.table_id} className="border-t border-border">
              <td><input className={`${input} w-24`} defaultValue={t.label} onBlur={e => e.target.value.trim() && e.target.value !== t.label && void save({ ...t, label: e.target.value.trim() }).then(onChanged)} /></td>
              <td><input className={`${input} w-32`} defaultValue={t.area ?? ''} onBlur={e => e.target.value !== (t.area ?? '') && void save({ ...t, area: e.target.value.trim() || null }).then(onChanged)} /></td>
              <td><input className={`${input} w-16`} defaultValue={t.seats} onBlur={e => Number(e.target.value) !== t.seats && void save({ ...t, seats: Number(e.target.value) || 0 }).then(onChanged)} /></td>
              <td><input className={`${input} w-16`} defaultValue={t.sort_order} onBlur={e => Number(e.target.value) !== t.sort_order && void save({ ...t, sort_order: Number(e.target.value) || 0 }).then(onChanged)} /></td>
              <td><input type="checkbox" checked={!!t.is_active} onChange={e => void save({ ...t, is_active: e.target.checked ? 1 : 0 }).then(onChanged)} /></td>
              <td className="text-right">
                <button type="button" className="p-1 text-destructive" title="Delete" onClick={async () => {
                  const r = await restaurantApi.deleteTable({ tenant_id: tenantId, table_id: t.table_id });
                  if (!r.success) onError(r.error); else onChanged();
                }}><Trash2 className="h-4 w-4" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
