import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { restaurantApi, parseTextList, type Modifier, type ModifierGroup } from '../../../data/restaurant';
interface Props { api?: typeof restaurantApi; tenantId: string; groups: ModifierGroup[]; modifiers: Modifier[]; categories: string[]; onChanged: () => void; onError: (message: string) => void }
const input = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm';
/** Every field edits the shared restaurant draft; the main Settings action persists it. */
export function ModifiersSetup({ api = restaurantApi, tenantId, groups, modifiers, categories, onChanged, onError }: Props) {
  const update = async (group: ModifierGroup, choices: Modifier[]) => {
    const result = await api.saveModifierGroup({ ...group, categories: parseTextList(group.categories), modifiers: choices });
    if (!result.success) onError(result.error); else onChanged();
  };
  return <div className="space-y-4">
    <Button onClick={async () => { const result = await api.saveModifierGroup({ tenant_id: tenantId, name: 'New add-on group', min_select: 0, max_select: 1, categories: [], modifiers: [] }); if (!result.success) onError(result.error); else onChanged(); }}><Plus className="mr-2 h-4 w-4" />Add group</Button>
    {!groups.length && <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Add choices such as extras, toppings or spice levels.</p>}
    {groups.map(group => {
      const choices = modifiers.filter(x => x.group_id === group.group_id);
      const patch = (value: Partial<ModifierGroup>) => void update({ ...group, ...value }, choices);
      return <section key={group.group_id} className="space-y-4 rounded-xl border border-border p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_100px_100px_auto]">
          <label className="text-xs font-semibold">Group name<input aria-label="Group name" className={input} value={group.name} onChange={e => patch({ name: e.target.value })} /></label>
          <label className="text-xs font-semibold">Minimum<input type="number" min={0} className={input} value={group.min_select} onChange={e => patch({ min_select: Number(e.target.value) })} /></label>
          <label className="text-xs font-semibold">Maximum<input type="number" min={1} className={input} value={group.max_select} onChange={e => patch({ max_select: Number(e.target.value) })} /></label>
          <button aria-label="Remove add-on group" className="text-destructive" onClick={async () => { const r = await api.deleteModifierGroup({ tenant_id: tenantId, group_id: group.group_id }); if (!r.success) onError(r.error); else onChanged(); }}><Trash2 className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap gap-3">{categories.map(category => <label key={category} className="text-xs"><input type="checkbox" checked={parseTextList(group.categories).includes(category)} onChange={e => patch({ categories: JSON.stringify(e.target.checked ? [...parseTextList(group.categories), category] : parseTextList(group.categories).filter(x => x !== category)) })} /> {category}</label>)}</div>
        {choices.map(choice => <div key={choice.modifier_id} className="grid grid-cols-[1fr_90px_75px_auto] gap-2">
          {(['name', 'price', 'tax_rate'] as const).map(key => <label key={key} className="text-xs">{key === 'name' ? 'Choice' : key === 'price' ? 'Price' : 'Tax %'}<input className={input} type={key === 'name' ? 'text' : 'number'} min={0} value={choice[key]} onChange={e => void update(group, choices.map(x => x.modifier_id === choice.modifier_id ? { ...x, [key]: key === 'name' ? e.target.value : Number(e.target.value) } : x))} /></label>)}
          <button aria-label="Remove choice" className="text-destructive" onClick={() => void update(group, choices.filter(x => x.modifier_id !== choice.modifier_id))}><Trash2 className="h-4 w-4" /></button>
        </div>)}
        <Button variant="outline" size="sm" onClick={() => void update(group, [...choices, { modifier_id: crypto.randomUUID(), tenant_id: tenantId, group_id: group.group_id, name: 'New choice', price: 0, tax_rate: 5, sort_order: choices.length, is_active: 1 }])}>Add choice</Button>
      </section>;
    })}
  </div>;
}
