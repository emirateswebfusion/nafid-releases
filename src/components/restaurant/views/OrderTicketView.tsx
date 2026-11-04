import { Minus, Plus, Printer, Trash2, TriangleAlert } from 'lucide-react';
import { lineModifiers, type DraftLine, type KdsStatus, type KotTicket, type OrderLine } from '../../../data/restaurant';
import { formatCurrency } from '../../../utils/pricing/money';

interface OrderTicketViewProps {
  lines: OrderLine[];
  kots: KotTicket[];
  drafts: DraftLine[];
  onDraftQty: (key: string, delta: number) => void;
  onDraftRemove: (key: string) => void;
  onReprint: (kotId: string) => void;
}

const KDS_CHIP: Record<KdsStatus, { label: string; className: string }> = {
  NEW: { label: 'Sent', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  PREPARING: { label: 'Cooking', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  READY: { label: 'Ready', className: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' },
  SERVED: { label: 'Served', className: 'bg-muted text-muted-foreground' },
};

function LineRow({ name, quantity, unitPrice, modifiers, note, seat, voided }: {
  name: string; quantity: number; unitPrice: number; modifiers: { name: string; price: number }[]; note: string | null; seat?: number | null; voided?: string | null;
}) {
  const value = quantity * (unitPrice + modifiers.reduce((s, m) => s + m.price, 0));
  return (
    <div className={`py-1.5 ${voided ? 'opacity-60' : ''}`}>
      <div className="flex items-baseline gap-2 text-sm">
        <span className={`w-7 shrink-0 font-black tabular-nums ${voided ? 'line-through' : ''}`}>{quantity}×</span>
        <span className={`flex-1 font-semibold ${voided ? 'line-through' : ''}`}>{name}{seat ? <span className="ml-1 text-[10px] text-muted-foreground">S{seat}</span> : null}</span>
        <span className={`tabular-nums ${voided ? 'line-through' : 'font-bold'}`}>{formatCurrency(value)}</span>
      </div>
      {modifiers.map((m, i) => <div key={i} className="pl-9 text-xs text-muted-foreground">+ {m.name}{m.price > 0 ? ` (${formatCurrency(m.price)})` : ''}</div>)}
      {note && <div className="pl-9 text-xs italic text-amber-600">“{note}”</div>}
      {voided && <div className="pl-9 text-[11px] font-bold uppercase text-rose-600">Void · {voided}</div>}
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
        const chip = kot ? KDS_CHIP[kot.kds_status] : null;
        return (
          <section key={kotId || 'none'} className="rounded-2xl border border-border/70 bg-background/60">
            <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{kot ? `KOT ${kot.kot_no}` : 'Items'}</span>
              {kot?.station_name && <span className="text-[11px] font-semibold text-muted-foreground">· {kot.station_name}</span>}
              <span className="flex-1" />
              {kot?.print_error && <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600" title={kot.print_error}><TriangleAlert className="h-3 w-3" />Not printed</span>}
              {chip && <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${chip.className}`}>{chip.label}</span>}
              {kot && <button type="button" title="Reprint ticket" onClick={() => onReprint(kot.kot_id)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Printer className="h-3.5 w-3.5" /></button>}
            </header>
            <div className="px-3 py-1">
              {shown.filter(l => (l.kot_id ?? '') === kotId).map(l => (
                <LineRow key={l.line_id} name={l.name} quantity={l.quantity} unitPrice={l.unit_price} modifiers={lineModifiers(l)}
                  note={l.note} seat={l.seat} voided={l.status === 'VOIDED' ? l.void_reason : null} />
              ))}
            </div>
          </section>
        );
      })}
      {drafts.length > 0 && (
        <section className="rounded-2xl border-2 border-dashed border-primary/60 bg-primary/[0.04]">
          <header className="border-b border-primary/20 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-primary">New items · not sent yet</header>
          <div className="px-3 py-1">
            {drafts.map(d => (
              <div key={d.key} className="flex items-start gap-2">
                <div className="min-w-0 flex-1"><LineRow name={d.name} quantity={d.quantity} unitPrice={d.unit_price} modifiers={d.modifiers} note={d.note} seat={d.seat} /></div>
                <div className="mt-1 flex items-center gap-1">
                  <button type="button" title="One less" className="rounded-lg border border-border p-1" onClick={() => onDraftQty(d.key, -1)}><Minus className="h-3.5 w-3.5" /></button>
                  <button type="button" title="One more" className="rounded-lg border border-border p-1" onClick={() => onDraftQty(d.key, 1)}><Plus className="h-3.5 w-3.5" /></button>
                  <button type="button" title="Remove" className="rounded-lg p-1 text-rose-600 hover:bg-rose-500/10" onClick={() => onDraftRemove(d.key)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {kotIds.length === 0 && drafts.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">Tap items on the menu to start the order.</div>
      )}
    </div>
  );
}
