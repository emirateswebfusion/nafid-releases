import { Printer, Trash2 } from 'lucide-react';
import { lineModifiers, type KotTicket, type OrderLine } from '../../../data/restaurant';
import { formatCurrency } from '../../../utils/pricing/money';

export interface DraftLine {
  key: string;
  product_id: string;
  name: string;
  category: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  modifiers: { modifier_id: string; name: string; price: number; tax_rate: number }[];
  note: string | null;
  seat: number | null;
}

interface OrderTicketViewProps {
  lines: OrderLine[];
  kots: KotTicket[];
  drafts: DraftLine[];
  onDraftQty: (key: string, delta: number) => void;
  onDraftRemove: (key: string) => void;
  onReprint: (kotId: string) => void;
}

const KDS_LABEL: Record<string, string> = { NEW: 'Sent', PREPARING: 'Preparing', READY: 'Ready', SERVED: 'Served' };

function LineText({ name, quantity, unitPrice, modifiers, note, voided }: { name: string; quantity: number; unitPrice: number; modifiers: { name: string; price: number }[]; note: string | null; voided?: string | null }) {
  const value = quantity * (unitPrice + modifiers.reduce((s, m) => s + m.price, 0));
  return (
    <div className={voided ? 'text-muted-foreground line-through' : ''}>
      <div className="flex justify-between gap-2 text-sm">
        <span className="font-bold">{quantity} × {name}</span>
        <span>{formatCurrency(value)}</span>
      </div>
      {modifiers.map((m, i) => <div key={i} className="pl-4 text-xs text-muted-foreground">+ {m.name}</div>)}
      {note && <div className="pl-4 text-xs italic text-amber-600">* {note}</div>}
      {voided && <div className="pl-4 text-xs no-underline">Void: {voided}</div>}
    </div>
  );
}

/** The order as the guest sees it: kitchen tickets already sent (with kitchen status) and unsent draft items. */
export function OrderTicketView({ lines, kots, drafts, onDraftQty, onDraftRemove, onReprint }: OrderTicketViewProps) {
  const shown = lines.filter(l => !(l.status === 'VOIDED' && l.void_reason === 'MOVED'));
  const kotIds = [...new Set(shown.map(l => l.kot_id ?? ''))];
  return (
    <div className="space-y-3">
      {kotIds.map(kotId => {
        const kot = kots.find(k => k.kot_id === kotId);
        return (
          <div key={kotId || 'none'} className="rounded-xl border border-border p-2">
            <div className="mb-1 flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-muted-foreground">
              <span>{kot ? `KOT ${kot.kot_no} · ${kot.station_name ?? ''}` : 'Items'}</span>
              {kot && (
                <span className="flex items-center gap-2">
                  {kot.print_error && <span className="text-destructive" title={kot.print_error}>Not printed</span>}
                  <span className={kot.kds_status === 'READY' ? 'text-emerald-600' : ''}>{KDS_LABEL[kot.kds_status]}</span>
                  <button type="button" title="Reprint" onClick={() => onReprint(kot.kot_id)}><Printer className="h-3.5 w-3.5" /></button>
                </span>
              )}
            </div>
            {shown.filter(l => (l.kot_id ?? '') === kotId).map(l => (
              <LineText key={l.line_id} name={l.name} quantity={l.quantity} unitPrice={l.unit_price} modifiers={lineModifiers(l)}
                note={l.note} voided={l.status === 'VOIDED' ? l.void_reason : null} />
            ))}
          </div>
        );
      })}
      {drafts.length > 0 && (
        <div className="rounded-xl border-2 border-dashed border-primary/60 p-2">
          <div className="mb-1 text-[11px] font-black uppercase tracking-wider text-primary">Not sent yet</div>
          {drafts.map(d => (
            <div key={d.key} className="flex items-start gap-2">
              <div className="flex-1"><LineText name={d.name} quantity={d.quantity} unitPrice={d.unit_price} modifiers={d.modifiers} note={d.note} /></div>
              <div className="flex items-center gap-1">
                <button type="button" className="rounded-lg border border-border px-2 text-sm" onClick={() => onDraftQty(d.key, -1)}>−</button>
                <button type="button" className="rounded-lg border border-border px-2 text-sm" onClick={() => onDraftQty(d.key, 1)}>+</button>
                <button type="button" className="p-1 text-destructive" onClick={() => onDraftRemove(d.key)}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {kotIds.length === 0 && drafts.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Tap menu items to add them.</div>}
    </div>
  );
}
