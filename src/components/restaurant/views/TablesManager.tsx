import { BulkTablesDialog } from './BulkTablesDialog';
import { useState } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { restaurantApi, type DiningTable } from '../../../data/restaurant';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { useCloseOnEscape } from '../../../hooks/useCloseOnEscape';
interface Props { tenantId: string; tables: DiningTable[]; onChanged: () => Promise<void> }
const input = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm';
/** Standard entity list: add/edit forms and explicit deletion confirmation. */
export function TablesManager({ tenantId, tables, onChanged }: Props) {
  const [editing, setEditing] = useState<Partial<DiningTable> | null>(null);
  const [removing, setRemoving] = useState<DiningTable | null>(null);
  const [bulk, setBulk] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = () => { if (!busy) { setEditing(null); setRemoving(null); } };
  useCloseOnEscape(close);
  const run = async (task: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true); setError('');
    try { const result = await task(); if (!result.success) throw new Error(result.error || 'Could not update table'); await onChanged(); setEditing(null); setRemoving(null); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const shown = tables.filter(t => `${t.label} ${t.area ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="w-full min-w-0 space-y-5 p-4 sm:p-6">
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-4 py-4 sm:px-5 xl:flex-row xl:items-center xl:justify-between">
      <div className="shrink-0"><div className="flex items-center gap-2"><h2 className="text-sm font-bold">Tables</h2><span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{tables.length}</span></div><p className="mt-1 text-xs text-muted-foreground">Seating areas & availability</p></div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:justify-end">
        <div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input aria-label="Search tables" placeholder="Search table or area" className={`${input} pl-9`} value={query} onChange={e => setQuery(e.target.value)} /></div>
        <div className="flex shrink-0 gap-2"><Button variant="outline" onClick={() => setBulk(true)}>Bulk Add Tables</Button><Button onClick={() => { setError(''); setEditing({ label: '', area: '', seats: 4, sort_order: tables.length + 1, is_active: 1 }); }}><Plus className="mr-2 h-4 w-4" />Add Table</Button></div>
      </div>
    </div>
    {error && !editing && !removing && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full table-fixed min-w-[640px] text-left text-sm [&_td]:px-5 [&_td]:py-3 [&_th]:px-5 [&_th]:py-3"><thead className="bg-muted/30 text-xs text-muted-foreground"><tr><th className="w-[22%]">Table</th><th>Area</th><th className="w-24">Seats</th><th className="w-32">Status</th><th className="w-48 text-right">Actions</th></tr></thead><tbody>{shown.map(t => <tr key={t.table_id} className="border-t border-border"><td className="break-words font-semibold">{t.label}</td><td className="break-words">{t.area || '—'}</td><td>{t.seats}</td><td>{t.is_active ? 'Active' : 'Inactive'}</td><td><div className="flex items-center justify-end gap-2 whitespace-nowrap"><Button variant="outline" size="sm" onClick={() => { setError(''); setEditing({ ...t }); }}><Pencil className="mr-1 h-3 w-3" />Edit</Button><Button variant="outline" size="sm" onClick={() => { setError(''); setRemoving(t); }}><Trash2 className="mr-1 h-3 w-3" />Delete</Button></div></td></tr>)}</tbody></table>{!shown.length && <p className="p-12 text-center text-sm text-muted-foreground">{tables.length ? 'No tables match your search.' : 'No tables yet. Add your first table to start taking orders.'}</p>}</div>
    {bulk && <BulkTablesDialog tenantId={tenantId} tables={tables} onClose={() => setBulk(false)} onChanged={onChanged} />}
    <Modal isOpen={!!editing} onClose={close} title={editing?.table_id ? 'Edit Table' : 'Add Table'}>{editing && <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (tables.some(t => t.table_id !== editing.table_id && t.label.trim().toLowerCase() === editing.label?.trim().toLowerCase())) { setError('A table with this name already exists.'); return; } void run(() => restaurantApi.saveTable({ ...editing, tenant_id: tenantId, label: editing.label?.trim(), area: editing.area?.trim() || null })); }}>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold">Table name<input required className={input} value={editing.label ?? ''} onChange={e => setEditing({ ...editing, label: e.target.value })} /></label><label className="text-xs font-semibold">Seating area<input className={input} value={editing.area ?? ''} onChange={e => setEditing({ ...editing, area: e.target.value })} /></label><label className="text-xs font-semibold">Seats<input required type="number" min={1} step={1} className={input} value={editing.seats ?? 4} onChange={e => setEditing({ ...editing, seats: Number(e.target.value) })} /></label><label className="text-xs font-semibold">Display order<input required type="number" min={0} step={1} className={input} value={editing.sort_order ?? 0} onChange={e => setEditing({ ...editing, sort_order: Number(e.target.value) })} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked ? 1 : 0 })} />Active</label></fieldset><div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Table'}</Button></div></form>}</Modal>
    <Modal isOpen={!!removing} onClose={close} title="Delete Table"><div className="space-y-4">{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<p className="text-sm">Delete {removing?.label}? Tables with open orders cannot be deleted.</p><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button disabled={busy} onClick={() => { if (removing) void run(() => restaurantApi.deleteTable({ tenant_id: tenantId, table_id: removing.table_id })); }}>{busy ? 'Deleting…' : 'Delete Table'}</Button></div></div></Modal>
  </div>;
}
