import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { restaurantApi, parseTextList, type Modifier, type ModifierGroup } from '../../../data/restaurant';

interface ModifiersSetupProps {
  tenantId: string;
  groups: ModifierGroup[];
  modifiers: Modifier[];
  categories: string[];
  onChanged: () => void;
  onError: (message: string) => void;
}

interface Draft {
  group_id?: string;
  name: string;
  min_select: number;
  max_select: number;
  categories: string[];
  choices: { modifier_id?: string; name: string; price: string; tax_rate: string }[];
}

const input = 'rounded-lg border border-border bg-background px-2 py-1 text-sm';
/** Restaurant food is 5% GST in India (no input credit) and 5% VAT in the UAE; change it per choice if needed. */
const defaultTax = () => '5';
const blank = (): Draft => ({ name: '', min_select: 0, max_select: 1, categories: [], choices: [{ name: '', price: '0', tax_rate: defaultTax() }] });

/** Add-on groups ("Spice level", "Extras") for categories, with their choices and prices (same basis as menu prices). */
export function ModifiersSetup({ tenantId, groups, modifiers, categories, onChanged, onError }: ModifiersSetupProps) {
  const [draft, setDraft] = useState<Draft | null>(null);

  const edit = (g: ModifierGroup) => setDraft({
    group_id: g.group_id, name: g.name, min_select: g.min_select, max_select: g.max_select, categories: parseTextList(g.categories),
    choices: modifiers.filter(m => m.group_id === g.group_id).map(m => ({ modifier_id: m.modifier_id, name: m.name, price: String(m.price), tax_rate: String(m.tax_rate) })),
  });

  const save = async () => {
    if (!draft) return;
    const result = await restaurantApi.saveModifierGroup({
      tenant_id: tenantId, group_id: draft.group_id, name: draft.name, min_select: draft.min_select, max_select: draft.max_select,
      categories: draft.categories,
      modifiers: draft.choices.filter(c => c.name.trim()).map(c => ({ modifier_id: c.modifier_id, name: c.name.trim(), price: Number(c.price) || 0, tax_rate: Number(c.tax_rate) || 0 })),
    });
    if (!result.success) { onError(result.error); return; }
    setDraft(null);
    onChanged();
  };

  const setChoice = (i: number, patch: Partial<Draft['choices'][number]>) =>
    setDraft(d => d && { ...d, choices: d.choices.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div className="space-y-3">
      {!draft && <Button onClick={() => setDraft(blank())}><Plus className="mr-1 h-4 w-4" />Add add-on group</Button>}
      {draft && (
        <div className="space-y-3 rounded-xl border-2 border-primary/50 p-3">
          <div className="flex flex-wrap gap-3">
            <label className="text-xs font-bold">Group name<br /><input className={`${input} w-48`} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Extras" /></label>
            <label className="text-xs font-bold">Minimum<br /><input className={`${input} w-16`} value={draft.min_select} onChange={e => setDraft({ ...draft, min_select: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></label>
            <label className="text-xs font-bold">Maximum<br /><input className={`${input} w-16`} value={draft.max_select} onChange={e => setDraft({ ...draft, max_select: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs font-bold">For categories:</span>
            {categories.map(c => {
              const on = draft.categories.includes(c);
              return <button key={c} type="button" onClick={() => setDraft({ ...draft, categories: on ? draft.categories.filter(x => x !== c) : [...draft.categories, c] })}
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${on ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{c}</button>;
            })}
          </div>
          <table className="text-sm">
            <thead><tr className="text-left text-xs uppercase text-muted-foreground"><th>Choice</th><th>Price</th><th>Tax %</th><th /></tr></thead>
            <tbody>
              {draft.choices.map((c, i) => (
                <tr key={i}>
                  <td><input className={`${input} w-48`} value={c.name} onChange={e => setChoice(i, { name: e.target.value })} /></td>
                  <td><input className={`${input} w-20`} value={c.price} onChange={e => setChoice(i, { price: e.target.value.replace(/[^\d.]/g, '') })} /></td>
                  <td><input className={`${input} w-16`} value={c.tax_rate} onChange={e => setChoice(i, { tax_rate: e.target.value.replace(/[^\d.]/g, '') })} /></td>
                  <td><button type="button" className="p-1 text-destructive" onClick={() => setDraft({ ...draft, choices: draft.choices.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft({ ...draft, choices: [...draft.choices, { name: '', price: '0', tax_rate: defaultTax() }] })}>Add choice</Button>
            <span className="flex-1" />
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button disabled={!draft.name.trim()} onClick={() => void save()}>Save group</Button>
          </div>
        </div>
      )}
      {groups.map(g => (
        <div key={g.group_id} className="flex items-center gap-3 rounded-xl border border-border p-3">
          <div className="flex-1">
            <div className="font-bold">{g.name} <span className="text-xs text-muted-foreground">({g.min_select}–{g.max_select})</span></div>
            <div className="text-xs text-muted-foreground">{modifiers.filter(m => m.group_id === g.group_id).map(m => m.name).join(', ')}</div>
            <div className="text-xs text-muted-foreground">Categories: {parseTextList(g.categories).join(', ') || '—'}</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => edit(g)}>Edit</Button>
          <button type="button" className="p-1 text-destructive" onClick={async () => {
            const r = await restaurantApi.deleteModifierGroup({ tenant_id: tenantId, group_id: g.group_id });
            if (!r.success) onError(r.error); else onChanged();
          }}><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
