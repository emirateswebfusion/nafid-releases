/** Payment method badge of the cashier screens (Cashier's own label / colour set; it has no SPLIT label). */
import { PAYMENT_COLORS, PAYMENT_LABELS } from '../cashierFormat';
import clsx from 'clsx';

export function PaymentBadge({ method }: { method: string }) {
  const c = PAYMENT_COLORS[method] || { bg: 'bg-muted', text: 'text-muted-foreground', dot: '#888' };
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider', c.bg, c.text)}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
      {PAYMENT_LABELS[method] || method}
    </span>
  );
}
