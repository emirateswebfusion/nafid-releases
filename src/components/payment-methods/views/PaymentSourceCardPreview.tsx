import { ShieldCheck, Star, Lightbulb } from 'lucide-react';
import clsx from 'clsx';
import { TYPE_CONFIG } from '../paymentMethodsTypes';
import { formatCurrency } from '../../../utils/pricing/money';

export interface PaymentSourceCardPreviewProps {
  form: { name: string; type: "BANK" | "CARD" | "UPI"; bank_name: string; account_number: string; holder_name: string; upi_id: string; opening_balance: string; is_default: boolean; is_enabled: boolean; sort_order: number; };
}

/** Live card preview of the payment method being added or edited, with the tip box. */
export function PaymentSourceCardPreview({
  form,
}: PaymentSourceCardPreviewProps) {
  return (
    <div className="lg:col-span-5 space-y-4 select-none sticky top-6">
      <div className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
        <span className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          Live Wallet Card Preview
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/70">EMV 3D SECURE</span>
      </div>

      {/* Metallic Card Frame */}
      <div className={clsx(
        'relative rounded-3xl p-6 text-white shadow-2xl bg-gradient-to-br transition-all duration-500 min-h-[230px] flex flex-col justify-between border border-white/25 overflow-hidden group hover:scale-[1.02]',
        TYPE_CONFIG[form.type].gradient
      )}>
        {/* Card sheen & reflection overlays */}
        <div className="absolute top-0 right-0 left-0 bottom-0 bg-gradient-to-tr from-white/10 via-transparent to-black/30 pointer-events-none" />
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-black/30 rounded-full blur-3xl pointer-events-none" />

        {/* Card Top Row: Type & Default Badge */}
        <div className="flex items-start justify-between relative z-10">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/70 block">
              {TYPE_CONFIG[form.type].label}
            </span>
            <h4 className="text-base font-black tracking-tight mt-0.5 truncate max-w-[200px] text-white">
              {form.name || 'Channel Display Name'}
            </h4>
          </div>

          <div className="flex items-center gap-2">
            {form.is_default && (
              <span className="bg-amber-400/25 text-amber-200 border border-amber-300/40 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                <Star className="w-3 h-3 fill-amber-300 text-amber-300" /> Default
              </span>
            )}
          </div>
        </div>

        {/* Card Middle Row: EMV Chip & Contactless Symbol */}
        <div className="my-3 flex items-center justify-between relative z-10">
          <div className="w-10 h-7 rounded-md bg-gradient-to-br from-amber-200 via-amber-300 to-amber-500 border border-amber-100/60 shadow-inner flex items-center justify-center">
            <div className="w-8 h-5 border border-amber-600/40 rounded-sm grid grid-cols-2 gap-0.5 p-0.5">
              <div className="border-r border-b border-amber-600/40" />
              <div className="border-b border-amber-600/40" />
              <div className="border-r border-amber-600/40" />
              <div className="border-amber-600/40" />
            </div>
          </div>
          {/* Contactless waves icon */}
          <div className="flex items-center gap-0.5 opacity-60">
            <span className="w-1 h-3 rounded-full border-r-2 border-white" />
            <span className="w-1 h-4 rounded-full border-r-2 border-white" />
            <span className="w-1 h-5 rounded-full border-r-2 border-white" />
          </div>
        </div>

        {/* Card Identifier Line */}
        <div className="mb-2 relative z-10">
          <span className="text-[9px] uppercase font-extrabold tracking-widest text-white/60 block">Identifier</span>
          <div className="font-mono text-base font-bold tracking-wider text-white truncate mt-0.5">
            {form.type === 'UPI' && (form.upi_id || 'handle@upi')}
            {form.type === 'CARD' && (form.account_number ? `•••• •••• •••• ${form.account_number}` : '•••• •••• •••• 0000')}
            {form.type === 'BANK' && (form.account_number ? `A/C: ${form.account_number}` : 'A/C: ••••••••••••')}
          </div>
          {form.bank_name && (
            <div className="text-xs font-semibold text-white/90 mt-0.5">{form.bank_name}</div>
          )}
        </div>

        {/* Card Bottom Row: Balance & Holder */}
        <div className="flex items-end justify-between relative z-10 pt-3 border-t border-white/20">
          <div>
            <span className="text-[9px] uppercase font-extrabold tracking-widest text-white/60 block">Opening Balance</span>
            <div className="font-mono text-base font-black tracking-tight text-white mt-0.5">
              {formatCurrency(parseFloat(form.opening_balance) || 0)}
            </div>
          </div>
          {form.holder_name ? (
            <div className="text-right">
              <span className="text-[9px] uppercase font-extrabold tracking-widest text-white/60 block">Holder</span>
              <div className="text-xs font-extrabold text-white truncate max-w-[130px] mt-0.5">{form.holder_name}</div>
            </div>
          ) : (
            <div className="text-right">
              <span className="text-[9px] uppercase font-extrabold tracking-widest text-white/40 block">Status</span>
              <span className="text-xs font-bold text-emerald-300">Ready to Link</span>
            </div>
          )}
        </div>
      </div>

      {/* Helpful Tip Box */}
      <div className="p-4 rounded-2xl bg-card/60 border border-border/60 text-xs text-muted-foreground space-y-1.5 backdrop-blur-md">
        <div className="font-bold text-foreground flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-primary" />
          <span>Quick Tip</span>
        </div>
        <p>Linking bank accounts and UPI IDs accurately helps generate automated settlement reports and clear customer receipts.</p>
      </div>
    </div>
  );
}
