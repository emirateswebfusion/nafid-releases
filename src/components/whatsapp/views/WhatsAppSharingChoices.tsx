import clsx from 'clsx';
import { Check, FileText, MessageSquareText, ReceiptText, Users } from 'lucide-react';
import type { WhatsAppSharingChoicesState } from '../hooks/useWhatsAppSharingChoices';

const FORMATS = [
  { id: 'text', label: 'Text message', hint: 'Itemised bill as a chat message', icon: MessageSquareText },
  { id: 'a4', label: 'A4 PDF', hint: 'Full tax invoice document', icon: FileText },
  { id: 'thermal', label: 'Thermal receipt PDF', hint: 'Same layout as the printed receipt', icon: ReceiptText },
] as const;

/** Selectable card; the checkbox's accessible name is just `label`. */
function ChoiceCard({ label, hint, icon: Icon, checked, disabled, onChange }: {
  label: string; hint?: string; icon?: typeof FileText; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void;
}) {
  return (
    <label className={clsx('relative flex items-center gap-3 p-3 rounded-xl border-2 transition-all select-none',
      disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      checked ? 'border-primary bg-primary/5' : 'border-border/80 bg-card hover:border-primary/35')}>
      <input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
      {Icon && (
        <span className={clsx('p-2 rounded-lg shrink-0', checked ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
          <Icon className="w-4 h-4" />
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="text-xs font-bold text-foreground block truncate">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground block truncate">{hint}</span>}
      </span>
      <span className={clsx('w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20',
        checked ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30')}>
        {checked && <Check className="w-3 h-3" />}
      </span>
    </label>
  );
}

/** Load / save failure for the bill formats and recipient types. */
export function SharingSaveError({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs font-semibold text-destructive">
      Could not save: {error}
    </p>
  ) : null;
}

/** Which bill formats the customer receives on WhatsApp. */
export function BillFormatPicker({ sharing }: { sharing: WhatsAppSharingChoicesState }) {
  const { formats, busy, toggleFormat } = sharing;
  return (
    <fieldset disabled={busy} className="space-y-2.5 min-w-0">
      <legend className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80 mb-2.5">Send the bill as</legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {FORMATS.map(f => {
          const checked = formats.includes(f.id);
          return <ChoiceCard key={f.id} label={f.label} hint={f.hint} icon={f.icon} checked={checked} disabled={busy}
            onChange={on => toggleFormat(f.id, on)} />;
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">Choose at least one. Applies to active bills, checkout and saved sales bills.</p>
    </fieldset>
  );
}

/** Which party types receive ledger transaction alerts. */
export function LedgerRecipientPicker({ sharing, disabled }: { sharing: WhatsAppSharingChoicesState; disabled?: boolean }) {
  const { types, selected, busy, toggleAllTypes, toggleType } = sharing;
  const locked = busy || disabled;
  return (
    <fieldset disabled={locked} className="space-y-2.5 min-w-0">
      <legend className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80 mb-2.5 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" /> Who receives alerts
      </legend>
      <ChoiceCard label="All types, including newly added types" hint="New party types are included automatically"
        checked={selected === null} disabled={locked} onChange={toggleAllTypes} />
      {types.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {types.map(type => {
            const on = selected === null || selected.includes(type);
            return (
              <label key={type} className={clsx('relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all select-none',
                locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                on ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-background border-border text-muted-foreground hover:text-foreground')}>
                <input type="checkbox" aria-label={type} checked={on} disabled={locked} onChange={e => toggleType(type, e.target.checked)} className="sr-only" />
                {on && <Check className="w-3 h-3" />}
                {type}
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">No party types yet. Add parties to choose types here.</p>
      )}
    </fieldset>
  );
}
