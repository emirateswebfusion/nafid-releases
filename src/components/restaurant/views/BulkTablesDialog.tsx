import { useState } from 'react';
import { restaurantApi, type DiningTable } from '../../../data/restaurant';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { useCloseOnEscape } from '../../../hooks/useCloseOnEscape';
const input = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm';
/** Explicit entity creation; successful rows survive failures and are skipped on retry. */
export function BulkTablesDialog({ tenantId, tables, onClose, onChanged }: { tenantId: string; tables: DiningTable[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [prefix, setPrefix] = useState('T');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(10);
  const [area, setArea] = useState('Main');
  const [seats, setSeats] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created] = useState(() => new Set<string>());
  const close = () => { if (!busy) onClose(); };
  useCloseOnEscape(close);
  const existing = new Set([...tables.map(t => t.label.trim().toLowerCase()), ...created]);
  const valid = Number.isInteger(from) && from >= 1 && Number.isInteger(to) && to >= from && to - from < 200 && Number.isInteger(seats) && seats >= 1;
  const labels = valid ? Array.from({ length: to - from + 1 }, (_, i) => `${prefix.trim()}${from + i}`) : [];
  const pending = labels.filter(label => !existing.has(label.toLowerCase()));
  return <Modal isOpen onClose={close} title="Bulk Add Tables"><form className="space-y-5" onSubmit={async e => {
    e.preventDefault(); if (!valid || !pending.length) return;
    setBusy(true); setError('');
    let failure = '';
    try {
      for (const label of pending) {
        const result = await restaurantApi.saveTable({ tenant_id: tenantId, label, area: area.trim() || null, seats, sort_order: from + labels.indexOf(label), is_active: 1 });
        if (!result.success) throw new Error(result.error || `Could not add ${label}`);
        created.add(label.toLowerCase());
      }
    } catch (e) { failure = e instanceof Error ? e.message : String(e); }
    try { await onChanged(); } catch (e) { failure ||= e instanceof Error ? e.message : String(e); }
    setBusy(false);
    if (failure) setError(`${failure}. Successfully added tables are kept; retry adds only missing tables.`); else onClose();
  }}>
    <p className="text-sm text-muted-foreground">Create a numbered range of tables. Existing table names are skipped.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <fieldset disabled={busy} className="grid grid-cols-2 gap-4"><label className="text-xs font-semibold">Prefix<input className={input} value={prefix} onChange={e => setPrefix(e.target.value)} /></label><label className="text-xs font-semibold">Seating area<input className={input} value={area} onChange={e => setArea(e.target.value)} /></label><label className="text-xs font-semibold">From<input type="number" required min={1} step={1} className={input} value={from} onChange={e => setFrom(Number(e.target.value))} /></label><label className="text-xs font-semibold">To<input type="number" required min={from} step={1} className={input} value={to} onChange={e => setTo(Number(e.target.value))} /></label><label className="text-xs font-semibold">Seats per table<input type="number" required min={1} step={1} className={input} value={seats} onChange={e => setSeats(Number(e.target.value))} /></label></fieldset>
    <p role="status" className="rounded-xl bg-muted/40 p-3 text-sm">{valid ? `${labels[0]} – ${labels.at(-1)} · ${pending.length} new tables · ${labels.length - pending.length} existing names skipped` : 'Enter whole numbers, at least one seat, and a range of up to 200 tables.'}</p>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button type="submit" disabled={busy || !valid || !pending.length}>{busy ? 'Adding…' : 'Add Tables'}</Button></div>
  </form></Modal>;
}
