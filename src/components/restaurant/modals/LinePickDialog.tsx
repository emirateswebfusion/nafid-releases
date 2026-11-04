import { useState } from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import type { OrderLine } from '../../../data/restaurant';
import { VOID_REASONS } from '../restaurantRules';

interface LinePickDialogProps {
  mode: 'void' | 'split' | 'cancel';
  lines: OrderLine[];
  onCancel: () => void;
  onConfirm: (parts: { line_id: string; quantity: number }[], reason: string) => void;
}

/** Picks items and quantities (void or split to a new bill) and, for a void or cancel, the reason. */
export function LinePickDialog({ mode, lines, onCancel, onConfirm }: LinePickDialogProps) {
  const active = lines.filter(l => l.status === 'ACTIVE');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState(VOID_REASONS[0]);
  const [other, setOther] = useState('');
  const parts = mode === 'cancel'
    ? active.map(l => ({ line_id: l.line_id, quantity: l.quantity }))
    : Object.entries(qty).filter(([, q]) => q > 0).map(([line_id, quantity]) => ({ line_id, quantity }));
  const finalReason = reason === 'Other' ? other.trim() : reason;
  const title = mode === 'void' ? 'Void items' : mode === 'split' ? 'Split to a new bill' : 'Cancel order';
  const step = (line: OrderLine, delta: number) => setQty(prev => ({
    ...prev, [line.line_id]: Math.min(line.quantity, Math.max(0, (prev[line.line_id] ?? 0) + delta)),
  }));

  return (
    <Modal isOpen onClose={onCancel} title={title}>
      {mode !== 'cancel' && (
        <div className="max-h-[40vh] space-y-1 overflow-y-auto">
          {active.map(line => (
            <div key={line.line_id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
              <span className="text-sm">{line.quantity} × {line.name}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => step(line, -1)}>−</Button>
                <span className="w-8 text-center font-black">{qty[line.line_id] ?? 0}</span>
                <Button size="sm" variant="outline" onClick={() => step(line, 1)}>+</Button>
                <Button size="sm" variant="ghost" onClick={() => setQty(prev => ({ ...prev, [line.line_id]: line.quantity }))}>All</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {mode === 'cancel' && <p className="text-sm">All {active.length} item(s) are voided and the kitchen gets VOID tickets.</p>}
      {mode !== 'split' && (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Reason</div>
          <div className="flex flex-wrap gap-2">
            {VOID_REASONS.map(r => (
              <button key={r} type="button" onClick={() => setReason(r)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${reason === r ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{r}</button>
            ))}
          </div>
          {reason === 'Other' && <input value={other} onChange={e => setOther(e.target.value)} placeholder="Reason"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Back</Button>
        <Button variant={mode === 'split' ? 'default' : 'destructive'}
          disabled={(mode !== 'cancel' && parts.length === 0) || (mode !== 'split' && !finalReason)}
          onClick={() => onConfirm(parts, mode === 'split' ? '' : finalReason)}>{title}</Button>
      </div>
    </Modal>
  );
}
