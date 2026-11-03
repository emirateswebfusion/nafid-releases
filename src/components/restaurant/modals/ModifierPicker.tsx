import { useState } from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import type { Product } from '../../../data/products';
import type { Modifier, ModifierGroup, OrderModifier } from '../../../data/restaurant';
import { formatCurrency } from '../../../utils/pricing/money';
import { modifierChoiceError } from '../restaurantRules';

interface ModifierPickerProps {
  product: Product;
  groups: ModifierGroup[];
  modifiers: Modifier[];
  onCancel: () => void;
  onConfirm: (choice: { quantity: number; modifiers: OrderModifier[]; note: string | null; seat: number | null }) => void;
}

/** Add-ons, quantity, kitchen note and seat for one item before it joins the draft. */
export function ModifierPicker({ product, groups, modifiers, onCancel, onConfirm }: ModifierPickerProps) {
  const [chosen, setChosen] = useState<Modifier[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [seat, setSeat] = useState('');
  const error = modifierChoiceError(groups, chosen);

  const toggle = (group: ModifierGroup, modifier: Modifier) => {
    setChosen(prev => {
      if (prev.some(m => m.modifier_id === modifier.modifier_id)) return prev.filter(m => m.modifier_id !== modifier.modifier_id);
      const inGroup = prev.filter(m => m.group_id === group.group_id);
      // Single-choice groups behave like radio buttons.
      if (group.max_select === 1 && inGroup.length === 1) return [...prev.filter(m => m.group_id !== group.group_id), modifier];
      if (inGroup.length >= group.max_select) return prev;
      return [...prev, modifier];
    });
  };

  return (
    <Modal isOpen onClose={onCancel} title={product.name}>
      <div className="space-y-4">
        {groups.map(group => (
          <div key={group.group_id}>
            <div className="mb-1 text-xs font-black uppercase tracking-widest text-muted-foreground">
              {group.name} {group.min_select > 0 ? '(required)' : ''} {group.max_select > 1 ? `· up to ${group.max_select}` : ''}
            </div>
            <div className="flex flex-wrap gap-2">
              {modifiers.filter(m => m.group_id === group.group_id && m.is_active).map(m => {
                const on = chosen.some(c => c.modifier_id === m.modifier_id);
                return (
                  <button key={m.modifier_id} type="button" onClick={() => toggle(group, m)}
                    className={`rounded-xl border px-3 py-2 text-sm font-bold ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>
                    {m.name}{m.price > 0 ? ` +${formatCurrency(m.price)}` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs font-bold">Quantity
            <div className="mt-1 flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setQuantity(q => Math.max(1, q - 1))}>−</Button>
              <span className="w-8 text-center text-lg font-black">{quantity}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setQuantity(q => q + 1)}>+</Button>
            </div>
          </label>
          <label className="col-span-2 text-xs font-bold">Kitchen note
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. no onion, less spicy"
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-bold">Seat (optional)
            <input value={seat} onChange={e => setSeat(e.target.value.replace(/\D/g, ''))} inputMode="numeric"
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          </label>
        </div>
        {error && <div className="text-sm font-bold text-destructive">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button disabled={!!error} onClick={() => onConfirm({
            quantity,
            modifiers: chosen.map(m => ({ modifier_id: m.modifier_id, name: m.name, price: m.price, tax_rate: m.tax_rate })),
            note: note.trim() || null,
            seat: seat ? Number(seat) : null,
          })}>Add</Button>
        </div>
      </div>
    </Modal>
  );
}
